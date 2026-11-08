import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Banknote, BellRing, Check, CheckCircle2, ChefHat, ChevronRight, ClipboardList, CreditCard, Eye, EyeOff, Flame, History, LockKeyhole, LogIn, Minus, Pencil, Plus, Printer, QrCode, Settings, Store, Undo2, UserCog, Users, Utensils, Wallet } from 'lucide-react';
import { Dialog, EmptyState, IconButton, PageHeader, RoleChip, clockTime, initial, itemName, methodText, money, pad, roleText, shortDate, useL, viewIcons, viewLabel } from './staff-ui';
import { canEditStaffMember, canOpen, canSignInStaff, currentShift, maxTables, paymentMethods, roles, shiftTotals } from './backoffice-model.mjs';
import { isActiveOrder } from './order-model.mjs';
import { useMenuQrs } from './use-menu-qr';
import './backoffice-refinements.css';

const signed = amount => `${amount > 0 ? '+' : amount < 0 ? '−' : ''}${money(Math.abs(amount))}`;
const differenceTone = amount => amount > 0 ? 'is-over' : amount < 0 ? 'is-short' : 'is-even';
const kip = amount => `${money(amount)} ₭`;

function differenceLabel(amount, t) {
  if (amount > 0) return t('ເງິນເກີນ', 'เงินเกิน');
  if (amount < 0) return t('ເງິນຂາດ', 'เงินขาด');
  return t('ຄົບພໍດີ', 'ครบพอดี');
}

function duration(ms, t) {
  const minutes = Math.max(0, Math.floor(ms / 60000));
  const hours = Math.floor(minutes / 60);
  return hours ? t(`${hours} ຊົ່ວໂມງ ${minutes % 60} ນາທີ`, `${hours} ชั่วโมง ${minutes % 60} นาที`) : t(`${minutes} ນາທີ`, `${minutes} นาที`);
}

function dayLabel(time, t) {
  const day = shortDate(time);
  if (day === shortDate(Date.now())) return t('ມື້ນີ້', 'วันนี้');
  if (day === shortDate(Date.now() - 86400000)) return t('ມື້ວານ', 'เมื่อวาน');
  return day;
}

// Reads a whole-kip amount typed into a number field; anything else is null.
const parseAmount = value => value.trim() !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;

function Avatar({ member }) { return <span className={`avatar role-${member.role}`}>{initial(member.name)}</span>; }

export function ShiftView({ shifts, orders, payments, user, onOpen, onClose }) {
  const { t } = useL();
  const shift = currentShift(shifts);
  const [amount, setAmount] = useState('');
  const [openingShift, setOpeningShift] = useState(false);
  const [openError, setOpenError] = useState('');
  const [closingShiftId, setClosingShiftId] = useState(null);
  // Count up to this render rather than the half-minute clock, so a payment just taken shows at once.
  const totals = shift && shiftTotals(shift, orders, Date.now(), payments);
  const ownOnly = user.role === 'cashier';
  const history = shifts.filter(item => item.closedAt && (!ownOnly || item.openedBy === user.id));
  const opening = parseAmount(amount);
  async function open(event) {
    event.preventDefault();
    if (openingShift || opening === null) return;
    setOpeningShift(true);
    setOpenError('');
    try {
      if (await onOpen(opening)) setAmount('');
      else setOpenError(t('ເປີດກະບໍ່ສຳເລັດ · ກະລຸນາລອງໃໝ່', 'เปิดกะไม่สำเร็จ · กรุณาลองใหม่'));
    } catch { setOpenError(t('ເປີດກະບໍ່ສຳເລັດ · ກະລຸນາລອງໃໝ່', 'เปิดกะไม่สำเร็จ · กรุณาลองใหม่')); }
    finally { setOpeningShift(false); }
  }
  return <section className="full-page bo-page">
    <PageHeader icon={Wallet} title={t('ກະ & ເງິນສົດ', 'กะ & เงินสด')} text={t('ເປີດກະດ້ວຍເງິນທອນຕັ້ງຕົ້ນ ແລ້ວນັບເງິນໃນລິ້ນຊັກຕອນປິດກະ', 'เปิดกะด้วยเงินทอนตั้งต้น แล้วนับเงินในลิ้นชักตอนปิดกะ')}/>
    {shift ? <section className="bo-card shift-current">
      <div className="shift-status">
        <h2><span className="shift-open-dot" aria-hidden="true"/>{t('ກະເປີດຢູ່', 'กะเปิดอยู่')}</h2>
        <p>{t('ເປີດໂດຍ', 'เปิดโดย')} {shift.openedByName} · {clockTime(shift.openedAt)} · {duration(Date.now() - shift.openedAt, t)}</p>
      </div>
      <div className="shift-drawer">
        <div><span>{t('ເງິນສົດທີ່ຄວນມີໃນລິ້ນຊັກ', 'เงินสดที่ควรมีในลิ้นชัก')}</span><strong>{kip(totals.expectedCash)}</strong></div>
        <button className="button primary" onClick={() => setClosingShiftId(shift.id)}><Wallet size={20}/>{t('ປິດກະ ແລະ ນັບເງິນ', 'ปิดกะและนับเงิน')}</button>
      </div>
      <dl className="shift-cash-breakdown">
        <div><dt>{t('ເງິນຕັ້ງຕົ້ນ', 'เงินตั้งต้น')}</dt><dd>{kip(shift.openingCash)}</dd></div>
        <div><dt>{t('ຮັບເງິນສົດ', 'รับเงินสด')}</dt><dd>{kip(totals.cash)}</dd></div>
        <div><dt>{t('ຮັບໂອນ', 'รับโอน')}</dt><dd>{kip(totals.transfer)}<small>{t('ບໍ່ຢູ່ໃນລິ້ນຊັກ', 'ไม่อยู่ในลิ้นชัก')}</small></dd></div>
      </dl>
      <p className="shift-paid-count">{totals.orderCount} {t('ອໍເດີທີ່ຮັບເງິນ', 'ออเดอร์ที่รับเงิน')}</p>
    </section> : <form className="bo-card shift-start" onSubmit={open} aria-busy={openingShift}>
      <div className="shift-start-copy">
        <span className="bo-icon is-large"><Wallet size={30}/></span>
        <h2>{t('ເລີ່ມກະໃໝ່', 'เริ่มกะใหม่')}</h2>
        <p>{t('ນັບເງິນທອນທີ່ມີໃນລິ້ນຊັກກ່ອນເລີ່ມຂາຍ ແລ້ວໃສ່ຈຳນວນນີ້', 'นับเงินทอนในลิ้นชักก่อนเริ่มขาย แล้วใส่จำนวนนี้')}</p>
      </div>
      <div className="shift-start-form">
        <label className="form-field"><span>{t('ເງິນຕັ້ງຕົ້ນ', 'เงินตั้งต้น')}</span><span className="amount-input"><input type="number" inputMode="numeric" min="0" step="1" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0"/><b>₭</b></span></label>
        <div className="quick-amounts" role="group" aria-label={t('ຈຳນວນທີ່ໃຊ້ເລື້ອຍ', 'จำนวนที่ใช้บ่อย')}>{[200000, 500000, 1000000].map(value => <button type="button" key={value} className={amount === String(value) ? 'selected' : ''} aria-pressed={amount === String(value)} onClick={() => setAmount(String(value))}>{money(value)}</button>)}</div>
        {openError && <p className="form-error" role="alert">{openError}</p>}
        <button className="button primary full" disabled={openingShift || opening === null}><Wallet size={20}/>{openingShift ? t('ກຳລັງເປີດກະ…', 'กำลังเปิดกะ…') : t('ເປີດກະ', 'เปิดกะ')}</button>
      </div>
    </form>}
    <section className="bo-card">
      <div className="bo-card-head"><div><h2>{ownOnly ? t('ກະຂອງທ່ານ', 'กะของคุณ') : t('ປະຫວັດກະ', 'ประวัติกะ')}</h2><p>{t('ຍອດຂອງກະທີ່ປິດແລ້ວຈະບໍ່ປ່ຽນແປງ', 'ยอดของกะที่ปิดแล้วจะไม่เปลี่ยนแปลง')}</p></div></div>
      {history.length ? <div className="shift-history">{history.map(item => <article className="shift-record" key={item.id}>
        <div className="shift-when"><b>{dayLabel(item.openedAt, t)}</b><span>{clockTime(item.openedAt)}–{clockTime(item.closedAt)}</span></div>
        <div className="shift-who"><span>{item.openedByName}</span>{item.closedByName !== item.openedByName && <small>{t('ປິດໂດຍ', 'ปิดโดย')} {item.closedByName}</small>}</div>
        <div className="shift-figure"><small>{t('ຄວນມີ', 'ควรมี')}</small><span>{kip(item.expectedCash)}</span></div>
        <div className="shift-figure"><small>{t('ນັບໄດ້', 'นับได้')}</small><span>{kip(item.countedCash)}</span></div>
        <span className={`difference-pill ${differenceTone(item.difference)}`}>{differenceLabel(item.difference, t)} {item.difference !== 0 && `${signed(item.difference)} ₭`}</span>
      </article>)}</div> : <EmptyState icon={History} title={t('ຍັງບໍ່ມີກະທີ່ປິດແລ້ວ', 'ยังไม่มีกะที่ปิดแล้ว')} text={t('ເມື່ອປິດກະ ຍອດເງິນ ແລະ ສ່ວນຕ່າງຈະຖືກບັນທຶກໄວ້ທີ່ນີ້', 'เมื่อปิดกะ ยอดเงินและส่วนต่างจะถูกบันทึกไว้ที่นี่')}/>}
    </section>
    {shift && shift.id === closingShiftId && <CloseShiftDialog expected={totals.expectedCash} onClose={() => setClosingShiftId(null)} onConfirm={async counted => {
      if (await onClose(counted, closingShiftId, totals.expectedCash)) {
        setClosingShiftId(current => current === closingShiftId ? null : current);
      }
    }}/>}
  </section>;
}

