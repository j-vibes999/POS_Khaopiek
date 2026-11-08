import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { parseEnv } from 'node:util';
import { prepareLocalDeviceSetup } from '../scripts/setup-device.mjs';

function fixture(t) {
 const root = mkdtempSync(join(tmpdir(), 'pos-device-provision-test-'));
 t.after(() => rmSync(root, { recursive: true, force: true }));
 writeFileSync(join(root, '.env.local'), 'VITE_SUPABASE_URL=https://example.supabase.co\nVITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_test\nPOS_OWNER_EMAIL=owner@example.test\n');
 return root;
}
test('provisioning generates a stable private credential and SQL with only its hash', t => {
 const root = fixture(t);
 const first = prepareLocalDeviceSetup({ root, migrationSql: '-- optional device schema' });
 const env = parseEnv(readFileSync(join(root, '.env.local'), 'utf8'));
 assert.match(env.POS_DEVICE_KEY, /^[a-f0-9]{64}$/);
 assert.match(env.POS_DEVICE_ID, /^[a-f0-9-]{36}$/);
 assert.equal(statSync(join(root, '.env.local')).mode & 0o777, 0o600);
 const sql = readFileSync(first.outputPath, 'utf8');
 assert.ok(sql.includes(createHash('sha256').update(env.POS_DEVICE_KEY).digest('hex')));
 assert.ok(!sql.includes(env.POS_DEVICE_KEY));
 assert.match(sql, /owner@example.test/);
 assert.match(sql, /on conflict\s*\(id\)\s*do nothing/i);
 assert.match(sql, /private\.pos_devices/);
 prepareLocalDeviceSetup({ root, migrationSql: '-- optional device schema' });
 assert.deepEqual(parseEnv(readFileSync(join(root, '.env.local'), 'utf8')), env);
 assert.equal(readFileSync(first.outputPath, 'utf8'), sql);
});
test('invalid existing credentials are not silently rotated or overwritten', t => {
 const root = fixture(t);
 const path = join(root, '.env.local');
 writeFileSync(path, readFileSync(path, 'utf8') + 'POS_DEVICE_KEY=invalid\n');
 const before = readFileSync(path, 'utf8');
 assert.throws(() => prepareLocalDeviceSetup({ root, migrationSql: '-- schema' }), /credential/i);
 assert.equal(readFileSync(path, 'utf8'), before);
});
