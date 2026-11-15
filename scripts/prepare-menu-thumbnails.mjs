// Run with Node and cwebp installed to refresh the menu card images before deployment.
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { loadEnv } from 'vite';
import { assertMenuImage, MENU_IMAGE_BUCKET, validateMenuImageTicket } from '../src/menu-upload.mjs';
import { supabaseConfig } from '../src/supabase-config.mjs';

const root = fileURLToPath(new URL('..', import.meta.url));
const env = loadEnv('production', root, '');
const config = supabaseConfig(env);
const run = promisify(execFile);
const bucketPath = `/storage/v1/object/public/${MENU_IMAGE_BUCKET}/`;

async function readRpc(name, args) {
  const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
    body: JSON.stringify(args),
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`${name} returned HTTP ${response.status}`);
  return response.json();
}

function isStorePhoto(source) {
  try {
    const url = new URL(source);
    if (url.origin !== config.url || url.username || url.password || url.search || url.hash || !url.pathname.startsWith(bucketPath)) return false;
    validateMenuImageTicket({ bucket: MENU_IMAGE_BUCKET, path: url.pathname.slice(bucketPath.length) });
    return true;
  } catch { return false; }
}

async function prepareThumbnail(source, index, directory) {
  const response = await fetch(source, { redirect: 'error', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Menu photo ${index + 1} returned HTTP ${response.status}`);
  const photo = await assertMenuImage(await response.blob());
  const input = join(directory, `${index}-original.webp`);
  const output = join(directory, `${index}-card.webp`);
  await writeFile(input, Buffer.from(await photo.arrayBuffer()));
  await run('cwebp', ['-quiet', '-m', '6', '-q', '84', '-resize', '400', '0', '-resize_mode', 'down_only', input, '-o', output]);
  const bytes = await readFile(output);
  if (bytes.length >= photo.size) return null;
  const hash = createHash('sha256').update(bytes).digest('hex').slice(0, 20);
  return { source, file: `${hash}.webp`, bytes, originalBytes: photo.size };
}

if (!config || !env.POS_DEVICE_KEY) throw new Error('Configure Supabase and the local POS device before generating menu thumbnails.');
await run('cwebp', ['-version']);
const snapshot = await readRpc('pos_device_snapshot', { p_device_key: env.POS_DEVICE_KEY });
const table = snapshot.dining_tables.find(row => row.enabled !== false && row.public_key);
if (!table) throw new Error('An enabled table is required to read the public menu.');
const { menu } = await readRpc('pos_get_menu', { p_table_key: table.public_key });
const photos = [...new Set(menu.map(item => item.image).filter(isStorePhoto))].sort();
const temporary = await mkdtemp(join(tmpdir(), 'khao-piek-menu-thumbs-'));
try {
  const thumbnails = [];
  for (let index = 0; index < photos.length; index += 4) {
    const batch = await Promise.all(photos.slice(index, index + 4).map((source, offset) => prepareThumbnail(source, index + offset, temporary)));
    thumbnails.push(...batch.filter(Boolean));
  }
  const assetDirectory = join(root, 'public/menu-thumbnails');
  await mkdir(assetDirectory, { recursive: true });
  await Promise.all(thumbnails.map(({ file, bytes }) => writeFile(join(assetDirectory, file), bytes)));
  const manifest = Object.fromEntries(thumbnails.map(({ source, file }) => [source, `/menu-thumbnails/${file}`]));
  await writeFile(join(root, 'src/menu-thumbnails.json'), `${JSON.stringify(manifest, null, 2)}\n`);
  const total = thumbnails.reduce((sum, item) => sum + item.originalBytes, 0);
  const reduced = thumbnails.reduce((sum, item) => sum + item.bytes.length, 0);
  console.log(`Prepared ${thumbnails.length} card photos: ${total} → ${reduced} bytes.`);
} finally {
  await rm(temporary, { recursive: true, force: true });
}
