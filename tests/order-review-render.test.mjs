import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { copy } from '../src/customer-copy.js';

test('the final customer review shows the order, counter payment instructions and the confirmation action', async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false },
  });
  try {
    const { OrderConfirmation } = await server.ssrLoadModule('/src/Customer.jsx');
    const review = { table: 3, method: 'cash', items: [
      { id: 'pork', key: 'pork', en: 'Signature pork bowl', category: 'khao', price: 45000, quantity: 2, size: 'large', noHerbs: true, customizationNote: 'Separate soup' },
      { id: 'tea', key: 'tea', en: 'Lime tea', category: 'drinks', price: 15000, quantity: 1, size: 'regular', customizationNote: 'No ice' },
    ] };
    const html = renderToStaticMarkup(React.createElement(OrderConfirmation, { review, language: 'en', c: (key, values) => copy('en', key, values), busy: false, error: 'Storage unavailable' }));
    assert.match(html, /<dialog[^>]*aria-labelledby=/);
    assert.match(html, /T 03/);
    assert.match(html, /Signature pork bowl/);
    assert.match(html, /Large · No herbs · Separate soup/);
    assert.match(html, /No ice/);
    assert.match(html, /90,000/);
    assert.match(html, /105,000/);
    assert.match(html, /3 items/);
    assert.match(html, /Cash/);
    assert.match(html, /role="alert"[^>]*>Storage unavailable/);
    assert.match(html, /Back to basket/);
    assert.match(html, /pay in cash before confirming/);
    assert.match(html, /Confirm order/);

    const transferHtml = renderToStaticMarkup(React.createElement(OrderConfirmation, { review: { ...review, method: 'transfer' }, language: 'en', c: (key, values) => copy('en', key), busy: false }));
    assert.match(transferHtml, /Ask for transfer details at the counter/);

    const retryHtml = renderToStaticMarkup(React.createElement(OrderConfirmation, { review, retrying: true, language: 'en', c: (key, values) => copy('en', key, values), busy: false }));
    assert.match(retryHtml, /Retry order/);
    assert.match(retryHtml, /retry without paying again/);
    assert.doesNotMatch(retryHtml, /pay in cash before confirming/);
  } finally { await server.close(); }
});
