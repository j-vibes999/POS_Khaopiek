import React, { useState, useEffect, useRef } from 'react';
import { ArrowLeft, ArrowLeftRight, Soup, LayoutGrid, ClipboardList, Utensils, BarChart3, ChefHat, Smartphone, ChevronDown, ChevronRight, ArrowUpRight, Plus, Search, QrCode, Clock3, Users, Check, X, Banknote, CreditCard, Bell, CircleHelp, CheckCircle2, ArrowRight, Armchair, Store, WifiOff, MoreHorizontal, Hourglass, BellRing, CookingPot, Undo2, Hand, GlassWater, Wallet } from 'lucide-react';
import { useMenuQr } from './use-menu-qr';
import { initialOrders } from './data';
import Customer from './Customer';
import { SettingsView, ShiftView, StaffView, SwitchUserDialog, TableSetupView } from './BackOffice';
import { PosOrder } from './PosOrder';
import { KitchenScreen } from './KitchenScreen';
import { MenuAdmin } from './MenuAdmin';
import { Dialog, EmptyState, IconButton, Locale, initial, itemName, money, pad, roleText, statusText, useL, viewIcons, viewLabel } from './staff-ui';
import { orderTotal } from './order-model.mjs';
import { DEMO_STORAGE_KEY, applyOrderAction, commitCheckout, customerOrders, readDemoSession, restoreDemoSession, tableFromSearch, undoOrderAction, updateDemoSession } from './customer-model.mjs';
import { addTable, answerCall, canOpen, cashSuggestions, closeShift, currentShift, deleteMenuItem, logActivity, openShift, paidInRange, removeLastTable, requestCall, roleViews, saveMenuItem, saveSettings, saveStaffMember, updateTable } from './backoffice-model.mjs';

