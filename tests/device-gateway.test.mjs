import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { Readable } from 'node:stream';
import { createDeviceGateway } from '../server/device-gateway.mjs';

const key = 'a'.repeat(64);
const config = { supabaseUrl: 'https://example.supabase.co', publishableKey: 'sb_publishable_test', deviceKey: key };
async function start(t, options = {}) {
  const requests = [];
  const gateway = createDeviceGateway({ ...config, fetchImpl: async (url, init) => {
    requests.push({ url, body: JSON.parse(init.body), headers: init.headers });
    return Response.json({ restaurantId: 'actual-shop' });
  }, ...options });
  const server = http.createServer((req, res) => gateway(req, res, () => { res.writeHead(404); res.end(); }));
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise(resolve => { server.closeAllConnections(); server.close(resolve); }));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const rpc = (body, headers = {}) => fetch(`${origin}/api/device/rpc`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-POS-Device': '1', ...headers }, body: JSON.stringify(body) });
  return { requests, origin, rpc };
}
test('trusted local gateway keeps device credentials on the server and binds commands to its device', async t => {
  const { requests, origin, rpc } = await start(t);
  const status = await fetch(`${origin}/api/device/status`);
  assert.equal(status.headers.get('cache-control'), 'no-store');
  assert.equal(status.headers.get('x-frame-options'), 'DENY');
  assert.equal((await fetch(origin)).headers.get('content-security-policy'), "frame-ancestors 'none'");
  assert.deepEqual(await status.json(), { enabled: true });
  const response = await rpc({ name: 'pos_staff_command', args: { p_action: 'table.add', p_payload: { number: 1, seats: 4 }, p_device_key: 'attacker', p_restaurant_id: 'other-shop' } });
  const text = await response.text();
  assert.equal(response.status, 200);
  assert.doesNotMatch(text, new RegExp(key));
  assert.deepEqual(JSON.parse(text), { data: { restaurantId: 'actual-shop' }, error: null });
  assert.match(requests[0].url, /\/rpc\/pos_device_command$/);
  assert.deepEqual(requests[0].body, { p_device_key: key, p_action: 'table.add', p_payload: { number: 1, seats: 4 } });
});
test('cross-origin requests, DNS rebinding hosts and non-local clients cannot use the gateway', async t => {
  const { requests, rpc, origin } = await start(t);
  assert.equal((await rpc({ name: 'pos_staff_snapshot' }, { Origin: 'https://unrelated.example' })).status, 403);
  const rebound = await new Promise((resolve, reject) => {
    const request = http.request(`${origin}/api/device/rpc`, { method: 'POST', headers: { Host: 'attacker.example', Origin: origin, 'Content-Type': 'application/json', 'X-POS-Device': '1' } }, response => { response.resume(); resolve(response.statusCode); });
    request.on('error', reject); request.end(JSON.stringify({ name: 'pos_staff_snapshot' }));
  });
  assert.equal(rebound, 403);
  assert.equal((await fetch(`${origin}/api/device/rpc`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  assert.equal(requests.length, 0);
  const req = Readable.from([]); req.url = '/api/device/status'; req.method = 'GET'; req.headers = { host: '127.0.0.1:5173' }; req.socket = { remoteAddress: '192.168.1.5' };
  const result = {}; const res = { setHeader() {}, writeHead(code) { result.status = code; }, end(body) { result.body = body; } };
  await createDeviceGateway(config)(req, res, () => assert.fail('Local route fell through'));
  assert.equal(result.status, 403);
});
test('gateway refuses unsupported RPCs and oversized or invalid payloads before contacting Supabase', async t => {
  const { requests, rpc, origin } = await start(t);
  assert.equal((await rpc({ name: 'pos_guest_submit', args: {} })).status, 400);
  assert.equal((await rpc({ name: 'pos_staff_command', args: { p_action: 'x'.repeat(140000), p_payload: {} } })).status, 413);
  assert.equal((await fetch(`${origin}/api/device/rpc`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', 'X-POS-Device': '1' }, body: '{bad' })).status, 400);
  assert.equal(requests.length, 0);
});
test('device setup and snapshot use only the private server credential; public readiness uses none', async t => {
  const { requests, rpc } = await start(t);
  await rpc({ name: 'pos_claim_owner', args: { p_shop_name: 'Actual shop' } });
  await rpc({ name: 'pos_staff_snapshot', args: { p_restaurant_id: 'other' } });
  await rpc({ name: 'pos_setup_status', args: {} });
  assert.deepEqual(requests.map(request => request.body), [{ p_device_key: key, p_shop_name: 'Actual shop' }, { p_device_key: key }, {}]);
});
test('gateway sanitizes database and network errors without exposing device keys', async t => {
  const { rpc } = await start(t, { fetchImpl: async () => Response.json({ code: 'P0001', message: 'device-denied', details: key }, { status: 400 }) });
  assert.deepEqual(await (await rpc({ name: 'pos_staff_snapshot' })).json(), { data: null, error: { code: 'P0001', message: 'device-denied' } });
  const other = await start(t, { fetchImpl: async () => { throw new Error(key); } });
  const response = await other.rpc({ name: 'pos_staff_snapshot' });
  assert.equal(response.status, 503);
  assert.doesNotMatch(await response.text(), new RegExp(key));
});
test('unconfigured gateway reports disabled and cannot call cloud commands', async t => {
  const { requests, origin, rpc } = await start(t, { deviceKey: undefined });
  assert.deepEqual(await (await fetch(`${origin}/api/device/status`)).json(), { enabled: false });
  assert.equal((await rpc({ name: 'pos_staff_snapshot' })).status, 503);
  assert.equal(requests.length, 0);
});

const photo=()=>new Blob([Uint8Array.from([82,73,70,70,12,0,0,0,87,69,66,80,86,80,56,32,0,0,0,0])],{type:'image/webp'});
const photoPath='10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.webp';
test('device photo upload obtains a scoped ticket and uploads bytes through Storage without exposing the private key',async t=>{
 const calls=[];
 const {origin}=await start(t,{fetchImpl:async(url,init)=>{calls.push({url,init});return calls.length===1?Response.json({bucket:'pos-menu-images',path:photoPath}):Response.json({Key:'pos-menu-images/'+photoPath});}});
 const result=await fetch(origin+'/api/device/menu-image',{method:'POST',headers:{Origin:origin,'X-POS-Device':'1','Content-Type':'image/webp'},body:photo()});
 assert.equal(result.status,200);const text=await result.text();assert.doesNotMatch(text,new RegExp(key));assert.equal(JSON.parse(text).data.url,'https://example.supabase.co/storage/v1/object/public/pos-menu-images/'+photoPath);
 assert.match(calls[0].url,/rpc\/pos_device_menu_upload_ticket$/);assert.deepEqual(JSON.parse(calls[0].init.body),{p_device_key:key});
 assert.equal(calls[1].url,'https://example.supabase.co/storage/v1/object/pos-menu-images/'+photoPath);assert.equal(calls[1].init.headers['x-upsert'],'false');assert.equal(calls[1].init.headers.apikey,config.publishableKey);assert.equal(calls[1].init.headers.Authorization,undefined);assert.equal(calls[1].init.body.length,20);
});
test('photo upload blocks cross-origin requests, invalid bytes and huge files before issuing a ticket',async t=>{
 let calls=0;const {origin}=await start(t,{fetchImpl:async()=>{calls++;return Response.json({});}});
 const upload=(blob,originHeader=origin)=>fetch(origin+'/api/device/menu-image',{method:'POST',headers:{Origin:originHeader,'X-POS-Device':'1','Content-Type':'image/webp'},body:blob});
 assert.equal((await upload(photo(),'https://unrelated.example')).status,403);
 assert.equal((await upload(new Blob(['invalid']))).status,400);
 assert.equal((await upload(new Blob([new Uint8Array(2097153)]))).status,413);
 assert.equal(calls,0);
});
test('missing image setup and revoked device ticket never pretend the picture was uploaded',async t=>{
 const missing=await start(t,{fetchImpl:async()=>Response.json({code:'PGRST202',message:'not installed',details:key},{status:404})});
 const request=origin=>fetch(origin+'/api/device/menu-image',{method:'POST',headers:{Origin:origin,'X-POS-Device':'1','Content-Type':'image/webp'},body:photo()});
 const result=await request(missing.origin);assert.equal((await result.json()).error.message,'storage-not-ready');
 const denied=await start(t,{fetchImpl:async()=>Response.json({code:'P0001',message:'device-denied',details:key},{status:400})});
 assert.equal((await (await request(denied.origin)).json()).error.message,'device-denied');
});
