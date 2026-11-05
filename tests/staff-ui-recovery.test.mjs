import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { persistDemoSession, restoreDemoSession, updateDemoSession } from '../src/customer-model.mjs';

test('staff controls preserve drafts and distinguish dialog padding from its backdrop', async t => {
  const server = await createServer({
    root: fileURLToPath(new URL('..', import.meta.url)), configFile: false, appType: 'custom',
    optimizeDeps: { noDiscovery: true, include: [] }, server: { middlewareMode: true, watch: null, ws: false },
  });
  try {
    const { isDialogBackdropClick } = await server.ssrLoadModule('/src/staff-ui.jsx');
    const { savePosCart, restorePosCart } = await server.ssrLoadModule('/src/PosOrder.jsx');

    await t.test('clicks inside dialog padding keep the dialog open while outside clicks dismiss it', () => {
      const dialog = { getBoundingClientRect: () => ({ left: 100, top: 100, right: 500, bottom: 600 }) };
      const click = (clientX, clientY, target = dialog) => ({ clientX, clientY, target, currentTarget: dialog });
      assert.equal(isDialogBackdropClick(click(105, 150)), false);
      assert.equal(isDialogBackdropClick(click(300, 595)), false);
      assert.equal(isDialogBackdropClick(click(90, 150)), true);
      assert.equal(isDialogBackdropClick(click(300, 610)), true);
      assert.equal(isDialogBackdropClick(click(90, 150, {})), false);
    });

    await t.test('a blocked draft write leaves saved quantities intact and can be retried once', () => {
      let value = null;
      let blocked = false;
      const storage = {
        getItem: () => value,
        setItem: (key, next) => { if (blocked) throw new Error('Storage blocked'); value = next; },
      };
      let session = restoreDemoSession(storage, []);
      session.drafts[3] = { method: 'cash', cart: [{ id: 'pork', price: 35000, quantity: 2, note: 'No herbs', key: 'pork' }] };
      persistDemoSession(storage, session);
      const save = transform => {
        session = updateDemoSession(storage, session, current => ({ ...current, drafts: { ...current.drafts, 3: transform(current.drafts[3]) } }));
      };
      const addOne = rows => rows.map(row => ({ ...row, quantity: row.quantity + 1 }));
      blocked = true;
      assert.equal(savePosCart(save, addOne), false);
      assert.equal(session.drafts[3].cart[0].quantity, 2);
      assert.equal(JSON.parse(value).drafts[3].cart[0].quantity, 2);
      blocked = false;
      assert.equal(savePosCart(save, addOne), true);
      assert.equal(JSON.parse(value).drafts[3].cart[0].quantity, 3);
      assert.equal(session.drafts[3].method, 'cash');
      assert.equal(session.drafts[3].cart[0].note, 'No herbs');
    });

    await t.test('a failed note is saved before a later quantity change instead of being discarded', () => {
      let value = null;
      let blocked = false;
      const storage = {
        getItem: () => value,
        setItem: (key, next) => { if (blocked) throw new Error('Storage blocked'); value = next; },
      };
      let session = restoreDemoSession(storage, []);
      session.drafts[3] = { method: 'cash', cart: [{ id: 'tea', price: 15000, quantity: 2, note: '', customizationNote: '', key: 'tea' }] };
      persistDemoSession(storage, session);
      const save = transform => {
        session = updateDemoSession(storage, session, current => ({ ...current, drafts: { ...current.drafts, 3: transform(current.drafts[3]) } }));
      };
      const pending = { current: null };
      const writeNote = rows => rows.map(row => ({ ...row, note: 'No ice', customizationNote: 'No ice' }));
      const addOne = rows => rows.map(row => ({ ...row, quantity: row.quantity + 1 }));
      let noteSaved = 0;
      blocked = true;
      assert.equal(savePosCart(save, writeNote, pending, () => noteSaved++), false);
      assert.equal(savePosCart(save, addOne, pending), false);
      assert.equal(JSON.parse(value).drafts[3].cart[0].quantity, 2);
      blocked = false;
      assert.equal(savePosCart(save, addOne, pending), true);
      const saved = JSON.parse(value).drafts[3];
      assert.equal(saved.cart[0].note, 'No ice');
      assert.equal(saved.cart[0].customizationNote, 'No ice');
      assert.equal(saved.cart[0].quantity, 3);
      assert.equal(saved.method, 'cash');
      assert.equal(noteSaved, 1, 'the note editor closes only after its note is saved');
    });

    await t.test('undoing a clear restores choices alongside newly added food without combining different quoted prices', () => {
      const current = [{ id: 'pork', size: 'regular', note: '', price: 55000, quantity: 1, key: 'new' }];
      const removed = [
        { id: 'pork', size: 'regular', note: '', price: 35000, quantity: 2, key: 'old' },
        { id: 'tea', size: 'regular', note: 'No ice', customizationNote: 'No ice', price: 15000, quantity: 3, key: 'tea' },
      ];
      const restored = restorePosCart(current, removed);
      assert.deepEqual(restored.map(({ id, price, quantity, note }) => ({ id, price, quantity, note })), [
        { id: 'pork', price: 55000, quantity: 1, note: '' },
        { id: 'pork', price: 35000, quantity: 2, note: '' },
        { id: 'tea', price: 15000, quantity: 3, note: 'No ice' },
      ]);
      assert.equal(restored[2].customizationNote, 'No ice');
      assert.equal(current.length, 1);
    });
  } finally {
    await server.close();
  }
});
