import test from 'node:test';
import assert from 'node:assert/strict';
import { menuUrlForTable, tableFromSearch } from '../src/customer-model.mjs';

test('a localhost table QR uses the computer network address and selected table', () => {
  assert.equal(menuUrlForTable('http://localhost:5173/?table=3#customer/qr', 7, '192.168.100.191'), 'http://192.168.100.191:5173/?table=7#customer');
});

test('loopback IP links also become phone-accessible without changing the port', () => {
  assert.equal(menuUrlForTable('http://127.0.0.1:5173/#tables', 3, '192.168.100.191'), 'http://192.168.100.191:5173/?table=3#customer');
});

test('published and existing network links keep their own host', () => {
  assert.equal(menuUrlForTable('https://restaurant.example/order?table=1#tables', 9, '192.168.100.191'), 'https://restaurant.example/order?table=9#customer');
  assert.equal(menuUrlForTable('http://192.168.100.191:5173/#tables', 2, '192.168.100.191'), 'http://192.168.100.191:5173/?table=2#customer');
});

test('a QR link only opens a table that exists, written as a whole number', () => {
  assert.deepEqual(tableFromSearch('?table=3', 12), { fromQr: true, table: 3 });
  assert.deepEqual(tableFromSearch('?table=07', 12), { fromQr: true, table: 7 });
  for (const value of ['2.5', '0', '13', 'abc', '', '-1', '1e1']) {
    assert.deepEqual(tableFromSearch(`?table=${value}`, 12), { fromQr: true, table: null }, value);
  }
});

test('a staff preview opens the customer view without a table parameter', () => {
  assert.deepEqual(tableFromSearch('', 12), { fromQr: false, table: null });
});
