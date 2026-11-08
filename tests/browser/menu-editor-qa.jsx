// Isolated UI fixture: no Supabase client, network writes or real shop records.
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { DishDialog } from '../../src/MenuAdmin.jsx';
import { Locale } from '../../src/staff-ui.jsx';
import '../../src/styles.css';
window.menuQa = { uploads: 0, saves: [], failUpload: false, failSave: false, loseSaveAck: false };
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
createRoot(document.getElementById('root')).render(<Fixture/>);
