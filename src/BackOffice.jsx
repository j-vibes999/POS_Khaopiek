import React, { useState } from 'react';
import { ArrowLeft, Banknote, BellRing, Check, CheckCircle2, ChefHat, ChevronRight, ClipboardList, CreditCard, Eye, EyeOff, Flame, History, LogIn, MapPin, Minus, Pencil, Plus, Printer, QrCode, RotateCcw, Settings, Store, Undo2, UserCog, Users, Utensils, Wallet } from 'lucide-react';
import { Dialog, EmptyState, IconButton, PageHeader, RoleChip, StatTiles, clockTime, initial, itemName, methodText, money, pad, roleText, shortDate, useL, viewIcons, viewLabel } from './staff-ui';
import { canOpen, currentShift, maxTables, paymentMethods, roles, shiftTotals } from './backoffice-model.mjs';
import { useMenuQrs } from './use-menu-qr';

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

export function ShiftView({ shifts, orders, user, onOpen, onClose }) {
  const { t } = useL();
  const shift = currentShift(shifts);
  const [amount, setAmount] = useState('');
  const [closing, setClosing] = useState(false);
  // Count up to this render rather than the half-minute clock, so a payment just taken shows at once.
  const totals = shift && shiftTotals(shift, orders, Date.now());
  const ownOnly = user.role === 'cashier';
  const history = shifts.filter(item => item.closedAt && (!ownOnly || item.openedBy === user.id));
  const opening = parseAmount(amount);
  function open(event) {
    event.preventDefault();
    if (opening !== null && onOpen(opening)) setAmount('');
  }
  return <section className="full-page bo-page">
    <PageHeader icon={Wallet} title={t('ກະ & ເງິນສົດ', 'กะ & เงินสด')} text={t('ເປີດກະດ້ວຍເງິນທອນຕັ້ງຕົ້ນ ແລ້ວນັບເງິນໃນລິ້ນຊັກຕອນປິດກະ', 'เปิดกะด้วยเงินทอนตั้งต้น แล้วนับเงินในลิ้นชักตอนปิดกะ')}/>
    {shift ? <>
      <div className="shift-status">
        <span className="live-pulse"/>
        <div><strong>{t('ກະເປີດຢູ່', 'กะเปิดอยู่')}</strong><span>{t('ເປີດໂດຍ', 'เปิดโดย')} {shift.openedByName} · {clockTime(shift.openedAt)} · {duration(Date.now() - shift.openedAt, t)}</span></div>
        <button className="button primary" onClick={() => setClosing(true)}><Wallet size={20}/>{t('ປິດກະ ແລະ ນັບເງິນ', 'ปิดกะและนับเงิน')}</button>
      </div>
      <StatTiles items={[
        { icon: Wallet, label: t('ເງິນຕັ້ງຕົ້ນ', 'เงินตั้งต้น'), value: kip(shift.openingCash) },
        { icon: Banknote, label: t('ຮັບເງິນສົດ', 'รับเงินสด'), value: kip(totals.cash), note: `${totals.orderCount} ${t('ອໍເດີທີ່ຮັບເງິນ', 'ออเดอร์ที่รับเงิน')}` },
        { icon: CreditCard, label: t('ຮັບໂອນ', 'รับโอน'), value: kip(totals.transfer), note: t('ບໍ່ຢູ່ໃນລິ້ນຊັກ', 'ไม่อยู่ในลิ้นชัก') },
        { icon: CheckCircle2, label: t('ຄວນມີໃນລິ້ນຊັກ', 'ควรมีในลิ้นชัก'), value: kip(totals.expectedCash), note: t('ເງິນຕັ້ງຕົ້ນ + ເງິນສົດ', 'เงินตั้งต้น + เงินสด'), tone: 'is-highlight' },
      ]}/>
    </> : <form className="bo-card shift-start" onSubmit={open}>
      <div className="shift-start-copy">
        <span className="bo-icon is-large"><Wallet size={30}/></span>
        <h2>{t('ເລີ່ມກະໃໝ່', 'เริ่มกะใหม่')}</h2>
        <p>{t('ນັບເງິນທອນທີ່ມີໃນລິ້ນຊັກກ່ອນເລີ່ມຂາຍ ແລ້ວໃສ່ຈຳນວນນີ້', 'นับเงินทอนในลิ้นชักก่อนเริ่มขาย แล้วใส่จำนวนนี้')}</p>
      </div>
      <div className="shift-start-form">
        <label className="form-field"><span>{t('ເງິນຕັ້ງຕົ້ນ', 'เงินตั้งต้น')}</span><span className="amount-input"><input type="number" inputMode="numeric" min="0" step="1000" value={amount} onChange={event => setAmount(event.target.value)} placeholder="0"/><b>₭</b></span></label>
        <div className="quick-amounts" role="group" aria-label={t('ຈຳນວນທີ່ໃຊ້ເລື້ອຍ', 'จำนวนที่ใช้บ่อย')}>{[200000, 500000, 1000000].map(value => <button type="button" key={value} className={amount === String(value) ? 'selected' : ''} aria-pressed={amount === String(value)} onClick={() => setAmount(String(value))}>{money(value)}</button>)}</div>
        <button className="button primary full" disabled={opening === null}><Wallet size={20}/>{t('ເປີດກະ', 'เปิดกะ')}</button>
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
    {closing && <CloseShiftDialog expected={totals.expectedCash} onClose={() => setClosing(false)} onConfirm={counted => { if (onClose(counted)) setClosing(false); }}/>}
  </section>;
}

function CloseShiftDialog({ expected, onClose, onConfirm }) {
  const { t } = useL();
  const [counted, setCounted] = useState('');
  const value = parseAmount(counted);
  const difference = value === null ? 0 : value - expected;
  return <Dialog title={t('ປິດກະ', 'ปิดกะ')} onClose={onClose} className="form-dialog">
    <form className="form-stack" onSubmit={event => { event.preventDefault(); if (value !== null) onConfirm(value); }}>
      <div className="payment-amount"><span>{t('ເງິນສົດທີ່ຄວນມີໃນລິ້ນຊັກ', 'เงินสดที่ควรมีในลิ้นชัก')}</span><strong>{money(expected)}<small> ₭</small></strong></div>
      <label className="form-field"><span>{t('ເງິນສົດທີ່ນັບໄດ້', 'เงินสดที่นับได้')}</span><span className="amount-input"><input data-autofocus type="number" inputMode="numeric" min="0" step="500" value={counted} onChange={event => setCounted(event.target.value)} placeholder="0"/><b>₭</b></span></label>
      {value !== null && <p className={`shift-difference ${differenceTone(difference)}`} role="status">{differenceLabel(difference, t)} · {signed(difference)} ₭</p>}
      <button className="button primary full" disabled={value === null}><CheckCircle2 size={20}/>{t('ຢືນຢັນປິດກະ', 'ยืนยันปิดกะ')}</button>
    </form>
  </Dialog>;
}

export function TableSetupView({ tables, orders, shopName, onAdd, onRemoveLast, onUpdate, onShowQr }) {
  const { t } = useL();
  const [printing, setPrinting] = useState(false);
  const [editing, setEditing] = useState(null);
  const busy = number => orders.some(order => order.table === number && order.status !== 'completed');
  const last = tables[tables.length - 1];
  const zoneName = table => table.zone || t('ຊັ້ນ 1', 'ชั้น 1');
  const zones = [...new Set(tables.map(zoneName))];
  const busyCount = tables.filter(table => busy(table.number)).length;
  return <section className="full-page bo-page">
    <PageHeader icon={QrCode} title={t('ໂຕະ & QR', 'โต๊ะ & QR')} text={t('ກຳນົດໂຕະ ໂຊນ ແລະ ບ່ອນນັ່ງ ແລ້ວພິມ QR ໄປວາງທຸກໂຕະ', 'กำหนดโต๊ะ โซน และที่นั่ง แล้วพิมพ์ QR ไปวางทุกโต๊ะ')}>
      <button className="button secondary" onClick={() => setPrinting(true)}><Printer size={19}/>{t('ພິມ QR ທຸກໂຕະ', 'พิมพ์ QR ทุกโต๊ะ')}</button>
      <button className="button primary" onClick={onAdd} disabled={tables.length >= maxTables}><Plus size={19}/>{t('ເພີ່ມໂຕະ', 'เพิ่มโต๊ะ')}</button>
    </PageHeader>
    <StatTiles items={[
      { icon: QrCode, label: t('ໂຕະທັງໝົດ', 'โต๊ะทั้งหมด'), value: tables.length },
      { icon: Users, label: t('ບ່ອນນັ່ງ', 'ที่นั่ง'), value: tables.reduce((sum, table) => sum + table.seats, 0) },
      { icon: MapPin, label: t('ໂຊນ', 'โซน'), value: zones.length, note: zones.join(' · ') },
      { icon: Utensils, label: t('ມີລູກຄ້າຕອນນີ້', 'มีลูกค้าตอนนี้'), value: busyCount, note: `${t('ຫວ່າງ', 'ว่าง')} ${tables.length - busyCount} ${t('ໂຕະ', 'โต๊ะ')}`, tone: busyCount ? 'is-warm' : '' },
    ]}/>
    <div className="setup-grid">{tables.map(table => <article className={`setup-card ${busy(table.number) ? 'is-busy' : ''}`} key={table.number}>
      <header><span className="setup-number"><small>{t('ໂຕະ', 'โต๊ะ')}</small>{pad(table.number)}</span><span className={`badge ${busy(table.number) ? 'pending' : 'ready'}`}><span className="status-dot"/>{busy(table.number) ? t('ມີລູກຄ້າ', 'มีลูกค้า') : t('ຫວ່າງ', 'ว่าง')}</span></header>
      <ul><li><MapPin size={16}/>{zoneName(table)}</li><li><Users size={16}/>{table.seats} {t('ບ່ອນນັ່ງ', 'ที่นั่ง')}</li></ul>
      <footer><button className="button secondary" aria-label={`${t('ແກ້ໄຂ', 'แก้ไข')} ${t('ໂຕະ', 'โต๊ะ')} ${pad(table.number)}`} onClick={() => setEditing(table)}><Pencil size={16}/>{t('ແກ້ໄຂ', 'แก้ไข')}</button><IconButton label={`QR ${t('ໂຕະ', 'โต๊ะ')} ${pad(table.number)}`} onClick={() => onShowQr(table.number)}><QrCode size={20}/></IconButton></footer>
    </article>)}</div>
    <div className="setup-footer">
      <p>{busy(last.number) && tables.length > 1 ? t(`ໂຕະ ${pad(last.number)} ຍັງມີອໍເດີ · ລຶບໄດ້ຫຼັງປິດໂຕະ`, `โต๊ะ ${pad(last.number)} ยังมีออเดอร์ · ลบได้หลังปิดโต๊ะ`) : t('ລຶບໄດ້ສະເພາະໂຕະສຸດທ້າຍ ເພື່ອໃຫ້ເລກໂຕະ ແລະ QR ບໍ່ສັບສົນ', 'ลบได้เฉพาะโต๊ะสุดท้าย เพื่อไม่ให้เลขโต๊ะและ QR สับสน')}</p>
      <button className="danger-link" onClick={onRemoveLast} disabled={tables.length <= 1 || busy(last.number)}><Minus size={17}/>{t(`ລຶບໂຕະ ${pad(last.number)}`, `ลบโต๊ะ ${pad(last.number)}`)}</button>
    </div>
    {editing && <TableDialog table={editing} zones={zones.filter(zone => zone !== zoneName(editing))} onClose={() => setEditing(null)} onSave={changes => { if (onUpdate(editing.number, changes)) setEditing(null); }}/>}
    {printing && <QrSheetDialog tables={tables} shopName={shopName} onClose={() => setPrinting(false)}/>}
  </section>;
}

function TableDialog({ table, zones, onClose, onSave }) {
  const { t } = useL();
  const [zone, setZone] = useState(table.zone);
  const [seats, setSeats] = useState(table.seats);
  return <Dialog title={`${t('ແກ້ໄຂໂຕະ', 'แก้ไขโต๊ะ')} ${pad(table.number)}`} onClose={onClose} className="form-dialog">
    <form className="form-stack" onSubmit={event => { event.preventDefault(); onSave({ zone, seats }); }}>
      <label className="form-field"><span>{t('ໂຊນ', 'โซน')}</span><input data-autofocus value={zone} maxLength={24} placeholder={t('ຊັ້ນ 1', 'ชั้น 1')} onChange={event => setZone(event.target.value)}/></label>
      {zones.length > 0 && <div className="quick-amounts" role="group" aria-label={t('ໂຊນທີ່ມີແລ້ວ', 'โซนที่มีอยู่แล้ว')}>{zones.map(name => <button type="button" key={name} onClick={() => setZone(name)}>{name}</button>)}</div>}
      <div className="form-field"><span>{t('ບ່ອນນັ່ງ', 'ที่นั่ง')}</span><div className="stepper is-large" role="group" aria-label={t('ບ່ອນນັ່ງ', 'ที่นั่ง')}>
        <button type="button" aria-label={t('ຫຼຸດບ່ອນນັ່ງ', 'ลดที่นั่ง')} disabled={seats <= 1} onClick={() => setSeats(seats - 1)}><Minus size={20}/></button>
        <b aria-live="polite">{seats}</b>
        <button type="button" aria-label={t('ເພີ່ມບ່ອນນັ່ງ', 'เพิ่มที่นั่ง')} disabled={seats >= 30} onClick={() => setSeats(seats + 1)}><Plus size={20}/></button>
      </div></div>
      <button className="button primary full"><CheckCircle2 size={20}/>{t('ບັນທຶກ', 'บันทึก')}</button>
    </form>
  </Dialog>;
}

function QrSheetDialog({ tables, shopName, onClose }) {
  const { t } = useL();
  const { images, error } = useMenuQrs(tables.map(table => table.number));
  const ready = tables.every(table => images[table.number]);
  return <Dialog title={t('QR ທຸກໂຕະ', 'QR ทุกโต๊ะ')} onClose={onClose} className="qr-sheet-dialog">
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
  </Dialog>;
}

const permissionViews = ['tables', 'orders', 'kitchen', 'shift', 'menu', 'table-setup', 'staff', 'reports', 'settings'];

export function StaffView({ staff, user, onSave }) {
  const { t } = useL();
  const [editing, setEditing] = useState(null);
  return <section className="full-page bo-page">
    <PageHeader icon={UserCog} title={t('ພະນັກງານ', 'พนักงาน')} text={t('ກຳນົດຕຳແໜ່ງ ແລະ PIN ສຳລັບເຂົ້າໃຊ້ງານ', 'กำหนดตำแหน่งและ PIN สำหรับเข้าใช้งาน')}>
      <button className="button primary" onClick={() => setEditing({ role: 'cashier', active: true })}><Plus size={19}/>{t('ເພີ່ມພະນັກງານ', 'เพิ่มพนักงาน')}</button>
    </PageHeader>
    <StatTiles items={roles.map(role => ({ label: roleText(role, t), value: staff.filter(member => member.role === role && member.active).length, note: t('ຄົນທີ່ໃຊ້ງານໄດ້', 'คนที่ใช้งานได้'), tone: `role-${role}` }))}/>
    <div className="staff-grid">{staff.map(member => <article className={`staff-card ${member.active ? '' : 'is-inactive'}`} key={member.id}>
      <Avatar member={member}/>
      <div className="staff-card-body">
        <strong>{member.name}{member.id === user.id && <em>{t('ທ່ານ', 'คุณ')}</em>}</strong>
        <RoleChip role={member.role}/>
        <span className="staff-meta"><span className={`status-text ${member.active ? 'is-on' : ''}`}>{member.active ? t('ໃຊ້ງານໄດ້', 'ใช้งานได้') : t('ປິດການໃຊ້ງານ', 'ปิดใช้งาน')}</span> · PIN ••••</span>
      </div>
      <IconButton label={`${t('ແກ້ໄຂ', 'แก้ไข')} ${member.name}`} onClick={() => setEditing(member)}><Pencil size={18}/></IconButton>
    </article>)}</div>
    <section className="bo-card">
      <div className="bo-card-head"><div><h2>{t('ສິດການເຂົ້າເຖິງ', 'สิทธิ์การเข้าถึง')}</h2><p>{t('ແຕ່ລະຕຳແໜ່ງເຫັນສະເພາະໜ້າທີ່ມີເຄື່ອງໝາຍ ✓', 'แต่ละตำแหน่งเห็นเฉพาะหน้าที่มีเครื่องหมาย ✓')}</p></div></div>
      <div className="table-scroll"><table className="permission-table">
        <thead><tr><th scope="col">{t('ໜ້າຈໍ', 'หน้าจอ')}</th>{roles.map(role => <th scope="col" key={role}><RoleChip role={role}/></th>)}</tr></thead>
        <tbody>{permissionViews.map(view => { const Icon = viewIcons[view]; return <tr key={view}><th scope="row"><Icon size={17}/>{viewLabel(view, t)}</th>{roles.map(role => <td key={role}>{canOpen(role, view) ? <span className="permission-yes" aria-label={t('ເຂົ້າໄດ້', 'เข้าได้')}><Check size={16}/></span> : <span className="permission-no" aria-label={t('ເຂົ້າບໍ່ໄດ້', 'เข้าไม่ได้')}>–</span>}</td>)}</tr>; })}</tbody>
      </table></div>
    </section>
    {editing && <StaffDialog member={editing} isSelf={editing.id === user.id} onClose={() => setEditing(null)} onSave={member => { const error = onSave(member); if (!error) setEditing(null); return error; }}/>}
  </section>;
}

function StaffDialog({ member, isSelf, onClose, onSave }) {
  const { t } = useL();
  const [name, setName] = useState(member.name ?? '');
  const [role, setRole] = useState(member.role);
  const [pin, setPin] = useState(member.pin ?? '');
  const [active, setActive] = useState(member.active !== false);
  const [showPin, setShowPin] = useState(!member.id);
  const [error, setError] = useState('');
  const messages = {
    name: t('ກະລຸນາໃສ່ຊື່ ບໍ່ເກີນ 40 ຕົວອັກສອນ', 'กรุณาใส่ชื่อ ไม่เกิน 40 ตัวอักษร'),
    pin: t('PIN ຕ້ອງເປັນຕົວເລກ 4 ຫຼັກ', 'PIN ต้องเป็นตัวเลข 4 หลัก'),
    'last-owner': t('ຕ້ອງມີເຈົ້າຂອງຮ້ານທີ່ໃຊ້ງານໄດ້ຢ່າງໜ້ອຍ 1 ຄົນ', 'ต้องมีเจ้าของร้านที่ใช้งานได้อย่างน้อย 1 คน'),
  };
  function submit(event) {
    event.preventDefault();
    const code = onSave({ id: member.id, name, role, pin, active });
    if (code) setError(messages[code] ?? t('ບັນທຶກບໍ່ສຳເລັດ · ກະລຸນາລອງໃໝ່', 'บันทึกไม่สำเร็จ · กรุณาลองใหม่'));
  }
  return <Dialog title={member.id ? t('ແກ້ໄຂພະນັກງານ', 'แก้ไขพนักงาน') : t('ເພີ່ມພະນັກງານ', 'เพิ่มพนักงาน')} onClose={onClose} className="form-dialog">
    <form className="form-stack" onSubmit={submit}>
      <label className="form-field"><span>{t('ຊື່', 'ชื่อ')}</span><input data-autofocus value={name} maxLength={40} onChange={event => { setName(event.target.value); setError(''); }}/></label>
      <fieldset className="form-field"><legend>{t('ຕຳແໜ່ງ', 'ตำแหน่ง')}</legend>
        <div className="role-options">{roles.map(id => <button type="button" key={id} className={`role-option role-${id} ${role === id ? 'selected' : ''}`} aria-pressed={role === id} disabled={isSelf && id !== member.role} onClick={() => { setRole(id); setError(''); }}><span className="role-dot"/>{roleText(id, t)}</button>)}</div>
        {isSelf && <small>{t('ປ່ຽນຕຳແໜ່ງ ຫຼື ປິດບັນຊີຂອງຕົນເອງບໍ່ໄດ້', 'เปลี่ยนตำแหน่งหรือปิดบัญชีของตัวเองไม่ได้')}</small>}
      </fieldset>
      <label className="form-field"><span>{t('PIN 4 ຕົວເລກ', 'PIN 4 หลัก')}</span><span className="pin-input">
        <input type={showPin ? 'text' : 'password'} inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={event => { setPin(event.target.value.replace(/\D/g, '').slice(0, 4)); setError(''); }}/>
        <IconButton type="button" label={showPin ? t('ເຊື່ອງ PIN', 'ซ่อน PIN') : t('ສະແດງ PIN', 'แสดง PIN')} onClick={() => setShowPin(value => !value)}>{showPin ? <EyeOff size={20}/> : <Eye size={20}/>}</IconButton>
      </span></label>
      <label className="toggle-row"><span><strong>{t('ເປີດໃຫ້ໃຊ້ງານໄດ້', 'เปิดให้ใช้งานได้')}</strong><small>{t('ປິດໄວ້ເມື່ອພະນັກງານອອກ ປະຫວັດຍັງຢູ່ຄືເກົ່າ', 'ปิดไว้เมื่อพนักงานลาออก ประวัติยังอยู่เหมือนเดิม')}</small></span><input type="checkbox" className="switch-input" checked={active} disabled={isSelf} onChange={event => { setActive(event.target.checked); setError(''); }}/></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary full"><CheckCircle2 size={20}/>{t('ບັນທຶກ', 'บันทึก')}</button>
    </form>
  </Dialog>;
}

export function SwitchUserDialog({ staff, currentId, onSignIn, onClose }) {
  const { t } = useL();
  const [selected, setSelected] = useState(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState(false);
  function submit(event) {
    event.preventDefault();
    if (pin === selected.pin) onSignIn(selected);
    else { setError(true); setPin(''); }
  }
  return <Dialog title={t('ສະຫຼັບຜູ້ໃຊ້', 'สลับผู้ใช้')} onClose={onClose} className="form-dialog">
    {selected ? <form className="form-stack" onSubmit={submit}>
      <button type="button" className="text-link" onClick={() => setSelected(null)}><ArrowLeft size={17}/>{t('ເລືອກຄົນອື່ນ', 'เลือกคนอื่น')}</button>
      <div className="user-option is-static"><Avatar member={selected}/><span><strong>{selected.name}</strong><RoleChip role={selected.role}/></span></div>
      <label className="form-field"><span>{t('ໃສ່ PIN 4 ຕົວເລກ', 'ใส่ PIN 4 หลัก')}</span><input autoFocus className="pin-field" type="password" inputMode="numeric" autoComplete="off" maxLength={4} value={pin} onChange={event => { setPin(event.target.value.replace(/\D/g, '').slice(0, 4)); setError(false); }}/></label>
      {error && <p className="form-error" role="alert">{t('PIN ບໍ່ຖືກຕ້ອງ · ກະລຸນາລອງໃໝ່', 'PIN ไม่ถูกต้อง · กรุณาลองใหม่')}</p>}
      <button className="button primary full" disabled={pin.length !== 4}><LogIn size={20}/>{t('ເຂົ້າໃຊ້ງານ', 'เข้าใช้งาน')}</button>
    </form> : <div className="user-list">{staff.filter(member => member.active).map(member => <button key={member.id} className={`user-option ${member.id === currentId ? 'is-current' : ''}`} onClick={() => member.id === currentId ? onClose() : setSelected(member)}>
      <Avatar member={member}/>
      <span><strong>{member.name}</strong><RoleChip role={member.role}/></span>
      {member.id === currentId ? <span className="badge ready"><span className="status-dot"/>{t('ກຳລັງໃຊ້', 'กำลังใช้')}</span> : <ChevronRight size={19}/>}
    </button>)}</div>}
    <p className="demo-note">{t('ຕົ້ນແບບ: PIN ເລີ່ມຕົ້ນ ເຈົ້າຂອງ 1111 · ຜູ້ຈັດການ 2222 · ແຄຊເຊຍ 3333 · ຄົວ 4444', 'ต้นแบบ: PIN เริ่มต้น เจ้าของ 1111 · ผู้จัดการ 2222 · แคชเชียร์ 3333 · ครัว 4444')}</p>
  </Dialog>;
}

export function SettingsView({ settings, activity, menu, onSave, onReset }) {
  const { t } = useL();
  const [tab, setTab] = useState('shop');
  const tabs = [
    ['shop', Store, t('ຂໍ້ມູນຮ້ານ', 'ข้อมูลร้าน'), t('ຊື່ ສາຂາ ເບີໂທ', 'ชื่อ สาขา เบอร์โทร')],
    ['payments', Wallet, t('ການຊຳລະເງິນ', 'การชำระเงิน'), t('ວິທີຮັບເງິນ', 'วิธีรับเงิน')],
    ['activity', History, t('ປະຫວັດການໃຊ້ງານ', 'ประวัติการใช้งาน'), t('ໃຜເຮັດຫຍັງ ເມື່ອໃດ', 'ใครทำอะไร เมื่อไร')],
    ['demo', RotateCcw, t('ຂໍ້ມູນທົດລອງ', 'ข้อมูลทดลอง'), t('ລ້າງແລ້ວເລີ່ມໃໝ່', 'ล้างแล้วเริ่มใหม่')],
  ];
  return <section className="full-page bo-page">
    <PageHeader icon={Settings} title={t('ຕັ້ງຄ່າ', 'ตั้งค่า')} text={t('ຂໍ້ມູນຮ້ານ ວິທີຮັບເງິນ ແລະ ປະຫວັດວ່າໃຜເຮັດຫຍັງ', 'ข้อมูลร้าน วิธีรับเงิน และประวัติว่าใครทำอะไร')}/>
    <div className="settings-layout">
      <nav className="settings-nav" aria-label={t('ຕັ້ງຄ່າ', 'ตั้งค่า')}>{tabs.map(([id, Icon, label, hint]) => <button key={id} className={tab === id ? 'selected' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}><Icon size={20}/><span><strong>{label}</strong><small>{hint}</small></span></button>)}</nav>
      <div className="settings-panel">
        {tab === 'shop' && <ShopSettings settings={settings} onSave={onSave}/>}
        {tab === 'payments' && <PaymentSettings settings={settings} onSave={onSave}/>}
        {tab === 'activity' && <ActivityLog activity={activity} menu={menu}/>}
        {tab === 'demo' && <DemoSettings onReset={onReset}/>}
      </div>
    </div>
  </section>;
}

function ShopSettings({ settings, onSave }) {
  const { t } = useL();
  const [form, setForm] = useState({ shopName: settings.shopName, branch: settings.branch, phone: settings.phone });
  const [error, setError] = useState('');
  const changed = Object.keys(form).some(field => form[field].trim() !== settings[field]);
  const field = (name, label, placeholder, limit) => <label className="form-field"><span>{label}</span><input value={form[name]} maxLength={limit} placeholder={placeholder} onChange={event => { setForm({ ...form, [name]: event.target.value }); setError(''); }}/></label>;
  function submit(event) {
    event.preventDefault();
    if (onSave(form)) setError(t('ບັນທຶກບໍ່ສຳເລັດ · ກວດຄວາມຍາວຂອງຂໍ້ຄວາມ', 'บันทึกไม่สำเร็จ · ตรวจความยาวข้อความ'));
  }
  return <form className="bo-card settings-shop" onSubmit={submit}>
    <div className="form-stack">
      <div className="bo-card-head"><div><h2>{t('ຂໍ້ມູນຮ້ານ', 'ข้อมูลร้าน')}</h2><p>{t('ປ່ອຍວ່າງເພື່ອໃຊ້ຊື່ມາດຕະຖານ', 'เว้นว่างเพื่อใช้ชื่อมาตรฐาน')}</p></div></div>
      {field('shopName', t('ຊື່ຮ້ານ', 'ชื่อร้าน'), t('ຮ້ານເຂົ້າປຽກ', 'ร้านข้าวเปียก'), 40)}
      {field('branch', t('ສາຂາ', 'สาขา'), t('ສາຂາ ວຽງຈັນ', 'สาขา เวียงจันทน์'), 40)}
      {field('phone', t('ເບີໂທ', 'เบอร์โทร'), '020 0000 0000', 30)}
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary" disabled={!changed}><CheckCircle2 size={20}/>{t('ບັນທຶກ', 'บันทึก')}</button>
    </div>
    <aside className="shop-preview" aria-label={t('ຕົວຢ່າງ', 'ตัวอย่าง')}>
      <small>{t('ຕົວຢ່າງທີ່ລູກຄ້າເຫັນ', 'ตัวอย่างที่ลูกค้าเห็น')}</small>
      <div className="shop-preview-card"><span className="bo-icon"><Store size={22}/></span><strong>{form.shopName.trim() || t('ຮ້ານເຂົ້າປຽກ', 'ร้านข้าวเปียก')}</strong><span>{form.branch.trim() || t('ສາຂາ ວຽງຈັນ', 'สาขา เวียงจันทน์')}</span>{form.phone.trim() && <span>{form.phone.trim()}</span>}<span className="shop-preview-qr"><QrCode size={46} strokeWidth={1.3}/></span></div>
    </aside>
  </form>;
}

function PaymentSettings({ settings, onSave }) {
  const { t } = useL();
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
        <button className={`switch ${on ? 'on' : ''}`} role="switch" aria-checked={on} aria-label={methodText(method, t)} disabled={onlyOne} onClick={() => onSave({ methods: on ? settings.methods.filter(item => item !== method) : [...settings.methods, method] })}><span/></button>
      </div>;
    })}</div>
  </div>;
}

