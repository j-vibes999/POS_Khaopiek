import assert from 'node:assert/strict';
// Start an isolated Vite server, then optionally supply Playwright/browser paths.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.POS_QA_ORIGIN || 'http://127.0.0.1:5226';
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_EXECUTABLE && { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }), headless: true });
const failures = [];
async function check(name, scenario, run, initialView = 'tables') {
 const context = await browser.newContext();
 await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
 const page = await context.newPage(); page.setDefaultTimeout(5000);
 const errors = []; page.on('pageerror', error => errors.push(error.message));
 try {
  await page.goto(`${origin}/tests/browser/table-filter-qa.html?scenario=${scenario}#${initialView}`);
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
 await check('mixed orders identify pending closures and only the final close frees the table', 'close', async page => {
  await page.locator('.language-button').filter({ hasText: 'ລາວ' }).click();
  const tile = page.locator('.counter-tile').filter({ has: page.locator('.counter-table-number', { hasText: '01' }) });
  await tile.getByText('เหลือ 2 ออเดอร์', { exact: true }).waitFor();
  await tile.getByText('1 ออเดอร์รอปิด', { exact: true }).waitFor();
  await selectFilter(page, 'served');
  await openTable(page, 1);
  await page.locator('.order-panel .receipt-bottom button.primary').click();
  await selectFilter(page, 'all');
  await tile.getByText('เหลือ 1 ออเดอร์', { exact: true }).waitFor();
  await tile.getByText('พร้อมเสิร์ฟ', { exact: true }).waitFor();
  await page.locator('.order-panel .receipt-bottom button.primary').click();
  await tile.getByText('รอปิดโต๊ะ', { exact: true }).waitFor();
  await page.locator('.order-panel .receipt-bottom button.primary').click();
  await tile.getByText('โต๊ะว่าง', { exact: true }).waitFor();
  assert.equal(await tile.getByText('เหลือ 1 ออเดอร์', { exact: true }).count(), 0);
  assert.deepEqual(await page.evaluate(() => window.tableFilterQa.commands.map(({ action }) => action)), ['order.close', 'order.serve', 'order.close']);
 });
 await check('mobile table selection opens the payment action immediately and returns to the table', 'mobile', async page => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('.language-button').click();
  await page.locator('.table-workspace .counter-tile').first().click();
  const action = page.locator('.order-panel .payment-cta');
  await action.waitFor();
  const hasVisibleAction = await action.evaluate(element => {
   const bounds = element.getBoundingClientRect();
   const nav = document.querySelector('.mobile-nav').getBoundingClientRect();
   return bounds.top >= 0 && bounds.bottom <= nav.top;
  });
  assert.equal(hasVisibleAction, true, 'Payment should be visible above the mobile navigation');
  assert.equal(await page.locator('.table-workspace').isVisible(), false);
  await action.click();
  await page.locator('.payment-dialog').waitFor();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'กลับไปหน้าโต๊ะ' }).click();
  await page.locator('.table-workspace').waitFor();
  assert.equal(await page.locator('.order-panel').isVisible(), false);
  assert.equal(await page.locator('.counter-tile').first().evaluate(element => document.activeElement === element), true);
 });
 await check('mobile View Table opens the same order from the order list', 'mobile', async page => {
  await page.setViewportSize({ width: 360, height: 640 });
  await page.evaluate(() => { location.hash = 'orders'; });
  await page.locator('.order-card-main').click();
  await page.locator('.order-dialog-actions button').filter({ hasText: 'ເບິ່ງໂຕະນີ້' }).click();
  await page.locator('.is-table-detail .order-state').filter({ hasText: '#41' }).waitFor();
  assert.equal(await page.locator('.table-workspace').isVisible(), false);
 });
 await check('a short mobile viewport can scroll through the full table and open payment', 'mobile', async page => {
  await page.setViewportSize({ width: 320, height: 390 });
  await openTable(page, 1);
  const content = await page.locator('.order-panel-content').boundingBox();
  assert.ok(content.height > 150, 'The receipt should have room to render on a short screen');
  await page.locator('.order-panel .payment-cta').click();
  await page.locator('.payment-dialog').waitFor();
 });
 await check('a cashier falling back to Tables can still open mobile details', 'cashier', async page => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openTable(page, 1);
  assert.equal(await page.locator('.table-workspace').isVisible(), false);
 }, 'reports');
} finally { await browser.close(); }
if (failures.length) process.exitCode = 1;
