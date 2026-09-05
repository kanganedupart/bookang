import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const htmlPath = new URL("../bookang.html", import.meta.url);
const html = await readFile(htmlPath, "utf8");
const FAKE_STATE_KEY = "__bookflow_isolated_firebase_state__";

function fnvId(prefix, value) {
  let hash = 2166136261;
  for (const char of String(value)) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return prefix + (hash >>> 0).toString(36);
}

function seedState() {
  const periodId = "P2026T3";
  return {
    currentPeriodId: periodId,
    periods: {
      [periodId]: {
        id: periodId,
        year: "2027",
        name: "정규 3학기",
        status: "ACTIVE",
        bookStartDate: "2026-09-04",
        refundEffectiveStartDate: "2026-09-04",
      },
    },
    staffProfiles: {
      [fnvId("U", "검수자")]: { id: fnvId("U", "검수자"), name: "검수자", role: "admin", active: true },
    },
    books: {
      BHELD: { id: "BHELD", name: "보유 검수교재", subject: "국어", teacher: "공통", price: 22000, stock: 10, active: true, periodIds: { [periodId]: periodId } },
      BRETURN: { id: "BRETURN", name: "회수 검수교재", subject: "국어", teacher: "공통", price: 18000, stock: 7, active: true, periodIds: { [periodId]: periodId } },
      BNEWHELD: { id: "BNEWHELD", name: "대기중 추가보유 교재", subject: "국어", teacher: "공통", price: 11000, stock: 5, active: true, periodIds: { [periodId]: periodId } },
      BMISSING: { id: "BMISSING", name: "미배부 검수교재", subject: "국어", teacher: "공통", price: 14000, stock: 10, active: true, periodIds: { [periodId]: periodId } },
      BEXCLUDED: { id: "BEXCLUDED", name: "환불제외 검수교재", subject: "국어", teacher: "공통", price: 9000, stock: 10, active: true, periodIds: { [periodId]: periodId } },
    },
    classes: {
      C1: { id: "C1", name: "정규 검수반", subject: "국어", teacher: "검수강사", active: true, periodId, books: { BMISSING: "BMISSING" } },
    },
    students: {
      SACTIVE: { id: "SACTIVE", name: "재원검수", active: true, admissionDate: "2026-09-04", periodMembership: { [periodId]: true }, periodClasses: { [periodId]: { C1: "C1" } }, classes: { C1: "C1" }, holdings: {} },
      SEXIT: { id: "SEXIT", name: "퇴반검수", active: false, admissionDate: "2026-09-01", periodMembership: { [periodId]: false }, periodClasses: { [periodId]: {} }, classes: {}, holdings: { BHELD: 1, BRETURN: 1, BNEWHELD: 1, BMISSING: 0 }, withdrawals: {} },
    },
    refundTasks: {
      RTASK_EXACT: {
        id: "RTASK_EXACT",
        periodId,
        studentId: "SEXIT",
        studentName: "퇴반검수",
        status: "PENDING",
        source: "MANUAL",
        exitDate: "2026-09-05",
        createdAt: "2026-09-05T09:00:00+09:00",
        createdBy: "검수자",
        beforeClassNames: ["정규 검수반"],
        books: {
          BMISSING: { bookId: "BMISSING", bookName: "미배부 검수교재", quantity: 1, status: "PENDING", source: "UNDISTRIBUTED" },
          BEXCLUDED: { bookId: "BEXCLUDED", bookName: "환불제외 검수교재", quantity: 1, status: "PENDING", source: "UNDISTRIBUTED" },
        },
        returnDecisions: {
          BHELD: { bookId: "BHELD", bookName: "보유 검수교재", quantity: 1, decision: "UNDECIDED" },
          BRETURN: { bookId: "BRETURN", bookName: "회수 검수교재", quantity: 1, decision: "UNDECIDED" },
        },
      },
      RTASK_ORPHAN: {
        id: "RTASK_ORPHAN",
        periodId,
        studentId: "S_REMOVED_AFTER_EXIT",
        studentName: "기록검수",
        status: "DONE",
        source: "MANUAL",
        exitDate: "2026-09-05",
        completedAt: "2026-09-05T10:00:00+09:00",
        completedBy: "검수자",
        totalAmount: 14000,
        books: {
          BMISSING: { bookId: "BMISSING", bookName: "미배부 검수교재", quantity: 1, unitPrice: 14000, refundAmount: 14000, status: "DONE", source: "UNDISTRIBUTED" },
        },
        returnDecisions: {},
      },
    },
    movements: {
      MDIST_RETURN: { id: "MDIST_RETURN", periodId, type: "DISTRIBUTE", bookId: "BRETURN", studentId: "SEXIT", studentDeltas: { SEXIT: 1 }, periodStudentDeltas: { [periodId]: { SEXIT: 1 } }, quantity: 1, stockBefore: 8, stockAfter: 7, time: "2026-09-04T09:00:00+09:00" },
    }, processedOperations: {}, chargeTasks: {}, refundHistory: {}, refundTaskEvents: {}, ecodingEvents: {},
  };
}

