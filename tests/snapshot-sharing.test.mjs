import test from 'node:test';
import assert from 'node:assert/strict';
import { shareSnapshot } from '../src/snapshot-sharing.mjs';

test('unchanged snapshots retain their previous identity', () => {
  const previous = { restaurantId: 'a', orders: [{ id: 'order', revision: 1, paidAt: undefined, items: [] }], calls: {} };
  const next = { restaurantId: 'a', orders: [{ id: 'order', revision: 1, paidAt: undefined, items: [] }], calls: {} };
  assert.equal(shareSnapshot(previous, next), previous);
});

test('changed order revisions keep unchanged menu and historical orders shared', () => {
  const previous = { menu: [{ id: 'dish', price: 35000 }], orders: [{ id: 'a', revision: 1 }, { id: 'b', revision: 2 }] };
  const next = { menu: [{ id: 'dish', price: 35000 }], orders: [{ id: 'a', revision: 2 }, { id: 'b', revision: 2 }] };
  const shared = shareSnapshot(previous, next);
  assert.deepEqual(shared, next);
  assert.equal(shared.menu, previous.menu);
  assert.equal(shared.orders[1], previous.orders[1]);
  assert.notEqual(shared.orders[0], previous.orders[0]);
});

test('removed and undefined keys, command metadata, and account changes are not lost', () => {
  const previous = { restaurantId: 'a', commandChanged: false, commandOrderId: 'old', orders: [{ id: 'a', paidAt: 12 }], calls: { 1: undefined } };
  const next = { restaurantId: 'b', orders: [{ id: 'a', paidAt: undefined }], calls: {} };
  const shared = shareSnapshot(previous, next);
  assert.deepEqual(shared, next);
  assert.equal(Object.hasOwn(shared, 'commandOrderId'), false);
  assert.equal(Object.hasOwn(shared.calls, '1'), false);
  assert.equal(Object.hasOwn(shared.orders[0], 'paidAt'), true);
  assert.equal(Object.hasOwn(shareSnapshot({}, { at: undefined }), 'at'), true);
  assert.deepEqual(shareSnapshot([], {}), {});
});

test('new arrays and removed items cannot retain an older snapshot', () => {
  const previous = { orders: [{ id: 'a' }, { id: 'b' }] };
  const next = { orders: [{ id: 'b' }] };
  assert.deepEqual(shareSnapshot(previous, next), next);
  assert.deepEqual(shareSnapshot(null, next), next);
});
