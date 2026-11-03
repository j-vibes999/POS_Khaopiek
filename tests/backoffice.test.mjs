import test from 'node:test';
import assert from 'node:assert/strict';
import {
  activityLimit, addTable, canOpen, closeShift, currentShift, defaultStaff, defaultTables, logActivity, normalizeBackOffice,
  openShift, removeLastTable, roleViews, saveSettings, saveStaffMember, shiftTotals, updateTable,
  answerCall, cashSuggestions, deleteMenuItem, kitchenTotals, menuImages, paidInRange, requestCall, saveMenuItem,
} from '../src/backoffice-model.mjs';
import { applyOrderAction, customerCategory, undoOrderAction } from '../src/customer-model.mjs';
import { initialMenu } from '../src/data.js';

const owner = defaultStaff[0];
const cashier = defaultStaff[2];
const order = (id, table, method, price, status = 'pending') => ({ id, table, method, status, paid: false, createdAt: 1, items: [{ id: 'pork', price, quantity: 1 }] });

test('each role opens only its own screens, and everyone may preview the customer menu', () => {
  assert.deepEqual(roleViews.kitchen, ['kitchen']);
  assert.equal(canOpen('cashier', 'shift'), true);
  assert.equal(canOpen('cashier', 'staff'), false);
  assert.equal(canOpen('manager', 'settings'), false);
  assert.equal(canOpen('owner', 'settings'), true);
  assert.equal(canOpen('kitchen', 'customer'), true);
});

test('staff need a name and a 4-digit PIN, and the shop always keeps an active owner', () => {
  assert.throws(() => saveStaffMember(defaultStaff, { name: ' ', role: 'cashier', pin: '1234' }), { code: 'name' });
  assert.throws(() => saveStaffMember(defaultStaff, { name: 'ນ້ອຍ', role: 'cashier', pin: '12a4' }), { code: 'pin' });
  assert.throws(() => saveStaffMember(defaultStaff, { ...owner, active: false }), { code: 'last-owner' });
  assert.throws(() => saveStaffMember(defaultStaff, { ...owner, role: 'cashier' }), { code: 'last-owner' });
  const added = saveStaffMember(defaultStaff, { name: ' ນ້ອຍ ', role: 'cashier', pin: '5678' }, 1000);
  assert.equal(added.length, defaultStaff.length + 1);
  assert.deepEqual(added.at(-1), { id: 'staff-rs', name: 'ນ້ອຍ', role: 'cashier', pin: '5678', active: true });
});

test('a shift counts only payments taken while it was open and expects float plus cash', () => {
  let session = { orders: [order('1', 1, 'cash', 35000), order('2', 2, 'transfer', 45000), order('3', 3, 'cash', 20000)], shifts: [] };
  session = applyOrderAction(session, '1', 'pay', 'cash', 50);
  session = openShift(session, cashier, 200000, 100);
  assert.throws(() => openShift(session, cashier, 0, 110), { code: 'shift-open' });
  session = applyOrderAction(session, '2', 'pay', 'transfer', 150);
  session = applyOrderAction(session, '3', 'pay', 'cash', 160);
  assert.deepEqual(shiftTotals(currentShift(session.shifts), session.orders, 200), { orderCount: 2, cash: 20000, transfer: 45000, expectedCash: 220000 });
  session = closeShift(session, owner, 215000, 300);
  const closed = session.shifts[0];
  assert.equal(currentShift(session.shifts), undefined);
  assert.equal(closed.difference, -5000);
  assert.equal(closed.closedByName, owner.name);
  assert.throws(() => closeShift(session, owner, 0, 310), { code: 'no-shift' });
});

test('shift amounts must be whole, non-negative kip', () => {
  assert.throws(() => openShift({ shifts: [] }, cashier, -1), { code: 'amount' });
  assert.throws(() => openShift({ shifts: [] }, cashier, 10.5), { code: 'amount' });
});

test('tables are added at the end and only an empty last table can be removed', () => {
  const tables = defaultTables(3);
  const added = addTable(tables);
  assert.deepEqual(added.at(-1), { number: 4, seats: 4, zone: '' });
  assert.throws(() => removeLastTable(added, [order('9', 4, 'cash', 1000)]), { code: 'table-busy' });
  assert.equal(removeLastTable(added, [{ ...order('9', 4, 'cash', 1000), status: 'completed' }]).length, 3);
  assert.throws(() => removeLastTable(defaultTables(1), []), { code: 'min-tables' });
  assert.deepEqual(updateTable(tables, 2, { seats: 8, zone: ' ສວນ ' })[1], { number: 2, seats: 8, zone: 'ສວນ' });
  assert.throws(() => updateTable(tables, 2, { seats: 0 }), { code: 'seats' });
});

test('settings keep at least one payment method and trim shop details', () => {
  const settings = normalizeBackOffice().settings;
  assert.throws(() => saveSettings(settings, { methods: [] }), { code: 'methods' });
  assert.deepEqual(saveSettings(settings, { shopName: ' ເຝີແຊບ ', methods: ['cash', 'card'] }), { ...settings, shopName: 'ເຝີແຊບ', methods: ['cash'] });
});

test('the activity log keeps the newest entries within its limit', () => {
  let session = { activity: [] };
  for (let at = 1; at <= activityLimit + 5; at += 1) session = logActivity(session, { type: 'signin', by: owner.name }, at);
  assert.equal(session.activity.length, activityLimit);
  assert.equal(session.activity[0].at, activityLimit + 5);
});

