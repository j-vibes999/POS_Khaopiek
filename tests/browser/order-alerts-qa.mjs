// Uses only isolated component state and this browser context's localStorage.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {createServer} from 'vite';
import react from '@vitejs/plugin-react';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('../..',import.meta.url));
const server=await createServer({root,configFile:false,plugins:[react()],server:{host:'127.0.0.1',port:5231,strictPort:true},logLevel:'error'});
let browser;
try{
 await server.listen();browser=await chromium.launch({headless:true,...(process.env.BROWSER_EXECUTABLE&&{executablePath:process.env.BROWSER_EXECUTABLE})});
 const context=await browser.newContext();const page=await context.newPage();page.setDefaultTimeout(6000);
 const open=(target,query='')=>target.goto('http://127.0.0.1:5231/tests/browser/order-alerts-qa.html'+query);
 await open(page);await page.locator('#read').click();
 assert.equal(await page.evaluate(()=>localStorage.getItem('khao-piek:order-alerts:read:A')),'100','read marker must persist under its restaurant key');
 await page.evaluate(()=>window.alertsQa.setOrders([100,101]));await page.waitForFunction(()=>document.querySelector('#unread').textContent==='1');
 await open(page,'?numbers=100,101');await page.waitForFunction(()=>document.querySelector('#unread')?.textContent==='1');
 console.log('PASS scoped read marker survives reload without losing the next unread order.');
 await page.evaluate(()=>window.alertsQa.setOrders([100,101,102]));await page.waitForFunction(()=>document.querySelector('#notice').textContent==='102');
 await page.evaluate(()=>window.alertsQa.setScope('',[]));await page.waitForFunction(()=>document.querySelector('#notice').textContent==='');
 await page.evaluate(()=>window.alertsQa.setScope('B',[1]));await page.waitForFunction(()=>localStorage.getItem('khao-piek:order-alerts:read:B')==='1');
 assert.equal(await page.locator('#notice').innerText(),'');
 await page.evaluate(()=>window.alertsQa.setOrders([1,2]));await page.waitForFunction(()=>document.querySelector('#unread').textContent==='1'&&document.querySelector('#notice').textContent==='2');
 assert.equal(await page.evaluate(()=>localStorage.getItem('khao-piek:order-alerts:read:A')),'100');
 console.log('PASS switching restaurant resets notice and order-number baseline, without poisoning another restaurant.');
 const other=await context.newPage();other.setDefaultTimeout(6000);await open(other,'?scope=B&numbers=1,2');await other.locator('#read').click();
 await page.waitForFunction(()=>document.querySelector('#unread').textContent==='0');
 console.log('PASS marking read in another tab updates the same restaurant.');
 await page.locator('#sound').click();await other.locator('#sound').click();
 const baseline=await page.evaluate(()=>window.alertsQa.soundStarts)+await other.evaluate(()=>window.alertsQa.soundStarts);
 await Promise.all([page.evaluate(()=>window.alertsQa.setOrders([1,2,3])),other.evaluate(()=>window.alertsQa.setOrders([1,2,3]))]);
 await page.waitForFunction(()=>localStorage.getItem('khao-piek:order-alerts:chimed:B')==='3');
 const tones=await page.evaluate(()=>window.alertsQa.soundStarts)+await other.evaluate(()=>window.alertsQa.soundStarts)-baseline;
 assert.equal(tones,2,'two enabled tabs must play only one two-tone chime per incoming order');
 console.log('PASS same-restaurant tabs play a single chime for a new order.');
 await page.evaluate(()=>{
  window.alertsQa.lockHolding=navigator.locks.request('khao-piek:order-chime:B',async()=>{
   window.alertsQa.lockHeld=true;
   await new Promise(resolve=>{window.alertsQa.releaseLock=resolve;});
  });
 });
 await page.waitForFunction(()=>window.alertsQa.lockHeld);
 await page.evaluate(()=>window.alertsQa.setOrders([1,2,3,4]));
 await page.waitForFunction(()=>document.querySelector('#notice').textContent==='4');
 await page.evaluate(()=>window.alertsQa.setScope('C',[1]));
 await page.waitForFunction(()=>localStorage.getItem('khao-piek:order-alerts:read:C')==='1');
 await page.locator('#sound').click();
 const beforeRelease=await page.evaluate(()=>window.alertsQa.soundStarts);
 await page.evaluate(async()=>{
  window.alertsQa.releaseLock();
  await window.alertsQa.lockHolding;
  await navigator.locks.request('khao-piek:order-chime:B',()=>{});
 });
 assert.equal(await page.evaluate(()=>window.alertsQa.soundStarts),beforeRelease,'a queued chime from the previous restaurant must not play after switching');
 assert.equal(await page.evaluate(()=>localStorage.getItem('khao-piek:order-alerts:chimed:B')),'3');
 await page.evaluate(()=>window.alertsQa.setOrders([1,2]));
 await page.waitForFunction(()=>localStorage.getItem('khao-piek:order-alerts:chimed:C')==='2');
 assert.equal(await page.evaluate(()=>window.alertsQa.soundStarts),beforeRelease+2);
 console.log('PASS queued chimes cannot cross restaurants; new orders still chime in the current restaurant.');
 await context.close();
}finally{await browser?.close();await server.close();}
