"use strict";
const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const assert = require("assert/strict");

async function login(page) {
  await page.goto(`${process.env.BOOKFLOW_URL}?searchTest=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("#staffName").fill(process.env.BOOKFLOW_USER);
  await page.locator("#staffPin").fill(process.env.BOOKFLOW_PIN);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.locator("#tabs [data-main-tab='학생']").waitFor({ state: "visible", timeout: 30000 });
}

async function typeAndErase(locator, text, label) {
  await locator.click();
  const start = Date.now();
  await locator.pressSequentially(text, { delay: 15 });
  assert.equal(await locator.inputValue(), text, `${label}: 입력값 유실`);
  for (let index = 0; index < [...text].length; index += 1) await locator.press("Backspace");
  assert.equal(await locator.inputValue(), "", `${label}: 백스페이스 후 값이 남음`);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 2500, `${label}: 입력·삭제 ${elapsed}ms 지연`);
  return elapsed;
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXE });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await login(page);
  const results = [];

  results.push(["학생명", await typeAndErase(page.locator("#studentStatusSearch"), "김서현", "학생명")]);
  await page.locator("#studentStatusSearch").fill("김서현");
  await page.locator("#studentStatusAutoResults button").first().click();
  assert.ok((await page.locator("#studentStatusDetail").innerText()).trim(), "학생 선택 후 상세 없음");
  await page.locator("#studentStatusSearch").fill("");
  assert.equal((await page.locator("#studentStatusDetail").innerText()).trim(), "", "검색어 삭제 후 직전 학생 상세가 남음");
  assert.equal(await page.evaluate(() => window.statusStudentId || ""), "", "검색어 삭제 후 학생 선택 상태가 남음");

  await page.locator("#tabs [data-main-tab='일괄처리']").click();
  await page.getByRole("button", { name: "교재", exact: true }).click();
  results.push(["일괄처리 교재명", await typeAndErase(page.locator("input[placeholder='교재명 입력 또는 선택']"), "수매T", "일괄처리 교재명")]);

  await page.locator("#tabs [data-main-tab='퇴반대기']").click();
  results.push(["퇴반대기 학생명", await typeAndErase(page.locator("#refundSearch"), "김예인", "퇴반대기 학생명")]);

  await page.locator("#tabs [data-main-tab='재고']").click();
  await page.getByRole("button", { name: "재고실사", exact: true }).click();
  results.push(["재고 교재명", await typeAndErase(page.locator("#inventoryBookSearch"), "수매T", "재고 교재명")]);

  await page.locator("#tabs [data-main-tab='이력']").click();
  results.push(["이력 통합검색", await typeAndErase(page.locator("#histSearch"), "김서현", "이력 통합검색")]);

  console.log(JSON.stringify(results));
  await browser.close();
})().catch(error => { console.error(error); process.exit(1); });
