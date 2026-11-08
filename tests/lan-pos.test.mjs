import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLanPosMiddleware } from '../server/lan-pos.mjs';
import { checkoutReviewKey, LAN_ORDER_ID_START } from '../src/customer-model.mjs';
import { defaultTables } from '../src/backoffice-model.mjs';
import { initialMenu } from '../src/data.js';

const networkHost = '192.168.0.33';
const guest = '1'.repeat(48);
const otherGuest = '2'.repeat(48);

function requestBody(id = 1, changes = {}, table = 3) {
  const method = 'cash';
  const cart = [{ ...initialMenu[0], price: initialMenu[0].price + 10_000, quantity: 2, size: 'large', noHerbs: true, ...changes }];
  return { table, method, cart, reviewedKey: checkoutReviewKey(table, cart, method), requestId: id.toString(16).padStart(48, '0') };
}

function settings(orders = [], overrides = {}) {
  return { menu: initialMenu, soldOut: [], tables: defaultTables(), settings: { shopName: 'Test cafe', methods: ['cash', 'transfer'], privateField: 'hidden' }, orders, ...overrides };
}

async function fixture(t) {
  const folder = mkdtempSync(join(tmpdir(), 'khao-piek-pos-test-'));
  const file = join(folder, 'inbox.json');
  const streams = new Set();
  let server;
  let base;
  async function start() {
    const handler = createLanPosMiddleware({ file, networkHost });
    server = createServer((req, res) => handler(req, res, () => { res.statusCode = 404; res.end(); }));
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    base = `http://127.0.0.1:${server.address().port}`;
  }
  async function close() {
    for (const call of streams) call.destroy();
    await new Promise(resolve => server.close(resolve));
  }
  await start();
  t.after(async () => { await close(); rmSync(folder, { recursive: true, force: true }); });

  function request(path, { body, owner = guest, headers } = {}) {
    return new Promise((resolve, reject) => {
      const call = httpRequest(`${base}/api/pos/${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Pos-Guest': owner, ...headers },
      }, response => {
        const chunks = [];
        response.on('data', chunk => chunks.push(chunk));
        response.on('error', reject);
        response.on('end', () => {
          try { resolve({ status: response.statusCode, cache: response.headers['cache-control'], body: JSON.parse(Buffer.concat(chunks)) }); }
          catch (error) { reject(error); }
        });
      });
      call.on('error', reject);
      call.end(body === undefined ? undefined : JSON.stringify(body));
    });
  }
  function openEvents() {
    return new Promise((resolve, reject) => {
      const call = httpRequest(`${base}/api/pos/events`, { headers: { Origin: base } }, resolve);
      streams.add(call);
      call.once('close', () => streams.delete(call));
      call.on('error', reject);
      call.end();
    });
  }

  return { file, request, openEvents, get port() { return server.address().port; }, async restart() { await close(); await start(); } };
}

async function* eventFrames(stream) {
  let pending = '';
  for await (const chunk of stream.setEncoding('utf8')) {
    const frames = (pending + chunk).split('\n\n');
    pending = frames.pop();
    yield* frames;
  }
}

test('LAN order retries survive restart, ignore client payment state and keep customer histories isolated', async t => {
  const api = await fixture(t);
  const { request, restart } = api;
  const host = `${networkHost}:${api.port}`;
  const submitted = requestBody(1, { untrusted: 'Untrusted dish field', customizationNote: ' No ice\u0000 ' });
  const accepted = await request('orders', {
    body: { ...submitted, status: 'queued', paid: true },
    headers: { Host: host, Origin: `http://${host}` },
  });
  assert.deepEqual(accepted, { status: 200, cache: 'no-store', body: { orderId: String(LAN_ORDER_ID_START) } });
  await restart();

  const retry = await request('orders', { body: submitted });
  assert.deepEqual(retry, accepted);
  const changed = { ...submitted, table: 4, reviewedKey: checkoutReviewKey(4, submitted.cart, submitted.method) };
  for (const body of [changed, { ...changed, reviewedKey: submitted.reviewedKey }]) {
    const mismatch = await request('orders', { body });
    assert.equal(mismatch.status, 409);
    assert.deepEqual(mismatch.body, { code: 'cart-changed' });
  }
  const own = await request('orders?table=3');
  assert.equal(own.body.orders.length, 1);
  const [order] = own.body.orders;
  assert.equal(order.id, accepted.body.orderId);
  assert.equal(order.paid, false);
  assert.equal(order.status, 'pending');
  assert.equal(order.items[0].lo, initialMenu[0].lo);
  assert.equal('untrusted' in order.items[0], false);
  assert.equal(order.items[0].customizationNote, 'No ice');
  assert.equal(order.items[0].noteTh, 'ไม่ใส่ผัก · No ice');
  assert.deepEqual((await request('orders?table=3', { owner: otherGuest })).body, { orders: [] });
  assert.deepEqual((await request('orders?table=4')).body, { orders: [] });
  assert.equal(JSON.stringify(own.body).includes(guest), false);
});

test('server rejects forged prices, outdated review data and sold-out items', async t => {
  const { request } = await fixture(t);
  assert.equal((await request('orders', { body: requestBody(1, { price: 1 }) })).body.code, 'cart-changed');
  assert.equal((await request('orders', { body: requestBody(1, { quantity: 31 }) })).body.code, 'invalid-order');
  const body = requestBody();
  assert.equal((await request('orders', { body: { ...body, method: 'transfer' } })).body.code, 'cart-changed');
  assert.equal((await request('orders', { body: { ...body, table: 999 } })).body.code, 'invalid-table');
  assert.equal((await request('sync', { body: settings([], { soldOut: [initialMenu[0].id] }) })).status, 200);
  assert.equal((await request('orders', { body })).body.code, 'sold-out');
  const menu = await request('menu?table=3');
  assert.equal(menu.body.menu[0].available, false);
  assert.equal(menu.body.shopName, 'Test cafe');
  assert.equal(JSON.stringify(menu.body).includes('hidden'), false);
});

test('same-price dish edits invalidate an old customer review', async t => {
  const { request } = await fixture(t);
  const dish = { ...initialMenu[0], lo: 'ສູດໃໝ່', th: 'สูตรใหม่' };
  const menu = [dish, ...initialMenu.slice(1)];
  assert.equal((await request('sync', { body: settings([], { menu }) })).status, 200);
  assert.deepEqual((await request('orders', { body: requestBody() })).body, { code: 'cart-changed' });
  const updated = requestBody(1, { lo: dish.lo, th: dish.th });
  assert.equal((await request('orders', { body: updated })).status, 200);
});

test('largest supported basket with Lao kitchen notes fits the submission API', async t => {
  const { request } = await fixture(t);
  const body = requestBody();
  body.cart = Array.from({ length: 30 }, (_, index) => {
    const customizationNote = `${'ທ'.repeat(148)}${String(index).padStart(2, '0')}`;
    return { ...body.cart[0], quantity: 2, customizationNote, note: `ບໍ່ໃສ່ຜັກ · ${customizationNote}`, noteTh: `ไม่ใส่ผัก · ${customizationNote}` };
  });
  body.reviewedKey = checkoutReviewKey(body.table, body.cart, body.method);
  assert.equal((await request('orders', { body })).status, 200);
  assert.equal((await request('orders?table=3')).body.orders[0].items.length, 30);
});

test('cashier cannot remove a table with a newly submitted order and exact lookup survives removal', async t => {
  const { request } = await fixture(t);
  const body = requestBody(1, {}, 12);
  const { body: { orderId } } = await request('orders', { body });
  const tables = defaultTables().slice(0, -1);
  const refused = await request('sync', { body: settings([], { tables }) });
  assert.equal(refused.body.tableCount, 12);
  assert.equal(refused.body.orders[0].id, orderId);
  assert.equal((await request('menu?table=12')).status, 200);
  const identity = { id: orderId, createdAt: refused.body.orders[0].createdAt };
  await request('order-action', { body: { ...identity, action: 'reject' } });
  const removed = await request('sync', { body: settings([], { tables }) });
  assert.equal(removed.body.tableCount, 11);
  assert.equal((await request('orders?table=12')).status, 404);
  const exact = await request(`orders?table=12&requestId=${body.requestId}`);
  assert.deepEqual(exact.body, { orders: [], matchedOrder: { ...refused.body.orders[0], status: 'rejected' } });
  const other = await request(`orders?table=12&requestId=${body.requestId}`, { owner: otherGuest });
  assert.deepEqual(other.body, { orders: [], matchedOrder: null });
});

test('current guest visit retains completed receipts until a new order starts the next visit', async t => {
  const { request } = await fixture(t);
  const first = requestBody();
  await request('orders', { body: first });
  const { id, createdAt } = (await request('orders?table=3')).body.orders[0];
  await request('order-action', { body: { id, createdAt, action: 'pay', method: 'transfer' } });
  const { body: { order: sent } } = await request('order-action', { body: { id, createdAt, action: 'kitchen-sent' } });
  await request('sync', { body: settings([{ ...sent, status: 'completed', lanChangedAt: sent.lanChangedAt + 1 }]) });
  assert.equal((await request('orders?table=3')).body.orders[0].status, 'completed');
  const { body: { orderId: nextId } } = await request('orders', { body: requestBody(2) });
  const { body: { orders, matchedOrder } } = await request(`orders?table=3&requestId=${first.requestId}`);
  assert.deepEqual(orders.map(order => order.id), [nextId]);
  assert.equal(matchedOrder.id, id);
  assert.equal(matchedOrder.status, 'completed');
});

test('independent LAN servers do not lose accepted requests on their shared inbox', { timeout: 10_000 }, async t => {
  const { file, request } = await fixture(t);
  const middleware = new URL('../server/lan-pos.mjs', import.meta.url).href;
  const worker = spawn(process.execPath, ['--input-type=module', '-e', `
    import { createServer } from 'node:http';
    import { createLanPosMiddleware } from ${JSON.stringify(middleware)};
    const handle = createLanPosMiddleware({ file: process.argv[1] });
    const server = createServer((req, res) => handle(req, res, () => res.end()));
    server.listen(0, '127.0.0.1', () => console.log(server.address().port));
  `, file], { stdio: ['ignore', 'pipe', 'inherit'] });
  t.after(async () => {
    if (worker.exitCode === null && worker.signalCode === null) {
      const exited = once(worker, 'exit');
      worker.kill();
      await exited;
    }
  });
  const [port] = await once(worker.stdout, 'data');
  async function requestWorker(body) {
    const response = await fetch(`http://127.0.0.1:${Number(port)}/api/pos/orders`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Pos-Guest': otherGuest }, body: JSON.stringify(body),
    });
    return { status: response.status, body: await response.json() };
  }
  const input = requestBody();
  const cart = Array.from({ length: 30 }, () => input.cart[0]);
  input.cart = cart;
  input.reviewedKey = checkoutReviewKey(input.table, cart, input.method);
  const results = [];
  for (let index = 1; index <= 5; index++) {
    const body = { ...input, requestId: requestBody(index).requestId };
    results.push(...await Promise.all([request('orders', { body }), requestWorker(body)]));
  }
  assert.ok(results.every(result => result.status === 200));
  assert.equal(new Set(results.map(result => result.body.orderId)).size, 10);
  for (const owner of [guest, otherGuest]) {
    assert.equal((await request('orders?table=3', { owner })).body.orders.length, 5);
  }
});

