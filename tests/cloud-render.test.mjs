import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {fileURLToPath} from 'node:url';
test('real staff access starts with authentication and no sample identities or transactions',async()=>{
 const server=await createServer({root:fileURLToPath(new URL('..',import.meta.url)),configFile:false,appType:'custom',optimizeDeps:{noDiscovery:true,include:[]},server:{middlewareMode:true,watch:null,ws:false}});
 try{
 const {CloudAuth}=await server.ssrLoadModule('/src/CloudApp.jsx');
 const {Locale}=await server.ssrLoadModule('/src/staff-ui.jsx');
 const html=renderToStaticMarkup(React.createElement(Locale.Provider,{value:{lang:'th',t:(_,th)=>th}},React.createElement(CloudAuth,{client:{},onSignedIn(){}})));
 assert.match(html,/type="email"/);assert.match(html,/type="password"/);assert.match(html,/เข้าสู่ระบบ/);
 assert.doesNotMatch(html,/1111|2222|3333|ข้อมูลตัวอย่าง|ข้อมูลทดลอง|Demo|ตัวอย่าง/);
 }finally{await server.close();}
});
