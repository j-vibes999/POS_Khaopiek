import test from 'node:test';
import assert from 'node:assert/strict';
import { matchesStaffTable, nextStaffOrder, summarizeStaffTable } from '../src/staff-model.mjs';

const order = (id, status, createdAt, paid, price = 35000, quantity = 1) => ({
  id, status, createdAt, paid, items: [{ id: 'pork', price, quantity }],
});

test('the table summary excludes completed orders and shows only unpaid active money as due', () => {
  const call = { reason: 'water', at: 10 };
  const summary = summarizeStaffTable([
    order('ready', 'ready', 1, true, 40000),
    order('pending', 'pending', 3, false, 35000, 2),
    order('cooking', 'cooking', 2, true, 10000),
    order('completed', 'completed', 0, false, 999000),
  ], call);

  assert.ok(summary, 'a table summary is returned');
  assert.deepEqual(summary.orders.map(item => item.id), ['ready', 'pending', 'cooking']);
  assert.equal(summary.status, 'pending');
  assert.equal(summary.due, 70000);
  assert.equal(summary.total, 120000);
  assert.equal(summary.pendingCount, 1);
  assert.equal(summary.readyCount, 1);
  assert.deepEqual(summary.call, { reason: 'water', at: 10 });
});

test('table status names the most urgent remaining task', () => {
  const rows = [
    order('served', 'served', 1, true),
    order('queued', 'queued', 2, true),
    order('cooking', 'cooking', 3, true),
    order('ready', 'ready', 4, true),
    order('pending', 'pending', 5, false),
  ];
  for (const [count, expected] of [[5, 'pending'], [4, 'ready'], [3, 'cooking'], [2, 'queued'], [1, 'served'], [0, 'empty']]) {
    assert.equal(summarizeStaffTable(rows.slice(0, count))?.status, expected);
  }
});

test('an empty or completed-only table has no outstanding work or money', () => {
  const summary = summarizeStaffTable([order('done', 'completed', 1, true)]);
  assert.ok(summary, 'an empty table summary is returned');
  assert.deepEqual(summary.orders, []);
  assert.equal(summary.status, 'empty');
  assert.equal(summary.due, 0);
  assert.equal(summary.total, 0);
  assert.equal(summary.pendingCount, 0);
  assert.equal(summary.readyCount, 0);
});

test('mixed tables appear in every applicable work filter instead of only their dominant status', () => {
  const tables = [
    summarizeStaffTable([order('pending', 'pending', 1, false), order('ready', 'ready', 2, true)], { reason: 'help', at: 1 }),
    summarizeStaffTable([order('cooking', 'cooking', 1, true), order('served', 'served', 2, true)]),
    summarizeStaffTable([]),
    summarizeStaffTable([], { reason: 'water', at: 2 }),
  ];
  for (const [filter, expected] of [['all', 4], ['pending', 1], ['ready', 1], ['calls', 2], ['kitchen', 1], ['served', 1], ['empty', 2]]) {
    assert.equal(tables.filter(summary => matchesStaffTable(summary, filter)).length, expected, filter);
  }
});

test('the cashier opens the oldest pending order before a newer paid order', () => {
  const rows = [
    order('new-paid', 'ready', 300, true),
    order('new-pending', 'pending', 200, false),
    order('old-pending', 'pending', 100, false),
  ];
  assert.equal(nextStaffOrder(rows)?.id, 'old-pending');
  assert.deepEqual(rows.map(item => item.id), ['new-paid', 'new-pending', 'old-pending']);
});

test('an explicit active selection is retained even when another task is more urgent', () => {
  const rows = [order('pending', 'pending', 100, false), order('selected', 'cooking', 200, true)];
  assert.equal(nextStaffOrder(rows, 'selected', 'pending')?.id, 'selected');
});

test('a ready-food filter opens the oldest ready order even when payment is also pending', () => {
  const rows = [
    order('pending', 'pending', 50, false),
    order('new-ready', 'ready', 200, true),
    order('old-ready', 'ready', 100, true),
  ];
  assert.equal(nextStaffOrder(rows, null, 'ready')?.id, 'old-ready');
});

test('a pending-payment filter opens the oldest pending order', () => {
  const rows = [order('new', 'pending', 200, false), order('old', 'pending', 100, false), order('ready', 'ready', 50, true)];
  assert.equal(nextStaffOrder(rows, null, 'pending')?.id, 'old');
});

test('the kitchen filter opens kitchen work on a table that also has a pending payment', () => {
  const rows = [
    order('pending', 'pending', 1, false), order('queued', 'queued', 2, true),
    order('new-cooking', 'cooking', 200, true), order('old-cooking', 'cooking', 100, true),
  ];
  assert.equal(nextStaffOrder(rows, null, 'kitchen')?.id, 'old-cooking');
});

test('the served filter opens the oldest served order instead of unrelated pending or ready work', () => {
  const rows = [
    order('pending', 'pending', 1, false), order('ready', 'ready', 2, true),
    order('new-served', 'served', 200, true), order('old-served', 'served', 100, true),
  ];
  assert.equal(nextStaffOrder(rows, null, 'served')?.id, 'old-served');
});

test('after a filtered task completes the next active task replaces it', () => {
  const rows = [order('done', 'completed', 50, true), order('cooking', 'cooking', 100, true), order('ready', 'ready', 200, true)];
  assert.equal(nextStaffOrder(rows, 'done', 'pending')?.id, 'ready');
});

test('when payments and ready food are done the oldest cooking order comes before queued and served orders', () => {
  const rows = [
    order('served', 'served', 1, true), order('queued', 'queued', 2, true),
    order('new-cooking', 'cooking', 200, true), order('old-cooking', 'cooking', 100, true),
  ];
  assert.equal(nextStaffOrder(rows)?.id, 'old-cooking');
});

test('there is no selected order when a table has only completed orders', () => {
  assert.equal(nextStaffOrder([order('done', 'completed', 1, true)], 'done'), null);
  assert.equal(nextStaffOrder([]), null);
});
