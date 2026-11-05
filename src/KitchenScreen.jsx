import React, { useEffect, useRef, useState } from 'react';
import { BellRing, Check, ChefHat, ChevronDown, Clock3, Flame, Volume2, VolumeX } from 'lucide-react';
import { EmptyState, PageHeader, itemName, pad, useL } from './staff-ui';
import { kitchenTotals } from './backoffice-model.mjs';
import './kitchen.css';

// The sound setting belongs to this screen's device, like the signed-in person.
const soundKey = 'khao-piek:demo:kitchen-sound';
const readSound = () => { try { return localStorage.getItem(soundKey) === 'on'; } catch { return false; } };
let audio = null;
// Browsers only allow sound after someone has touched the page, so the context starts on a tap.
const wakeAudio = () => { try { audio ??= new AudioContext(); return audio.resume(); } catch { return null; } };
function ding() {
  if (!audio || audio.state !== 'running') return;
  [880, 1320].forEach((frequency, index) => {
    const start = audio.currentTime + index * 0.18;
    const tone = audio.createOscillator();
    const volume = audio.createGain();
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0.0001, start);
    volume.gain.exponentialRampToValueAtTime(0.25, start + 0.02);
    volume.gain.exponentialRampToValueAtTime(0.0001, start + 0.4);
    tone.connect(volume).connect(audio.destination);
    tone.start(start);
    tone.stop(start + 0.45);
  });
}

export function KitchenScreen({ orders, onAct, now }) {
  const { t, lang } = useL();
  const [sound, setSound] = useState(readSound);
  // Kitchen time starts when the order was paid, not when the guest first ordered.
  const since = order => order.paidAt ?? order.createdAt;
  const byWait = (a, b) => since(a) - since(b);
  const waiting = orders.filter(order => order.paid && order.status === 'queued').sort(byWait);
  const cooking = orders.filter(order => order.paid && order.status === 'cooking').sort(byWait);
  const todo = [...waiting, ...cooking];
  const ready = orders.filter(order => order.paid && order.status === 'ready').sort(byWait);
  const [mobileLane, setMobileLane] = useState(() => waiting.length || !cooking.length ? 'queued' : 'cooking');
  const seen = useRef(new Set(todo.map(order => order.id)));
  const todoKey = todo.map(order => order.id).join();
  useEffect(() => {
    const fresh = todo.filter(order => !seen.current.has(order.id));
    todo.forEach(order => seen.current.add(order.id));
    if (fresh.length && sound) ding();
  }, [todoKey, sound]);
  useEffect(() => {
    if (!sound) return;
    const wake = () => wakeAudio();
    addEventListener('pointerdown', wake, { once: true });
    return () => removeEventListener('pointerdown', wake);
  }, [sound]);
  function toggleSound() {
    const next = !sound;
    setSound(next);
    try { localStorage.setItem(soundKey, next ? 'on' : 'off'); } catch { /* the choice still applies until reload */ }
    if (next) wakeAudio()?.then(ding);
  }
  const minutes = order => Math.max(0, Math.floor((now.getTime() - since(order)) / 60000));
  const totals = kitchenTotals(todo);
  const lanes = [
    { id: 'queued', title: t('ລໍຖ້າເຮັດ', 'รอทำ'), orders: waiting, icon: Clock3 },
    { id: 'cooking', title: t('ກຳລັງເຮັດ', 'กำลังทำ'), orders: cooking, icon: Flame },
  ];
  return <section className="full-page bo-page kds kitchen-board" data-mobile-lane={mobileLane}>
    <PageHeader icon={ChefHat} title={t('ໜ້າຈໍຄົວ', 'หน้าจอครัว')} text={t('ເຮັດອໍເດີທີ່ລໍຖ້າດົນສຸດກ່ອນ', 'ทำออเดอร์ที่รอนานที่สุดก่อน')}>
      <button className={`button secondary kitchen-sound ${sound ? 'is-on' : ''}`} aria-pressed={sound} onClick={toggleSound}>{sound ? <Volume2 size={19}/> : <VolumeX size={19}/>}{sound ? t('ສຽງເປີດ', 'เสียงเปิด') : t('ເປີດສຽງແຈ້ງເຕືອນ', 'เปิดเสียงแจ้งเตือน')}</button>
    </PageHeader>

    {ready.length > 0 && <section className="kitchen-ready" aria-label={t('ພ້ອມເສີບ', 'พร้อมเสิร์ฟ')}>
      <div className="kitchen-section-heading"><h2><BellRing size={21}/>{t('ພ້ອມເສີບ', 'พร้อมเสิร์ฟ')}<span>{ready.length}</span></h2><p>{t('ລໍຖ້າພະນັກງານມາຮັບ', 'รอพนักงานมารับ')}</p></div>
      <div className="kitchen-ready-list">{ready.map(order => <details className="kitchen-ready-order" key={order.id}>
        <summary>
          <span className="kitchen-ready-table"><span>{t('ໂຕະ', 'โต๊ะ')}</span><strong>{pad(order.table)}</strong></span>
          <span className="kitchen-ready-meta"><strong>#{order.id}</strong><span>{order.items.length} {t('ລາຍການ', 'รายการ')}</span>{order.items.some(item => item.note) && <span className="kitchen-ready-note">{t('ມີໝາຍເຫດ', 'มีหมายเหตุ')}</span>}</span>
          <ChevronDown className="kitchen-ready-chevron" size={19} aria-hidden="true"/>
        </summary>
        <ul className="kitchen-ready-items">{order.items.map((item, index) => <li key={index}><b>{item.quantity}×</b><div><span>{itemName(item, lang)}{item.size === 'large' && <em>{t('ພິເສດ', 'พิเศษ')}</em>}</span>{item.note && <p className="kitchen-note">{lang === 'th' ? item.noteTh || item.note : item.note}</p>}</div></li>)}</ul>
      </details>)}</div>
    </section>}

    {totals.length > 0 && <details className="kitchen-batch"><summary>{t('ຈຳນວນອາຫານທີ່ຍັງຕ້ອງເຮັດ', 'ยอดอาหารที่ยังต้องทำ')}</summary><ul>{totals.map(row => <li key={row.key}><b>{row.quantity}</b><span>{itemName(row.item, lang)}{row.size === 'large' && <em>{t('ພິເສດ', 'พิเศษ')}</em>}</span></li>)}</ul></details>}

    {!todo.length && !ready.length ? <EmptyState icon={ChefHat} title={t('ຄົວວ່າງ', 'ครัวว่าง')} text={t('ອໍເດີຈະສະແດງທີ່ນີ້ຫຼັງແຄຊເຊຍຢືນຢັນຮັບເງິນ', 'ออเดอร์จะแสดงที่นี่หลังแคชเชียร์ยืนยันรับเงิน')}/> : <>
      <div className="kitchen-queue-switch" role="group" aria-label={t('ເລືອກຄິວຄົວ', 'เลือกคิวครัว')}>{lanes.map(lane => <button key={lane.id} aria-pressed={mobileLane === lane.id} onClick={() => setMobileLane(lane.id)}><lane.icon size={20}/><span>{lane.title}</span><b>{lane.orders.length}</b></button>)}</div>
      <div className="kitchen-lanes">{lanes.map((lane, index) => {
        const other = lanes[1 - index];
        return <section className="kitchen-lane" data-lane={lane.id} aria-label={lane.title} key={lane.id}>
          <div className="kitchen-section-heading"><h2><lane.icon size={21}/>{lane.title}<span>{lane.orders.length}</span></h2></div>
          {lane.orders.length ? <div className="kitchen-tickets">{lane.orders.map(order => <KitchenTicket key={order.id} order={order} waited={minutes(order)} onAct={onAct}/>)}</div> : <div className="kitchen-lane-empty">
            <Check size={26}/><h3>{lane.id === 'queued' ? t('ບໍ່ມີອໍເດີລໍຖ້າ', 'ไม่มีออเดอร์รอทำ') : t('ຍັງບໍ່ມີອໍເດີທີ່ກຳລັງເຮັດ', 'ยังไม่มีออเดอร์กำลังทำ')}</h3>
            <p>{lane.id === 'queued' ? t('ອໍເດີໃໝ່ຈະມາຫຼັງຢືນຢັນຮັບເງິນ', 'ออเดอร์ใหม่จะเข้ามาหลังยืนยันรับเงิน') : t('ກົດ “ເລີ່ມເຮັດ” ຈາກຄິວລໍຖ້າ', 'กด “เริ่มทำ” จากคิวรอทำ')}</p>
            {other.orders.length > 0 && <button className="button secondary kitchen-empty-switch" onClick={() => setMobileLane(other.id)}>{other.id === 'cooking' ? t('ເບິ່ງອໍເດີທີ່ກຳລັງເຮັດ', 'ดูกำลังทำ') : t('ເບິ່ງຄິວລໍຖ້າ', 'ดูคิวรอทำ')} ({other.orders.length})</button>}
          </div>}
        </section>;
      })}</div>
    </>}
  </section>;
}

