import React, { useState } from 'react';
import { CheckCircle2, Pencil, Plus, Search, Star, Trash2, Utensils } from 'lucide-react';
import { Dialog, EmptyState, IconButton, PageHeader, itemName, money, useL } from './staff-ui';
import { menuCategories, menuImages } from './backoffice-model.mjs';
import { customerCategory } from './customer-model.mjs';

const categoryLabel = (id, t) => ({ all: t('ທັງໝົດ', 'ทั้งหมด'), khao: t('ເຂົ້າປຽກ', 'ข้าวเปียก'), pho: t('ເຝີ', 'เฝอ'), drinks: t('ເຄື່ອງດື່ມ', 'เครื่องดื่ม'), other: t('ອື່ນໆ', 'อื่น ๆ') }[id]);

export function MenuAdmin({ menu, canEdit, onToggle, onSave, onDelete }) {
  const { t, lang } = useL();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState(null);
  const search = query.trim().toLocaleLowerCase();
  const shown = menu.filter(dish => (category === 'all' || customerCategory(dish) === category) && (!search || [dish.lo, dish.th, dish.en].some(name => name?.toLocaleLowerCase().includes(search))));
  const soldOut = menu.filter(dish => !dish.available).length;
  return <section className="full-page bo-page">
    <PageHeader icon={Utensils} title={t('ຈັດການເມນູ', 'จัดการเมนู')} text={soldOut ? t(`ພ້ອມຂາຍ ${menu.length - soldOut} ຈາກ ${menu.length} · ໝົດ ${soldOut} ລາຍການ`, `พร้อมขาย ${menu.length - soldOut} จาก ${menu.length} · หมด ${soldOut} รายการ`) : t(`ພ້ອມຂາຍທັງໝົດ ${menu.length} ລາຍການ`, `พร้อมขายทั้งหมด ${menu.length} รายการ`)}>
      {canEdit && <button className="button primary" onClick={() => setEditing({ category: category === 'all' ? 'khao' : category, image: menuImages[0] })}><Plus size={19}/>{t('ເພີ່ມເມນູ', 'เพิ่มเมนู')}</button>}
    </PageHeader>
    <div className="orders-toolbar">
      <div className="table-filters" role="group" aria-label={t('ໝວດເມນູ', 'หมวดเมนู')}>{['all', ...menuCategories].map(id => <button key={id} className={`filter-chip ${category === id ? 'selected' : ''}`} aria-pressed={category === id} onClick={() => setCategory(id)}><span>{categoryLabel(id, t)}</span><b>{id === 'all' ? menu.length : menu.filter(dish => customerCategory(dish) === id).length}</b></button>)}</div>
      <label className="search-field"><Search size={18}/><input type="search" aria-label={t('ຄົ້ນຫາເມນູ', 'ค้นหาเมนู')} placeholder={t('ຄົ້ນຫາເມນູ…', 'ค้นหาเมนู…')} value={query} onChange={event => setQuery(event.target.value)}/></label>
    </div>
    {shown.length ? <div className="dish-grid">{shown.map(dish => <article className={`dish-card ${dish.available ? '' : 'is-sold-out'}`} key={dish.id}>
      <span className="dish-photo"><img src={dish.image} alt="" width="320" height="200" loading="lazy"/>{dish.popular && <span className="dish-popular"><Star size={13}/>{t('ຂາຍດີ', 'ขายดี')}</span>}{!dish.available && <span className="dish-sold-out">{t('ໝົດຊົ່ວຄາວ', 'หมดชั่วคราว')}</span>}</span>
      <div className="dish-body">
        <div className="dish-title"><strong>{itemName(dish, lang)}</strong><span>{money(dish.price)} ₭</span></div>
        <small>{categoryLabel(customerCategory(dish), t)}</small>
        <div className="dish-actions">
          <label className="dish-switch"><input type="checkbox" className="switch-input" checked={dish.available} onChange={() => onToggle(dish.id)}/><span>{dish.available ? t('ພ້ອມຂາຍ', 'พร้อมขาย') : t('ໝົດ', 'หมด')}</span></label>
          {canEdit && <IconButton label={`${t('ແກ້ໄຂ', 'แก้ไข')} ${itemName(dish, lang)}`} onClick={() => setEditing(dish)}><Pencil size={18}/></IconButton>}
        </div>
      </div>
    </article>)}</div> : <EmptyState icon={Search} title={t('ບໍ່ພົບເມນູ', 'ไม่พบเมนู')} text={t('ລອງຄຳຄົ້ນຫາ ຫຼື ໝວດອື່ນ', 'ลองคำค้นหาหรือหมวดอื่น')}/>}
    {!canEdit && <p className="demo-note">{t('ແຄຊເຊຍປ່ຽນໄດ້ສະເພາະ "ພ້ອມຂາຍ / ໝົດ" · ເພີ່ມ ຫຼື ແກ້ເມນູໂດຍເຈົ້າຂອງ ຫຼື ຜູ້ຈັດການ', 'แคชเชียร์เปลี่ยนได้เฉพาะ "พร้อมขาย / หมด" · เพิ่มหรือแก้เมนูโดยเจ้าของหรือผู้จัดการ')}</p>}
    {editing && <DishDialog dish={editing} onClose={() => setEditing(null)} onSave={dish => { const error = onSave(dish); if (!error) setEditing(null); return error; }} onDelete={editing.id ? () => { if (!onDelete(editing.id)) setEditing(null); } : null}/>}
  </section>;
}

