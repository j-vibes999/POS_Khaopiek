import test from 'node:test';
import assert from 'node:assert/strict';
import { applyOrderAction, undoOrderAction } from '../src/customer-model.mjs';
import { answerCall, requestCall } from '../src/backoffice-model.mjs';

const served = { id: '1', table: 4, status: 'served', paid: true, createdAt: 20, items: [] };
const waterCall = { reason: 'water', at: 50 };
const sessionFor = orders => ({ orders, calls: { 4: waterCall, 7: { reason: 'help', at: 30 } }, clearedAt: { 4: 10 } });

// Dropping the call restoration from Undo must lose the still-outstanding water request.
test('undoing the last order close restores the guest call cleared by that close', () => {
  const before = sessionFor([served]);
  const closed = applyOrderAction(before, served.id, 'close', undefined, 60);
  assert.equal(closed.calls[4], undefined);

  const undone = undoOrderAction(closed, served, 10, 'completed', before.calls[4]);

  assert.deepEqual(undone.calls, { 4: { reason: 'water', at: 50 }, 7: { reason: 'help', at: 30 } });
  assert.equal(undone.orders[0].status, 'served');
  assert.equal(undone.clearedAt[4], 10);
  assert.equal(closed.calls[4], undefined);
});

// Unconditionally restoring the snapshot must overwrite the guest's newer request.
test('undoing a close keeps a newer call from the same table', () => {
  const before = sessionFor([served]);
  const closed = applyOrderAction(before, served.id, 'close', undefined, 60);
  const newer = requestCall(closed, 4, 'pay', 70);

  const undone = undoOrderAction(newer, served, 10, 'completed', before.calls[4]);

  assert.deepEqual(undone.calls[4], { reason: 'pay', at: 70 });
  assert.equal(undone.orders[0].status, 'served');
});

// Restoring after every close must revive a request that the close never cleared.
test('undoing a nonfinal order close does not revive a call answered afterward', () => {
  const before = sessionFor([served, { ...served, id: '2', status: 'cooking' }]);
  const closed = applyOrderAction(before, served.id, 'close', undefined, 60);
  const answered = answerCall(closed, 4);

  const undone = undoOrderAction(answered, served, 10, 'completed', before.calls[4]);

  assert.equal(undone.calls[4], undefined);
  assert.equal(undone.orders[0].status, 'served');
});

// Restoring on other Undo transitions must revive a separately answered request.
for (const [action, beforeStatus, afterStatus] of [['start', 'queued', 'cooking'], ['ready', 'cooking', 'ready'], ['serve', 'ready', 'served']]) {
  test(`undoing a ${action} action does not restore a call answered afterward`, () => {
    const previous = { ...served, status: beforeStatus };
    const before = sessionFor([previous]);
    const advanced = applyOrderAction(before, previous.id, action, undefined, 60);
    const answered = answerCall(advanced, 4);

    const undone = undoOrderAction(answered, previous, 10, afterStatus, before.calls[4]);

    assert.equal(undone.calls[4], undefined);
    assert.equal(undone.orders[0].status, beforeStatus);
  });
}
