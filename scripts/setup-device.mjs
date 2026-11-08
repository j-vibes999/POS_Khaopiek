import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { chmodSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';
import { supabaseConfig } from '../src/supabase-config.mjs';

const project = fileURLToPath(new URL('..', import.meta.url));
const quote = value => `'${String(value).replaceAll("'", "''")}'`;

export function prepareLocalDeviceSetup({ root = project, migrationSql } = {}) {
  const envPath = resolve(root, '.env.local');
  const original = readFileSync(envPath, 'utf8');
  const env = parseEnv(original);
  if (!supabaseConfig(env)) throw new Error('Configure the Supabase project before registering this computer.');
  if ((env.POS_DEVICE_KEY !== undefined && !/^[a-f0-9]{64}$/.test(env.POS_DEVICE_KEY))
    || (env.POS_DEVICE_ID !== undefined && !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(env.POS_DEVICE_ID))) {
    throw new Error('Existing device credentials are invalid. They were not changed.');
  }
  const key = env.POS_DEVICE_KEY ?? randomBytes(32).toString('hex');
  const id = env.POS_DEVICE_ID ?? randomUUID();
  const hash = createHash('sha256').update(key).digest('hex');
  const migrationsPath = resolve(project, 'supabase/migrations');
  const schema = migrationSql ?? readdirSync(migrationsPath).filter(name => name.endsWith('.sql') && name >= '202611070004_').sort()
    .map(name => readFileSync(resolve(migrationsPath, name), 'utf8')).join('\n\n');
  const ownerEmail = env.POS_OWNER_EMAIL?.trim() || 'darkside404404@gmail.com';
  const sql = `-- Register this restaurant computer. Contains only a credential hash.\n-- Re-running preserves the computer's existing shop and all business data.\n\n${schema}\n\nbegin;\ninsert into private.pos_devices(id,credential_hash,restaurant_id,membership_id)\nselect ${quote(id)}::uuid,${quote(hash)},owner.restaurant_id,owner.id\nfrom (select 1) singleton\nleft join lateral (\n select m.id,m.restaurant_id from public.restaurant_memberships m\n join auth.users u on u.id=m.user_id\n join public.restaurants r on r.id=m.restaurant_id\n where lower(u.email)=lower(${quote(ownerEmail)}) and u.email_confirmed_at is not null\n  and m.active and m.role='owner' and r.enabled\n order by m.created_at,m.id limit 1\n) owner on true\non conflict (id) do nothing;\ndo $$ begin\n if not exists(select 1 from private.pos_devices where id=${quote(id)}::uuid and credential_hash=${quote(hash)}) then\n  raise exception 'Device registration does not match this computer';\n end if;\nend $$;\ncommit;\nselect public.pos_setup_status() as setup_status;\n`;
  const outputPath = resolve(root, '.local/device-setup.sql');
  mkdirSync(dirname(outputPath), { recursive: true, mode: 0o700 });
  const additions = [!env.POS_DEVICE_KEY && `POS_DEVICE_KEY=${key}`, !env.POS_DEVICE_ID && `POS_DEVICE_ID=${id}`].filter(Boolean);
  if (additions.length) writeFileSync(envPath, `${original.trimEnd()}\n${additions.join('\n')}\n`, { mode: 0o600 });
  chmodSync(envPath, 0o600);
  writeFileSync(outputPath, sql, { mode: 0o600 });
  chmodSync(outputPath, 0o600);
  return { outputPath };
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  try {
    const { outputPath } = prepareLocalDeviceSetup();
    console.log(`Device installation SQL prepared: ${outputPath}`);
    console.log('Run this file once in Supabase SQL Editor, then restart the local app. No account form is needed on this computer.');
  } catch {
    console.error('Could not prepare device access. Check the local Supabase configuration and existing device credentials. No credentials were printed.');
    process.exitCode = 1;
  }
}
