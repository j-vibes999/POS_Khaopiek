import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOrderAction, confirmOrderPayment, summarizeCustomerOrders, undoOrderAction } from '../src/customer-model.mjs';
import { summarizeStaffTable } from '../src/staff-model.mjs';
import { closeShift, defaultStaff, openShift } from '../src/backoffice-model.mjs';

const pendingOrder = () => ({
  id: '1025', table: 3, createdAt: 1, status: 'pending', paid: false, method: 'transfer',
  items: [{ id: 'pork', price: 35000, quantity: 1 }],
});
const sessionFor = order => ({ orders: [order], shifts: [], clearedAt: {}, calls: {} });

test('cashier confirmation only accepts the reviewed order and verified payment amount', () => {
  const reviewed = pendingOrder();
  const session = { ...sessionFor(reviewed), staff: defaultStaff, settings: { methods: ['cash'] } };
  const confirmation = { userId: defaultStaff[2].id, method: 'cash', received: 50000 };

  assert.throws(() => confirmOrderPayment(session, reviewed, { ...confirmation, userId: 'revoked' }), { code: 'access-denied' });
  assert.throws(() => confirmOrderPayment(session, reviewed, { ...confirmation, method: 'transfer' }), { code: 'method' });
  assert.throws(() => confirmOrderPayment(session, reviewed, { ...confirmation, received: 34000 }), { code: 'amount' });
  assert.throws(() => confirmOrderPayment(session, { ...reviewed, items: [{ ...reviewed.items[0], quantity: 2 }] }, confirmation), { code: 'changed' });

  const confirmed = confirmOrderPayment(session, reviewed, confirmation, 200);
  assert.equal(confirmed.orders[0].paid, true);
  assert.equal(confirmed.orders[0].paidAt, 200);
  assert.equal(confirmed.orders[0].status, 'queued');
  assert.equal(confirmed.orders[0].kitchenPending, true);
  assert.equal(confirmed.orders[0].method, 'cash');
  assert.throws(() => confirmOrderPayment(confirmed, reviewed, confirmation), { code: 'already-paid' });
  assert.equal(session.orders[0].paid, false);
});

test('a cashier can mark food served from a printed ticket without a kitchen screen transition', () => {
  for (const status of ['queued', 'cooking', 'ready']) {
    const paid = { ...pendingOrder(), status, paid: true };
    assert.equal(applyOrderAction(sessionFor(paid), paid.id, 'serve').orders[0].status, 'served');
    assert.equal(applyOrderAction(sessionFor({ ...paid, paid: false }), paid.id, 'serve').orders[0].status, status);
  }
});

test('a paid order starts cooking when its kitchen ticket is dispatched', () => {
  const paid = applyOrderAction(sessionFor(pendingOrder()), '1025', 'pay', 'cash', 200);
  assert.equal(summarizeStaffTable(paid.orders).status, 'handoff');
  assert.equal(paid.orders[0].paid, true);
  assert.equal(paid.orders[0].kitchenPending, true);
  assert.equal(applyOrderAction(paid, '1025', 'serve').orders[0].status, 'queued');
  const sent = applyOrderAction(paid, '1025', 'kitchen-sent', undefined, 300);
  assert.equal(summarizeStaffTable(sent.orders).status, 'cooking');
  assert.equal(sent.orders[0].kitchenPending, false);
  assert.equal(sent.orders[0].kitchenSentAt, 300);
  assert.equal(sent.orders[0].paidAt, 200);
  assert.equal(sent.orders[0].method, 'cash');
  assert.equal(applyOrderAction(sent, '1025', 'serve').orders[0].status, 'served');
  assert.equal(applyOrderAction(sent, '1025', 'kitchen-sent', undefined, 400), sent);
});

test('an unpaid order cannot be advanced by a kitchen dispatch acknowledgement', () => {
  const session = sessionFor(pendingOrder());
  assert.equal(applyOrderAction(session, '1025', 'kitchen-sent', undefined, 300), session);
});

test('a legacy paid ticket can still leave its handoff queue and start cooking', () => {
  const legacy = { ...pendingOrder(), status: 'queued', paid: true, paidAt: 200, kitchenPending: true };
  const session = sessionFor(legacy);
  assert.equal(summarizeStaffTable(session.orders).status, 'handoff');
  assert.equal(applyOrderAction(session, '1025', 'serve').orders[0].status, 'queued');
  const sent = applyOrderAction(session, '1025', 'kitchen-sent', undefined, 300);
  assert.equal(sent.orders[0].status, 'cooking');
  assert.equal(sent.orders[0].kitchenPending, false);
  assert.equal(sent.orders[0].kitchenSentAt, 300);
  assert.equal(sent.orders[0].paidAt, 200);
  assert.equal(legacy.kitchenPending, true);
  assert.equal(applyOrderAction(sent, '1025', 'serve').orders[0].status, 'served');
});

test('an unpaid request can be rejected without leaving a balance or holding its table open', () => {
  const rejected = applyOrderAction(sessionFor(pendingOrder()), '1025', 'reject');
  assert.equal(rejected.orders[0].status, 'rejected');
  assert.equal(summarizeCustomerOrders(rejected.orders).due, 0);
  assert.equal(summarizeStaffTable(rejected.orders).status, 'empty');
  assert.throws(() => applyOrderAction(rejected, '1025', 'pay', 'cash'), { code: 'already-paid' });
});

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
  session = closeShift(session, defaultStaff[0], 235000, 300, '100');

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
  session = closeShift(session, defaultStaff[0], 200000, 300, '100');
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
  session = closeShift(session, defaultStaff[0], 235000, 300, '100');
  session = applyOrderAction(session, '1025', 'kitchen-sent', undefined, 350);
  const previous = session.orders[0];
  session = applyOrderAction(session, '1025', 'ready', undefined, 400);

  const undone = undoOrderAction(session, previous, undefined, 'ready');
  assert.equal(undone.orders[0].status, 'cooking');
  assert.equal(undone.orders[0].paid, true);
  assert.equal(undone.shifts[0].cashSales, 35000);
});