function installFakeFirebase({ seed, stateKey }) {
  const hadState = !!localStorage.getItem(stateKey);
  if (!hadState) {
    localStorage.removeItem("bookflowStaffName");
    localStorage.removeItem("bookflowStaffRole");
    localStorage.setItem(stateKey, JSON.stringify(seed));
  }
  const clone = (value) => structuredClone(value);
  const read = () => JSON.parse(localStorage.getItem(stateKey));
  const snapshot = (value) => ({ val: () => clone(value) });
  const listeners = new Set();
  const root = {
    on(event, success) {
      if (event !== "value") throw new Error(`unexpected fake Firebase event: ${event}`);
      listeners.add(success);
      setTimeout(() => success(snapshot(read())), 0);
    },
    off(event, success) {
      if (!success) listeners.clear();
      else listeners.delete(success);
    },
    once(event) {
      if (event !== "value") throw new Error(`unexpected fake Firebase once: ${event}`);
      return Promise.resolve(snapshot(read()));
    },
    async transaction(update) {
      const current = read();
      const result = update(clone(current));
      if (result === undefined) return { committed: false, snapshot: snapshot(current) };
      localStorage.setItem(stateKey, JSON.stringify(result));
      for (const listener of listeners) queueMicrotask(() => listener(snapshot(result)));
      return { committed: true, snapshot: snapshot(result) };
    },
  };
  const authListeners = new Set();
  const authObject = {
    currentUser: hadState && localStorage.getItem("bookflowStaffName") ? { uid: "isolated-audit-user" } : null,
    setPersistence: async () => {},
    onAuthStateChanged(callback) { authListeners.add(callback); setTimeout(() => callback(this.currentUser), 0); return () => authListeners.delete(callback); },
    signInWithEmailAndPassword: async () => {
      this.currentUser = { uid: "isolated-audit-user" };
      for (const callback of authListeners) setTimeout(() => callback(this.currentUser), 0);
      return { user: this.currentUser };
    },
    signOut: async () => { this.currentUser = null; },
  };
  const auth = () => authObject;
  auth.Auth = { Persistence: { LOCAL: "LOCAL" } };
  globalThis.firebase = {
    initializeApp: () => ({}),
    auth,
    database: () => ({ ref: () => root }),
  };
}

