import test from 'node:test';
import assert from 'node:assert/strict';
import { assertMenuImage, validateMenuImageTicket, MENU_IMAGE_BUCKET } from '../src/menu-upload.mjs';
const bytes=Uint8Array.from([82,73,70,70,12,0,0,0,87,69,66,80,86,80,56,32,0,0,0,0]);
test('upload accepts a prepared WebP and refuses renamed non-images or oversized input',async()=>{
 await assertMenuImage(new Blob([bytes],{type:'image/webp'}));
 await assert.rejects(assertMenuImage(new Blob(['<svg/>'],{type:'image/webp'})),{code:'image-type'});
 await assert.rejects(assertMenuImage(new Blob([bytes],{type:'image/svg+xml'})),{code:'image-type'});
 await assert.rejects(assertMenuImage(new Blob([new Uint8Array(2097153)],{type:'image/webp'})),{code:'image-too-large'});
});
test('upload tickets are restricted to generated paths in the menu image bucket',()=>{
 const ticket={bucket:MENU_IMAGE_BUCKET,path:'10000000-0000-4000-8000-000000000001/20000000-0000-4000-8000-000000000001.webp'};
 assert.deepEqual(validateMenuImageTicket(ticket),ticket);
 for(const value of [{...ticket,bucket:'other'}, {...ticket,path:'../../private/file.webp'}, {...ticket,path:ticket.path+'?x'},null])assert.throws(()=>validateMenuImageTicket(value),{code:'invalid-response'});
});
