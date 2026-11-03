import test from 'node:test';
import assert from 'node:assert/strict';
import { nextOrderStatus, orderTotal, addCartItem, updateCartItem } from '../src/order-model.mjs';

test('an unpaid order cannot be sent to the kitchen', () => {
  assert.equal(nextOrderStatus({ status: 'pending', paid: false }, 'start'), 'pending');
});
test('confirming payment places the order in the kitchen queue', () => {
  assert.equal(nextOrderStatus({ status: 'pending', paid: false }, 'pay'), 'queued');
});
test('kitchen workflow advances in order and cannot skip preparation', () => {
  assert.equal(nextOrderStatus({ status: 'queued', paid: true }, 'ready'), 'queued');
  assert.equal(nextOrderStatus({ status: 'queued', paid: true }, 'start'), 'cooking');
  assert.equal(nextOrderStatus({ status: 'cooking', paid: true }, 'ready'), 'ready');
});
test('cart merges identical options and keeps different options separate', () => {
  const first = { id: 'noodle', size: 'regular', note: '', price: 35000, quantity: 1 };
  let cart = addCartItem([], first);
  cart = addCartItem(cart, first);
  cart = addCartItem(cart, { ...first, size: 'large', price: 45000 });
  assert.equal(cart.length, 2);
  assert.equal(cart[0].quantity, 2);
  assert.equal(orderTotal(cart), 115000);
});

test('editing a basket line replaces its options and total without adding another portion', () => {
  const cart = [
    { key: 'pork', id: 'noodle', size: 'regular', note: '', price: 35000, quantity: 2 },
    { key: 'tea', id: 'tea', size: 'regular', note: '', price: 15000, quantity: 1 },
  ];
  const edited = updateCartItem(cart, 'pork', { ...cart[0], size: 'large', price: 45000, quantity: 1, note: 'No herbs' });
  assert.equal(edited.length, 2);
  assert.equal(edited[0].key, 'pork');
  assert.equal(edited[0].note, 'No herbs');
  assert.equal(orderTotal(edited), 60000);
  assert.equal(orderTotal(cart), 85000);
});

test('editing to match another basket line combines quantities once', () => {
  const cart = [
    { key: 'regular', id: 'noodle', size: 'regular', note: '', price: 35000, quantity: 1 },
    { key: 'large', id: 'noodle', size: 'large', note: '', price: 45000, quantity: 2 },
  ];
  const edited = updateCartItem(cart, 'regular', { ...cart[0], size: 'large', price: 45000 });
  assert.equal(edited.length, 1);
  assert.equal(edited[0].key, 'large');
  assert.equal(edited[0].quantity, 3);
  assert.equal(orderTotal(edited), 135000);
});