const activityKinds = {
  order: [ClipboardList, 'tone-neutral'], pay: [Banknote, 'tone-money'], start: [Flame, 'tone-kitchen'], ready: [ChefHat, 'tone-kitchen'],
  serve: [CheckCircle2, 'tone-kitchen'], close: [CheckCircle2, 'tone-money'], 'sold-out': [Utensils, 'tone-warn'], available: [Utensils, 'tone-neutral'],
  'shift-open': [Wallet, 'tone-money'], 'shift-close': [Wallet, 'tone-money'], staff: [UserCog, 'tone-admin'], tables: [QrCode, 'tone-admin'],
  table: [QrCode, 'tone-admin'], settings: [Settings, 'tone-admin'], signin: [LogIn, 'tone-neutral'],
  call: [BellRing, 'tone-warn'], 'call-answered': [Check, 'tone-neutral'], undo: [Undo2, 'tone-warn'], dish: [Pencil, 'tone-admin'], 'dish-deleted': [Utensils, 'tone-admin'],
};
const callReasonText = (reason, t) => ({ help: t('ເອີ້ນພະນັກງານ', 'เรียกพนักงาน'), pay: t('ຂໍຈ່າຍເງິນທີ່ໂຕະ', 'ขอจ่ายเงินที่โต๊ะ'), water: t('ຂໍນ້ຳເປົ່າ', 'ขอน้ำเปล่า') }[reason] ?? t('ເອີ້ນພະນັກງານ', 'เรียกพนักงาน'));

