"use strict";
const { chromium } = require(process.env.PLAYWRIGHT_PATH);

(async () => {
  const browser = await chromium.launch({ headless: true });
  const results = [];
  for (const spec of [{name:"PC",width:1280,height:900},{name:"모바일",width:390,height:844}]) {
    const context = await browser.newContext({ viewport: { width: spec.width, height: spec.height } });
    const page = await context.newPage();
    const start = Date.now();
    await page.goto(`${process.env.BOOKFLOW_URL}?smoke=${Date.now()}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const domMs = Date.now() - start;
    await page.locator("#staffName").fill(process.env.BOOKFLOW_USER);
    await page.locator("#staffPin").fill(process.env.BOOKFLOW_PIN);
    const loginAt = Date.now();
    await page.getByRole("button", { name: "로그인" }).click();
    await page.locator("#tabs [data-main-tab='학생']").waitFor({ state: "visible", timeout: 30000 });
    const loginMs = Date.now() - loginAt;
    const tabAt = Date.now();
    await page.locator("#tabs [data-main-tab='재고']").click();
    await page.locator("#screen").getByText("재고", { exact: true }).first().waitFor({ state: "visible", timeout: 5000 }).catch(()=>{});
    const tabMs = Date.now() - tabAt;
    results.push({ device: spec.name, domMs, loginToFirstScreenMs: loginMs, tabClickMs: tabMs });
    await context.close();
  }
  console.log(JSON.stringify(results));
  await browser.close();
})().catch((error) => { console.error(error); process.exit(1); });
