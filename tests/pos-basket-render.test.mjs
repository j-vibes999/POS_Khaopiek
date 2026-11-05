import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('collapsed cashier basket keeps kitchen instructions visible outside the optional editor', async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false },
  });
  try {
    const { PosOrder } = await server.ssrLoadModule('/src/PosOrder.jsx');
    const { Locale } = await server.ssrLoadModule('/src/staff-ui.jsx');
    const row = { id: 'pork', key: 'pork', lo: 'Pork bowl', category: 'khao', size: 'large', noHerbs: true, customizationNote: 'Separate soup', note: 'ບໍ່ໃສ່ຜັກ · Separate soup', price: 45000, quantity: 2, available: true };
    const html = renderToStaticMarkup(React.createElement(Locale.Provider, { value: { lang: 'lo', t: lo => lo } },
      React.createElement(PosOrder, { table: 3, tables: [{ number: 3 }], menu: [row], draft: { cart: [row] } })));
    const line = html.slice(html.indexOf('<article'));
    const editorStart = line.indexOf('<details');
    assert.ok(editorStart > 0, 'optional choices have an editor disclosure');
    const visible = line.slice(0, editorStart);
    assert.match(visible, /Separate soup/);
    assert.match(visible, /ບໍ່ໃສ່ຜັກ/);
    assert.match(visible, /ພິເສດ/);
    assert.match(visible, /90,000/);
    assert.doesNotMatch(line.match(/<details[^>]*>/)[0], /\bopen\b/);
  } finally { await server.close(); }
});
