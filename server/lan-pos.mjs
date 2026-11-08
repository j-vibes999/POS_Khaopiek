import { createHash, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { defaultSettings, defaultTables, menuCategories, menuImages, maxTables, paymentMethods } from '../src/backoffice-model.mjs';
import { checkoutReviewKey, LAN_ORDER_ID_START } from '../src/customer-model.mjs';
import { initialMenu } from '../src/data.js';
import { isActiveOrder, menuQuoteIdentity, orderTotal, quotedItemPrice } from '../src/order-model.mjs';
import { withLanInboxLock } from './lan-inbox-lock.mjs';

const token = /^[a-f0-9]{48}$/;
const statusRank = { pending: 0, queued: 1, cooking: 2, ready: 3, served: 4, completed: 5 };
const menuTextFields = ['lo', 'th', 'en', 'zh', 'ko', 'ja', 'detailLo', 'detailTh'];
const loopbackHosts = ['localhost', '127.0.0.1', '[::1]'];
const maxGuestBody = 512 * 1024;
const maxSyncBody = 1024 * 1024;

function fail(status, code) {
  throw Object.assign(new Error(code), { status, code });
}

function respond(res, status, payload) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(payload));
}

function writeEventFrame(stream, frame) {
  if (!stream.destroyed && !stream.writableEnded && !stream.write(frame)) stream.destroy();
}

function openOrderEvents(res, listeners) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  listeners.add(res);
  const heartbeat = setInterval(() => writeEventFrame(res, ': heartbeat\n\n'), 15_000);
  heartbeat.unref();
  res.once('close', () => {
    clearInterval(heartbeat);
    listeners.delete(res);
  });
  writeEventFrame(res, ': connected\n\n');
}

function hostsFor(port, networkHost) {
  const names = networkHost ? [...loopbackHosts, networkHost] : loopbackHosts;
  return names.map(host => `${host}${port === 80 ? '' : `:${port}`}`);
}

function requireAllowedRequest(req, networkHost, port, cashierOnly) {
  const host = req.headers.host;
  const allowed = hostsFor(port, cashierOnly ? '' : networkHost);
  if (!allowed.includes(host)) fail(403, 'access-denied');
  if (cashierOnly && !['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) fail(403, 'access-denied');
  const origin = req.headers.origin;
  if ((cashierOnly || req.method === 'POST') && origin !== undefined && origin !== `http${req.socket.encrypted ? 's' : ''}://${host}`) fail(403, 'access-denied');
}

function readJson(req, limit) {
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] ?? '')) fail(415, 'invalid-order');
  if (Number(req.headers['content-length']) > limit) fail(413, 'invalid-order');
  return new Promise((resolve, reject) => {
    let length = 0;
    const chunks = [];
    req.on('data', chunk => {
      length += chunk.length;
      if (length > limit) {
        chunks.length = 0;
        reject(Object.assign(new Error('Request too large'), { status: 413, code: 'invalid-order' }));
      } else chunks.push(chunk);
    });
    req.once('end', () => {
      try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch { reject(Object.assign(new Error('Invalid JSON'), { status: 400, code: 'invalid-order' })); }
    });
    req.once('error', reject);
  });
}

function initialState() {
  return {
    version: 1, nextId: LAN_ORDER_ID_START, menu: initialMenu, soldOut: [],
    settings: { shopName: defaultSettings.shopName, methods: defaultSettings.methods },
    tables: defaultTables().map(table => table.number), records: [],
  };
}

function loadState(file) {
  try {
    const saved = JSON.parse(readFileSync(file, 'utf8'));
    if (saved.version !== 1 || !Number.isSafeInteger(saved.nextId) || saved.nextId < LAN_ORDER_ID_START
      || !Array.isArray(saved.records) || !Array.isArray(saved.menu) || !Array.isArray(saved.soldOut)
      || !Array.isArray(saved.tables) || !Array.isArray(saved.settings?.methods)) throw new Error('Invalid inbox data');
    return saved;
  } catch (error) {
    if (error.code === 'ENOENT') return initialState();
    throw error;
  }
}

function saveState(file, state) {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    writeFileSync(temporary, JSON.stringify(state), { flag: 'wx', mode: 0o600, flush: true });
    renameSync(temporary, file);
  } finally { rmSync(temporary, { force: true }); }
}

function menuForGuest(state) {
  return state.menu.map(item => ({ ...item, available: !state.soldOut.includes(item.id) }));
}

function requireTable(state, value) {
  if (!Number.isInteger(value) || !state.tables.includes(value)) fail(404, 'invalid-table');
  return value;
}

