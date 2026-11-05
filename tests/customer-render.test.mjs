import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

test('an invalid table QR renders recovery guidance instead of crashing', async () => {
  const globals = Object.fromEntries(['document', 'location'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)),
    configFile: false,
    appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, watch: null, ws: false },
  });
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { lang: 'lo' } } });
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { hash: '#customer' } });
    const { default: Customer } = await server.ssrLoadModule('/src/Customer.jsx');
    let html;
    assert.doesNotThrow(() => {
      html = renderToStaticMarkup(React.createElement(Customer, {
        menu: [], table: null, tableOrders: [], initialLanguage: 'en', staffAccess: false,
        draft: { cart: [], method: 'transfer', lastOrderId: null },
      }));
    });
    assert.match(html, /Table not found/);
    assert.match(html, /Scan the QR code on your table again or ask our staff/);
  } finally {
    await server.close();
    for (const [name, descriptor] of Object.entries(globals)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