test('an inbox lock left by a killed process is recovered without losing saved orders', { timeout: 10_000 }, async t => {
  const { file, request } = await fixture(t);
  const first = await request('orders', { body: requestBody() });
  assert.equal(first.status, 200);
  const lockModule = new URL('../server/lan-inbox-lock.mjs', import.meta.url).href;
  const worker = spawn(process.execPath, ['--input-type=module', '-e', `
    import { writeSync } from 'node:fs';
    import { withLanInboxLock } from ${JSON.stringify(lockModule)};
    await withLanInboxLock(process.argv[1], () => {
      writeSync(1, 'locked');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0);
    });
  `, file], { stdio: ['ignore', 'pipe', 'inherit'] });
  const exited = once(worker, 'exit');
  t.after(async () => { worker.kill('SIGKILL'); await exited; });
  const [marker] = await once(worker.stdout, 'data');
  assert.equal(String(marker), 'locked');
  worker.kill('SIGKILL');
  await exited;

  const second = await request('orders', { body: requestBody(2) });
  assert.equal(second.status, 200);
  const { body: { orders } } = await request('orders?table=3');
  assert.deepEqual(orders.map(order => order.id), [second.body.orderId, first.body.orderId]);
});

test('cashier sync rejects public hosts and origins and keeps newer paid changes', async t => {
  const api = await fixture(t);
  const { request } = api;
  assert.equal((await request('sync', { body: settings(), headers: { Host: `${networkHost}:${api.port}` } })).status, 403);
  assert.equal((await request('sync', { body: settings(), headers: { Origin: 'http://hostile.invalid' } })).status, 403);
  assert.equal((await request('menu?table=3', { headers: { Host: `hostile.invalid:${api.port}` } })).status, 403);
  assert.equal((await request('orders', { body: requestBody(), headers: { Origin: 'http://hostile.invalid' } })).status, 403);

  const { body: { orderId } } = await request('orders', { body: requestBody() });
  const first = await request('sync', { body: settings() });
  const [pending] = first.body.orders;
  assert.equal(pending.id, orderId);
  assert.equal(pending.status, 'pending');
  async function sync(order) { return (await request('sync', { body: settings([order]) })).body.orders[0]; }
  const forged = { ...pending, paid: true, status: 'queued', paidAt: pending.createdAt + 1 };
  assert.deepEqual(await sync(forged), pending);
  const identity = { id: orderId, createdAt: pending.createdAt };
  assert.equal((await request('order-action', { body: { ...identity, action: 'pay', method: 'transfer' } })).status, 200);
  const { body: { order: paid } } = await request('order-action', { body: { ...identity, action: 'kitchen-sent' } });
  const revision = paid.lanChangedAt;
  assert.equal((await sync({ ...paid, status: 'completed', lanChangedAt: revision + 2 })).status, 'completed');
  assert.equal((await sync({ ...paid, status: 'served', lanChangedAt: revision + 1 })).status, 'completed');
  assert.equal((await sync({ ...paid, status: 'served', lanChangedAt: revision + 3 })).status, 'served');
  assert.equal((await sync({ ...paid, paid: false, status: 'pending', lanChangedAt: revision + 4 })).paid, true);
  assert.equal((await sync({ ...paid, method: 'cash', lanChangedAt: revision + 4 })).method, 'transfer');
  const guestOrder = (await request('orders?table=3')).body.orders[0];
  assert.equal(guestOrder.status, 'served');
  assert.equal('lanChangedAt' in guestOrder, false);
});

