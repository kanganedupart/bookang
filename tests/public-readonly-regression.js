"use strict";
const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const assert = require("assert/strict");
const URL = process.env.BOOKFLOW_URL;

async function login(page) {
  await page.goto(`${URL}?regression=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("#staffName").fill(process.env.BOOKFLOW_USER);
  await page.locator("#staffPin").fill(process.env.BOOKFLOW_PIN);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.locator("#tabs [data-main-tab='학생']").waitFor({ state: "visible", timeout: 30000 });
}

async function assertUniformCheckboxes(page, label) {
  const sizes = await page.locator("input[type='checkbox']:visible").evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    return { width: style.width, height: style.height, minHeight: style.minHeight };
  }));
  for (const size of sizes) {
    assert.equal(size.width, "18px", `${label} 체크박스 너비 ${size.width}`);
    assert.equal(size.height, "18px", `${label} 체크박스 높이 ${size.height}`);
    assert.equal(size.minHeight, "18px", `${label} 체크박스 최소 높이 ${size.minHeight}`);
  }
  return sizes.length;
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXE });
  const report = [];
  for (const spec of [{device:"PC",viewport:{width:1280,height:900}},{device:"모바일",viewport:{width:390,height:844}}]) {
    const context = await browser.newContext({ viewport: spec.viewport });
    const page = await context.newPage();
    await login(page);
    const tabs = await page.locator("#tabs [data-main-tab]").evaluateAll(nodes => nodes.map(n => n.dataset.mainTab));
    for (const tab of tabs) {
      const at = Date.now();
      await page.locator(`#tabs [data-main-tab='${tab}']`).click();
      await page.locator(`#tabs [data-main-tab='${tab}'].on`).waitFor({ timeout: 3000 });
      const ms = Date.now() - at;
      assert.ok(ms < 1000, `${spec.device} ${tab} 클릭 ${ms}ms`);
      report.push({ device: spec.device, test: `탭 ${tab}`, ms, ok: true });
      console.log(`PASS ${spec.device} 탭 ${tab} ${ms}ms`);
      const checkboxCount = await assertUniformCheckboxes(page, `${spec.device} ${tab}`);
      if (checkboxCount) report.push({ device: spec.device, test: `체크박스 ${tab} ${checkboxCount}개`, ok: true });
    }
    await page.locator("#tabs [data-main-tab='퇴반대기']").click();
    const refundSummary = await page.evaluate(() => ({
      badge: pendingRefundRows().length,
      visibleRows: [...document.querySelectorAll("#screen tbody tr")].filter(row => !row.textContent.includes("해당 퇴반 학생이 없습니다.")).length,
      invalidStatusRows: [...document.querySelectorAll("#screen tbody tr")].filter(row => row.textContent.includes("퇴반대기") && row.querySelector("td")?.textContent.trim() === "-").length,
    }));
    assert.equal(refundSummary.invalidStatusRows, 0, `${spec.device} 퇴반일 없는 취소 기록이 퇴반대기로 노출됨`);
    if (refundSummary.badge === 0) assert.equal(refundSummary.visibleRows, 0, `${spec.device} 퇴반대기 0인데 목록이 표시됨`);
    report.push({ device: spec.device, test: "퇴반대기 숫자·목록 일치", ok: true });
    await page.locator("#tabs [data-main-tab='학생']").click();
    const studentId = await page.evaluate(() => Object.values(S.students || {}).find(s => String(s.name).includes("강연웅2804"))?.id || "");
    assert.ok(studentId, "강연웅 학생 ID 없음");
    await page.evaluate(id => openStudentStatus(id), studentId);
    await page.getByRole("button", { name: "반 관리" }).click();
    const details = page.locator("#screen details").filter({ hasText: "현재 반" }).first();
    assert.ok(await details.count(), "현재 반 펼침 없음");
    if (!(await details.evaluate(n => n.open))) await details.locator("summary").click();
    const beforeY = await page.evaluate(() => window.scrollY);
    for (let i=0;i<10;i++) await page.evaluate(() => scheduleRemoteRender());
    await page.waitForTimeout(1800);
    assert.equal(await details.evaluate(n => n.open), true, `${spec.device} 원격갱신 후 현재반 닫힘`);
    assert.equal(await page.evaluate(() => window.scrollY), beforeY, `${spec.device} 원격갱신 후 pageY 변경`);
    report.push({ device: spec.device, test: "반관리 펼침·스크롤 원격갱신10회", ok: true });

    await page.evaluate(() => changeTab("관리"));
    const catalogButton = page.getByRole("button", { name: "반·교재" });
    if (await catalogButton.count()) await catalogButton.click();
    const catalogInput = page.locator("#screen input[placeholder*='교재명 일부']").first();
    if (await catalogInput.count()) {
      await catalogInput.fill("수매M");
      await page.waitForTimeout(250);
      const value = await catalogInput.inputValue();
      for (let i=0;i<5;i++) await page.evaluate(() => scheduleRemoteRender());
      await page.waitForTimeout(1800);
      assert.equal(await catalogInput.inputValue(), value, `${spec.device} 교재검색 원격갱신 후 초기화`);
      report.push({ device: spec.device, test: "교재검색값 원격갱신5회", ok: true });
    }
    await context.close();
  }
  console.log(JSON.stringify(report));
  await browser.close();
})().catch(e => { console.error(e.stack || e); process.exit(1); });
