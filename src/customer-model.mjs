import { orderTotal, nextOrderStatus } from './order-model.mjs';

// Orders from before the table was last cleared belong to earlier guests.
export const customerOrders = (orders, table, clearedAt = 0) => orders.filter(order => order.table === table && (!clearedAt || order.createdAt > clearedAt));

export function summarizeCustomerOrders(orders) {
  return orders.reduce((summary, order) => {
    const amount = orderTotal(order.items);
    summary.total += amount;
    summary[order.paid ? 'paid' : 'due'] += amount;
    summary.itemCount += order.items.reduce((count, item) => count + item.quantity, 0);
    return summary;
  }, { total: 0, paid: 0, due: 0, itemCount: 0 });
}

export function customerCategory(item) {
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
const validItems = items => Array.isArray(items) && items.every(item => item && typeof item.id === 'string'
  && Number.isFinite(item.price) && item.price >= 0 && Number.isInteger(item.quantity) && item.quantity > 0);
const validOrder = order => /^\d+$/.test(order?.id) && Number.isInteger(order.table) && validItems(order.items)
  && typeof order.paid === 'boolean' && ['pending', 'queued', 'cooking', 'ready', 'served', 'completed'].includes(order.status);
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
    };
  } catch {
    return null;
  }
}

export function restoreDemoSession(storage, initialOrders) {
  return readDemoSession(storage) ?? { orders: initialOrders, drafts: {}, soldOut: [], clearedAt: {} };
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

export function applyOrderAction(session, id, action, method, now = Date.now()) {
  const target = session.orders.find(order => order.id === id);
  if (!target) return session;
  const orders = session.orders.map(order => order.id === id ? { ...order, status: nextOrderStatus(order, action), paid: action === 'pay' ? true : order.paid, method: method || order.method } : order);
  // Closing a table's last open order clears it for the next guests.
  const cleared = action === 'close' && orders.every(order => order.table !== target.table || order.status === 'completed');
  return { ...session, orders, clearedAt: cleared ? { ...session.clearedAt, [target.table]: now } : session.clearedAt };
}

export function commitCheckout(storage, session, table, source, createdAt = Date.now()) {
  if (!Number.isInteger(table)) throw new Error('Unknown table');
  const draft = session.drafts[table];
  if (!draft?.cart.length) throw new Error('The basket is empty');
  if (draft.cart.some(item => session.soldOut?.includes(item.id))) throw Object.assign(new Error('Sold-out dishes are in the basket'), { code: 'sold-out' });
  const orderId = String(Math.max(1024, ...session.orders.map(order => Number(order.id))) + 1);
  const order = { id: orderId, table, items: draft.cart, source, status: 'pending', paid: false, method: draft.method, createdAt };
  const next = {
    ...session,
    orders: [order, ...session.orders],
    drafts: { ...session.drafts, [table]: { cart: [], method: draft.method, lastOrderId: orderId } },
  };
  // One storage write accepts the order and clears its basket together.
  persistDemoSession(storage, next);
  return { session: next, orderId };
}
