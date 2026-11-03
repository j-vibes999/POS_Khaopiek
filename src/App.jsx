import React, { useState, useEffect, useRef, useContext, useId, createContext } from 'react';
import { ArrowLeft, Soup, LayoutGrid, ClipboardList, Utensils, BarChart3, ChefHat, Smartphone, ChevronDown, ChevronRight, ArrowUpRight, Plus, Search, QrCode, Clock3, Users, Check, X, Banknote, CreditCard, Bell, CircleHelp, CheckCircle2, ArrowRight, Armchair, Store, WifiOff, Flame, MoreHorizontal } from 'lucide-react';
import { useMenuQr } from './use-menu-qr';
import { initialMenu, initialOrders, tableCount } from './data';
import Customer from './Customer';
import { orderTotal } from './order-model.mjs';
import { DEMO_STORAGE_KEY, applyOrderAction, commitCheckout, customerOrders, readDemoSession, restoreDemoSession, tableFromSearch, updateDemoSession } from './customer-model.mjs';

const Locale = createContext();
const emptyDraft = { cart: [], method: 'transfer', lastOrderId: null };
const demoStorage = (() => { try { return window.localStorage; } catch { return null; } })();
const useL = () => useContext(Locale);
const money = n => new Intl.NumberFormat('en-US').format(n);
const pad = n => String(n).padStart(2, '0');
const itemName = (item, lang) => item[lang] || item.lo;
const itemNote = (item, lang) => lang === 'th' ? item.noteTh || item.note : item.note;
const viewFromHash = () => ['tables', 'orders', 'menu', 'reports', 'kitchen', 'customer'].includes(location.hash.slice(1).split('/')[0]) ? location.hash.slice(1).split('/')[0] : 'tables';
const statusText = (status, t) => ({ pending: t('ລໍຖ້າຮັບເງິນ', 'รอรับเงิน'), queued: t('ລໍຖ້າຄົວ', 'รอครัวรับ'), cooking: t('ກຳລັງເຮັດ', 'กำลังทำ'), ready: t('ພ້ອມເສີບ', 'พร้อมเสิร์ฟ'), served: t('ເສີບແລ້ວ', 'เสิร์ฟแล้ว'), completed: t('ສຳເລັດ', 'เสร็จสิ้น'), empty: t('ໂຕະຫວ່າງ', 'โต๊ะว่าง') }[status]);
function Badge({ status, children }) { const { t } = useL(); return <span className={`badge ${status}`}><span className="status-dot"/>{children || statusText(status, t)}</span>; }
function IconButton({ label, children, ...props }) { return <button className="icon-button" aria-label={label} title={label} {...props}>{children}</button>; }
function Dialog({ title, onClose, children, className = '' }) {
  const ref = useRef();
  const titleId = useId();
  const { t } = useL();
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current.showModal();
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className={`dialog ${className}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === ref.current) onClose(); }}><div className="dialog-head"><h2 id={titleId}>{title}</h2><IconButton label={t('ປິດ', 'ปิด')} onClick={onClose}><X size={22}/></IconButton></div>{children}</dialog>;
}
export default function App() {
  const [lang, setLang] = useState('lo');
  const t = (lo, th) => lang === 'lo' ? lo : th;
  const [view, setView] = useState(viewFromHash);
  const [session, setSession] = useState(() => restoreDemoSession(demoStorage, initialOrders));
  const sessionRef = useRef(session);
  const orders = session.orders;
  const menu = initialMenu.map(item => ({ ...item, available: !session.soldOut.includes(item.id) }));
  const [activeTable, setActiveTable] = useState(3);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState('');
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(new Date());
  const [manual, setManual] = useState(false);
  const qrTable = tableFromSearch(location.search, tableCount);
  const pending = orders.filter(o => o.status === 'pending').length;
  const activeOrders = orders.filter(o => o.status !== 'completed');
  const tableOrders = activeOrders.filter(o => o.table === activeTable);
  const order = tableOrders.find(o => o.id === selectedOrder) || tableOrders[0];
  const go = destination => { location.hash = destination; setView(destination); setSearch(''); window.scrollTo({top:0,behavior:'instant'}); };
  const notify = text => setToast(text);
  const notifySaveFailed = () => notify(t('ບັນທຶກບໍ່ສຳເລັດ · ກະລຸນາລອງໃໝ່', 'บันทึกไม่สำเร็จ · กรุณาลองใหม่'));
  const showOrderPanel = () => { if (innerWidth <= 600) requestAnimationFrame(() => document.querySelector('.order-panel')?.scrollIntoView({ behavior: 'instant', block: 'start' })); };
  useEffect(() => { const update = () => { setView(viewFromHash()); setSearch(''); }; addEventListener('hashchange', update); return () => removeEventListener('hashchange', update); }, []);
  useEffect(() => {
    // Another tab saved the demo: show its orders, baskets and sold-out dishes here as well.
    const sync = event => {
      if (event.storageArea !== demoStorage || (event.key !== null && event.key !== DEMO_STORAGE_KEY)) return;
      const next = restoreDemoSession(demoStorage, initialOrders);
      sessionRef.current = next;
      setSession(next);
    };
    addEventListener('storage', sync);
    return () => removeEventListener('storage', sync);
  }, []);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(id); }, []);
  useEffect(() => { if(!toast) return; const id = setTimeout(() => setToast(''), 4500); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { const on = () => setOnline(true); const off = () => setOnline(false); addEventListener('online', on); addEventListener('offline', off); return () => { removeEventListener('online', on); removeEventListener('offline', off); }; }, []);
  function act(id, action, method) {
    try {
      saveSession(current => applyOrderAction(current, id, action, method));
    } catch {
      notifySaveFailed();
      return false;
    }
    const messages = { pay: t('ຮັບເງິນແລ້ວ · ສົ່ງອໍເດີໄປຄົວແລ້ວ', 'รับเงินแล้ว · ส่งออเดอร์เข้าครัวแล้ว'), start: t('ເລີ່ມເຮັດອາຫານແລ້ວ', 'เริ่มทำอาหารแล้ว'), ready: t('ອາຫານພ້ອມເສີບແລ້ວ', 'อาหารพร้อมเสิร์ฟแล้ว'), serve: t('ບັນທຶກການເສີບແລ້ວ', 'บันทึกการเสิร์ฟแล้ว'), close: t('ປິດອໍເດີແລ້ວ', 'ปิดออเดอร์แล้ว') };
    notify(messages[action]);
    return true;
  }
  function saveSession(change) {
    const next = updateDemoSession(demoStorage, sessionRef.current, change);
    sessionRef.current = next;
    setSession(next);
  }
  function updateDraft(table, transform) {
    saveSession(current => ({ ...current, drafts: { ...current.drafts, [table]: transform(current.drafts[table] || emptyDraft) } }));
  }
  function toggleSoldOut(id) {
    try {
      saveSession(current => ({ ...current, soldOut: current.soldOut.includes(id) ? current.soldOut.filter(soldId => soldId !== id) : [...current.soldOut, id] }));
    } catch {
      notifySaveFailed();
    }
  }
  function submit(table, source) {
    const result = commitCheckout(demoStorage, readDemoSession(demoStorage) ?? sessionRef.current, table, source);
    sessionRef.current = result.session;
    setSession(result.session);
    setActiveTable(table);
    setSelectedOrder(result.orderId);
    if (source === 'cashier') {
      // A cashier entry returns to its table so payment can be taken straight away.
      setManual(false);
      go('tables');
      notify(t(`ເພີ່ມອໍເດີ #${result.orderId} ແລ້ວ · ລໍຖ້າຮັບເງິນ`, `เพิ่มออเดอร์ #${result.orderId} แล้ว · รอรับเงิน`));
      showOrderPanel();
    }
    return result.orderId;
  }
  const manualOrder = () => { setManual(true); go('customer'); };
  const orderingTable = !manual && qrTable.fromQr ? qrTable.table : activeTable;
  if (view === 'customer') return <Customer menu={menu} table={orderingTable} staffAccess={manual || !qrTable.fromQr} draft={session.drafts[orderingTable] || emptyDraft} onUpdateDraft={transform => updateDraft(orderingTable, transform)} manual={manual} onSubmit={submit} tableOrders={customerOrders(orders, orderingTable, session.clearedAt[orderingTable])} onBack={() => go('tables')} initialLanguage={lang}/>;
  return <Locale.Provider value={{ lang, t }}><div className={`app ${view === 'customer' ? 'customer-app' : ''}`}>
    <a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById('main-content')?.focus();}}>{t('ຂ້າມໄປເນື້ອຫາ', 'ข้ามไปเนื้อหา')}</a>
    <aside className="sidebar">
      <button className="brand" onClick={() => go('tables')} aria-label="Khao Piek POS"><span className="brand-symbol"><Soup size={30} strokeWidth={1.6}/></span><span><strong>ເຂົ້າປຽກ<span className="brand-period">.</span></strong><small>KHAO PIEK POS</small></span></button>
      <button className="shop-selector" onClick={() => setDialog({ type: 'shop' })}><span className="shop-icon"><Store size={20}/></span><span><strong>{t('ຮ້ານເຂົ້າປຽກ', 'ร้านข้าวเปียก')}</strong><small>{t('ສາຂາ ວຽງຈັນ', 'สาขา เวียงจันทน์')}</small></span><ChevronDown size={16}/></button>
      <div className="nav-caption">{t('ຈັດການຮ້ານ', 'จัดการร้าน')}</div>
      <nav className="main-nav" aria-label={t('ເມນູຫຼັກ', 'เมนูหลัก')}>
        {[['tables',LayoutGrid,t('ໂຕະອາຫານ','โต๊ะอาหาร')],['orders',ClipboardList,t('ອໍເດີທັງໝົດ','ออเดอร์ทั้งหมด')],['menu',Utensils,t('ຈັດການເມນູ','จัดการเมนู')],['reports',BarChart3,t('ສະຫຼຸບຍອດຂາຍ','สรุปยอดขาย')]].map(([id,Icon,label]) => <button key={id} className={view===id?'active':''} onClick={() => go(id)} aria-label={label} title={label} aria-current={view===id?'page':undefined}><Icon size={21}/><span>{label}</span>{id==='orders'&&pending>0&&<span className="nav-count">{pending}</span>}</button>)}
      </nav>
      <div className="nav-separator"/><div className="nav-caption">{t('ໜ້າຈໍອື່ນໆ', 'หน้าจออื่น ๆ')}</div>
      <nav className="main-nav secondary-nav"><button className={view==='kitchen'?'active':''} aria-label={t('ໜ້າຈໍຄົວ','หน้าจอครัว')} onClick={() => go('kitchen')}><ChefHat size={22}/><span>{t('ໜ້າຈໍຄົວ', 'หน้าจอครัว')}</span><ArrowUpRight size={16}/></button><button className={view==='customer'?'active':''} aria-label={t('ເມນູລູກຄ້າ','เมนูลูกค้า')} onClick={() => { setManual(false); go('customer'); }}><Smartphone size={21}/><span>{t('ເມນູລູກຄ້າ', 'เมนูลูกค้า')}</span><ArrowUpRight size={16}/></button></nav>
      <div className="sidebar-bottom"><button className="help-button" onClick={() => setDialog({type:'help'})}><CircleHelp size={20}/>{t('ວິທີໃຊ້ງານ', 'วิธีใช้งาน')}<ChevronRight size={16}/></button><div className="profile"><span className="avatar">M</span><span><strong>{t('ຜູ້ຈັດການຮ້ານ', 'ผู้จัดการร้าน')}</strong><small>{t('ແຄຊເຊຍ', 'แคชเชียร์')}</small></span><span className="profile-dot"/></div></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="location-label"><Store size={18}/><span>{t('ຮ້ານເຂົ້າປຽກ', 'ร้านข้าวเปียก')}</span><span className="topbar-divider"/><span className="open-label"><i/>{t('ເປີດຮ້ານ', 'เปิดร้าน')}</span></div><div className="topbar-actions"><span className="demo-tag">{t('ຂໍ້ມູນຕົວຢ່າງ', 'ข้อมูลตัวอย่าง')}</span><time className="header-clock">{now.toLocaleTimeString('en-GB',{timeZone:'Asia/Vientiane',hour:'2-digit',minute:'2-digit'})}</time><button className="language-button" onClick={() => setLang(lang==='lo'?'th':'lo')} aria-label={lang==='lo'?'เปลี่ยนเป็นภาษาไทย':'ປ່ຽນເປັນພາສາລາວ'}>{lang==='lo'?'ລາວ':'ไทย'}<ChevronDown size={14}/></button><IconButton label={t('ອໍເດີທີ່ລໍຖ້າ', 'ออเดอร์ที่รอ')} onClick={() => { setFilter('pending'); go('orders'); }}><Bell size={21}/>{pending>0&&<i className="notification-dot"/>}</IconButton></div></header>
    {!online&&<div className="offline-banner" role="status"><WifiOff size={18}/>{t('ບໍ່ມີອິນເຕີເນັດ · ກຳລັງໃຊ້ຕົ້ນແບບໃນເຄື່ອງນີ້', 'ไม่มีอินเทอร์เน็ต · กำลังใช้ต้นแบบในเครื่องนี้')}</div>}
    <main id="main-content" tabIndex={-1} className={`main-content view-${view}`}>
      {view==='tables'&&<><section className="table-workspace"><div className="page-heading"><div><h1>{t('ໂຕະອາຫານ', 'โต๊ะอาหาร')}</h1><p>{t('ເບິ່ງທຸກໂຕະ ດູແລທຸກອໍເດີ ໄດ້ໃນໜ້າດຽວ', 'ดูทุกโต๊ะ ดูแลทุกออเดอร์ได้ในหน้าเดียว')}</p></div><button className="button secondary qr-button" onClick={() => setDialog({type:'qr',table:activeTable})}><QrCode size={19}/><span>{t('QR ໂຕະ', 'QR โต๊ะ')}</span></button></div>
      <div className="table-summary"><span><i className="legend-dot neutral"/>{t('ທັງໝົດ','ทั้งหมด')} <b>{tableCount}</b> {t('ໂຕະ','โต๊ะ')}</span><span><i className="legend-dot green"/>{t('ຫວ່າງ','ว่าง')} <b>{tableCount-new Set(activeOrders.map(o=>o.table)).size}</b></span><span><i className="legend-dot orange"/>{t('ລໍຮັບເງິນ','รอรับเงิน')} <b>{new Set(activeOrders.filter(o=>o.status==='pending').map(o=>o.table)).size}</b></span></div>
      <div className="table-toolbar"><div className="segment"><button className={filter==='all'?'selected':''} aria-pressed={filter==='all'} onClick={()=>setFilter('all')}>{t('ທຸກໂຕະ','ทุกโต๊ะ')}</button><button className={filter==='occupied'?'selected':''} aria-pressed={filter==='occupied'} onClick={()=>setFilter('occupied')}>{t('ກຳລັງໃຊ້','กำลังใช้')}</button><button className={filter==='empty'?'selected':''} aria-pressed={filter==='empty'} onClick={()=>setFilter('empty')}>{t('ໂຕະຫວ່າງ','โต๊ะว่าง')}</button></div><span className="floor-label"><LayoutGrid size={16}/>{t('ຊັ້ນ 1','ชั้น 1')}</span></div>
      <div className="table-grid">{Array.from({length:tableCount},(_,i)=>i+1).filter(n=>{const used=activeOrders.some(o=>o.table===n);return filter==='occupied'?used:filter==='empty'?!used:true;}).map(n=><TableTile key={n} number={n} orders={activeOrders.filter(o=>o.table===n)} active={activeTable===n} onClick={()=>{setActiveTable(n);setSelectedOrder(null);if(innerWidth<=600)requestAnimationFrame(()=>document.querySelector('.order-panel')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}));}}/>)}</div>
      <div className="table-footnote"><span><span className="live-dot"/>{t('ອັບເດດໃນຕົ້ນແບບນີ້', 'อัปเดตภายในต้นแบบนี้')}</span><span>{t('ເລືອກໂຕະເພື່ອເບິ່ງອໍເດີ', 'เลือกโต๊ะเพื่อดูออเดอร์')}<ArrowRight size={15}/></span></div></section><OrderPanel table={activeTable} order={order} tableOrders={tableOrders} setSelected={setSelectedOrder} onPay={()=>setDialog({type:'payment',order})} onAct={act} onAdd={manualOrder} onQr={()=>setDialog({type:'qr',table:activeTable})}/></>}
      {view==='orders'&&<OrdersView orders={orders} filter={filter} setFilter={setFilter} onSelect={o=>{setActiveTable(o.table);setSelectedOrder(o.id);setFilter('all');go('tables');showOrderPanel();}}/>}
      {view==='menu'&&<MenuManagement menu={menu} onToggle={toggleSoldOut} search={search} setSearch={setSearch}/>}
      {view==='reports'&&<Reports orders={orders}/>}
      {view==='kitchen'&&<Kitchen orders={orders} onAct={act} now={now}/>}
    </main><nav className="mobile-nav" aria-label={t('ໜ້າຈໍ', 'หน้าจอ')}>{[['tables',LayoutGrid,t('ໜ້າຮ້ານ','หน้าร้าน')],['orders',ClipboardList,t('ອໍເດີ','ออเดอร์')],['kitchen',ChefHat,t('ຄົວ','ครัว')],['customer',Smartphone,t('ລູກຄ້າ','ลูกค้า')]].map(([id,Icon,label])=><button key={id} className={view===id?'active':''} onClick={()=>{setManual(false);go(id);}}><Icon size={22}/><span>{label}</span></button>)}<button className={['menu','reports'].includes(view)?'active':''} onClick={()=>setDialog({type:'more'})}><MoreHorizontal size={22}/><span>{t('ເພີ່ມເຕີມ','เพิ่มเติม')}</span></button></nav></div>
    {toast&&<div className="toast" role="status"><CheckCircle2 size={21}/>{toast}<button aria-label={t('ປິດ','ปิด')} onClick={()=>setToast('')}><X size={17}/></button></div>}
    {dialog?.type==='more'&&<Dialog title={t('ເມນູເພີ່ມເຕີມ','เมนูเพิ่มเติม')} onClose={()=>setDialog(null)}><div className="more-menu">{[['menu',Utensils,t('ຈັດການເມນູ','จัดการเมนู')],['reports',BarChart3,t('ສະຫຼຸບຍອດຂາຍ','สรุปยอดขาย')]].map(([id,Icon,label])=><button className="button secondary full" key={id} onClick={()=>{go(id);setDialog(null);}}><Icon size={22}/>{label}<ChevronRight size={18}/></button>)}<button className="button secondary full" onClick={()=>setDialog({type:'help'})}><CircleHelp size={22}/>{t('ວິທີໃຊ້ງານ','วิธีใช้งาน')}<ChevronRight size={18}/></button></div></Dialog>}
    {dialog?.type==='payment'&&<PaymentDialog order={dialog.order} onClose={()=>setDialog(null)} onConfirm={method=>{if(act(dialog.order.id,'pay',method))setDialog(null);}}/>}
    {dialog?.type==='qr'&&<QRDialog table={dialog.table} onClose={()=>setDialog(null)}/>}
    {dialog?.type==='help'&&<Dialog title={t('ເລີ່ມໃຊ້ງານໃນ 3 ຂັ້ນຕອນ','เริ่มใช้งานใน 3 ขั้นตอน')} onClose={()=>setDialog(null)}><ol className="help-list"><li><strong>{t('ເລືອກໂຕະ','เลือกโต๊ะ')}</strong><p>{t('ກົດໂຕະເພື່ອເບິ່ງອາຫານ ແລະ ຍອດຊຳລະ','กดโต๊ะเพื่อดูรายการอาหารและยอดชำระ')}</p></li><li><strong>{t('ກວດເງິນ ແລ້ວສົ່ງຄົວ','ตรวจเงิน แล้วส่งครัว')}</strong><p>{t('ຢືນຢັນຮັບເງິນ ອໍເດີຈະປາກົດຢູ່ໜ້າຄົວ','ยืนยันรับเงิน ออเดอร์จะแสดงในหน้าครัว')}</p></li><li><strong>{t('ເຮັດ ແລະ ເສີບ','ทำและเสิร์ฟ')}</strong><p>{t('ຄົວກົດພ້ອມເສີບ ແລ້ວພະນັກງານສົ່ງອາຫານ','ครัวกดพร้อมเสิร์ฟ แล้วพนักงานส่งอาหาร')}</p></li></ol><p className="demo-note">{t('ນີ້ແມ່ນຕົ້ນແບບ UI. ກະຕ່າ ແລະ ອໍເດີຖືກເກັບໄວ້ໃນ Browser ນີ້.','นี่คือต้นแบบ UI ตะกร้าและออเดอร์เก็บไว้ใน Browser นี้')}</p></Dialog>}
    {dialog?.type==='shop'&&<Dialog title={t('ຮ້ານເຂົ້າປຽກ · ວຽງຈັນ','ร้านข้าวเปียก · เวียงจันทน์')} onClose={()=>setDialog(null)}><p className="dialog-intro">{t('ຮ້ານຕົວຢ່າງສຳລັບທົດລອງໜ້າຈໍ POS.','ร้านตัวอย่างสำหรับทดลองหน้าจอ POS')}</p><div className="shop-facts"><span>{t('ຈຳນວນໂຕະ','จำนวนโต๊ะ')}<b>{tableCount}</b></span><span>{t('ສະກຸນເງິນ','สกุลเงิน')}<b>LAK · ₭</b></span><span>{t('ພາສາ','ภาษา')}<b>{t('ລາວ / ໄທ','ลาว / ไทย')}</b></span></div></Dialog>}
  </div></Locale.Provider>;
}

