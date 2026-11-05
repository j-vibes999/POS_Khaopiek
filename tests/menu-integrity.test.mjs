import test from 'node:test';
import assert from 'node:assert/strict';
import * as orderModel from '../src/order-model.mjs';
import * as customerCopy from '../src/customer-copy.js';
import { saveMenuItem } from '../src/backoffice-model.mjs';
import { filterCustomerMenu } from '../src/customer-model.mjs';
import { initialMenu } from '../src/data.js';

const pork = { ...initialMenu[0], size: 'regular', quantity: 1, note: '' };

test('adding a dish after its price changes preserves both quoted prices and their separate line keys', () => {
  let cart = orderModel.addCartItem([], pork);
  const changed = saveMenuItem(initialMenu, { ...initialMenu[0], price: 55000 });
  const newQuote = { ...changed[0], size: 'regular', quantity: 1, note: '' };
  cart = orderModel.addCartItem(cart, newQuote);
  assert.equal(cart.length, 2);
  assert.deepEqual(cart.map(row => row.price), [35000, 55000]);
  assert.equal(new Set(cart.map(row => row.key)).size, 2);
  assert.equal(orderModel.orderTotal(cart), 90000);

  cart = orderModel.addCartItem(cart, newQuote);
  assert.deepEqual(cart.map(row => row.quantity), [1, 2]);
  assert.equal(orderModel.orderTotal(cart), 145000);
});

test('editing options does not merge a line into an otherwise identical line at a different quoted price', () => {
  const cart = [
    { ...pork, key: 'old-quote', price: 35000, quantity: 2 },
    { ...pork, key: 'new-quote', price: 55000, note: 'No herbs' },
  ];
  const edited = orderModel.updateCartItem(cart, 'new-quote', { ...cart[1], note: '' });
  assert.equal(edited.length, 2);
  assert.deepEqual(edited.map(row => [row.key, row.price, row.quantity]), [['old-quote', 35000, 2], ['new-quote', 55000, 1]]);
  assert.equal(orderModel.orderTotal(edited), 125000);
});

test('editing a quoted basket line uses its original base price for regular and large sizes', () => {
  for (const [item, size, expected] of [
    [pork, 'regular', 35000], [pork, 'large', 45000],
    [{ ...pork, size: 'large', price: 45000 }, 'regular', 35000],
    [{ ...pork, size: 'large', price: 45000 }, 'large', 45000],
    [{ ...initialMenu[0], price: 55000 }, 'large', 65000],
  ]) assert.equal(orderModel.quotedItemPrice?.(item, size), expected);
});

test('a store-edited English name overrides the built-in name and remains searchable', () => {
  const menu = saveMenuItem(initialMenu, { ...initialMenu[0], en: 'Signature pork bowl' });
  assert.equal(customerCopy.customerItemName(menu[0], 'en'), 'Signature pork bowl');
  const translated = customerCopy.customerMenuItem?.(menu[0]);
  assert.ok(translated, 'the menu keeps resolved translations for search');
  assert.deepEqual(filterCustomerMenu([translated], 'all', 'signature').map(item => item.id), ['pork']);
});

test('untouched demo names retain their Lao, Thai and four built-in translations', () => {
  for (const [language, expected] of [
    ['lo', 'ເຂົ້າປຽກເສັ້ນໝູ'], ['th', 'ข้าวเปียกเส้นหมู'], ['en', 'Pork khao piek'],
    ['zh', '猪肉老挝米粉'], ['ko', '돼지고기 카오삐약'], ['ja', '豚肉のカオピアック'],
  ]) assert.equal(customerCopy.customerItemName(initialMenu[0], language), expected);
});

test('an optional blank English name still uses the demo translation for display and search', () => {
  const saved = saveMenuItem(initialMenu, { ...initialMenu[0], en: '' })[0];
  assert.equal(customerCopy.customerItemName(saved, 'en'), 'Pork khao piek');
  const translated = customerCopy.customerMenuItem?.(saved);
  assert.ok(translated, 'the menu keeps its default English search name');
  assert.equal(filterCustomerMenu([translated], 'all', 'pork').length, 1);
});