function publicOrder({ lanChangedAt, ...order }) { return order; }

function guestOrders(state, guest, table, requestId) {
  if (requestId !== null) {
    if (!token.test(requestId)) fail(400, 'invalid-order');
    if (!Number.isInteger(table) || table < 1 || table > maxTables) fail(404, 'invalid-table');
  } else requireTable(state, table);

  const tableRecords = state.records.filter(record => record.order.table === table);
  const visitId = tableRecords.at(-1)?.visitId ?? null;
  const own = tableRecords.filter(record => record.guest === guest);
  const orders = state.tables.includes(table)
    ? own.filter(record => (record.visitId ?? null) === visitId).map(record => publicOrder(record.order)).reverse()
    : [];
  if (requestId === null) return { orders };
  const matched = own.find(record => record.requestId === requestId);
  return { orders, matchedOrder: matched ? publicOrder(matched.order) : null };
}

function guestFrom(req) {
  const guest = req.headers['x-pos-guest'];
  if (typeof guest !== 'string' || !token.test(guest)) fail(400, 'invalid-order');
  return guest;
}

function safeMenuItem(item) {
  if (!item || typeof item.id !== 'string' || !/^[\w-]{1,100}$/.test(item.id)
    || typeof item.lo !== 'string' || !item.lo.trim() || !menuCategories.includes(item.category)
    || !Number.isSafeInteger(item.price) || item.price < 0 || item.price > 10_000_000) fail(400, 'invalid-sync');
  const names = Object.fromEntries(menuTextFields.filter(field => typeof item[field] === 'string')
    .map(field => [field, item[field].slice(0, 120)]));
  return {
    id: item.id, ...names, category: item.category, price: item.price,
    image: menuImages.includes(item.image) ? item.image : menuImages[0], popular: Boolean(item.popular),
  };
}

function isFlatCart(cart) {
  return Array.isArray(cart) && cart.length >= 1 && cart.length <= 30
    && cart.every(item => item && typeof item === 'object' && !Array.isArray(item)
      && Object.values(item).every(value => value === null || ['string', 'number', 'boolean'].includes(typeof value)));
}

const reviewDigest = key => createHash('sha256').update(key).digest('hex');

function checkedCart(state, body) {
  const { cart, method, table, reviewedKey } = body;
  if (!state.settings.methods.includes(method)) fail(409, 'cart-changed');
  if (!isFlatCart(cart)) fail(400, 'invalid-order');
  if (typeof reviewedKey !== 'string' || checkoutReviewKey(table, cart, method) !== reviewedKey) fail(409, 'cart-changed');

  let quantity = 0;
  const rows = cart.map((item, index) => {
    const dish = state.menu.find(candidate => candidate.id === item.id);
    if (!dish || state.soldOut.includes(item.id)) fail(409, 'sold-out');
    if (menuQuoteIdentity(item) !== menuQuoteIdentity(dish)) fail(409, 'cart-changed');
    if (!Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 30
      || !['regular', 'large'].includes(item.size)
      || (item.noHerbs !== undefined && typeof item.noHerbs !== 'boolean')
      || (dish.category === 'drinks' && (item.size !== 'regular' || item.noHerbs))) fail(400, 'invalid-order');
    const rawNote = item.customizationNote ?? '';
    if (typeof rawNote !== 'string' || rawNote.length > 150) fail(400, 'invalid-order');
    const customizationNote = rawNote.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, '').trim();
    const price = quotedItemPrice(dish, item.size);
    if (item.price !== price) fail(409, 'cart-changed');
    const noHerbs = Boolean(item.noHerbs);
    quantity += item.quantity;
    return {
      ...dish, key: `${dish.id}-${index}`, size: item.size, price, quantity: item.quantity, noHerbs, customizationNote,
      note: [noHerbs ? 'ບໍ່ໃສ່ຜັກ' : '', customizationNote].filter(Boolean).join(' · '),
      noteTh: [noHerbs ? 'ไม่ใส่ผัก' : '', customizationNote].filter(Boolean).join(' · '),
    };
  });
  if (quantity > 60) fail(400, 'invalid-order');
  return rows;
}

