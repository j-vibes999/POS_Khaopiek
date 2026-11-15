// All RPC responses are synthetic; no request is allowed to reach a real shop.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../..', import.meta.url));
const origin = 'http://127.0.0.1:5239';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const guest = 'a'.repeat(48), requestId = 'b'.repeat(48);
const server = await createServer({ root, configFile: false, envDir: false, plugins: [react()],
  define: { __LOCAL_MENU_HOST__: JSON.stringify(''), 'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('https://isolated-qa.supabase.co'), 'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify('sb_publishable_isolated_qa') },
  server: { host: '127.0.0.1', port: 5239, strictPort: true }, logLevel: 'error' });
let browser;
const failures = [];

async function check(name, run) {
  if (process.env.POS_QA_FILTER && !name.includes(process.env.POS_QA_FILTER)) return;
  const context = await browser.newContext();
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  page.setDefaultTimeout(7000);
  try { await run(page, context); assert.deepEqual(errors, []); console.log(`PASS ${name}`); }
  catch (error) { failures.push(name); console.error(`FAIL ${name}: ${error.stack}`); }
  finally { await context.close(); }
}

async function customer(page, context, { pending = false, hold = false, parallelSetup = false } = {}) {
  const calls = [];
  let release, releaseSetup, menuStarted = false, active = 0, maximum = 0;
  const order = { id: id(4), order_number: 1, table_id: id(2), table_number: 1, source: 'qr', requested_method: 'cash', status: 'pending', paid: false, created_at: '2026-11-08T03:00:00Z', revision: 1, order_items: [] };
  await context.route('**/*', async route => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.origin !== 'https://isolated-qa.supabase.co' || !url.pathname.startsWith('/rest/v1/rpc/')) return route.abort();
    const name = url.pathname.split('/').at(-1), args = route.request().postDataJSON();
    calls.push({ name, args });
    let data;
    if (name === 'pos_setup_status') {
      if (parallelSetup && !menuStarted) await new Promise(resolve => { releaseSetup = resolve; });
      data = { schemaVersion: 2, guestOrdersReady: true, paymentsReady: true };
    }
    else if (name === 'pos_get_menu') {
      menuStarted = true;
      releaseSetup?.();
      data = { table: 1, shopName: 'Synthetic shop', methods: ['cash'], menu: [] };
    }
    else if (name === 'pos_guest_orders') {
      ++active; maximum = Math.max(maximum, active);
      if (hold) { hold = false; await new Promise(resolve => { release = resolve; }); }
      data = { orders: pending ? [order] : [], matchedOrder: pending ? order : null, call: null };
      --active;
    } else throw new Error(`Unexpected RPC ${name}`);
    return route.fulfill({ json: data, headers: { 'access-control-allow-origin': '*' } });
  });
  await page.addInitScript(({ guest, requestId, tableKey, pending }) => {
    localStorage.setItem('khao-piek:lan:guest:v1', guest);
    localStorage.setItem(`khao-piek:cart:${tableKey}`, JSON.stringify({ cart: [], method: 'cash', pending, requestId }));
    window.qaVisibility = 'visible';
    Object.defineProperty(document, 'visibilityState', { get: () => window.qaVisibility });
  }, { guest, requestId, tableKey: id(1), pending });
  await page.clock.install();
  await page.goto(`${origin}/tests/browser/customer-runtime-qa.html?key=${id(1)}#customer`);
  await page.locator('.dining-menu-content').waitFor();
  await page.waitForFunction(() => document.querySelector('.dining-app'));
  return { calls, get maximum() { return maximum; }, release: () => release?.() };
}

