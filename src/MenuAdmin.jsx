import React, { useEffect, useRef, useState } from 'react';
import { Check, CheckCircle2, ChevronDown, Pencil, Plus, Search, Star, Trash2, Upload, Utensils } from 'lucide-react';
import { Dialog, EmptyState, PageHeader, itemName, money, useL } from './staff-ui';
import { menuCategories } from './backoffice-model.mjs';
import { customerCategory } from './customer-model.mjs';
import { MenuPhotoPicker } from './MenuPhotoPicker.jsx';
import './menu-editor.css';

const categoryLabel = (id, t) => ({ all: t('ທັງໝົດ', 'ทั้งหมด'), khao: t('ເຂົ້າປຽກ', 'ข้าวเปียก'), pho: t('ເຝີ', 'เฝอ'), drinks: t('ເຄື່ອງດື່ມ', 'เครื่องดื่ม'), other: t('ອື່ນໆ', 'อื่น ๆ') }[id]);

export function MenuAdmin({ menu, canEdit, onToggle, onSave, onDelete, onUploadImage }) {
  const { t, lang } = useL();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [soldOutOnly, setSoldOutOnly] = useState(false);
  const [editing, setEditing] = useState(null);
  const [toggling, setToggling] = useState(null);
  async function toggle(id) {
    if (toggling) return;
    setToggling(id);
    try { await onToggle(id); }
    finally { setToggling(null); }
  }
  const search = query.trim().toLocaleLowerCase();
  const shown = menu.filter(dish => (!soldOutOnly || !dish.available)
    && (category === 'all' || customerCategory(dish) === category)
    && (!search || [dish.lo, dish.th, dish.en].some(name => name?.toLocaleLowerCase().includes(search))));
  const soldOut = menu.filter(dish => !dish.available).length;
  return <section className="full-page bo-page menu-admin">
    <PageHeader icon={Utensils} title={t('ຈັດການເມນູ', 'จัดการเมนู')} text={t(`ພ້ອມຂາຍ ${menu.length - soldOut} · ໝົດ ${soldOut}`, `พร้อมขาย ${menu.length - soldOut} · หมด ${soldOut}`)}>
      {canEdit && <button className="button primary" onClick={() => setEditing({ category: category === 'all' ? 'khao' : category, image: '' })}><Plus size={19}/>{t('ເພີ່ມເມນູ', 'เพิ่มเมนู')}</button>}
    </PageHeader>
    {menu.length > 0 && <div className="menu-admin-toolbar">
      <div className="table-filters" role="group" aria-label={t('ກັ່ນຕອງເມນູ', 'ตัวกรองเมนู')}>
        {['all', ...menuCategories].map(id => <button key={id} className={`filter-chip ${category === id ? 'selected' : ''}`} aria-pressed={category === id} onClick={() => setCategory(id)}><span>{categoryLabel(id, t)}</span><b>{id === 'all' ? menu.length : menu.filter(dish => customerCategory(dish) === id).length}</b></button>)}
        <button type="button" className={`filter-chip${soldOutOnly ? ' selected' : ''}`} aria-pressed={soldOutOnly} onClick={() => setSoldOutOnly(value => !value)}>
          <span>{t('ເມນູໝົດ', 'เมนูหมด')}</span><b style={{ minInlineSize: `max(22px, calc(${String(menu.length).length}ch + 12px))` }}>{soldOut}</b>
        </button>
      </div>
      <label className="search-field"><Search size={18}/><input type="search" aria-label={t('ຄົ້ນຫາເມນູ', 'ค้นหาเมนู')} placeholder={t('ຄົ້ນຫາເມນູ…', 'ค้นหาเมนู…')} value={query} onChange={event => setQuery(event.target.value)}/></label>
    </div>}
    {shown.length ? <div className="dish-list">{shown.map(dish => {
      const name = itemName(dish, lang);
      const saving = toggling === dish.id;
      return <article className={`dish-card ${dish.available ? '' : 'is-sold-out'}`} key={dish.id}>
        <span className="dish-photo"><img src={dish.image || '/images/menu-placeholder.svg'} alt="" width="64" height="64" loading="lazy"/></span>
        <div className="dish-body">
          <h2 className="dish-title">{name}</h2>
          <div className="dish-meta"><strong>{money(dish.price)} ₭</strong><span>{categoryLabel(customerCategory(dish), t)}</span>{dish.popular && <span className="dish-popular"><Star size={14}/>{t('ຂາຍດີ', 'ขายดี')}</span>}</div>
        </div>
        <div className={`dish-actions ${canEdit ? 'can-edit' : ''}`}>
          <label className={`dish-switch${saving ? ' is-saving' : ''}`}>
            <input type="checkbox" className="switch-input" aria-label={`${t('ພ້ອມຂາຍ', 'พร้อมขาย')} ${name}`} checked={dish.available} aria-disabled={Boolean(toggling)} onChange={() => toggle(dish.id)}/>
            <span role="status">{saving ? t('ບັນທຶກ…', 'บันทึก…') : dish.available ? t('ພ້ອມຂາຍ', 'พร้อมขาย') : t('ໝົດ', 'หมด')}</span>
          </label>
          {canEdit && <button className="button secondary dish-edit" aria-label={`${t('ແກ້ໄຂ', 'แก้ไข')} ${name}`} onClick={() => setEditing(dish)}><Pencil size={17}/>{t('ແກ້ໄຂ', 'แก้ไข')}</button>}
        </div>
      </article>;
    })}</div> : menu.length === 0 ? <EmptyState icon={Utensils} title={t('ຍັງບໍ່ມີເມນູ', 'ยังไม่มีเมนู')} text={canEdit ? t('ເພີ່ມອາຫານ ຫຼື ເຄື່ອງດື່ມລາຍການທຳອິດຂອງຮ້ານ', 'เริ่มเพิ่มอาหารหรือเครื่องดื่มรายการแรกของร้าน') : t('ໃຫ້ເຈົ້າຂອງ ຫຼື ຜູ້ຈັດການເພີ່ມເມນູຂອງຮ້ານ', 'ให้เจ้าของร้านหรือผู้จัดการเพิ่มเมนูของร้าน')}>{canEdit && <button className="button primary" onClick={() => setEditing({ category: 'khao', image: '' })}><Plus size={19}/>{t('ເພີ່ມເມນູທຳອິດ', 'เพิ่มเมนูแรก')}</button>}</EmptyState> : <EmptyState icon={Search}
      title={soldOutOnly ? t('ບໍ່ພົບເມນູໝົດ', 'ไม่พบเมนูหมด') : t('ບໍ່ພົບເມນູ', 'ไม่พบเมนู')}
      text={t('ລອງປ່ຽນຄຳຄົ້ນຫາ ຫຼື ຕົວກັ່ນຕອງ', 'ลองเปลี่ยนคำค้นหาหรือตัวกรอง')}>
      <button className="button secondary" onClick={() => { setQuery(''); setCategory('all'); setSoldOutOnly(false); }}>{t('ລ້າງຕົວກັ່ນຕອງ', 'ล้างตัวกรอง')}</button>
    </EmptyState>}
    {!canEdit && <p className="supporting-note">{t('ແຄຊເຊຍປ່ຽນໄດ້ສະເພາະ "ພ້ອມຂາຍ / ໝົດ" · ເພີ່ມ ຫຼື ແກ້ເມນູໂດຍເຈົ້າຂອງ ຫຼື ຜູ້ຈັດການ', 'แคชเชียร์เปลี่ยนได้เฉพาะ "พร้อมขาย / หมด" · เพิ่มหรือแก้เมนูโดยเจ้าของหรือผู้จัดการ')}</p>}
    {editing && <DishDialog dish={editing} onUploadImage={onUploadImage} onClose={() => setEditing(null)} onSave={async dish => { const error = await onSave(dish); if (error === null || error === undefined) setEditing(null); return error; }} onDelete={editing.id ? async () => { const error = await onDelete(editing.id); if (error === null || error === undefined) setEditing(null); return error; } : null}/>}
  </section>;
}