function KitchenTicket({ order, waited, onAct }) {
  const { t, lang } = useL();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const waiting = order.status === 'queued';
  function advance() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setFailed(false);
    try { if (onAct(order.id, waiting ? 'start' : 'ready')) return; } catch { /* keep the ticket available for retry */ }
    lock.current = false;
    setBusy(false);
    setFailed(true);
  }
  const action = <footer>{failed && <p className="kitchen-action-error" role="alert">{t('ບັນທຶກບໍ່ສຳເລັດ · ກະລຸນາລອງໃໝ່', 'บันทึกไม่สำเร็จ · กรุณาลองใหม่')}</p>}<button className={`button ${waiting ? 'secondary' : 'primary'} full`} onClick={advance} disabled={busy}>{waiting ? <Flame size={22}/> : <Check size={23}/>} {busy ? t('ກຳລັງບັນທຶກ…', 'กำลังบันทึก…') : waiting ? t('ເລີ່ມເຮັດ', 'เริ่มทำ') : t('ພ້ອມເສີບ', 'พร้อมเสิร์ฟ')}</button></footer>;
  return <article className={`kitchen-ticket ${waited >= 15 ? 'is-late' : ''}`} data-state={order.status}>
    <header><h3><small>{t('ໂຕະ', 'โต๊ะ')}</small>{pad(order.table)}</h3><div><strong>#{order.id}</strong><span><Clock3 size={16}/>{t('ລໍຖ້າ', 'รอ')} {waited} {t('ນາທີ', 'นาที')}</span></div></header>
    {waiting && action}
    <ul className="kitchen-ticket-items">{order.items.map((item, index) => <li key={index}><b>{item.quantity}</b><div><strong>{itemName(item, lang)}</strong>{item.size === 'large' && <em className="kitchen-size">{t('ພິເສດ', 'พิเศษ')}</em>}{item.note && <p className="kitchen-note">{lang === 'th' ? item.noteTh || item.note : item.note}</p>}</div></li>)}</ul>
    {!waiting && action}
  </article>;
}
