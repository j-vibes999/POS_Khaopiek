// Production-only, synthetic-data performance comparison. No shop/auth writes.
// Example: PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs BROWSER_EXECUTABLE=/path/to/browser node tests/browser/performance-qa.mjs --dist dist --label after --output .local/performance/after.json --baseline .local/performance/before.json --assert-split --polling
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, stat, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { gzipSync } from 'node:zlib';

const args = process.argv.slice(2);
const option = (key, fallback) => args.includes(key) ? args[args.indexOf(key) + 1] : fallback;
const buildRoot = resolve(option('--dist', 'dist'));
const output = resolve(option('--output', '.local/performance/result.json'));
const runs = Number(option('--runs', '3'));
const label = option('--label', 'current');
const fixtureImageRoot = args.includes('--image-root') ? resolve(option('--image-root')) : null;
const enforceSplit = args.includes('--assert-split');
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || 'playwright');
const tableKey = '414850e2-6b8d-4694-a763-ae7cdcd6bde6';
const id = n => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const photos = ['khao-piak.jpg', 'pho.jpg', 'coffee.jpg', 'drink.jpg', 'noodles.jpg', 'soup.jpg'];
const dishes = Array.from({ length: 24 }, (_, i) => ({
  id: id(100 + i), lo: `ເຂົ້າປຽກ ${i + 1}`, th: `ข้าวเปียก ${i + 1}`, en: `Noodle bowl ${i + 1}`,
  category: ['khao', 'pho', 'drinks', 'other'][Math.floor(i / 6)], image: `/images/${photos[i % photos.length]}`,
  price: 30000 + i * 1000, popular: i === 0, available: true, detailLo: 'ເສັ້ນສົດ ນ້ຳຊຸບຮ້ອນ', detailTh: 'เส้นสด น้ำซุปร้อน',
}));
const member = { id: id(2), user_id: null, display_name: 'Performance fixture', role: 'owner', active: true };
const snapshot = {
  restaurantId: id(1), membership: member, members: [member],
  restaurants: { id: id(1), name: 'Performance Fixture', branch: 'Main', phone: '', payment_methods: ['transfer', 'cash'] },
  dining_tables: Array.from({ length: 12 }, (_, i) => ({ id: id(20 + i), public_key: i ? id(40 + i) : tableKey, table_number: i + 1, seats: 4, zone: '', enabled: true })),
  menu_items: dishes.map(dish => ({ id: dish.id, name_lo: dish.lo, name_th: dish.th, name_en: dish.en, category: dish.category, image_path: dish.image, price: dish.price, popular: dish.popular, available: true })),
  orders: [], calls: [], shifts: [], payments: [], activity_log: [],
};
const schema = { schemaVersion: 2, guestOrdersReady: true, paymentsReady: true, deviceAccessReady: true, integrityReady: true };
const rpcValue = name => {
  if (name === 'pos_setup_status') return schema;
  if (name === 'pos_get_menu') return { table: 1, shopName: 'Performance Fixture', menu: dishes, methods: ['transfer', 'cash'] };
  if (name === 'pos_guest_orders') return { orders: [], matchedOrder: null, call: null };
  if (name === 'pos_staff_snapshot') return snapshot;
  throw new Error(`Unexpected RPC: ${name}`);
};
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml' };
const fileCache = new Map();
const server = createServer(async (req, res) => {
  try {
    const pathname = new URL(req.url, 'http://fixture.local').pathname;
    if (pathname === '/api/device/status') {
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ enabled: true })); return;
    }
    if (pathname === '/api/device/rpc') {
      let body = ''; for await (const chunk of req) body += chunk;
      const { name } = JSON.parse(body);
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      res.end(JSON.stringify({ data: rpcValue(name), error: null })); return;
    }
    const assetRoot = fixtureImageRoot && pathname.startsWith('/images/') ? fixtureImageRoot : buildRoot;
    let filename = resolve(assetRoot, fixtureImageRoot && pathname.startsWith('/images/') ? decodeURIComponent(pathname.slice('/images/'.length)) : `.${decodeURIComponent(pathname)}`);
    if (filename !== assetRoot && !filename.startsWith(assetRoot + sep)) throw new Error('path');
    try { if ((await stat(filename)).isDirectory()) filename = resolve(filename, 'index.html'); }
    catch { filename = resolve(buildRoot, 'index.html'); }
    if (!fileCache.has(filename)) {
      const body = await readFile(filename);
      const type = mime[extname(filename)] || 'application/octet-stream';
      const compressible = /javascript|text|svg/.test(type);
      fileCache.set(filename, { body, gzip: compressible ? gzipSync(body) : null, type });
    }
    const file = fileCache.get(filename);
    const gzip = file.gzip && req.headers['accept-encoding']?.includes('gzip');
    const body = gzip ? file.gzip : file.body;
    res.writeHead(200, { 'content-type': file.type, 'content-length': body.length,
      'cache-control': filename.endsWith('index.html') ? 'no-store' : 'public, max-age=31536000, immutable',
      ...(gzip && { 'content-encoding': 'gzip', vary: 'Accept-Encoding' }),
    }); res.end(body);
  } catch (error) { res.writeHead(500); res.end(error.message); }
});
await new Promise(resolveListen => server.listen(0, '127.0.0.1', resolveListen));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE || process.env.PLAYWRIGHT_EXECUTABLE, headless: true });
const report = { label, buildRoot, configuration: { viewport: '390x844', cpuSlowdown: 4, network: { latencyMs: 150, downloadMbps: 1.6, uploadKbps: 750 }, compression: 'gzip text; native font/image compression', fixture: '24 menu items, 12 empty staff tables; synthetic RPC only', fixtureImageRoot, runs, timingCaveat: 'Lab timings; API responses synthetic. Compare payload sizes deterministically; timing medians are directional.' }, samples: [], assertions: {} };
const staffChunk = /\/(?:StaffEntry|StaffViews|CloudApp|BackOffice|MenuAdmin|PosOrder|TablesScreen|staff-ui)[-./]/i;
const summarize = entries => {
  const result = { requests: entries.length, encodedBytes: 0, decodedBytes: 0, transferBytes: 0 };
  for (const e of entries) { result.encodedBytes += e.encodedBodySize; result.decodedBytes += e.decodedBodySize; result.transferBytes += e.transferSize; }
  return result;
};
async function createPage({ throttled = true } = {}) {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
  const rpc = [];
  await context.route('**/*', async route => {
    const request = route.request();
    if (request.url().startsWith(origin)) { await route.continue(); return; }
    const match = request.url().match(/\/rest\/v1\/rpc\/([a-z_]+)/);
    if (!match) { await route.abort(); return; }
    rpc.push({ name: match[1], at: Date.now() });
    try {
      await new Promise(resolveDelay => setTimeout(resolveDelay, 150));
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(rpcValue(match[1])) });
    } catch (error) { await route.fulfill({ status: 400, contentType: 'application/json', body: JSON.stringify({ message: error.message }) }); }
  });
  const page = await context.newPage();
  page.setDefaultTimeout(45000);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.addInitScript(() => {
    window.performanceQa = { lcp: null, ready: null };
    new PerformanceObserver(list => {
      const entry = list.getEntries().at(-1);
      window.performanceQa.lcp = { ms: entry.startTime, size: entry.size, element: entry.element?.tagName, url: entry.url ? new URL(entry.url).pathname : null };
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    const observer = new MutationObserver(() => {
      if (window.performanceQa.ready === null && document.querySelector('.dining-food, .app.cloud-app')) window.performanceQa.ready = performance.now();
    }); observer.observe(document, { subtree: true, childList: true });
  });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  if (throttled) {
    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1000000 / 8, uploadThroughput: 750000 / 8, connectionType: 'cellular3g' });
  }
  return { context, page, errors, rpc };
}
async function measure(routeName, run) {
  const { context, page, errors, rpc } = await createPage();
  try {
    await page.goto(`${origin}/${routeName === 'guest' ? `?table=1&key=${tableKey}` : '#tables'}`, { waitUntil: 'load' });
    await page.locator(routeName === 'guest' ? '.dining-food' : '.app.cloud-app').first().waitFor();
    if (routeName === 'guest') assert.equal(await page.locator('.dining-food').count(), 24);
    await page.evaluate(() => document.fonts.ready);
    await page.waitForFunction(() => [...document.images].filter(img => { const r = img.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).every(img => img.complete));
    await page.waitForTimeout(1250);
    const data = await page.evaluate(() => ({ ...window.performanceQa,
      fcpMs: performance.getEntriesByName('first-contentful-paint')[0]?.startTime ?? null,
      visual: { language: document.documentElement.lang, fontsReady: document.fonts.status === 'loaded', horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth) },
      resources: performance.getEntriesByType('resource').filter(e => new URL(e.name).origin === location.origin).map(e => ({ path: new URL(e.name).pathname, initiatorType: e.initiatorType, encodedBodySize: e.encodedBodySize, decodedBodySize: e.decodedBodySize, transferSize: e.transferSize })),
    }));
    assert.deepEqual(errors, [], `${routeName} must render without uncaught errors`);
    const groups = {
      js: summarize(data.resources.filter(e => /\.js$/.test(e.path))),
      css: summarize(data.resources.filter(e => /\.css$/.test(e.path))),
      fonts: summarize(data.resources.filter(e => /\.(?:ttf|woff2?)$/.test(e.path))),
      images: summarize(data.resources.filter(e => /\.(?:jpg|png|webp|svg)$/.test(e.path))),
    };
    const sample = { route: routeName, run, readyMs: data.ready, fcpMs: data.fcpMs, lcp: data.lcp, visual: data.visual, ...groups, total: summarize(data.resources), resources: data.resources, rpc: rpc.map(({ name }) => name), errors };
    report.samples.push(sample);
    if (run === runs) await page.screenshot({ path: resolve(dirname(output), `${label}-${routeName}.png`), fullPage: false });
    console.log(`${label} ${routeName} ${run}/${runs}: JS ${groups.js.encodedBytes} B, CSS ${groups.css.encodedBytes} B, fonts ${groups.fonts.encodedBytes} B, ready ${Math.round(data.ready)} ms, LCP ${Math.round(data.lcp?.ms)} ms`);
  } finally { await context.close(); }
}
try {
  await mkdir(dirname(output), { recursive: true });
  for (let run = 1; run <= runs; run++) { await measure('guest', run); await measure('staff', run); }
  const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
  report.medians = Object.fromEntries(['guest', 'staff'].map(route => {
    const samples = report.samples.filter(sample => sample.route === route);
    return [route, { readyMs: median(samples.map(s => s.readyMs)), fcpMs: median(samples.map(s => s.fcpMs)), lcpMs: median(samples.map(s => s.lcp?.ms)), js: samples[0].js, css: samples[0].css, fonts: samples[0].fonts, images: samples[0].images, total: samples[0].total }];
  }));
  const guest = report.samples.filter(s => s.route === 'guest');
  const staffOnlyRequested = guest.flatMap(s => s.resources.map(e => e.path)).filter(path => staffChunk.test(path));
  const guestCssHasStaffSelectors = await Promise.all([...new Set(guest.flatMap(s => s.resources.filter(e => /\.css$/.test(e.path)).map(e => e.path)))].map(async path => {
    const css = await readFile(resolve(buildRoot, `.${path}`), 'utf8');
    return /\.table-workspace|\.settings-shop|\.pos-checkout|\.cloud-access-card/.test(css);
  }));
  const guestJsHasStaffViews = await Promise.all([...new Set(guest.flatMap(s => s.resources.filter(e => /\.js$/.test(e.path)).map(e => e.path)))].map(async path => {
    const js = await readFile(resolve(buildRoot, `.${path}`), 'utf8');
    return /order-panel-back|kitchen-reprint|settings-shop|pos-checkout/.test(js);
  }));
  report.assertions.customerIsolation = { passed: staffOnlyRequested.length === 0 && !guestCssHasStaffSelectors.some(Boolean) && !guestJsHasStaffViews.some(Boolean), staffOnlyRequested: [...new Set(staffOnlyRequested)], staffCssInGuest: guestCssHasStaffSelectors.some(Boolean), staffViewsInGuestJs: guestJsHasStaffViews.some(Boolean) };
  if (args.includes('--baseline')) {
    const baseline = JSON.parse(await readFile(resolve(option('--baseline')), 'utf8'));
    report.comparison = Object.fromEntries(['guest', 'staff'].map(route => [route, Object.fromEntries(['js', 'css', 'fonts', 'images', 'total'].map(kind => {
      const before = baseline.medians[route][kind].encodedBytes;
      const after = report.medians[route][kind].encodedBytes;
      return [kind, { beforeBytes: before, afterBytes: after, savedBytes: before - after, savedPercent: before ? Math.round((before - after) / before * 1000) / 10 : null }];
    }))]));
    report.assertions.customerPayload = {
      passed: report.comparison.guest.js.savedPercent >= 20 && report.comparison.guest.css.savedPercent >= 50,
      minimumJsSavedPercent: 20, minimumCssSavedPercent: 50,
    };
  }
  if (args.includes('--polling')) {
    const { context, page, rpc } = await createPage({ throttled: false });
    try {
      await page.goto(`${origin}/?table=1&key=${tableKey}`);
      await page.locator('.dining-food').first().waitFor(); await page.waitForTimeout(600);
      await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
      const start = rpc.length; await page.waitForTimeout(8800);
      const hiddenRpcs = rpc.slice(start).map(({ name }) => name);
      const visibleStart = rpc.length;
      await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
      await page.waitForTimeout(650);
      const visibleRpcs = rpc.slice(visibleStart).map(({ name }) => name);
      report.assertions.hiddenPolling = { passed: hiddenRpcs.length === 0 && visibleRpcs.includes('pos_guest_orders'), hiddenRpcs, visibleRpcs, hiddenDurationMs: 8800 };
    } finally { await context.close(); }
  }
  if (args.includes('--visual')) {
    const { context, page, errors } = await createPage({ throttled: false });
    try {
      await page.addInitScript(() => localStorage.setItem('khao-piek:lan:language:v1', 'th'));
      await page.goto(`${origin}/?table=1&key=${tableKey}`);
      await page.locator('.dining-food').first().waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.waitForFunction(() => [...document.images].filter(img => { const r = img.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight; }).every(img => img.complete));
      const thai = await page.evaluate(() => ({ language: document.documentElement.lang, fontsReady: document.fonts.status === 'loaded', horizontalOverflowPx: Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth), thaiFontLoaded: document.fonts.check('700 16px "Noto Sans Thai"') }));
      await page.screenshot({ path: resolve(dirname(output), `${label}-guest-th.png`), fullPage: false });
      assert.deepEqual(errors, []);
      report.assertions.visual = { passed: thai.language === 'th' && thai.fontsReady && thai.thaiFontLoaded && thai.horizontalOverflowPx === 0 && report.samples.every(s => s.visual.fontsReady && s.visual.horizontalOverflowPx === 0), thai, samples: report.samples.map(({ route, visual }) => ({ route, ...visual })) };
    } finally { await context.close(); }
  }
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ output, medians: report.medians, comparison: report.comparison, assertions: report.assertions }, null, 2));
  if (enforceSplit) {
    assert.equal(report.assertions.customerIsolation.passed, true, 'customer route must not fetch staff JavaScript/CSS');
    if (report.assertions.customerPayload) assert.equal(report.assertions.customerPayload.passed, true, 'customer JavaScript/CSS must be materially smaller than baseline');
    if (report.assertions.hiddenPolling) assert.equal(report.assertions.hiddenPolling.passed, true, 'guest polling must pause while hidden and resume immediately');
    if (report.assertions.visual) assert.equal(report.assertions.visual.passed, true, 'Lao/Thai fonts must load without mobile horizontal overflow');
  }
} finally { await browser.close(); await new Promise(resolveClose => server.close(resolveClose)); }
