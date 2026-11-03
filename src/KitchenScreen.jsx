import React, { useEffect, useRef, useState } from 'react';
import { BellRing, Check, ChefHat, Clock3, Flame, Volume2, VolumeX } from 'lucide-react';
import { EmptyState, PageHeader, itemName, pad, useL } from './staff-ui';
import { kitchenTotals } from './backoffice-model.mjs';

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
  const todo = orders.filter(order => order.paid && ['queued', 'cooking'].includes(order.status)).sort(byWait);
  const ready = orders.filter(order => order.paid && order.status === 'ready').sort(byWait);
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
  return <section className="full-page bo-page kds">
    <PageHeader icon={ChefHat} title={t('ໜ້າຈໍຄົວ', 'หน้าจอครัว')} text={todo.length ? t(`${todo.length} ອໍເດີລໍຖ້າ · ເຮັດອັນເກົ່າສຸດກ່ອນ`, `${todo.length} ออเดอร์รออยู่ · ทำออเดอร์ที่เก่าที่สุดก่อน`) : t('ບໍ່ມີອາຫານຄ້າງ', 'ไม่มีอาหารค้าง')}>
      <button className={`button secondary sound-toggle ${sound ? 'is-on' : ''}`} aria-pressed={sound} onClick={toggleSound}>{sound ? <Volume2 size={19}/> : <VolumeX size={19}/>}{sound ? t('ສຽງແຈ້ງເຕືອນເປີດ', 'เสียงแจ้งเตือนเปิด') : t('ເປີດສຽງແຈ້ງເຕືອນ', 'เปิดเสียงแจ้งเตือน')}</button>
    </PageHeader>
    {totals.length > 0 && <div className="kds-totals" aria-label={t('ຕ້ອງເຮັດທັງໝົດ', 'ต้องทำทั้งหมด')}><span className="kds-totals-label">{t('ຕ້ອງເຮັດທັງໝົດ', 'ต้องทำทั้งหมด')}</span>{totals.map(row => <span className="kds-total" key={row.key}><b>{row.quantity}</b>{itemName(row.item, lang)}{row.size === 'large' && <em>{t('ພິເສດ', 'พิเศษ')}</em>}</span>)}</div>}
    {todo.length ? <div className="kds-grid">{todo.map(order => {
      const waited = minutes(order);
      return <article className={`kds-ticket ${order.status} ${waited >= 15 ? 'is-late' : ''}`} key={order.id}>
        <header><span className="kds-table"><small>{t('ໂຕະ', 'โต๊ะ')}</small>{pad(order.table)}</span><span className="kds-meta"><span className="kds-state">{order.status === 'cooking' ? <Flame size={15}/> : <Clock3 size={15}/>}{order.status === 'cooking' ? t('ກຳລັງເຮັດ', 'กำลังทำ') : t('ລໍຖ້າເຮັດ', 'รอทำ')}</span><span className="kds-wait">{waited} {t('ນາທີ', 'นาที')} · #{order.id}</span></span></header>
        <ul className="kds-items">{order.items.map((item, index) => <li key={index}><b>{item.quantity}</b><span><strong>{itemName(item, lang)}</strong>{item.size === 'large' && <em className="kds-tag">{t('ພິເສດ', 'พิเศษ')}</em>}{item.note && <em className="kds-note">{lang === 'th' ? item.noteTh || item.note : item.note}</em>}</span></li>)}</ul>
        <footer>{order.status === 'queued' ? <button className="button secondary full" onClick={() => onAct(order.id, 'start')}><Flame size={20}/>{t('ເລີ່ມເຮັດ', 'เริ่มทำ')}</button> : <button className="button primary full" onClick={() => onAct(order.id, 'ready')}><Check size={21}/>{t('ພ້ອມເສີບ', 'พร้อมเสิร์ฟ')}</button>}</footer>
      </article>;
    })}</div> : <EmptyState icon={ChefHat} title={t('ຄົວວ່າງ', 'ครัวว่าง')} text={t('ອໍເດີຈະມາທີ່ນີ້ທັນທີ ຫຼັງແຄຊເຊຍຢືນຢັນຮັບເງິນ', 'ออเดอร์จะแสดงที่นี่ทันทีหลังแคชเชียร์ยืนยันรับเงิน')}/>}
    {ready.length > 0 && <section className="kds-ready"><h2><BellRing size={18}/>{t('ພ້ອມເສີບ · ລໍພະນັກງານມາຮັບ', 'พร้อมเสิร์ฟ · รอพนักงานมารับ')}</h2><div>{ready.map(order => <span className="kds-ready-chip" key={order.id}><b>{t('ໂຕະ', 'โต๊ะ')} {pad(order.table)}</b>#{order.id} · {minutes(order)} {t('ນາທີ', 'นาที')}</span>)}</div></section>}
  </section>;
}
