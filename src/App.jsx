import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowLeftRight, Soup, LayoutGrid, ClipboardList, Utensils, BarChart3, Smartphone, ChevronDown, ChevronRight, ArrowUpRight, Plus, Search, QrCode, Clock3, Users, Check, X, Banknote, CreditCard, CircleHelp, CheckCircle2, ArrowRight, Armchair, Store, WifiOff, MoreHorizontal, BellRing, CookingPot, Undo2, Hand, GlassWater, Wallet, Printer } from 'lucide-react';
import LanCustomer from './LanCustomer.jsx';
import { StaffStatusFilters, staffStatusGroup as tableGroup, staffStatusIcons as tileIcons } from './TablesScreen.jsx';
import { Dialog, IconButton, EmptyState, itemName, money, pad, statusText, useL } from './staff-ui.jsx';
import { isActiveOrder, needsKitchenHandoff, orderTotal } from './order-model.mjs';
import { staffOrderState, summarizeStaffTable } from './staff-model.mjs';
import { cashSuggestions, paidInRange } from './backoffice-model.mjs';
import { getCloudClient } from './cloud-client.mjs';
import { probeDeviceAccess } from './device-client.mjs';
import './cloud.css';
const CloudApp = React.lazy(() => import('./CloudApp.jsx'));
const itemNote = (item,lang) => lang === 'th' ? item.noteTh || item.note : item.note;
const callIcons = { help: Hand, pay: Banknote, water: GlassWater };
const callLabel = (reason,t) => ({help:t('ເອີ້ນພະນັກງານ','เรียกพนักงาน'),pay:t('ຂໍຈ່າຍເງິນທີ່ໂຕະ','ขอจ่ายเงินที่โต๊ะ'),water:t('ຂໍນ້ຳເປົ່າ','ขอน้ำเปล่า')}[reason]);
const canServe = order => order.paid && !needsKitchenHandoff(order) && ['queued','cooking','ready'].includes(order.status);
const canPrint = order => order.paid && ['queued','cooking','ready','served'].includes(order.status);
const paymentPending = (order,t) => order.status === 'pending' && order.source === 'cashier' ? t('ລໍຖ້າຮັບເງິນ','รอรับเงิน') : statusText(staffOrderState(order),t);
export default function App() {
 const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search);
 if(params.has('table') || params.has('key')) return <LanCustomer table={params.get('table')}/>;
 return <StaffEntry/>;
}
function StaffEntry() {
 const [access,setAccess]=useState({pending:true});
 const [attempt,setAttempt]=useState(0);
 useEffect(()=>{
  let active=true;setAccess({pending:true});
  probeDeviceAccess().then(device=>{
   let client=device;
   if(!client){try{client=getCloudClient();}catch{client=null;}}
   if(active)setAccess({client,pending:false});
  }).catch(()=>{if(active)setAccess({error:true,pending:false});});
  return()=>{active=false;};
 },[attempt]);
 if(access.error)return <main className="cloud-entry"><section className="cloud-access-card"><span className="cloud-brand"><Store size={29}/><b>Khao Piek POS</b></span><h1>ເຊື່ອມຕໍ່ເຄື່ອງບໍ່ໄດ້</h1><p role="alert">ກວດວ່າແອັບເປີດຢູ່ໃນເຄື່ອງນີ້ ແລ້ວລອງໃໝ່</p><button className="button primary full" onClick={()=>setAttempt(value=>value+1)}>ລອງໃໝ່</button></section></main>;
 if(access.pending)return <div className="cloud-loading" role="status">ກຳລັງເຊື່ອມຕໍ່…</div>;
 return <React.Suspense fallback={<div className="cloud-loading" role="status">ກຳລັງເຊື່ອມຕໍ່…</div>}><CloudApp client={access.client}/></React.Suspense>;
}
function OrderPanel({table,info,order,tableOrders,call,now,setSelected,onPay,onAct,onPrint,onAdd,onQr,onAnswerCall}) {
  const {t,lang}=useL();
  const actionLock = useRef(false);
  const actionTimer = useRef(null);
  const [actionBusy, setActionBusy] = useState(false);
  useEffect(() => () => clearTimeout(actionTimer.current), []);
  function advance(action) {
    if (actionLock.current) return;
    actionLock.current = true;
    setActionBusy(true);
    if (!onAct(order.id, action)) {
      actionLock.current = false;
      setActionBusy(false);
      return;
    }
    // The next ticket may occupy this same button immediately after a successful tap.
    actionTimer.current = setTimeout(() => { actionLock.current = false; setActionBusy(false); }, 650);
  }
  const due = summarizeStaffTable(tableOrders).due;
  const steps = [t('ຮັບເງິນ', 'รับเงิน'), t('ຄົວ', 'ครัว'), t('ເສີບ', 'เสิร์ฟ'), t('ປິດໂຕະ', 'ปิดโต๊ะ')];
  const stage = order ? { pending: 0, queued: 1, cooking: 1, ready: 2, served: 3 }[order.status] : -1;
  const state = order ? staffOrderState(order) : null;
  const StateIcon = order ? tileIcons[state] : null;
  const CallIcon = call && callIcons[call.reason];
  return <aside className="order-panel" aria-label={t('ລາຍລະອຽດໂຕະ','รายละเอียดโต๊ะ')}>
    <div className="order-panel-content">
    <button className="order-panel-back" onClick={() => document.querySelector('.table-workspace')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })}><ArrowLeft size={18}/>{t('ເລືອກໂຕະອື່ນ', 'เลือกโต๊ะอื่น')}</button>
    <div className="order-panel-heading"><div><h2>{t('ໂຕະ','โต๊ะ')} {pad(table)}</h2><span>{info?.zone||t('ຊັ້ນ 1','ชั้น 1')}<i/> {info?.seats??'–'} {t('ບ່ອນນັ່ງ','ที่นั่ง')}</span></div><IconButton label={t('QR ໂຕະນີ້','QR โต๊ะนี้')} onClick={onQr}><QrCode size={22}/></IconButton></div>
    {call&&<div className="call-banner" role="status"><span className="call-banner-icon"><CallIcon size={20}/></span><span><strong>{callLabel(call.reason,t)}</strong><small>{Math.max(0,Math.floor((now.getTime()-call.at)/60000))} {t('ນາທີກ່ອນ','นาทีที่แล้ว')}</small></span><button className="button secondary" onClick={onAnswerCall}><Check size={18}/>{t('ຮັບຊາບ','รับทราบ')}</button></div>}
    {tableOrders.length>1&&<div className={`counter-table-due ${due===0?'is-paid':''}`}><span>{t('ຄ້າງຊຳລະທັງໂຕະ','ค้างชำระทั้งโต๊ะ')}</span><strong>{due>0?`${money(due)} ₭`:t('ຊຳລະຄົບແລ້ວ','ชำระครบแล้ว')}</strong></div>}
    {tableOrders.length>1&&<div className="order-tabs">{tableOrders.map(o=><button key={o.id} aria-pressed={o.id===order?.id} className={o.id===order?.id?'selected':''} onClick={()=>setSelected(o.id)}><strong>#{o.orderNumber ?? o.id}</strong><span>{paymentPending(o,t)}</span></button>)}</div>}
    {order?<>
      <div className={`order-state ${tableGroup(state)}`}><StateIcon size={22}/><div><strong>{paymentPending(order,t)}</strong><span>#{order.orderNumber ?? order.id} · {new Date(order.createdAt).toLocaleTimeString('en-GB',{timeZone:'Asia/Vientiane',hour:'2-digit',minute:'2-digit'})} · {order.source==='cashier'?t('ພະນັກງານຮັບອໍເດີ','พนักงานรับออเดอร์'):t('ສັ່ງຈາກ QR','สั่งจาก QR')}</span></div></div>
      <ol className="order-steps">{steps.map((label,index)=><li key={label} className={index<stage?'done':index===stage?'now':''} aria-current={index===stage?'step':undefined}><i/>{label}</li>)}</ol>
      <div className="receipt-items"><div className="receipt-label"><h3>{t('ລາຍການອາຫານ','รายการอาหาร')}</h3><span>{order.items.reduce((s,i)=>s+i.quantity,0)} {t('ລາຍການ','รายการ')}</span></div>{order.items.map((item,i)=><div className="receipt-item" key={i}><span className="quantity-box">{item.quantity}</span><div><strong>{itemName(item,lang)}</strong>{item.category!=='drinks'&&<small>{item.size==='large'?t('ພິເສດ','พิเศษ'):t('ທຳມະດາ','ธรรมดา')}</small>}{item.note&&<span className="item-note">{itemNote(item,lang)}</span>}</div><span>{money(item.price*item.quantity)}</span></div>)}<button className="add-food" onClick={onAdd}><Plus size={18}/>{t('ເພີ່ມອໍເດີ','เพิ่มออเดอร์')}</button></div>
      {!needsKitchenHandoff(order) && <ReprintButton order={order} onPrint={onPrint} full/>}
    </>:<div className="empty-table"><span className="empty-icon"><Armchair size={42} strokeWidth={1.4}/></span><h3>{t('ພ້ອມຮັບລູກຄ້າ','พร้อมรับลูกค้า')}</h3><p>{t('ລູກຄ້າສະແກນ QR ເພື່ອສັ່ງອາຫານ ຫຼື ເພີ່ມອໍເດີໃຫ້ລູກຄ້າໄດ້ເລີຍ','ลูกค้าสแกน QR เพื่อสั่งอาหาร หรือเพิ่มออเดอร์ให้ลูกค้าได้เลย')}</p><button className="button primary full" onClick={onAdd}><Plus size={20}/>{t('ເພີ່ມອໍເດີ','เพิ่มออเดอร์')}</button><button className="button secondary full" onClick={onQr}><QrCode size={20}/>{t('ເບິ່ງ QR ໂຕະນີ້','ดู QR โต๊ะนี้')}</button></div>}
    </div>
    {order && <div className="receipt-bottom"><div className="total"><span>{t('ຍອດອໍເດີນີ້','ยอดออเดอร์นี้')}</span><strong>{money(orderTotal(order.items))}<small> ₭</small></strong></div><div className="payment-method">{order.method==='transfer'?<CreditCard size={18}/>:<Banknote size={18}/>}<span>{order.method==='transfer'?t('ໂອນເງິນ','โอนเงิน'):t('ເງິນສົດ','เงินสด')}</span>{order.paid&&<span className="paid-mark"><CheckCircle2 size={15}/>{t('ຮັບເງິນແລ້ວ','รับเงินแล้ว')}</span>}</div>{order.status==='pending'?<button className="button primary full payment-cta" onClick={onPay}><Banknote size={21}/>{t('ກວດຍອດຊຳລະ','ตรวจยอดชำระ')} · {money(orderTotal(order.items))} ₭<ArrowRight size={19}/></button>:needsKitchenHandoff(order)?<HandoffActions order={order} onPrint={onPrint}/>:canServe(order)?<button className="button primary full" disabled={actionBusy} onClick={()=>advance('serve')}><Check size={20}/>{t('ຢືນຢັນເສີບແລ້ວ','ยืนยันเสิร์ฟแล้ว')}</button>:order.status==='served'?<button className="button primary full" disabled={actionBusy} onClick={()=>advance('close')}><CheckCircle2 size={20}/>{tableOrders.length > 1 ? t('ປິດອໍເດີນີ້','ปิดออเดอร์นี้') : t('ປິດໂຕະ','ปิดโต๊ะ')}</button>:null}</div>}
  </aside>;
}


function PaymentDialog({ order, methods, shiftOpen, onClose, onConfirm, onReject }) {
  const { t } = useL();
  const total = orderTotal(order.items);
  const [method, setMethod] = useState(methods.includes(order.method) ? order.method : methods[0]);
  const [received, setReceived] = useState('');
  const [rejecting, setRejecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const cash = received === '' ? null : Number(received);
  const validCash = Number.isSafeInteger(cash) && cash >= total;
  const short = cash !== null && !validCash;
  const changeDue = cash === null ? null : cash - total;

  async function submit(action) {
    if (busy) return;
    setBusy(true);
    setError('');
    try { setError(await action()); }
    finally { setBusy(false); }
  }

  return <Dialog title={`${t('ກວດຍອດຊຳລະ','ตรวจยอดชำระ')} · ${t('ໂຕະ','โต๊ะ')} ${pad(order.table)}`} onClose={() => { if (!busy) onClose(); }} className="payment-dialog">
    <p className="payment-order-context">#{order.orderNumber ?? order.id} · {order.items.reduce((sum, item) => sum + item.quantity, 0)} {t('ລາຍການ', 'รายการ')}</p>
    <div className="payment-amount"><span>{t('ຍອດທີ່ຕ້ອງຮັບ', 'ยอดที่ต้องรับ')}</span><strong>{money(total)}<small> ₭</small></strong></div>
    {rejecting ? <div className="payment-decision">
      <h3>{t('ຢືນຢັນວ່າບໍ່ພົບຍອດ?', 'ยืนยันว่าไม่พบยอด?')}</h3>
      <p>{t('ອໍເດີນີ້ຈະອອກຈາກຄິວ. ຖ້າລູກຄ້າຊຳລະແລ້ວ ໃຫ້ກວດຫຼັກຖານເດີມ.', 'ออเดอร์นี้จะออกจากคิว หากลูกค้าชำระแล้ว ให้ตรวจหลักฐานเดิมกับลูกค้า')}</p>
      <button type="button" className="button danger full" disabled={busy} onClick={() => submit(onReject)}><X size={18}/>{t('ຢືນຢັນບໍ່ພົບຍອດ', 'ยืนยันไม่พบยอด')}</button>
      <button type="button" className="button secondary full" disabled={busy} onClick={() => { setRejecting(false); setError(''); }}>{t('ກັບໄປກວດຍອດ', 'กลับไปตรวจยอด')}</button>
    </div> : <>
      {!shiftOpen && <p className="payment-shift-note">{t('ຍັງບໍ່ໄດ້ເປີດກະ · ຍອດນີ້ຈະບໍ່ນັບເຂົ້າກະໃດ', 'ยังไม่ได้เปิดกะ · ยอดนี้จะไม่นับเข้ากะใด')}</p>}
      <div className="payment-options">{[['transfer', CreditCard, t('ໂອນເງິນ', 'โอนเงิน')], ['cash', Banknote, t('ເງິນສົດ', 'เงินสด')]].filter(([id]) => methods.includes(id)).map(([id, Icon, label]) =>
        <button key={id} className={method === id ? 'selected' : ''} aria-pressed={method === id} disabled={busy} onClick={() => { setMethod(id); setError(''); }}><Icon size={24}/>{label}{method === id && <Check size={18}/>}</button>)}</div>
      {method === 'cash' ? <div className="cash-box">
        <label className="form-field"><span>{t('ເງິນສົດທີ່ຮັບ','เงินสดที่ได้รับ')}</span><span className="amount-input"><input type="number" inputMode="numeric" min="0" step="1" value={received} placeholder={t('ປ້ອນຍອດທີ່ຮັບ', 'กรอกยอดที่ได้รับ')} disabled={busy} onChange={event => setReceived(event.target.value)}/><b>₭</b></span></label>
        <div className="quick-amounts" role="group" aria-label={t('ຈຳນວນເງິນດ່ວນ', 'จำนวนเงินด่วน')}>{cashSuggestions(total).map((amount, index) =>
          <button type="button" key={amount} className={cash === amount ? 'selected' : ''} aria-pressed={cash === amount} disabled={busy} onClick={() => setReceived(String(amount))}>{index === 0 ? t('ຮັບເງິນພໍດີ', 'รับเงินพอดี') : money(amount)}</button>)}</div>
        <div className={`cash-change${short ? ' is-short' : ''}`} aria-live="polite"><span>{short ? t('ກວດຍອດເງິນທີ່ຮັບ', 'ตรวจยอดเงินที่รับ') : t('ເງິນທອນ', 'เงินทอน')}</span><strong>{changeDue === null ? '—' : money(Math.abs(changeDue))} <small>₭</small></strong></div>
      </div> : <p className="transfer-hint"><CheckCircle2 size={18}/>{t('ເປີດແອັບທະນາຄານ ກວດວ່າເງິນເຂົ້າຄົບແລ້ວ ຈຶ່ງກົດຢືນຢັນ', 'เปิดแอปธนาคาร ตรวจว่าเงินเข้าครบแล้ว จึงกดยืนยัน')}</p>}
      <button className="button primary full" disabled={busy || !methods.includes(method) || (method === 'cash' && !validCash)} onClick={() => submit(() => onConfirm(method, method === 'cash' ? cash : undefined))}><Printer size={20}/>{busy ? t('ກຳລັງບັນທຶກ…', 'กำลังบันทึก…') : t('ຢືນຢັນຮັບເງິນ ແລະ ສົ່ງເຂົ້າຄົວ', 'ยืนยันรับเงินและส่งเข้าครัว')}</button>
      <p className="supporting-note">{t('ຢືນຢັນຄັ້ງດຽວ · ເປີດພິມໃບຄົວ ແລະ ປ່ຽນເປັນກຳລັງເຮັດອັດຕະໂນມັດ', 'ยืนยันครั้งเดียว · เปิดพิมพ์ใบครัวและเปลี่ยนเป็นกำลังทำอัตโนมัติ')}</p>
      <button type="button" className="danger-link payment-reject" disabled={busy} onClick={() => { setRejecting(true); setError(''); }}>{t('ບໍ່ພົບຍອດ', 'ไม่พบยอด')}</button>
    </>}
    {error && <p className="payment-action-error" role="alert">{error}</p>}
  </Dialog>;
}

const orderIcons = { ...tileIcons, completed: CheckCircle2, rejected: X };
const orderGroup = order => order.status === 'rejected' ? 'completed' : tableGroup(staffOrderState(order));
const orderTime = time => new Date(time).toLocaleTimeString('en-GB', { timeZone: 'Asia/Vientiane', hour: '2-digit', minute: '2-digit' });
function ReprintButton({ order, onPrint, full = false }) {
  const { t } = useL();
  const [busy, setBusy] = useState(false);
  if (!canPrint(order)) return null;
  async function reprint() {
    if (busy) return;
    setBusy(true);
    try { await onPrint(order.id); } finally { setBusy(false); }
  }
  return <button className={`button secondary kitchen-reprint${full ? ' full' : ''}`} disabled={busy} aria-busy={busy} onClick={reprint}><Printer size={18}/>{t('ພິມໃບຄົວຊ້ຳ', 'พิมพ์ใบครัวซ้ำ')}</button>;
}

function HandoffActions({ order, onPrint }) {
  const { t } = useL();
  const [busy, setBusy] = useState(false);
  async function retry() {
    if (busy) return;
    setBusy(true);
    try { await onPrint(order.id); }
    finally { setBusy(false); }
  }
  return <div className="handoff-actions">
    <button type="button" className="button primary" disabled={busy} aria-busy={busy} onClick={retry}><Printer size={17}/>{busy ? t('ກຳລັງເປີດພິມ…', 'กำลังเปิดพิมพ์…') : t('ພິມໃບຄົວອີກຄັ້ງ', 'พิมพ์ใบครัวอีกครั้ง')}</button>
  </div>;
}

function NextAction({ order, onPay, onAct }) {
  const { t } = useL();
  if (order.status === 'pending') return <button className="button primary order-action" onClick={() => onPay(order)}><Banknote size={18}/>{t('ກວດຍອດຊຳລະ', 'ตรวจยอดชำระ')}</button>;
  if (canServe(order)) return <button className="button primary order-action" onClick={() => onAct(order.id, 'serve')}><Check size={18}/>{t('ເສີບແລ້ວ', 'เสิร์ฟแล้ว')}</button>;
  if (order.status === 'served') return <button className="button secondary order-action" onClick={() => onAct(order.id, 'close')}><CheckCircle2 size={18}/>{t('ປິດອໍເດີ', 'ปิดออเดอร์')}</button>;
  return null;
}
function OrdersView({ orders, filter, setFilter, openId, setOpenId, now, onPay, onAct, onPrint, onGoTable }) {
  const { t } = useL();
  const [query, setQuery] = useState('');
  const [showAllDone, setShowAllDone] = useState(false);
  const filters = [
    ['all', t('ທັງໝົດ', 'ทั้งหมด'), LayoutGrid],
    ['pending', statusText('pending', t), Banknote],
    ['handoff', statusText('handoff', t), Printer],
    ['kitchen', statusText('cooking', t), CookingPot],
    ['ready', statusText('ready', t), BellRing],
    ['served', statusText('served', t), Utensils],
    ['completed', t('ປະຫວັດ', 'ประวัติ'), CheckCircle2],
  ].filter(([id]) => id === 'ready' ? orders.some(order => order.status === 'ready') : id !== 'handoff' || orders.some(needsKitchenHandoff));
  const current = filters.some(([id]) => id === filter) ? filter : 'all';
  const search = query.trim().replace(/^#/, '');
  const orderGroups = Object.create(null);
  for (const order of orders) (orderGroups[orderGroup(order)] ??= []).push(order);
  const count = id => id === 'all' ? orders.length : (orderGroups[id]?.length ?? 0);
  const matching = order => !search || String(order.orderNumber ?? order.id).includes(search) || pad(order.table).includes(search.padStart(2, '0'));
  // Payment and serving need attention before orders already in preparation.
  const priority = ['pending', 'handoff', 'ready', 'kitchen', 'served', 'completed'];
  const sections = (current === 'all' ? priority : [current]).filter(id => count(id) > 0).map(id => {
    const label = filters.find(([status]) => status === id)[1];
    const list = (orderGroups[id] ?? []).filter(matching)
      .sort((a, b) => id === 'completed' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);
    return [id, label, list];
  }).filter(([, , list]) => list.length);
  const resultCount = sections.reduce((total, [, , list]) => total + list.length, 0);
  const opened = orders.find(order => order.id === openId);
  const card = order => {
    const state = staffOrderState(order);
    const group = orderGroup(order);
    const Icon = orderIcons[state];
    const minutes = Math.max(0, Math.floor((now.getTime() - (order.paidAt ?? order.createdAt)) / 60000));
    const showWait = group === 'pending' || group === 'kitchen';
    const quantity = order.items.reduce((total, item) => total + item.quantity, 0);
    return <article className={`order-card ${state === 'rejected' ? state : group}`} key={order.id}>
      <button className="order-card-main" onClick={() => setOpenId(order.id)} aria-label={`${t('ເບິ່ງອໍເດີ', 'ดูออเดอร์')} #${order.orderNumber ?? order.id} · ${t('ໂຕະ', 'โต๊ะ')} ${pad(order.table)} · ${paymentPending(order, t)}`}>
        <span className="order-card-table"><small>{t('ໂຕະ', 'โต๊ะ')}</small>{pad(order.table)}</span>
        <span className="order-card-body">
          <span className="order-card-title"><strong>#{order.orderNumber ?? order.id}</strong></span>
          <span className="order-card-state"><span className="state-pill"><Icon size={15} aria-hidden="true"/>{paymentPending(order, t)}</span></span>
          <span className="order-card-meta"><span>{quantity} {t('ລາຍການ', 'รายการ')}</span>{showWait && <span className={`order-card-wait${minutes >= 15 ? ' is-late' : ''}`}><Clock3 size={13} aria-hidden="true"/>{minutes} {t('ນາທີ', 'นาที')}</span>}</span>
        </span>
        <ChevronRight className="order-card-chevron" size={18} aria-hidden="true"/>
      </button>
      <div className="order-card-side"><strong>{money(orderTotal(order.items))} <small>₭</small></strong>{state === 'handoff' ? <HandoffActions order={order} onPrint={onPrint}/> : <NextAction order={order} onPay={onPay} onAct={onAct}/>}</div>
    </article>;
  };
  return <section className="full-page orders-page">
    <div className="page-heading"><div><h1>{t('ອໍເດີທັງໝົດ', 'ออเดอร์ทั้งหมด')}</h1></div></div>
    <StaffStatusFilters filters={filters} current={current} count={count} unit={t('ອໍເດີ', 'ออเดอร์')} label={t('ສະແດງອໍເດີຕາມສະຖານະ', 'แสดงออเดอร์ตามสถานะ')} onSelect={setFilter}/>
    <div className="orders-toolbar">
      <label className="search-field"><Search size={19}/><input type="search" aria-label={t('ຄົ້ນຫາເລກໂຕະ ຫຼື ອໍເດີ', 'ค้นหาเลขโต๊ะหรือออเดอร์')} placeholder={t('ເລກໂຕະ ຫຼື ອໍເດີ…', 'เลขโต๊ะหรือออเดอร์…')} value={query} onChange={event => setQuery(event.target.value)}/></label>
      <span className="orders-result-count" role="status">{resultCount} {t('ອໍເດີ', 'ออเดอร์')}</span>
    </div>
    {resultCount ? sections.map(([id, title, list]) => {
      const limited = current === 'all' && !search && id === 'completed' && !showAllDone ? list.slice(0, 4) : list;
      return <section className={`order-section ${id}`} key={id}>
        <h2 className="order-section-title">{title}<span>{list.length}</span></h2>
        <div className="order-cards">{limited.map(card)}</div>
        {limited.length < list.length && <button className="button secondary full show-more" onClick={() => setShowAllDone(true)}>{t('ເບິ່ງປະຫວັດທັງໝົດ', 'ดูประวัติทั้งหมด')} ({list.length})</button>}
      </section>;
    }) : <EmptyState icon={ClipboardList} title={t('ບໍ່ພົບອໍເດີ', 'ไม่พบออเดอร์')} text={search ? t('ລອງຄົ້ນຫາເລກໂຕະ ຫຼື ເລກອໍເດີອື່ນ', 'ลองค้นหาเลขโต๊ะหรือเลขออเดอร์อื่น') : t('ຍັງບໍ່ມີອໍເດີໃນສະຖານະນີ້', 'ยังไม่มีออเดอร์ในสถานะนี้')}>{(search || current !== 'all') && <button className="button secondary" onClick={() => { setQuery(''); setFilter('all'); }}>{t('ເບິ່ງທຸກອໍເດີ', 'ดูทุกออเดอร์')}</button>}</EmptyState>}
    {opened && <OrderDialog order={opened} onClose={() => setOpenId(null)} onPay={order => { setOpenId(null); onPay(order); }} onAct={onAct} onPrint={onPrint} onGoTable={order => { setOpenId(null); onGoTable(order); }}/>}
  </section>;
}
function OrderDialog({ order, onClose, onPay, onAct, onPrint, onGoTable }) {
  const { t, lang } = useL();
  const steps = [t('ຮັບເງິນ', 'รับเงิน'), t('ຄົວ', 'ครัว'), t('ເສີບ', 'เสิร์ฟ'), t('ປິດ', 'ปิด')];
  const stage = { pending: 0, queued: 1, cooking: 1, ready: 2, served: 3, completed: 4 }[order.status];
  const state = staffOrderState(order);
  const Icon = orderIcons[state];
  return <Dialog title={`${t('ໂຕະ', 'โต๊ะ')} ${pad(order.table)} · #${order.orderNumber ?? order.id}`} onClose={onClose} className="order-dialog">
    <div className={`order-state ${tableGroup(state)}`}><Icon size={22}/><div><strong>{paymentPending(order, t)}</strong><span>{orderTime(order.createdAt)} · {order.source === 'cashier' ? t('ພະນັກງານຮັບອໍເດີ', 'พนักงานรับออเดอร์') : t('ສັ່ງຈາກ QR', 'สั่งจาก QR')}</span></div></div>
    {state !== 'rejected' && <ol className="order-steps">{steps.map((label, index) => <li key={label} className={index < stage ? 'done' : index === stage ? 'now' : ''} aria-current={index === stage ? 'step' : undefined}><i/>{label}</li>)}</ol>}
    <div className="order-dialog-items">{order.items.map((item, index) => <div className="receipt-item" key={index}><span className="quantity-box">{item.quantity}</span><div><strong>{itemName(item, lang)}</strong>{item.category !== 'drinks' && <small>{item.size === 'large' ? t('ພິເສດ', 'พิเศษ') : t('ທຳມະດາ', 'ธรรมดา')}</small>}{item.note && <span className="item-note">{itemNote(item, lang)}</span>}</div><span>{money(item.price * item.quantity)}</span></div>)}</div>
    <div className="total"><span>{t('ລວມທັງໝົດ', 'รวมทั้งหมด')}</span><strong>{money(orderTotal(order.items))}<small> ₭</small></strong></div>
    <div className="payment-method">{order.method === 'transfer' ? <CreditCard size={18}/> : <Banknote size={18}/>}<span>{order.method === 'transfer' ? t('ໂອນເງິນ', 'โอนเงิน') : t('ເງິນສົດ', 'เงินสด')}</span>{order.paid && <span className="paid-mark"><CheckCircle2 size={15}/>{t('ຮັບເງິນແລ້ວ', 'รับเงินแล้ว')}</span>}</div>
    {state === 'handoff' ? <HandoffActions order={order} onPrint={onPrint}/> : <div className="order-dialog-actions"><NextAction order={order} onPay={onPay} onAct={onAct}/><ReprintButton order={order} onPrint={onPrint}/>{isActiveOrder(order) && <button className="button secondary" onClick={() => onGoTable(order)}><LayoutGrid size={18}/>{t('ເບິ່ງໂຕະນີ້', 'ดูโต๊ะนี้')}</button>}</div>}
  </Dialog>;
}
function Reports({orders,now}) {
 const {t,lang}=useL();const [range,setRange]=useState('today');
 const ranges=[['today',t('ມື້ນີ້','วันนี้')],['week',t('7 ມື້','7 วัน')],['all',t('ທັງໝົດ','ทั้งหมด')]];
 const paid=paidInRange(orders,range,now.getTime());const total=paid.reduce((s,o)=>s+orderTotal(o.items),0);
 const sales=Object.values(paid.flatMap(o=>o.items).reduce((map,i)=>{map[i.id]||={...i,quantity:0,amount:0};map[i.id].quantity+=i.quantity;map[i.id].amount+=i.price*i.quantity;return map;},{})).sort((a,b)=>b.quantity-a.quantity);
 return <section className="full-page reports-page"><div className="page-heading"><div><h1>{t('ສະຫຼຸບຍອດຂາຍ','สรุปยอดขาย')}</h1><p>{t('ຄິດຈາກອໍເດີທີ່ຢືນຢັນຮັບເງິນແລ້ວ · ເວລາວຽງຈັນ','คำนวณจากออเดอร์ที่ยืนยันรับเงินแล้ว · เวลาเวียงจันทน์')}</p></div><div className="segment" role="group" aria-label={t('ຊ່ວງເວລາ','ช่วงเวลา')}>{ranges.map(([id,label])=><button key={id} className={range===id?'selected':''} aria-pressed={range===id} onClick={()=>setRange(id)}>{label}</button>)}</div></div><div className="sales-overview"><div className="sales-main"><span>{t('ຍອດຮັບເງິນ','ยอดรับเงิน')} · {ranges.find(([id])=>id===range)[1]}</span><strong>{money(total)} <small>₭</small></strong><p><CheckCircle2 size={17}/>{paid.length} {t('ອໍເດີ ຮັບເງິນແລ້ວ','ออเดอร์ รับเงินแล้ว')}</p></div><div className="sales-methods">{[['cash',Banknote,t('ເງິນສົດ','เงินสด')],['transfer',CreditCard,t('ໂອນເງິນ','โอนเงิน')]].map(([method,Icon,label])=><div key={method}><Icon size={23}/><span>{label}<strong>{money(paid.filter(o=>o.method===method).reduce((s,o)=>s+orderTotal(o.items),0))} ₭</strong></span><small>{paid.filter(o=>o.method===method).length} {t('ອໍເດີ','ออเดอร์')}</small></div>)}</div></div><section className="sales-breakdown"><h2>{t('ລາຍການທີ່ຂາຍໄດ້','รายการที่ขายได้')}</h2><p>{t('ລວມຈາກອໍເດີທີ່ຮັບເງິນແລ້ວ','รวมจากออเดอร์ที่รับเงินแล้ว')}</p>{sales.length?<div className="sales-table"><div className="sales-table-head"><span>{t('ເມນູ','เมนู')}</span><span>{t('ຈຳນວນ','จำนวน')}</span><span>{t('ຍອດຂາຍ','ยอดขาย')}</span></div>{sales.map(item=><div className="sales-table-row" key={item.id}><span><img width="50" height="50" src={item.image} alt=""/>{itemName(item,lang)}</span><span>{item.quantity}</span><strong>{money(item.amount)} ₭</strong></div>)}</div>:<EmptyState icon={BarChart3} title={t('ຍັງບໍ່ມີຍອດຂາຍ','ยังไม่มียอดขาย')} text={t('ລອງເລືອກຊ່ວງເວລາອື່ນ','ลองเลือกช่วงเวลาอื่น')}/>}</section></section>;
}

export { OrderPanel, PaymentDialog, OrdersView, Reports };
