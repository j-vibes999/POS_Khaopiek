import React, { useEffect } from 'react';
import { Armchair, Banknote, BellRing, Check, CheckCircle2, Clock3, CookingPot, GlassWater, Hand, LayoutGrid, Printer, Users, Utensils } from 'lucide-react';
import { EmptyState, money, pad, statusText, useL } from './staff-ui';
import { matchesStaffTable, nextStaffOrder, staffOrderState, summarizeStaffTable } from './staff-model.mjs';

export const staffStatusIcons = { pending: Banknote, handoff: Printer, queued: CookingPot, cooking: CookingPot, ready: BellRing, served: Utensils, empty: Armchair };
export const staffStatusGroup = status => ['queued', 'cooking'].includes(status) ? 'kitchen' : status;
const callIcons = { help: Hand, pay: Banknote, water: GlassWater };
const callLabel = (reason, t) => ({ help: t('ເອີ້ນພະນັກງານ', 'เรียกพนักงาน'), pay: t('ຂໍຈ່າຍເງິນທີ່ໂຕະ', 'ขอจ่ายเงินที่โต๊ะ'), water: t('ຂໍນ້ຳເປົ່າ', 'ขอน้ำเปล่า') }[reason]);

export function StaffStatusFilters({ filters, current, count, unit, label, onSelect }) {
  return <div className="counter-task-filters" role="group" aria-label={label}>
    {filters.map(([id, name, Icon]) => {
      const selected = current === id;
      const total = count(id);
      return <button key={id} className={`counter-task-filter ${id}${selected ? ' is-selected' : ''}`} aria-pressed={selected} aria-label={`${name} · ${total} ${unit}`} onClick={() => onSelect(id)}>
        <span className="counter-filter-top"><Icon size={19} aria-hidden="true"/><b>{total}</b></span>
        <span className="counter-filter-label"><span>{name}</span>{selected && <Check size={15} aria-hidden="true"/>}</span>
      </button>;
    })}
  </div>;
}

export function TablesScreen({ tables, activeOrders, calls, activeTable, filter, setFilter, now, onSelect }) {
  const { t } = useL();
  const states = tables.map(table => ({ table, ...summarizeStaffTable(activeOrders.filter(order => order.table === table.number), calls[table.number]) }));
  const filters = [
    ['all', t('ທຸກໂຕະ', 'ทุกโต๊ะ'), LayoutGrid],
    ['pending', statusText('pending', t), Banknote],
    ['handoff', statusText('handoff', t), Printer],
    ['kitchen', statusText('cooking', t), CookingPot],
    ['ready', t('ພ້ອມເສີບ', 'พร้อมเสิร์ฟ'), BellRing],
    ['served', statusText('served', t), Utensils],
    ['calls', t('ລູກຄ້າເອີ້ນ', 'ลูกค้าเรียก'), Hand],
    ['empty', statusText('empty', t), Armchair],
  ].filter(([id]) => !['handoff', 'ready', 'calls'].includes(id) || states.some(state => matchesStaffTable(state, id)));
  const [current, selectedLabel, SelectedIcon] = filters.find(([id]) => id === filter) ?? filters[0];
  useEffect(() => {
    if (current !== filter) setFilter(current);
  }, [current, filter, setFilter]);
  const count = id => states.filter(state => matchesStaffTable(state, id)).length;
  const shown = states.filter(state => matchesStaffTable(state, current));
  const zoneName = table => table.zone || t('ຊັ້ນ 1', 'ชั้น 1');
  const zones = [...new Set(tables.map(zoneName))];
  const waiting = states.filter(state => state.call || state.pendingCount || state.readyCount || matchesStaffTable(state, 'handoff')).length;

  return <section className="table-workspace counter-workspace" aria-labelledby="counter-title">
    <div className="page-heading"><div><h1 id="counter-title">{t('ໜ້າຮ້ານ', 'หน้าร้าน')}</h1><p>{waiting
      ? t(`${waiting} ໂຕະລໍຖ້າທ່ານ · ເລືອກໂຕະເພື່ອເຮັດຕໍ່`, `${waiting} โต๊ะรอคุณอยู่ · เลือกโต๊ะเพื่อทำต่อ`)
      : t('ບໍ່ມີວຽກດ່ວນ · ເລືອກໂຕະເພື່ອເບິ່ງອໍເດີ', 'ไม่มีงานด่วน · เลือกโต๊ะเพื่อดูออเดอร์')}</p></div></div>

    <StaffStatusFilters filters={filters} current={current} count={count} unit={t('ໂຕະ', 'โต๊ะ')} label={t('ວຽກໜ້າຮ້ານ', 'งานหน้าร้าน')} onSelect={setFilter}/>

    <div className="counter-results-bar">
      <h2>{selectedLabel}<span>{shown.length} {t('ໂຕະ', 'โต๊ะ')}</span></h2>
    </div>

    {shown.length ? zones.map(zone => {
      const inZone = shown.filter(state => zoneName(state.table) === zone);
      return inZone.length > 0 && <div className="table-zone" key={zone}>
        {zones.length > 1 && <h3 className="zone-title">{zone}<span>{inZone.length}</span></h3>}
        <div className="table-grid counter-table-grid">{inZone.map(state => <CounterTable key={state.table.number} {...state} filter={current} active={activeTable === state.table.number} now={now} onSelect={() => onSelect(state.table.number)}/>)}</div>
      </div>;
    }) : <EmptyState icon={SelectedIcon} title={t('ບໍ່ມີໂຕະໃນລາຍການນີ້', 'ไม่มีโต๊ะในรายการนี้')} text={t('ເລືອກ “ທຸກໂຕະ” ເພື່ອເບິ່ງໜ້າຮ້ານ', 'เลือก “ทุกโต๊ะ” เพื่อดูหน้าร้าน')}>
      <button className="button secondary" onClick={() => setFilter('all')}>{t('ເບິ່ງທຸກໂຕະ', 'ดูทุกโต๊ะ')}</button>
    </EmptyState>}
  </section>;
}

