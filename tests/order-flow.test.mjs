import test from 'node:test';
import assert from 'node:assert/strict';
import { nextOrderStatus, orderTotal, addCartItem } from '../src/order-model.mjs';

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
