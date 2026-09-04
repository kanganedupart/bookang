"use strict";
const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const assert = require("assert/strict");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXE });
  const page = await browser.newPage();
  await page.goto(process.env.BOOKFLOW_URL, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.locator("#staffName").fill(process.env.BOOKFLOW_USER);
  await page.locator("#staffPin").fill(process.env.BOOKFLOW_PIN);
  await page.getByRole("button", { name: "로그인" }).click();
  await page.locator("#tabs [data-main-tab='학생']").waitFor({ timeout: 30000 });
  const result = await page.evaluate(async () => {
    const probe = `cutover-${Date.now()}`;
    await root.child("__cutoverProbe").set({ probe });
    const newRead = (await root.child("__cutoverProbe/probe").once("value")).val();
    await root.child("__cutoverProbe").remove();
    let oldDenied = false;
    try {
      await firebase.database().ref("bookflowLiteValidation700/__cutoverProbe").set({ probe });
      await firebase.database().ref("bookflowLiteValidation700/__cutoverProbe").remove();
    } catch (error) {
      oldDenied = /permission_denied|permission denied/i.test(String(error?.code || error?.message || error));
    }
    return { dataset, newRead, probe, oldDenied, build: BOOKFLOW_BUILD };
  });
  assert.equal(result.dataset, "bookflowOperational20260904V1");
  assert.equal(result.newRead, result.probe);
  assert.equal(result.oldDenied, true);
  console.log(JSON.stringify(result));
  await browser.close();
})().catch(error => { console.error(error.stack || error); process.exit(1); });