function CloseShiftDialog({ expected, onClose, onConfirm }) {
  const { t } = useL();
  const [count, setCount] = useState({ expected, text: '' });
  const [saving, setSaving] = useState(false);
  const counted = count.expected === expected ? count.text : '';
  // Cash that arrives while the dialog is open calls for a fresh count.
  if (count.expected !== expected) setCount({ expected, text: '' });
  const value = parseAmount(counted);
  const difference = value === null ? 0 : value - expected;
  async function confirm(event) {
    event.preventDefault();
    if (saving || value === null) return;
    setSaving(true);
    try { await onConfirm(value); } finally { setSaving(false); }
  }
  return <Dialog title={t('ປິດກະ', 'ปิดกะ')} onClose={() => { if (!saving) onClose(); }} className="form-dialog">
    <form className="form-stack" onSubmit={confirm} aria-busy={saving}>
      <div className="payment-amount"><span>{t('ເງິນສົດທີ່ຄວນມີໃນລິ້ນຊັກ', 'เงินสดที่ควรมีในลิ้นชัก')}</span><strong>{money(expected)}<small> ₭</small></strong></div>
      <label className="form-field"><span>{t('ເງິນສົດທີ່ນັບໄດ້', 'เงินสดที่นับได้')}</span><span className="amount-input"><input data-autofocus type="number" inputMode="numeric" min="0" step="1" value={counted} onChange={event => setCount({ expected, text: event.target.value })} placeholder="0" readOnly={saving}/><b>₭</b></span></label>
      {value !== null && <p className={`shift-difference ${differenceTone(difference)}`} role="status">{differenceLabel(difference, t)} · {signed(difference)} ₭</p>}
      <button className="button primary full" disabled={saving || value === null}><CheckCircle2 size={20}/>{saving ? t('ກຳລັງປິດກະ…', 'กำลังปิดกะ…') : t('ຢືນຢັນປິດກະ', 'ยืนยันปิดกะ')}</button>
    </form>
  </Dialog>;
}

