import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

const forbiddenCopy = /Demo preview|Demo mode|ต้นแบบทดลอง|โหมดทดลอง|ຕົ້ນແບບທົດລອງ|ໂໝດທົດລອງ|演示模式|데모|デモ/;

test('customer baskets and staff requests render without prototype or browser-storage instructions in six languages', async () => {
  const globals = Object.fromEntries(['document', 'location'].map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false } });
  try {
    Object.defineProperty(globalThis, 'document', { configurable: true, value: { documentElement: { lang: 'lo' } } });
    Object.defineProperty(globalThis, 'location', { configurable: true, value: { hash: '#customer' } });
    const { default: Customer } = await server.ssrLoadModule('/src/Customer.jsx');
    const dish = { id: 'shop-dish', lo: 'ອາຫານ', en: 'House dish', price: 35000, image: '/shop-dish.jpg', available: true, category: 'other' };
    for (const initialLanguage of ['lo', 'th', 'en', 'zh', 'ko', 'ja']) {
      for (const tab of ['cart', 'call']) {
        location.hash = `#customer/${tab}`;
        const html = renderToStaticMarkup(React.createElement(Customer, { menu: [dish], table: 1, tableOrders: [], initialLanguage, staffAccess: false, onCall: () => true, onCancelCall: () => true, draft: { cart: [{ ...dish, key: 'house', quantity: 1 }], method: 'cash' } }));
        assert.doesNotMatch(html, forbiddenCopy, `${initialLanguage}/${tab}`);
        assert.doesNotMatch(html, /dining-demo-info/);
      }
    }
    location.hash = '#customer/orders';
    const orderId = '867e2148-d312-429d-a642-b3947a30945b';
    const orderHtml = renderToStaticMarkup(React.createElement(Customer, { menu: [], table: 1, tableOrders: [{ id: orderId, orderNumber: 42, status: 'pending', method: 'cash', items: [], createdAt: Date.now() }], initialLanguage: 'en', draft: { cart: [], method: 'cash', lastOrderId: orderId, receipt: { orderNumber: 42 } } }));
    assert.match(orderHtml, /#42/);
    assert.doesNotMatch(orderHtml, new RegExp(orderId));
  } finally {
    await server.close();
    for (const [name, descriptor] of Object.entries(globals)) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});

test('real shop back office uses authenticated staff membership and supports empty records', async () => {
  const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false } });
  try {
    const { StaffView, StaffDialog, SettingsView, TableSetupView } = await server.ssrLoadModule('/src/BackOffice.jsx');
    const { Locale } = await server.ssrLoadModule('/src/staff-ui.jsx');
    const render = (component, props) => renderToStaticMarkup(React.createElement(Locale.Provider, { value: { lang: 'th', t: (_, thai) => thai } }, React.createElement(component, props)));
    const owner = { id: 'membership-1', authUserId: 'c2ce404a-9032-4667-b5f3-3ea52ee73e1a', name: 'Owner', role: 'owner', active: true };
    const staff = render(StaffView, { staff: [owner], user: owner, cloud: true });
    assert.doesNotMatch(staff, /PIN/);
    assert.match(staff, /ใช้งานได้/);
    const editor = render(StaffDialog, { member: { role: 'cashier', active: true }, allowedRoles: ['cashier'], cloud: true });
    assert.match(editor, /type="email"/);
    assert.doesNotMatch(editor, /Supabase Auth User ID/);
    assert.doesNotMatch(editor, /PIN/);
    const settings = render(SettingsView, { settings: { shopName: 'House', branch: '', phone: '', methods: ['cash'] }, activity: [], menu: [] });
    assert.doesNotMatch(settings, /ข้อมูลทดลอง|ล้างข้อมูล|ตัวอย่าง|1111|2222|3333/);
    assert.doesNotThrow(() => render(TableSetupView, { tables: [], orders: [], shopName: 'House' }));
  } finally { await server.close(); }
});