function activityText(entry, t, lang, menu) {
  const table = entry.table ? ` · ${t('ໂຕະ', 'โต๊ะ')} ${pad(entry.table)}` : '';
  const dish = itemName(menu.find(item => item.id === entry.itemId) ?? { lo: entry.itemId ?? '' }, lang);
  return {
    order: `${t('ສັ່ງອາຫານ', 'สั่งอาหาร')} #${entry.orderId}${table}`,
    pay: `${t('ຮັບເງິນ', 'รับเงิน')} #${entry.orderId} · ${money(entry.amount ?? 0)} ₭ · ${methodText(entry.method, t)}`,
    start: `${t('ເລີ່ມເຮັດອາຫານ', 'เริ่มทำอาหาร')} #${entry.orderId}${table}`,
    ready: `${t('ອາຫານພ້ອມເສີບ', 'อาหารพร้อมเสิร์ฟ')} #${entry.orderId}${table}`,
    serve: `${t('ເສີບແລ້ວ', 'เสิร์ฟแล้ว')} #${entry.orderId}${table}`,
    close: `${t('ປິດອໍເດີ', 'ปิดออเดอร์')} #${entry.orderId}${table}`,
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
    undo: `${t('ເອົາຄືນ', 'เอาคืน')} #${entry.orderId}${table}`,
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

function DemoSettings({ onReset }) {
  const { t } = useL();
  const [confirming, setConfirming] = useState(false);
  return <div className="bo-card danger-zone">
    <div className="bo-card-head"><div><h2>{t('ລ້າງຂໍ້ມູນທົດລອງ', 'ล้างข้อมูลทดลอง')}</h2><p>{t('ລຶບອໍເດີ ກະ ພະນັກງານ ໂຕະ ແລະ ການຕັ້ງຄ່າທີ່ບັນທຶກໃນ Browser ນີ້ ແລ້ວເລີ່ມຈາກຂໍ້ມູນຕົວຢ່າງໃໝ່', 'ลบออเดอร์ กะ พนักงาน โต๊ะ และการตั้งค่าที่บันทึกใน Browser นี้ แล้วเริ่มจากข้อมูลตัวอย่างใหม่')}</p></div></div>
    <button className="button danger" onClick={() => setConfirming(true)}><RotateCcw size={19}/>{t('ລ້າງຂໍ້ມູນທົດລອງ', 'ล้างข้อมูลทดลอง')}</button>
    {confirming && <Dialog title={t('ລ້າງຂໍ້ມູນທັງໝົດ?', 'ล้างข้อมูลทั้งหมด?')} onClose={() => setConfirming(false)} className="form-dialog">
      <p className="dialog-intro">{t('ຂໍ້ມູນໃນ Browser ນີ້ຈະຫາຍໄປ ແລະ ກູ້ຄືນບໍ່ໄດ້ · ແທັບອື່ນຂອງ Browser ນີ້ກໍຈະເລີ່ມໃໝ່ເຊັ່ນກັນ', 'ข้อมูลใน Browser นี้จะหายไปและกู้คืนไม่ได้ · แท็บอื่นของ Browser นี้ก็จะเริ่มใหม่เช่นกัน')}</p>
      <div className="dialog-actions"><button className="button secondary" onClick={() => setConfirming(false)}>{t('ຍົກເລີກ', 'ยกเลิก')}</button><button className="button danger" onClick={onReset}><RotateCcw size={19}/>{t('ລ້າງ ແລະ ເລີ່ມໃໝ່', 'ล้างและเริ่มใหม่')}</button></div>
    </Dialog>}
  </div>;
}
