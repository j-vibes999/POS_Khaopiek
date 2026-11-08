import { orderTotal, nextOrderStatus, isActiveOrder, needsKitchenHandoff } from './order-model.mjs';
import { canOpen, normalizeBackOffice, paymentMethods, resolveStaffUser } from './backoffice-model.mjs';

// Orders from before the table was last cleared belong to earlier guests.
export const customerOrders = (orders, table, clearedAt = 0) => orders.filter(order => order.table === table && (!clearedAt || order.createdAt > clearedAt));

export function summarizeCustomerOrders(orders) {
  return orders.reduce((summary, order) => {
    if (order.status === 'rejected') return summary;
    const amount = orderTotal(order.items);
    summary.total += amount;
    summary[order.paid ? 'paid' : 'due'] += amount;
    summary.itemCount += order.items.reduce((count, item) => count + item.quantity, 0);
    return summary;
  }, { total: 0, paid: 0, due: 0, itemCount: 0 });
}

export function customerCategory(item) {
  if (['khao', 'pho', 'drinks', 'other'].includes(item.category)) return item.category;
  // Orders saved before dishes carried their own category.
  return item.category === 'drinks' ? 'drinks' : ['pork', 'chicken'].includes(item.id) ? 'khao' : 'pho';
}

export function filterCustomerMenu(menu, category, search) {
  const query = search.trim().toLocaleLowerCase();
  return menu.filter(item => (category === 'all' || customerCategory(item) === category)
    && (!query || ['lo', 'th', 'en', 'zh', 'ko', 'ja'].some(lang => item[lang]?.toLocaleLowerCase().includes(query))));
}
export function menuUrlForTable(pageUrl, table, networkHost = '') {
  const url = new URL(pageUrl);
  if (networkHost && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) url.hostname = networkHost;
  url.searchParams.set('table', table);
  url.hash = 'customer';
  return url.toString();
}

// A QR link names its table; staff previews open the customer view without one.
export function tableFromSearch(search, tableCount) {
  const value = new URLSearchParams(search).get('table');
  if (value === null) return { fromQr: false, table: null };
  const table = /^\d+$/.test(value) ? Number(value) : 0;
  return { fromQr: true, table: table >= 1 && table <= tableCount ? table : null };
}

export const DEMO_STORAGE_KEY = 'khao-piek:demo:v1';
export const LAN_ORDER_ID_START = 1_000_000;
const validItems = items => Array.isArray(items) && items.every(item => item && typeof item.id === 'string'
  && Number.isFinite(item.price) && item.price >= 0 && Number.isInteger(item.quantity) && item.quantity > 0);
const validOrder = order => /^\d+$/.test(order?.id) && Number.isInteger(order.table) && validItems(order.items)
  && typeof order.paid === 'boolean' && ['pending', 'queued', 'cooking', 'ready', 'served', 'completed', 'rejected'].includes(order.status);
const validDraft = draft => validItems(draft?.cart) && ['cash', 'transfer'].includes(draft.method);

export function readDemoSession(storage) {
  try {
    const saved = JSON.parse(storage?.getItem(DEMO_STORAGE_KEY) || 'null');
    if (saved?.version !== 1 || !Array.isArray(saved.orders) || !saved.drafts || typeof saved.drafts !== 'object') return null;
    // Skip damaged entries one by one, so a single bad record cannot erase the rest of the demo.
    return {
      orders: saved.orders.filter(validOrder),
      drafts: Object.fromEntries(Object.entries(saved.drafts).filter(([table, draft]) => /^\d+$/.test(table) && validDraft(draft))),
      soldOut: Array.isArray(saved.soldOut) ? saved.soldOut.filter(id => typeof id === 'string') : [],
      clearedAt: Object.fromEntries(Object.entries(saved.clearedAt ?? {}).filter(([table, time]) => /^\d+$/.test(table) && Number.isFinite(time))),
      ...normalizeBackOffice(saved),
    };
  } catch {
    return null;
  }
}

export function restoreDemoSession(storage, initialOrders) {
  return readDemoSession(storage) ?? { orders: initialOrders, drafts: {}, soldOut: [], clearedAt: {}, ...normalizeBackOffice() };
}

export function persistDemoSession(storage, session) {
  if (!storage) throw new Error('Browser storage is unavailable');
  storage.setItem(DEMO_STORAGE_KEY, JSON.stringify({ ...session, version: 1 }));
}

// Apply each change to the newest saved copy, so a tab showing older data cannot overwrite another tab's work.
export function updateDemoSession(storage, current, change) {
  const next = change(readDemoSession(storage) ?? current);
  persistDemoSession(storage, next);
  return next;
}

// The LAN inbox owns its order numbers. Keep local edits that are newer than
// the inbox snapshot and recover any already confirmed orders after a reload.
export function mergeLanOrders(session, inbox) {
  const remote = new Map(inbox.filter(order => validOrder(order) && Number(order.id) >= LAN_ORDER_ID_START).map(order => [order.id, order]));
  let changed = false;
  const orders = session.orders.map(local => {
    const order = remote.get(local.id);
    remote.delete(local.id);
    if (!order || order.createdAt !== local.createdAt || (local.paid && !order.paid)) return local;
    if ((order.paid && !local.paid) || (order.lanChangedAt ?? 0) > (local.lanChangedAt ?? 0)) {
      changed = true;
      return order;
    }
    return local;
  });
  return changed || remote.size ? { ...session, orders: [...remote.values(), ...orders].sort((a, b) => b.createdAt - a.createdAt) } : session;
}

const stampLanOrder = (order, next, now) => Number(order.id) >= LAN_ORDER_ID_START
  ? { ...next, lanChangedAt: Math.max(now, (order.lanChangedAt ?? 0) + 1) }
  : next;