test('limits new requests while accepting idempotent retries at the limit', async t => {
  const { request } = await fixture(t);
  const accepted = await request('orders', { body: requestBody() });
  for (let index = 2; index <= 5; index++) assert.equal((await request('orders', { body: requestBody(index) })).status, 200);
  assert.equal((await request('orders', { body: requestBody(6) })).status, 429);
  assert.deepEqual(await request('orders', { body: requestBody() }), accepted);
});

test('cashier event stream is private and only publishes new saved guest orders', { timeout: 5_000 }, async t => {
  const api = await fixture(t);
  const { request, openEvents } = api;
  assert.equal((await request('events', { headers: { Host: `${networkHost}:${api.port}` } })).status, 403);
  assert.equal((await request('events', { headers: { Origin: 'http://hostile.invalid' } })).status, 403);

  const stream = await openEvents();
  assert.equal(stream.statusCode, 200);
  assert.match(stream.headers['content-type'], /^text\/event-stream/);
  assert.equal(stream.headers['cache-control'], 'no-store');
  const frames = eventFrames(stream);
  assert.match((await frames.next()).value, /^:/);

  const submitted = requestBody();
  const { body: { orderId } } = await request('orders', { body: submitted });
  assert.equal((await frames.next()).value, `event: order\ndata: ${JSON.stringify({ id: orderId, table: 3 })}`);
  assert.equal((await request('sync', { body: settings() })).body.orders[0].id, orderId);
  await request('orders', { body: submitted });
  await request('orders', { body: requestBody(2, { price: 1 }) });
  const { body: { orderId: second } } = await request('orders', { body: requestBody(3) });
  assert.equal((await frames.next()).value, `event: order\ndata: ${JSON.stringify({ id: second, table: 3 })}`);
  await frames.return();
});

