"use strict";
const { chromium } = require(process.env.PLAYWRIGHT_PATH);
const assert = require("assert/strict");

(async () => {
  const browser = await chromium.launch({ headless: true, executablePath: process.env.BROWSER_EXE });
  const context = await browser.newContext();
  const pages = await Promise.all([0, 1, 2].map(async index => {
    const page = await context.newPage();
    await page.goto(`${process.env.BOOKFLOW_URL}${process.env.BOOKFLOW_URL.includes("?") ? "&" : "?"}tab=${index}`, { waitUntil: "domcontentloaded" });
    return page;
  }));
  const signIn = async page => {
    await page.locator("#staffName").fill(process.env.BOOKFLOW_USER);
    await page.locator("#staffPin").fill(process.env.BOOKFLOW_PIN);
    await page.getByRole("button", { name: "로그인" }).click();
  };
  await signIn(pages[0]);
  await Promise.all(pages.map(page => page.locator("#tabs [data-main-tab='학생']").waitFor({ timeout: 30000 })));
  await pages[1].getByRole("button", { name: "로그아웃" }).click();
  await Promise.all(pages.map(page => page.locator("#staffName").waitFor({ timeout: 30000 })));
  const loggedOutActors = await Promise.all(pages.map(page => page.locator("#actor").textContent()));
  assert.ok(loggedOutActors.every(text => (text || "").includes("직원 로그인 필요")), JSON.stringify(loggedOutActors));
  await signIn(pages[2]);
  await Promise.all(pages.map(page => page.locator("#tabs [data-main-tab='학생']").waitFor({ timeout: 30000 })));
  const states = await Promise.all(pages.map(page => page.evaluate(() => ({ actor, dataset, build: BOOKFLOW_BUILD }))));
  assert.ok(states.every(state => state.actor === process.env.BOOKFLOW_USER));
  assert.ok(states.every(state => state.dataset === "bookflowOperational20260904V1"));
  console.log(JSON.stringify(states));
  await browser.close();
})().catch(error => { console.error(error.stack || error); process.exit(1); });
