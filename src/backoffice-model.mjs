import { orderTotal } from './order-model.mjs';
import { initialMenu, tableCount } from './data.js';

export const roles = ['owner', 'manager', 'cashier', 'kitchen'];
// Screens each role may open, in sidebar order; a sign-in lands on the first one.
export const roleViews = {
  owner: ['tables', 'orders', 'kitchen', 'shift', 'menu', 'table-setup', 'staff', 'reports', 'settings', 'pos'],
  manager: ['tables', 'orders', 'kitchen', 'shift', 'menu', 'table-setup', 'staff', 'reports', 'pos'],
  cashier: ['tables', 'orders', 'shift', 'menu', 'pos'],
  kitchen: ['kitchen'],
};
// The customer menu is public, so every signed-in role may preview it.
export const canOpen = (role, view) => view === 'customer' || Boolean(roleViews[role]?.includes(view));

export const paymentMethods = ['transfer', 'cash'];
export const defaultSettings = { shopName: '', branch: '', phone: '', methods: paymentMethods };
// Demo accounts until real sign-in exists; PINs are listed in the README.
export const defaultStaff = [
  { id: 'owner-1', name: 'ສົມພອນ', role: 'owner', pin: '1111', active: true },
  { id: 'manager-1', name: 'ມະນີ', role: 'manager', pin: '2222', active: true },
  { id: 'cashier-1', name: 'ແສງດາວ', role: 'cashier', pin: '3333', active: true },
  { id: 'kitchen-1', name: 'ບຸນມີ', role: 'kitchen', pin: '4444', active: true },
];
// Only the first demo visit defaults to its owner; a revoked selection stays locked.
export function resolveStaffUser(staff, userId) {
  return staff.find(member => member.active && (userId ? member.id === userId : member.role === 'owner')) ?? null;
}
// An empty zone shows the translated default floor name.
export const defaultTables = (count = tableCount) => Array.from({ length: count }, (_, index) => ({ number: index + 1, seats: (index + 1) % 3 === 0 ? 6 : 4, zone: '' }));
export const maxTables = 60;
export const menuCategories = ['khao', 'pho', 'drinks', 'other'];
// Built-in photos until uploads arrive with the server.
export const menuImages = ['/images/khao-piak.jpg', '/images/pho.jpg', '/images/noodles.jpg', '/images/soup.jpg', '/images/coffee.jpg', '/images/drink.jpg'];
export const callReasons = ['help', 'pay', 'water'];
export const activityLimit = 300;

const fail = code => Object.assign(new Error(code), { code });
const validAmount = amount => Number.isInteger(amount) && amount >= 0 && amount <= 1e10;
const hasOwner = staff => staff.some(member => member.active && member.role === 'owner');
const validMember = member => typeof member?.id === 'string' && typeof member.name === 'string' && member.name.trim().length > 0
  && roles.includes(member.role) && /^\d{4}$/.test(member.pin) && typeof member.active === 'boolean';
const validShift = shift => typeof shift?.id === 'string' && Number.isFinite(shift.openedAt) && validAmount(shift.openingCash)
  && typeof shift.openedByName === 'string' && (shift.closedAt === undefined || Number.isFinite(shift.closedAt));
const validTables = tables => Array.isArray(tables) && tables.length >= 1 && tables.length <= maxTables
  && tables.every((table, index) => table?.number === index + 1 && Number.isInteger(table.seats) && table.seats >= 1 && table.seats <= 30
    && typeof table.zone === 'string' && table.zone.length <= 24);
const validMenuItem = item => typeof item?.id === 'string' && typeof item.lo === 'string' && item.lo.trim().length > 0
  && Number.isFinite(item.price) && item.price >= 0 && menuCategories.includes(item.category) && typeof item.image === 'string';
const text = (value, limit) => typeof value === 'string' && value.trim().length <= limit ? value.trim() : '';

