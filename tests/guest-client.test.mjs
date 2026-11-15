import test from 'node:test';
import assert from 'node:assert/strict';
import { createGuestClient } from '../src/guest-client.mjs';

const config = { url: 'https://shop.supabase.co', publishableKey: 'sb_publishable_test' };
test('guest RPC sends the public key without staff credentials or cached business data', async () => {
 const requests = [];
 const client = createGuestClient(config, { fetchImpl: async (url, options) => {
  requests.push({ url, options });
  return new Response(JSON.stringify({ table: 1, menu: [] }), { status: 200 });
 } });
 const result = await client.rpc('pos_get_menu', { p_table_key: 'table-key' });
 assert.deepEqual(result, { data: { table: 1, menu: [] }, error: null });
 assert.equal(requests.length, 1);
 assert.equal(requests[0].url, 'https://shop.supabase.co/rest/v1/rpc/pos_get_menu');
 const options = requests[0].options;
 assert.equal(options.method, 'POST');
 assert.equal(options.credentials, 'omit');
 assert.equal(options.cache, 'no-store');
 assert.deepEqual(options.headers, { apikey: config.publishableKey, 'Content-Type': 'application/json' });
 assert.equal(options.body, JSON.stringify({ p_table_key: 'table-key' }));
 assert.ok(options.signal instanceof AbortSignal);
});
test('guest transport rejects privileged RPCs without contacting the server', async () => {
 let calls = 0;
 const client = createGuestClient(config, { fetchImpl: async () => { calls++; } });
 for (const name of ['pos_staff_snapshot', 'pos_staff_command', '../auth', 'toString']) {
  const result = await client.rpc(name);
  assert.equal(result.error.code, '42501');
 }
 assert.equal(calls, 0);
});
test('database errors retain SQL code and HTTP status for checkout recovery', async () => {
 const client = createGuestClient(config, { fetchImpl: async () => new Response(JSON.stringify({ code: 'P0001', message: 'sold-out' }), { status: 400 }) });
 assert.deepEqual(await client.rpc('pos_guest_submit', { p_request_id: 'original-id' }), { data: null, error: { code: 'P0001', message: 'sold-out', status: 400 } });
});
test('uncertain submissions are never retried by the transport', async () => {
 let calls = 0;
 const client = createGuestClient(config, { fetchImpl: async () => { calls++; throw new TypeError('offline'); } });
 const result = await client.rpc('pos_guest_submit', { p_request_id: 'original-id' });
 assert.equal(result.error.code, 'unavailable');
 assert.equal(calls, 1);
});
test('malformed responses are unavailable and empty successful RPC results remain valid', async () => {
 for (const [body, status] of [['<html>Gateway failure</html>', 502], ['not JSON', 200]]) {
  const client = createGuestClient(config, { fetchImpl: async () => new Response(body, { status }) });
  assert.equal((await client.rpc('pos_get_menu')).error.code, 'unavailable');
 }
 const client = createGuestClient(config, { fetchImpl: async () => new Response(null, { status: 204 }) });
 assert.deepEqual(await client.rpc('pos_guest_call'), { data: null, error: null });
});