test('cashier payment is durable and exactly one confirmation can request a kitchen ticket', async t => {
  const api = await fixture(t);
  const { file, request, restart } = api;
  await request('orders', { body: requestBody() });
  const [pending] = (await request('orders?table=3')).body.orders;
  const { id, createdAt } = pending;
  const total = pending.items[0].price * pending.items[0].quantity;
  const pay = { id, createdAt, action: 'pay', method: 'cash', received: total };
  const act = (body, headers) => request('order-action', { body, headers });
  assert.equal((await act(pay, { Host: `${networkHost}:${api.port}` })).status, 403);
  assert.equal((await act(pay, { Origin: 'http://hostile.invalid' })).status, 403);
  assert.deepEqual((await act({ ...pay, createdAt: createdAt - 1 })).body, { code: 'changed' });
  assert.deepEqual((await act({ id, createdAt, action: 'kitchen-sent' })).body, { code: 'changed' });
  for (const received of [undefined, total - 1, total + 0.5, `${total}`]) {
    assert.deepEqual((await act({ ...pay, received })).body, { code: 'amount' });
  }
  await request('sync', { body: settings([], { settings: { methods: ['transfer'] } }) });
  assert.deepEqual((await act(pay)).body, { code: 'method' });
  await request('sync', { body: settings() });

  const confirmations = await Promise.all([act(pay), act(pay)]);
  assert.deepEqual(confirmations.map(result => result.status), [200, 200]);
  assert.deepEqual(confirmations.map(result => result.body.changed).sort(), [false, true]);
  const [{ body: { order } }] = confirmations;
  assert.equal(order.paid, true);
  assert.equal(order.status, 'queued');
  assert.equal(order.kitchenPending, true);
  assert.equal(order.paidAt >= createdAt, true);
  assert.deepEqual(JSON.parse(readFileSync(file, 'utf8')).records[0].order, order);
  assert.deepEqual((await act({ ...pay, method: 'transfer' })).body, { code: 'already-paid' });
  assert.deepEqual((await act({ id, createdAt, action: 'reject' })).body, { code: 'already-paid' });

  const stale = { ...order, status: 'served', kitchenPending: false, lanChangedAt: order.lanChangedAt + 1 };
  assert.deepEqual((await request('sync', { body: settings([stale]) })).body.orders[0], order);
  await restart();
  assert.deepEqual((await act(pay)).body, { order, changed: false });
  assert.equal((await request('orders?table=3')).body.orders[0].kitchenPending, true);

  const sent = { id, createdAt, action: 'kitchen-sent' };
  const { body: { order: printed, changed } } = await act(sent);
  assert.equal(changed, true);
  assert.equal(printed.status, 'cooking');
  assert.equal(printed.kitchenPending, false);
  assert.equal(printed.kitchenSentAt >= order.paidAt, true);
  assert.equal(printed.paidAt, order.paidAt);
  assert.equal(printed.method, 'cash');
  assert.ok(printed.lanChangedAt > order.lanChangedAt);
  assert.deepEqual((await act(sent)).body, { order: printed, changed: false });
  const served = { ...printed, status: 'served', kitchenPending: true, lanChangedAt: printed.lanChangedAt + 1 };
  const synced = (await request('sync', { body: settings([served]) })).body.orders[0];
  assert.equal(synced.status, 'served');
  assert.equal(synced.kitchenPending, false);
  const [guestOrder] = (await request('orders?table=3')).body.orders;
  assert.equal(guestOrder.kitchenSentAt, printed.kitchenSentAt);
  assert.equal(guestOrder.kitchenPending, false);
});