export function normalizeBackOffice(saved = {}) {
  const staff = Array.isArray(saved.staff) ? saved.staff.filter(validMember) : [];
  const methods = Array.isArray(saved.settings?.methods) ? paymentMethods.filter(method => saved.settings.methods.includes(method)) : [];
  return {
    staff: hasOwner(staff) ? staff : defaultStaff,
    shifts: Array.isArray(saved.shifts) ? saved.shifts.filter(validShift) : [],
    tables: validTables(saved.tables) ? saved.tables : defaultTables(),
    settings: {
      shopName: text(saved.settings?.shopName, 40), branch: text(saved.settings?.branch, 40), phone: text(saved.settings?.phone, 30),
      methods: methods.length ? methods : paymentMethods,
    },
    menu: Array.isArray(saved.menu) && saved.menu.length > 0 && saved.menu.every(validMenuItem) ? saved.menu : initialMenu,
    calls: Object.fromEntries(Object.entries(saved.calls ?? {}).filter(([table, call]) => /^\d+$/.test(table) && callReasons.includes(call?.reason) && Number.isFinite(call.at))),
    activity: Array.isArray(saved.activity) ? saved.activity.filter(entry => typeof entry?.type === 'string' && Number.isFinite(entry.at)).slice(0, activityLimit) : [],
  };
}

export function logActivity(session, entry, now = Date.now()) {
  const activity = session.activity ?? [];
  return { ...session, activity: [{ id: `${now}-${Math.random().toString(36).slice(2, 7)}`, at: now, ...entry }, ...activity].slice(0, activityLimit) };
}

export function saveStaffMember(staff, member, now = Date.now()) {
  const name = String(member.name ?? '').trim();
  if (!name || name.length > 40) throw fail('name');
  if (!roles.includes(member.role)) throw fail('role');
  if (!/^\d{4}$/.test(member.pin ?? '')) throw fail('pin');
  const saved = { id: member.id || `staff-${now.toString(36)}`, name, role: member.role, pin: member.pin, active: member.active !== false };
  const next = staff.some(item => item.id === saved.id) ? staff.map(item => item.id === saved.id ? saved : item) : [...staff, saved];
  if (!hasOwner(next)) throw fail('last-owner');
  return next;
}

export const currentShift = shifts => shifts.find(shift => !shift.closedAt);

export function shiftTotals(shift, orders, now = Date.now()) {
  const end = shift.closedAt ?? now;
  const paid = orders.filter(order => order.paid && order.paidAt >= shift.openedAt && order.paidAt <= end);
  const total = method => paid.filter(order => order.method === method).reduce((sum, order) => sum + orderTotal(order.items), 0);
  const cash = total('cash');
  return { orderCount: paid.length, cash, transfer: total('transfer'), expectedCash: shift.openingCash + cash };
}

export function openShift(session, member, openingCash, now = Date.now()) {
  if (currentShift(session.shifts)) throw fail('shift-open');
  if (!validAmount(openingCash)) throw fail('amount');
  const shift = { id: String(now), openedAt: now, openedBy: member.id, openedByName: member.name, openingCash };
  return { ...session, shifts: [shift, ...session.shifts].slice(0, 200) };
}

export function closeShift(session, member, countedCash, now = Date.now()) {
  const shift = currentShift(session.shifts);
  if (!shift) throw fail('no-shift');
  if (!validAmount(countedCash)) throw fail('amount');
  const totals = shiftTotals(shift, session.orders, now);
  // Keep the totals with the shift, so later edits cannot change a closed count.
  const closed = { ...shift, closedAt: now, closedBy: member.id, closedByName: member.name, countedCash, cashSales: totals.cash,
    transferSales: totals.transfer, orderCount: totals.orderCount, expectedCash: totals.expectedCash, difference: countedCash - totals.expectedCash };
  return { ...session, shifts: session.shifts.map(item => item.id === shift.id ? closed : item) };
}

export function addTable(tables) {
  if (tables.length >= maxTables) throw fail('max-tables');
  return [...tables, { number: tables.length + 1, seats: 4, zone: tables[tables.length - 1]?.zone ?? '' }];
}

export function removeLastTable(tables, orders) {
  if (tables.length <= 1) throw fail('min-tables');
  const last = tables[tables.length - 1].number;
  if (orders.some(order => order.table === last && order.status !== 'completed')) throw fail('table-busy');
  return tables.slice(0, -1);
}

