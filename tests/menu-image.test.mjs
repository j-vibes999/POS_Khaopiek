import test from 'node:test';
import assert from 'node:assert/strict';
import { prepareMenuImage, MAX_INPUT_IMAGE_BYTES, MAX_MENU_IMAGE_BYTES, MAX_MENU_IMAGE_DIMENSION } from '../src/menu-image.mjs';

const jpeg = () => new Blob([Uint8Array.from([255,216,255,224,0,16,74,70,73,70,0,0])], { type:'image/jpeg' });
const webp = (size = 32, type = 'image/webp') => { const bytes = new Uint8Array(size); bytes.set([82,73,70,70,24,0,0,0,87,69,66,80]); return new Blob([bytes], { type }); };
function environment(width = 4000, height = 3000, encode) {
 const state = { closed:0, draws:[], encodes:[] };
 const canvas = { width:0, height:0, getContext() { return { drawImage(...args) { state.draws.push(args); } }; }, toBlob(callback,type,quality) { state.encodes.push({width:this.width,height:this.height,type,quality}); callback(encode?.(state.encodes.length) ?? webp()); } };
 return { state, options:{ createImageBitmap:async()=>({width,height,close(){state.closed++;}}), createCanvas:()=>canvas } };
}
test('large camera photos resize proportionally, encode WebP and release their decoded bitmap', async () => {
 const {state,options}=environment(3000,4000);
 const result=await prepareMenuImage(jpeg(),options);
 assert.equal(result.type,'image/webp'); assert.ok(result.size<=MAX_MENU_IMAGE_BYTES);
 assert.equal(MAX_MENU_IMAGE_DIMENSION,1600);
 assert.deepEqual(state.encodes[0],{width:1200,height:1600,type:'image/webp',quality:0.84});
 assert.equal(state.closed,1);
});
test('small source photos are not enlarged',async()=>{
 const {state,options}=environment(400,300); await prepareMenuImage(jpeg(),options);
 assert.equal(state.encodes[0].width,400);assert.equal(state.encodes[0].height,300);
});
test('unsupported content, empty input and oversized inputs fail before image decoding',async()=>{
 let decoded=0; const options={createImageBitmap:async()=>{decoded++;throw Error();}};
 for(const blob of [new Blob(['<svg/>'],{type:'image/jpeg'}),new Blob(['GIF89a'],{type:'image/gif'}),new Blob([])])await assert.rejects(prepareMenuImage(blob,options),{code:'image-type'});
 const large={size:MAX_INPUT_IMAGE_BYTES+1,slice(){throw Error('must not read');}};
 await assert.rejects(prepareMenuImage(large,options),{code:'image-too-large'});assert.equal(decoded,0);
});
test('overlarge decoded dimensions are rejected and the bitmap is closed',async()=>{
 const {state,options}=environment(12000,12000);
 await assert.rejects(prepareMenuImage(jpeg(),options),{code:'image-too-large'});
 assert.equal(state.encodes.length,0);assert.equal(state.closed,1);
});
test('WebP encoder support is checked rather than accepting a silent PNG fallback',async()=>{
 const {state,options}=environment(400,300,()=>webp(32,'image/png'));
 await assert.rejects(prepareMenuImage(jpeg(),options),{code:'image-encode'});assert.equal(state.closed,1);
});
test('oversized output is recompressed and, if needed, resized to stay within the upload limit',async()=>{
 const {state,options}=environment(4000,3000,count=>webp(count<4?MAX_MENU_IMAGE_BYTES+1:64));
 const result=await prepareMenuImage(jpeg(),options);assert.ok(result.size<=MAX_MENU_IMAGE_BYTES);
 assert.ok(state.encodes[1].quality<state.encodes[0].quality);
 assert.ok(state.encodes.at(-1).width<1600);assert.equal(state.closed,1);
});
function fallback(fails=false){
 const state={created:0,revoked:[]};
 const options={createImageBitmap:async()=>{throw Error('decoder not supported');},createObjectURL(){state.created++;return'blob:fixture';},revokeObjectURL(url){state.revoked.push(url);},createImage(){const image={naturalWidth:800,naturalHeight:600};Object.defineProperty(image,'src',{set(value){if(value)queueMicrotask(()=>fails?image.onerror?.():image.onload?.());}});return image;},...environment(1,1).options};
 options.createImageBitmap=async()=>{throw Error('decoder not supported');};
 return {state,options};
}
test('image element fallback cleans up its object URL after success',async()=>{
 const {state,options}=fallback(); const result=await prepareMenuImage(jpeg(),options);
 assert.equal(result.type,'image/webp');assert.deepEqual(state.revoked,['blob:fixture']);
});
test('image element fallback cleans up after decoder rejection',async()=>{
 const {state,options}=fallback(true);await assert.rejects(prepareMenuImage(jpeg(),options),{code:'image-decode'});
 assert.deepEqual(state.revoked,['blob:fixture']);
});

test('HEIC input reports a decode error when neither browser decoder supports it',async()=>{
 const bytes=new Uint8Array([0,0,0,24,102,116,121,112,104,101,105,99,0,0,0,0,109,105,102,49]);
 const {state,options}=fallback(true);
 await assert.rejects(prepareMenuImage(new Blob([bytes],{type:'image/heic'}),options),{code:'image-decode'});
 assert.equal(state.created,1);assert.deepEqual(state.revoked,['blob:fixture']);
});
test('corrupt output bytes are not accepted based on their declared MIME type',async()=>{
 const {state,options}=environment(800,600,()=>new Blob([new Uint8Array(32)],{type:'image/webp'}));
 await assert.rejects(prepareMenuImage(jpeg(),options),{code:'image-encode'});assert.equal(state.closed,1);
});
