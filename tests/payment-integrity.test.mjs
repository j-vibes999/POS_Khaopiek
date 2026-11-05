import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOrderAction, undoOrderAction } from '../src/customer-model.mjs';
import { closeShift, defaultStaff, openShift } from '../src/backoffice-model.mjs';

const pendingOrder = () => ({
  id: '1025', table: 3, createdAt: 1, status: 'pending', paid: false, method: 'transfer',
  items: [{ id: 'pork', price: 35000, quantity: 1 }],
});
const sessionFor = order => ({ orders: [order], shifts: [], clearedAt: {}, calls: {} });

test('a stale payment cannot change the method or payment time of an already paid order', () => {
  const paid = applyOrderAction(sessionFor(pendingOrder()), '1025', 'pay', 'transfer', 200);
  assert.throws(() => applyOrderAction(paid, '1025', 'pay', 'cash', 300), { code: 'already-paid' });
  assert.equal(paid.orders[0].method, 'transfer');
  assert.equal(paid.orders[0].paidAt, 200);
  assert.equal(paid.orders[0].status, 'queued');
});

test('payment is refused unless the latest order is both pending and unpaid', () => {
  for (const order of [
    { ...pendingOrder(), paid: true },
    { ...pendingOrder(), status: 'queued' },
    { ...pendingOrder(), status: 'completed', paid: true },
  ]) {
    assert.throws(() => applyOrderAction(sessionFor(order), '1025', 'pay', 'cash', 300), { code: 'already-paid' });
  }
});

test('a stale payment is rejected when the order no longer exists after a reset', () => {
  const session = { orders: [], shifts: [], clearedAt: {}, calls: {} };
  assert.throws(() => applyOrderAction(session, '1025', 'pay', 'cash', 300), { code: 'changed' });
  assert.deepEqual(session.orders, []);
});

test('payment undo cannot remove sales from a shift that another cashier has closed', () => {
  const previous = pendingOrder();
  let session = openShift(sessionFor(previous), defaultStaff[2], 200000, 100);
  session = applyOrderAction(session, '1025', 'pay', 'cash', 200);
  session = closeShift(session, defaultStaff[0], 235000, 300);

  assert.throws(() => undoOrderAction(session, previous, undefined, 'queued'), { code: 'shift-closed' });
  assert.equal(session.orders[0].paid, true);
  assert.equal(session.orders[0].paidAt, 200);
  assert.equal(session.orders[0].status, 'queued');
  assert.equal(session.shifts[0].cashSales, 35000);
  assert.equal(session.shifts[0].expectedCash, 235000);
  assert.equal(session.shifts[0].difference, 0);
});

test('an older closed shift does not prevent undoing a payment in the current open shift', () => {
  const previous = pendingOrder();
  let session = openShift(sessionFor(previous), defaultStaff[2], 200000, 100);
  session = closeShift(session, defaultStaff[0], 200000, 300);
  session = openShift(session, defaultStaff[2], 200000, 400);
  session = applyOrderAction(session, '1025', 'pay', 'cash', 500);

  const undone = undoOrderAction(session, previous, undefined, 'queued');
  assert.equal(undone.orders[0].paid, false);
  assert.equal(undone.orders[0].status, 'pending');
  assert.equal(undone.shifts[1].cashSales, 0);
});

test('a closed cash shift does not prevent undoing a kitchen preparation step', () => {
  let session = openShift(sessionFor(pendingOrder()), defaultStaff[2], 200000, 100);
  session = applyOrderAction(session, '1025', 'pay', 'cash', 200);
  session = closeShift(session, defaultStaff[0], 235000, 300);
  const previous = session.orders[0];
  session = applyOrderAction(session, '1025', 'start', undefined, 400);

  const undone = undoOrderAction(session, previous, undefined, 'cooking');
  assert.equal(undone.orders[0].status, 'queued');
  assert.equal(undone.orders[0].paid, true);
  assert.equal(undone.shifts[0].cashSales, 35000);
});
