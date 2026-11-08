import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { initialMenu } from '../src/data.js';

test('the customer menu, basket and order history render the store-edited English name', async () => {
  const globals = Object.fromEntries(['document', 'location'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false },
  });
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { lang: 'lo' } } });
    const item = { ...initialMenu[0], en: 'Signature pork bowl', key: 'pork-quote', size: 'regular', quantity: 1, note: '' };
    const { default: Customer } = await server.ssrLoadModule('/src/Customer.jsx');
    for (const hash of ['#customer', '#customer/cart', '#customer/orders']) {
      Object.defineProperty(globalThis, 'location', { configurable: true, value: { hash } });
      const html = renderToStaticMarkup(React.createElement(Customer, {
        menu: [item], table: 3, initialLanguage: 'en', staffAccess: false,
        draft: { cart: [item], method: 'cash', lastOrderId: null },
        tableOrders: [{ id: '1025', table: 3, status: 'pending', paid: false, createdAt: 1, items: [item] }],
      }));
      assert.match(html, /Signature pork bowl/, hash);
      assert.doesNotMatch(html, /Pork khao piek/, hash);
    }

    const order = { id: '1025', table: 3, createdAt: 1, items: [item] };
    const renderOrders = (status, extra) => renderToStaticMarkup(React.createElement(Customer, {
      menu: [item], table: 3, initialLanguage: 'en', draft: { cart: [], lastOrderId: order.id },
      tableOrders: [{ ...order, status, ...extra }],
    }));
    const handoff = renderOrders('queued', { paid: true, kitchenPending: true });
    assert.match(handoff, /We’ve received your payment/);
    assert.doesNotMatch(handoff, /Your food is being prepared/);
    assert.match(renderOrders('queued', { paid: true, kitchenPending: false, kitchenSentAt: 2 }), /Your food is being prepared/);
    assert.match(renderOrders('cooking', { paid: true, kitchenPending: false, kitchenSentAt: 2 }), /Your food is being prepared/);

    for (const status of ['pending', 'queued', 'cooking', 'ready']) {
      const unpaid = renderOrders(status, { paid: false });
      assert.match(unpaid, /dining-status pending/, status);
      assert.match(unpaid, /We’ll prepare your food once payment is confirmed\./, status);
      assert.doesNotMatch(unpaid, /Your food is being prepared|Your food is ready/, status);
    }

    const rejected = renderOrders('rejected', { paid: false });
    assert.match(rejected, /The shop couldn’t confirm payment/);
    assert.match(rejected, /show the cashier your original payment receipt/);
    assert.doesNotMatch(rejected, /Payment awaiting confirmation/);

    const acknowledged = renderToStaticMarkup(React.createElement(Customer, {
      menu: [item], table: 3, initialLanguage: 'en', draft: { cart: [], lastOrderId: '1026' },
      ordersStatus: 'loading', tableOrders: [],
    }));
    assert.match(acknowledged, /Order #1026 received/);
    assert.doesNotMatch(acknowledged, /No orders yet/);
  } finally {
    await server.close();
    for (const [name, descriptor] of Object.entries(globals)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
