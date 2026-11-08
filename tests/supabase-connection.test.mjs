import test from 'node:test';
import assert from 'node:assert/strict';
import { supabaseConfig } from '../src/supabase-config.mjs';
import { checkSupabaseConnection } from '../scripts/check-supabase.mjs';

const env = {
  VITE_SUPABASE_URL: 'https://test-project.supabase.co',
  VITE_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
};

test('cloud setup is optional, but partial configuration and privileged keys are refused', () => {
  assert.equal(supabaseConfig({}), null);
  assert.throws(() => supabaseConfig({ VITE_SUPABASE_URL: env.VITE_SUPABASE_URL }), { code: 'supabase-config' });
  for (const key of ['sb_secret_private', 'eyJ.legacy.service_role', '']) {
    assert.throws(() => supabaseConfig({ ...env, VITE_SUPABASE_PUBLISHABLE_KEY: key }), { code: 'supabase-config' });
  }
  for (const url of ['http://test-project.supabase.co', 'https://user:password@test-project.supabase.co', 'https://test-project.supabase.co/?token=secret']) {
    assert.throws(() => supabaseConfig({ ...env, VITE_SUPABASE_URL: url }), { code: 'supabase-config' });
  }
  assert.deepEqual(supabaseConfig(env), { url: env.VITE_SUPABASE_URL, publishableKey: env.VITE_SUPABASE_PUBLISHABLE_KEY });
});

test('connection check recognizes a new project before the SQL foundation exists', async () => {
  const calls = [];
  const status = await checkSupabaseConnection(supabaseConfig(env), { fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return url.endsWith('/auth/v1/settings')
      ? Response.json({ external: { email: true } })
      : Response.json({ code: 'PGRST202' }, { status: 404 });
  } });
  assert.deepEqual(status, { connected: true, schemaReady: false, code: 'schema-missing' });
  assert.equal(calls[0].options.headers.apikey, env.VITE_SUPABASE_PUBLISHABLE_KEY);
  assert.equal(calls[1].url, env.VITE_SUPABASE_URL + '/rest/v1/rpc/pos_setup_status');
  assert.equal(calls[1].options.headers.Authorization, undefined);
  assert.equal(calls[1].options.method, 'POST');
});

test('setup check distinguishes an installed schema from denied access and wrong schema versions', async () => {
  const config = supabaseConfig(env);
  const check = data => checkSupabaseConnection(config, { fetchImpl: async url => url.endsWith('/auth/v1/settings') ? Response.json({}) : Response.json(data) });
  assert.deepEqual(await check({ schemaVersion: 2, guestOrdersReady: true, paymentsReady: true, integrityReady: true }), { connected: true, schemaReady: true, code: 'ready' });
  assert.deepEqual(await check({ schemaVersion: 1 }), { connected: true, schemaReady: false, code: 'workflow-missing' });
  assert.deepEqual(await check({ schemaVersion: 99 }), { connected: true, schemaReady: false, code: 'schema-version' });
  const denied = await checkSupabaseConnection(config, { fetchImpl: async () => Response.json({ message: 'Invalid API key' }, { status: 401 }) });
  assert.deepEqual(denied, { connected: false, schemaReady: false, code: 'access-denied' });
  const offline = await checkSupabaseConnection(config, { fetchImpl: async () => { throw new Error('network'); } });
  assert.deepEqual(offline, { connected: false, schemaReady: false, code: 'unavailable' });
});

test('setup check reports the required menu integrity upgrade instead of claiming the whole app is ready',async()=>{
 const check=integrityReady=>checkSupabaseConnection(supabaseConfig(env),{fetchImpl:async url=>url.endsWith('/auth/v1/settings')?Response.json({}):Response.json({schemaVersion:2,guestOrdersReady:true,paymentsReady:true,integrityReady})});
 for(const value of [undefined,false])assert.deepEqual(await check(value),{connected:true,schemaReady:false,code:'integrity-missing'});
 assert.deepEqual(await check(true),{connected:true,schemaReady:true,code:'ready'});
});
