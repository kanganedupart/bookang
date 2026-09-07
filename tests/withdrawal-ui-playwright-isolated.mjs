import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright";

const htmlPath = new URL("../bookang.html", import.meta.url);
const html = await readFile(htmlPath, "utf8");
const currentBuild = html.match(/bookflow-build" content="([^"]+)/)?.[1];
assert.ok(currentBuild, "bookflow build metadata missing");
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
      BAVAILABLE: { id: "BAVAILABLE", name: "신규 배부가능 교재", subject: "영어", teacher: "검수강사", price: 12000, stock: 1, active: true, periodIds: { [periodId]: periodId } },
      BZERO: { id: "BZERO", name: "신규 재고부족 교재", subject: "영어", teacher: "검수강사", price: 13000, stock: 0, active: true, periodIds: { [periodId]: periodId } },
      BNEWINACTIVE: { id: "BNEWINACTIVE", name: "신규 비활성 제외 교재", subject: "영어", teacher: "검수강사", price: 13000, stock: 9, active: false, periodIds: { [periodId]: periodId } },
      BNEWUNPRICED: { id: "BNEWUNPRICED", name: "신규 가격미입력 제외 교재", subject: "영어", teacher: "검수강사", stock: 9, active: true, periodIds: { [periodId]: periodId } },
      BNEWCLOSED: { id: "BNEWCLOSED", name: "신규 배부종료 제외 교재", subject: "영어", teacher: "검수강사", price: 13000, stock: 9, active: true, distributionStatus: "CLOSED", periodIds: { [periodId]: periodId } },
      BNEWEXCLUDED: { id: "BNEWEXCLUDED", name: "신규 학생별 제외 교재", subject: "영어", teacher: "검수강사", price: 13000, stock: 9, active: true, periodIds: { [periodId]: periodId } },
      BBUNDLEGOOD: { id: "BBUNDLEGOOD", name: "묶음 충분 교재", subject: "수학", teacher: "검수강사", price: 15000, stock: 2, active: true, periodIds: { [periodId]: periodId } },
      BBUNDLESHORT: { id: "BBUNDLESHORT", name: "묶음 부족 교재", subject: "수학", teacher: "검수강사", price: 16000, stock: 1, active: true, periodIds: { [periodId]: periodId } },
    },
    classes: {
      C1: { id: "C1", name: "정규 검수반", subject: "국어", teacher: "검수강사", active: true, periodId, books: { BMISSING: "BMISSING" } },
      CNEW: { id: "CNEW", name: "신규 검수반", subject: "영어", teacher: "검수강사", active: true, periodId, books: { BAVAILABLE: "BAVAILABLE", BZERO: "BZERO", BNEWINACTIVE: "BNEWINACTIVE", BNEWUNPRICED: "BNEWUNPRICED", BNEWCLOSED: "BNEWCLOSED", BNEWEXCLUDED: "BNEWEXCLUDED" } },
      CBUNDLE: { id: "CBUNDLE", name: "묶음 검수반", subject: "수학", teacher: "검수강사", active: true, periodId, books: { BBUNDLEGOOD: "BBUNDLEGOOD", BBUNDLESHORT: "BBUNDLESHORT" } },
      CADD: { id: "CADD", name: "추가 검수반", subject: "수학", teacher: "검수강사", active: true, periodId, books: {} },
    },
    students: {
      SACTIVE: { id: "SACTIVE", name: "재원검수", active: true, admissionDate: "2026-09-04", periodMembership: { [periodId]: true }, periodClasses: { [periodId]: { C1: "C1" } }, classes: { C1: "C1" }, holdings: {} },
      SEXIT: { id: "SEXIT", name: "퇴반검수", active: false, admissionDate: "2026-09-01", periodMembership: { [periodId]: false }, periodClasses: { [periodId]: {} }, classes: {}, holdings: { BHELD: 1, BRETURN: 1, BNEWHELD: 1, BMISSING: 0 }, withdrawals: {} },
      SNEW: { id: "SNEW", name: "신규부분검수", active: true, onboarding: false, admissionDate: "2026-09-06", createdPeriodId: periodId, createdAt: "2026-09-06T08:00:00+09:00", createdBy: "등록검수자", periodMembership: { [periodId]: true }, periodClasses: { [periodId]: { CNEW: "CNEW" } }, classes: { CNEW: "CNEW" }, bookExclusions: { [periodId]: { BNEWEXCLUDED: { reason: "격리 검수" } } }, holdings: {} },
      SBUNDLE1: { id: "SBUNDLE1", name: "묶음검수일", active: true, admissionDate: "2026-09-06", createdPeriodId: periodId, periodMembership: { [periodId]: true }, periodClasses: { [periodId]: { CBUNDLE: "CBUNDLE" } }, classes: { CBUNDLE: "CBUNDLE" }, holdings: {} },
      SBUNDLE2: { id: "SBUNDLE2", name: "묶음검수이", active: true, admissionDate: "2026-09-06", createdPeriodId: periodId, periodMembership: { [periodId]: true }, periodClasses: { [periodId]: { CBUNDLE: "CBUNDLE" } }, classes: { CBUNDLE: "CBUNDLE" }, holdings: {} },
      SONBOARD: { id: "SONBOARD", name: "반배정전검수", active: true, onboarding: true, admissionDate: "2026-09-06", createdPeriodId: periodId, createdAt: "2026-09-06T08:10:00+09:00", periodClasses: { [periodId]: {} }, classes: {}, holdings: {} },
      SHM1: { id: "SHM1", name: "(반1)이현민7480", active: true, periodClasses: { [periodId]: {} }, classes: {}, holdings: {} },
      SHM2: { id: "SHM2", name: "(반2)이현민1234", active: true, periodClasses: { [periodId]: {} }, classes: {}, holdings: {} },
      SUT: { id: "SUT", name: "(반5)우태양7206", active: true, periodClasses: { [periodId]: {} }, classes: {}, holdings: {} },
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
        returnDecisions: {
          BHELD: { bookId: "BHELD", bookName: "보유 검수교재", quantity: 1, decision: "RETAINED" },
          BRETURN: { bookId: "BRETURN", bookName: "회수 검수교재", quantity: 1, decision: "RETURNED" },
        },
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
      globalThis.__bookflowFakeTransactionCount = Number(globalThis.__bookflowFakeTransactionCount || 0) + 1;
      const delayMs = Number(globalThis.__bookflowFakeTransactionDelayMs || 0);
      if (delayMs) await new Promise((resolve) => setTimeout(resolve, delayMs));
      globalThis.__bookflowFakeTransactionDelayMs = 0;
      if (globalThis.__bookflowFakeTransactionRejectOnce) {
        globalThis.__bookflowFakeTransactionRejectOnce = false;
        throw new Error("forced isolated transaction failure");
      }
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

let forcedStaleResponses = 0;
const server = createServer((request, response) => {
  if (request.url.startsWith("/version.json")) {
    response.writeHead(200, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ build: currentBuild }));
    return;
  }
  if (request.url === "/" || request.url.startsWith("/bookang.html")) {
    if (request.url.includes("stale-twice=1")) forcedStaleResponses = 2;
    const serveStale = forcedStaleResponses > 0;
    if (serveStale) forcedStaleResponses--;
    response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
    response.end(serveStale ? html.replaceAll(currentBuild, "2026-09-05.stale") : html);
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
    await context.route("https://asia-northeast3-refund-book.cloudfunctions.net/ecodingSync", (route) => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ ok:false, message:"isolated sync disabled" }) }));
    await context.addInitScript(installFakeFirebase, { seed: seedState(), stateKey: FAKE_STATE_KEY });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await page.goto(`http://127.0.0.1:${port}/bookang.html?stale-twice=1`, { waitUntil: "domcontentloaded" });
    await page.waitForURL(new RegExp(`bookang\\.html\\?v=${currentBuild.replaceAll(".", "\\.")}`));
    await page.locator("#bookflowUpdateBanner").waitFor();
    assert.equal(await page.locator('meta[name="bookflow-build"]').getAttribute("content"), "2026-09-05.stale", `${viewport.name}: deployment-skew scenario did not serve stale HTML twice`);
    await page.locator("#bookflowUpdateBanner a").click();
    await page.waitForFunction((build) => document.querySelector('meta[name="bookflow-build"]')?.content === build, currentBuild);
    assert.equal(await page.locator("#bookflowUpdateBanner").count(), 0, `${viewport.name}: update banner remained after current HTML loaded`);
    await page.goto(`http://127.0.0.1:${port}/bookang.html?dataset=isolated`, { waitUntil: "domcontentloaded" });
    await page.locator("#staffName").fill("검수자");
    await page.locator("#staffPin").fill("0000");
    await page.getByRole("button", { name: "로그인", exact: true }).click();
    await page.locator('[data-main-tab="학생"]').waitFor({ timeout: 15000 });
    assert.equal(await page.locator("#actor").getByText("검수자").count(), 1, `${viewport.name}: fake login failed`);
    const ecodingDateRules = await page.evaluate(() => {
      const pid = "P-RULE", st = {
        currentPeriodId: pid,
        periods: { [pid]: { id:pid, status:"ACTIVE", bookStartDate:"2026-09-04", refundEffectiveStartDate:"2026-09-04" } },
        classes: {
          COLD: { id:"COLD", periodId:pid, active:true, name:"이전반" },
          CNEW: { id:"CNEW", periodId:pid, active:true, name:"새반" },
        },
        students: { SRULE: { id:"SRULE", externalId:"ERULE", active:true, periodMembership:{ [pid]:true }, periodClasses:{ [pid]:{ COLD:"COLD" } } } },
        ecodingEvents: {},
      };
      const sameDate = desiredEcodingStudentTransition(st,pid,"ERULE",{CNEW:"CNEW"},"","2026-09-07T09:00:00+09:00","2026-09-07",{CNEW:"2026-09-07"},{COLD:"2026-09-07"});
      const differentDate = desiredEcodingStudentTransition(st,pid,"ERULE",{CNEW:"CNEW"},"","2026-09-07T09:00:00+09:00","2026-09-08",{CNEW:"2026-09-08"},{COLD:"2026-09-07"});
      const addOnly = desiredEcodingStudentTransition(st,pid,"ERULE",{COLD:"COLD",CNEW:"CNEW"},"","2026-09-07T09:00:00+09:00","2026-09-07",{CNEW:"2026-09-07"},{});
      const removeState = structuredClone(st); removeState.students.SRULE.periodClasses[pid] = { COLD:"COLD", CNEW:"CNEW" };
      const removeOnly = desiredEcodingStudentTransition(removeState,pid,"ERULE",{CNEW:"CNEW"},"","2026-09-07T09:00:00+09:00","2026-09-07",{},{COLD:"2026-09-07"});
      const newOnly = desiredEcodingStudentTransition({ ...st, students:{} },pid,"NEW-ID",{CNEW:"CNEW"},"2026-09-07","2026-09-07T09:00:00+09:00","2026-09-07",{CNEW:"2026-09-07"},{});
      const mappedOnly = normalizedEcodingStudent({ id:"ERULE", name:"날짜검수", classes:[{id:"EXT-USED",active:true,entryDate:"2026-09-07"},{id:"EXT-IGNORED",active:true,entryDate:"2026-09-07"}] }, {"EXT-USED":{localClassId:"CNEW"},"EXT-IGNORED":{localClassId:"NOT-IN-PROGRAM"}}, st, pid);
      const allEnded = normalizedEcodingStudent({ id:"ERULE", name:"날짜검수", classes:[{id:"EXT-OLD",active:false,entryDate:"2026-09-06",exitDate:"2026-09-07"}] }, {"EXT-OLD":{localClassId:"COLD"}}, st, pid);
      const dateCutoverWithPriorRoster = shouldInitializeEcodingDateBaseline({membershipSchemaVersion:"CLASS_DATES_V1",students:[{id:"ERULE"}]},{students:[{id:"ERULE"}]});
      const dateCutoverWithoutPriorRoster = shouldInitializeEcodingDateBaseline({membershipSchemaVersion:"CLASS_DATES_V1",students:[{id:"ERULE"}]},{students:[]});
      return { sameType:sameDate.type, sameDate:sameDate.moveBusinessDate, differentType:differentDate.type, waiting:differentDate.waitingForMoveDates, addType:addOnly.type, addDate:addOnly.moveBusinessDate, removeType:removeOnly.type, removeDate:removeOnly.moveBusinessDate, newType:newOnly.type, mappedIds:Object.keys(mappedOnly.classIds), endedIds:Object.keys(allEnded.classIds), exitDate:allEnded.exitDate, dateCutoverWithPriorRoster, dateCutoverWithoutPriorRoster };
    });
    assert.deepEqual(ecodingDateRules, { sameType:"MOVE", sameDate:"2026-09-07", differentType:"", waiting:true, addType:"MOVE", addDate:"2026-09-07", removeType:"MOVE", removeDate:"2026-09-07", newType:"NEW", mappedIds:["CNEW"], endedIds:[], exitDate:"2026-09-07", dateCutoverWithPriorRoster:false, dateCutoverWithoutPriorRoster:true }, `${viewport.name}: eCoding entry/exit-date mapping rules failed`);
    const studentNameSearchRules = await page.evaluate(() => ({
      suffixExact: matchingStudents("이현민7480", true).map((student) => student.id),
      duplicateBase: matchingStudents("이현민", true).map((student) => student.id).sort(),
      newlyRegisteredBase: matchingStudents("우태양", true).map((student) => student.id),
      newlyRegisteredFull: matchingStudents("(반5)우태양7206", true).map((student) => student.id),
    }));
    assert.deepEqual(studentNameSearchRules, { suffixExact:["SHM1"], duplicateBase:["SHM1","SHM2"], newlyRegisteredBase:["SUT"], newlyRegisteredFull:["SUT"] }, `${viewport.name}: duplicate-name suffix search failed`);
    await page.getByRole("button", { name: "신규생 등록", exact: true }).click();
    await page.locator("#newNames").evaluate((field) => { field.value = "신규직접입력검수"; });
    await page.evaluate(() => { globalThis.__bookflowFakeTransactionDelayMs = 300; });
    await page.getByRole("button", { name: "이름 저장", exact: true }).click();
    await page.getByRole("status").getByText("신규생 이름을 저장하고 있습니다.", { exact: true }).waitFor();
    await page.locator(".app-dialog", { hasText: "신규직접입력검수 이름 저장 완료" }).waitFor();
    await page.locator(".app-dialog .confirm-button").click();
    const directlySavedStudent = await page.evaluate((key) => Object.values(JSON.parse(localStorage.getItem(key)).students).find((student) => student.name === "신규직접입력검수"), FAKE_STATE_KEY);
    assert.equal(directlySavedStudent?.onboarding, true, `${viewport.name}: visible new-name field did not create an onboarding student`);
    await page.getByRole("button", { name: "학생 조회·처리", exact: true }).click();
    await page.locator("#studentStatusSearch").fill("직접입력");
    await page.locator("#studentStatusAutoResults").getByText("신규직접입력검수", { exact: false }).waitFor();
    await page.locator("#studentStatusSearch").fill("입력검수");
    await page.locator("#studentStatusAutoResults").getByText("신규직접입력검수", { exact: false }).waitFor();

    await page.locator('[data-main-tab="일괄처리"]').click();
    await page.getByRole("button", { name: "학생 묶음", exact: true }).click();
    await page.locator("#bundleNames").fill("묶음검수일\n묶음검수이");
    await page.getByRole("button", { name: "명단 확인", exact: true }).click();
    await page.getByRole("button", { name: /2명 2권 재고 있는 교재 배부 확정/ }).click();
    await page.locator(".app-dialog .confirm-button").click();
    const bundleDistribution = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), FAKE_STATE_KEY);
    assert.equal(bundleDistribution.students.SBUNDLE1.holdings.BBUNDLEGOOD, 1, `${viewport.name}: bundle sufficient book missing for first student`);
    assert.equal(bundleDistribution.students.SBUNDLE2.holdings.BBUNDLEGOOD, 1, `${viewport.name}: bundle sufficient book missing for second student`);
    assert.equal(Number(bundleDistribution.students.SBUNDLE1.holdings.BBUNDLESHORT || 0), 0, `${viewport.name}: shortage book partially allocated to first student`);
    assert.equal(Number(bundleDistribution.students.SBUNDLE2.holdings.BBUNDLESHORT || 0), 0, `${viewport.name}: shortage book partially allocated to second student`);
    assert.equal(bundleDistribution.books.BBUNDLESHORT.stock, 1, `${viewport.name}: shortage stock changed during bundle distribution`);
    await page.locator(".app-dialog .confirm-button").click();
    await page.locator('[data-main-tab="학생"]').click();

    await page.getByRole("button", { name: "신규생 등록", exact: true }).click();
    assert.equal(await page.getByRole("heading", { name: "신규생 등록", exact: true }).count(), 1, `${viewport.name}: registration panel missing`);
    await page.locator(".registration-table tbody tr", { hasText: "신규부분검수" }).click();
    assert.match(await page.locator("#screen").innerText(), /변경 후 1개 반/, `${viewport.name}: saved class verification missing`);
    assert.match(await page.locator(".registration-table tbody tr", { hasText: "신규부분검수" }).innerText(), /등록검수자[\s\S]*2026-09-06/, `${viewport.name}: registration writer/date missing`);
    assert.equal(await page.locator("#screen").getByText(/배부 0 · 미배부 2/).count(), 0, `${viewport.name}: book processing leaked into registration screen`);
    await page.locator('[data-main-tab="신규"]').click();
    assert.equal(await page.locator("tbody tr", { hasText: "반배정전검수" }).count(), 0, `${viewport.name}: unassigned name incorrectly entered new-work queue`);
    const newStudentRow = page.locator("tbody tr", { hasText: "신규부분검수" });
    assert.match(await newStudentRow.innerText(), /배부 0 · 미배부 2/, `${viewport.name}: new-work distribution summary mismatch`);
    assert.equal(await newStudentRow.getByRole("button", { name: "미완료", exact: true }).isDisabled(), true, `${viewport.name}: zero-distribution student could be completed`);
    await newStudentRow.click();
    assert.match(await page.locator("#screen").innerText(), /배정 반 1개[\s\S]*신규 검수반[\s\S]*신규 배부가능 교재/, `${viewport.name}: new-work preflight class/book review missing`);
    await page.getByRole("button", { name: "교재처리", exact: true }).click();
    assert.equal(await page.getByRole("heading", { name: "학생 교재현황", exact: true }).count(), 1, `${viewport.name}: common student book panel missing`);
    assert.equal(await page.getByRole("heading", { name: "처리 및 재고 흐름", exact: true }).count(), 1, `${viewport.name}: common stock flow panel missing`);
    await page.getByRole("button", { name: "전체 교재", exact: true }).click();
    const beforeCancelledDistribution = await page.evaluate((key) => localStorage.getItem(key), FAKE_STATE_KEY);
    await page.getByRole("button", { name: "전체 배부 확정", exact: true }).click();
    assert.match(await page.locator(".app-dialog").innerText(), /신규부분검수 학생의 1종 1권을 전체 배부합니다/, `${viewport.name}: student-all distribution confirmation missing`);
    await page.locator(".app-dialog").getByRole("button", { name: "취소", exact: true }).click();
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), FAKE_STATE_KEY), beforeCancelledDistribution, `${viewport.name}: cancelling distribution changed state or ledger`);
    await page.getByRole("button", { name: "전체 배부 확정", exact: true }).click();
    await page.locator(".app-dialog .confirm-button").click();
    await page.waitForFunction((key) => JSON.parse(localStorage.getItem(key)).students.SNEW.holdings.BAVAILABLE === 1, FAKE_STATE_KEY);
    const newStudentDistribution = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), FAKE_STATE_KEY);
    assert.equal(newStudentDistribution.students.SNEW.holdings.BAVAILABLE, 1, `${viewport.name}: available book was not distributed`);
    assert.equal(Number(newStudentDistribution.students.SNEW.holdings.BZERO || 0), 0, `${viewport.name}: zero-stock book was partially distributed`);
    assert.equal(newStudentDistribution.books.BAVAILABLE.stock, 0, `${viewport.name}: available stock mismatch`);
    assert.equal(newStudentDistribution.books.BZERO.stock, 0, `${viewport.name}: shortage stock changed`);
    for (const bid of ["BNEWINACTIVE", "BNEWUNPRICED", "BNEWCLOSED", "BNEWEXCLUDED"])
      assert.equal(Number(newStudentDistribution.students.SNEW.holdings[bid] || 0), 0, `${viewport.name}: ineligible book ${bid} was distributed`);
    await page.locator('[data-main-tab="신규"]').click();
    const completionRow = page.locator("tbody tr", { hasText: "신규부분검수" });
    const stockBeforeComplete = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).books, FAKE_STATE_KEY);
    await completionRow.getByRole("button", { name: "미완료", exact: true }).click();
    await page.locator(".app-dialog .confirm-button").click();
    await page.getByRole("button", { name: "완료 보기", exact: true }).click();
    await page.locator("tbody tr", { hasText: "신규부분검수" }).getByRole("button", { name: "완료", exact: true }).waitFor();
    const stateAfterComplete = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), FAKE_STATE_KEY);
    assert.deepEqual(stateAfterComplete.books, stockBeforeComplete, `${viewport.name}: completion changed inventory`);

    await page.locator('[data-main-tab="학생"]').click();
    await page.getByRole("button", { name: "신규생 등록", exact: true }).click();
    // Korean IME can leave the visible textarea value newer than the cached
    // oninput draft. Saving must read the visible field itself.
    await page.locator("#newNames").evaluate((field) => { field.value = "신규부분검수"; });
    await page.getByRole("button", { name: "이름 저장", exact: true }).click();
    await page.locator(".app-dialog .confirm-button").click();
    await page.getByLabel("① 과목").selectOption({ label: "수학" });
    await page.getByLabel("③ 반").selectOption("CADD");
    await page.getByRole("button", { name: "선택한 반 추가", exact: true }).click();
    await page.getByRole("button", { name: "반 추가 저장", exact: true }).click();
    await page.locator(".app-dialog .confirm-button").click();
    const stateAfterClassAdd = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), FAKE_STATE_KEY);
    assert.equal(stateAfterClassAdd.students.SNEW.periodClasses.P2026T3.CNEW, "CNEW", `${viewport.name}: existing class was removed during registration class add`);
    assert.equal(stateAfterClassAdd.students.SNEW.periodClasses.P2026T3.CADD, "CADD", `${viewport.name}: added class was not saved`);
    assert.ok(Object.values(stateAfterClassAdd.students.SNEW.classChanges || {}).some((change) => change.afterClassIds?.CADD === "CADD"), `${viewport.name}: class-add history missing`);
    assert.deepEqual(stateAfterClassAdd.books, stockBeforeComplete, `${viewport.name}: class add changed inventory`);
    await page.getByRole("button", { name: "학생 조회·처리", exact: true }).click();
    await page.locator("#studentStatusSearch").fill("신규부분검수");
    await page.locator("#studentStatusAutoResults button", { hasText: "신규부분검수" }).click();
    await page.getByRole("button", { name: "반 관리", exact: true }).click();
    const recentClassResult = page.locator(".recent-class-result");
    assert.match(await recentClassResult.innerText(), /최근 반변경[\s\S]*이전 반[\s\S]*신규 검수반[\s\S]*변경 후 반[\s\S]*추가 검수반/, `${viewport.name}: recent class result was not restored after navigation`);
    assert.match(await recentClassResult.innerText(), /다음 반변경 전까지 유지됩니다/, `${viewport.name}: recent class result retention is unclear`);
    assert.equal(await recentClassResult.locator("button").count(), 0, `${viewport.name}: recent class result exposes a repeat-action button`);
    await page.getByRole("button", { name: "교재 처리", exact: true }).click();
    assert.match(await page.locator("#screen").innerText(), /반이동 교재 1:1 확인/, `${viewport.name}: last class transition was not restored for delayed book processing`);
    assert.deepEqual(await page.evaluate(() => window.studentTransition?.beforeClassIds), ["CNEW"], `${viewport.name}: restored previous-class exact-set mismatch`);
    assert.deepEqual((await page.evaluate(() => window.studentTransition?.afterClassIds)).sort(), ["CADD", "CNEW"], `${viewport.name}: restored next-class exact-set mismatch`);
    await page.locator('[data-main-tab="신규"]').click();
    assert.equal(await page.locator("tbody tr", { hasText: "신규부분검수" }).count(), 0, `${viewport.name}: completed student returned to new-work queue after class add`);

    await page.locator("tbody tr", { hasText: "묶음검수일" }).locator('input[type="checkbox"]').check();
    await page.locator("tbody tr", { hasText: "묶음검수이" }).locator('input[type="checkbox"]').check();
    await page.locator("#screen").getByRole("button", { name: "일괄처리", exact: true }).click();
    assert.match(await page.locator("#bundleNames").inputValue(), /묶음검수일[\s\S]*묶음검수이/, `${viewport.name}: selected new students not forwarded to bundle`);
    assert.equal(await page.locator(".process-target-panel tbody tr").count(), 2, `${viewport.name}: forwarded bundle exact-set mismatch`);
    await page.locator(".process-target-panel tbody tr", { hasText: "묶음검수일" }).click();
    assert.match(await page.locator(".process-target-panel").innerText(), /묶음검수일 · 배정 반 1개[\s\S]*묶음 검수반/, `${viewport.name}: bundle student class review missing`);
    await page.locator('[data-main-tab="일괄처리"]').click();
    for (const label of ["전체", "반", "교재", "학생 묶음"])
      assert.equal(await page.getByRole("button", { name: label, exact: true }).count(), 1, `${viewport.name}: bulk subtab ${label} missing after direct tab click`);

    await page.locator('[data-main-tab="학생"]').click();
    await page.getByRole("button", { name: "학생 조회·처리", exact: true }).click();
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
    assert.match(await page.locator(".exit-review-card tbody tr").first().innerText(), /미배부/, `${viewport.name}: missing books are not listed first`);
    assert.equal(await page.locator(".exit-review-card tr", { hasText: "미배부 검수교재" }).locator(".danger").count(), 1, `${viewport.name}: missing status is not red`);
    assert.equal(await page.locator(".exit-review-card tr", { hasText: "회수 검수교재" }).locator(".success").filter({ hasText: "배부" }).count(), 1, `${viewport.name}: distributed status is not green`);
    assert.equal(await page.getByRole("button", { name: "회수", exact: true }).first().evaluate((button) => button.classList.contains("btn")), false, `${viewport.name}: unprocessed return button looks completed`);
    assert.equal(await page.locator(".exit-review-card .scroll").count(), 0, `${viewport.name}: withdrawal table still uses an internal scroll box`);
    const withdrawalFilter = page.getByLabel("퇴반 교재 상태");
    await withdrawalFilter.selectOption("배부");
    assert.equal(await page.locator(".exit-review-card tbody tr").count(), 3, `${viewport.name}: distributed filter mismatch`);
    await withdrawalFilter.selectOption("미배부");
    assert.equal(await page.locator(".exit-review-card tbody tr").count(), 2, `${viewport.name}: missing filter mismatch`);
    await withdrawalFilter.selectOption("전체");
    assert.equal(await page.locator(".exit-review-card tbody tr").count(), 5, `${viewport.name}: all filter did not restore every book`);
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

    await page.locator(".exit-review-card tr", { hasText: "환불제외 검수교재" }).getByRole("button", { name: "미배부 제외", exact: true }).click();
    await page.locator("#appDialogInput").fill("격리 검수 제외");
    await page.locator(".app-dialog .confirm-button").click();
    await page.locator(".exit-review-card tr", { hasText: "환불제외 검수교재" }).getByText("환불 제외", { exact: true }).waitFor();
    const taskAfterDecision = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).refundTasks.RTASK_EXACT, FAKE_STATE_KEY);
    assert.equal(taskAfterDecision.books.BEXCLUDED.status, "EXCLUDED", `${viewport.name}: refund exclusion not persisted`);
    const exclusionHistory = await page.evaluate((key) => Object.values(JSON.parse(localStorage.getItem(key)).movements).filter((movement) => movement.studentId === "SEXIT" && movement.bookId === "BEXCLUDED" && movement.type === "BOOK_EXCLUDE"), FAKE_STATE_KEY);
    assert.equal(exclusionHistory.length, 1, `${viewport.name}: refund exclusion history was not written exactly once`);
    assert.equal(exclusionHistory[0].bookName, "환불제외 검수교재", `${viewport.name}: refund exclusion history lost book identity`);
    await page.getByRole("button", { name: "퇴반완료", exact: true }).waitFor();

    await page.getByRole("button", { name: "퇴반완료", exact: true }).click();
    await page.getByRole("heading", { name: /퇴반완료 확인/ }).waitFor();
    assert.match(await page.locator(".app-dialog").innerText(), /최종 환불 2종 · 32,000원/);
    assert.match(await page.locator(".app-dialog").innerText(), /미배부 1종 \+ 회수완료 1종/);
    assert.match(await page.locator(".app-dialog").innerText(), /환불 제외 3종/);
    await page.evaluate(() => { window.__bookflowFakeTransactionDelayMs = 150; window.__bookflowFakeTransactionRejectOnce = true; });
    await page.locator(".app-dialog .confirm-button").click();
    await page.getByRole("status").getByText(/퇴반완료와 최종 환불금액을 저장하고 있습니다/).waitFor();
    await page.getByText(/저장하지 못했습니다/).waitFor();
    await page.locator(".app-dialog .confirm-button").click();
    const failedTask = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)).refundTasks.RTASK_EXACT, FAKE_STATE_KEY);
    assert.equal(failedTask.status, "PENDING", `${viewport.name}: failed save was falsely completed`);
    await page.getByRole("button", { name: "퇴반완료", exact: true }).click();
    await page.getByRole("heading", { name: /퇴반완료 확인/ }).waitFor();
    await page.evaluate(() => { window.__bookflowFakeTransactionDelayMs = 150; });
    const transactionCountBeforeDoubleClick = await page.evaluate(() => Number(window.__bookflowFakeTransactionCount || 0));
    await page.locator(".app-dialog .confirm-button").evaluate((button) => { button.click(); button.click(); });
    await page.getByRole("status").getByText(/퇴반완료와 최종 환불금액을 저장하고 있습니다/).waitFor();
    await page.getByText("퇴반완료 · 최종 환불금액 저장 완료", { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => Number(window.__bookflowFakeTransactionCount || 0)), transactionCountBeforeDoubleClick + 1, `${viewport.name}: rapid double click started duplicate saves`);
    assert.equal(await page.locator(".app-dialog").count(), 0, `${viewport.name}: delayed completion modal remained after save`);
    await page.getByRole("heading", { name: "퇴반완료 내역", exact: true }).waitFor();

    await page.evaluate((key) => {
      const saved = JSON.parse(localStorage.getItem(key));
      saved.refundTasks.RTASK_EXACT.returnDecisions.BHELD.quantity = 2;
      saved.students.SEXIT.holdings.BHELD = 99;
      localStorage.setItem(key, JSON.stringify(saved));
    }, FAKE_STATE_KEY);
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
    const historyIdentityChecks = await page.evaluate(() => {
      const target = { id: "SAME-1", name: "동명이인" }, other = { id: "SAME-2", name: "동명이인" };
      return {
        exact: historyBelongsToStudent({ studentId: "SAME-1", studentName: "동명이인" }, target, [target, other]),
        wrongId: historyBelongsToStudent({ studentId: "SAME-2", studentName: "동명이인" }, target, [target, other]),
        ambiguousLegacy: historyBelongsToStudent({ studentName: "동명이인" }, target, [target, other]),
        uniqueLegacy: historyBelongsToStudent({ studentName: "동명이인" }, target, [target]),
      };
    });
    assert.deepEqual(historyIdentityChecks, { exact: true, wrongId: false, ambiguousLegacy: false, uniqueLegacy: true }, `${viewport.name}: same-name history exact-set failed`);
    assert.match(await page.locator("#studentStatusDetail").innerText(), /퇴반완료 내역/);
    assert.match(await page.locator("#studentStatusDetail").innerText(), /퇴반일 .* · 교재 6권 · 배부 4권 · 미배부 2권/);
    assert.equal(await page.locator("#studentStatusDetail .history-details").count(), 1, `${viewport.name}: completed withdrawal lost recent history`);
    assert.equal(await page.locator("#studentStatusDetail .student-book-toolbar").count(), 0, `${viewport.name}: completed withdrawal duplicated the general student table`);
    assert.equal(await page.locator("#studentStatusDetail .exit-review-card tbody tr").count(), 5, `${viewport.name}: completed withdrawal lost distributed books`);
    await page.locator("#studentStatusSearch").fill("기록검수");
    const archiveCandidate = page.locator("#studentStatusAutoResults button", { hasText: "기록검수" });
    await archiveCandidate.waitFor();
    assert.match(await archiveCandidate.innerText(), /퇴반완료/, `${viewport.name}: orphan completed record missing from search`);
    await archiveCandidate.click();
    await page.getByRole("heading", { name: /기록검수/ }).waitFor();
    assert.match(await page.locator("#studentStatusDetail").innerText(), /보존된 퇴반 기록으로 조회했습니다/);
    assert.match(await page.locator("#studentStatusDetail").innerText(), /14,000원/);
    assert.equal(await page.locator("#studentStatusDetail .exit-review-card tbody tr").count(), 3, `${viewport.name}: legacy completed record lost distributed/returned books`);
    assert.match(await page.locator("#studentStatusDetail").innerText(), /배부/);
    assert.match(await page.locator("#studentStatusDetail").innerText(), /과거 회수/);
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
    await page.evaluate((key) => {
      const saved = JSON.parse(localStorage.getItem(key));
      for (const student of Object.values(saved.students)) for (const change of Object.values(student.classChanges || {})) change.workCompletedAt = change.workCompletedAt || "2026-09-07T08:00:00+09:00";
      saved.students.SACTIVE.classChanges = {
        CM1: { id:"CM1", periodId:"P2026T3", beforeClassIds:{ C1:"C1" }, afterClassIds:{ C1:"C1" }, memo:"1차 검수", actor:"검수자", time:"2026-09-07T09:00:00+09:00", workStatus:"PENDING" },
        CM2: { id:"CM2", periodId:"P2026T3", beforeClassIds:{ C1:"C1" }, afterClassIds:{ C1:"C1" }, memo:"2차 검수", actor:"검수자", time:"2026-09-07T10:00:00+09:00", workStatus:"PENDING" },
      };
      localStorage.setItem(key, JSON.stringify(saved));
    }, FAKE_STATE_KEY);
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator('[data-main-tab="반이동"]').waitFor();
    assert.match(await page.locator('[data-main-tab="반이동"]').innerText(), /반변경 1/, `${viewport.name}: pending class-move count is not per student`);
    await page.locator('[data-main-tab="반이동"]').click();
    await page.locator("tbody tr", { hasText: "재원검수" }).click();
    assert.match(await page.locator("#screen").innerText(), /반변경 2회[\s\S]*1차 변경[\s\S]*2차 변경[\s\S]*변경 전 반[\s\S]*변경 후 반/, `${viewport.name}: class-move timeline is unreadable`);
    const classMoveInventoryBefore = await page.evaluate((key) => { const state=JSON.parse(localStorage.getItem(key)); return JSON.stringify({books:state.books,holdings:Object.fromEntries(Object.values(state.students).map(student=>[student.id,student.holdings||{}])),movements:state.movements}); }, FAKE_STATE_KEY);
    await page.getByRole("button", { name: "반변경 처리 완료", exact: true }).click();
    await page.locator(".app-dialog .confirm-button").click();
    await page.locator(".app-dialog .confirm-button").click();
    const classMoveCompleted = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), FAKE_STATE_KEY);
    assert.ok(classMoveCompleted.students.SACTIVE.classChanges.CM1.workCompletedAt && classMoveCompleted.students.SACTIVE.classChanges.CM2.workCompletedAt, `${viewport.name}: all pending class changes were not completed together`);
    const classMoveInventoryAfter = JSON.stringify({books:classMoveCompleted.books,holdings:Object.fromEntries(Object.values(classMoveCompleted.students).map(student=>[student.id,student.holdings||{}])),movements:classMoveCompleted.movements});
    assert.equal(classMoveInventoryAfter, classMoveInventoryBefore, `${viewport.name}: class-move completion changed inventory or ledger`);
    assert.match(await page.locator('[data-main-tab="반이동"]').innerText(), /반변경 0/, `${viewport.name}: completed class move remained in pending count`);
    await page.locator('[data-main-tab="학생"]').click();
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