export function TableSetupView({ tables, orders, shopName, onAdd, onRemoveLast, onUpdate, onShowQr }) {
  const { t } = useL();
  const [printing, setPrinting] = useState(false);
  const [editing, setEditing] = useState(null);
  const [removing, setRemoving] = useState(false);
  const busy = number => orders.some(order => order.table === number && isActiveOrder(order));
  const last = tables[tables.length - 1];
  const zoneName = table => table.zone || t('ຊັ້ນ 1', 'ชั้น 1');
  const tablesByZone = new Map();
  for (const table of tables) {
    const zone = zoneName(table);
    if (!tablesByZone.has(zone)) tablesByZone.set(zone, []);
    tablesByZone.get(zone).push(table);
  }
  const zones = [...tablesByZone.keys()];
  const busyCount = tables.filter(table => busy(table.number)).length;
  async function removeLast() {
    if (removing || tables.length <= 1 || Boolean(last && busy(last.number))) return;
    setRemoving(true);
    try { await onRemoveLast(last.number); } finally { setRemoving(false); }
  }
  return <section className="full-page bo-page bo-tables-page">
    <PageHeader icon={QrCode} title={t('ໂຕະ & QR', 'โต๊ะ & QR')} text={t('ກຳນົດໂຕະ ໂຊນ ແລະ ບ່ອນນັ່ງ ແລ້ວພິມ QR ໄປວາງທຸກໂຕະ', 'กำหนดโต๊ะ โซน และที่นั่ง แล้วพิมพ์ QR ไปวางทุกโต๊ะ')}>
      <button className="button secondary" onClick={() => setPrinting(true)} disabled={!tables.length}><Printer size={19}/>{t('ພິມ QR ທຸກໂຕະ', 'พิมพ์ QR ทุกโต๊ะ')}</button>
      <button className="button primary" onClick={onAdd} disabled={removing || tables.length >= maxTables}><Plus size={19}/>{t('ເພີ່ມໂຕະ', 'เพิ่มโต๊ะ')}</button>
    </PageHeader>
    <dl className="bo-inline-counts" aria-label={t('ສະຫຼຸບໂຕະ', 'สรุปโต๊ะ')}>
      <div><dt>{t('ໂຕະທັງໝົດ', 'โต๊ะทั้งหมด')}</dt><dd>{tables.length}</dd></div>
      <div><dt>{t('ບ່ອນນັ່ງ', 'ที่นั่ง')}</dt><dd>{tables.reduce((sum, table) => sum + table.seats, 0)}</dd></div>
      <div><dt>{t('ໂຊນ', 'โซน')}</dt><dd>{zones.length}</dd></div>
      <div><dt>{t('ມີລູກຄ້າ', 'มีลูกค้า')}</dt><dd>{busyCount}</dd></div>
      <div><dt>{t('ຫວ່າງ', 'ว่าง')}</dt><dd>{tables.length - busyCount}</dd></div>
    </dl>
    <div className="setup-zones">{[...tablesByZone].map(([zone, zoneTables]) => <section className="setup-zone" key={zone}>
      <h2>{zone}<span>{zoneTables.length} {t('ໂຕະ', 'โต๊ะ')}</span></h2>
      <div className="setup-grid">{zoneTables.map(table => {
        const occupied = busy(table.number);
        const tableLabel = `${t('ໂຕະ', 'โต๊ะ')} ${pad(table.number)}`;
        return <article className={`setup-card ${occupied ? 'is-busy' : ''}`} key={table.number}>
          <header><span className="setup-number"><small>{t('ໂຕະ', 'โต๊ะ')}</small>{pad(table.number)}</span><span className={`badge ${occupied ? 'pending' : 'ready'}`}><span className="status-dot"/>{occupied ? t('ມີລູກຄ້າ', 'มีลูกค้า') : t('ຫວ່າງ', 'ว่าง')}</span></header>
          <p className="setup-seats"><Users size={16}/>{table.seats} {t('ບ່ອນນັ່ງ', 'ที่นั่ง')}</p>
          <footer>
            <button className="button secondary" aria-label={`${t('ແກ້ໄຂ', 'แก้ไข')} ${tableLabel}`} onClick={() => setEditing(table)}><Pencil size={16}/>{t('ແກ້ໄຂ', 'แก้ไข')}</button>
            <button className="button secondary" aria-label={`QR ${tableLabel}`} onClick={() => onShowQr(table.number)}><QrCode size={18}/>QR</button>
          </footer>
        </article>;
      })}</div>
    </section>)}</div>
    {last && <div className="setup-footer">
      <p>{Boolean(last && busy(last.number)) && tables.length > 1 ? t(`ໂຕະ ${pad(last.number)} ຍັງມີອໍເດີ · ລຶບໄດ້ຫຼັງປິດໂຕະ`, `โต๊ะ ${pad(last.number)} ยังมีออเดอร์ · ลบได้หลังปิดโต๊ะ`) : t('ລຶບໄດ້ສະເພາະໂຕະສຸດທ້າຍ ເພື່ອໃຫ້ເລກໂຕະ ແລະ QR ບໍ່ສັບສົນ', 'ลบได้เฉพาะโต๊ะสุดท้าย เพื่อไม่ให้เลขโต๊ะและ QR สับสน')}</p>
      <button className="danger-link" onClick={removeLast} disabled={removing || tables.length <= 1 || Boolean(last && busy(last.number))} aria-busy={removing}><Minus size={17}/>{removing ? t('ກຳລັງລຶບໂຕະ…', 'กำลังลบโต๊ะ…') : t(`ລຶບໂຕະ ${pad(last.number)}`, `ลบโต๊ะ ${pad(last.number)}`)}</button>
    </div>}
    {!tables.length && <EmptyState icon={QrCode} title={t('ຍັງບໍ່ມີໂຕະ', 'ยังไม่มีโต๊ะ')} text={t('ເພີ່ມໂຕະເພື່ອສ້າງ QR ສຳລັບລູກຄ້າ', 'เพิ่มโต๊ะเพื่อสร้าง QR สำหรับลูกค้า')}/>}
    {editing && <TableDialog table={editing} zones={zones.filter(zone => zone !== zoneName(editing))} onClose={() => setEditing(null)} onSave={async changes => { const saved = await onUpdate(editing.number, changes); if (saved) setEditing(null); return saved; }}/>}
    {printing && <QrSheetDialog tables={tables} shopName={shopName} onClose={() => setPrinting(false)}/>}
  </section>;
}

function TableDialog({ table, zones, onClose, onSave }) {
  const { t } = useL();
  const [zone, setZone] = useState(table.zone);
  const [seats, setSeats] = useState(table.seats);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try { if (!await onSave({ zone, seats })) setError(t('ບັນທຶກບໍ່ສຳເລັດ · ກະລຸນາລອງໃໝ່', 'บันทึกไม่สำเร็จ · กรุณาลองใหม่')); }
    catch { setError(t('ບັນທຶກບໍ່ສຳເລັດ · ກະລຸນາລອງໃໝ່', 'บันทึกไม่สำเร็จ · กรุณาลองใหม่')); }
    finally { setSaving(false); }
  }
  return <Dialog title={`${t('ແກ້ໄຂໂຕະ', 'แก้ไขโต๊ะ')} ${pad(table.number)}`} onClose={() => { if (!saving) onClose(); }} className="form-dialog bo-refinement-dialog">
    <form className="form-stack" onSubmit={submit} aria-busy={saving}>
      <label className="form-field"><span>{t('ໂຊນ', 'โซน')}</span><input data-autofocus value={zone} maxLength={24} placeholder={t('ຊັ້ນ 1', 'ชั้น 1')} onChange={event => setZone(event.target.value)}/></label>
      {zones.length > 0 && <div className="quick-amounts" role="group" aria-label={t('ໂຊນທີ່ມີແລ້ວ', 'โซนที่มีอยู่แล้ว')}>{zones.map(name => <button type="button" key={name} onClick={() => setZone(name)}>{name}</button>)}</div>}
      <div className="form-field"><span>{t('ບ່ອນນັ່ງ', 'ที่นั่ง')}</span><div className="stepper is-large" role="group" aria-label={t('ບ່ອນນັ່ງ', 'ที่นั่ง')}>
        <button type="button" aria-label={t('ຫຼຸດບ່ອນນັ່ງ', 'ลดที่นั่ง')} disabled={seats <= 1} onClick={() => setSeats(seats - 1)}><Minus size={20}/></button>
        <b aria-live="polite">{seats}</b>
        <button type="button" aria-label={t('ເພີ່ມບ່ອນນັ່ງ', 'เพิ่มที่นั่ง')} disabled={seats >= 30} onClick={() => setSeats(seats + 1)}><Plus size={20}/></button>
      </div></div>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary full" disabled={saving}><CheckCircle2 size={20}/>{saving ? t('ກຳລັງບັນທຶກ…', 'กำลังบันทึก…') : t('ບັນທຶກ', 'บันทึก')}</button>
    </form>
  </Dialog>;
}

