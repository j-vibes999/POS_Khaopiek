import test from 'node:test';
import assert from 'node:assert/strict';
import { commitCheckout, restoreDemoSession, persistDemoSession, updateDemoSession } from '../src/customer-model.mjs';

const item = { id: 'pork', key: 'pork-1', size: 'regular', price: 35000, quantity: 2, note: '' };
const state = () => ({ orders: [], drafts: { 3: { cart: [item], method: 'cash' }, 7: { cart: [{ ...item, quantity: 1 }], method: 'transfer' } } });
function storage() {
  const values = new Map();
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}

test('checkout saves the order before clearing its table basket, and both survive a reload', () => {
  const browser = storage();
  const result = commitCheckout(browser, state(), 3, 'qr', 123456);
  const restored = restoreDemoSession(browser, []);
  assert.equal(restored.orders.length, 1);
  assert.equal(restored.orders[0].id, result.orderId);
  assert.equal(restored.orders[0].items[0].quantity, 2);
  assert.equal(restored.orders[0].paid, false);
  assert.equal(restored.orders[0].status, 'pending');
  assert.deepEqual(restored.drafts[3].cart, []);
  assert.equal(restored.drafts[3].lastOrderId, result.orderId);
  assert.equal(restored.drafts[7].cart.length, 1);
});

test('failed storage keeps the basket and does not accept an order', () => {
  const current = state();
  const blockedStorage = { setItem() { throw new Error('Storage full'); } };
  assert.throws(() => commitCheckout(blockedStorage, current, 3, 'qr', 123456), /Storage full/);
  assert.equal(current.drafts[3].cart[0].quantity, 2);
  assert.equal(current.orders.length, 0);
});

test('submitting the cleared basket again cannot create a duplicate order', () => {
  const browser = storage();
  const result = commitCheckout(browser, state(), 3, 'qr', 123456);
  assert.throws(() => commitCheckout(browser, result.session, 3, 'qr', 123457), /empty/i);
  assert.equal(restoreDemoSession(browser, []).orders.length, 1);
});

test('draft choices survive a reload before checkout', () => {
  const browser = storage();
  persistDemoSession(browser, state());
  assert.deepEqual(restoreDemoSession(browser, []).drafts[3], { cart: [item], method: 'cash' });
});

test('invalid saved data falls back to the demo without crashing', () => {
  const initial = [{ id: '1024' }];
  for (const saved of ['{broken', JSON.stringify({ version: 1, orders: 'invalid', drafts: {} })]) {
    const restored = restoreDemoSession({ getItem: () => saved }, initial);
    assert.deepEqual({ orders: restored.orders, drafts: restored.drafts, soldOut: restored.soldOut, clearedAt: restored.clearedAt }, { orders: initial, drafts: {}, soldOut: [], clearedAt: {} });
    assert.equal(restored.staff.length, 4);
    assert.equal(restored.tables.length, 12);
  }
});

test('checkout falls back to an enabled payment method when the basket holds a switched-off one', () => {
  const browser = storage();
  const result = commitCheckout(browser, { ...state(), settings: { methods: ['transfer'] } }, 3, 'qr', 123456);
  assert.equal(result.session.orders[0].method, 'transfer');
  assert.deepEqual(result.session.settings, { methods: ['transfer'] });
});

test('one damaged saved order is skipped without discarding the rest of the demo', () => {
  const browser = storage();
  persistDemoSession(browser, { orders: [
    { id: '1025', table: 2.5, status: 'pending', paid: false, items: [item] },
    { id: '1024', table: 3, status: 'pending', paid: false, items: [item] },
  ], drafts: { 3: { cart: [item], method: 'cash' } } });
  const restored = restoreDemoSession(browser, [{ id: 'demo' }]);
  assert.deepEqual(restored.orders.map(order => order.id), ['1024']);
  assert.equal(restored.drafts[3].cart.length, 1);
});

test('a tab holding older data cannot erase an order saved by another tab', () => {
  const browser = storage();
  persistDemoSession(browser, state());
  const cashierTab = restoreDemoSession(browser, []);
  commitCheckout(browser, restoreDemoSession(browser, []), 3, 'qr', 123456);
  updateDemoSession(browser, cashierTab, session => ({ ...session, soldOut: ['tea'] }));
  const saved = restoreDemoSession(browser, []);
  assert.equal(saved.orders.length, 1);
  assert.deepEqual(saved.soldOut, ['tea']);
});

test('checkout refuses a basket holding a sold-out dish and keeps the basket', () => {
  const browser = storage();
  const current = { ...state(), soldOut: ['pork'] };
  assert.throws(() => commitCheckout(browser, current, 3, 'qr', 123456), error => error.code === 'sold-out');
  assert.equal(current.drafts[3].cart.length, 1);
  assert.equal(restoreDemoSession(browser, []).orders.length, 0);
});

test('checkout only accepts whole table numbers', () => {
  const current = { orders: [], drafts: { 2.5: { cart: [item], method: 'cash' } } };
  assert.throws(() => commitCheckout(storage(), current, 2.5, 'qr', 123456), /table/i);
});
