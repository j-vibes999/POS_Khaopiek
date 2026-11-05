import test from 'node:test';
import assert from 'node:assert/strict';
import * as checkout from '../src/customer-model.mjs';

const bowl = () => ({ id: 'pork', key: 'pork-1', lo: 'ເຂົ້າປຽກໝູ', th: 'ข้าวเปียกหมู', size: 'regular', price: 35000, quantity: 2, noHerbs: false, customizationNote: '', note: '', noteTh: '' });
function session() {
  return { ...checkout.restoreDemoSession(null, []), drafts: {
    3: { cart: [bowl()], method: 'cash' },
    7: { cart: [bowl()], method: 'cash' },
  } };
}
function storage() {
  const values = new Map();
  return {
    writes: 0, blocked: false,
    getItem: key => values.get(key) ?? null,
    setItem(key, value) { if (this.blocked) throw new Error('Storage full'); this.writes++; values.set(key, value); },
  };
}
const changeItem = changes => current => ({ ...current, drafts: { ...current.drafts, 3: { ...current.drafts[3], cart: [{ ...current.drafts[3].cart[0], ...changes }] } } });

test('confirmed checkout only accepts the basket and payment method that were reviewed', async t => {
  assert.equal(typeof checkout.checkoutReviewKey, 'function', 'checkout exposes a stable fingerprint for the reviewed basket');
  const { checkoutReviewKey, commitCheckout, persistDemoSession, restoreDemoSession, updateDemoSession } = checkout;

  for (const [name, mutate, target = 3] of [
    ['quantity', changeItem({ quantity: 3 })],
    ['note', changeItem({ note: 'No ice', noteTh: 'ไม่ใส่น้ำแข็ง' })],
    ['customization note', changeItem({ customizationNote: 'Separate soup' })],
    ['quoted price', changeItem({ price: 45000 })],
    ['food options', changeItem({ noHerbs: true, size: 'large' })],
    ['selected table', current => current, 7],
    ['payment method', current => ({ ...current, drafts: { ...current.drafts, 3: { ...current.drafts[3], method: 'transfer' } } })],
    ['enabled payment method', current => ({ ...current, settings: { ...current.settings, methods: ['transfer'] } })],
    ['cleared basket', current => ({ ...current, drafts: { ...current.drafts, 3: { ...current.drafts[3], cart: [] } } })],
  ]) {
    await t.test(`a changed ${name} is rejected without creating an order or writing storage`, () => {
      const browser = storage();
      persistDemoSession(browser, session());
      const reviewed = restoreDemoSession(browser, []);
      const key = checkoutReviewKey(3, reviewed.drafts[3].cart, 'cash');
      updateDemoSession(browser, reviewed, mutate);
      const latest = restoreDemoSession(browser, []);
      const writes = browser.writes;
      assert.throws(() => commitCheckout(browser, latest, target, 'qr', 123456, key), error => error.code === 'cart-changed');
      assert.equal(browser.writes, writes);
      const restored = restoreDemoSession(browser, []);
      assert.equal(restored.orders.length, 0);
      assert.deepEqual(restored.drafts, latest.drafts);
    });
  }

  await t.test('an unchanged review survives reload and accepts exactly one order', () => {
    const browser = storage();
    persistDemoSession(browser, session());
    const reviewed = restoreDemoSession(browser, []);
    const key = checkoutReviewKey(3, reviewed.drafts[3].cart, 'cash');
    const reordered = reviewed.drafts[3].cart.map(item => Object.fromEntries(Object.entries(item).reverse()));
    assert.equal(checkoutReviewKey(3, reordered, 'cash'), key, 'property order does not change the reviewed content');
    const before = browser.writes;
    const result = commitCheckout(browser, restoreDemoSession(browser, []), 3, 'qr', 123456, key);
    assert.equal(browser.writes, before + 1);
    const saved = restoreDemoSession(browser, []);
    assert.equal(saved.orders.length, 1);
    assert.equal(saved.orders[0].id, result.orderId);
    assert.deepEqual(saved.orders[0].items, reviewed.drafts[3].cart);
    assert.equal(saved.orders[0].method, 'cash');
    assert.deepEqual(saved.drafts[3].cart, []);
    assert.throws(() => commitCheckout(browser, saved, 3, 'qr', 123457, key), error => error.code === 'cart-changed');
    assert.equal(browser.writes, before + 1);
  });

  await t.test('failed persistence preserves the confirmed basket and allows the same review to retry', () => {
    const browser = storage();
    persistDemoSession(browser, session());
    const reviewed = restoreDemoSession(browser, []);
    const key = checkoutReviewKey(3, reviewed.drafts[3].cart, 'cash');
    const before = browser.writes;
    browser.blocked = true;
    assert.throws(() => commitCheckout(browser, reviewed, 3, 'qr', 123456, key), /Storage full/);
    assert.equal(browser.writes, before);
    const unchanged = restoreDemoSession(browser, []);
    assert.deepEqual(unchanged.drafts[3], reviewed.drafts[3]);
    assert.equal(unchanged.orders.length, 0);
    browser.blocked = false;
    commitCheckout(browser, unchanged, 3, 'qr', 123457, key);
    assert.equal(restoreDemoSession(browser, []).orders.length, 1);
  });

  await t.test('the reviewed effective payment fallback is accepted without changing the stored preference first', () => {
    const browser = storage();
    const current = session();
    current.settings.methods = ['transfer'];
    const key = checkoutReviewKey(3, current.drafts[3].cart, 'transfer');
    const result = commitCheckout(browser, current, 3, 'qr', 123456, key);
    assert.equal(result.session.orders[0].method, 'transfer');
  });
});
