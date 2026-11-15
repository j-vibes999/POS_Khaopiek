// Isolated UI fixture: no Supabase client, network writes or real shop records.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DishDialog, MenuAdmin } from '../../src/MenuAdmin.jsx';
import { Locale } from '../../src/staff-ui.jsx';
import '../../src/styles.css';
window.menuQa = { uploads: 0, saves: [], failUpload: false, failSave: false, loseSaveAck: false };
function MenuFixture() {
 const [menu, setMenu] = useState([
   { id: 'pho-beef', lo: 'ເຝີງົວ', th: 'เฝอเนื้อ', category: 'pho', price: 35000, available: false },
   { id: 'pho-chicken', lo: 'ເຝີໄກ່', th: 'เฝอไก่', category: 'pho', price: 30000, available: true },
   { id: 'tea', lo: 'ຊາເຢັນ', th: 'ชาเย็น', category: 'drinks', price: 18000, available: false },
 ]);
 return <Locale.Provider value={{ lang: 'th', t: (_, th) => th }}><MenuAdmin menu={menu} onToggle={async id => {
   setMenu(current => current.map(dish => dish.id === id ? { ...dish, available: !dish.available } : dish));
   return null;
 }}/></Locale.Provider>;
}
function Fixture() {
 const [open, setOpen] = useState(true);
 return <Locale.Provider value={{ lang: 'th', t: (_, th) => th }}><button id="open-menu-editor" onClick={() => setOpen(true)}>Open menu editor</button>{open && <DishDialog dish={window.menuQa.initial ?? { category: 'khao' }} onClose={() => setOpen(false)} onUploadImage={async blob => {
   window.menuQa.uploads += 1; window.menuQa.uploadType = blob.type;
   if (window.menuQa.failUpload) throw Object.assign(new Error('storage-not-ready'), { code: 'storage-not-ready' });
   return 'https://images.qa.invalid/menu.webp';
 }} onSave={async dish => {
   window.menuQa.saves.push(dish);
   // Record a committed command before simulating a lost network acknowledgment.
   if (window.menuQa.loseSaveAck) {
     window.menuQa.loseSaveAck = false;
     throw Object.assign(new Error('Save acknowledgment lost'), { code: 'unavailable' });
   }
   if (window.menuQa.failSave) return 'save-failed';
   setOpen(false); return null;
 }}/>}</Locale.Provider>;
}
const showList = new URLSearchParams(location.search).has('list');
createRoot(document.getElementById('root')).render(showList ? <MenuFixture/> : <Fixture/>);
