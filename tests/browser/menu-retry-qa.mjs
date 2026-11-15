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
 const fixture = 'http://127.0.0.1:5237/tests/browser/menu-editor-qa.html';
 await page.route('**/*', route => route.request().url().startsWith('http://127.0.0.1:5237/') ? route.continue() : route.abort());
 await page.goto(fixture);
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
  assert.equal(await price.inputValue(), '35,000');
  assert.equal(await page.locator('.menu-photo-preview img').getAttribute('src'), selectedPhoto);
  assert.equal(await page.getByRole('button', { name: 'ออกโดยไม่บันทึก' }).count(), 0);
 }
 await page.keyboard.press('Escape');
 await page.getByRole('button', { name: 'แก้ไขต่อ' }).waitFor({ timeout: 1500 });
 assert.equal(await name.inputValue(), 'ເຝີ');
 assert.equal(await price.inputValue(), '35,000');
 assert.equal(await page.getByRole('button', { name: 'แก้ไขต่อ' }).evaluate(button => document.activeElement === button), true);
 await page.getByRole('button', { name: 'แก้ไขต่อ' }).click();
 assert.equal(await page.locator('.menu-photo-preview img').getAttribute('src'), selectedPhoto);
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
 assert.equal(await price.inputValue(), '35,000', 'stored prices open with grouping immediately');
 assert.equal(await dialog.locator('input[type=url], .menu-photo-url').count(), 0);
 await price.fill('35000.25');
 await save.click();
 await page.getByRole('alert').filter({ hasText: 'ใส่ราคาเป็นจำนวนเต็ม' }).waitFor();
 assert.equal(await page.evaluate(() => window.menuQa.saves.length), 3, 'fractional prices must not reach the save command');
 await price.fill('');
 await price.pressSequentially('50,25');
 await save.click();
 await page.getByRole('alert').filter({ hasText: 'ใส่ราคาเป็นจำนวนเต็ม' }).waitFor();
 assert.equal(await page.evaluate(() => window.menuQa.saves.length), 3, 'a typed decimal comma must not silently change the amount');
 await price.evaluate(input => {
  input.select();
  const data = new DataTransfer();
  data.setData('text/plain', '50.000,00');
  input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
 });
 assert.equal(await price.inputValue(), '50,000');
 await price.evaluate(input => input.setSelectionRange(1, 1));
 await price.press('1');
 assert.equal(await price.inputValue(), '510,000');
 assert.equal(await price.evaluate(input => input.selectionStart), 2, 'typing before a comma must keep the caret beside the edit');
 await price.press('Backspace');
 assert.equal(await price.inputValue(), '50,000');
 await name.fill('ເຝີຊີ້ນ');
 await save.click();
 await dialog.waitFor({ state: 'detached' });
 const edit = await page.evaluate(() => window.menuQa.saves[3]);
 assert.equal(edit.id, existingId);
 assert.equal(edit.price, 50000);
 assert.equal(edit.image, '/images/pho.jpg', 'saving another field keeps the existing photo');
 assert.equal(Object.hasOwn(edit, 'creationId'), false, 'edits identify their existing dish');
 assert.equal(Object.hasOwn(edit, 'available'), false, 'editing a photo/name must not overwrite live availability');
 await page.locator('#open-menu-editor').click();
 await page.keyboard.press('Escape');
 await dialog.waitFor({ state: 'detached' });
 console.log('PASS menu retry, picker cancellation, whole-kip editing with grouping, and retaining an existing photo.');

 await page.setViewportSize({ width: 360, height: 640 });
 await page.locator('#open-menu-editor').click();
 await dialog.waitFor({ state: 'visible' });
 const mobileTop = async locator => (await locator.boundingBox()).y;
 assert.ok(await mobileTop(page.locator('.menu-category-field')) < await mobileTop(page.locator('.menu-photo-editor')), 'mobile editor shows required category above optional photo');
 await name.focus();
 await page.keyboard.press('Tab');
 assert.equal(await price.evaluate(input => document.activeElement === input), true);
 await name.fill('ຊື່ຊົ່ວຄາວ');
 await dialog.locator('.dialog-head button').click();
 await page.getByRole('button', { name: 'ออกโดยไม่บันทึก' }).click();
 await dialog.waitFor({ state: 'detached' });
 assert.equal(await page.locator('#open-menu-editor').evaluate(button => document.activeElement === button), true);
 console.log('PASS mobile required fields and tab order lead the photo; explicit discard returns focus to the opener.');

 for (const width of [360, 900, 1440]) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(fixture + '?list');
  const soldOut = page.getByRole('button', { name: /^เมนูหมด/ });
  await soldOut.click({ timeout: 1500 });
  assert.equal(await soldOut.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.locator('.dish-card').count(), 2);
  await page.getByRole('button', { name: /^เฝอ/ }).click();
  assert.equal(await page.locator('.dish-card').count(), 1);
  const query = page.getByRole('searchbox');
  await query.fill('เฝอไก่');
  assert.equal(await page.locator('.dish-card').count(), 0);
  await query.fill('เฝอเนื้อ');
  await page.getByRole('checkbox', { name: /เฝอเนื้อ/ }).click();
  await page.locator('.dish-card').waitFor({ state: 'detached' });
  assert.match(await soldOut.innerText(), /1/);
  await soldOut.click();
  assert.equal(await page.locator('.dish-card').count(), 1);
  assert.equal(await page.locator('.dish-card.is-sold-out').count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), width);
 }
 console.log('PASS sold-out filter combines with category and search on mobile, tablet and desktop, and responds to reopening a dish.');
 assert.deepEqual(errors, []);
} finally {
 await browser?.close();
 await server.close();
}
