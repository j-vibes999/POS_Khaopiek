import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';

test('add-menu editor prioritizes photo, name, price and category while optional languages stay collapsed', async () => {
 const server = await createServer({ root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom', optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false } });
 try {
  const { DishDialog } = await server.ssrLoadModule('/src/MenuAdmin.jsx');
  const { Locale } = await server.ssrLoadModule('/src/staff-ui.jsx');
  const html = renderToStaticMarkup(React.createElement(Locale.Provider, { value: { lang: 'th', t: (_, th) => th } }, React.createElement(DishDialog, { dish: { category: 'khao' }, onClose() {}, onSave() {} })));
  assert.match(html, /เลือกรูป/); assert.match(html, /ถ่ายรูป/);
  assert.match(html, /capture="environment"/);
  assert.match(html, /ชื่อเมนู \(ลาว\)/); assert.match(html, /ราคาขาย/);
  assert.match(html, /<details class="menu-editor-details">/);
  assert.match(html, /บันทึกเมนู/); assert.match(html, /ยกเลิก/);
  assert.doesNotMatch(html, /ข้อมูลตัวอย่าง|Demo|1111|unsplash|khao-piak\.jpg/);
 } finally { await server.close(); }
});
