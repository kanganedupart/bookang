"use strict";
const { chromium } = require(process.env.PLAYWRIGHT_PATH);

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXE || undefined });
  const results = [];
  for (const spec of [{name:"PC",width:1280,height:900},{name:"모바일",width:390,height:844}]) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height } });
    const page = await context.newPage();
    const start = Date.now();
    console.log(`START ${spec.name}`);
    await page.goto(`${process.env.BOOKFLOW_URL}?smoke=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const domMs = Date.now() - start;
    console.log(`DOM ${spec.name} ${domMs}`);
    await page.locator("#staffName").fill(process.env.BOOKFLOW_USER);
    await page.locator("#staffPin").fill(process.env.BOOKFLOW_PIN);
    const loginAt = Date.now();
    await page.getByRole("button", { name: "로그인" }).click();
    console.log(`LOGIN CLICK ${spec.name}`);
    await page.locator("#tabs [data-main-tab='학생']").waitFor({ state: "visible", timeout: 30000 });
    const loginMs = Date.now() - loginAt;
    const tabAt = Date.now();
    await page.locator("#tabs [data-main-tab='재고']").click();
    await page.locator("#tabs [data-main-tab='재고'].on").waitFor({ state: "visible", timeout: 5000 });
    const tabMs = Date.now() - tabAt;
    const reloadAt = Date.now();
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.locator("#tabs [data-main-tab='학생']").waitFor({ state: "visible", timeout: 30000 });
    const persistentReloadMs = Date.now() - reloadAt;
    results.push({ device: spec.name, domMs, loginToFirstScreenMs: loginMs, persistentReloadMs, tabClickMs: tabMs });
    await context.close();
  }
  console.log(JSON.stringify(results));
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
