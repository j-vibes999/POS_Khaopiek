import test from 'node:test';
import assert from 'node:assert/strict';
import { customerOrders, summarizeCustomerOrders, filterCustomerMenu } from '../src/customer-model.mjs';

const orders = [
  { id: 'a', table: 3, paid: true, items: [{ price: 35000, quantity: 2 }] },
  { id: 'b', table: 7, paid: false, items: [{ price: 45000, quantity: 1 }] },
  { id: 'c', table: 3, paid: false, items: [{ price: 15000, quantity: 3 }] },
];

test('customer order history contains only the scanned table', () => {
  assert.deepEqual(customerOrders(orders, 3).map(order => order.id), ['a', 'c']);
});

test('the outstanding total excludes orders already paid', () => {
  assert.deepEqual(summarizeCustomerOrders(customerOrders(orders, 3)), {
    total: 115000, paid: 70000, due: 45000, itemCount: 5,
  });
});

test('customer menu search finds translated names within the selected category', () => {
  const menu = [
    { id: 'pork', category: 'noodles', lo: 'ເຂົ້າປຽກໝູ', th: 'ข้าวเปียกหมู' },
    { id: 'pho', category: 'noodles', lo: 'ເຝີ', th: 'เฝอเนื้อ' },
    { id: 'tea', category: 'drinks', lo: 'ຊາ', th: 'ชามะนาว' },
  ];
  assert.deepEqual(filterCustomerMenu(menu, 'all', ' หมู ').map(item => item.id), ['pork']);
  assert.equal(filterCustomerMenu(menu, 'drinks', 'หมู').length, 0);
  assert.deepEqual(filterCustomerMenu(menu, 'pho', '').map(item => item.id), ['pho']);
});