function addGuestOrder(state, guest, ip, body) {
  if (typeof body?.requestId !== 'string' || !token.test(body.requestId)) fail(400, 'invalid-order');
  const duplicate = state.records.find(record => record.guest === guest && record.requestId === body.requestId);
  if (duplicate) {
    // Older inbox records lack the digest and can still be recovered by their original request ID.
    if (duplicate.reviewDigest && (typeof body.reviewedKey !== 'string' || reviewDigest(body.reviewedKey) !== duplicate.reviewDigest
      || !Number.isInteger(body.table) || !paymentMethods.includes(body.method) || !isFlatCart(body.cart)
      || checkoutReviewKey(body.table, body.cart, body.method) !== body.reviewedKey)) fail(409, 'cart-changed');
    return { orderId: duplicate.order.id };
  }

  const table = requireTable(state, body.table);
  const now = Date.now();
  const recent = state.records.filter(record => now - record.order.createdAt < 60_000);
  if (recent.length >= 60 || recent.filter(record => record.guest === guest).length >= 5
    || recent.filter(record => record.order.table === table).length >= 12
    || recent.filter(record => record.ip === ip).length >= 20) fail(429, 'rate-limited');

  const items = checkedCart(state, body);
  const orderId = String(state.nextId);
  const order = { id: orderId, table, items, source: 'qr', status: 'pending', paid: false, method: body.method, createdAt: now };
  const tableRecords = state.records.filter(record => record.order.table === table);
  const lastVisit = tableRecords.at(-1)?.visitId ?? null;
  // The last completed visit stays visible until a new order starts the next one.
  const visitId = tableRecords.some(record => (record.visitId ?? null) === lastVisit && isActiveOrder(record.order)) ? lastVisit : orderId;
  const record = { guest, requestId: body.requestId, ip, order, visitId, reviewDigest: reviewDigest(body.reviewedKey) };
  return { orderId, table, next: { ...state, nextId: state.nextId + 1, records: [...state.records, record] } };
}

function syncOrder(order, update) {
  if (!order.paid || order.kitchenPending || !update || update.paid !== true
    || !Object.hasOwn(statusRank, update.status) || update.status === 'pending'
    || (update.createdAt !== undefined && update.createdAt !== order.createdAt)) return order;

  if (update.method !== order.method || update.paidAt !== order.paidAt) return order;
  const dated = Number.isSafeInteger(update.lanChangedAt);
  if (dated && update.lanChangedAt <= (order.lanChangedAt ?? order.paidAt)) return order;
  if (!dated && (order.lanChangedAt > order.paidAt || statusRank[update.status] <= statusRank[order.status])) return order;
  return { ...order, status: update.status, ...(dated && { lanChangedAt: update.lanChangedAt }) };
}

function applyCashierAction(order, { action, method, received }, methods) {
  const now = Math.max(Date.now(), order.createdAt, order.paidAt ?? 0);
  const lanChangedAt = Math.max(now, (order.lanChangedAt ?? 0) + 1);

  if (action === 'kitchen-sent') {
    if (!order.paid) fail(409, 'changed');
    if (!order.kitchenPending) return order;
    return { ...order, status: 'cooking', kitchenPending: false, kitchenSentAt: now, lanChangedAt };
  }

  if (action === 'reject') {
    if (order.status === 'rejected') return order;
    if (order.paid) fail(409, 'already-paid');
    if (order.status !== 'pending') fail(409, 'changed');
    return { ...order, status: 'rejected', lanChangedAt };
  }

  if (order.paid) {
    if (order.method !== method) fail(409, 'already-paid');
    return order;
  }
  if (order.status !== 'pending') fail(409, 'changed');
  if (!methods.includes(method)) fail(400, 'method');
  const total = orderTotal(order.items);
  if (!Number.isSafeInteger(total) || total < 0
    || (method === 'cash' && (!Number.isSafeInteger(received) || received < total))) fail(400, 'amount');
  return { ...order, status: 'queued', paid: true, method, paidAt: now, kitchenPending: true, lanChangedAt };
}

function actOnOrder(state, body) {
  if (typeof body?.id !== 'string' || !Number.isSafeInteger(body.createdAt)
    || !['pay', 'reject', 'kitchen-sent'].includes(body.action)) fail(400, 'invalid-request');
  const index = state.records.findIndex(record => record.order.id === body.id && record.order.createdAt === body.createdAt);
  if (index === -1) fail(409, 'changed');
  const current = state.records[index];
  const order = applyCashierAction(current.order, body, state.settings.methods);
  if (order === current.order) return { order, changed: false };
  const records = state.records.slice();
  records[index] = { ...current, order };
  return { order, changed: true, next: { ...state, records } };
}

