import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ArrowLeftRight, Banknote, CheckCircle2, ChevronDown, ChevronRight, ClipboardList, LayoutGrid, LockKeyhole, LogOut, MoreHorizontal, Plus, Printer, QrCode, RefreshCw, Soup, Store, Users, Wallet, WifiOff, X } from 'lucide-react';
import { createCloudApi } from './cloud-api.mjs';
import { OrderPanel, PaymentDialog, OrdersView, Reports } from './App.jsx';
import { SettingsView, ShiftView, StaffView, TableSetupView } from './BackOffice.jsx';
import { MenuAdmin } from './MenuAdmin.jsx';
import { PosOrder } from './PosOrder.jsx';
import { TablesScreen } from './TablesScreen.jsx';
import { Dialog, EmptyState, Locale, initial, money, pad, roleText, useL, viewIcons, viewLabel } from './staff-ui.jsx';
import { currentShift, roleViews } from './backoffice-model.mjs';
import { checkoutReviewKey } from './customer-model.mjs';
import { isActiveOrder, needsKitchenHandoff, orderTotal } from './order-model.mjs';
import { matchesStaffTable, nextStaffOrder, summarizeStaffTable } from './staff-model.mjs';
import { MenuQrContext, useMenuQr } from './use-menu-qr.js';
import { useOrderAlerts } from './use-order-alerts.js';
import { OrderAlerts } from './OrderAlerts.jsx';
import { openKitchenPreview, printKitchenTicket } from './kitchen-ticket.mjs';
import './cloud.css';

const newDraft = (methods = ['transfer']) => ({ cart: [], method: methods.includes('transfer') ? 'transfer' : methods[0] });
const views = ['tables','orders','shift','menu','table-setup','staff','reports','settings','pos'];
const currentView = () => views.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'tables';
const storage = (() => { try { return window.localStorage; } catch { return null; } })();
const uuid = () => crypto.randomUUID();
// An uncertain acknowledgement must retry the original quote before starting another order.
const normalizeDraft = (draft, methods) => draft.attempted || methods.includes(draft.method) ? draft : { ...draft, method: methods[0], requestId: uuid() };
const sessionChanged = () => Object.assign(new Error('session-changed'), { code: 'session-changed' });
const rejectedCreate = new Set(['method','cart','menu-changed','sold-out','cart-changed','table','invalid','access-denied']);

