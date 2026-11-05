import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';

const dish = (name, quantity = 1) => ({ id: name, lo: name, th: name, quantity, price: 35000 });
const order = (id, status, paidAt, name, paid = true) => ({
  id, status, paidAt, createdAt: paidAt, table: 3, paid, items: [dish(name)],
});

test('the kitchen puts ready food before separately ordered waiting and cooking queues', async () => {
  const storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false },
  });
  try {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: undefined });
    const { KitchenScreen } = await server.ssrLoadModule('/src/KitchenScreen.jsx');
    const { Locale } = await server.ssrLoadModule('/src/staff-ui.jsx');
    const render = orders => renderToStaticMarkup(React.createElement(Locale.Provider, {
      value: { lang: 'th', t: (lo, th) => th },
    }, React.createElement(KitchenScreen, { orders, onAct: () => true, now: new Date(1000000) })));
    const html = render([
      order('2004', 'queued', 4000, 'Waiting later'), order('2003', 'cooking', 3000, 'Cooking later'),
      order('2002', 'queued', 2000, 'Waiting first'), order('2001', 'cooking', 1000, 'Cooking first'),
      { ...order('2005', 'ready', 5000, 'Ready soup'), items: [{ ...dish('Ready soup'), note: 'No coriander', noteTh: 'ไม่ใส่ผักชี' }] },
      { ...order('2009', 'ready', 500, 'Ready first'), table: 8, createdAt: 9000 },
      order('2006', 'queued', 6000, 'Unpaid food', false),
      order('2007', 'served', 7000, 'Served food'),
    ]);
    const region = name => html.match(new RegExp(`<section[^>]*aria-label="${name}"[^>]*>([\\s\\S]*?)<\\/section>`))?.[1];
    const ready = region('พร้อมเสิร์ฟ');
    const waiting = region('รอทำ');
    const cooking = region('กำลังทำ');
    assert.ok(ready, 'ready food has its own named region');
    assert.ok(waiting, 'waiting food has its own named region');
    assert.ok(cooking, 'cooking food has its own named region');
    assert.match(ready, /Ready soup/);
    const readyTickets = [...ready.matchAll(/<details\b([^>]*)>([\s\S]*?)<\/details>/g)];
    assert.equal(readyTickets.length, 2, 'every ready order has expandable dish details');
    readyTickets.forEach(ticket => assert.doesNotMatch(ticket[1], /\bopen(?:=|\s|$)/, 'ready dishes begin collapsed so the work queues stay near the top'));
    const firstSummary = readyTickets[0][2].match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1];
    assert.match(firstSummary, /โต๊ะ[\s\S]*08[\s\S]*#2009/, 'the oldest-paid ready order identifies its table and order before opening');
    const notedTicket = readyTickets.find(ticket => ticket[2].includes('Ready soup'))?.[2];
    assert.match(notedTicket.match(/<summary[^>]*>([\s\S]*?)<\/summary>/)?.[1], /มีหมายเหตุ/, 'a collapsed ready order signals the preparation note');
    assert.match(notedTicket, /ไม่ใส่ผักชี/, 'opening ready dishes preserves the localized preparation note');
    assert.ok(html.indexOf(ready) < html.indexOf(waiting), 'ready food is reachable before the work queues');
    assert.ok(waiting.indexOf('Waiting first') < waiting.indexOf('Waiting later'));
    assert.ok(cooking.indexOf('Cooking first') < cooking.indexOf('Cooking later'));
    assert.doesNotMatch(waiting, /Cooking first|Cooking later/);
    assert.doesNotMatch(cooking, /Waiting first|Waiting later/);
    assert.doesNotMatch(html, /Unpaid food|Served food/);
    assert.doesNotMatch(ready, /<button/, 'kitchen staff do not mark food served');
    const batch = html.match(/<details\b([^>]*class="kitchen-batch"[^>]*)>([\s\S]*?)<\/details>/);
    assert.ok(batch, 'batch preparation totals remain available without opening another screen');
    assert.doesNotMatch(batch[1], /\bopen(?:=|\s|$)/, 'batch totals begin collapsed');
    assert.match(batch[2], /ยอดอาหารที่ยังต้องทำ/);
    assert.match(batch[2], /Waiting first/);
    assert.match(batch[2], /Cooking first/);
    assert.doesNotMatch(batch[2], /Ready soup|Ready first|Unpaid food|Served food/);
    assert.ok(html.indexOf(ready) < html.indexOf(batch[0]));
    assert.ok(html.indexOf(batch[0]) < html.indexOf(waiting));

    const empty = render([]);
    assert.match(empty, /ออเดอร์จะแสดงที่นี่หลังแคชเชียร์ยืนยันรับเงิน/);
    const onlyCooking = render([order('2008', 'cooking', 1000, 'Cooking only')]);
    assert.match(onlyCooking, /ดูกำลังทำ/);
  } finally {
    if (storage) Object.defineProperty(globalThis, 'localStorage', storage);
    else delete globalThis.localStorage;
    await server.close();
  }
});