function formatPrice(value) {
  return /^\d+$/.test(value) && Number.isSafeInteger(Number(value)) ? money(Number(value)) : value;
}

function pastedPriceDigits(value) {
  const text = value.trim();
  const commaGroups = text.match(/^(\d+|\d{1,3}(?:,\d{3})+)(?:\.00)?$/);
  if (commaGroups) return commaGroups[1].replaceAll(',', '');
  const dotGroups = text.match(/^(\d+|\d{1,3}(?:\.\d{3})+)(?:,00)?$/);
  return dotGroups ? dotGroups[1].replaceAll('.', '') : null;
}

export function DishDialog({ dish, onClose, onSave, onDelete, onUploadImage }) {
  const { t } = useL();
  const [creationId] = useState(() => dish.id ? null : globalThis.crypto.randomUUID());
  const [initialForm] = useState(() => ({
    lo: dish.lo ?? '', th: dish.th && dish.th !== dish.lo ? dish.th : '', en: dish.en ?? '', zh: dish.zh ?? '',
    ko: dish.ko ?? '', ja: dish.ja ?? '', price: String(dish.price ?? ''), category: dish.category ?? 'khao',
    image: dish.image ?? '', detailLo: dish.detailLo ?? '', detailTh: dish.detailTh ?? '', popular: Boolean(dish.popular),
  }));
  const [form, setForm] = useState(initialForm);
  const [photo, setPhoto] = useState(null);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const saveLock = useRef(false);
  const uploaded = useRef(null);
  const nameInput = useRef(null);
  const priceInput = useRef(null);
  const keepEditingButton = useRef(null);
  const previousFocus = useRef(null);
  const set = (name, value) => { setForm(current => ({ ...current, [name]: value })); setError(''); };
  const selectPhoto = blob => { setPhoto(blob); uploaded.current = null; setError(''); };
  const hasChanges = Boolean(photo) || Object.keys(initialForm).some(key => initialForm[key] !== form[key]);

  function updatePrice(input, text, cursor, edit = {}) {
    const manualGrouping = form.price.includes(',') || edit.data === ',';
    const hasWholeDigits = /^[\d,]*$/.test(text)
      && (!manualGrouping || !text.includes(',') || /^\d{1,3}(?:,\d{3})+$/.test(text));
    const value = hasWholeDigits ? text.replaceAll(',', '').replace(/^0+(?=\d)/, '') : text;
    const display = formatPrice(value);
    if (display !== text) {
      // Keep the cursor next to the same digit when grouping changes.
      let remaining = text.slice(cursor).replace(/\D/g, '').length;
      cursor = display.length;
      while (remaining > 0 && cursor > 0) {
        if (display[--cursor] !== ',') remaining--;
      }
      if (edit.inputType === 'deleteContentBackward' && display[cursor - 1] === ',') cursor--;
    }
    if (input.value !== display) input.value = display;
    input.setSelectionRange(cursor, cursor);
    set('price', value);
  }
  function pastePrice(event) {
    event.preventDefault();
    const input = event.currentTarget;
    const text = event.clipboardData.getData('text/plain').trim();
    if (text === '') return;
    const digits = pastedPriceDigits(text);
    if (digits === null) { setError(messages.price); return; }
    const start = input.selectionStart;
    updatePrice(input, input.value.slice(0, start) + digits + input.value.slice(input.selectionEnd), start + digits.length);
  }

  useEffect(() => {
    if (discarding) keepEditingButton.current?.focus();
    else if (previousFocus.current) {
      const field = previousFocus.current.isConnected ? previousFocus.current : nameInput.current;
      previousFocus.current = null;
      field?.focus();
    }
  }, [discarding]);

  function requestClose() {
    if (saveLock.current) return;
    if (discarding) { setDiscarding(false); return; }
    if (!hasChanges) { onClose(); return; }
    previousFocus.current = document.activeElement;
    setDiscarding(true);
  }
  const messages = {
    name: t('ໃສ່ຊື່ເມນູພາສາລາວ ບໍ່ເກີນ 40 ຕົວອັກສອນ', 'ใส่ชื่อเมนูภาษาลาว ไม่เกิน 40 ตัวอักษร'),
    price: t('ໃສ່ລາຄາເປັນເລກເຕັມ ຕັ້ງແຕ່ 0 ຫາ 10,000,000 ກີບ', 'ใส่ราคาเป็นจำนวนเต็ม ตั้งแต่ 0 ถึง 10,000,000 กีบ'),
    detail: t('ຄຳອະທິບາຍຕ້ອງບໍ່ເກີນ 120 ຕົວອັກສອນ', 'คำอธิบายต้องไม่เกิน 120 ตัวอักษร'),
    image: t('ໃຊ້ຮູບນີ້ບໍ່ໄດ້ · ກະລຸນາເລືອກຮູບໃໝ່', 'ใช้รูปนี้ไม่ได้ กรุณาเลือกรูปใหม่'),
    'storage-not-ready': t('ຍັງບັນທຶກຮູບບໍ່ໄດ້ · ໃຫ້ຜູ້ດູແລເປີດໃຊ້ການເກັບຮູບ ແລ້ວລອງໃໝ່', 'ยังบันทึกรูปไม่ได้ ให้ผู้ดูแลเปิดใช้งานการเก็บรูป แล้วลองใหม่'),
    'upgrade-required': t('ກະລຸນາອັບເດດລະບົບຮ້ານກ່ອນບັນທຶກເມນູ · ຂໍ້ມູນທີ່ກອກຍັງຢູ່', 'กรุณาอัปเดตระบบร้านก่อนบันทึกเมนู ข้อมูลที่กรอกยังอยู่'),
    'upload-failed': t('ອັບໂຫຼດຮູບບໍ່ສຳເລັດ · ຮູບຍັງຢູ່ ກົດບັນທຶກເພື່ອລອງໃໝ່', 'อัปโหลดรูปไม่สำเร็จ รูปยังอยู่ กดบันทึกเพื่อลองใหม่'),
    'access-denied': t('ບັນຊີນີ້ບໍ່ມີສິດບັນທຶກຮູບ · ຕິດຕໍ່ເຈົ້າຂອງຮ້ານ', 'สิทธิ์ปัจจุบันบันทึกรูปไม่ได้ กรุณาติดต่อเจ้าของร้าน'),
    'image-type': t('ເປີດຮູບນີ້ບໍ່ໄດ້ · ເລືອກຮູບ JPG, PNG ຫຼື WebP', 'เปิดรูปนี้ไม่ได้ กรุณาเลือกรูป JPG, PNG หรือ WebP'),
    'image-too-large': t('ຮູບໃຫຍ່ເກີນໄປ · ເລືອກຮູບທີ່ນ້ອຍກວ່າ', 'รูปใหญ่เกินไป กรุณาเลือกรูปที่เล็กลง'),
  };
  const genericError = t('ບັນທຶກບໍ່ສຳເລັດ · ຂໍ້ມູນຍັງຢູ່ ກະລຸນາລອງໃໝ່', 'บันทึกไม่สำเร็จ ข้อมูลยังอยู่ กรุณาลองใหม่');
  async function submit(event) {
    event.preventDefault();
    if (saveLock.current || photoBusy || discarding) return;
    const price = /^\d+$/.test(form.price) ? Number(form.price) : NaN;
    if (!form.lo.trim() || form.lo.trim().length > 40) { setError(messages.name); nameInput.current?.focus(); return; }
    if (!Number.isSafeInteger(price) || price < 0 || price > 10000000) { setError(messages.price); priceInput.current?.focus(); return; }
    if ([form.detailLo, form.detailTh].some(value => value.trim().length > 120)) { setError(messages.detail); return; }
    saveLock.current = true; setSaving(true); setError('');
    let photoUploading = false;
    try {
      let image = form.image;
      if (photo) {
        if (uploaded.current?.blob === photo) image = uploaded.current.url;
        else {
          if (!onUploadImage) throw Object.assign(new Error('storage-not-ready'), { code: 'storage-not-ready' });
          setUploading(true); photoUploading = true;
          image = await onUploadImage(photo);
          if (typeof image !== 'string' || !/^https:\/\//i.test(image)) throw Object.assign(new Error('upload-failed'), { code: 'upload-failed' });
          uploaded.current = { blob: photo, url: image };
          setUploading(false); photoUploading = false;
        }
      }
      const code = await onSave({ ...form, ...(dish.id ? { id: dish.id } : { creationId }), lo: form.lo.trim(), image, price });
      if (code !== null && code !== undefined) setError(messages[code] ?? genericError);
    } catch (failure) {
      const message = failure?.code === 'image-rate-limit'
        ? t('ອັບໂຫຼດຮູບຫຼາຍເທື່ອເກີນໄປ · ລໍຖ້າໜ້ອຍໜຶ່ງ ແລ້ວລອງໃໝ່', 'อัปโหลดรูปถี่เกินไป รอสักครู่แล้วลองใหม่')
        : messages[failure?.code] ?? (photoUploading ? messages['upload-failed'] : genericError);
      setError(message);
    } finally { saveLock.current = false; setSaving(false); setUploading(false); }
  }
  async function remove() {
    if (saveLock.current) return;
    saveLock.current = true; setSaving(true); setError('');
    try { const result = await onDelete(); if (result !== null && result !== undefined) setError(genericError); }
    catch { setError(genericError); }
    finally { saveLock.current = false; setSaving(false); }
  }
  const text = (name, label, placeholder, limit = 40) => <label className="form-field"><span>{label}</span><input value={form[name]} maxLength={limit} placeholder={placeholder} onChange={event => set(name, event.target.value)}/></label>;
  return <Dialog title={dish.id ? t('ແກ້ໄຂເມນູ', 'แก้ไขเมนู') : t('ເພີ່ມເມນູ', 'เพิ่มเมนู')} onClose={requestClose} className="form-dialog dish-dialog menu-editor-dialog">
    <form className="menu-editor-form" onSubmit={submit} noValidate aria-busy={saving}>
      <div className="menu-editor-scroll" inert={discarding}>
        <div className="menu-editor-layout">
          <div className="menu-editor-main">
            <fieldset className="menu-editor-fields" disabled={saving}>
              <label className="form-field menu-name-field"><span>{t('ຊື່ເມນູ (ລາວ)', 'ชื่อเมนู (ลาว)')}<b className="menu-required">{t('ຈຳເປັນ', 'จำเป็น')}</b></span><input ref={nameInput} data-autofocus required value={form.lo} maxLength={40} onChange={event => set('lo', event.target.value)} placeholder={t('ໃສ່ຊື່ອາຫານ ຫຼື ເຄື່ອງດື່ມ', 'ใส่ชื่ออาหารหรือเครื่องดื่ม')}/></label>
              <label className="form-field menu-price-field">
                <span>{t('ລາຄາຂາຍ', 'ราคาขาย')}<b className="menu-required">{t('ຈຳເປັນ', 'จำเป็น')}</b></span>
                <span className="amount-input">
                  <input ref={priceInput} required inputMode="numeric" value={formatPrice(form.price)} placeholder="0"
                    onChange={event => {
                      const input = event.currentTarget;
                      updatePrice(input, input.value, input.selectionStart, event.nativeEvent);
                    }}
                    onPaste={pastePrice}/>
                  <b>{t('ກີບ', 'กีบ')}</b>
                </span>
              </label>
              <fieldset className="menu-category-field"><legend>{t('ໝວດເມນູ', 'หมวดเมนู')}</legend><div className="menu-category-options">{menuCategories.map(id => <button type="button" key={id} className={form.category === id ? 'selected' : ''} aria-pressed={form.category === id} onClick={() => set('category', id)}><span>{categoryLabel(id, t)}</span>{form.category === id && <Check size={17}/>}</button>)}</div></fieldset>
              <label className="menu-popular-toggle"><span><Star size={19}/>{t('ຕິດປ້າຍເມນູຂາຍດີ', 'ติดป้ายเมนูขายดี')}</span><input type="checkbox" className="switch-input" checked={form.popular} onChange={event => set('popular', event.target.checked)}/></label>
            </fieldset>
          </div>
          <MenuPhotoPicker image={form.image} blob={photo} onSelect={selectPhoto} onRemove={() => { selectPhoto(null); set('image', ''); }} disabled={saving} onBusyChange={setPhotoBusy}/>
        </div>
        <details className="menu-editor-details"><summary><span>{t('ພາສາອື່ນ ແລະ ຄຳອະທິບາຍ', 'ภาษาอื่นและคำอธิบาย')}<small>{t('ບໍ່ບັງຄັບ', 'ไม่บังคับ')}</small></span><ChevronDown size={20}/></summary>
          <fieldset disabled={saving} className="menu-extra-fields"><div className="menu-extra-names">
            {text('th', t('ຊື່ (ໄທ)', 'ชื่อ (ไทย)'), t('ຖ້າວ່າງຈະໃຊ້ຊື່ລາວ', 'ถ้าว่างจะใช้ชื่อลาว'))}
            {text('en', t('ຊື່ (ອັງກິດ)', 'ชื่อ (อังกฤษ)'), '')}
            {text('zh', t('ຊື່ (ຈີນ)', 'ชื่อ (จีน)'), '')}
            {text('ko', t('ຊື່ (ເກົາຫຼີ)', 'ชื่อ (เกาหลี)'), '')}
            {text('ja', t('ຊື່ (ຍີ່ປຸ່ນ)', 'ชื่อ (ญี่ปุ่น)'), '')}
          </div><label className="form-field"><span>{t('ຄຳອະທິບາຍ (ລາວ)', 'คำอธิบาย (ลาว)')}</span><textarea rows={2} maxLength={120} value={form.detailLo} onChange={event => set('detailLo', event.target.value)}/></label><label className="form-field"><span>{t('ຄຳອະທິບາຍ (ໄທ)', 'คำอธิบาย (ไทย)')}</span><textarea rows={2} maxLength={120} value={form.detailTh} onChange={event => set('detailTh', event.target.value)}/></label></fieldset>
        </details>
        {onDelete && <div className="menu-delete-area">{confirming ? <div className="delete-confirm"><span>{t('ລຶບເມນູນີ້ແທ້ບໍ? ອໍເດີເກົ່າຍັງຢູ່ຄືເກົ່າ', 'ลบเมนูนี้จริงไหม? ออเดอร์เก่ายังอยู่เหมือนเดิม')}</span><button type="button" className="button secondary" disabled={saving} onClick={() => setConfirming(false)}>{t('ຍົກເລີກ', 'ยกเลิก')}</button><button type="button" className="button danger" disabled={saving} onClick={remove}><Trash2 size={17}/>{t('ລຶບເມນູ', 'ลบเมนู')}</button></div> : <button type="button" className="danger-link" disabled={saving} onClick={() => setConfirming(true)}><Trash2 size={17}/>{t('ລຶບເມນູນີ້', 'ลบเมนูนี้')}</button>}</div>}
      </div>
      <div className="menu-editor-footer">
        {discarding ? <>
          <p className="menu-discard-warning" role="alert">{t('ຍັງບໍ່ໄດ້ບັນທຶກເມນູ. ຖ້າອອກ ການແກ້ໄຂຈະຫາຍໄປ.', 'ยังไม่ได้บันทึกเมนู หากออกจากฟอร์ม ข้อมูลที่แก้จะหายไป')}</p>
          <div className="menu-editor-footer-actions menu-discard-actions">
            <button type="button" className="button secondary" ref={keepEditingButton} onClick={() => setDiscarding(false)}>{t('ແກ້ໄຂຕໍ່', 'แก้ไขต่อ')}</button>
            <button type="button" className="button danger" onClick={onClose}>{t('ອອກໂດຍບໍ່ບັນທຶກ', 'ออกโดยไม่บันทึก')}</button>
          </div>
        </> : <>
          {error && <p className="form-error" role="alert">{error}</p>}
          <div className="menu-editor-footer-actions">
            <button type="button" className="button secondary" disabled={saving} onClick={requestClose}>{t('ຍົກເລີກ', 'ยกเลิก')}</button>
            <button className="button primary menu-save-button" disabled={saving || photoBusy}>
              {uploading ? <Upload size={20}/> : <CheckCircle2 size={20}/>}
              <span aria-live="polite">{uploading
                ? t('ອັບໂຫຼດຮູບ…', 'อัปโหลดรูป…')
                : saving ? t('ກຳລັງບັນທຶກ…', 'กำลังบันทึก…') : t('ບັນທຶກເມນູ', 'บันทึกเมนู')}</span>
            </button>
          </div>
        </>}
      </div>
    </form>
  </Dialog>;
}