function QrSheetDialog({ tables, shopName, onClose }) {
  const { t } = useL();
  const { images, error } = useMenuQrs(tables.map(table => table.number));
  const ready = tables.every(table => images[table.number]);
  return createPortal(<Dialog title={t('QR ທຸກໂຕະ', 'QR ทุกโต๊ะ')} onClose={onClose} className="qr-sheet-dialog">
    <div className="qr-sheet-actions">
      <p>{error ? t('ສ້າງ QR ບໍ່ສຳເລັດ · ກະລຸນາລອງໃໝ່', 'สร้าง QR ไม่สำเร็จ · กรุณาลองใหม่') : t('ຕັດຕາມເສັ້ນ ແລ້ວວາງໄວ້ທີ່ໂຕະຕາມເລກ', 'ตัดตามเส้น แล้ววางไว้ที่โต๊ะตามเลข')}</p>
      <button className="button primary" onClick={() => print()} disabled={!ready}><Printer size={19}/>{ready ? t('ພິມ', 'พิมพ์') : t('ກຳລັງສ້າງ QR…', 'กำลังสร้าง QR…')}</button>
    </div>
    <div className="qr-sheet">{tables.map(table => <div className="qr-sheet-card" key={table.number}>
      <strong>{shopName}</strong>
      {images[table.number] ? <img src={images[table.number]} width="150" height="150" alt={`QR ${t('ໂຕະ', 'โต๊ะ')} ${pad(table.number)}`}/> : <span className="qr-sheet-placeholder"/>}
      <b>{t('ໂຕະ', 'โต๊ะ')} {pad(table.number)}</b>
      <small>{t('ສະແກນ ສັ່ງ ລໍຖ້າຄວາມແຊບ', 'สแกน สั่ง รอความอร่อย')}</small>
    </div>)}</div>
  </Dialog>, document.body);
}

const permissionViews = ['tables', 'orders', 'shift', 'menu', 'table-setup', 'staff', 'reports', 'settings'];

export function StaffView({ staff, user, onSave, cloud = false }) {
  const { t } = useL();
  const [editingId, setEditingId] = useState(null);
  const member = editingId === '' ? { role: 'cashier', active: true } : staff.find(item => item.id === editingId);
  const canEditMember = target => canEditStaffMember(user, target.role) && (!cloud || (target.id !== user.id && target.role !== 'owner'));
  const canEdit = Boolean(member && canEditMember(member));
  const allowedRoles = roles.filter(role => canEditStaffMember(user, role) && (!cloud || role !== 'owner'));
  useEffect(() => {
    if (editingId !== null && !canEdit) setEditingId(null);
  }, [editingId, canEdit]);
  return <section className="full-page bo-page bo-staff-page">
    <PageHeader icon={UserCog} title={t('ພະນັກງານ', 'พนักงาน')} text={cloud ? t('ຈັດການສິດເຂົ້າໃຊ້ຮ້ານຂອງບັນຊີພະນັກງານ', 'จัดการสิทธิ์เข้าใช้ร้านของบัญชีพนักงาน') : t('ກຳນົດຕຳແໜ່ງ ແລະ PIN ສຳລັບເຂົ້າໃຊ້ງານ', 'กำหนดตำแหน่งและ PIN สำหรับเข้าใช้งาน')}>
      {allowedRoles.length > 0 && <button className="button primary" onClick={() => setEditingId('')}><Plus size={19}/>{t('ເພີ່ມພະນັກງານ', 'เพิ่มพนักงาน')}</button>}
    </PageHeader>
    <dl className="bo-inline-counts" aria-label={t('ພະນັກງານທີ່ໃຊ້ງານໄດ້', 'พนักงานที่ใช้งานได้')}>{roles.map(role => <div key={role}><dt>{roleText(role, t)}</dt><dd>{staff.filter(member => member.role === role && member.active).length}</dd></div>)}</dl>
    <div className="staff-list">{staff.map(member => {
      const available = canSignInStaff(member);
      const status = !roles.includes(member.role)
        ? t('ຕ້ອງກຳນົດຕຳແໜ່ງໃໝ່', 'ต้องกำหนดตำแหน่งใหม่')
        : available ? t('ໃຊ້ງານໄດ້', 'ใช้งานได้') : t('ປິດການໃຊ້ງານ', 'ปิดใช้งาน');
      return <article className={`staff-row ${available ? '' : 'is-inactive'}`} key={member.id}>
        <Avatar member={member}/>
        <div className="staff-card-body">
          <strong>{member.name}{member.id === user.id && <em>{t('ທ່ານ', 'คุณ')}</em>}</strong>
          <span className="staff-row-meta"><RoleChip role={member.role}/><span className="staff-meta"><span className={`status-text ${available ? 'is-on' : ''}`}>{status}</span>{!cloud && ' · PIN ••••'}</span></span>
        </div>
        {canEditMember(member) && <button className="button secondary staff-edit" aria-label={`${t('ແກ້ໄຂ', 'แก้ไข')} ${member.name}`} onClick={() => setEditingId(member.id)}><Pencil size={18}/>{t('ແກ້ໄຂ', 'แก้ไข')}</button>}
      </article>;
    })}</div>
    <details className="staff-permissions">
      <summary>{t('ສິດການເຂົ້າເຖິງແຕ່ລະຕຳແໜ່ງ', 'สิทธิ์การเข้าถึงแต่ละตำแหน่ง')}</summary>
      <p>{t('ແຕ່ລະຕຳແໜ່ງເຫັນສະເພາະໜ້າທີ່ມີເຄື່ອງໝາຍ ✓', 'แต่ละตำแหน่งเห็นเฉพาะหน้าที่มีเครื่องหมาย ✓')}</p>
      <div className="table-scroll"><table className="permission-table">
        <thead><tr><th scope="col">{t('ໜ້າຈໍ', 'หน้าจอ')}</th>{roles.map(role => <th scope="col" key={role}><RoleChip role={role}/></th>)}</tr></thead>
        <tbody>{permissionViews.map(view => { const Icon = viewIcons[view]; return <tr key={view}><th scope="row"><Icon size={17}/>{viewLabel(view, t)}</th>{roles.map(role => <td key={role}>{canOpen(role, view) ? <span className="permission-yes" aria-label={t('ເຂົ້າໄດ້', 'เข้าได้')}><Check size={16}/></span> : <span className="permission-no" aria-label={t('ເຂົ້າບໍ່ໄດ້', 'เข้าไม่ได้')}>–</span>}</td>)}</tr>; })}</tbody>
      </table></div>
    </details>
    {canEdit && <StaffDialog member={member} cloud={cloud} allowedRoles={allowedRoles} isSelf={member.id === user.id} onClose={() => setEditingId(null)} onSave={async changes => { const error = await onSave(changes); if (!error) setEditingId(null); return error; }}/>}
  </section>;
}