export function applyOrderAction(session, id, action, method, now = Date.now()) {
  const target = session.orders.find(order => order.id === id);
  if (!target) {
    if (action === 'pay') throw Object.assign(new Error('The order no longer exists'), { code: 'changed' });
    return session;
  }
  // A payment dialog in another tab may still show an order that has already been paid.
  if (action === 'pay' && (target.paid || target.status !== 'pending')) throw Object.assign(new Error('The order is already paid or has changed'), { code: 'already-paid' });
  const status = nextOrderStatus(target, action);
  let updated;
  if (action === 'pay') {
    updated = { ...target, status, paid: true, paidAt: now, method: method || target.method, kitchenPending: true };
  } else if (action === 'kitchen-sent' && needsKitchenHandoff(target)) {
    updated = { ...target, status: 'cooking', kitchenPending: false, kitchenSentAt: now };
  } else if (status !== target.status) {
    updated = { ...target, status };
  } else return session;
  const orders = session.orders.map(order => order.id === id ? stampLanOrder(order, updated, now) : order);
  // Closing a table's last open order clears it for the next guests.
  const cleared = action === 'close' && orders.every(order => order.table !== target.table || !isActiveOrder(order));
  if (!cleared) return { ...session, orders };
  const calls = { ...session.calls };
  delete calls[target.table];
  return { ...session, orders, clearedAt: { ...session.clearedAt, [target.table]: now }, calls };
}

// Puts one order and the table state changed by its action back after a mistaken tap.
export function undoOrderAction(session, previous, clearedAt, status, callBefore) {
  const current = session.orders.find(order => order.id === previous.id);
  // Someone has moved the order on since the tap; putting it back would erase their step.
  if (!current || (status && current.status !== status)) throw Object.assign(new Error('The order has changed'), { code: 'changed' });
  // Closed shift totals are final; a late Undo from another tab must not remove one of its payments.
  if (current.paid && !previous.paid && session.shifts?.some(shift => shift.closedAt !== undefined
    && current.paidAt >= shift.openedAt && current.paidAt <= shift.closedAt)) {
    throw Object.assign(new Error('The payment belongs to a closed shift'), { code: 'shift-closed' });
  }
  const restored = { ...session.clearedAt };
  if (clearedAt === undefined) delete restored[previous.table];
  else restored[previous.table] = clearedAt;
  // Only a last-order close clears calls; a newer request always takes precedence.
  const restoreCall = callBefore && previous.status === 'served' && current.status === 'completed'
    && session.clearedAt[previous.table] !== clearedAt && !session.calls?.[previous.table];
  return { ...session, orders: session.orders.map(order => order.id === previous.id ? stampLanOrder(order, previous, Date.now()) : order), clearedAt: restored,
    ...(restoreCall ? { calls: { ...session.calls, [previous.table]: callBefore } } : {}) };
}

// Normalize object keys so an unchanged review stays valid after storage reloads.
export function checkoutReviewKey(table, cart, effectiveMethod) {
  return JSON.stringify([table, cart, effectiveMethod], (_key, value) => value && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, value[key]])) : value);
}

export function confirmOrderPayment(session, reviewed, { userId, method, received }, now = Date.now()) {
  const fail = code => { throw Object.assign(new Error(code), { code }); };
  const actor = resolveStaffUser(session.staff, userId);
  if (!actor || !canOpen(actor.role, 'orders')) fail('access-denied');

  const order = session.orders.find(item => item.id === reviewed.id);
  if (!order || order.createdAt !== reviewed.createdAt) fail('changed');
  if (order.paid || order.status !== 'pending') fail('already-paid');
  if (checkoutReviewKey(order.table, order.items, order.method) !== checkoutReviewKey(reviewed.table, reviewed.items, reviewed.method)) fail('changed');
  if (!paymentMethods.includes(method) || !session.settings.methods.includes(method)) fail('method');

  const total = orderTotal(order.items);
  if (!Number.isSafeInteger(total) || total < 0) fail('amount');
  if (method === 'cash' && (!Number.isSafeInteger(received) || received < total)) fail('amount');
  return applyOrderAction(session, order.id, 'pay', method, now);
}

export function commitCheckout(storage, session, table, source, createdAt = Date.now(), reviewedKey) {
  if (!Number.isInteger(table)) throw new Error('Unknown table');
  const draft = session.drafts[table];
  // A basket may still hold a payment method the owner has since switched off.
  const enabled = session.settings?.methods;
  const method = enabled?.length && !enabled.includes(draft?.method) ? enabled[0] : draft?.method;
  if (reviewedKey !== undefined && reviewedKey !== checkoutReviewKey(table, draft?.cart ?? [], method)) {
    throw Object.assign(new Error('The basket changed after it was reviewed'), { code: 'cart-changed' });
  }
  if (!draft?.cart.length) throw new Error('The basket is empty');
  if (draft.cart.some(item => session.soldOut?.includes(item.id))) throw Object.assign(new Error('Sold-out dishes are in the basket'), { code: 'sold-out' });
  const nextId = session.orders.reduce((max, order) => {
    const id = Number(order.id);
    return id < LAN_ORDER_ID_START ? Math.max(id, max) : max;
  }, 1024) + 1;
  if (nextId >= LAN_ORDER_ID_START) throw new Error('Local order numbers are exhausted');
  const orderId = String(nextId);
  const order = { id: orderId, table, items: draft.cart, source, status: 'pending', paid: false, method, createdAt };
  const next = {
    ...session,
    orders: [order, ...session.orders],
    drafts: { ...session.drafts, [table]: { cart: [], method: draft.method, lastOrderId: orderId } },
  };
  // One storage write accepts the order and clears its basket together.
  persistDemoSession(storage, next);
  return { session: next, orderId };
}
