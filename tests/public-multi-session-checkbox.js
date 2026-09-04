"use strict";
const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const assert = require("assert/strict");

const URL = process.env.BOOKFLOW_URL;

async function runSession(browser, index, viewport) {
  const context = await browser.newContext({ viewport });
  const page = await context.newPage();
  await page.goto(`${URL}?multiSession=${Date.now()}-${index}`, {
    waitUntil: "domcontentloaded",
    timeout: 30000,
  });
  await page.locator("#staffName").fill(process.env.BOOKFLOW_USER);
  await page.locator("#staffPin").fill(process.env.BOOKFLOW_PIN);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.locator("#tabs [data-main-tab='일괄처리']").click();
  await page.locator("#tabs [data-main-tab='일괄처리'].on").waitFor({ timeout: 5000 });

  const checks = page.locator("input[type='checkbox']:visible");
  const count = await checks.count();
  assert.ok(count > 0, `세션 ${index}: 표시된 체크박스 없음`);
  const sizes = await checks.evaluateAll(nodes => nodes.map(node => {
    const style = getComputedStyle(node);
    return [style.width, style.height, style.minHeight];
  }));
  assert.ok(sizes.every(size => size.every(value => value === "18px")), `세션 ${index}: 크기 불일치 ${JSON.stringify(sizes)}`);

  const first = checks.first();
  const before = await first.isChecked();
  await first.click();
  assert.equal(await first.isChecked(), !before, `세션 ${index}: 클릭 상태 미변경`);
  await page.waitForTimeout(35000);
  assert.equal(await first.isChecked(), !before, `세션 ${index}: 35초 후 선택 초기화`);
  const stillSizes = await checks.evaluateAll(nodes => nodes.map(node => [getComputedStyle(node).width, getComputedStyle(node).height]));
  assert.ok(stillSizes.every(size => size[0] === "18px" && size[1] === "18px"), `세션 ${index}: 대기 후 크기 불일치`);
  await context.close();
  return { index, viewport, count, retainedForSeconds: 35 };
}

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXE });
  const viewports = [
    { width: 1920, height: 1080 },
    { width: 1440, height: 900 },
    { width: 1280, height: 720 },
    { width: 1024, height: 768 },
    { width: 430, height: 932 },
    { width: 390, height: 844 },
  ];
  const results = await Promise.all(viewports.map((viewport, index) => runSession(browser, index + 1, viewport)));
  console.log(JSON.stringify(results));
  await browser.close();
})().catch(error => {
  console.error(error.stack || error);
  process.exit(1);
});