const emptyDraft = { cart: [], method: 'transfer', lastOrderId: null };
const demoStorage = (() => { try { return window.localStorage; } catch { return null; } })();
// Who is signed in belongs to this device, so it stays outside the demo data that tabs share.
const userKey = 'khao-piek:demo:user';
const readUserId = () => { try { return demoStorage?.getItem(userKey) ?? ''; } catch { return ''; } };
const itemNote = (item, lang) => lang === 'th' ? item.noteTh || item.note : item.note;
const views = ['tables', 'orders', 'kitchen', 'shift', 'menu', 'table-setup', 'staff', 'reports', 'settings', 'customer', 'pos'];
const viewFromHash = () => views.includes(location.hash.slice(1).split('/')[0]) ? location.hash.slice(1).split('/')[0] : 'tables';
const navGroups = [['daily', ['tables', 'orders', 'kitchen', 'shift']], ['manage', ['menu', 'table-setup', 'staff', 'reports']], ['system', ['settings']]];
const mobileTabs = ['tables', 'orders', 'kitchen', 'shift'];
const callIcons = { help: Hand, pay: Banknote, water: GlassWater };
const callLabel = (reason, t) => ({ help: t('ເອີ້ນພະນັກງານ', 'เรียกพนักงาน'), pay: t('ຂໍຈ່າຍເງິນທີ່ໂຕະ', 'ขอจ่ายเงินที่โต๊ะ'), water: t('ຂໍນ້ຳເປົ່າ', 'ขอน้ำเปล่า') }[reason]);
export default function App() {
  const [lang, setLang] = useState('lo');
  const t = (lo, th) => lang === 'lo' ? lo : th;
  const [view, setView] = useState(viewFromHash);
  const [session, setSession] = useState(() => restoreDemoSession(demoStorage, initialOrders));
  const sessionRef = useRef(session);
  const orders = session.orders;
  const tables = session.tables;
  const menu = session.menu.map(item => ({ ...item, available: !session.soldOut.includes(item.id) }));
  const [userId, setUserId] = useState(readUserId);
  const user = session.staff.find(member => member.id === userId && member.active) ?? session.staff.find(member => member.active && member.role === 'owner');
  const allowed = roleViews[user.role];
  const screen = canOpen(user.role, view) ? view : allowed[0];
  const shopName = session.settings.shopName || t('ຮ້ານເຂົ້າປຽກ', 'ร้านข้าวเปียก');
  const branch = session.settings.branch || t('ສາຂາ ວຽງຈັນ', 'สาขา เวียงจันทน์');
  const [activeTable, setActiveTable] = useState(3);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [filter, setFilter] = useState('all');
  const [dialog, setDialog] = useState(null);
  const [toast, setToast] = useState(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [now, setNow] = useState(new Date());
  const qrTable = tableFromSearch(location.search, tables.length);
  const pending = orders.filter(o => o.status === 'pending').length;
  const activeOrders = orders.filter(o => o.status !== 'completed');
  const tableOrders = activeOrders.filter(o => o.table === activeTable);
  const order = tableOrders.find(o => o.id === selectedOrder) || tableOrders[0];
  const groupLabels = { daily: t('ງານປະຈຳວັນ', 'งานประจำวัน'), manage: t('ຈັດການຮ້ານ', 'จัดการร้าน'), system: t('ລະບົບ', 'ระบบ') };
  const sidebarGroups = navGroups.map(([group, ids]) => [group, ids.filter(id => allowed.includes(id))]).filter(([group, ids]) => ids.length || (group === 'system' && user.role !== 'kitchen'));
  const canEditMenu = ['owner', 'manager'].includes(user.role);
  const go = destination => { location.hash = destination; setView(destination); window.scrollTo({top:0,behavior:'instant'}); };
  const notify = (text, undo) => setToast({ text, undo, id: Date.now() });
  const notifySaveFailed = () => notify(t('ບັນທຶກບໍ່ສຳເລັດ · ກະລຸນາລອງໃໝ່', 'บันทึกไม่สำเร็จ · กรุณาลองใหม่'));
  const showOrderPanel = () => { if (innerWidth <= 600) requestAnimationFrame(() => document.querySelector('.order-panel')?.scrollIntoView({ behavior: 'instant', block: 'start' })); };
  useEffect(() => { const update = () => setView(viewFromHash()); addEventListener('hashchange', update); return () => removeEventListener('hashchange', update); }, []);
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
  // Announce a guest's new call on the staff screens.
  const seenCalls = useRef(session.calls);
  useEffect(() => {
    const fresh = Object.entries(session.calls).filter(([table, call]) => seenCalls.current[table]?.at !== call.at);
    seenCalls.current = session.calls;
    if (fresh.length && view !== 'customer') { const [table, call] = fresh.at(-1); notify(`${t('ໂຕະ', 'โต๊ะ')} ${pad(table)} · ${callLabel(call.reason, t)}`); }
  }, [session.calls]);
  // A screen this role may not open falls back to the role's first screen.
  useEffect(() => { if (screen !== view) go(screen); }, [screen, view]);
  useEffect(() => { if (!tables.some(table => table.number === activeTable)) setActiveTable(tables[0].number); }, [tables, activeTable]);
  useEffect(() => { document.documentElement.lang = lang; }, [lang]);
  useEffect(() => { const id = setInterval(() => setNow(new Date()), 30000); return () => clearInterval(id); }, []);
  useEffect(() => { if(!toast) return; const id = setTimeout(() => setToast(null), toast.undo ? 6000 : 4500); return () => clearTimeout(id); }, [toast]);
  useEffect(() => { const on = () => setOnline(true); const off = () => setOnline(false); addEventListener('online', on); addEventListener('offline', off); return () => { removeEventListener('online', on); removeEventListener('offline', off); }; }, []);
  function saveSession(change) {
    const next = updateDemoSession(demoStorage, sessionRef.current, change);
    sessionRef.current = next;
    setSession(next);
  }
  // Saves a change with an activity-log entry naming the signed-in person; returns an error code, or null when saved.
  function change(update, describe) {
    try {
      saveSession(current => {
        const next = update(current);
        const entry = typeof describe === 'function' ? describe(next, current) : describe;
        return entry ? logActivity(next, { ...entry, by: user.name, role: user.role }) : next;
      });
      return null;
    } catch (error) {
      if (!error.code) notifySaveFailed();
      return error.code ?? 'storage';
    }
  }
  function act(id, action, method, detail = '') {
    const latest = readDemoSession(demoStorage) ?? sessionRef.current;
    const previous = latest.orders.find(o => o.id === id);
    const clearedBefore = previous ? latest.clearedAt[previous.table] : undefined;
    const failed = change(current => applyOrderAction(current, id, action, method), (next, current) => {
      const before = current.orders.find(o => o.id === id);
      const after = next.orders.find(o => o.id === id);
      return before && after.status !== before.status ? { type: action, orderId: id, table: before.table, amount: orderTotal(before.items), method: after.method } : null;
    });
    if (failed) return false;
    const messages = { pay: t('ຮັບເງິນແລ້ວ · ສົ່ງອໍເດີໄປຄົວແລ້ວ', 'รับเงินแล้ว · ส่งออเดอร์เข้าครัวแล้ว'), start: t('ເລີ່ມເຮັດອາຫານແລ້ວ', 'เริ่มทำอาหารแล้ว'), ready: t('ອາຫານພ້ອມເສີບແລ້ວ', 'อาหารพร้อมเสิร์ฟแล้ว'), serve: t('ບັນທຶກການເສີບແລ້ວ', 'บันทึกการเสิร์ฟแล้ว'), close: t('ປິດອໍເດີແລ້ວ', 'ปิดออเดอร์แล้ว') };
    const status = sessionRef.current.orders.find(o => o.id === id)?.status;
    // A mistaken tap can be taken back for a few seconds.
    notify(messages[action] + detail, previous ? () => undoAct(previous, clearedBefore, action, status) : undefined);
    return true;
  }
  function undoAct(previous, clearedBefore, action, status) {
    const failed = change(current => undoOrderAction(current, previous, clearedBefore, status), { type: 'undo', action, orderId: previous.id, table: previous.table });
    if (failed === 'changed') notify(t('ອໍເດີນີ້ມີຄົນປ່ຽນຕໍ່ແລ້ວ · ເອົາຄືນບໍ່ໄດ້', 'ออเดอร์นี้มีคนเปลี่ยนต่อแล้ว · เอาคืนไม่ได้'));
    else if (!failed) notify(t(`ເອົາຄືນແລ້ວ · ອໍເດີ #${previous.id}`, `เอาคืนแล้ว · ออเดอร์ #${previous.id}`));
  }
  function updateDraft(table, transform) {
    saveSession(current => ({ ...current, drafts: { ...current.drafts, [table]: transform(current.drafts[table] || emptyDraft) } }));
  }
  function toggleSoldOut(id) {
    change(current => ({ ...current, soldOut: current.soldOut.includes(id) ? current.soldOut.filter(soldId => soldId !== id) : [...current.soldOut, id] }), next => ({ type: next.soldOut.includes(id) ? 'sold-out' : 'available', itemId: id }));
  }
  function saveDish(dish) {
    const failed = change(current => ({ ...current, menu: saveMenuItem(current.menu, dish) }), { type: 'dish', name: String(dish.lo ?? '').trim() });
    if (!failed) notify(t('ບັນທຶກເມນູແລ້ວ', 'บันทึกเมนูแล้ว'));
    return failed;
  }
  function removeDish(id) {
    const dish = sessionRef.current.menu.find(item => item.id === id);
    const failed = change(current => ({ ...current, menu: deleteMenuItem(current.menu, id), soldOut: current.soldOut.filter(soldId => soldId !== id) }), { type: 'dish-deleted', name: dish?.lo });
    notify(failed === 'last-dish' ? t('ຕ້ອງມີຢ່າງໜ້ອຍ 1 ເມນູ', 'ต้องมีอย่างน้อย 1 เมนู') : failed ? t('ລຶບບໍ່ສຳເລັດ', 'ลบไม่สำเร็จ') : t('ລຶບເມນູແລ້ວ', 'ลบเมนูแล้ว'));
    return failed;
  }
  function submit(table, source) {
    const result = commitCheckout(demoStorage, readDemoSession(demoStorage) ?? sessionRef.current, table, source);
    sessionRef.current = result.session;
    setSession(result.session);
    setActiveTable(table);
    setSelectedOrder(result.orderId);
    // The order is already saved; a failed log entry must not undo it.
    try { saveSession(current => logActivity(current, { type: 'order', orderId: result.orderId, table, by: source === 'cashier' ? user.name : null, role: source === 'cashier' ? user.role : null })); } catch { /* the order stands */ }
    if (source === 'cashier') {
      // A cashier entry returns to its table so payment can be taken straight away.
      go('tables');
      notify(t(`ເພີ່ມອໍເດີ #${result.orderId} ແລ້ວ · ລໍຖ້າຮັບເງິນ`, `เพิ่มออเดอร์ #${result.orderId} แล้ว · รอรับเงิน`));
      showOrderPanel();
    }
    return result.orderId;
  }
  function submitPos(pay) {
    try {
      const orderId = submit(activeTable, 'cashier');
      const placed = sessionRef.current.orders.find(o => o.id === orderId);
      if (pay && placed) setDialog({ type: 'payment', order: placed });
      return null;
    } catch (error) {
      return error.code === 'sold-out' ? t('ມີເມນູທີ່ໝົດໃນລາຍການ · ກະລຸນາລຶບອອກ', 'มีเมนูที่หมดในรายการ · กรุณาลบออก') : t('ສົ່ງອໍເດີບໍ່ສຳເລັດ · ກະລຸນາລອງໃໝ່', 'ส่งออเดอร์ไม่สำเร็จ · กรุณาลองใหม่');
    }
  }
  function callStaff(table, reason) {
    try { saveSession(current => logActivity(requestCall(current, table, reason), { type: 'call', table, reason, by: null, role: null })); } catch { /* the guest can tap again */ }
  }
  function cancelCall(table) {
    try { saveSession(current => answerCall(current, table)); } catch { /* the call simply stays */ }
  }
  function answerTableCall(table) {
    const failed = change(current => answerCall(current, table), { type: 'call-answered', table });
    if (!failed) notify(t(`ຮັບຊາບແລ້ວ · ໂຕະ ${pad(table)}`, `รับทราบแล้ว · โต๊ะ ${pad(table)}`));
  }
  function signIn(member) {
    try { demoStorage?.setItem(userKey, member.id); } catch { /* sign-in still applies to this tab */ }
    setUserId(member.id);
    try { saveSession(current => logActivity(current, { type: 'signin', by: member.name, role: member.role })); } catch { /* signing in does not need the log */ }
    setDialog(null);
    notify(t(`ເຂົ້າໃຊ້ງານເປັນ ${member.name}`, `เข้าใช้งานเป็น ${member.name}`));
  }
  const shiftErrors = { 'shift-open': t('ມີກະທີ່ເປີດຢູ່ແລ້ວ', 'มีกะที่เปิดอยู่แล้ว'), 'no-shift': t('ບໍ່ມີກະທີ່ເປີດຢູ່', 'ไม่มีกะที่เปิดอยู่'), amount: t('ຈຳນວນເງິນບໍ່ຖືກຕ້ອງ', 'จำนวนเงินไม่ถูกต้อง') };
  function startShift(amount) {
    const failed = change(current => openShift(current, user, amount), { type: 'shift-open', amount });
    if (failed) { if (shiftErrors[failed]) notify(shiftErrors[failed]); return false; }
    notify(t('ເປີດກະແລ້ວ', 'เปิดกะแล้ว'));
    return true;
  }
  function endShift(counted) {
    const failed = change(current => closeShift(current, user, counted), (next, current) => ({ type: 'shift-close', difference: next.shifts.find(shift => shift.id === currentShift(current.shifts).id).difference }));
    if (failed) { if (shiftErrors[failed]) notify(shiftErrors[failed]); return false; }
    notify(t('ປິດກະແລ້ວ · ບັນທຶກຍອດເງິນແລ້ວ', 'ปิดกะแล้ว · บันทึกยอดเงินแล้ว'));
    return true;
  }
  function saveStaff(member) {
    const failed = change(current => ({ ...current, staff: saveStaffMember(current.staff, member) }), { type: 'staff', name: String(member.name).trim() });
    if (!failed) notify(t('ບັນທຶກພະນັກງານແລ້ວ', 'บันทึกพนักงานแล้ว'));
    return failed;
  }
  const tableErrors = { 'table-busy': t('ໂຕະນີ້ຍັງມີອໍເດີທີ່ບໍ່ທັນປິດ', 'โต๊ะนี้ยังมีออเดอร์ที่ยังไม่ปิด'), 'max-tables': t('ເພີ່ມໄດ້ສູງສຸດ 60 ໂຕະ', 'เพิ่มได้สูงสุด 60 โต๊ะ'), 'min-tables': t('ຕ້ອງມີຢ່າງໜ້ອຍ 1 ໂຕະ', 'ต้องมีอย่างน้อย 1 โต๊ะ'), seats: t('ບ່ອນນັ່ງຕ້ອງຢູ່ລະຫວ່າງ 1–30', 'ที่นั่งต้องอยู่ระหว่าง 1–30'), zone: t('ຊື່ໂຊນຍາວເກີນ 24 ຕົວອັກສອນ', 'ชื่อโซนยาวเกิน 24 ตัวอักษร') };
  function changeTables(update, describe) {
    const failed = change(current => ({ ...current, tables: update(current) }), describe);
    if (failed && tableErrors[failed]) notify(tableErrors[failed]);
    return !failed;
  }
  function changeSettings(changes) {
    const failed = change(current => ({ ...current, settings: saveSettings(current.settings, changes) }), { type: 'settings' });
    if (!failed) notify(t('ບັນທຶກການຕັ້ງຄ່າແລ້ວ', 'บันทึกการตั้งค่าแล้ว'));
    return failed;
  }
  function resetDemo() {
    try { demoStorage?.removeItem(DEMO_STORAGE_KEY); demoStorage?.removeItem(userKey); } catch { /* reload still starts from the demo data */ }
    location.hash = 'tables';
    location.reload();
  }
  const orderingTable = qrTable.fromQr ? qrTable.table : activeTable;
  if (view === 'customer') return <Customer menu={menu} table={orderingTable} staffAccess={!qrTable.fromQr} shopName={session.settings.shopName} methods={session.settings.methods} call={session.calls[orderingTable]} onCall={reason => callStaff(orderingTable, reason)} onCancelCall={() => cancelCall(orderingTable)} draft={session.drafts[orderingTable] || emptyDraft} onUpdateDraft={transform => updateDraft(orderingTable, transform)} onSubmit={submit} tableOrders={customerOrders(orders, orderingTable, session.clearedAt[orderingTable])} onBack={() => go('tables')} initialLanguage={lang}/>;
  const tabScreen = screen === 'pos' ? 'tables' : screen;
  return <Locale.Provider value={{ lang, t }}><div className="app">
    <a className="skip-link" href="#main-content" onClick={e=>{e.preventDefault();document.getElementById('main-content')?.focus();}}>{t('ຂ້າມໄປເນື້ອຫາ', 'ข้ามไปเนื้อหา')}</a>
    <aside className="sidebar">
      <button className="brand" onClick={() => go(allowed[0])} aria-label="Khao Piek POS"><span className="brand-symbol"><Soup size={30} strokeWidth={1.6}/></span><span><strong>ເຂົ້າປຽກ<span className="brand-period">.</span></strong><small>KHAO PIEK POS</small></span></button>
      <div className="shop-selector is-static"><span className="shop-icon"><Store size={20}/></span><span><strong>{shopName}</strong><small>{branch}</small></span></div>
      {sidebarGroups.map(([group, ids], index) => <React.Fragment key={group}>
        {index > 0 && <div className="nav-separator"/>}
        <div className="nav-caption">{groupLabels[group]}</div>
        <nav className="main-nav" aria-label={groupLabels[group]}>
          {ids.map(id => { const Icon = viewIcons[id]; const label = viewLabel(id, t); return <button key={id} className={tabScreen===id?'active':''} onClick={() => go(id)} aria-label={label} title={label} aria-current={tabScreen===id?'page':undefined}><Icon size={21}/><span>{label}</span>{id==='orders'&&pending>0&&<span className="nav-count">{pending}</span>}</button>; })}
          {group === 'system' && user.role !== 'kitchen' && <button className="customer-link" aria-label={viewLabel('customer', t)} title={viewLabel('customer', t)} onClick={() => go('customer')}><Smartphone size={21}/><span>{viewLabel('customer', t)}</span><ArrowUpRight size={16}/></button>}
        </nav>
      </React.Fragment>)}
      <div className="sidebar-bottom"><button className="help-button" onClick={() => setDialog({type:'help'})}><CircleHelp size={20}/>{t('ວິທີໃຊ້ງານ', 'วิธีใช้งาน')}<ChevronRight size={16}/></button><button className="profile" onClick={() => setDialog({ type: 'user' })} aria-label={`${t('ສະຫຼັບຜູ້ໃຊ້', 'สลับผู้ใช้')} · ${user.name}, ${roleText(user.role, t)}`}><span className={`avatar role-${user.role}`}>{initial(user.name)}</span><span><strong>{user.name}</strong><small>{roleText(user.role, t)}</small></span><ArrowLeftRight size={16}/></button></div>
    </aside>
    <div className="workspace"><header className="topbar"><div className="location-label"><Store size={18}/><span>{shopName}</span><span className="topbar-divider"/><span className="open-label"><i/>{t('ເປີດຮ້ານ', 'เปิดร้าน')}</span></div><div className="topbar-actions"><span className="demo-tag">{t('ຂໍ້ມູນຕົວຢ່າງ', 'ข้อมูลตัวอย่าง')}</span><time className="header-clock">{now.toLocaleTimeString('en-GB',{timeZone:'Asia/Vientiane',hour:'2-digit',minute:'2-digit'})}</time><button className="language-button" onClick={() => setLang(lang==='lo'?'th':'lo')} aria-label={lang==='lo'?'เปลี่ยนเป็นภาษาไทย':'ປ່ຽນເປັນພາສາລາວ'}>{lang==='lo'?'ລາວ':'ไทย'}<ChevronDown size={14}/></button>{allowed.includes('orders')&&<IconButton label={t('ອໍເດີທີ່ລໍຖ້າ', 'ออเดอร์ที่รอ')} onClick={() => { setFilter('pending'); go('orders'); }}><Bell size={21}/>{pending>0&&<i className="notification-dot"/>}</IconButton>}</div></header>
    {!online&&<div className="offline-banner" role="status"><WifiOff size={18}/>{t('ບໍ່ມີອິນເຕີເນັດ · ກຳລັງໃຊ້ຕົ້ນແບບໃນເຄື່ອງນີ້', 'ไม่มีอินเทอร์เน็ต · กำลังใช้ต้นแบบในเครื่องนี้')}</div>}
    <main id="main-content" tabIndex={-1} className={`main-content view-${screen}`}>
      {screen==='tables'&&<><TablesScreen tables={tables} activeOrders={activeOrders} calls={session.calls} activeTable={activeTable} filter={filter} setFilter={setFilter} now={now} onSelect={number=>{setActiveTable(number);setSelectedOrder(null);if(innerWidth<=600)requestAnimationFrame(()=>document.querySelector('.order-panel')?.scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}));}}/><OrderPanel table={activeTable} info={tables.find(table=>table.number===activeTable)} order={order} tableOrders={tableOrders} call={session.calls[activeTable]} now={now} setSelected={setSelectedOrder} onPay={()=>setDialog({type:'payment',order})} onAct={act} onAdd={()=>go('pos')} onQr={()=>setDialog({type:'qr',table:activeTable})} onAnswerCall={()=>answerTableCall(activeTable)}/></>}
      {screen==='pos'&&<PosOrder table={activeTable} tables={tables} menu={menu} draft={session.drafts[activeTable] || emptyDraft} onTable={setActiveTable} onUpdateDraft={transform => updateDraft(activeTable, transform)} onSubmit={submitPos} onBack={() => go('tables')}/>}
      {screen==='orders'&&<OrdersView orders={orders} filter={filter} setFilter={setFilter} now={now} onPay={o=>setDialog({type:'payment',order:o})} onAct={act} onGoTable={o=>{setActiveTable(o.table);setSelectedOrder(o.id);setFilter('all');go('tables');showOrderPanel();}}/>}
      {screen==='menu'&&<MenuAdmin menu={menu} canEdit={canEditMenu} onToggle={toggleSoldOut} onSave={saveDish} onDelete={removeDish}/>}
      {screen==='reports'&&<Reports orders={orders} now={now}/>}
      {screen==='kitchen'&&<KitchenScreen orders={orders} onAct={act} now={now}/>}
      {screen==='shift'&&<ShiftView shifts={session.shifts} orders={orders} user={user} onOpen={startShift} onClose={endShift}/>}
      {screen==='table-setup'&&<TableSetupView tables={tables} orders={orders} shopName={shopName} onAdd={()=>changeTables(current=>addTable(current.tables),next=>({type:'tables',count:next.tables.length}))} onRemoveLast={()=>changeTables(current=>removeLastTable(current.tables,current.orders),next=>({type:'tables',count:next.tables.length}))} onUpdate={(number,changes)=>changeTables(current=>updateTable(current.tables,number,changes),{type:'table',table:number})} onShowQr={number=>setDialog({type:'qr',table:number})}/>}
      {screen==='staff'&&<StaffView staff={session.staff} user={user} onSave={saveStaff}/>}
      {screen==='settings'&&<SettingsView settings={session.settings} activity={session.activity} menu={menu} onSave={changeSettings} onReset={resetDemo}/>}
    </main><nav className="mobile-nav" aria-label={t('ໜ້າຈໍ', 'หน้าจอ')}>{[['tables',LayoutGrid,t('ໜ້າຮ້ານ','หน้าร้าน')],['orders',ClipboardList,t('ອໍເດີ','ออเดอร์')],['kitchen',ChefHat,t('ຄົວ','ครัว')],['shift',Wallet,t('ກະ','กะ')]].filter(([id])=>allowed.includes(id)).map(([id,Icon,label])=><button key={id} className={tabScreen===id?'active':''} onClick={()=>go(id)}><Icon size={22}/><span>{label}</span></button>)}<button className={mobileTabs.includes(tabScreen)?'':'active'} onClick={()=>setDialog({type:'more'})}><MoreHorizontal size={22}/><span>{t('ເພີ່ມເຕີມ','เพิ่มเติม')}</span></button></nav></div>
    {toast&&<div className="toast" role="status" key={toast.id}><CheckCircle2 size={21}/><span className="toast-text">{toast.text}</span>{toast.undo&&<button className="toast-undo" onClick={()=>{const undo=toast.undo;setToast(null);undo();}}><Undo2 size={16}/>{t('ເອົາຄືນ','เอาคืน')}</button>}<button aria-label={t('ປິດ','ปิด')} onClick={()=>setToast(null)}><X size={17}/></button></div>}
    {dialog?.type==='more'&&<Dialog title={t('ເມນູເພີ່ມເຕີມ','เมนูเพิ่มเติม')} onClose={()=>setDialog(null)}><div className="more-menu">{['menu','table-setup','staff','reports','settings'].filter(id=>allowed.includes(id)).map(id=>{const Icon=viewIcons[id];return <button className="button secondary full" key={id} onClick={()=>{go(id);setDialog(null);}}><Icon size={22}/>{viewLabel(id,t)}<ChevronRight size={18}/></button>;})}{user.role!=='kitchen'&&<button className="button secondary full" onClick={()=>{go('customer');setDialog(null);}}><Smartphone size={22}/>{viewLabel('customer',t)}<ChevronRight size={18}/></button>}<button className="button secondary full" onClick={()=>setDialog({type:'help'})}><CircleHelp size={22}/>{t('ວິທີໃຊ້ງານ','วิธีใช้งาน')}<ChevronRight size={18}/></button><button className="button secondary full" onClick={()=>setDialog({type:'user'})}><ArrowLeftRight size={22}/>{t('ສະຫຼັບຜູ້ໃຊ້','สลับผู้ใช้')} · {user.name}<ChevronRight size={18}/></button></div></Dialog>}
    {dialog?.type==='user'&&<SwitchUserDialog staff={session.staff} currentId={user.id} onSignIn={signIn} onClose={()=>setDialog(null)}/>}
    {dialog?.type==='payment'&&<PaymentDialog order={dialog.order} methods={session.settings.methods} shiftOpen={Boolean(currentShift(session.shifts))} onClose={()=>setDialog(null)} onConfirm={(method,changeDue)=>{if(act(dialog.order.id,'pay',method,method==='cash'&&changeDue>0?t(` · ທອນ ${money(changeDue)} ₭`,` · ทอน ${money(changeDue)} ₭`):''))setDialog(null);}}/>}
    {dialog?.type==='qr'&&<QRDialog table={dialog.table} shopName={shopName} onClose={()=>setDialog(null)}/>}
    {dialog?.type==='help'&&<Dialog title={t('ເລີ່ມໃຊ້ງານໃນ 3 ຂັ້ນຕອນ','เริ่มใช้งานใน 3 ขั้นตอน')} onClose={()=>setDialog(null)}><ol className="help-list"><li><strong>{t('ເລືອກໂຕະ','เลือกโต๊ะ')}</strong><p>{t('ກົດໂຕະເພື່ອເບິ່ງອາຫານ ແລະ ຍອດຊຳລະ','กดโต๊ะเพื่อดูรายการอาหารและยอดชำระ')}</p></li><li><strong>{t('ກວດເງິນ ແລ້ວສົ່ງຄົວ','ตรวจเงิน แล้วส่งครัว')}</strong><p>{t('ຢືນຢັນຮັບເງິນ ອໍເດີຈະປາກົດຢູ່ໜ້າຄົວ','ยืนยันรับเงิน ออเดอร์จะแสดงในหน้าครัว')}</p></li><li><strong>{t('ເຮັດ ແລະ ເສີບ','ทำและเสิร์ฟ')}</strong><p>{t('ຄົວກົດພ້ອມເສີບ ແລ້ວພະນັກງານສົ່ງອາຫານ','ครัวกดพร้อมเสิร์ฟ แล้วพนักงานส่งอาหาร')}</p></li></ol><p className="demo-note">{t('ກົດຜິດ? ກົດ "ເອົາຄືນ" ໃນແຖບແຈ້ງເຕືອນໄດ້ພາຍໃນ 6 ວິນາທີ.','กดผิด? กด "เอาคืน" ในแถบแจ้งเตือนได้ภายใน 6 วินาที')}</p></Dialog>}
  </div></Locale.Provider>;
}