try {
  await server.listen();
  browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_EXECUTABLE, headless: true });
  await check('initial guest menu and readiness reads start in parallel', async (page, context) => {
    const qa = await customer(page, context, { parallelSetup: true });
    assert.equal(qa.calls.filter(call => call.name === 'pos_setup_status').length, 1);
    assert.equal(qa.calls.filter(call => call.name === 'pos_get_menu').length, 1);
  });
  await check('guest menu polling does not repeat the initial schema preflight', async (page, context) => {
    const qa = await customer(page, context);
    const refreshed = page.waitForResponse('**/rest/v1/rpc/pos_get_menu');
    await page.clock.runFor(15100);
    await refreshed;
    assert.equal(qa.calls.filter(call => call.name === 'pos_get_menu').length, 2);
    assert.equal(qa.calls.filter(call => call.name === 'pos_setup_status').length, 1);
  });
  await check('hidden guest pages pause history and catch up on visibility and online', async (page, context) => {
    const qa = await customer(page, context);
    await page.waitForTimeout(20);
    const before = qa.calls.filter(call => call.name === 'pos_guest_orders').length;
    await page.evaluate(() => { window.qaVisibility = 'hidden'; document.dispatchEvent(new Event('visibilitychange')); });
    await page.clock.runFor(12100);
    assert.equal(qa.calls.filter(call => call.name === 'pos_guest_orders').length, before);
    await page.evaluate(() => { window.qaVisibility = 'visible'; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(20);
    assert.equal(qa.calls.filter(call => call.name === 'pos_guest_orders').length, before + 1);
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await page.waitForTimeout(20);
    assert.equal(qa.calls.filter(call => call.name === 'pos_guest_orders').length, before + 2);
  });
  await check('visibility bursts keep guest requests serial and recover pending acceptance', async (page, context) => {
    const qa = await customer(page, context, { pending: true, hold: true });
    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); window.dispatchEvent(new Event('online')); });
    qa.release();
    await page.waitForFunction(key => JSON.parse(localStorage.getItem(`khao-piek:cart:${key}`))?.receipt?.orderNumber === 1, id(1));
    assert.equal(qa.maximum, 1);
    const history = qa.calls.filter(call => call.name === 'pos_guest_orders');
    assert.equal(history[0].args.p_request_id, requestId);
    const draft = await page.evaluate(key => JSON.parse(localStorage.getItem(`khao-piek:cart:${key}`)), id(1));
    assert.equal(draft.pending, undefined);
    assert.equal(draft.receipt.orderId, id(4));
  });
  await check('unchanged staff snapshots avoid React commits and real updates still render', async (page, context) => {
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.clock.install();
    await page.goto(`${origin}/tests/browser/cloud-runtime-qa.html#tables`);
    await page.locator('.app.cloud-app').waitFor();
    await page.waitForTimeout(50);
    const before = await page.evaluate(() => window.cloudQa.commits);
    await page.clock.runFor(6100);
    assert.ok(await page.evaluate(() => window.cloudQa.snapshots.length >= 3));
    assert.equal(await page.evaluate(() => window.cloudQa.commits), before);
    await page.evaluate(() => { window.cloudQa.shops.A.restaurants.name = 'Changed Restaurant'; document.dispatchEvent(new Event('visibilitychange')); });
    await page.locator('.shop-selector strong').filter({ hasText: 'Changed Restaurant' }).waitFor();
    assert.ok(await page.evaluate(commits => window.cloudQa.commits > commits, before));
    await page.evaluate(() => { window.cloudQa.failSnapshots = 1; document.dispatchEvent(new Event('visibilitychange')); });
    await page.locator('.offline-banner').waitFor();
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
    await page.locator('.offline-banner').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.shop-selector strong').innerText(), 'Changed Restaurant');
  });
  await check('staff operational polls keep history off the counter and archive orders paginate and search', async (page, context) => {
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(`${origin}/tests/browser/cloud-runtime-qa.html?optimized#tables`);
    await page.locator('.app.cloud-app').waitFor();
    assert.equal(await page.evaluate(() => window.cloudQa.snapshots.length), 0);
    assert.deepEqual(await page.evaluate(() => [...new Set(window.cloudQa.reads.map(read => read.view))]), ['operational']);
    await page.evaluate(() => { location.hash = 'orders'; });
    await page.waitForFunction(() => document.querySelectorAll('.order-section.completed .order-card').length === 4);
    assert.equal(await page.locator('.order-section.pending .order-card').count(), 1);
    await page.locator('.counter-task-filter.completed').click();
    await page.waitForFunction(() => document.querySelectorAll('.order-section.completed .order-card').length === 25);
    await page.locator('.staff-read-next').click();
    await page.waitForFunction(() => document.querySelectorAll('.order-section.completed .order-card').length === 5);
    await page.locator('.orders-toolbar input').fill('#29');
    await page.waitForFunction(() => document.querySelector('.order-section.completed .order-card-title')?.textContent === '#29');
    assert.equal(await page.locator('.order-section.completed .order-card').count(), 1);
    await page.locator('.order-section.completed .order-card-main').click();
    assert.match(await page.locator('.order-dialog h2').innerText(), /#29/);
  });

  await check('staff reports and activity load only when opened and use server values', async (page, context) => {
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(`${origin}/tests/browser/cloud-runtime-qa.html?optimized#settings`);
    await page.locator('.settings-shop').waitFor();
    assert.equal(await page.evaluate(() => window.cloudQa.reads.some(read => read.view === 'activity')), false);
    await page.locator('.settings-nav button').nth(2).click();
    await page.locator('.activity-list').waitFor();
    await page.evaluate(() => { location.hash = 'reports'; });
    await page.waitForFunction(() => document.querySelector('.sales-main strong')?.textContent.includes('120,000'));
    await page.locator('.reports-page .segment button').nth(2).click();
    await page.waitForFunction(() => document.querySelector('.sales-main strong')?.textContent.includes('540,000'));
    assert.deepEqual(await page.evaluate(() => window.cloudQa.reads.filter(read => read.view === 'reports').map(read => read.input.range)), ['today', 'all']);
  });
  await check('staff shift history is paginated and open totals include payments on archived orders', async (page, context) => {
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(`${origin}/tests/browser/cloud-runtime-qa.html?optimized#shift`);
    await page.waitForFunction(() => document.querySelectorAll('.shift-record').length === 25);
    assert.match(await page.locator('.shift-drawer strong').innerText(), /135,000/);
    await page.locator('.staff-read-next').click();
    await page.waitForFunction(() => document.querySelectorAll('.shift-record').length === 1);
    assert.match(await page.locator('.shift-drawer strong').innerText(), /135,000/);
  });
  await check('staff history revision refreshes visible reports and late results cannot cross accounts', async (page, context) => {
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(`${origin}/tests/browser/cloud-runtime-qa.html?optimized#reports`);
    await page.waitForFunction(() => document.querySelector('.sales-main strong')?.textContent.includes('120,000'));
    await page.evaluate(() => {
      window.cloudQa.holdRead = 'A';
      window.cloudQa.shops.A.activity_log.unshift({ id: '00000000-0000-4000-8000-000000000999', event_type: 'order.close', created_at: new Date().toISOString(), details: {} });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => typeof window.cloudQa.releaseRead === 'function');
    await page.locator('button.profile').click();
    await page.locator('input[type=email]').fill('b@qa.invalid');
    await page.locator('input[type=password]').fill('password');
    await page.locator('.cloud-access-card button.primary').click();
    await page.waitForFunction(() => document.querySelector('.sales-main strong')?.textContent.includes('99,000'));
    await page.evaluate(() => window.cloudQa.releaseRead());
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert.match(await page.locator('.sales-main strong').innerText(), /99,000/);
  });
  await check('staff access changes close an open owner dialog and hide owner pages', async (page, context) => {
    await context.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
    await page.goto(`${origin}/tests/browser/cloud-runtime-qa.html?optimized#tables`);
    await page.locator('.table-tile').click();
    await page.locator('.order-panel').getByRole('button', { name: /^QR / }).first().click();
    await page.locator('.qr-dialog').waitFor();
    await page.evaluate(() => {
      const shop = window.cloudQa.shops.A;
      const cashier = { ...shop.membership, id: '00000000-0000-4000-8000-000000000998', user_id: null, role: 'cashier' };
      shop.members.push(cashier);
      shop.membership = cashier;
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.locator('.qr-dialog').waitFor({ state: 'detached' });
    assert.equal(await page.locator('.sidebar button').filter({ hasText: /ສະຫຼຸບຍອດຂາຍ|สรุปยอดขาย/ }).count(), 0);
    await page.locator('.order-panel .payment-cta').waitFor();
  });
} finally { await browser?.close(); await server.close(); }
if (failures.length) process.exitCode = 1;
