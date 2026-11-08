import test from 'node:test';
import assert from 'node:assert/strict';
import { createDeviceClient, probeDeviceAccess } from '../src/device-client.mjs';

const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });

test('trusted device discovery only contacts an exact loopback hostname', async () => {
 let count = 0;
 const fetchImpl = async () => { count += 1; return json({enabled:true}); };
 for (const hostname of ['shop.example', '192.168.1.10', 'localhost.example', '127.0.0.2', '']) assert.equal(await probeDeviceAccess({hostname,fetchImpl}), null);
 assert.equal(count,0);
 for (const hostname of ['localhost','127.0.0.1','[::1]','::1']) assert.equal((await probeDeviceAccess({hostname,fetchImpl})).accessMode,'device');
 assert.equal(count,4);
});

test('unconfigured local gateway preserves normal cloud account access', async () => {
 for (const response of [json({enabled:false}),new Response('',{status:404}),new Response('<html></html>',{headers:{'Content-Type':'text/html'}})]) {
  assert.equal(await probeDeviceAccess({hostname:'localhost',fetchImpl:async()=>response}),null);
 }
});

test('device discovery reports denied or unreachable gateway rather than silently succeeding', async () => {
 await assert.rejects(probeDeviceAccess({hostname:'localhost',fetchImpl:async()=>json({},403)}),{code:'device-denied'});
 await assert.rejects(probeDeviceAccess({hostname:'localhost',fetchImpl:async()=>{throw new Error('network');}}),{code:'device-unavailable'});
});

test('device RPC is same origin, uses a fixed allowlist and carries no device credentials', async () => {
 const calls=[];
 const client=createDeviceClient({fetchImpl:async(url,options)=>{calls.push({url,options});return json({data:{restaurantId:'actual-shop'},error:null});}});
 assert.equal(client.accessMode,'device');
 assert.deepEqual(await client.rpc('pos_staff_command',{p_restaurant_id:'ignored',p_action:'table.add',p_payload:{number:1},p_device_key:'must-not-be-forwarded'}),{data:{restaurantId:'actual-shop'},error:null});
 assert.equal(calls[0].url,'/api/device/rpc');
 assert.equal(calls[0].options.credentials,'same-origin');
 assert.equal(calls[0].options.headers['X-POS-Device'],'1');
 assert.deepEqual(JSON.parse(calls[0].options.body),{name:'pos_staff_command',args:{p_action:'table.add',p_payload:{number:1}}});
 assert.doesNotMatch(calls[0].options.body,/must-not-be-forwarded|p_restaurant_id|p_device_key/);
 assert.equal((await client.rpc('pos_get_menu',{})).error.code,'device-rpc-denied');
 assert.equal(calls.length,1);
});

test('device RPC forwards database errors and rejects malformed or failed responses', async () => {
 const failure={data:null,error:{code:'P0001',message:'device-denied'}};
 assert.deepEqual(await createDeviceClient({fetchImpl:async()=>json(failure,403)}).rpc('pos_staff_snapshot'),failure);
 assert.equal((await createDeviceClient({fetchImpl:async()=>json({accepted:true})}).rpc('pos_staff_snapshot')).error.code,'device-unavailable');
 assert.equal((await createDeviceClient({fetchImpl:async()=>{throw new Error('offline');}}).rpc('pos_staff_snapshot')).error.code,'device-unavailable');
});

test('device photo upload sends prepared binary to its local gateway and preserves upload errors',async()=>{
 const file=new Blob([Uint8Array.from([82,73,70,70,12,0,0,0,87,69,66,80,86,80,56,32,0,0,0,0])],{type:'image/webp'});const calls=[];
 const client=createDeviceClient({fetchImpl:async(url,options)=>{calls.push({url,options});return json({data:{url:'https://example.supabase.co/storage/v1/object/public/pos-menu-images/a.webp'},error:null});}});
 assert.equal((await client.uploadMenuImage(file)).error,null);
 assert.equal(calls[0].url,'/api/device/menu-image');assert.equal(calls[0].options.body,file);assert.equal(calls[0].options.headers['X-POS-Device'],'1');assert.equal(calls[0].options.headers['Content-Type'],'image/webp');
 const unavailable=createDeviceClient({fetchImpl:async()=>json({data:null,error:{code:'P0001',message:'storage-not-ready'}},404)});
 assert.equal((await unavailable.uploadMenuImage(file)).error.message,'storage-not-ready');
});
