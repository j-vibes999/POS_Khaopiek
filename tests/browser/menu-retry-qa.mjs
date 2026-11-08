// Run with PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE pointing to the local test runtime.
// The fixture records commands in memory; it never contacts a shop or Supabase.
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../..', import.meta.url));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const server = await createServer({ root, configFile: false, plugins: [react()], server: { host: '127.0.0.1', port: 5237, strictPort: true }, logLevel: 'error' });
let browser;

try {
 await server.listen();
 browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE, headless: true });
 const page = await browser.newPage();
 const errors = [];
 page.on('pageerror', error => errors.push(error.message));
 page.setDefaultTimeout(10000);
 await page.goto('http://127.0.0.1:5237/tests/browser/menu-editor-qa.html');
 const dialog = page.locator('dialog');
 const name = page.locator('.menu-name-field input');
 const price = page.locator('.menu-price-field input');
 const save = page.locator('.menu-save-button');
 const selectPhoto = async filename => {
  await page.locator('input[type=file]').first().setInputFiles(`${root}/public/images/${filename}`);
  await page.waitForFunction(() => !document.querySelector('.menu-save-button').disabled);
 };

 await dialog.waitFor({ state: 'visible' });
 await name.fill('ເຝີ');
 await price.fill('35000');
 await selectPhoto('pho.jpg');
 const selectedPhoto = await page.locator('.menu-photo-preview img').getAttribute('src');
 for (const input of [page.locator('input[type=file]').first(), page.locator('input[capture]')]) {
  await input.dispatchEvent('cancel', { bubbles: true, cancelable: false });
  assert.equal(await dialog.isVisible(), true, 'file/camera picker cancellation must keep the menu draft');
  assert.equal(await name.inputValue(), 'ເຝີ');
  assert.equal(await price.inputValue(), '35000');
  assert.equal(await page.locator('.menu-photo-preview img').getAttribute('src'), selectedPhoto);
 }
 await page.evaluate(() => { window.menuQa.loseSaveAck = true; });
 await save.click();
 await page.getByRole('alert').filter({ hasText: 'บันทึกไม่สำเร็จ' }).waitFor();
 const first = await page.evaluate(() => window.menuQa.saves[0]);
 assert.match(first.creationId ?? '', uuid, 'a new dish needs a cryptographic UUID before its first save');
 assert.equal(Object.hasOwn(first, 'id'), false);

 // A lost acknowledgment must keep the same identity even if the draft changes.
 await name.fill('ເຝີພິເສດ');
 await price.fill('40000');
 await selectPhoto('coffee.jpg');
 await save.click();
 await dialog.waitFor({ state: 'detached' });
 const retry = await page.evaluate(() => window.menuQa.saves[1]);
 assert.equal(retry.creationId, first.creationId, 'retry identity must survive field and photo changes');
 assert.equal(retry.lo, 'ເຝີພິເສດ');
 assert.equal(retry.price, 40000);
 assert.equal(await page.evaluate(() => window.menuQa.uploads), 2);

 await page.locator('#open-menu-editor').click();
 await name.fill('ກາເຟ');
 await price.fill('20000');
 await save.click();
 await dialog.waitFor({ state: 'detached' });
 const nextDraft = await page.evaluate(() => window.menuQa.saves[2]);
 assert.match(nextDraft.creationId ?? '', uuid);
 assert.notEqual(nextDraft.creationId, first.creationId, 'a separately opened draft must create another dish');

 const existingId = '41000000-0000-4000-8000-000000000001';
 await page.evaluate(id => { window.menuQa.initial = { id, lo: 'ເຝີ', price: 35000, category: 'pho', image: '/images/pho.jpg', available: false, creationId: 'stale-creation-id' }; }, existingId);
 await page.locator('#open-menu-editor').click();
 await name.fill('ເຝີຊີ້ນ');
 await save.click();
 await dialog.waitFor({ state: 'detached' });
 const edit = await page.evaluate(() => window.menuQa.saves[3]);
 assert.equal(edit.id, existingId);
 assert.equal(Object.hasOwn(edit, 'creationId'), false, 'edits identify their existing dish');
 assert.equal(Object.hasOwn(edit, 'available'), false, 'editing a photo/name must not overwrite live availability');
 await page.locator('#open-menu-editor').click();
 await page.keyboard.press('Escape');
 await dialog.waitFor({ state: 'detached' });
 assert.deepEqual(errors, []);
 console.log('PASS lost-ack retry preserves creation identity through field/photo changes; separate drafts use different UUIDs; existing edits omit creation identity and stale availability.');
} finally {
 await browser?.close();
 await server.close();
}
