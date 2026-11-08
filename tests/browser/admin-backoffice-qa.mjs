// Isolated RPC fixture only. No shop writes, external requests or physical printing.
// Optionally set PLAYWRIGHT_MODULE and BROWSER_EXECUTABLE for an existing runtime.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import react from '@vitejs/plugin-react';
import QRCode from 'qrcode';
import { PNG } from 'pngjs';

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const root = fileURLToPath(new URL('../..', import.meta.url));
const server = await createServer({
  root, configFile: false, plugins: [react()], logLevel: 'error',
  define: { __LOCAL_MENU_HOST__: JSON.stringify(''), 'import.meta.env.VITE_PUBLIC_APP_URL': JSON.stringify('') },
  server: { host: '127.0.0.1', port: 0 },
});
let browser;
let origin;
const failures = [];

async function check(name, run) {
  const context = await browser.newContext();
  await context.route('**/*', route => route.request().url().startsWith(`${origin}/`) ? route.continue() : route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  try {
    await run(page);
    assert.deepEqual(errors, []);
    console.log(`PASS ${name}`);
  } catch (error) {
    failures.push(name);
    console.error(`FAIL ${name}: ${error.stack}`);
  } finally {
    await context.close();
  }
}

const open = (page, screen) => page.goto(`${origin}/tests/browser/cloud-runtime-qa.html#${screen}`);
async function refresh(page, changes) {
  const before = await page.evaluate(() => window.cloudQa.snapshots.length);
  await page.evaluate(changes => {
    Object.assign(window.cloudQa.shops.A.restaurants, changes);
    document.dispatchEvent(new Event('visibilitychange'));
  }, changes);
  await page.waitForFunction(before => window.cloudQa.snapshots.length > before, before);
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

try {
  await server.listen();
  origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.PLAYWRIGHT_EXECUTABLE, headless: true });

  await check('untouched shop fields follow snapshots without enabling Save', async page => {
    await open(page, 'settings');
    const fields = page.locator('.settings-shop input');
    await fields.first().waitFor();
    await refresh(page, { phone: '999', branch: 'Riverside' });
    assert.equal(await fields.nth(2).inputValue(), '999');
    assert.equal(await fields.nth(1).inputValue(), 'Riverside');
    assert.equal(await page.locator('.settings-shop button.primary').isDisabled(), true);
  });

  await check('saving a local name preserves a newer phone and payment-method update', async page => {
    await open(page, 'settings');
    const fields = page.locator('.settings-shop input');
    await fields.first().fill('Locally edited shop');
    await refresh(page, { phone: '999', payment_methods: ['cash'] });
    assert.equal(await fields.first().inputValue(), 'Locally edited shop');
    await page.locator('.settings-shop button.primary').click();
    await page.waitForFunction(() => window.cloudQa.commands.length === 1);
    const payload = await page.evaluate(() => window.cloudQa.commands[0].payload);
    assert.equal(payload.name, 'Locally edited shop');
    assert.equal(payload.phone, '999', 'saving a name must not revert another owner\'s phone');
    assert.deepEqual(payload.methods, ['cash']);
    assert.equal(await page.evaluate(() => window.cloudQa.shops.A.restaurants.phone), '999');
    await page.waitForFunction(() => document.querySelector('.settings-shop button.primary').disabled);
    await refresh(page, { name: 'Later remote name' });
    assert.equal(await fields.first().inputValue(), 'Later remote name', 'a saved field stops overriding newer snapshots');
  });

  await check('failed settings saves retain local inputs and retry with the latest untouched fields', async page => {
    await open(page, 'settings');
    const fields = page.locator('.settings-shop input');
    await fields.first().fill('Keep this draft');
    await page.evaluate(() => {
      const commands = window.cloudQa.commands;
      commands.push = function(command) {
        Array.prototype.push.call(this, command);
        this.push = Array.prototype.push;
        throw new Error('Isolated unavailable RPC');
      };
    });
    await page.locator('.settings-shop button.primary').click();
    await page.locator('.settings-shop .form-error').waitFor();
    assert.equal(await fields.first().inputValue(), 'Keep this draft');
    assert.equal(await page.locator('.settings-shop button.primary').isEnabled(), true);
    await refresh(page, { phone: '888' });
    assert.equal(await fields.first().inputValue(), 'Keep this draft');
    assert.equal(await fields.nth(2).inputValue(), '888');
    await page.locator('.settings-shop button.primary').click();
    await page.waitForFunction(() => window.cloudQa.commands.length === 2);
    const payload = await page.evaluate(() => window.cloudQa.commands[1].payload);
    assert.equal(payload.name, 'Keep this draft');
    assert.equal(payload.phone, '888');
    assert.equal(await page.locator('.settings-shop .form-error').count(), 0);
  });

  await check('edits made during a settings save survive its acknowledgement', async page => {
    await open(page, 'settings');
    const name = page.locator('.settings-shop input').first();
    await name.fill('First name');
    await page.evaluate(() => { window.cloudQa.holdCommand = true; });
    await page.locator('.settings-shop button.primary').click();
    await page.waitForFunction(() => typeof window.cloudQa.releaseCommand === 'function');
    assert.equal(await page.locator('.settings-shop button.primary').isDisabled(), true);
    await name.fill('Still editing');
    await page.evaluate(() => { window.cloudQa.holdCommand = false; window.cloudQa.releaseCommand(); });
    await page.waitForFunction(() => document.querySelector('.settings-shop').getAttribute('aria-busy') === 'false');
    assert.equal(await name.inputValue(), 'Still editing');
    assert.equal(await page.locator('.settings-shop button.primary').isEnabled(), true);
  });

  await check('bulk QR sheets print all cards with public keys and restore focus after closing', async page => {
    await open(page, 'table-setup');
    await page.locator('.setup-card').waitFor();
    await page.evaluate(() => {
      const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
      window.cloudQa.shops.A.dining_tables = Array.from({ length: 15 }, (_, index) => ({
        id: id(1001 + index), public_key: id(2001 + index), table_number: index + 1, seats: 4, zone: '', enabled: true,
      }));
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.waitForFunction(() => document.querySelectorAll('.setup-card').length === 15);
    const trigger = page.locator('.page-heading button.secondary');
    await trigger.click();
    const dialog = page.locator('.qr-sheet-dialog');
    await dialog.waitFor();
    await page.waitForFunction(() => document.querySelectorAll('.qr-sheet-card img').length === 15);
    assert.equal(await dialog.getAttribute('open'), '');
    assert.equal(await dialog.evaluate(node => node.contains(document.activeElement)), true, 'modal focus remains inside the sheet');
    for (const [index, source] of (await page.locator('.qr-sheet-card img').evaluateAll(images => images.map(image => image.src))).entries()) {
      const number = index + 1;
      const key = `00000000-0000-4000-8000-${String(2001 + index).padStart(12, '0')}`;
      const expected = await QRCode.toDataURL(`${origin}/tests/browser/cloud-runtime-qa.html?table=${number}&key=${key}#customer`, {
        width: 320, margin: 3, errorCorrectionLevel: 'M', color: { dark: '#172b23', light: '#ffffff' },
      });
      // Compare the QR mask: Brave may add tiny anti-fingerprinting noise to canvas colors.
      const pixels = url => {
        const { data } = PNG.sync.read(Buffer.from(url.split(',')[1], 'base64'));
        return Buffer.from(Array.from({ length: data.length / 4 }, (_, pixel) => data[pixel * 4] < 128 ? 1 : 0));
      };
      const digest = bytes => createHash('sha256').update(bytes).digest('hex');
      assert.equal(digest(pixels(source)), digest(pixels(expected)), `QR ${number} must encode that table's public key`);
    }
    await page.emulateMedia({ media: 'print' });
    assert.equal(await dialog.isVisible(), true, 'print CSS must leave the QR sheet visible');
    assert.equal(await page.locator('.qr-sheet-card').first().isVisible(), true);
    assert.equal(await page.locator('.main-content').isVisible(), false);
    assert.equal(await page.locator('.sidebar').isVisible(), false);
    assert.equal(await page.locator('.qr-sheet-actions').isVisible(), false);
    assert.equal(await dialog.locator('.dialog-head').isVisible(), false);
    const visibleBodyChildren = await page.evaluate(() => [...document.body.children].filter(node => node.getClientRects().length).map(node => node.className));
    assert.deepEqual(visibleBodyChildren, ['dialog qr-sheet-dialog'], 'the background app must not leave a blank print page');
    const pdf = await page.pdf({ format: 'A4', printBackground: true });
    const pdfSource = pdf.toString('latin1');
    assert.equal((pdfSource.match(/\/Type \/Page\b/g) ?? []).length, 2, 'fifteen cards should flow onto two pages without a blank first page');
    assert.equal((pdfSource.match(/\/Subtype \/Image\b/g) ?? []).length, 15, 'the PDF must embed every unique table QR image');
    await page.emulateMedia({ media: 'screen' });
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'detached' });
    assert.equal(await trigger.evaluate(node => node === document.activeElement), true);
  });
} finally {
  await browser?.close();
  await server.close();
}
if (failures.length) process.exitCode = 1;
