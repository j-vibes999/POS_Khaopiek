import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const temporary = mkdtempSync(join(tmpdir(), 'khaopiek-supabase-test-'));
const data = join(temporary, 'data');
const socket = join(temporary, 'socket');
let binaries;
let started = false;
let failed = false;

function command(program, args, options = {}) {
  const result = spawnSync(program, args, { encoding: 'utf8', timeout: 30000, ...options });
  if (result.error || result.status !== 0) throw new Error(`${program} failed:\n${result.error?.message ?? result.stderr ?? result.stdout}`);
  return result.stdout;
}

// Exercise revocation across two real database connections while a command
// waits for its restaurant lock. These records exist only in the disposable DB.
async function checkDeviceRevocationRace() {
  const psql = join(binaries, 'psql');
  const args = ['-X', '-qAt', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', '55440', '-U', 'postgres', '-d', 'postgres'];
  const rid = '94000000-0000-4000-8000-000000000001';
  const mid = '94000000-0000-4000-8000-000000000002';
  const did = '94000000-0000-4000-8000-000000000003';
  command(psql, [...args, '-c', `INSERT INTO public.restaurants(id,name) VALUES('${rid}','Revocation race'); INSERT INTO public.restaurant_memberships(id,restaurant_id,user_id,display_name,role) VALUES('${mid}','${rid}',NULL,'Device owner','owner'); INSERT INTO private.pos_devices(id,credential_hash,restaurant_id,membership_id) VALUES('${did}',encode(sha256(convert_to(repeat('f',64),'UTF8')),'hex'),'${rid}','${mid}');`]);
  const locker = spawn(psql, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  let stdout = '', stderr = '';
  const ended = new Promise((resolve, reject) => { locker.on('error', reject); locker.on('close', code => resolve(code)); });
  const ready = new Promise((resolve, reject) => {
    locker.stdout.on('data', data => { stdout += data; if (stdout.includes('device_lock_acquired')) resolve(); });
    locker.stderr.on('data', data => { stderr += data; });
    locker.on('error', reject);
    locker.on('close', code => { if (!stdout.includes('device_lock_acquired')) reject(new Error(`Device lock setup failed (${code}): ${stderr}`)); });
  });
  locker.stdin.end(`BEGIN; SELECT private.pos_lock('${rid}'); SELECT 'device_lock_acquired'; SELECT pg_sleep(0.8); DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_stat_activity WHERE application_name='POS_DEVICE_RACE_WAITER' AND wait_event_type='Lock' AND wait_event='advisory') THEN RAISE EXCEPTION 'Device command did not wait for the lock'; END IF; END $$; UPDATE private.pos_devices SET enabled=false WHERE id='${did}'; COMMIT;`);
  await ready;
  let denied = false;
  try {
    command(psql, [...args, '-c', `SET application_name='POS_DEVICE_RACE_WAITER'; SET ROLE anon; SELECT public.pos_device_command(repeat('f',64),'table.add','{"number":1}');`]);
  } catch (error) {
    if (!/device-denied/.test(error.message)) throw error;
    denied = true;
  }
  const status = await ended;
  if (status !== 0) throw new Error(`Revocation lock fixture failed: ${stderr}`);
  if (!denied || command(psql, [...args, '-c', `SELECT count(*) FROM public.dining_tables WHERE restaurant_id='${rid}';`]).trim() !== '0') throw new Error('A device command committed after its key was revoked during the lock wait.');
  console.log('PASS: device revocation during a real concurrent restaurant-lock wait prevents mutation.');
}

try {
  binaries = process.env.POS_TEST_PG_BIN || command('pg_config', ['--bindir']).trim();
  mkdirSync(socket, { mode: 0o700 });
  command(join(binaries, 'initdb'), ['-D', data, '--auth=trust', '--username=postgres', '--no-locale', '--encoding=UTF8']);
  // This disposable database listens only on its private Unix socket, never on the network.
  command(join(binaries, 'pg_ctl'), ['-D', data, '-l', join(temporary, 'postgres.log'), '-o', `-k ${socket} -h '' -p 55440`, '-w', 'start']);
  started = true;
  const psql = file => command(join(binaries, 'psql'), ['-X', '-v', 'ON_ERROR_STOP=1', '-h', socket, '-p', '55440', '-U', 'postgres', '-d', 'postgres', '-f', join(root, file)]);
  psql('supabase/tests/bootstrap.sql');
  const migrations = readdirSync(join(root, 'supabase/migrations')).filter(name => name.endsWith('.sql')).sort();
  psql(`supabase/migrations/${migrations[0]}`);
  psql('supabase/tests/foundation.sql');
  for (const name of migrations.slice(1)) psql(`supabase/migrations/${name}`);
  // Repeat installation to ensure reruns preserve real shop data.
  for (const name of migrations) psql(`supabase/migrations/${name}`);
  if (migrations.length > 1) {
    console.log(psql('supabase/tests/retire-sample.sql').trim());
    console.log(psql('supabase/tests/workflows.sql').trim());
    console.log(psql('supabase/tests/devices.sql').trim());
    console.log(psql('supabase/tests/menu-images.sql').trim());
    console.log(psql('supabase/tests/integrity.sql').trim());
    await checkDeviceRevocationRace();
  }
  console.log('PASS: SQL installation is repeatable; isolated PostgreSQL security and data-integrity tests passed.');
} catch (error) {
  failed = true;
  console.error(error.message);
  try { console.error(readFileSync(join(temporary, 'postgres.log'), 'utf8').slice(-2000)); } catch { /* startup may not have created a log */ }
} finally {
  try {
    if (started) command(join(binaries, 'pg_ctl'), ['-D', data, '-m', 'immediate', '-w', 'stop']);
    rmSync(temporary, { recursive: true, force: true });
  } catch {
    failed = true;
    console.error(`Could not clean up the isolated test database at ${temporary}.`);
  }
  if (failed) process.exitCode = 1;
}
