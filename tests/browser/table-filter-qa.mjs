import assert from 'node:assert/strict';
// Start an isolated Vite server, then optionally supply Playwright/browser paths.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.POS_QA_ORIGIN || 'http://127.0.0.1:5226';
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_EXECUTABLE && { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }), headless: true });
const failures = [];
async function check(name, scenario, run) {
 const context = await browser.newContext();
 await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
 const page = await context.newPage(); page.setDefaultTimeout(5000);
 const errors = []; page.on('pageerror', error => errors.push(error.message));
 try {
  await page.goto(`${origin}/tests/browser/table-filter-qa.html?scenario=${scenario}#tables`);
  await page.locator('.counter-table-grid').waitFor();
  await run(page); assert.deepEqual(errors, []); console.log(`PASS ${name}`);
 } catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`); }
 finally { await context.close(); }
}
async function selectFilter(page, filter) {
 await page.locator(`.table-workspace .counter-task-filter.${filter}`).click();
 await page.locator(`.table-workspace .counter-task-filter.${filter}[aria-pressed=true]`).waitFor();
}
async function openTable(page, number) {
 await page.locator('.counter-tile').filter({ has: page.locator('.counter-table-number', { hasText: String(number).padStart(2, '0') }) }).click();
 await page.locator('.order-panel-heading h2').filter({ hasText: String(number).padStart(2, '0') }).waitFor();
}
async function verifyAllFallback(page, removedFilter) {
 await page.locator(`.table-workspace .counter-task-filter.${removedFilter}`).waitFor({ state: 'detached' });
 await page.locator('.table-workspace .counter-task-filter.all[aria-pressed=true]').waitFor();
 assert.equal(await page.locator('.counter-tile').count(), 2);
 await openTable(page, 2);
 assert.equal(await page.locator('.order-panel .empty-table').count(), 1);
 await openTable(page, 1);
 assert.match(await page.locator('.order-panel .order-state').innerText(), /#41/);
}
try {
 await check('answering the last call keeps the All table cards interactive', 'calls', async page => {
  await selectFilter(page, 'calls'); await openTable(page, 1);
  await page.locator('.call-banner button').click();
  await verifyAllFallback(page, 'calls');
  assert.equal(await page.locator('.call-banner').count(), 0);
 });
 await check('serving the last ready order keeps the All table cards interactive', 'ready', async page => {
  await selectFilter(page, 'ready'); await openTable(page, 1);
  await page.locator('.order-panel .receipt-bottom button.primary').click();
  await verifyAllFallback(page, 'ready');
  assert.equal(await page.locator('.counter-tile.served').count(), 1);
 });
 await check('a remote kitchen handoff clears the last print filter and keeps tables interactive', 'handoff', async page => {
  await selectFilter(page, 'handoff');
  await page.evaluate(() => window.tableFilterQa.finishKitchenHandoff());
  await verifyAllFallback(page, 'handoff');
  assert.equal(await page.locator('.counter-tile.kitchen').count(), 1);
 });
 await check('View Table reveals a pending table after leaving the Empty filter', 'pending', async page => {
  await selectFilter(page, 'empty');
  assert.equal(await page.locator('.counter-tile').count(), 1);
  await page.evaluate(() => { location.hash = 'orders'; });
  await page.locator('.order-card-main').click();
  await page.locator('.order-dialog-actions button').filter({ hasText: 'ເບິ່ງໂຕະນີ້' }).click();
  await page.locator('.table-workspace .counter-task-filter.all[aria-pressed=true]').waitFor();
  assert.equal(await page.locator('.counter-tile').count(), 2);
  await page.locator('.counter-tile[aria-pressed=true] .counter-table-number').filter({ hasText: '01' }).waitFor();
  await page.locator('.order-panel-heading h2').filter({ hasText: '01' }).waitFor();
  assert.match(await page.locator('.order-panel .order-state').innerText(), /#41/);
 });
} finally { await browser.close(); }
if (failures.length) process.exitCode = 1;