test('a saved legacy kitchen handoff remains recoverable after restart', async t => {
  const { file, request, restart } = await fixture(t);
  await request('orders', { body: requestBody() });
  const saved = JSON.parse(readFileSync(file, 'utf8'));
  const pending = saved.records[0].order;
  const legacy = { ...pending, status: 'queued', paid: true, paidAt: pending.createdAt + 1,
    kitchenPending: true, lanChangedAt: pending.createdAt + 1 };
  saved.records[0].order = legacy;
  writeFileSync(file, JSON.stringify(saved));
  await restart();

  const stale = { ...legacy, status: 'served', kitchenPending: false, lanChangedAt: legacy.lanChangedAt + 1 };
  assert.deepEqual((await request('sync', { body: settings([stale]) })).body.orders[0], legacy);
  const sent = { id: legacy.id, createdAt: legacy.createdAt, action: 'kitchen-sent' };
  const { body: { order, changed } } = await request('order-action', { body: sent });
  assert.equal(changed, true);
  assert.equal(order.status, 'cooking');
  assert.equal(order.kitchenPending, false);
  assert.equal(order.paidAt, legacy.paidAt);
  assert.equal(order.kitchenSentAt >= legacy.paidAt, true);
  assert.ok(order.lanChangedAt > legacy.lanChangedAt);
  await restart();
  assert.deepEqual((await request('order-action', { body: sent })).body, { order, changed: false });
  assert.equal((await request('orders?table=3')).body.orders[0].status, 'cooking');
});

test('cashier rejection stays unpaid and cannot be reversed by stale order state', async t => {
  const { request, restart } = await fixture(t);
  await request('orders', { body: requestBody() });
  const [pending] = (await request('orders?table=3')).body.orders;
  const { id, createdAt } = pending;
  const reject = { id, createdAt, action: 'reject' };
  const { body: { order, changed } } = await request('order-action', { body: reject });
  assert.equal(changed, true);
  assert.equal(order.status, 'rejected');
  assert.equal(order.paid, false);
  await restart();
  assert.deepEqual((await request('order-action', { body: reject })).body, { order, changed: false });
  const stale = { id, createdAt, paid: true, paidAt: createdAt + 1, method: 'cash', status: 'queued' };
  assert.deepEqual((await request('sync', { body: settings([stale]) })).body.orders[0], order);
  assert.deepEqual((await request('order-action', { body: { ...reject, action: 'pay', method: 'transfer' } })).body, { code: 'changed' });
  const [guestOrder] = (await request('orders?table=3')).body.orders;
  assert.equal(guestOrder.status, 'rejected');
  assert.equal(guestOrder.paid, false);
});