function errorText(error, t) {
  const code = error?.code || error?.message;
  const messages = {
    'no-membership': t('ບັນຊີນີ້ຍັງບໍ່ມີສິດໃນຮ້ານ', 'บัญชีนี้ยังไม่มีสิทธิ์ในร้าน'),
    'session-expired': t('ກະລຸນາເຂົ້າລະບົບອີກຄັ້ງ', 'กรุณาเข้าสู่ระบบอีกครั้ง'),
    'access-denied': t('ບັນຊີນີ້ບໍ່ມີສິດເຮັດລາຍການນີ້', 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้'),
    'forbidden': t('ບັນຊີນີ້ບໍ່ມີສິດເຮັດລາຍການນີ້', 'บัญชีนี้ไม่มีสิทธิ์ทำรายการนี้'),
    'shift-required': t('ເປີດກະກ່ອນຮັບເງິນ', 'เปิดกะก่อนรับเงิน'),
    'shift-open': t('ມີກະເປີດຢູ່ແລ້ວ', 'มีกะเปิดอยู่แล้ว'),
    'stale-shift': t('ກະປ່ຽນແລ້ວ · ກະລຸນາກວດອີກຄັ້ງ', 'กะเปลี่ยนแล้ว กรุณาตรวจอีกครั้ง'),
    'shift-total-changed': t('ຍອດເງິນປ່ຽນແລ້ວ · ກະລຸນານັບໃໝ່', 'ยอดเงินเปลี่ยนแล้ว กรุณานับใหม่'),
    'table-busy': t('ໂຕະນີ້ຍັງມີອໍເດີ · ປິດອໍເດີກ່ອນ', 'โต๊ะนี้ยังมีออเดอร์ กรุณาปิดออเดอร์ก่อน'),
    'sold-out': t('ມີເມນູໝົດ · ກວດລາຍການອີກຄັ້ງ', 'มีเมนูหมด กรุณาตรวจรายการอีกครั้ง'),
    'changed': t('ລາຍການປ່ຽນແລ້ວ · ກວດຂໍ້ມູນລ່າສຸດກ່ອນລອງໃໝ່', 'รายการเปลี่ยนแล้ว กรุณาตรวจข้อมูลล่าสุดก่อนลองใหม่'),
    'already-paid': t('ອໍເດີນີ້ຮັບເງິນແລ້ວ', 'ออเดอร์นี้รับเงินแล้ว'),
    'cart-changed': t('ລາຍການ ຫຼື ລາຄາປ່ຽນແລ້ວ · ກວດອີກຄັ້ງ', 'รายการหรือราคาเปลี่ยนแล้ว กรุณาตรวจอีกครั้ง'),
    'menu-changed': t('ເມນູ ຫຼື ລາຄາປ່ຽນແລ້ວ · ກວດລາຍການກ່ອນລອງໃໝ່', 'เมนูหรือราคาเปลี่ยนแล้ว กรุณาตรวจรายการก่อนลองใหม่'),
    'amount': t('ກວດຈຳນວນເງິນອີກຄັ້ງ', 'กรุณาตรวจจำนวนเงินอีกครั้ง'),
    'busy': t('ກຳລັງບັນທຶກລາຍການ · ກະລຸນາລໍຖ້າ', 'กำลังบันทึกรายการ กรุณารอสักครู่'),
    'owner-not-authorized': t('ອີເມວນີ້ບໍ່ມີສິດເປີດຮ້ານ · ຕິດຕໍ່ເຈົ້າຂອງ', 'อีเมลนี้ไม่มีสิทธิ์เปิดร้าน กรุณาติดต่อเจ้าของร้าน'),
    'email-unverified': t('ກະລຸນາຢືນຢັນອີເມວກ່ອນ', 'กรุณายืนยันอีเมลก่อน'),
    'device-denied': t('ເຄື່ອງນີ້ຍັງບໍ່ມີສິດເຂົ້າຮ້ານ · ຕິດຕໍ່ຜູ້ດູແລ', 'เครื่องนี้ยังไม่มีสิทธิ์เข้าร้าน กรุณาติดต่อผู้ดูแล'),
    'upgrade-required': t('ກະລຸນາໃຫ້ຜູ້ດູແລອັບເດດລະບົບຮ້ານ ແລ້ວລອງໃໝ່', 'กรุณาให้ผู้ดูแลอัปเดตระบบร้าน แล้วลองใหม่'),
  };
  return messages[code] || t('ບັນທຶກບໍ່ສຳເລັດ · ກວດການເຊື່ອມຕໍ່ ແລ້ວລອງໃໝ່', 'บันทึกไม่สำเร็จ กรุณาตรวจการเชื่อมต่อแล้วลองใหม่');
}

export function CloudAuth({ client, onSignedIn }) {
  const { t } = useL();
  const [mode,setMode] = useState('login');
  const [email,setEmail] = useState('');
  const [password,setPassword] = useState('');
  const [busy,setBusy] = useState(false);
  const [message,setMessage] = useState('');
  const [error,setError] = useState('');
  async function submit(event) {
    event.preventDefault(); if(busy) return;
    setBusy(true);setError('');setMessage('');
    try {
      if(mode==='signup' && password.length<12) { setError(t('ລະຫັດຜ່ານຕ້ອງມີຢ່າງໜ້ອຍ 12 ຕົວ', 'รหัสผ่านต้องมีอย่างน้อย 12 ตัวอักษร')); return; }
      const result=mode==='signup' ? await client.auth.signUp({email:email.trim(),password}) : await client.auth.signInWithPassword({email:email.trim(),password});
      if(result.error) {
        const code=result.error.code;
        setError(code==='email_not_confirmed' ? t('ຢືນຢັນອີເມວກ່ອນເຂົ້າໃຊ້', 'กรุณายืนยันอีเมลก่อนเข้าสู่ระบบ') : t('ເຂົ້າລະບົບບໍ່ສຳເລັດ · ກວດອີເມວ ແລະ ລະຫັດຜ່ານ', 'เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจอีเมลและรหัสผ่าน'));
      } else if(result.data?.session) {setPassword('');onSignedIn(result.data.session);}
      else {setPassword('');setMessage(t('ກວດອີເມວເພື່ອຢືນຢັນບັນຊີ ແລ້ວກັບມາເຂົ້າລະບົບ', 'เปิดอีเมลเพื่อยืนยันบัญชี แล้วกลับมาเข้าสู่ระบบ'));setMode('login');}
    }catch{setError(t('ເຊື່ອມຕໍ່ບໍ່ໄດ້ · ກະລຸນາລອງໃໝ່','เชื่อมต่อไม่ได้ กรุณาลองใหม่'));}
    finally{setBusy(false);}
  }
  return <main className="cloud-entry"><section className="cloud-access-card"><span className="cloud-brand"><Soup size={30}/><b>Khao Piek POS</b></span><h1>{mode==='login'?t('ເຂົ້າລະບົບຮ້ານ','เข้าสู่ระบบร้าน'):t('ສ້າງບັນຊີ','สร้างบัญชี')}</h1><p>{t('ໃຊ້ບັນຊີທີ່ໄດ້ຮັບສິດຈາກເຈົ້າຂອງຮ້ານ','ใช้บัญชีที่ได้รับสิทธิ์จากเจ้าของร้าน')}</p><form onSubmit={submit} className="form-stack"><label className="form-field"><span>{t('ອີເມວ','อีเมล')}</span><input required type="email" autoComplete="username" value={email} onChange={event=>setEmail(event.target.value)} disabled={busy}/></label><label className="form-field"><span>{t('ລະຫັດຜ່ານ','รหัสผ่าน')}</span><input required type="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='signup'?12:1} value={password} onChange={event=>setPassword(event.target.value)} disabled={busy}/></label>{error&&<p role="alert" className="cloud-error">{error}</p>}{message&&<p role="status" className="cloud-success">{message}</p>}<button className="button primary full" disabled={busy}><LockKeyhole size={19}/>{busy?t('ກຳລັງເຊື່ອມຕໍ່…','กำลังเชื่อมต่อ…'):mode==='login'?t('ເຂົ້າລະບົບ','เข้าสู่ระบบ'):t('ສ້າງບັນຊີ','สร้างบัญชี')}</button><button type="button" className="button secondary full" disabled={busy} onClick={()=>{setMode(mode==='login'?'signup':'login');setError('');setMessage('');}}>{mode==='login'?t('ສ້າງບັນຊີໃໝ່','สร้างบัญชีใหม่'):t('ກັບໄປເຂົ້າລະບົບ','กลับไปเข้าสู่ระบบ')}</button></form></section></main>;
}

function OwnerSetup({api,onReady,onSignOut,email}) {
  const {t}=useL();const [name,setName]=useState('');const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  async function submit(event){event.preventDefault();if(busy)return;setBusy(true);setError('');try{onReady(await api.claimOwner(name.trim()));}catch(e){setError(errorText(e,t));}finally{setBusy(false);}}
  return <main className="cloud-entry"><section className="cloud-access-card"><span className="cloud-brand"><Store size={29}/><b>Khao Piek POS</b></span><h1>{t('ເລີ່ມໃຊ້ຮ້ານຂອງທ່ານ','เริ่มใช้ร้านของคุณ')}</h1>{email&&<p>{email}</p>}<form className="form-stack" onSubmit={submit}><label className="form-field"><span>{t('ຊື່ຮ້ານ','ชื่อร้าน')}</span><input required maxLength={40} value={name} onChange={e=>setName(e.target.value)} disabled={busy}/></label><p>{t('ເພີ່ມເມນູ ແລະ ໂຕະຂອງຮ້ານຫຼັງເປີດໃຊ້','เพิ่มเมนูและโต๊ะของร้านหลังเปิดใช้งาน')}</p>{error&&<p className="cloud-error" role="alert">{error}</p>}<button className="button primary full" disabled={busy||!name.trim()}><CheckCircle2 size={19}/>{t('ເປີດໃຊ້ຮ້ານ','เปิดใช้ร้าน')}</button>{onSignOut&&<button type="button" className="button secondary full" disabled={busy} onClick={onSignOut}><LogOut size={18}/>{t('ອອກຈາກລະບົບ','ออกจากระบบ')}</button>}</form></section></main>;
}

function CloudMessage({title,text,onRetry}) {return <main className="cloud-entry"><section className="cloud-access-card"><span className="cloud-brand"><Store size={29}/><b>Khao Piek POS</b></span><h1>{title}</h1><p>{text}</p>{onRetry&&<button className="button primary full" onClick={onRetry}><RefreshCw size={19}/>ລອງໃໝ່ / ลองใหม่</button>}</section></main>;}

export default function CloudApp({client}) {
 const [lang,setLang]=useState('lo');const t=(lo,th)=>lang==='lo'?lo:th;
 return <Locale.Provider value={{lang,t}}>{client?<ConnectedApp client={client} lang={lang} setLang={setLang}/>:<CloudMessage title={t('ຍັງເຊື່ອມຕໍ່ຮ້ານບໍ່ໄດ້','ยังเชื่อมต่อร้านไม่ได้')} text={t('ກະລຸນາຕິດຕໍ່ຜູ້ດູແລເພື່ອຕັ້ງຄ່າຮ້ານ','กรุณาติดต่อผู้ดูแลเพื่อตั้งค่าร้าน')}/>}</Locale.Provider>;
}

function ConnectedApp({client,lang,setLang}) {
 const {t}=useL();const api=useMemo(()=>createCloudApi(client),[client]);
 const deviceAccess=client.accessMode==='device';
 const [auth,setAuth]=useState(undefined);const [schema,setSchema]=useState(null);const [setup,setSetup]=useState(false);
 const identityReady=deviceAccess||Boolean(auth?.user);const identityKey=deviceAccess?'device':auth?.user?.id;
 const [session,setSession]=useState(null);const sessionRef=useRef(null);const version=useRef(0);const working=useRef(null);const printing=useRef(new Set());
 const identity=useRef({key:deviceAccess?'device':undefined,generation:0});const authChanges=useRef(0);const refreshing=useRef(null);const signedOut=useRef(false);
 const [connected,setConnected]=useState(true);const [busy,setBusy]=useState(false);const [retry,setRetry]=useState(0);const [toast,setToast]=useState('');
 const [view,setView]=useState(currentView);const [activeTable,setActiveTable]=useState(null);const [selectedOrder,setSelectedOrder]=useState(null);
 const [tableFilter,setTableFilter]=useState('all');const [orderFilter,setOrderFilter]=useState('all');const [openId,setOpenId]=useState(null);const [dialog,setDialog]=useState(null);const [drafts,setDrafts]=useState({});
 const [now,setNow]=useState(new Date());
 const go=destination=>{setView(destination);location.hash=destination;setDialog(null);window.scrollTo({top:0,behavior:'instant'});};
 const updateAuth=useCallback(value=>{
   ++authChanges.current;const key=deviceAccess?'device':value?.user?.id;
   if(identity.current.key!==key){identity.current={key,generation:identity.current.generation+1};++version.current;sessionRef.current=null;setSession(null);setDrafts({});setDialog(null);setSetup(false);working.current=null;setBusy(false);}
   setAuth(value);
 },[deviceAccess]);
 const apply=useCallback(next=>{sessionRef.current=next;setSession(next);setConnected(true);setSetup(false);setDrafts(current=>{
   let changed=false;const normalized=Object.fromEntries(Object.entries(current).map(([table,draft])=>{const nextDraft=normalizeDraft(draft,next.settings.methods);changed ||= nextDraft!==draft;return [table,nextDraft];}));return changed?normalized:current;
 });},[]);
 const refresh=useCallback(async()=>{
   if(!identity.current.key)return;
   if(working.current){working.current.refreshQueued=true;return;}
   const generation=identity.current.generation;
   if(refreshing.current?.generation===generation){refreshing.current.queued=true;return refreshing.current.promise;}
   const request={generation,stamp:version.current,queued:false};refreshing.current=request;
   request.promise=(async()=>{
     const current=()=>generation===identity.current.generation&&request.stamp===version.current;
     try{const next=await api.snapshot(sessionRef.current?.restaurantId);if(current())apply(next);}
     catch(error){if(!current())return;if(error.code==='no-membership'){setSetup(true);sessionRef.current=null;setSession(null);}else setConnected(false);}
     finally{if(refreshing.current===request)refreshing.current=null;if(request.queued&&generation===identity.current.generation)void refresh();}
   })();
   return request.promise;
 },[api,apply]);
 useEffect(()=>{if(deviceAccess)return;let active=true;const stamp=authChanges.current;const {data}=client.auth.onAuthStateChange((event,value)=>{if(!active||(signedOut.current&&value&&event!=='SIGNED_IN'))return;if(event==='SIGNED_IN')signedOut.current=false;updateAuth(value);});client.auth.getSession().then(({data,error})=>{if(active&&stamp===authChanges.current)updateAuth(error?null:data.session);}).catch(()=>{if(active&&stamp===authChanges.current)updateAuth(null);});return()=>{active=false;data.subscription.unsubscribe();};},[client,deviceAccess,updateAuth]);
 useEffect(()=>{let active=true;setSchema(null);client.rpc('pos_setup_status').then(({data,error})=>{if(active)setSchema(!error&&data?.schemaVersion>=2&&data.guestOrdersReady&&data.paymentsReady&&(!deviceAccess||data.deviceAccessReady===true)?true:false);}).catch(()=>{if(active)setSchema(false);});return()=>{active=false;};},[client,deviceAccess,retry]);
 useEffect(()=>{++version.current;sessionRef.current=null;setSession(null);setDrafts({});setSetup(false);if(identityReady&&schema)void refresh();},[identityKey,schema,retry,refresh]);
 useEffect(()=>{if(!identityReady||!schema)return;const tick=()=>{if(document.visibilityState==='visible')void refresh();};const timer=setInterval(tick,3000);document.addEventListener('visibilitychange',tick);return()=>{clearInterval(timer);document.removeEventListener('visibilitychange',tick);};},[identityKey,schema,refresh]);
 useEffect(()=>{if(deviceAccess||!session?.restaurantId)return;const channel=client.channel(`shop:${session.restaurantId}`).on('postgres_changes',{event:'*',schema:'public',filter:`restaurant_id=eq.${session.restaurantId}`},()=>void refresh()).subscribe();return()=>{void client.removeChannel(channel);};},[client,deviceAccess,session?.restaurantId,refresh]);
 useEffect(()=>{const update=()=>setView(currentView());addEventListener('hashchange',update);return()=>removeEventListener('hashchange',update);},[]);
 useEffect(()=>{const timer=setInterval(()=>setNow(new Date()),30000);return()=>clearInterval(timer);},[]);
 useEffect(()=>{document.documentElement.lang=lang;},[lang]);
 useEffect(()=>{if(!toast)return;const timer=setTimeout(()=>setToast(''),6500);return()=>clearTimeout(timer);},[toast]);
 useEffect(()=>{if(session&&!session.tables.some(row=>row.number===activeTable))setActiveTable(session.tables[0]?.number??null);},[session?.tables,activeTable]);
 const orders=session?.orders??[];const user=session?.staff.find(member=>member.id===session.userId);const allowed=roleViews[user?.role]??[];
 const alerts=useOrderAlerts({orders,storage,enabled:allowed.includes('orders'),scope:session?.restaurantId});
 async function signOut(){if(deviceAccess)return;signedOut.current=true;updateAuth(null);setToast('');try{await client.auth.signOut({scope:'local'});}catch{/* Local access has already been cleared. */}}
 async function mutate(action,payload){
   if(working.current)throw Object.assign(new Error('busy'),{code:'busy'});
   if(!sessionRef.current)throw sessionChanged();
   const operation={generation:identity.current.generation,stamp:++version.current,refreshQueued:false};working.current=operation;setBusy(true);
   try{const next=await api.command(action,payload,sessionRef.current.restaurantId);if(operation.generation!==identity.current.generation||operation.stamp!==version.current)throw sessionChanged();apply(next);return next;}
   catch(error){if(operation.generation!==identity.current.generation)throw sessionChanged();throw error;}
   finally{if(working.current===operation){working.current=null;setBusy(false);if(operation.refreshQueued)void refresh();}}
 }
 async function save(action,payload){try{await mutate(action,payload);setToast(t('ບັນທຶກແລ້ວ','บันทึกแล้ว'));return null;}catch(error){if(error.code!=='session-changed'){setToast(errorText(error,t));void refresh();}return error.code||'save-failed';}}
 function saveSettings(changes){const settings={...sessionRef.current.settings,...changes};return save('settings.save',{...settings,name:settings.shopName});}
 const orderPayload=order=>({id:order.id,revision:order.revision});
 async function printOrder(id,{copy=true,preview}={}){
  if(printing.current.has(id)){preview?.close();return false;}const order=sessionRef.current?.orders.find(o=>o.id===id);if(!order?.paid){preview?.close();return false;}printing.current.add(id);const generation=identity.current.generation;
  try{await printKitchenTicket(order,{shopName:sessionRef.current.settings.shopName,language:lang,copy,preview});
   if(generation!==identity.current.generation)throw sessionChanged();
   if(needsKitchenHandoff(order)){try{await mutate('order.kitchen-sent',orderPayload(order));}catch(error){await refresh();if(needsKitchenHandoff(sessionRef.current.orders.find(o=>o.id===id)??order))throw error;}}
   setTableFilter(value=>value==='handoff'?'all':value);setOrderFilter(value=>value==='handoff'?'kitchen':value);setToast(t('ເປີດພິມໃບຄົວແລ້ວ','เปิดพิมพ์ใบครัวแล้ว'));return true;
  }catch(error){if(error.code!=='session-changed')setToast(t('ຮັບເງິນແລ້ວ · ກວດເຄື່ອງພິມ ແລ້ວກົດພິມໃບຄົວອີກຄັ້ງ','รับเงินแล้ว กรุณาตรวจเครื่องพิมพ์แล้วกดพิมพ์ใบครัวอีกครั้ง'));return false;}finally{printing.current.delete(id);}
 }
 async function decide(order,action,method,received){let preview;try{if(action==='pay')preview=openKitchenPreview();const next=await mutate(`order.${action}`,{...orderPayload(order),method,received,idempotencyKey:order.id});setDialog(null);setSelectedOrder(order.id);setTableFilter('all');setOrderFilter('all');if(action==='pay'){if(next.commandChanged!==false)await printOrder(order.id,{copy:false,preview});else{preview?.close();setToast(t('ອໍເດີນີ້ຮັບເງິນແລ້ວ · ກວດໃບຄົວ','ออเดอร์นี้รับเงินแล้ว กรุณาตรวจใบครัว'));}}else setToast(t('ບັນທຶກບໍ່ພົບຍອດແລ້ວ','บันทึกว่าไม่พบยอดแล้ว'));return null;}catch(error){preview?.close();if(error.code==='session-changed')return null;await refresh();const current=sessionRef.current?.orders.find(item=>item.id===order.id);if(action==='pay'&&current?.paid){setDialog(null);setToast(t('ຮັບເງິນແລ້ວ · ກວດໃບຄົວກ່ອນລອງພິມໃໝ່','รับเงินแล้ว กรุณาตรวจใบครัวก่อนลองพิมพ์ใหม่'));return null;}return errorText(error,t);}}
 function pay(order){if(!currentShift(sessionRef.current.shifts)){setToast(t('ເປີດກະກ່ອນຮັບເງິນ','เปิดกะก่อนรับเงิน'));go('shift');return;}setDialog({type:'payment',order});}
 async function act(id,action){const order=sessionRef.current.orders.find(item=>item.id===id);if(!order)return false;return !await save(`order.${action}`,orderPayload(order));}
 function updateDraft(transform){if(drafts[activeTable]?.attempted)return false;const methods=sessionRef.current.settings.methods;setDrafts(current=>current[activeTable]?.attempted?current:{...current,[activeTable]:{...normalizeDraft(transform(current[activeTable]??newDraft(methods)),methods),requestId:uuid()}});return true;}
 async function submitPos(takePayment){const methods=sessionRef.current.settings.methods;const draft=normalizeDraft(drafts[activeTable]??newDraft(methods),methods);const requestId=draft.requestId||uuid();if(!draft.cart.length)return t('ເລືອກອາຫານກ່ອນ','กรุณาเลือกอาหารก่อน');setDrafts(current=>({...current,[activeTable]:{...draft,requestId,attempted:true}}));try{const before=new Set(sessionRef.current.orders.map(o=>o.id));const next=await mutate('order.create',{table:activeTable,cart:draft.cart,method:draft.method,requestId,reviewedKey:checkoutReviewKey(activeTable,draft.cart,draft.method)});const placed=next.orders.find(order=>order.id===next.commandOrderId)??next.orders.find(order=>!before.has(order.id));if(!placed)throw new Error('Order acknowledgement missing');setDrafts(current=>({...current,[activeTable]:newDraft(next.settings.methods)}));go('tables');setSelectedOrder(placed.id);if(takePayment)pay(placed);return null;}catch(error){if(error.code==='session-changed')return null;if(rejectedCreate.has(error.code))setDrafts(current=>current[activeTable]?.requestId===requestId?{...current,[activeTable]:normalizeDraft({...current[activeTable],attempted:false},sessionRef.current.settings.methods)}:current);return errorText(error,t);}}
 const identityGeneration=identity.current.generation;
 if(schema===false)return <CloudMessage title={t('ລະບົບຮ້ານຍັງຕັ້ງຄ່າບໍ່ຄົບ','ระบบร้านยังตั้งค่าไม่ครบ')} text={t('ກະລຸນາໃຫ້ຜູ້ດູແລຕິດຕັ້ງລະບົບລ່າສຸດ ແລ້ວລອງໃໝ່','กรุณาให้ผู้ดูแลติดตั้งระบบล่าสุด แล้วลองใหม่')} onRetry={()=>setRetry(value=>value+1)}/>;
 if((!deviceAccess&&auth===undefined)||schema===null)return <CloudMessage title={t('ກຳລັງເຊື່ອມຕໍ່…','กำลังเชื่อมต่อ…')} text=""/>;
 if(!deviceAccess&&!auth)return <CloudAuth client={client} onSignedIn={value=>{signedOut.current=false;updateAuth(value);}}/>;
 if(setup)return <OwnerSetup api={api} onReady={next=>{if(identity.current.generation===identityGeneration)apply(next);}} onSignOut={deviceAccess?undefined:signOut} email={deviceAccess?undefined:auth.user.email}/>;
 if(!session||!user)return <CloudMessage title={connected?t('ກຳລັງໂຫຼດຮ້ານ…','กำลังโหลดร้าน…'):t('ເຊື່ອມຕໍ່ຮ້ານບໍ່ໄດ້','เชื่อมต่อร้านไม่ได้')} text={connected?'':t('ກວດອິນເຕີເນັດ ແລ້ວລອງໃໝ່','กรุณาตรวจอินเทอร์เน็ตแล้วลองใหม่')} onRetry={()=>setRetry(value=>value+1)}/>;
 const screen=allowed.includes(view)?view:allowed[0];const activeOrders=orders.filter(isActiveOrder);const tableOrders=activeOrders.filter(order=>order.table===activeTable);const order=nextStaffOrder(tableOrders,selectedOrder,tableFilter);const tableInfo=session.tables.find(table=>table.number===activeTable);
 const selectedVisible=tableInfo&&matchesStaffTable(summarizeStaffTable(tableOrders,session.calls[activeTable]),tableFilter);
 const groups=[['daily',['tables','orders','shift']],['manage',['menu','table-setup','staff','reports']],['system',['settings']]];
 const captions={daily:t('ວຽກປະຈຳວັນ','งานประจำวัน'),manage:t('ຈັດການຮ້ານ','จัดการร้าน'),system:t('ລະບົບ','ระบบ')};
 const emptyTables=<EmptyState icon={LayoutGrid} title={t('ຍັງບໍ່ມີໂຕະ','ยังไม่มีโต๊ะ')} text={t('ເພີ່ມໂຕະຂອງຮ້ານເພື່ອເລີ່ມຮັບອໍເດີ','เพิ่มโต๊ะของร้านเพื่อเริ่มรับออเดอร์')}>{allowed.includes('table-setup')&&<button className="button primary" onClick={()=>go('table-setup')}><Plus size={19}/>{t('ເພີ່ມໂຕະ','เพิ่มโต๊ะ')}</button>}</EmptyState>;
 return <MenuQrContext.Provider value={{tables:session.tables}}><div className="app cloud-app"><a className="skip-link" href="#main-content">{t('ຂ້າມໄປເນື້ອຫາ','ข้ามไปเนื้อหา')}</a><aside className="sidebar"><button className="brand" onClick={()=>go('tables')}><span className="brand-symbol"><Soup size={30}/></span><span><strong>ເຂົ້າປຽກ<span className="brand-period">.</span></strong><small>KHAO PIEK POS</small></span></button><div className="shop-selector is-static"><span className="shop-icon"><Store size={20}/></span><span><strong>{session.settings.shopName}</strong>{session.settings.branch&&<small>{session.settings.branch}</small>}</span></div>{groups.map(([group,ids])=>{const available=ids.filter(id=>allowed.includes(id));return available.length>0&&<React.Fragment key={group}><div className="nav-caption">{captions[group]}</div><nav className="main-nav" aria-label={captions[group]}>{available.map(id=>{const Icon=viewIcons[id];return <button key={id} className={screen===id?'active':''} aria-current={screen===id?'page':undefined} onClick={()=>go(id)} title={viewLabel(id,t)}><Icon size={21}/><span>{viewLabel(id,t)}</span></button>;})}</nav></React.Fragment>;})}<div className="sidebar-bottom">{deviceAccess?<div className="profile"><span className="avatar">{initial(user.name)}</span><span><strong>{user.name}</strong><small>{roleText(user.role,t)}</small></span></div>:<button className="profile" onClick={signOut}><span className="avatar">{initial(user.name)}</span><span><strong>{user.name}</strong><small>{roleText(user.role,t)}</small></span><LogOut size={18}/></button>}</div></aside><div className="workspace"><header className="topbar staff-topbar">
   <div className="location-label"><Store size={18}/><span>{session.settings.shopName}</span></div>
   <OrderAlerts orders={alerts.orderAlerts} unreadCount={alerts.unreadCount} notice={alerts.notice} onDismissNotice={alerts.dismissNotice} soundEnabled={alerts.soundEnabled} onSoundToggle={alerts.setSound} onRead={alerts.markRead} onViewOrders={()=>{go('orders');setOrderFilter('pending');}} onOpenOrder={id=>{go('orders');setOpenId(id);setOrderFilter('all');}}/>
   <div className="topbar-actions">
     <time className="header-clock">{now.toLocaleTimeString('en-GB',{timeZone:'Asia/Vientiane',hour:'2-digit',minute:'2-digit'})}</time>
     <button className="language-button" onClick={()=>setLang(lang==='lo'?'th':'lo')}>{lang==='lo'?'ລາວ':'ไทย'}<ChevronDown size={14}/></button>
   </div>
 </header>{!connected&&<div className="offline-banner" role="alert"><WifiOff size={18}/>{t('ກຳລັງເຊື່ອມຕໍ່ໃໝ່ · ກວດຂໍ້ມູນກ່ອນບັນທຶກ','กำลังเชื่อมต่อใหม่ กรุณาตรวจข้อมูลก่อนบันทึก')}<button onClick={()=>void refresh()}><RefreshCw size={18}/></button></div>}{busy&&<div className="cloud-saving" role="status">{t('ກຳລັງບັນທຶກ…','กำลังบันทึก…')}</div>}<main id="main-content" tabIndex={-1} className={`main-content view-${screen}`} aria-busy={busy}>
 {screen==='tables'&&(session.tables.length?<><TablesScreen tables={session.tables} activeOrders={activeOrders} calls={session.calls} activeTable={activeTable} filter={tableFilter} setFilter={value=>{setTableFilter(value);setSelectedOrder(null);}} now={now} onSelect={number=>{setActiveTable(number);setSelectedOrder(null);}}/>{selectedVisible&&<OrderPanel table={activeTable} info={tableInfo} order={order} tableOrders={tableOrders} call={session.calls[activeTable]} now={now} setSelected={setSelectedOrder} onPay={()=>pay(order)} onAct={act} onPrint={printOrder} onAdd={()=>go('pos')} onQr={()=>setDialog({type:'qr',table:activeTable})} onAnswerCall={()=>save('call.answer',{table:activeTable})}/>}</>:<section className="full-page">{emptyTables}</section>)}
 {screen==='orders'&&<OrdersView orders={orders} filter={orderFilter} setFilter={setOrderFilter} openId={openId} setOpenId={setOpenId} now={now} onPay={pay} onAct={act} onPrint={printOrder} onGoTable={value=>{setActiveTable(value.table);setSelectedOrder(value.id);setTableFilter('all');go('tables');}}/>}
 {screen==='menu'&&<MenuAdmin menu={session.menu} canEdit={['owner','manager'].includes(user.role)} onUploadImage={blob=>api.uploadMenuImage(blob,session.restaurantId)} onToggle={id=>save('menu.availability',{id,available:!session.menu.find(item=>item.id===id)?.available})} onSave={dish=>save('menu.save',dish)} onDelete={id=>save('menu.remove',{id})}/>}
 {screen==='table-setup'&&<TableSetupView tables={session.tables} orders={orders} shopName={session.settings.shopName} onAdd={()=>save('table.add',{number:Math.max(0,...session.tables.map(table=>table.number))+1,seats:4,zone:''})} onRemoveLast={async number=>!await save('table.remove',{id:session.tables.find(table=>table.number===number)?.id})} onUpdate={async(number,changes)=>!await save('table.update',{...changes,id:session.tables.find(table=>table.number===number)?.id,number})} onShowQr={table=>setDialog({type:'qr',table})}/>}
 {screen==='shift'&&<ShiftView shifts={session.shifts} orders={orders} payments={session.payments} user={user} onOpen={async openingCash=>!await save('shift.open',{openingCash})} onClose={async(countedCash,id,expectedCash)=>!await save('shift.close',{id,countedCash,expectedCash})}/>}
 {screen==='staff'&&<StaffView cloud staff={session.staff} user={user} onSave={member=>save('staff.save',member)}/>}
 {screen==='settings'&&<SettingsView settings={session.settings} activity={session.activity} menu={session.menu} onSave={saveSettings}/>}
 {screen==='reports'&&<Reports orders={orders} now={now}/>}
 {screen==='pos'&&(tableInfo?<PosOrder table={activeTable} tables={session.tables} menu={session.menu} draft={normalizeDraft(drafts[activeTable]??newDraft(session.settings.methods),session.settings.methods)} onTable={setActiveTable} onUpdateDraft={updateDraft} onSubmit={submitPos} onBack={()=>go('tables')}/>:emptyTables)}
 </main><nav className="mobile-nav" aria-label={t('ເມນູຮ້ານ','เมนูร้าน')}>{['tables','orders','shift'].filter(id=>allowed.includes(id)).map(id=>{const Icon=viewIcons[id];return <button key={id} className={screen===id?'active':''} onClick={()=>go(id)}><Icon size={22}/>{viewLabel(id,t)}</button>;})}<button onClick={()=>setDialog({type:'more'})}><MoreHorizontal size={22}/>{t('ເພີ່ມເຕີມ','เพิ่มเติม')}</button></nav></div>{toast&&<div className="toast" role="status"><CheckCircle2 size={20}/><span>{toast}</span><button onClick={()=>setToast('')} aria-label={t('ປິດ','ปิด')}><X size={18}/></button></div>}
 {dialog?.type==='payment'&&<PaymentDialog order={dialog.order} methods={session.settings.methods} shiftOpen={Boolean(currentShift(session.shifts))} onClose={()=>setDialog(null)} onConfirm={(method,received)=>decide(dialog.order,'pay',method,received)} onReject={()=>decide(dialog.order,'reject')}/>}
 {dialog?.type==='qr'&&<CloudQr table={dialog.table} shopName={session.settings.shopName} onClose={()=>setDialog(null)}/>}
 {dialog?.type==='more'&&<Dialog title={t('ເມນູຮ້ານ','เมนูร้าน')} onClose={()=>setDialog(null)}><div className="more-menu">{['menu','table-setup','staff','reports','settings'].filter(id=>allowed.includes(id)).map(id=>{const Icon=viewIcons[id];return <button className="button secondary full" key={id} onClick={()=>go(id)}><Icon size={21}/>{viewLabel(id,t)}<ChevronRight size={18}/></button>;})}{!deviceAccess&&<button className="button secondary full" onClick={signOut}><LogOut size={21}/>{t('ອອກຈາກລະບົບ','ออกจากระบบ')}</button>}</div></Dialog>}
 </div></MenuQrContext.Provider>;
}
function CloudQr({table,shopName,onClose}){const {t}=useL();const {menuUrl,image,error}=useMenuQr(table);return <Dialog title={`${t('QR ສັ່ງອາຫານ','QR สั่งอาหาร')} · ${pad(table)}`} onClose={onClose} className="qr-dialog"><div className="qr-print"><Soup size={30}/><h3>{shopName}</h3>{image?<img width="240" height="240" src={image} alt={`QR ${pad(table)}`}/>:<p>{error?t('ສ້າງ QR ບໍ່ສຳເລັດ','สร้าง QR ไม่สำเร็จ'):t('ກຳລັງສ້າງ QR…','กำลังสร้าง QR…')}</p>}<strong>{t('ໂຕະ','โต๊ะ')} {pad(table)}</strong></div>{menuUrl&&<a className="button primary full" href={menuUrl} target="_blank" rel="noreferrer"><QrCode size={19}/>{t('ເປີດເມນູ','เปิดเมนู')}</a>}</Dialog>;}
