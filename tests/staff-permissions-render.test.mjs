import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import { defaultStaff } from '../src/backoffice-model.mjs';

test('managers see owner account status without a way to open the owner PIN editor', async () => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false },
  });
  try {
    const { StaffView } = await server.ssrLoadModule('/src/BackOffice.jsx');
    const { Locale } = await server.ssrLoadModule('/src/staff-ui.jsx');
    const [owner, manager, cashier] = defaultStaff;
    const render = user => renderToStaticMarkup(React.createElement(Locale.Provider, { value: { lang: 'th', t: (_, thai) => thai } },
      React.createElement(StaffView, { staff: defaultStaff, user })));
    const ownerEdit = `aria-label="แก้ไข ${owner.name}"`;
    const managerView = render(manager);
    assert.ok(managerView.includes(owner.name));
    assert.ok(!managerView.includes(ownerEdit));
    assert.ok(managerView.includes(`aria-label="แก้ไข ${cashier.name}"`));
    assert.ok(render(owner).includes(ownerEdit));
  } finally { await server.close(); }
});