function CounterTable({ table, orders, due, readyCount, call, filter, active, now, onSelect }) {
  const { t } = useL();
  const order = nextStaffOrder(orders, null, filter);
  const status = order ? staffOrderState(order) : 'empty';
  const Icon = staffStatusIcons[status];
  const CallIcon = call && callIcons[call.reason];
  const minutes = order ? Math.max(0, Math.floor((now.getTime() - (order.paidAt ?? order.createdAt)) / 60000)) : 0;
  const label = `${t('ໂຕະ', 'โต๊ะ')} ${pad(table.number)} · ${statusText(status, t)}${call ? ` · ${callLabel(call.reason, t)}` : ''}${orders.length ? ` · ${t('ຄ້າງຊຳລະ', 'ค้างชำระ')} ${money(due)} ₭` : ''}`;

  return <button className={`table-tile counter-tile ${staffStatusGroup(status)} ${active ? 'is-active' : ''} ${call ? 'has-call' : ''}`} onClick={onSelect} aria-pressed={active} aria-label={label}>
    <span className="counter-tile-head"><span className="counter-table-number">{pad(table.number)}</span>{active && <span className="selected-mark"><Check size={14}/></span>}</span>
    {call && <span className="counter-guest-call"><CallIcon size={15}/>{callLabel(call.reason, t)}</span>}
    <span className="counter-table-state"><Icon size={18}/>{statusText(status, t)}</span>
    {readyCount > 0 && status !== 'ready' && <span className="counter-ready-note"><BellRing size={15}/>{t('ພ້ອມເສີບ', 'พร้อมเสิร์ฟ')} {readyCount}</span>}
    <span className="counter-table-payment">{orders.length ? due > 0
      ? <><small>{t('ຄ້າງຊຳລະ', 'ค้างชำระ')}</small><strong>{money(due)} <small>₭</small></strong></>
      : <span className="counter-paid"><CheckCircle2 size={16}/>{t('ຊຳລະຄົບແລ້ວ', 'ชำระครบแล้ว')}</span>
      : <span className="counter-seats"><Users size={16}/>{table.seats} {t('ບ່ອນນັ່ງ', 'ที่นั่ง')}</span>}</span>
    {order && <span className={`counter-table-foot ${minutes >= 15 && ['pending', 'queued', 'cooking'].includes(status) ? 'is-late' : ''}`}><span><Clock3 size={13}/>{minutes} {t('ນາທີ', 'นาที')}</span>{orders.length > 1 && <span>{orders.length} {t('ອໍເດີ', 'ออเดอร์')}</span>}</span>}
  </button>;
}