// Each table shows its most urgent order: payment first, then food that is ready to serve.
const statusPriority = ['pending', 'ready', 'cooking', 'queued', 'served'];
const tableState = orders => { const order = statusPriority.map(status => orders.find(o => o.status === status)).find(Boolean); return { order, status: order?.status ?? 'empty' }; };
// For the people at the counter, queued and cooking orders are both simply "in the kitchen".
const tableGroup = status => ['queued', 'cooking'].includes(status) ? 'kitchen' : status;
const needsAction = status => status === 'pending' || status === 'ready';
const tileIcons = { pending: Banknote, queued: Hourglass, cooking: CookingPot, ready: BellRing, served: Utensils, empty: Armchair };
function TablesScreen({ tables, activeOrders, calls, activeTable, filter, setFilter, now, onSelect }) {
  const { t } = useL();
  const states = tables.map(table => { const orders = activeOrders.filter(o => o.table === table.number); return { table, orders, call: calls[table.number], ...tableState(orders) }; });
  const filters = [['all', t('ທັງໝົດ', 'ทั้งหมด')], ['pending', t('ລໍຖ້າຮັບເງິນ', 'รอรับเงิน'), Banknote], ['kitchen', t('ຢູ່ໃນຄົວ', 'อยู่ในครัว'), CookingPot], ['ready', t('ພ້ອມເສີບ', 'พร้อมเสิร์ฟ'), BellRing], ['served', t('ເສີບແລ້ວ', 'เสิร์ฟแล้ว'), Utensils], ['empty', t('ຫວ່າງ', 'ว่าง'), Armchair]];
  const current = filters.some(([id]) => id === filter) ? filter : 'all';
  const count = id => id === 'all' ? states.length : states.filter(state => tableGroup(state.status) === id).length;
  const shown = states.filter(state => current === 'all' || tableGroup(state.status) === current);
  const zoneName = table => table.zone || t('ຊັ້ນ 1', 'ชั้น 1');
  const zones = [...new Set(tables.map(zoneName))];
  const waiting = states.filter(state => state.call || needsAction(state.status)).length;
  return <section className="table-workspace">
    <div className="page-heading"><div><h1>{t('ໂຕະອາຫານ', 'โต๊ะอาหาร')}</h1><p>{waiting ? t(`${waiting} ໂຕະລໍຖ້າທ່ານ · ກົດໂຕະເພື່ອເບິ່ງລາຍລະອຽດ`, `${waiting} โต๊ะรอคุณอยู่ · กดโต๊ะเพื่อดูรายละเอียด`) : t('ທຸກໂຕະຮຽບຮ້ອຍ · ກົດໂຕະເພື່ອເບິ່ງລາຍລະອຽດ', 'ทุกโต๊ะเรียบร้อย · กดโต๊ะเพื่อดูรายละเอียด')}</p></div></div>
    <div className="table-filters" role="group" aria-label={t('ສະແດງໂຕະຕາມສະຖານະ', 'แสดงโต๊ะตามสถานะ')}>{filters.map(([id, label, Icon]) => <button key={id} className={`filter-chip ${id} ${current === id ? 'selected' : ''}`} aria-pressed={current === id} onClick={() => setFilter(id)}>{Icon && <Icon size={16}/>}<span>{label}</span><b>{count(id)}</b></button>)}</div>
    {shown.length ? zones.map(zone => {
      const inZone = shown.filter(state => zoneName(state.table) === zone);
      return inZone.length > 0 && <div className="table-zone" key={zone}>
        {zones.length > 1 && <h2 className="zone-title">{zone}<span>{inZone.length}</span></h2>}
        <div className="table-grid">{inZone.map(state => <TableTile key={state.table.number} {...state} active={activeTable === state.table.number} now={now} onClick={() => onSelect(state.table.number)}/>)}</div>
      </div>;
    }) : <EmptyState icon={LayoutGrid} title={t('ບໍ່ມີໂຕະໃນສະຖານະນີ້', 'ไม่มีโต๊ะในสถานะนี้')} text={t('ລອງເລືອກສະຖານະອື່ນ', 'ลองเลือกสถานะอื่น')}><button className="button secondary" onClick={() => setFilter('all')}>{t('ເບິ່ງທຸກໂຕະ', 'ดูทุกโต๊ะ')}</button></EmptyState>}
  </section>;
}
function TableTile({ table, orders, order, status, call, active, now, onClick }) {
  const { t } = useL();
  const Icon = tileIcons[status];
  const minutes = order ? Math.max(0, Math.floor((now.getTime() - order.createdAt) / 60000)) : 0;
  const late = order && ['pending', 'queued', 'cooking'].includes(status) && minutes >= 15;
  const total = orders.reduce((sum, o) => sum + orderTotal(o.items), 0);
  const CallIcon = call && callIcons[call.reason];
  return <button className={`table-tile ${tableGroup(status)} ${active ? 'is-active' : ''} ${call ? 'has-call' : ''}`} onClick={onClick} aria-pressed={active} aria-label={`${t('ໂຕະ', 'โต๊ะ')} ${pad(table.number)} · ${statusText(status, t)}${call ? ` · ${callLabel(call.reason, t)}` : ''}${order ? ` · ${money(total)} ₭ · ${minutes} ${t('ນາທີ', 'นาที')}` : ''}`}>
    <span className="tile-head"><span className="tile-number">{pad(table.number)}</span>{orders.length > 1 && <span className="tile-orders">{orders.length} {t('ອໍເດີ', 'ออเดอร์')}</span>}{active ? <span className="selected-mark"><Check size={13}/></span> : needsAction(status) && !call && <span className="tile-alert"/>}</span>
    {call && <span className="tile-call"><CallIcon size={14}/>{callLabel(call.reason, t)}</span>}
    <span className="tile-state">{order && <Icon size={16}/>}{order ? statusText(status, t) : t('ຫວ່າງ', 'ว่าง')}</span>
    <span className="tile-meta">{order ? <><span>{money(total)} ₭</span><span className={late ? 'is-late' : ''}><Clock3 size={12}/>{minutes} {t('ນາທີ', 'นาที')}</span></> : <span><Users size={13}/>{table.seats} {t('ບ່ອນນັ່ງ', 'ที่นั่ง')}</span>}</span>
  </button>;
}
function OrderPanel({table,info,order,tableOrders,call,now,setSelected,onPay,onAct,onAdd,onQr,onAnswerCall}) {
  const {t,lang}=useL();
  const steps = [t('ຮັບເງິນ', 'รับเงิน'), t('ຄົວ', 'ครัว'), t('ເສີບ', 'เสิร์ฟ'), t('ປິດໂຕະ', 'ปิดโต๊ะ')];
  const stage = order ? { pending: 0, queued: 1, cooking: 1, ready: 2, served: 3 }[order.status] : -1;
  const StateIcon = order ? tileIcons[order.status] : null;
  const CallIcon = call && callIcons[call.reason];
  return <aside className="order-panel" aria-label={t('ລາຍລະອຽດໂຕະ','รายละเอียดโต๊ะ')}>
    <button className="order-panel-back" onClick={() => document.querySelector('.table-workspace')?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'start' })}><ArrowLeft size={18}/>{t('ເລືອກໂຕະອື່ນ', 'เลือกโต๊ะอื่น')}</button>
    <div className="order-panel-heading"><div><h2>{t('ໂຕະ','โต๊ะ')} {pad(table)}</h2><span>{info?.zone||t('ຊັ້ນ 1','ชั้น 1')}<i/> {info?.seats??'–'} {t('ບ່ອນນັ່ງ','ที่นั่ง')}</span></div><IconButton label={t('QR ໂຕະນີ້','QR โต๊ะนี้')} onClick={onQr}><QrCode size={22}/></IconButton></div>
    {call&&<div className="call-banner" role="status"><span className="call-banner-icon"><CallIcon size={20}/></span><span><strong>{callLabel(call.reason,t)}</strong><small>{Math.max(0,Math.floor((now.getTime()-call.at)/60000))} {t('ນາທີກ່ອນ','นาทีที่แล้ว')}</small></span><button className="button secondary" onClick={onAnswerCall}><Check size={18}/>{t('ຮັບຊາບ','รับทราบ')}</button></div>}
    {tableOrders.length>1&&<div className="order-tabs">{tableOrders.map(o=><button key={o.id} aria-pressed={o.id===order?.id} className={o.id===order?.id?'selected':''} onClick={()=>setSelected(o.id)}><strong>#{o.id}</strong><span>{statusText(o.status,t)}</span></button>)}</div>}
    {order?<>
      <div className={`order-state ${tableGroup(order.status)}`}><StateIcon size={22}/><div><strong>{statusText(order.status,t)}</strong><span>#{order.id} · {new Date(order.createdAt).toLocaleTimeString('en-GB',{timeZone:'Asia/Vientiane',hour:'2-digit',minute:'2-digit'})} · {order.source==='cashier'?t('ພະນັກງານຮັບອໍເດີ','พนักงานรับออเดอร์'):t('ສັ່ງຈາກ QR','สั่งจาก QR')}</span></div></div>
      <ol className="order-steps">{steps.map((label,index)=><li key={label} className={index<stage?'done':index===stage?'now':''} aria-current={index===stage?'step':undefined}><i/>{label}</li>)}</ol>
      <div className="receipt-items"><div className="receipt-label"><h3>{t('ລາຍການອາຫານ','รายการอาหาร')}</h3><span>{order.items.reduce((s,i)=>s+i.quantity,0)} {t('ລາຍການ','รายการ')}</span></div>{order.items.map((item,i)=><div className="receipt-item" key={i}><span className="quantity-box">{item.quantity}</span><div><strong>{itemName(item,lang)}</strong>{item.category!=='drinks'&&<small>{item.size==='large'?t('ພິເສດ','พิเศษ'):t('ທຳມະດາ','ธรรมดา')}</small>}{item.note&&<span className="item-note">{itemNote(item,lang)}</span>}</div><span>{money(item.price*item.quantity)}</span></div>)}<button className="add-food" onClick={onAdd}><Plus size={18}/>{t('ເພີ່ມອໍເດີ','เพิ่มออเดอร์')}</button></div>
      <div className="receipt-bottom"><div className="total"><span>{t('ລວມທັງໝົດ','รวมทั้งหมด')}</span><strong>{money(orderTotal(order.items))}<small> ₭</small></strong></div><div className="payment-method">{order.method==='transfer'?<CreditCard size={18}/>:<Banknote size={18}/>}<span>{order.method==='transfer'?t('ໂອນເງິນ','โอนเงิน'):t('ເງິນສົດ','เงินสด')}</span>{order.paid&&<span className="paid-mark"><CheckCircle2 size={15}/>{t('ຮັບເງິນແລ້ວ','รับเงินแล้ว')}</span>}</div>{order.status==='pending'?<button className="button primary full payment-cta" onClick={onPay}><Banknote size={21}/>{t('ຮັບເງິນ','รับเงิน')} · {money(orderTotal(order.items))} ₭<ArrowRight size={19}/></button>:order.status==='ready'?<button className="button primary full" onClick={()=>onAct(order.id,'serve')}><Check size={20}/>{t('ຢືນຢັນເສີບແລ້ວ','ยืนยันเสิร์ฟแล้ว')}</button>:order.status==='served'?<button className="button primary full" onClick={()=>onAct(order.id,'close')}><CheckCircle2 size={20}/>{tableOrders.length > 1 ? t('ປິດອໍເດີນີ້','ปิดออเดอร์นี้') : t('ປິດໂຕະ','ปิดโต๊ะ')}</button>:<div className="kitchen-sent"><ChefHat size={20}/>{t('ສົ່ງຄົວແລ້ວ · ລໍຖ້າອາຫານ','ส่งครัวแล้ว · รออาหาร')}</div>}</div>
    </>:<div className="empty-table"><span className="empty-icon"><Armchair size={42} strokeWidth={1.4}/></span><h3>{t('ພ້ອມຮັບລູກຄ້າ','พร้อมรับลูกค้า')}</h3><p>{t('ລູກຄ້າສະແກນ QR ເພື່ອສັ່ງອາຫານ ຫຼື ເພີ່ມອໍເດີໃຫ້ລູກຄ້າໄດ້ເລີຍ','ลูกค้าสแกน QR เพื่อสั่งอาหาร หรือเพิ่มออเดอร์ให้ลูกค้าได้เลย')}</p><button className="button primary full" onClick={onAdd}><Plus size={20}/>{t('ເພີ່ມອໍເດີ','เพิ่มออเดอร์')}</button><button className="button secondary full" onClick={onQr}><QrCode size={20}/>{t('ເບິ່ງ QR ໂຕະນີ້','ดู QR โต๊ะนี้')}</button></div>}
  </aside>;
}

// One screen, one confirm: pick how the guest paid, and for cash see the change straight away.
function PaymentDialog({order,methods,shiftOpen,onClose,onConfirm}) {
  const {t}=useL();
  const total=orderTotal(order.items);
  const [method,setMethod]=useState(methods.includes(order.method)?order.method:methods[0]);
  const [received,setReceived]=useState('');
  const cash=received===''?total:Number(received);
  const changeDue=cash-total;
  const short=method==='cash'&&(!Number.isInteger(cash)||changeDue<0);
  return <Dialog title={`${t('ຮັບເງິນ','รับเงิน')} · ${t('ໂຕະ','โต๊ะ')} ${pad(order.table)}`} onClose={onClose} className="payment-dialog">
    <p className="payment-order-context">#{order.id} · {order.items.reduce((sum,item)=>sum+item.quantity,0)} {t('ລາຍການ','รายการ')}</p>
    <div className="payment-amount"><span>{t('ຍອດທີ່ຕ້ອງຮັບ','ยอดที่ต้องรับ')}</span><strong>{money(total)}<small> ₭</small></strong></div>
    {!shiftOpen&&<p className="payment-shift-note">{t('ຍັງບໍ່ໄດ້ເປີດກະ · ຍອດນີ້ຈະບໍ່ນັບເຂົ້າກະໃດ','ยังไม่ได้เปิดกะ · ยอดนี้จะไม่นับเข้ากะใด')}</p>}
    <div className="payment-options">{[['transfer',CreditCard,t('ໂອນເງິນ','โอนเงิน')],['cash',Banknote,t('ເງິນສົດ','เงินสด')]].filter(([id])=>methods.includes(id)).map(([id,Icon,label])=><button key={id} className={method===id?'selected':''} aria-pressed={method===id} onClick={()=>setMethod(id)}><Icon size={24}/>{label}{method===id&&<Check size={18}/>}</button>)}</div>
    {method==='cash'?<div className="cash-box">
      <label className="form-field"><span>{t('ຮັບເງິນມາ','รับเงินมา')}</span><span className="amount-input"><input type="number" inputMode="numeric" min="0" step="1000" value={received} placeholder={money(total)} onChange={event=>setReceived(event.target.value)}/><b>₭</b></span></label>
      <div className="quick-amounts" role="group" aria-label={t('ຈຳນວນເງິນດ່ວນ','จำนวนเงินด่วน')}>{cashSuggestions(total).map((amount,index)=><button type="button" key={amount} className={cash===amount?'selected':''} aria-pressed={cash===amount} onClick={()=>setReceived(String(amount))}>{index===0?t('ພໍດີ','พอดี'):money(amount)}</button>)}</div>
      <div className={`cash-change ${short?'is-short':''}`} aria-live="polite"><span>{short?t('ເງິນຍັງບໍ່ພໍ','เงินยังไม่พอ'):t('ເງິນທອນ','เงินทอน')}</span><strong>{money(Math.abs(Number.isInteger(cash)?changeDue:0))} <small>₭</small></strong></div>
    </div>:<p className="transfer-hint"><CheckCircle2 size={18}/>{t('ເປີດແອັບທະນາຄານ ກວດວ່າເງິນເຂົ້າຄົບແລ້ວ ຈຶ່ງກົດຢືນຢັນ','เปิดแอปธนาคาร ตรวจว่าเงินเข้าครบแล้ว จึงกดยืนยัน')}</p>}
    <button className="button primary full" disabled={short} onClick={()=>onConfirm(method,method==='cash'?changeDue:0)}><CheckCircle2 size={20}/>{method==='cash'?t('ໄດ້ຮັບເງິນແລ້ວ · ສົ່ງຄົວ','ได้รับเงินแล้ว · ส่งครัว'):t('ເງິນເຂົ້າແລ້ວ · ສົ່ງຄົວ','เงินเข้าแล้ว · ส่งครัว')}</button>
    <p className="demo-note">{t('ການທົດລອງ UI · ບໍ່ໄດ້ເຊື່ອມທະນາຄານ','ทดลอง UI · ยังไม่เชื่อมต่อธนาคาร')}</p>
  </Dialog>;
}
function QRDialog({table,shopName,onClose}) {
 const {t}=useL();const {menuUrl,image,error,localNetwork}=useMenuQr(table);
 return <Dialog title={`${t('QR ສັ່ງອາຫານ','QR สั่งอาหาร')} · ${t('ໂຕະ','โต๊ะ')} ${pad(table)}`} onClose={onClose} className="qr-dialog"><div className="qr-print"><Soup size={32}/><h3>{shopName}</h3><p>{t('ສະແກນ ສັ່ງ ລໍຖ້າຄວາມແຊບ','สแกน สั่ง รอความอร่อย')}</p>{image?<img width="240" height="240" src={image} alt={t('QR ສຳລັບສັ່ງອາຫານ','QR สำหรับสั่งอาหาร')}/>:<div className="qr-loading">{error?t('ສ້າງ QR ບໍ່ສຳເລັດ · ໃຊ້ລິ້ງດ້ານລຸ່ມ','สร้าง QR ไม่สำเร็จ · ใช้ลิงก์ด้านล่าง'):t('ກຳລັງສ້າງ QR…','กำลังสร้าง QR…')}</div>}<strong>{t('ໂຕະ','โต๊ะ')} {pad(table)}</strong></div>{localNetwork&&<p className="qr-network-hint">{t('ໂທລະສັບ ແລະ ຄອມຕ້ອງໃຊ້ Wi-Fi ດຽວກັນ ແລະ ເປີດແອັບໃນຄອມໄວ້','มือถือและคอมต้องใช้ Wi-Fi เดียวกัน และเปิดแอปบนคอมไว้')}</p>}<a className="button primary full" href={menuUrl} onClick={onClose}><Smartphone size={20}/>{t('ເປີດເມນູໂຕະນີ້','เปิดเมนูโต๊ะนี้')}</a><a className="qr-menu-address" href={menuUrl}>{menuUrl}</a><p className="demo-note">{t('ລິ້ງຕົ້ນແບບ · ອໍເດີຍັງບໍ່ຊິງຂ້າມອຸປະກອນ','ลิงก์ต้นแบบ · ออเดอร์ยังไม่ซิงก์ข้ามอุปกรณ์')}</p></Dialog>;
}

const orderIcons = { ...tileIcons, completed: CheckCircle2 };
const orderTime = time => new Date(time).toLocaleTimeString('en-GB', { timeZone: 'Asia/Vientiane', hour: '2-digit', minute: '2-digit' });
// The one thing staff do next for an order; kitchen and finished orders have none here.
function NextAction({ order, onPay, onAct }) {
  const { t } = useL();
  if (order.status === 'pending') return <button className="button primary order-action" onClick={() => onPay(order)}><Banknote size={18}/>{t('ຮັບເງິນ', 'รับเงิน')}</button>;
  if (order.status === 'ready') return <button className="button primary order-action" onClick={() => onAct(order.id, 'serve')}><Check size={18}/>{t('ເສີບແລ້ວ', 'เสิร์ฟแล้ว')}</button>;
  if (order.status === 'served') return <button className="button secondary order-action" onClick={() => onAct(order.id, 'close')}><CheckCircle2 size={18}/>{t('ປິດອໍເດີ', 'ปิดออเดอร์')}</button>;
  return null;
}
function OrdersView({ orders, filter, setFilter, now, onPay, onAct, onGoTable }) {
  const { t, lang } = useL();
  const [query, setQuery] = useState('');
  const [openId, setOpenId] = useState(null);
  const [showAllDone, setShowAllDone] = useState(false);
  const filters = [['all', t('ທັງໝົດ', 'ทั้งหมด')], ['pending', t('ລໍຖ້າຮັບເງິນ', 'รอรับเงิน'), Banknote], ['kitchen', t('ຢູ່ໃນຄົວ', 'อยู่ในครัว'), CookingPot], ['ready', t('ພ້ອມເສີບ', 'พร้อมเสิร์ฟ'), BellRing], ['served', t('ເສີບແລ້ວ', 'เสิร์ฟแล้ว'), Utensils], ['completed', t('ສຳເລັດ', 'เสร็จสิ้น'), CheckCircle2]];
  const current = filters.some(([id]) => id === filter) ? filter : 'all';
  const count = id => id === 'all' ? orders.length : orders.filter(order => tableGroup(order.status) === id).length;
  const search = query.trim().replace(/^#/, '');
  const matches = orders.filter(order => (current === 'all' || tableGroup(order.status) === current) && (!search || order.id.includes(search) || pad(order.table).includes(search.padStart(2, '0'))));
  // Waiting orders go oldest first; finished ones newest first.
  const sorted = list => [...list].sort((a, b) => a.status === 'completed' ? b.createdAt - a.createdAt : a.createdAt - b.createdAt);
  const sections = current === 'all' && !search ? [
    ['action', t('ຕ້ອງເຮັດຕອນນີ້', 'ต้องทำตอนนี้'), ['pending', 'ready']],
    ['kitchen', t('ຢູ່ໃນຄົວ', 'อยู่ในครัว'), ['queued', 'cooking']],
    ['served', t('ເສີບແລ້ວ · ລໍປິດອໍເດີ', 'เสิร์ฟแล้ว · รอปิดออเดอร์'), ['served']],
    ['completed', t('ສຳເລັດແລ້ວ', 'เสร็จสิ้นแล้ว'), ['completed']],
  ].map(([id, title, statuses]) => [id, title, sorted(matches.filter(order => statuses.includes(order.status)))]).filter(([, , list]) => list.length) : [['list', null, sorted(matches)]];
  const waiting = orders.filter(order => needsAction(order.status)).length;
  const opened = orders.find(order => order.id === openId);
  const card = order => {
    const group = tableGroup(order.status);
    const Icon = orderIcons[order.status];
    const minutes = Math.max(0, Math.floor((now.getTime() - order.createdAt) / 60000));
    const late = ['pending', 'queued', 'cooking'].includes(order.status) && minutes >= 15;
    return <article className={`order-card ${group}`} key={order.id}>
      <button className="order-card-main" onClick={() => setOpenId(order.id)} aria-label={`${t('ເບິ່ງອໍເດີ', 'ดูออเดอร์')} #${order.id} · ${t('ໂຕະ', 'โต๊ะ')} ${pad(order.table)}`}>
        <span className="order-card-table"><small>{t('ໂຕະ', 'โต๊ะ')}</small>{pad(order.table)}</span>
        <span className="order-card-body">
          <span className="order-card-title"><strong>#{order.id}</strong><span>{orderTime(order.createdAt)} · {order.source === 'cashier' ? t('ພະນັກງານຮັບ', 'พนักงานรับ') : t('ສັ່ງຈາກ QR', 'สั่งจาก QR')}</span></span>
          <span className="order-card-items">{order.items.map(item => `${itemName(item, lang)} ×${item.quantity}`).join(' · ')}</span>
          <span className="order-card-state"><span className="state-pill"><Icon size={15}/>{statusText(order.status, t)}</span>{order.status !== 'completed' && <span className={`order-card-wait ${late ? 'is-late' : ''}`}><Clock3 size={13}/>{minutes} {t('ນາທີ', 'นาที')}</span>}</span>
        </span>
      </button>
      <div className="order-card-side"><strong>{money(orderTotal(order.items))} <small>₭</small></strong><NextAction order={order} onPay={onPay} onAct={onAct}/></div>
    </article>;
  };
  return <section className="full-page orders-page">
    <div className="page-heading"><div><h1>{t('ອໍເດີທັງໝົດ', 'ออเดอร์ทั้งหมด')}</h1><p>{waiting ? t(`${waiting} ອໍເດີຕ້ອງເຮັດຕອນນີ້ · ກົດອໍເດີເພື່ອເບິ່ງລາຍລະອຽດ`, `${waiting} ออเดอร์ต้องทำตอนนี้ · กดออเดอร์เพื่อดูรายละเอียด`) : t('ບໍ່ມີອໍເດີຄ້າງ · ກົດອໍເດີເພື່ອເບິ່ງລາຍລະອຽດ', 'ไม่มีออเดอร์ค้าง · กดออเดอร์เพื่อดูรายละเอียด')}</p></div></div>
    <div className="orders-toolbar">
      <div className="table-filters" role="group" aria-label={t('ສະແດງອໍເດີຕາມສະຖານະ', 'แสดงออเดอร์ตามสถานะ')}>{filters.map(([id, label, Icon]) => <button key={id} className={`filter-chip ${id} ${current === id ? 'selected' : ''}`} aria-pressed={current === id} onClick={() => setFilter(id)}>{Icon && <Icon size={16}/>}<span>{label}</span><b>{count(id)}</b></button>)}</div>
      <label className="search-field"><Search size={19}/><input type="search" aria-label={t('ຄົ້ນຫາເລກໂຕະ ຫຼື ອໍເດີ', 'ค้นหาเลขโต๊ะหรือออเดอร์')} placeholder={t('ເລກໂຕະ ຫຼື ອໍເດີ…', 'เลขโต๊ะหรือออเดอร์…')} value={query} onChange={event => setQuery(event.target.value)}/></label>
    </div>
    {matches.length ? sections.map(([id, title, list]) => {
      const limited = id === 'completed' && !showAllDone ? list.slice(0, 4) : list;
      return <section className={`order-section ${id}`} key={id}>
        {title && <h2 className="order-section-title">{title}<span>{list.length}</span></h2>}
        <div className="order-cards">{limited.map(card)}</div>
        {limited.length < list.length && <button className="button secondary full show-more" onClick={() => setShowAllDone(true)}>{t('ເບິ່ງອໍເດີທີ່ສຳເລັດທັງໝົດ', 'ดูออเดอร์ที่เสร็จสิ้นทั้งหมด')} ({list.length})</button>}
      </section>;
    }) : <EmptyState icon={ClipboardList} title={t('ບໍ່ພົບອໍເດີ', 'ไม่พบออเดอร์')} text={search ? t('ລອງຄົ້ນຫາເລກໂຕະ ຫຼື ເລກອໍເດີອື່ນ', 'ลองค้นหาเลขโต๊ะหรือเลขออเดอร์อื่น') : t('ຍັງບໍ່ມີອໍເດີໃນສະຖານະນີ້', 'ยังไม่มีออเดอร์ในสถานะนี้')}>{(search || current !== 'all') && <button className="button secondary" onClick={() => { setQuery(''); setFilter('all'); }}>{t('ເບິ່ງທຸກອໍເດີ', 'ดูทุกออเดอร์')}</button>}</EmptyState>}
    {opened && <OrderDialog order={opened} onClose={() => setOpenId(null)} onPay={order => { setOpenId(null); onPay(order); }} onAct={onAct} onGoTable={order => { setOpenId(null); onGoTable(order); }}/>}
  </section>;
}
function OrderDialog({ order, onClose, onPay, onAct, onGoTable }) {
  const { t, lang } = useL();
  const steps = [t('ຮັບເງິນ', 'รับเงิน'), t('ຄົວ', 'ครัว'), t('ເສີບ', 'เสิร์ฟ'), t('ປິດ', 'ปิด')];
  const stage = { pending: 0, queued: 1, cooking: 1, ready: 2, served: 3, completed: 4 }[order.status];
  const Icon = orderIcons[order.status];
  return <Dialog title={`${t('ໂຕະ', 'โต๊ะ')} ${pad(order.table)} · #${order.id}`} onClose={onClose} className="order-dialog">
    <div className={`order-state ${tableGroup(order.status)}`}><Icon size={22}/><div><strong>{statusText(order.status, t)}</strong><span>{orderTime(order.createdAt)} · {order.source === 'cashier' ? t('ພະນັກງານຮັບອໍເດີ', 'พนักงานรับออเดอร์') : t('ສັ່ງຈາກ QR', 'สั่งจาก QR')}</span></div></div>
    <ol className="order-steps">{steps.map((label, index) => <li key={label} className={index < stage ? 'done' : index === stage ? 'now' : ''} aria-current={index === stage ? 'step' : undefined}><i/>{label}</li>)}</ol>
    <div className="order-dialog-items">{order.items.map((item, index) => <div className="receipt-item" key={index}><span className="quantity-box">{item.quantity}</span><div><strong>{itemName(item, lang)}</strong>{item.category !== 'drinks' && <small>{item.size === 'large' ? t('ພິເສດ', 'พิเศษ') : t('ທຳມະດາ', 'ธรรมดา')}</small>}{item.note && <span className="item-note">{itemNote(item, lang)}</span>}</div><span>{money(item.price * item.quantity)}</span></div>)}</div>
    <div className="total"><span>{t('ລວມທັງໝົດ', 'รวมทั้งหมด')}</span><strong>{money(orderTotal(order.items))}<small> ₭</small></strong></div>
    <div className="payment-method">{order.method === 'transfer' ? <CreditCard size={18}/> : <Banknote size={18}/>}<span>{order.method === 'transfer' ? t('ໂອນເງິນ', 'โอนเงิน') : t('ເງິນສົດ', 'เงินสด')}</span>{order.paid && <span className="paid-mark"><CheckCircle2 size={15}/>{t('ຮັບເງິນແລ້ວ', 'รับเงินแล้ว')}</span>}</div>
    <div className="order-dialog-actions"><NextAction order={order} onPay={onPay} onAct={onAct}/>{order.status !== 'completed' && <button className="button secondary" onClick={() => onGoTable(order)}><LayoutGrid size={18}/>{t('ເບິ່ງໂຕະນີ້', 'ดูโต๊ะนี้')}</button>}</div>
  </Dialog>;
}
function Reports({orders,now}) {
 const {t,lang}=useL();const [range,setRange]=useState('today');
 const ranges=[['today',t('ມື້ນີ້','วันนี้')],['week',t('7 ມື້','7 วัน')],['all',t('ທັງໝົດ','ทั้งหมด')]];
 const paid=paidInRange(orders,range,now.getTime());const total=paid.reduce((s,o)=>s+orderTotal(o.items),0);
 const sales=Object.values(paid.flatMap(o=>o.items).reduce((map,i)=>{map[i.id]||={...i,quantity:0,amount:0};map[i.id].quantity+=i.quantity;map[i.id].amount+=i.price*i.quantity;return map;},{})).sort((a,b)=>b.quantity-a.quantity);
 return <section className="full-page reports-page"><div className="page-heading"><div><h1>{t('ສະຫຼຸບຍອດຂາຍ','สรุปยอดขาย')}</h1><p>{t('ຄິດຈາກອໍເດີທີ່ຢືນຢັນຮັບເງິນແລ້ວ · ເວລາວຽງຈັນ','คำนวณจากออเดอร์ที่ยืนยันรับเงินแล้ว · เวลาเวียงจันทน์')}</p></div><div className="segment" role="group" aria-label={t('ຊ່ວງເວລາ','ช่วงเวลา')}>{ranges.map(([id,label])=><button key={id} className={range===id?'selected':''} aria-pressed={range===id} onClick={()=>setRange(id)}>{label}</button>)}</div></div><div className="sales-overview"><div className="sales-main"><span>{t('ຍອດຮັບເງິນ','ยอดรับเงิน')} · {ranges.find(([id])=>id===range)[1]}</span><strong>{money(total)} <small>₭</small></strong><p><CheckCircle2 size={17}/>{paid.length} {t('ອໍເດີ ຮັບເງິນແລ້ວ','ออเดอร์ รับเงินแล้ว')}</p></div><div className="sales-methods">{[['cash',Banknote,t('ເງິນສົດ','เงินสด')],['transfer',CreditCard,t('ໂອນເງິນ','โอนเงิน')]].map(([method,Icon,label])=><div key={method}><Icon size={23}/><span>{label}<strong>{money(paid.filter(o=>o.method===method).reduce((s,o)=>s+orderTotal(o.items),0))} ₭</strong></span><small>{paid.filter(o=>o.method===method).length} {t('ອໍເດີ','ออเดอร์')}</small></div>)}</div></div><section className="sales-breakdown"><h2>{t('ລາຍການທີ່ຂາຍໄດ້','รายการที่ขายได้')}</h2><p>{t('ລວມຈາກອໍເດີທີ່ຮັບເງິນແລ້ວ','รวมจากออเดอร์ที่รับเงินแล้ว')}</p>{sales.length?<div className="sales-table"><div className="sales-table-head"><span>{t('ເມນູ','เมนู')}</span><span>{t('ຈຳນວນ','จำนวน')}</span><span>{t('ຍອດຂາຍ','ยอดขาย')}</span></div>{sales.map(item=><div className="sales-table-row" key={item.id}><span><img width="50" height="50" src={item.image} alt=""/>{itemName(item,lang)}</span><span>{item.quantity}</span><strong>{money(item.amount)} ₭</strong></div>)}</div>:<EmptyState icon={BarChart3} title={t('ຍັງບໍ່ມີຍອດຂາຍ','ยังไม่มียอดขาย')} text={t('ລອງເລືອກຊ່ວງເວລາອື່ນ','ลองเลือกช่วงเวลาอื่น')}/>}</section></section>;
}
