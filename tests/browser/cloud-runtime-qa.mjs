import assert from 'node:assert/strict';
// Run against an isolated Vite server; optionally provide an existing Playwright installation/browser.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = process.env.POS_QA_ORIGIN || 'http://127.0.0.1:5221';
const browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_EXECUTABLE && { executablePath: process.env.PLAYWRIGHT_EXECUTABLE }), headless: true });
const failures = [];
async function check(name, run) {
 const context = await browser.newContext();
 await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
 const page = await context.newPage(); page.setDefaultTimeout(7000);
 const errors = []; page.on('pageerror', error => errors.push(error.message));
 try { await run(page); assert.deepEqual(errors, []); console.log(`PASS ${name}`); }
 catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.message}`); }
 finally { await context.close(); }
}
const open = (page, query = '', hash = 'tables') => page.goto(`${origin}/tests/browser/cloud-runtime-qa.html${query}#${hash}`);
try {
 await check('partial settings retain current shop fields and payment methods', async page => {
  await open(page, '', 'settings'); await page.locator('.settings-shop input').first().fill('Updated Restaurant'); await page.locator('.settings-shop button.primary').click();
  await page.waitForFunction(() => window.cloudQa.commands.length > 0);
  let payload = await page.evaluate(() => window.cloudQa.commands.at(-1).payload);
  assert.deepEqual(payload, { shopName: 'Updated Restaurant', branch: 'Main', phone: '123', methods: ['transfer', 'cash'], name: 'Updated Restaurant' });
  await page.locator('.settings-nav button').nth(1).click(); await page.locator('.method-card .switch').first().click();
  await page.waitForFunction(() => window.cloudQa.commands.length > 1);
  payload = await page.evaluate(() => window.cloudQa.commands.at(-1).payload);
  assert.deepEqual(payload, { shopName: 'Updated Restaurant', branch: 'Main', phone: '123', methods: ['cash'], name: 'Updated Restaurant' });
 });
 await check('cash-only cashier orders reach acknowledgement', async page => {
  await open(page, '?cash=1', 'pos'); await page.locator('.pos-dish').click(); await page.locator('.pos-checkout button.secondary').click();
  await page.waitForFunction(() => window.cloudQa.commands.some(command => command.action === 'order.create'));
  const payload = await page.evaluate(() => window.cloudQa.commands.at(-1).payload);
  assert.equal(payload.method, 'cash'); assert.equal(JSON.parse(payload.reviewedKey)[2], 'cash');
  await page.locator('.order-panel').waitFor();
 });
 await check('existing draft changes method and request identity after settings change', async page => {
  await open(page, '', 'pos'); await page.locator('.pos-dish').click(); await page.evaluate(() => { window.cloudQa.rejectCreate = true; });
  await page.locator('.pos-checkout button.secondary').click(); await page.waitForFunction(() => window.cloudQa.commands.length === 1);
  const before = await page.evaluate(() => window.cloudQa.commands[0].payload);
  await page.evaluate(() => { window.cloudQa.shops.A.restaurants.payment_methods = ['cash']; window.cloudQa.rejectCreate = false; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(() => window.cloudQa.snapshots.length >= 2); await page.waitForTimeout(100);
  await page.locator('.pos-checkout button.secondary').click(); await page.waitForFunction(() => window.cloudQa.commands.length === 2);
  const after = await page.evaluate(() => window.cloudQa.commands[1].payload);
  assert.equal(after.method, 'cash'); assert.equal(JSON.parse(after.reviewedKey)[2], 'cash'); assert.notEqual(after.requestId, before.requestId);
 });
 await check('four-second snapshots render despite three-second polling', async page => {
  await open(page, '?delay=4000'); await page.locator('.app.cloud-app').waitFor({ timeout: 6500 });
  assert.equal(await page.evaluate(() => window.cloudQa.snapshots.length), 2);
 });
 await check('lost cashier acknowledgements recover the original order after method settings change', async page => {
  await open(page, '', 'pos'); await page.locator('.pos-dish').click(); await page.evaluate(() => { window.cloudQa.loseCreateAck = true; });
  await page.locator('.pos-checkout button.secondary').click(); await page.waitForFunction(() => window.cloudQa.shops.A.orders.length === 1);
  const before = await page.evaluate(() => window.cloudQa.commands[0].payload);
  await page.evaluate(() => { window.cloudQa.shops.A.restaurants.payment_methods = ['cash']; document.dispatchEvent(new Event('visibilitychange')); });
  await page.waitForFunction(() => window.cloudQa.snapshots.length >= 2); await page.waitForTimeout(100);
  await page.locator('.pos-checkout button.secondary').click(); await page.locator('.order-panel').waitFor();
  const after = await page.evaluate(() => window.cloudQa.commands[1].payload);
  assert.equal(after.requestId, before.requestId); assert.equal(after.method, 'transfer'); assert.equal(after.reviewedKey, before.reviewedKey);
  assert.equal(await page.evaluate(() => window.cloudQa.shops.A.orders.length), 1);
 });
 await check('activity shows receipt numbers and saved historical dish names', async page => {
  await open(page, '', 'settings'); await page.locator('.settings-shop').waitFor();
  await page.evaluate(() => {
   const qa = window.cloudQa, dish = qa.shops.A.menu_items[0];
   qa.shops.A.activity_log = [{ id: 'event-1', event_type: 'menu.availability', actor_membership_id: qa.shops.A.membership.id, created_at: new Date().toISOString(), details: { itemId: dish.id, name: 'Historic Noodles', available: false } }, { id: 'event-2', event_type: 'order.pay', order_id: '00000000-0000-4000-8000-000000000777', created_at: new Date().toISOString(), details: { orderNumber: 7, amount: 35000, method: 'cash' } }];
   document.dispatchEvent(new Event('visibilitychange'));
  });
  await page.waitForFunction(() => window.cloudQa.snapshots.length >= 2); await page.waitForTimeout(100); await page.locator('.settings-nav button').nth(2).click();
  const text = await page.locator('.activity-list').innerText(); assert.match(text, /Historic Noodles/); assert.match(text, /#7/); assert.doesNotMatch(text, /000000000777/);
 });
 await check('uncertain cashier orders keep their cart and request until recovery', async page => {
  await open(page, '', 'pos'); await page.locator('.pos-dish').click(); await page.evaluate(() => { window.cloudQa.loseCreateAck = true; });
  await page.locator('.pos-checkout button.secondary').click(); await page.waitForFunction(() => window.cloudQa.shops.A.orders.length === 1);
  const before = await page.evaluate(() => window.cloudQa.commands[0].payload);
  await page.locator('.pos-dish').click(); await page.locator('.pos-line .stepper button').last().click();
  assert.equal(await page.locator('.pos-line .stepper b').innerText(), '1');
  assert.equal(await page.locator('.pos-checkout button.secondary').isEnabled(), true);
  await page.locator('.pos-checkout button.secondary').click(); await page.locator('.order-panel').waitFor();
  const after = await page.evaluate(() => window.cloudQa.commands[1].payload);
  assert.equal(after.requestId, before.requestId); assert.deepEqual(after.cart, before.cart);
  assert.equal(await page.evaluate(() => window.cloudQa.shops.A.orders.length), 1);
 });
 await check('a definitively rejected sold-out order can be edited before resubmission', async page => {
  await open(page, '', 'pos'); await page.locator('.pos-dish').click(); await page.evaluate(() => { window.cloudQa.rejectCreate = 'sold-out'; });
  await page.locator('.pos-checkout button.secondary').click(); await page.waitForFunction(() => window.cloudQa.commands.length === 1);
  await page.locator('.pos-line .stepper button').first().click(); assert.equal(await page.locator('.pos-line').count(), 0);
  await page.evaluate(() => { window.cloudQa.rejectCreate = false; }); await page.locator('.pos-dish').click();
  await page.locator('.pos-checkout button.secondary').click(); await page.locator('.order-panel').waitFor();
  const commands = await page.evaluate(() => window.cloudQa.commands);
  assert.notEqual(commands[1].payload.requestId, commands[0].payload.requestId);
  assert.equal(await page.evaluate(() => window.cloudQa.shops.A.orders.length), 1);
 });
 await check('sign-out clears immediately when the auth request fails', async page => {
  await open(page); await page.locator('.profile').waitFor(); await page.evaluate(() => { window.cloudQa.signOutFail = true; });
  await page.locator('button.profile').click(); await page.locator('input[type=email]').waitFor({ timeout: 1500 });
  assert.equal(await page.locator('.app.cloud-app').count(), 0);
  await page.evaluate(() => window.cloudQa.refreshAuth()); await page.waitForTimeout(100);
  assert.equal(await page.locator('input[type=email]').count(), 1);
 });
 await check('delayed account A commands cannot overwrite signed-in account B', async page => {
  await open(page, '', 'table-setup'); await page.locator('.setup-card').waitFor(); await page.evaluate(() => { window.cloudQa.holdCommand = true; });
  await page.locator('.page-heading button.primary').click(); await page.waitForFunction(() => typeof window.cloudQa.releaseCommand === 'function');
  await page.locator('button.profile').click(); await page.locator('input[type=email]').fill('b@qa.invalid'); await page.locator('input[type=password]').fill('password'); await page.locator('.cloud-access-card button.primary').click();
  await page.locator('.shop-selector strong').filter({ hasText: 'B Restaurant' }).waitFor();
  await page.evaluate(() => window.cloudQa.releaseCommand()); await page.waitForTimeout(200);
  assert.equal(await page.locator('.shop-selector strong').innerText(), 'B Restaurant');
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await page.waitForTimeout(100);
  const last = await page.evaluate(() => window.cloudQa.snapshots.at(-1));
  assert.equal(last.key, 'B'); assert.equal(last.restaurantId, '00000000-0000-4000-8000-000000000101');
 });
} finally { await browser.close(); }
if (failures.length) process.exitCode = 1;