test('damaged saved staff or tables fall back to safe defaults', () => {
  const restored = normalizeBackOffice({ staff: [{ ...cashier }], tables: [{ number: 2, seats: 4, zone: '' }], settings: { methods: ['card'] } });
  assert.deepEqual(restored.staff, defaultStaff);
  assert.equal(restored.tables.length, 12);
  assert.deepEqual(restored.settings.methods, ['transfer', 'cash']);
});

test('a dish needs a name, a whole price and a known category, and keeps a built-in photo', () => {
  assert.throws(() => saveMenuItem(initialMenu, { lo: ' ', price: 30000, category: 'khao' }), { code: 'name' });
  assert.throws(() => saveMenuItem(initialMenu, { lo: 'ເຝີໄກ່', price: 1.5, category: 'pho' }), { code: 'price' });
  assert.throws(() => saveMenuItem(initialMenu, { lo: 'ເຝີໄກ່', price: 30000, category: 'soup' }), { code: 'category' });
  const added = saveMenuItem(initialMenu, { lo: ' ເຝີໄກ່ ', price: 40000, category: 'pho', image: '/elsewhere.png' }, 1000);
  assert.deepEqual(added.at(-1), { id: 'dish-rs', lo: 'ເຝີໄກ່', th: 'ເຝີໄກ່', en: '', detailLo: '', detailTh: '', price: 40000, category: 'pho', image: menuImages[0], popular: false });
  const edited = saveMenuItem(added, { ...added.at(-1), price: 42000 });
  assert.equal(edited.at(-1).price, 42000);
  assert.equal(edited.length, added.length);
  assert.equal(deleteMenuItem(edited, 'dish-rs').length, initialMenu.length);
  assert.throws(() => deleteMenuItem([initialMenu[0]], initialMenu[0].id), { code: 'last-dish' });
});

test('the cashier, but not the kitchen, may open the quick order screen', () => {
  assert.equal(canOpen('cashier', 'pos'), true);
  assert.equal(canOpen('kitchen', 'pos'), false);
});

test('dishes are grouped by their own category, including older saved orders', () => {
  assert.equal(customerCategory({ id: 'x', category: 'other' }), 'other');
  assert.equal(customerCategory({ id: 'pork', category: 'noodles' }), 'khao');
  assert.equal(customerCategory({ id: 'mixed', category: 'noodles' }), 'pho');
});

test('a customer call stays until staff answer it or the table is cleared', () => {
  let session = { orders: [{ id: '1', table: 4, status: 'served', paid: true, createdAt: 1, items: [] }], calls: {}, clearedAt: {} };
  assert.throws(() => requestCall(session, 4, 'dance'), { code: 'reason' });
  session = requestCall(session, 4, 'water', 50);
  assert.deepEqual(session.calls, { 4: { reason: 'water', at: 50 } });
  assert.deepEqual(answerCall(session, 4).calls, {});
  assert.deepEqual(applyOrderAction(session, '1', 'close', undefined, 60).calls, {});
});

test('undo puts an order and its table back exactly as before', () => {
  const before = { id: '1', table: 4, status: 'served', paid: true, createdAt: 1, items: [] };
  const session = { orders: [before], clearedAt: { 4: 10 }, calls: {} };
  const closed = applyOrderAction(session, '1', 'close', undefined, 60);
  assert.equal(closed.clearedAt[4], 60);
  const undone = undoOrderAction(closed, before, session.clearedAt[4]);
  assert.deepEqual(undone.orders, [before]);
  assert.equal(undone.clearedAt[4], 10);
  assert.equal(undoOrderAction(closed, before, undefined).clearedAt[4], undefined);
});

test('undo is refused once someone else has moved the order on', () => {
  const before = { id: '1', table: 4, status: 'pending', paid: false, createdAt: 1, items: [] };
  const paid = applyOrderAction({ orders: [before], clearedAt: {}, calls: {} }, '1', 'pay', 'cash', 50);
  const started = applyOrderAction(paid, '1', 'start', undefined, 55);
  assert.equal(undoOrderAction(paid, before, undefined, 'queued').orders[0].status, 'pending');
  assert.throws(() => undoOrderAction(started, before, undefined, 'queued'), { code: 'changed' });
});

test('cash suggestions start at the exact total and offer the next round amounts', () => {
  assert.deepEqual(cashSuggestions(145000), [145000, 150000, 200000, 500000]);
  assert.deepEqual(cashSuggestions(90000), [90000, 100000, 200000, 500000]);
  assert.deepEqual(cashSuggestions(500000), [500000]);
});

test('reports count payments from today or the last 7 days in Vientiane time', () => {
  const now = Date.UTC(2026, 10, 3, 5, 0); // 12:00 in Vientiane
  const paidAt = hoursAgo => ({ paid: true, paidAt: now - hoursAgo * 3600000, createdAt: 0, items: [] });
  const orders = [paidAt(1), paidAt(13), paidAt(24 * 3), paidAt(24 * 8), { paid: false, createdAt: now, items: [] }];
  assert.equal(paidInRange(orders, 'today', now).length, 1);
  assert.equal(paidInRange(orders, 'week', now).length, 3);
  assert.equal(paidInRange(orders, 'all', now).length, 4);
});

test('kitchen totals add up each dish and size across open tickets', () => {
  const line = (id, size, quantity) => ({ id, size, quantity, price: 1 });
  const totals = kitchenTotals([{ items: [line('pork', 'regular', 2), line('tea', 'regular', 1)] }, { items: [line('pork', 'regular', 3), line('pork', 'large', 1)] }]);
  assert.deepEqual(totals.map(row => `${row.key}=${row.quantity}`), ['pork:regular=5', 'tea:regular=1', 'pork:large=1']);
});