function TableTile({ number, orders, active, onClick }) {
  const {t}=useL(); const order=orders.find(o=>o.status==='pending')||orders[0]; const status=order?.status||'empty';
  return <button className={`table-tile ${status} ${active?'is-active':''}`} onClick={onClick} aria-pressed={active} aria-label={`${t('ໂຕະ','โต๊ะ')} ${pad(number)} ${statusText(status,t)}`}><div className="tile-top"><span>{t('ໂຕະ','โต๊ะ')} {pad(number)}</span>{active?<span className="selected-mark"><Check size={13}/></span>:<span className={`tile-state-dot ${status}`}/>}</div><div className="table-illustration"><i className="chair chair-left top"/><i className="chair chair-left bottom"/><span className="table-surface">{pad(number)}</span><i className="chair chair-right top"/><i className="chair chair-right bottom"/></div><div className="tile-bottom"><span className="tile-status">{statusText(status,t)}</span>{order?<strong>{money(orders.reduce((s,o)=>s+orderTotal(o.items),0))}<small> ₭</small></strong>:<span className="seat-count"><Users size={13}/>{number%3===0?'6':'4'} {t('ບ່ອນ','ที่นั่ง')}</span>}</div></button>;
}
function OrderPanel({table,order,tableOrders,setSelected,onPay,onAct,onAdd,onQr}) {
 const {t,lang}=useL();
 return <aside className="order-panel" aria-label={t('ລາຍລະອຽດໂຕະ','รายละเอียดโต๊ะ')}><button className="order-panel-back" onClick={() => document.querySelector('.table-workspace')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })}><ArrowLeft size={18}/>{t('ເລືອກໂຕະອື່ນ', 'เลือกโต๊ะอื่น')}</button><div className="order-panel-heading"><div><h2>{t('ໂຕະ','โต๊ะ')} {pad(table)}</h2><span>{t('ຊັ້ນ 1','ชั้น 1')}<i/> {table%3===0?'6':'4'} {t('ບ່ອນນັ່ງ','ที่นั่ง')}</span></div><IconButton label={t('QR ໂຕະນີ້','QR โต๊ะนี้')} onClick={onQr}><QrCode size={22}/></IconButton></div>
 {tableOrders.length>1&&<div className="order-tabs">{tableOrders.map(o=><button key={o.id} aria-pressed={o.id===order?.id} className={o.id===order?.id?'selected':''} onClick={()=>setSelected(o.id)}><strong>#{o.id}</strong><span>{statusText(o.status,t)}</span></button>)}</div>}
 {order?<><div className="receipt-meta"><Badge status={order.status}/><span>#{order.id}</span></div><div className="receipt-time"><Clock3 size={15}/>{new Date(order.createdAt).toLocaleTimeString('en-GB',{timeZone:'Asia/Vientiane',hour:'2-digit',minute:'2-digit'})}<span>·</span>{order.source==='cashier'?t('ພະນັກງານຮັບອໍເດີ','พนักงานรับออเดอร์'):t('ສັ່ງຈາກ QR','สั่งจาก QR')}</div><div className="receipt-items"><div className="receipt-label"><h3>{t('ລາຍການອາຫານ','รายการอาหาร')}</h3><span>{order.items.reduce((s,i)=>s+i.quantity,0)} {t('ລາຍການ','รายการ')}</span></div>{order.items.map((item,i)=><div className="receipt-item" key={i}><span className="quantity-box">{item.quantity}</span><div><strong>{itemName(item,lang)}</strong>{item.category!=='drinks'&&<small>{item.size==='large'?t('ພິເສດ','พิเศษ'):t('ທຳມະດາ','ธรรมดา')}</small>}{item.note&&<span className="item-note">{itemNote(item,lang)}</span>}</div><span>{money(item.price*item.quantity)}</span></div>)}<button className="add-food" onClick={onAdd}><Plus size={18}/>{t('ເພີ່ມອໍເດີ','เพิ่มออเดอร์')}</button></div><div className="receipt-bottom"><div className="subtotal"><span>{t('ຄ່າອາຫານ','ค่าอาหาร')}</span><span>{money(orderTotal(order.items))} ₭</span></div><div className="total"><span>{t('ລວມທັງໝົດ','รวมทั้งหมด')}</span><strong>{money(orderTotal(order.items))}<small> ₭</small></strong></div><div className="payment-method">{order.method==='transfer'?<CreditCard size={18}/>:<Banknote size={18}/>}<span>{order.method==='transfer'?t('ໂອນເງິນ','โอนเงิน'):t('ເງິນສົດ','เงินสด')}</span>{order.paid&&<span className="paid-mark"><CheckCircle2 size={15}/>{t('ຮັບເງິນແລ້ວ','รับเงินแล้ว')}</span>}</div>{order.status==='pending'?<><button className="button primary full payment-cta" onClick={onPay}><CheckCircle2 size={21}/>{t('ຮັບເງິນ ແລະ ສົ່ງຄົວ','รับเงินและส่งครัว')}<ArrowRight size={19}/></button><p className="action-hint">{t('ກວດສອບເງິນເຂົ້າ ກ່ອນຢືນຢັນທຸກຄັ້ງ','ตรวจสอบเงินเข้าก่อนยืนยันทุกครั้ง')}</p></>:order.status==='ready'?<button className="button primary full" onClick={()=>onAct(order.id,'serve')}><Check size={20}/>{t('ຢືນຢັນເສີບແລ້ວ','ยืนยันเสิร์ฟแล้ว')}</button>:order.status==='served'?<button className="button primary full" onClick={()=>onAct(order.id,'close')}><CheckCircle2 size={20}/>{tableOrders.length > 1 ? t('ປິດອໍເດີນີ້','ปิดออเดอร์นี้') : t('ປິດໂຕະ','ปิดโต๊ะ')}</button>:<div className="kitchen-sent"><ChefHat size={20}/>{t('ສົ່ງຄົວແລ້ວ · ລໍຖ້າອາຫານ','ส่งครัวแล้ว · รออาหาร')}</div>}</div></>:<div className="empty-table"><span className="empty-icon"><Armchair size={42} strokeWidth={1.4}/></span><h3>{t('ພ້ອມຮັບລູກຄ້າ','พร้อมรับลูกค้า')}</h3><p>{t('ລູກຄ້າສະແກນ QR ເພື່ອສັ່ງອາຫານ ຫຼື ເພີ່ມອໍເດີໃຫ້ລູກຄ້າໄດ້ເລີຍ','ลูกค้าสแกน QR เพื่อสั่งอาหาร หรือเพิ่มออเดอร์ให้ลูกค้าได้เลย')}</p><button className="button primary full" onClick={onAdd}><Plus size={20}/>{t('ເພີ່ມອໍເດີ','เพิ่มออเดอร์')}</button><button className="button secondary full" onClick={onQr}><QrCode size={20}/>{t('ເບິ່ງ QR ໂຕະນີ້','ดู QR โต๊ะนี้')}</button></div>}
 </aside>;
}

function PaymentDialog({order,onClose,onConfirm}) {
 const {t}=useL(); const [method,setMethod]=useState(order.method);const [checked,setChecked]=useState(false);
 return <Dialog title={`${t('ຢືນຢັນຮັບເງິນ','ยืนยันรับเงิน')} · ${t('ໂຕະ','โต๊ะ')} ${pad(order.table)}`} onClose={onClose} className="payment-dialog"><p className="payment-order-context">#{order.id} · {order.items.reduce((sum,item)=>sum+item.quantity,0)} {t('ລາຍການ','รายการ')}</p><div className="payment-amount"><span>{t('ຍອດທີ່ຕ້ອງຮັບ','ยอดที่ต้องรับ')}</span><strong>{money(orderTotal(order.items))}<small> ₭</small></strong></div><div className="payment-options">{[['transfer',CreditCard,t('ໂອນເງິນ','โอนเงิน')],['cash',Banknote,t('ເງິນສົດ','เงินสด')]].map(([id,Icon,label])=><button key={id} className={method===id?'selected':''} aria-pressed={method===id} onClick={()=>{setMethod(id);setChecked(false);}}><Icon size={24}/>{label}{method===id&&<Check size={18}/>}</button>)}</div><label className="check-confirm"><input type="checkbox" checked={checked} onChange={e=>setChecked(e.target.checked)}/><span>{method==='transfer'?t('ກວດສອບຍອດເງິນເຂົ້າແລ້ວ','ตรวจสอบยอดเงินเข้าแล้ว'):t('ໄດ້ຮັບເງິນສົດຄົບແລ້ວ','รับเงินสดครบแล้ว')}</span></label><button className="button primary full" disabled={!checked} onClick={()=>onConfirm(method)}><CheckCircle2 size={20}/>{t('ຢືນຢັນ ແລະ ສົ່ງຄົວ','ยืนยันและส่งครัว')}</button><p className="demo-note">{t('ການທົດລອງ UI · ບໍ່ໄດ້ເຊື່ອມທະນາຄານ','ทดลอง UI · ยังไม่เชื่อมต่อธนาคาร')}</p></Dialog>;
}
function QRDialog({table,onClose}) {
 const {t}=useL();const {menuUrl,image,error,localNetwork}=useMenuQr(table);
 return <Dialog title={`${t('QR ສັ່ງອາຫານ','QR สั่งอาหาร')} · ${t('ໂຕະ','โต๊ะ')} ${pad(table)}`} onClose={onClose} className="qr-dialog"><div className="qr-print"><Soup size={32}/><h3>ຮ້ານເຂົ້າປຽກ</h3><p>{t('ສະແກນ ສັ່ງ ລໍຖ້າຄວາມແຊບ','สแกน สั่ง รอความอร่อย')}</p>{image?<img width="240" height="240" src={image} alt={t('QR ສຳລັບສັ່ງອາຫານ','QR สำหรับสั่งอาหาร')}/>:<div className="qr-loading">{error?t('ສ້າງ QR ບໍ່ສຳເລັດ · ໃຊ້ລິ້ງດ້ານລຸ່ມ','สร้าง QR ไม่สำเร็จ · ใช้ลิงก์ด้านล่าง'):t('ກຳລັງສ້າງ QR…','กำลังสร้าง QR…')}</div>}<strong>{t('ໂຕະ','โต๊ะ')} {pad(table)}</strong></div>{localNetwork&&<p className="qr-network-hint">{t('ໂທລະສັບ ແລະ ຄອມຕ້ອງໃຊ້ Wi-Fi ດຽວກັນ ແລະ ເປີດແອັບໃນຄອມໄວ້','มือถือและคอมต้องใช้ Wi-Fi เดียวกัน และเปิดแอปบนคอมไว้')}</p>}<a className="button primary full" href={menuUrl} onClick={onClose}><Smartphone size={20}/>{t('ເປີດເມນູໂຕະນີ້','เปิดเมนูโต๊ะนี้')}</a><a className="qr-menu-address" href={menuUrl}>{menuUrl}</a><p className="demo-note">{t('ລິ້ງຕົ້ນແບບ · ອໍເດີຍັງບໍ່ຊິງຂ້າມອຸປະກອນ','ลิงก์ต้นแบบ · ออเดอร์ยังไม่ซิงก์ข้ามอุปกรณ์')}</p></Dialog>;
}

function OrdersView({orders,filter,setFilter,onSelect}) {
 const {t,lang}=useL(); const [query,setQuery]=useState('');
 const options=[['all',t('ທັງໝົດ','ทั้งหมด')],['pending',t('ລໍຮັບເງິນ','รอรับเงิน')],['kitchen',t('ຢູ່ໃນຄົວ','อยู่ในครัว')],['ready',t('ພ້ອມເສີບ','พร้อมเสิร์ฟ')],['completed',t('ສຳເລັດ','เสร็จสิ้น')]];
 const effective=options.some(([id])=>id===filter)?filter:'all';
 const shown=orders.filter(o=>(effective==='all'||effective==='kitchen'&&['queued','cooking'].includes(o.status)||effective===o.status)&&(!query||o.id.includes(query)||pad(o.table).includes(query)));
 return <section className="full-page"><div className="page-heading"><div><h1>{t('ອໍເດີທັງໝົດ','ออเดอร์ทั้งหมด')}</h1><p>{t('ທຸກອໍເດີ ທຸກຂັ້ນຕອນ ຕິດຕາມໄດ້ທີ່ນີ້','ติดตามทุกออเดอร์ ทุกขั้นตอนได้ที่นี่')}</p></div><span className="page-count">{orders.length} {t('ອໍເດີ','ออเดอร์')}</span></div><div className="list-toolbar"><div className="segment wrap">{options.map(([id,label])=><button key={id} className={effective===id?'selected':''} aria-pressed={effective===id} onClick={()=>setFilter(id)}>{label}{id==='pending'&&<span className="tab-count">{orders.filter(o=>o.status==='pending').length}</span>}</button>)}</div><label className="search-field"><Search size={19}/><input aria-label={t('ຄົ້ນຫາໂຕະ ຫຼື ອໍເດີ','ค้นหาโต๊ะหรือออเดอร์')} placeholder={t('ເລກໂຕະ ຫຼື ອໍເດີ…','เลขโต๊ะหรือออเดอร์…')} value={query} onChange={e=>setQuery(e.target.value)}/></label></div><div className="order-list">{shown.length?shown.map(o=><button key={o.id} className="order-list-row" onClick={()=>onSelect(o)} disabled={o.status==='completed'}><span className="row-table">{pad(o.table)}<small>{t('ໂຕະ','โต๊ะ')}</small></span><div className="row-order"><strong>#{o.id}</strong><span>{o.items.map(i=>`${itemName(i,lang)} ×${i.quantity}`).join(' · ')}</span></div><div className="row-order-time"><Clock3 size={15}/>{new Date(o.createdAt).toLocaleTimeString('en-GB',{timeZone:'Asia/Vientiane',hour:'2-digit',minute:'2-digit'})}</div><Badge status={o.status}/><strong className="row-amount">{money(orderTotal(o.items))} ₭</strong><ChevronRight size={20}/></button>):<EmptyState icon={ClipboardList} title={t('ຍັງບໍ່ມີອໍເດີໃນລາຍການນີ້','ยังไม่มีออเดอร์ในรายการนี้')} text={t('ລອງເລືອກສະຖານະອື່ນ ຫຼື ຄົ້ນຫາໃໝ່','ลองเลือกสถานะอื่นหรือค้นหาใหม่')}/>}</div></section>;
}
function EmptyState({icon:Icon,title,text,children}) { return <div className="empty-state"><span className="empty-icon"><Icon size={38} strokeWidth={1.4}/></span><h3>{title}</h3><p>{text}</p>{children}</div>; }
function MenuManagement({menu,onToggle,search,setSearch}) {
 const {t,lang}=useL();const [category,setCategory]=useState('all');
 const filtered=menu.filter(i=>(category==='all'||i.category===category)&&itemName(i,lang).toLowerCase().includes(search.toLowerCase()));
 return <section className="full-page"><div className="page-heading"><div><h1>{t('ຈັດການເມນູ','จัดการเมนู')}</h1><p>{t('ເປີດ–ປິດລາຍການ ໃຫ້ລູກຄ້າເຫັນເມນູທີ່ພ້ອມຂາຍ','เปิด–ปิดรายการ ให้ลูกค้าเห็นเมนูที่พร้อมขาย')}</p></div><span className="page-count">{menu.filter(i=>i.available).length}/{menu.length} {t('ພ້ອມຂາຍ','พร้อมขาย')}</span></div><div className="list-toolbar"><div className="segment">{[['all',t('ທັງໝົດ','ทั้งหมด')],['noodles',t('ອາຫານ','อาหาร')],['drinks',t('ເຄື່ອງດື່ມ','เครื่องดื่ม')]].map(([id,label])=><button className={category===id?'selected':''} aria-pressed={category===id} key={id} onClick={()=>setCategory(id)}>{label}</button>)}</div><label className="search-field"><Search size={18}/><input aria-label={t('ຄົ້ນຫາເມນູ','ค้นหาเมนู')} placeholder={t('ຄົ້ນຫາເມນູ…','ค้นหาเมนู…')} value={search} onChange={e=>setSearch(e.target.value)}/></label></div><div className="manage-menu-grid">{filtered.map(item=><article key={item.id} className={`manage-food ${!item.available?'unavailable':''}`}><img src={item.image} alt={itemName(item,lang)} width="240" height="170"/><div className="manage-food-content"><h2>{itemName(item,lang)}</h2><p>{item[lang==='lo'?'detailLo':'detailTh']}</p><strong>{money(item.price)} <small>₭</small></strong><div className="availability-row"><span>{item.available?t('ພ້ອມຂາຍ','พร้อมขาย'):t('ໝົດຊົ່ວຄາວ','หมดชั่วคราว')}</span><button className={`switch ${item.available?'on':''}`} role="switch" aria-checked={item.available} aria-label={`${t('ພ້ອມຂາຍ','พร้อมขาย')} ${itemName(item,lang)}`} onClick={()=>onToggle(item.id)}><span/></button></div></div></article>)}</div>{!filtered.length&&<EmptyState icon={Search} title={t('ບໍ່ພົບເມນູ','ไม่พบเมนู')} text={t('ລອງຄຳຄົ້ນຫາອື່ນ','ลองคำค้นหาอื่น')}/>}</section>;
}
function Reports({orders}) {
 const {t,lang}=useL();const paid=orders.filter(o=>o.paid);const total=paid.reduce((s,o)=>s+orderTotal(o.items),0);
 const sales=Object.values(paid.flatMap(o=>o.items).reduce((map,i)=>{map[i.id]||={...i,quantity:0,amount:0};map[i.id].quantity+=i.quantity;map[i.id].amount+=i.price*i.quantity;return map;},{})).sort((a,b)=>b.quantity-a.quantity);
 return <section className="full-page reports-page"><div className="page-heading"><div><h1>{t('ສະຫຼຸບຍອດຂາຍ','สรุปยอดขาย')}</h1><p>{t('ຄິດຈາກອໍເດີທີ່ຢືນຢັນຮັບເງິນແລ້ວໃນຕົ້ນແບບ','คำนวณจากออเดอร์ที่ยืนยันรับเงินแล้วในต้นแบบ')}</p></div><span className="date-label"><Clock3 size={18}/>{t('ຮອບທົດລອງນີ້','รอบทดลองนี้')}</span></div><div className="sales-overview"><div className="sales-main"><span>{t('ຍອດຮັບເງິນທັງໝົດ','ยอดรับเงินทั้งหมด')}</span><strong>{money(total)} <small>₭</small></strong><p><CheckCircle2 size={17}/>{paid.length} {t('ອໍເດີ ຮັບເງິນແລ້ວ','ออเดอร์ รับเงินแล้ว')}</p></div><div className="sales-methods">{[['cash',Banknote,t('ເງິນສົດ','เงินสด')],['transfer',CreditCard,t('ໂອນເງິນ','โอนเงิน')]].map(([method,Icon,label])=><div key={method}><Icon size={23}/><span>{label}<strong>{money(paid.filter(o=>o.method===method).reduce((s,o)=>s+orderTotal(o.items),0))} ₭</strong></span><small>{paid.filter(o=>o.method===method).length} {t('ອໍເດີ','ออเดอร์')}</small></div>)}</div></div><section className="sales-breakdown"><h2>{t('ລາຍການທີ່ຂາຍໄດ້','รายการที่ขายได้')}</h2><p>{t('ລວມຈາກອໍເດີທີ່ຮັບເງິນແລ້ວ','รวมจากออเดอร์ที่รับเงินแล้ว')}</p><div className="sales-table"><div className="sales-table-head"><span>{t('ເມນູ','เมนู')}</span><span>{t('ຈຳນວນ','จำนวน')}</span><span>{t('ຍອດຂາຍ','ยอดขาย')}</span></div>{sales.map(item=><div className="sales-table-row" key={item.id}><span><img width="50" height="50" src={item.image} alt=""/>{itemName(item,lang)}</span><span>{item.quantity}</span><strong>{money(item.amount)} ₭</strong></div>)}</div></section></section>;
}
function Kitchen({orders,onAct,now}) {
 const {t,lang}=useL();const [filter,setFilter]=useState('all');const kitchenOrders=orders.filter(o=>o.paid&&['queued','cooking','ready'].includes(o.status)).sort((a,b)=>a.createdAt-b.createdAt);
 const shown=kitchenOrders.filter(o=>filter==='all'||o.status===filter);
 return <section className="full-page kitchen-page"><div className="page-heading"><div><h1><ChefHat size={34} strokeWidth={1.7}/>{t('ຄົວເຂົ້າປຽກ','ครัวข้าวเปียก')}</h1><p>{t('ເຮັດຕາມຄິວ ສົ່ງຄວາມແຊບໃຫ້ຖືກໂຕະ','ทำตามคิว ส่งความอร่อยให้ถูกโต๊ะ')}</p></div><div className="kitchen-live"><span className="live-dot"/>{t('ເປີດຮັບອໍເດີ','เปิดรับออเดอร์')}</div></div><div className="kitchen-toolbar"><div className="segment wrap">{[['all',t('ທັງໝົດ','ทั้งหมด')],['queued',t('ລໍຖ້າເຮັດ','รอทำ')],['cooking',t('ກຳລັງເຮັດ','กำลังทำ')],['ready',t('ພ້ອມເສີບ','พร้อมเสิร์ฟ')]].map(([id,label])=><button key={id} onClick={()=>setFilter(id)} aria-pressed={filter===id} className={filter===id?'selected':''}>{label}<span className="tab-count">{kitchenOrders.filter(o=>id==='all'||o.status===id).length}</span></button>)}</div><span className="kitchen-paid-note"><CheckCircle2 size={17}/>{t('ຢືນຢັນຮັບເງິນແລ້ວທຸກອໍເດີ','ยืนยันรับเงินแล้วทุกออเดอร์')}</span></div><div className="kitchen-grid">{shown.map(order=><article className={`kitchen-ticket ${order.status}`} key={order.id}><header><div><span>{t('ໂຕະ','โต๊ะ')}</span><h2>{pad(order.table)}</h2></div><div><Badge status={order.status}/><span className="ticket-order-id">#{order.id}</span></div></header><div className="ticket-time"><Clock3 size={16}/>{Math.max(0,Math.floor((now.getTime()-order.createdAt)/60000))} {t('ນາທີຜ່ານມາ','นาทีที่ผ่านมา')}</div><div className="ticket-items">{order.items.map((item,i)=><div key={i}><b>{item.quantity}<small>×</small></b><span><strong>{itemName(item,lang)}</strong>{item.note&&<em>{itemNote(item,lang)}</em>}{item.size==='large'&&<small>{t('ພິເສດ','พิเศษ')}</small>}</span></div>)}</div><footer>{order.status==='queued'?<button className="button primary full" onClick={()=>onAct(order.id,'start')}><Flame size={21}/>{t('ເລີ່ມເຮັດ','เริ่มทำอาหาร')}</button>:order.status==='cooking'?<button className="button primary full" onClick={()=>onAct(order.id,'ready')}><Check size={23}/>{t('ພ້ອມເສີບ','พร้อมเสิร์ฟ')}</button>:<div className="ticket-ready"><CheckCircle2 size={21}/>{t('ລໍພະນັກງານຮັບອາຫານ','รอพนักงานรับอาหาร')}</div>}</footer></article>)}</div>{!shown.length&&<EmptyState icon={ChefHat} title={t('ຄົວພ້ອມແລ້ວ','ครัวพร้อมแล้ว')} text={t('ອໍເດີຈະມາທີ່ນີ້ ຫຼັງແຄຊເຊຍຢືນຢັນຮັບເງິນ','ออเดอร์จะแสดงที่นี่หลังแคชเชียร์ยืนยันรับเงิน')}/>}</section>;
}
