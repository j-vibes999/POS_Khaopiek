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
  } finally {
    await server.close();
    for (const [name, descriptor] of Object.entries(globals)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