function DishDialog({ dish, onClose, onSave, onDelete }) {
  const { t } = useL();
  const [form, setForm] = useState({ lo: dish.lo ?? '', th: dish.th && dish.th !== dish.lo ? dish.th : '', en: dish.en ?? '', price: dish.price ?? '', category: dish.category, image: menuImages.includes(dish.image) ? dish.image : menuImages[0], detailLo: dish.detailLo ?? '', detailTh: dish.detailTh ?? '', popular: Boolean(dish.popular) });
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const set = (name, value) => { setForm({ ...form, [name]: value }); setError(''); };
  const messages = { name: t('ກະລຸນາໃສ່ຊື່ພາສາລາວ ບໍ່ເກີນ 40 ຕົວອັກສອນ', 'กรุณาใส่ชื่อภาษาลาว ไม่เกิน 40 ตัวอักษร'), price: t('ລາຄາຕ້ອງເປັນຕົວເລກເຕັມ', 'ราคาต้องเป็นตัวเลขเต็ม'), detail: t('ຄຳອະທິບາຍຍາວເກີນ 120 ຕົວອັກສອນ', 'คำอธิบายยาวเกิน 120 ตัวอักษร') };
  function submit(event) {
    event.preventDefault();
    const code = onSave({ ...dish, ...form, price: form.price === '' ? NaN : Number(form.price) });
    if (code) setError(messages[code] ?? t('ບັນທຶກບໍ່ສຳເລັດ · ກະລຸນາລອງໃໝ່', 'บันทึกไม่สำเร็จ · กรุณาลองใหม่'));
  }
  const text = (name, label, placeholder, limit = 40) => <label className="form-field"><span>{label}</span><input value={form[name]} maxLength={limit} placeholder={placeholder} onChange={event => set(name, event.target.value)}/></label>;
  return <Dialog title={dish.id ? t('ແກ້ໄຂເມນູ', 'แก้ไขเมนู') : t('ເພີ່ມເມນູ', 'เพิ่มเมนู')} onClose={onClose} className="form-dialog dish-dialog">
    <form className="form-stack" onSubmit={submit} noValidate>
      <label className="form-field"><span>{t('ຊື່ເມນູ (ລາວ)', 'ชื่อเมนู (ลาว)')}</span><input data-autofocus value={form.lo} maxLength={40} onChange={event => set('lo', event.target.value)}/></label>
      <div className="form-row">{text('th', t('ຊື່ (ໄທ)', 'ชื่อ (ไทย)'), t('ຖ້າວ່າງຈະໃຊ້ຊື່ລາວ', 'ถ้าว่างจะใช้ชื่อลาว'))}{text('en', t('ຊື່ (ອັງກິດ)', 'ชื่อ (อังกฤษ)'), 'Pork khao piek')}</div>
      <div className="form-row">
        <label className="form-field"><span>{t('ລາຄາ', 'ราคา')}</span><span className="amount-input is-small"><input type="number" inputMode="numeric" min="0" step="1000" value={form.price} onChange={event => set('price', event.target.value)} placeholder="35000"/><b>₭</b></span></label>
        <fieldset className="form-field"><legend>{t('ໝວດ', 'หมวด')}</legend><div className="quick-amounts">{menuCategories.map(id => <button type="button" key={id} className={form.category === id ? 'selected' : ''} aria-pressed={form.category === id} onClick={() => set('category', id)}>{categoryLabel(id, t)}</button>)}</div></fieldset>
      </div>
      <fieldset className="form-field"><legend>{t('ຮູບ', 'รูป')}</legend><div className="photo-picker">{menuImages.map(image => <button type="button" key={image} className={form.image === image ? 'selected' : ''} aria-pressed={form.image === image} aria-label={image.split('/').pop()} onClick={() => set('image', image)}><img src={image} alt="" width="96" height="72"/>{form.image === image && <CheckCircle2 size={18}/>}</button>)}</div><small>{t('ອັບໂຫຼດຮູບເອງໄດ້ເມື່ອເຊື່ອມລະບົບຫຼັງບ້ານ', 'อัปโหลดรูปเองได้เมื่อเชื่อมระบบหลังบ้าน')}</small></fieldset>
      {text('detailLo', t('ຄຳອະທິບາຍ (ລາວ)', 'คำอธิบาย (ลาว)'), t('ເຊັ່ນ ເສັ້ນນຸ່ມ ນ້ຳຊຸບກະດູກໝູ', 'เช่น เส้นนุ่ม น้ำซุปกระดูกหมู'), 120)}
      {text('detailTh', t('ຄຳອະທິບາຍ (ໄທ)', 'คำอธิบาย (ไทย)'), t('ບໍ່ບັງຄັບ', 'ไม่บังคับ'), 120)}
      <label className="toggle-row"><span><strong>{t('ປ້າຍ "ຂາຍດີ"', 'ป้าย "ขายดี"')}</strong><small>{t('ສະແດງໃຫ້ລູກຄ້າເຫັນໃນເມນູ', 'แสดงให้ลูกค้าเห็นในเมนู')}</small></span><input type="checkbox" className="switch-input" checked={form.popular} onChange={event => set('popular', event.target.checked)}/></label>
      {error && <p className="form-error" role="alert">{error}</p>}
      <button className="button primary full"><CheckCircle2 size={20}/>{t('ບັນທຶກ', 'บันทึก')}</button>
      {onDelete && (confirming ? <div className="delete-confirm"><span>{t('ລຶບເມນູນີ້ແທ້ບໍ? ອໍເດີເກົ່າຍັງຢູ່ຄືເກົ່າ', 'ลบเมนูนี้จริงไหม? ออเดอร์เก่ายังอยู่เหมือนเดิม')}</span><button type="button" className="button secondary" onClick={() => setConfirming(false)}>{t('ຍົກເລີກ', 'ยกเลิก')}</button><button type="button" className="button danger" onClick={onDelete}><Trash2 size={17}/>{t('ລຶບ', 'ลบ')}</button></div> : <button type="button" className="danger-link" onClick={() => setConfirming(true)}><Trash2 size={17}/>{t('ລຶບເມນູນີ້', 'ลบเมนูนี้')}</button>)}
    </form>
  </Dialog>;
}