export function StaffDialog({ member, allowedRoles, isSelf, onClose, onSave, cloud = false }) {
  const { t } = useL();
  const [name, setName] = useState(member.name ?? '');
  const [authEmail, setAuthEmail] = useState(member.authEmail ?? '');
  const [saving, setSaving] = useState(false);
  const [role, setRole] = useState(member.role);
  const [pin, setPin] = useState(member.pin ?? '');
  const [active, setActive] = useState(member.active !== false);
  const [showPin, setShowPin] = useState(!member.id);
  const [error, setError] = useState('');
  const forbidden = t('ທ່ານບໍ່ມີສິດແກ້ໄຂບັນຊີນີ້', 'คุณไม่มีสิทธิ์แก้ไขบัญชีนี้');
  const messages = {
    name: t('ກະລຸນາໃສ່ຊື່ ບໍ່ເກີນ 40 ຕົວອັກສອນ', 'กรุณาใส่ชื่อ ไม่เกิน 40 ตัวอักษร'),
    pin: t('PIN ຕ້ອງເປັນຕົວເລກ 4 ຫຼັກ', 'PIN ต้องเป็นตัวเลข 4 หลัก'),
    'auth-user': t('ກະລຸນາໃສ່ອີເມວພະນັກງານ', 'กรุณาใส่อีเมลพนักงาน'),
    'staff-account': t('ໃຫ້ພະນັກງານສ້າງບັນຊີ ແລະ ຢືນຢັນອີເມວກ່ອນ', 'ให้พนักงานสร้างบัญชีและยืนยันอีเมลก่อน'),
    'last-owner': t('ຕ້ອງມີເຈົ້າຂອງຮ້ານທີ່ໃຊ້ງານໄດ້ຢ່າງໜ້ອຍ 1 ຄົນ', 'ต้องมีเจ้าของร้านที่ใช้งานได้อย่างน้อย 1 คน'),
    forbidden, 'access-denied': forbidden,
  };
  async function submit(event) {
    event.preventDefault();
    if (saving) return;
    if (cloud && !member.id && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(authEmail.trim())) { setError(messages['auth-user']); return; }
    setSaving(true);
    setError('');
    try {
      const code = await onSave({ id: member.id, name, role, active, ...(cloud ? { authEmail: authEmail.trim() } : { pin }) });
      if (code) setError(messages[code] ?? t('ບັນທຶກບໍ່ສຳເລັດ · ກະລຸນາລອງໃໝ່', 'บันทึกไม่สำเร็จ · กรุณาลองใหม่'));
    } catch { setError(t('ບັນທຶກບໍ່ສຳເລັດ · ກະລຸນາລອງໃໝ່', 'บันทึกไม่สำเร็จ · กรุณาลองใหม่')); }
    finally { setSaving(false); }
  }
  return <Dialog title={member.id ? t('ແກ້ໄຂພະນັກງານ', 'แก้ไขพนักงาน') : t('ເພີ່ມພະນັກງານ', 'เพิ่มพนักงาน')} onClose={() => { if (!saving) onClose(); }} className="form-dialog bo-refinement-dialog">
    <form className="form-stack" onSubmit={submit} aria-busy={saving}>
      <label className="form-field"><span>{t('ຊື່', 'ชื่อ')}</span><input data-autofocus value={name} maxLength={40} onChange={event => { setName(event.target.value); setError(''); }}/></label>
      <fieldset className="form-field"><legend>{t('ຕຳແໜ່ງ', 'ตำแหน่ง')}</legend>
        <div className="role-options">{allowedRoles.map(id => <button type="button" key={id} className={`role-option role-${id} ${role === id ? 'selected' : ''}`} aria-pressed={role === id} disabled={isSelf && id !== member.role} onClick={() => { setRole(id); setError(''); }}><span className="role-dot"/>{roleText(id, t)}</button>)}</div>
        {isSelf && <small>{t('ປ່ຽນຕຳແໜ່ງ ຫຼື ປິດບັນຊີຂອງຕົນເອງບໍ່ໄດ້', 'เปลี่ยนตำแหน่งหรือปิดบัญชีของตัวเองไม่ได้')}</small>}
        {!allowedRoles.includes(role) && <small>{t('ເລືອກຕຳແໜ່ງໃໝ່ໃຫ້ບັນຊີນີ້', 'เลือกตำแหน่งใหม่ให้บัญชีนี้')}</small>}
      </fieldset>
      {cloud ? <label className="form-field"><span>{t('ອີເມວພະນັກງານ', 'อีเมลพนักงาน')}</span><input type="email" required={!member.id} value={authEmail} autoComplete="off" readOnly={Boolean(member.id) || saving} onChange={event => { setAuthEmail(event.target.value); setError(''); }}/><small>{t('ໃຫ້ພະນັກງານສ້າງບັນຊີ ແລະ ຢືນຢັນອີເມວກ່ອນເພີ່ມເຂົ້າຮ້ານ', 'ให้พนักงานสร้างบัญชีและยืนยันอีเมลก่อนเพิ่มเข้าร้าน')}</small></label> : <label className="form-field"><span>{t('PIN 4 ຕົວເລກ', 'PIN 4 หลัก')}</span><span className="pin-input">
        <input type={showPin ? 'text' : 'password'} inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={event => { setPin(event.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}/>
        <IconButton type="button" label={showPin ? t('ເຊື່ອງ PIN', 'ซ่อน PIN') : t('ສະແດງ PIN', 'แสดง PIN')} onClick={() => setShowPin(value => !value)}>{showPin ? <EyeOff size={20}/> : <Eye size={20}/>}</IconButton>
      </span></label>}
      <label className="toggle-row"><span><strong>{t('ເປີດໃຫ້ໃຊ້ງານໄດ້', 'เปิดให้ใช้งานได้')}</strong><small>{t('ປິດໄວ້ເມື່ອພະນັກງານອອກ ປະຫວັດຍັງຢູ່ຄືເກົ່າ', 'ปิดไว้เมื่อพนักงานลาออก ประวัติยังอยู่เหมือนเดิม')}</small></span><input type="checkbox" className="switch-input" checked={active} disabled={isSelf} onChange={event => { setActive(event.target.checked); setError(''); }}/></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary full" disabled={saving || !allowedRoles.includes(role)}><CheckCircle2 size={20}/>{t('ບັນທຶກ', 'บันทึก')}</button>
    </form>
  </Dialog>;
}

export function SwitchUserDialog({ staff, currentId, onSignIn, onClose }) {
  const { t } = useL();
  return <Dialog title={t('ສະຫຼັບຜູ້ໃຊ້', 'สลับผู้ใช้')} onClose={onClose} className="form-dialog"><StaffSignIn staff={staff} currentId={currentId} onSignIn={onSignIn} onClose={onClose}/></Dialog>;
}

export function StaffAccessScreen({ staff, onSignIn }) {
  const { t } = useL();
  const heading = useRef();
  useEffect(() => { heading.current?.focus({ preventScroll: true }); }, []);
  return <main className="staff-access-page"><section className="staff-access-panel" aria-labelledby="staff-access-title">
    <div className="staff-access-heading"><LockKeyhole size={30} aria-hidden="true"/><h1 ref={heading} tabIndex={-1} id="staff-access-title">{t('ບັນຊີນີ້ໃຊ້ງານບໍ່ໄດ້ແລ້ວ', 'บัญชีนี้ใช้งานไม่ได้แล้ว')}</h1><p>{t('ກະລຸນາເລືອກຜູ້ໃຊ້ທີ່ໃຊ້ງານໄດ້ ແລ້ວໃສ່ PIN ເພື່ອເຂົ້າໃໝ່', 'กรุณาเลือกบัญชีที่ยังใช้งานได้ แล้วใส่ PIN เพื่อเข้าสู่ระบบใหม่')}</p></div>
    <StaffSignIn staff={staff} onSignIn={onSignIn}/>
  </section></main>;
}

function StaffSignIn({ staff, currentId, onSignIn, onClose }) {
  const { t } = useL();
  const [selectedId, setSelectedId] = useState(null);
  const availableStaff = staff.filter(canSignInStaff);
  const selected = availableStaff.find(member => member.id === selectedId);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  function submit(event) {
    event.preventDefault();
    if (pin !== selected.pin || onSignIn(selected) === false) { setError(true); setPin(''); }
  }
  return <>
    {selected ? <form className="form-stack" onSubmit={submit}>
      <button type="button" className="text-link" onClick={() => { setSelectedId(null); setPin(''); setError(false); }}><ArrowLeft size={17}/>{t('ເລືອກຄົນອື່ນ', 'เลือกคนอื่น')}</button>
      <div className="user-option is-static"><Avatar member={selected}/><span><strong>{selected.name}</strong><RoleChip role={selected.role}/></span></div>
      <label className="form-field"><span>{t('ໃສ່ PIN 4 ຕົວເລກ', 'ใส่ PIN 4 หลัก')}</span><input autoFocus className="pin-field" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={event => { setPin(event.target.value.replace(/\D/g, '').slice(0, 4)); setError(false); }}/></label>
      {error && <p className="form-error" role="alert">{t('PIN ບໍ່ຖືກຕ້ອງ · ກະລຸນາລອງໃໝ່', 'PIN ไม่ถูกต้อง · กรุณาลองใหม่')}</p>}
      <button className="button primary full" disabled={pin.length !== 4}><LogIn size={20}/>{t('ເຂົ້າໃຊ້ງານ', 'เข้าใช้งาน')}</button>
    </form> : <div className="user-list">{availableStaff.map(member => <button key={member.id} className={`user-option ${member.id === currentId ? 'is-current' : ''}`} onClick={() => { if (member.id === currentId) onClose?.(); else { setSelectedId(member.id); setPin(''); setError(false); } }}>
      <Avatar member={member}/>
      <span><strong>{member.name}</strong><RoleChip role={member.role}/></span>
      {member.id === currentId ? <span className="badge ready"><span className="status-dot"/>{t('ກຳລັງໃຊ້', 'กำลังใช้')}</span> : <ChevronRight size={19}/>}
    </button>)}</div>}
  </>;
}

export function SettingsView({ settings, activity, menu, onSave }) {
  const { t } = useL();
  const [tab, setTab] = useState('shop');
  const tabs = [
    ['shop', Store, t('ຂໍ້ມູນຮ້ານ', 'ข้อมูลร้าน')],
    ['payments', Wallet, t('ການຊຳລະເງິນ', 'การชำระเงิน')],
    ['activity', History, t('ປະຫວັດການໃຊ້ງານ', 'ประวัติการใช้งาน')],
  ];
  return <section className="full-page bo-page bo-settings-page">
    <PageHeader icon={Settings} title={t('ຕັ້ງຄ່າ', 'ตั้งค่า')} text={t('ຂໍ້ມູນຮ້ານ ວິທີຮັບເງິນ ແລະ ປະຫວັດວ່າໃຜເຮັດຫຍັງ', 'ข้อมูลร้าน วิธีรับเงิน และประวัติว่าใครทำอะไร')}/>
    <div className="settings-layout">
      <nav className="settings-nav" aria-label={t('ຕັ້ງຄ່າ', 'ตั้งค่า')}>{tabs.map(([id, Icon, label]) => <button key={id} className={tab === id ? 'selected' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon size={20}/><strong>{label}</strong></button>)}</nav>
      <div className="settings-panel">
        {tab === 'shop' && <ShopSettings settings={settings} onSave={onSave}/>}
        {tab === 'payments' && <PaymentSettings settings={settings} onSave={onSave}/>}
        {tab === 'activity' && <ActivityLog activity={activity} menu={menu}/>}
      </div>
    </div>
  </section>;
}

function ShopSettings({ settings, onSave }) {
  const { t } = useL();
  // Only local edits override snapshots; untouched fields always use the latest settings.
  const [edits, setEdits] = useState({});
  const form = { shopName: settings.shopName, branch: settings.branch, phone: settings.phone, ...edits };
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const changes = Object.fromEntries(Object.entries(edits).filter(([name, value]) => value.trim() !== settings[name]));
  const changed = Object.keys(changes).length > 0;
  useEffect(() => {
    setEdits(current => {
      const next = Object.fromEntries(Object.entries(current).filter(([name, value]) => value.trim() !== settings[name]));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [settings.shopName, settings.branch, settings.phone]);
  const field = (name, label, placeholder, limit) => <label className="form-field"><span>{label}</span><input value={form[name]} maxLength={limit} placeholder={placeholder} onChange={event => {
    const value = event.target.value;
    setEdits(current => {
      const next = { ...current, [name]: value };
      if (value.trim() === settings[name]) delete next[name];
      return next;
    });
    setError('');
  }}/></label>;
  async function submit(event) {
    event.preventDefault();
    if (saving || !changed || !form.shopName.trim()) return;
    setSaving(true);
    setError('');
    try {
      if (await onSave(changes)) setError(t('ບັນທຶກບໍ່ສຳເລັດ · ກະລຸນາກວດຂໍ້ມູນ ແລ້ວລອງໃໝ່', 'บันทึกไม่สำเร็จ · กรุณาตรวจข้อมูลแล้วลองใหม่'));
      else setEdits(current => Object.fromEntries(Object.entries(current).filter(([name, value]) => !Object.hasOwn(changes, name) || value !== changes[name])));
    } catch { setError(t('ບັນທຶກບໍ່ສຳເລັດ · ກະລຸນາລອງໃໝ່', 'บันทึกไม่สำเร็จ · กรุณาลองใหม่')); }
    finally { setSaving(false); }
  }
  return <form className="bo-card settings-shop" onSubmit={submit} aria-busy={saving}>
    <div className="form-stack">
      <div className="bo-card-head"><div><h2>{t('ຂໍ້ມູນຮ້ານ', 'ข้อมูลร้าน')}</h2><p>{t('ຊື່ຮ້ານທີ່ລູກຄ້າເຫັນໃນເມນູ', 'ชื่อร้านที่ลูกค้าเห็นในเมนู')}</p></div></div>
      {field('shopName', t('ຊື່ຮ້ານ', 'ชื่อร้าน'), t('ຊື່ຮ້ານ', 'ชื่อร้าน'), 40)}
      {field('branch', t('ສາຂາ', 'สาขา'), t('ບໍ່ບັງຄັບ', 'ไม่บังคับ'), 40)}
      {field('phone', t('ເບີໂທ', 'เบอร์โทร'), t('ບໍ່ບັງຄັບ', 'ไม่บังคับ'), 30)}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary" disabled={saving || !changed || !form.shopName.trim()}><CheckCircle2 size={20}/>{t('ບັນທຶກ', 'บันทึก')}</button>
    </div>
    <aside className="shop-preview" aria-label={t('ຂໍ້ມູນຮ້ານ', 'ข้อมูลร้าน')}>
      <small>{t('ຊື່ຮ້ານໃນເມນູລູກຄ້າ', 'ชื่อร้านในเมนูลูกค้า')}</small>
      <strong className="shop-preview-name">{form.shopName.trim() || settings.shopName}</strong>
    </aside>
  </form>;
}

function PaymentSettings({ settings, onSave }) {
  const { t } = useL();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  async function toggle(method) {
    if (saving) return;
    setSaving(true);
    setError('');
    const on = settings.methods.includes(method);
    try {
      if (await onSave({ methods: on ? settings.methods.filter(item => item !== method) : [...settings.methods, method] })) setError(t('ບັນທຶກບໍ່ສຳເລັດ · ກະລຸນາລອງໃໝ່', 'บันทึกไม่สำเร็จ · กรุณาลองใหม่'));
    } catch { setError(t('ບັນທຶກບໍ່ສຳເລັດ · ກະລຸນາລອງໃໝ່', 'บันทึกไม่สำเร็จ · กรุณาลองใหม่')); }
    finally { setSaving(false); }
  }
  const details = { transfer: [CreditCard, t('ລູກຄ້າໂອນເຂົ້າບັນຊີຮ້ານ ແລ້ວແຄຊເຊຍກວດຍອດ', 'ลูกค้าโอนเข้าบัญชีร้าน แล้วแคชเชียร์ตรวจยอด')], cash: [Banknote, t('ຮັບເງິນສົດທີ່ແຄຊເຊຍ ນັບເຂົ້າກະ', 'รับเงินสดที่แคชเชียร์ นับเข้ากะ')] };
  return <div className="bo-card">
    <div className="bo-card-head"><div><h2>{t('ວິທີຮັບເງິນ', 'วิธีรับเงิน')}</h2><p>{t('ລູກຄ້າ ແລະ ແຄຊເຊຍເຫັນສະເພາະວິທີທີ່ເປີດ · ຕ້ອງເປີດຢ່າງໜ້ອຍ 1 ວິທີ', 'ลูกค้าและแคชเชียร์เห็นเฉพาะวิธีที่เปิด · ต้องเปิดอย่างน้อย 1 วิธี')}</p></div></div>
    <div className="method-list">{paymentMethods.map(method => {
      const [Icon, text] = details[method];
      const on = settings.methods.includes(method);
      const onlyOne = on && settings.methods.length === 1;
      return <div className={`method-card ${on ? 'is-on' : ''}`} key={method}>
        <span className="bo-icon"><Icon size={22}/></span>
        <span><strong>{methodText(method, t)}</strong><small>{onlyOne ? t('ຕ້ອງເປີດຢ່າງໜ້ອຍ 1 ວິທີ', 'ต้องเปิดอย่างน้อย 1 วิธี') : text}</small></span>
        <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={methodText(method, t)} disabled={saving || onlyOne} onClick={() => toggle(method)}><span/></button>
      </div>;
    })}</div>
    {error && <p className="form-error" role="alert">{error}</p>}
  </div>;
}

const activityKinds = {
  order: [ClipboardList, 'tone-neutral'], pay: [Banknote, 'tone-money'], start: [Flame, 'tone-kitchen'], ready: [ChefHat, 'tone-kitchen'],
  reject: [Banknote, 'tone-warn'], 'kitchen-sent': [Printer, 'tone-kitchen'],
  serve: [CheckCircle2, 'tone-kitchen'], close: [CheckCircle2, 'tone-money'], 'sold-out': [Utensils, 'tone-warn'], available: [Utensils, 'tone-neutral'],
  'shift-open': [Wallet, 'tone-money'], 'shift-close': [Wallet, 'tone-money'], staff: [UserCog, 'tone-admin'], tables: [QrCode, 'tone-admin'],
  table: [QrCode, 'tone-admin'], settings: [Settings, 'tone-admin'], signin: [LogIn, 'tone-neutral'],
  call: [BellRing, 'tone-warn'], 'call-answered': [Check, 'tone-neutral'], undo: [Undo2, 'tone-warn'], dish: [Pencil, 'tone-admin'], 'dish-deleted': [Utensils, 'tone-admin'],
};
const callReasonText = (reason, t) => ({ help: t('ເອີ້ນພະນັກງານ', 'เรียกพนักงาน'), pay: t('ຂໍຈ່າຍເງິນທີ່ໂຕະ', 'ขอจ่ายเงินที่โต๊ะ'), water: t('ຂໍນ້ຳເປົ່າ', 'ขอน้ำเปล่า') }[reason] ?? t('ເອີ້ນພະນັກງານ', 'เรียกพนักงาน'));

function activityText(entry, t, lang, menu) {
  const displayOrder = entry.orderNumber ?? entry.orderId;
  const table = entry.table ? ` · ${t('ໂຕະ', 'โต๊ะ')} ${pad(entry.table)}` : '';
  const dish = entry.name ?? itemName(menu.find(item => item.id === entry.itemId) ?? { lo: entry.itemId ?? '' }, lang);
  return {
    order: `${t('ສັ່ງອາຫານ', 'สั่งอาหาร')} #${displayOrder}${table}`,
    pay: `${t('ຮັບເງິນ', 'รับเงิน')} #${displayOrder} · ${money(entry.amount ?? 0)} ₭ · ${methodText(entry.method, t)}`,
    reject: `${t('ບໍ່ພົບຍອດ', 'ไม่พบยอด')} #${displayOrder}${table}`,
    'kitchen-sent': `${t('ສົ່ງໃບຄົວແລ້ວ', 'ส่งใบครัวแล้ว')} #${displayOrder}${table}`,
    start: `${t('ເລີ່ມເຮັດອາຫານ', 'เริ่มทำอาหาร')} #${displayOrder}${table}`,
    ready: `${t('ອາຫານພ້ອມເສີບ', 'อาหารพร้อมเสิร์ฟ')} #${displayOrder}${table}`,
    serve: `${t('ເສີບແລ້ວ', 'เสิร์ฟแล้ว')} #${displayOrder}${table}`,
    close: `${t('ປິດອໍເດີ', 'ปิดออเดอร์')} #${displayOrder}${table}`,
    'sold-out': `${t('ຕັ້ງເປັນໝົດ', 'ตั้งเป็นหมด')}: ${dish}`,
    available: `${t('ເປີດຂາຍ', 'เปิดขาย')}: ${dish}`,
    'shift-open': `${t('ເປີດກະ · ເງິນຕັ້ງຕົ້ນ', 'เปิดกะ · เงินตั้งต้น')} ${money(entry.amount ?? 0)} ₭`,
    'shift-close': `${t('ປິດກະ', 'ปิดกะ')} · ${differenceLabel(entry.difference ?? 0, t)} ${signed(entry.difference ?? 0)} ₭`,
    staff: `${t('ບັນທຶກພະນັກງານ', 'บันทึกพนักงาน')}: ${entry.name}`,
    tables: `${t('ປ່ຽນຈຳນວນໂຕະເປັນ', 'เปลี่ยนจำนวนโต๊ะเป็น')} ${entry.count}`,
    table: `${t('ແກ້ໄຂໂຕະ', 'แก้ไขโต๊ะ')} ${pad(entry.table ?? 0)}`,
    settings: t('ແກ້ໄຂການຕັ້ງຄ່າ', 'แก้ไขการตั้งค่า'),
    signin: t('ເຂົ້າໃຊ້ງານ', 'เข้าใช้งาน'),
    call: `${callReasonText(entry.reason, t)}${table}`,
    'call-answered': `${t('ຮັບຊາບການເອີ້ນ', 'รับทราบการเรียก')}${table}`,
    undo: `${t('ເອົາຄືນ', 'เอาคืน')} #${displayOrder}${table}`,
    dish: `${t('ບັນທຶກເມນູ', 'บันทึกเมนู')}: ${entry.name}`,
    'dish-deleted': `${t('ລຶບເມນູ', 'ลบเมนู')}: ${entry.name ?? ''}`,
  }[entry.type] ?? entry.type;
}

function ActivityLog({ activity, menu }) {
  const { t, lang } = useL();
  const [limit, setLimit] = useState(50);
  if (!activity.length) return <div className="bo-card"><EmptyState icon={History} title={t('ຍັງບໍ່ມີປະຫວັດ', 'ยังไม่มีประวัติ')} text={t('ການຮັບເງິນ ປິດໂຕະ ເປີດປິດກະ ແລະ ການແກ້ໄຂຕ່າງໆ ຈະຖືກບັນທຶກໄວ້ທີ່ນີ້', 'การรับเงิน ปิดโต๊ะ เปิดปิดกะ และการแก้ไขต่าง ๆ จะถูกบันทึกไว้ที่นี่')}/></div>;
  const days = activity.slice(0, limit).reduce((groups, entry) => {
    const label = dayLabel(entry.at, t);
    if (groups.at(-1)?.label !== label) groups.push({ label, entries: [] });
    groups.at(-1).entries.push(entry);
    return groups;
  }, []);
  return <div className="bo-card activity-card">
    {days.map(day => <section key={day.label}><h3 className="activity-day">{day.label}</h3>
      <ol className="activity-list">{day.entries.map(entry => { const [Icon, tone] = activityKinds[entry.type] ?? [History, 'tone-neutral']; return <li className="activity-row" key={entry.id}>
        <span className={`activity-icon ${tone}`}><Icon size={17}/></span>
        <span className="activity-text"><strong>{activityText(entry, t, lang, menu)}</strong><small>{entry.by ?? t('ລູກຄ້າ (QR)', 'ลูกค้า (QR)')}{entry.role && ` · ${roleText(entry.role, t)}`}</small></span>
        <time>{clockTime(entry.at)}</time>
      </li>; })}</ol>
    </section>)}
    {activity.length > limit && <button className="button secondary full" onClick={() => setLimit(value => value + 50)}>{t('ສະແດງເພີ່ມ', 'แสดงเพิ่ม')} ({activity.length - limit})</button>}
  </div>;
}
