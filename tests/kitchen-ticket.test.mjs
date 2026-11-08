import test from 'node:test';
import assert from 'node:assert/strict';
import { printKitchenTicket } from '../src/kitchen-ticket.mjs';

const order = {
  id: '1042', table: 3, paid: true, status: 'queued', createdAt: 0, paidAt: Date.UTC(2026, 10, 5, 10, 4),
  items: [
    { lo: 'ເຝີ', th: 'เฝอ', quantity: 2, size: 'large', category: 'pho', note: 'ບໍ່ໃສ່ຜັກ', noteTh: 'ไม่ใส่ผัก <img src=x onerror=alert(1)>' },
    { lo: 'ນ້ຳຊາ', th: 'ชา', quantity: 1, category: 'drinks' },
  ],
};

function setupPreview(t, { blocked = false, fontsReady, printError } = {}) {
  let markup = '';
  let opens = 0;
  let prints = 0;
  let clickPrint;
  const button = { addEventListener(_name, listener) { clickPrint = listener; } };
  const preview = {
    document: {
      open() {}, write(html) { markup = html; }, close() {}, readyState: 'complete',
      querySelector() { return button; }, body: { offsetHeight: 1 },
      ...(fontsReady && { fonts: { ready: fontsReady } }),
    },
    focus() {}, print() { if (printError) throw printError; prints++; }, close() { this.closed = true; },
  };
  const before = Object.getOwnPropertyDescriptor(globalThis, 'window');
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    location: { href: 'http://localhost:5173/#orders' },
    open() { opens++; return blocked ? null : preview; },
  } });
  t.after(() => {
    if (before) Object.defineProperty(globalThis, 'window', before);
    else delete globalThis.window;
  });
  return { get markup() { return markup; }, get opens() { return opens; }, get prints() { return prints; }, get closed() { return preview.closed; }, clickPrint: () => clickPrint() };
}

test('payment must be confirmed before a kitchen ticket can open', t => {
  const preview = setupPreview(t);
  for (const unconfirmed of [{ ...order, paid: false }, { ...order, status: 'pending' }]) {
    assert.throws(() => printKitchenTicket(unconfirmed), { code: 'order-unconfirmed' });
  }
  assert.equal(preview.opens, 0);
});

test('prints a paid ticket with localized details and treats kitchen notes as plain text', t => {
  const preview = setupPreview(t);
  printKitchenTicket(order, { shopName: 'Khao & Piek', language: 'th' });
  assert.equal(preview.opens, 1);
  assert.equal(preview.prints, 1);
  assert.match(preview.markup, /ใบงานครัว/);
  assert.match(preview.markup, /โต๊ะ 03/);
  assert.match(preview.markup, /#1042/);
  assert.match(preview.markup, /17:04/);
  assert.match(preview.markup, /2 ×/);
  assert.match(preview.markup, /เฝอ/);
  assert.match(preview.markup, /พิเศษ/);
  assert.match(preview.markup, /ไม่ใส่ผัก &lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(preview.markup, /Khao &amp; Piek/);
  assert.doesNotMatch(preview.markup, /<img/);
});

test('opens immediately from the click and waits for ticket fonts before printing', async t => {
  let loadFonts;
  const fontsReady = new Promise(resolve => { loadFonts = resolve; });
  const preview = setupPreview(t, { fontsReady });
  printKitchenTicket(order);
  assert.equal(preview.opens, 1);
  assert.equal(preview.prints, 0);
  loadFonts();
  await fontsReady;
  assert.equal(preview.prints, 1);
});

test('kitchen dispatch waits until the print request is made, without a second cashier action', async t => {
  let loadFonts;
  const fontsReady = new Promise(resolve => { loadFonts = resolve; });
  const preview = setupPreview(t, { fontsReady });
  let sent = false;
  const printing = printKitchenTicket(order);
  assert.equal(typeof printing?.then, 'function');
  const sentAfterPrint = printing.then(() => { sent = true; });
  await Promise.resolve();
  assert.equal(sent, false);
  assert.equal(preview.prints, 0);
  loadFonts();
  await sentAfterPrint;
  assert.equal(sent, true);
  assert.equal(preview.prints, 1);
});

test('a failed print request is reported rather than marking the kitchen ticket sent', async t => {
  let loadFonts;
  const fontsReady = new Promise(resolve => { loadFonts = resolve; });
  const printError = new Error('Printer dialog unavailable');
  setupPreview(t, { fontsReady, printError });
  const printing = printKitchenTicket(order);
  assert.equal(typeof printing?.then, 'function');
  const failed = assert.rejects(printing, error => error === printError);
  loadFonts();
  await failed;
});

test('a timed out preview cannot print later after the cashier retries', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let loadFonts;
  const fontsReady = new Promise(resolve => { loadFonts = resolve; });
  const preview = setupPreview(t, { fontsReady });
  const printing = printKitchenTicket(order);
  const failed = assert.rejects(printing, { code: 'print-blocked' });
  t.mock.timers.tick(15000);
  await failed;
  loadFonts();
  await fontsReady;
  preview.clickPrint();
  assert.equal(preview.prints, 0);
  assert.equal(preview.closed, true);
});

test('reports a blocked print window so a paid order can be reprinted later', t => {
  setupPreview(t, { blocked: true });
  assert.throws(() => printKitchenTicket(order), { code: 'print-blocked' });
});

test('reprinted Lao kitchen tickets are marked as copies', t => {
  const preview = setupPreview(t);
  printKitchenTicket(order, { copy: true });
  assert.match(preview.markup, /ສຳເນົາ · ພິມຊ້ຳ/);
  assert.match(preview.markup, /ໂຕະ 03/);
  assert.match(preview.markup, /ບໍ່ໃສ່ຜັກ/);
});