function syncFromCashier(state, body) {
  if (!Array.isArray(body?.menu) || !body.menu.length || body.menu.length > 500 || !Array.isArray(body.soldOut)
    || !Array.isArray(body.tables) || !body.tables.length || body.tables.length > maxTables
    || !Array.isArray(body.settings?.methods) || !Array.isArray(body.orders)) fail(400, 'invalid-sync');
  const menu = body.menu.map(safeMenuItem);
  const ids = new Set(menu.map(item => item.id));
  if (ids.size !== menu.length) fail(400, 'invalid-sync');
  const tables = body.tables.map(table => table?.number);
  if (!tables.every((number, index) => number === index + 1)) fail(400, 'invalid-sync');
  const methods = paymentMethods.filter(method => body.settings.methods.includes(method));
  if (!methods.length) fail(400, 'invalid-sync');
  const shopName = typeof body.settings.shopName === 'string' ? body.settings.shopName.trim().slice(0, 40) : '';
  const updates = new Map(body.orders.filter(order => typeof order?.id === 'string').map(order => [order.id, order]));
  const records = state.records.map(record => ({ ...record, order: syncOrder(record.order, updates.get(record.order.id)) }));
  const tableCount = records.reduce((count, { order }) => isActiveOrder(order) ? Math.max(count, order.table) : count, tables.length);
  return {
    ...state, menu, tables: Array.from({ length: tableCount }, (_, index) => index + 1), settings: { shopName, methods },
    soldOut: [...new Set(body.soldOut.filter(id => ids.has(id)))], records,
  };
}

export function createLanPosMiddleware({ file, networkHost = '', port }) {
  const orderListeners = new Set();
  return async function lanPos(req, res, next) {
    if (!req.url?.startsWith('/api/pos/')) return next();

    try {
      const url = new URL(req.url, 'http://localhost');
      const isSync = url.pathname === '/api/pos/sync';
      const isAction = url.pathname === '/api/pos/order-action';
      const isEvents = url.pathname === '/api/pos/events';
      const cashierOnly = isSync || isAction || isEvents;
      requireAllowedRequest(req, networkHost, req.socket.localPort ?? port, cashierOnly);

      if (isEvents && req.method === 'GET') {
        const fetchSite = req.headers['sec-fetch-site'];
        if (fetchSite !== undefined && !['same-origin', 'none'].includes(fetchSite)) fail(403, 'access-denied');
        return openOrderEvents(res, orderListeners);
      }

      if (url.pathname === '/api/pos/menu' && req.method === 'GET') {
        const state = loadState(file);
        const table = requireTable(state, Number(url.searchParams.get('table')));
        return respond(res, 200, { menu: menuForGuest(state), ...state.settings, table });
      }

      if (url.pathname === '/api/pos/orders' && req.method === 'GET') {
        const guest = guestFrom(req);
        const state = loadState(file);
        const table = Number(url.searchParams.get('table'));
        return respond(res, 200, guestOrders(state, guest, table, url.searchParams.get('requestId')));
      }

      if (url.pathname === '/api/pos/orders' && req.method === 'POST') {
        const guest = guestFrom(req);
        const body = await readJson(req, maxGuestBody);
        const result = await withLanInboxLock(file, () => {
          const result = addGuestOrder(loadState(file), guest, req.socket.remoteAddress, body);
          if (result.next) saveState(file, result.next);
          return result;
        });
        if (result.next) {
          const frame = `event: order\ndata: ${JSON.stringify({ id: result.orderId, table: result.table })}\n\n`;
          for (const stream of orderListeners) writeEventFrame(stream, frame);
        }
        return respond(res, 200, { orderId: result.orderId });
      }

      if (isAction && req.method === 'POST') {
        const body = await readJson(req, 4096);
        const result = await withLanInboxLock(file, () => {
          const { order, changed, next } = actOnOrder(loadState(file), body);
          if (next) saveState(file, next);
          return { order, changed };
        });
        return respond(res, 200, result);
      }

      if (isSync && req.method === 'POST') {
        const body = await readJson(req, maxSyncBody);
        const result = await withLanInboxLock(file, () => {
          const state = loadState(file);
          const updated = syncFromCashier(state, body);
          if (JSON.stringify(updated) !== JSON.stringify(state)) saveState(file, updated);
          return { orders: updated.records.map(record => record.order).reverse(), tableCount: updated.tables.length };
        });
        return respond(res, 200, result);
      }

      return respond(res, 404, { code: 'not-found' });
    } catch (error) {
      if (!res.writableEnded && !res.destroyed) respond(res, error.status ?? 503, { code: error.status ? error.code : 'storage-unavailable' });
    }
  };
}