export function updateTable(tables, number, changes) {
  const table = tables.find(item => item.number === number);
  if (!table) throw fail('table');
  const seats = changes.seats ?? table.seats;
  const zone = String(changes.zone ?? table.zone).trim();
  if (!Number.isInteger(seats) || seats < 1 || seats > 30) throw fail('seats');
  if (zone.length > 24) throw fail('zone');
  return tables.map(item => item.number === number ? { ...item, seats, zone } : item);
}

export function saveSettings(settings, changes) {
  const next = { ...settings, ...changes };
  for (const [field, limit] of [['shopName', 40], ['branch', 40], ['phone', 30]]) {
    next[field] = String(next[field] ?? '').trim();
    if (next[field].length > limit) throw fail(field);
  }
  next.methods = paymentMethods.filter(method => next.methods?.includes(method));
  if (!next.methods.length) throw fail('methods');
  return next;
}

export function saveMenuItem(menu, item, now = Date.now()) {
  const field = (name, limit, code = name) => { const value = String(item[name] ?? '').trim(); if (value.length > limit) throw fail(code); return value; };
  const lo = field('lo', 40, 'name');
  if (!lo) throw fail('name');
  const price = Number(item.price);
  if (!Number.isInteger(price) || price < 0 || price > 10000000) throw fail('price');
  if (!menuCategories.includes(item.category)) throw fail('category');
  const saved = {
    id: item.id || `dish-${now.toString(36)}`, lo, th: field('th', 40, 'name') || lo, en: field('en', 40, 'name'),
    detailLo: field('detailLo', 120, 'detail'), detailTh: field('detailTh', 120, 'detail'), price, category: item.category,
    image: menuImages.includes(item.image) ? item.image : menuImages[0], popular: Boolean(item.popular),
  };
  return menu.some(dish => dish.id === saved.id) ? menu.map(dish => dish.id === saved.id ? { ...dish, ...saved } : dish) : [...menu, saved];
}

export function deleteMenuItem(menu, id) {
  if (menu.length <= 1) throw fail('last-dish');
  return menu.filter(dish => dish.id !== id);
}

export function requestCall(session, table, reason, now = Date.now()) {
  if (!Number.isInteger(table)) throw fail('table');
  if (!callReasons.includes(reason)) throw fail('reason');
  return { ...session, calls: { ...session.calls, [table]: { reason, at: now } } };
}

export function answerCall(session, table) {
  const calls = { ...session.calls };
  delete calls[table];
  return { ...session, calls };
}

// Amounts a customer is likely to hand over: the exact total, then the next round notes.
export function cashSuggestions(total) {
  const rounded = [10000, 50000, 100000].map(step => Math.ceil(total / step) * step);
  const notes = [100000, 200000, 500000].filter(note => note > total);
  return [...new Set([total, ...rounded, ...notes])].filter(amount => amount >= total).sort((a, b) => a - b).slice(0, 4);
}

const day = 86400000;
// Laos keeps UTC+7 all year, so a shop day starts at midnight Vientiane time.
const startOfDay = time => Math.floor((time + 7 * 3600000) / day) * day - 7 * 3600000;
export function paidInRange(orders, range, now = Date.now()) {
  const paid = orders.filter(order => order.paid);
  if (range === 'all') return paid;
  const start = startOfDay(now) - (range === 'week' ? 6 * day : 0);
  return paid.filter(order => (order.paidAt ?? order.createdAt) >= start);
}

// How many of each dish the kitchen still has to cook across its open tickets.
export function kitchenTotals(orders) {
  const rows = new Map();
  for (const order of orders) {
    for (const item of order.items) {
      const key = `${item.id}:${item.size ?? 'regular'}`;
      const row = rows.get(key) ?? { key, item, size: item.size ?? 'regular', quantity: 0 };
      row.quantity += item.quantity;
      rows.set(key, row);
    }
  }
  return [...rows.values()].sort((a, b) => b.quantity - a.quantity);
}