const server = createServer((request, response) => {
  if (request.url === "/" || request.url.startsWith("/bookang.html")) {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(html);
    return;
  }
  response.writeHead(404);
  response.end("not found");
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const { port } = server.address();

const browser = await chromium.launch({ headless: true, executablePath: "C:/Program Files/Google/Chrome/Application/chrome.exe" });
const results = [];
const productionFirebaseRequests = [];
try {
  for (const viewport of [{ name: "pc", width: 1365, height: 900 }, { name: "mobile", width: 390, height: 844 }]) {
    const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height } });
    context.on("request", (request) => {
      if (/refund-book-default-rtdb|firebasedatabase\.app/i.test(request.url())) productionFirebaseRequests.push(request.url());
    });
    await context.route(/gstatic\.com\/firebasejs\//, (route) => route.fulfill({ status: 200, contentType: "application/javascript", body: "" }));
    await context.route(/cdn\.jsdelivr\.net/, (route) => route.abort());
    await context.route("https://asia-northeast3-refund-book.cloudfunctions.net/bookflowStaffLogin", (route) => route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ firebaseEmail: "isolated@example.invalid", firebasePassword: "isolated", role: "admin" }) }));
    await context.addInitScript(installFakeFirebase, { seed: seedState(), stateKey: FAKE_STATE_KEY });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${port}/bookang.html?dataset=isolated`, { waitUntil: "domcontentloaded" });
    await page.locator("#staffName").fill("검수자");
    await page.locator("#staffPin").fill("0000");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.locator('[data-main-tab="학생"]').waitFor({ timeout: 15000 });
    assert.equal(await page.locator("#actor").getByText("검수자").count(), 1, `${viewport.name}: fake login failed`);

    await page.locator('[data-main-tab="학생"]').click();
    await page.locator("#studentStatusSearch").fill("재원검수");
    const activeCandidate = page.locator("#studentStatusAutoResults button", { hasText: "재원검수" });
    await activeCandidate.waitFor();
    await activeCandidate.click();
    await page.getByRole("heading", { name: /재원검수/ }).waitFor();
    assert.match(await page.locator("#studentStatusDetail").innerText(), /전체 교재비/);
    assert.equal(await page.locator("#studentStatusDetail .student-book-toolbar").count(), 1, `${viewport.name}: active student book table missing`);
    await page.getByRole("button", { name: "퇴반 등록", exact: true }).click();
    await page.locator(".app-dialog .confirm-button").click();
    assert.match(await page.locator("#withdrawalDialogError").innerText(), /퇴반 사유를 입력하세요/, `${viewport.name}: empty reason was not blocked`);
    await page.locator("#withdrawalReasonInput").fill("사유 입력 검수");
    assert.equal(await page.locator("#withdrawalReasonInput").inputValue(), "사유 입력 검수", `${viewport.name}: withdrawal reason typing failed`);
    await page.locator(".app-dialog .confirm-button").click();
    await page.getByText(/모든 반에서 제외할까요/).waitFor();
    await page.locator(".app-dialog .confirm-button").click();
    await page.getByText(/퇴반대기에 등록했습니다/).waitFor();
    await page.locator(".app-dialog .confirm-button").click();
    const activeAfterWithdrawal = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).students.SACTIVE, FAKE_STATE_KEY);
    assert.equal(Object.values(activeAfterWithdrawal.withdrawals)[0].reason, "사유 입력 검수", `${viewport.name}: withdrawal reason was not persisted`);

    await page.locator('[data-main-tab="퇴반대기"]').click();
    await page.getByRole("heading", { name: /퇴반대기/ }).waitFor();
    assert.match(await page.locator("#screen").innerText(), /퇴반검수/);
    const exactTaskRow = page.locator("#refundRows tr", { hasText: "퇴반검수" });
    assert.equal(await exactTaskRow.getByRole("button", { name: "상세 확인", exact: true }).count(), 1, `${viewport.name}: exact task detail button mismatch`);
    await exactTaskRow.getByRole("button", { name: "상세 확인", exact: true }).click();
    await page.getByRole("heading", { name: "퇴반대기 교재 확인", exact: true }).waitFor();
    assert.equal(await page.locator("#studentStatusDetail").getByText(/전체 교재비/).count(), 0, `${viewport.name}: duplicate amount summary visible in withdrawal detail`);
    assert.equal(await page.locator("#studentStatusDetail .student-book-toolbar").count(), 0, `${viewport.name}: general book table visible in withdrawal detail`);
    assert.match(await page.locator(".exit-review-card").innerText(), /미배부 검수교재/);
    assert.equal(await page.locator(".exit-review-card tbody tr").count(), 5, `${viewport.name}: settlement table is not one-row-per-book`);
    assert.equal(await page.getByText(/이코딩 반영 대기|이코딩에는 아직 재원/).count(), 0, `${viewport.name}: internal ecoding badge is still visible`);
    assert.equal(await page.getByRole("heading", { name: /보유 교재|미배부 교재/ }).count(), 0, `${viewport.name}: split withdrawal sections still visible`);
    assert.equal(await page.getByRole("button", { name: "보유 유지", exact: true }).count(), 0, `${viewport.name}: per-book retain button should not exist`);
    assert.equal(await page.getByRole("button", { name: "회수", exact: true }).count(), 3, `${viewport.name}: current held-set return buttons missing`);
    assert.match(await page.locator(".exit-review-card").innerText(), /배부\s+회수\s+환불 제외/);
    await page.locator(".exit-review-card tr", { hasText: "회수 검수교재" }).getByRole("button", { name: "회수", exact: true }).click();
    await page.locator(".app-dialog .confirm-button").click();
    await page.getByText("회수완료", { exact: true }).waitFor();
    const stateAfterReturn = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), FAKE_STATE_KEY);
    assert.equal(stateAfterReturn.students.SEXIT.pendingReturn, true, `${viewport.name}: distribution lock released before withdrawal completion`);

    await page.locator(".exit-review-card tr", { hasText: "환불제외 검수교재" }).getByRole("button", { name: "미배부 삭제", exact: true }).click();
    await page.locator("#appDialogInput").fill("격리 검수 제외");
    await page.locator(".app-dialog .confirm-button").click();
    await page.locator(".exit-review-card tr", { hasText: "환불제외 검수교재" }).getByText("환불 제외", { exact: true }).waitFor();
    const taskAfterDecision = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).refundTasks.RTASK_EXACT, FAKE_STATE_KEY);
    assert.equal(taskAfterDecision.books.BEXCLUDED.status, "EXCLUDED", `${viewport.name}: refund exclusion not persisted`);
    await page.getByRole("button", { name: "퇴반완료", exact: true }).waitFor();

    await page.getByRole("button", { name: "퇴반완료", exact: true }).click();
    await page.getByRole("heading", { name: /퇴반완료 확인/ }).waitFor();
    assert.match(await page.locator(".app-dialog").innerText(), /최종 환불 2종 · 32,000원/);
    assert.match(await page.locator(".app-dialog").innerText(), /미배부 1종 \+ 회수완료 1종/);
    assert.match(await page.locator(".app-dialog").innerText(), /환불 제외 3종/);
    await page.locator(".app-dialog .confirm-button").click();
    await page.getByText(/퇴반완료했습니다/).waitFor();
    await page.locator(".app-dialog .confirm-button").click();
    await page.getByRole("heading", { name: "퇴반완료 내역", exact: true }).waitFor();

    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('[data-main-tab="퇴반대기"]').waitFor();
    await page.locator('[data-main-tab="퇴반대기"]').click();
    const statusSelect = page.locator('select[onchange="refundStatus=this.value;refundTaskScreen()"]');
    await statusSelect.selectOption("DONE");
    await page.locator("#refundRows", { hasText: "퇴반검수" }).waitFor();
    assert.match(await page.locator("#refundRows").innerText(), /퇴반완료/);
    await page.locator('[data-main-tab="학생"]').click();
    await page.locator("#studentStatusSearch").fill("퇴반검수");
    const completedCandidate = page.locator("#studentStatusAutoResults button", { hasText: "퇴반검수" });
    await completedCandidate.waitFor();
    assert.match(await completedCandidate.innerText(), /퇴반완료/, `${viewport.name}: completed student missing from search`);
    await completedCandidate.click();
    await page.getByRole("heading", { name: /퇴반검수/ }).waitFor();
    assert.match(await page.locator("#studentStatusDetail").innerText(), /퇴반완료 내역/);
    await page.locator("#studentStatusSearch").fill("기록검수");
    const archiveCandidate = page.locator("#studentStatusAutoResults button", { hasText: "기록검수" });
    await archiveCandidate.waitFor();
    assert.match(await archiveCandidate.innerText(), /퇴반완료/, `${viewport.name}: orphan completed record missing from search`);
    await archiveCandidate.click();
    await page.getByRole("heading", { name: /기록검수/ }).waitFor();
    assert.match(await page.locator("#studentStatusDetail").innerText(), /보존된 퇴반 기록으로 조회했습니다/);
    assert.match(await page.locator("#studentStatusDetail").innerText(), /14,000원/);
    const persisted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), FAKE_STATE_KEY);
    assert.equal(persisted.refundTasks.RTASK_EXACT.status, "DONE", `${viewport.name}: completion lost after reload`);
    assert.equal(persisted.refundTasks.RTASK_EXACT.totalAmount, 32000, `${viewport.name}: refund amount mismatch`);
    assert.equal(persisted.refundTasks.RTASK_EXACT.refundRuleVersion, 2, `${viewport.name}: refund rule version missing`);
    const completedRefundHistory = Object.values(persisted.refundHistory).find((item) => item.taskId === "RTASK_EXACT");
    assert.deepEqual(completedRefundHistory.bookAmounts.map((item) => [item.bookId, item.source, item.amount]).sort(), [["BMISSING", "MISSING", 14000], ["BRETURN", "RETURNED", 18000]], `${viewport.name}: final refund exact-set mismatch`);
    assert.equal(persisted.students.SEXIT.retainedBooksOnExit, true, `${viewport.name}: retained flag mismatch`);
    assert.equal(persisted.refundTasks.RTASK_EXACT.returnDecisions.BHELD.decision, "RETAINED", `${viewport.name}: default retained decision missing`);
    assert.equal(persisted.refundTasks.RTASK_EXACT.returnDecisions.BNEWHELD.decision, "RETAINED", `${viewport.name}: newly held book was not retained on completion`);
    assert.equal(persisted.refundTasks.RTASK_EXACT.returnDecisions.BRETURN.decision, "RETURNED", `${viewport.name}: selected return decision missing`);
    assert.equal(persisted.students.SEXIT.holdings.BRETURN, 0, `${viewport.name}: returned holding not cleared`);
    assert.equal(persisted.books.BRETURN.stock, 8, `${viewport.name}: returned stock mismatch`);
    assert.equal(Object.values(persisted.movements).filter((movement) => movement.bookId === "BRETURN" && movement.type === "RETURN").length, 1, `${viewport.name}: return ledger exact-once failed`);
    await page.getByRole("button", { name: "신규생 등록", exact: true }).click();
    assert.equal(await page.locator("#screen").getByText(/퇴반검수|재원검수/).count(), 0, `${viewport.name}: withdrawn student remained in new-student queue`);
    assert.equal(errors.length, 0, `${viewport.name}: page errors: ${errors.join(" | ")}`);
    results.push({ viewport: viewport.name, login: "PASS", search: "PASS", withdrawalReasonInput: "PASS", emptyReasonBlocked: "PASS", reasonPersistence: "PASS", completedStudentSearch: "PASS", orphanCompletedRecordSearch: "PASS", exactTaskDetail: "PASS", selectiveReturn: "PASS", defaultRetain: "PASS", refundDecision: "MISSING_1_RETURNED_1_EXCLUDED_3", completion: "DONE", reloadPersistence: "PASS", refundAmount: persisted.refundTasks.RTASK_EXACT.totalAmount });
    await context.close();
  }
  assert.deepEqual(productionFirebaseRequests, [], "production Firebase database was contacted");
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
}

console.log(JSON.stringify({ isolated: true, productionFirebaseRequests: productionFirebaseRequests.length, results }, null, 2));
