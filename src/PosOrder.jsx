import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, Banknote, ChevronDown, Minus, Pencil, Plus, Search, Send, ShoppingBag, Star, X } from 'lucide-react';
import { EmptyState, itemName, money, pad, useL } from './staff-ui';
import { addCartItem, orderTotal, updateCartItem } from './order-model.mjs';
import { customerCategory } from './customer-model.mjs';

const largeExtra = 10000;
const categoryLabel = (id, t) => ({ all: t('ທັງໝົດ', 'ทั้งหมด'), khao: t('ເຂົ້າປຽກ', 'ข้าวเปียก'), pho: t('ເຝີ', 'เฝอ'), drinks: t('ເຄື່ອງດື່ມ', 'เครื่องดื่ม'), other: t('ອື່ນໆ', 'อื่น ๆ') }[id]);

// Basket lines use the same shape as customer orders, so the kitchen and reports read both alike.
function withChoices(row, dish, changes) {
  const next = { ...row, ...changes };
  const note = (next.customizationNote ?? '').trim();
  return {
    ...next,
    price: dish.price + (next.size === 'large' ? largeExtra : 0),
    note: [next.noHerbs ? 'ບໍ່ໃສ່ຜັກ' : '', note].filter(Boolean).join(' · '),
    noteTh: [next.noHerbs ? 'ไม่ใส่ผัก' : '', note].filter(Boolean).join(' · '),
  };
}

export function PosOrder({ table, tables, menu, draft, onTable, onUpdateDraft, onSubmit, onBack }) {
  const { t, lang } = useL();
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [noteFor, setNoteFor] = useState(null);
  const [error, setError] = useState('');
  const cart = draft.cart;
  const dishes = Object.fromEntries(menu.map(dish => [dish.id, dish]));
  const categories = ['all', ...['khao', 'pho', 'drinks', 'other'].filter(id => menu.some(dish => customerCategory(dish) === id))];
  const search = query.trim().toLocaleLowerCase();
  const shown = menu.filter(dish => (category === 'all' || customerCategory(dish) === category) && (!search || [dish.lo, dish.th, dish.en].some(name => name?.toLocaleLowerCase().includes(search))));
  const count = cart.reduce((sum, row) => sum + row.quantity, 0);
  const soldOut = cart.some(row => !dishes[row.id]?.available);
  // On a phone the basket sits below the dishes; a small bar jumps to it until its buttons are in view.
  const checkoutRef = useRef();
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  useEffect(() => {
    const watch = new IntersectionObserver(([entry]) => setCheckoutVisible(entry.isIntersecting));
    watch.observe(checkoutRef.current);
    return () => watch.disconnect();
  }, []);
  const setCart = update => { setError(''); onUpdateDraft(current => ({ ...current, cart: update(current.cart) })); };
  const add = dish => setCart(rows => addCartItem(rows, withChoices({ ...dish, size: 'regular', quantity: 1, noHerbs: false, customizationNote: '' }, dish, {})));
  const change = (row, changes) => setCart(rows => updateCartItem(rows, row.key, withChoices(row, dishes[row.id] ?? row, changes)));
  const setQuantity = (row, quantity) => setCart(rows => quantity < 1 ? rows.filter(item => item.key !== row.key) : rows.map(item => item.key === row.key ? { ...item, quantity } : item));
  function send(pay) {
    const message = onSubmit(pay);
    if (message) setError(message);
  }
  return <section className="pos-screen">
    <div className="pos-menu">
      <div className="pos-head">
        <button className="text-link" onClick={onBack}><ArrowLeft size={18}/>{t('ກັບໄປໜ້າໂຕະ', 'กลับไปหน้าโต๊ะ')}</button>
        <h1>{t('ຮັບອໍເດີ', 'รับออเดอร์')}</h1>
        <label className="pos-table"><span>{t('ໂຕະ', 'โต๊ะ')}</span><select value={table} onChange={event => onTable(Number(event.target.value))}>{tables.map(item => <option key={item.number} value={item.number}>{pad(item.number)}</option>)}</select></label>
      </div>
      <div className="pos-filters">
        <div className="table-filters" role="group" aria-label={t('ໝວດເມນູ', 'หมวดเมนู')}>{categories.map(id => <button key={id} className={`filter-chip ${category === id ? 'selected' : ''}`} aria-pressed={category === id} onClick={() => setCategory(id)}><span>{categoryLabel(id, t)}</span></button>)}</div>
        <label className="search-field"><Search size={18}/><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('ຄົ້ນຫາເມນູ…', 'ค้นหาเมนู…')} aria-label={t('ຄົ້ນຫາເມນູ', 'ค้นหาเมนู')}/></label>
      </div>
      {shown.length ? <div className="pos-grid">{shown.map(dish => {
        const inCart = cart.filter(row => row.id === dish.id).reduce((sum, row) => sum + row.quantity, 0);
        return <button key={dish.id} className={`pos-dish ${dish.available ? '' : 'is-sold-out'}`} disabled={!dish.available} onClick={() => add(dish)} aria-label={`${t('ເພີ່ມ', 'เพิ่ม')} ${itemName(dish, lang)} ${money(dish.price)} ₭`}>
          <span className="pos-dish-photo"><img src={dish.image} alt="" width="160" height="110" loading="lazy"/>{inCart > 0 && <b className="pos-dish-count">{inCart}</b>}{!dish.available && <span className="pos-sold-out">{t('ໝົດ', 'หมด')}</span>}{dish.popular && dish.available && <Star className="pos-popular" size={16}/>}</span>
          <strong>{itemName(dish, lang)}</strong>
          <span className="pos-dish-price">{money(dish.price)} ₭</span>
        </button>;
      })}</div> : <EmptyState icon={Search} title={t('ບໍ່ພົບເມນູ', 'ไม่พบเมนู')} text={t('ລອງຄຳຄົ້ນຫາອື່ນ', 'ลองคำค้นหาอื่น')}/>}
    </div>
    <aside className="pos-cart" aria-label={t('ລາຍການທີ່ສັ່ງ', 'รายการที่สั่ง')}>
      <div className="pos-cart-head"><h2>{t('ໂຕະ', 'โต๊ะ')} {pad(table)}</h2><span>{count} {t('ລາຍການ', 'รายการ')}</span>{cart.length > 0 && <button className="danger-link" onClick={() => setCart(() => [])}>{t('ລ້າງ', 'ล้าง')}</button>}</div>
      {cart.length ? <div className="pos-lines">{cart.map(row => {
        const dish = dishes[row.id];
        const unavailable = !dish?.available;
        return <article className={`pos-line ${unavailable ? 'is-sold-out' : ''}`} key={row.key}>
          <div className="pos-line-top"><strong>{itemName(row, lang)}</strong><span>{money(row.price * row.quantity)}</span></div>
          {unavailable ? <p className="pos-line-warning">{t('ເມນູນີ້ໝົດແລ້ວ · ກະລຸນາລຶບອອກ', 'เมนูนี้หมดแล้ว · กรุณาลบออก')}</p> : <div className="pos-line-options">
            {row.category !== 'drinks' && <div className="pos-size" role="group" aria-label={t('ຂະໜາດ', 'ขนาด')}>{['regular', 'large'].map(size => <button key={size} className={row.size === size ? 'selected' : ''} aria-pressed={row.size === size} onClick={() => change(row, { size })}>{size === 'large' ? t('ພິເສດ', 'พิเศษ') : t('ທຳມະດາ', 'ธรรมดา')}</button>)}</div>}
            {row.category !== 'drinks' && <button className={`pos-chip ${row.noHerbs ? 'selected' : ''}`} aria-pressed={row.noHerbs} onClick={() => change(row, { noHerbs: !row.noHerbs })}>{t('ບໍ່ໃສ່ຜັກ', 'ไม่ใส่ผัก')}</button>}
            <button className={`pos-chip ${row.customizationNote ? 'selected' : ''}`} onClick={() => setNoteFor(noteFor === row.key ? null : row.key)}><Pencil size={14}/>{row.customizationNote || t('ໝາຍເຫດ', 'หมายเหตุ')}</button>
          </div>}
          {noteFor === row.key && <input className="pos-note" autoFocus maxLength={80} defaultValue={row.customizationNote} placeholder={t('ເຊັ່ນ ບໍ່ເຜັດ, ໃສ່ຖົງ', 'เช่น ไม่เผ็ด, ใส่ถุง')} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }} onBlur={event => { change(row, { customizationNote: event.target.value }); setNoteFor(null); }}/>}
          <div className="stepper"><button aria-label={t('ຫຼຸດຈຳນວນ', 'ลดจำนวน')} onClick={() => setQuantity(row, row.quantity - 1)}>{row.quantity === 1 ? <X size={17}/> : <Minus size={17}/>}</button><b aria-live="polite">{row.quantity}</b><button aria-label={t('ເພີ່ມຈຳນວນ', 'เพิ่มจำนวน')} disabled={unavailable || row.quantity >= 30} onClick={() => setQuantity(row, row.quantity + 1)}><Plus size={17}/></button></div>
        </article>;
      })}</div> : <div className="pos-empty"><ShoppingBag size={36} strokeWidth={1.4}/><p>{t('ກົດເມນູດ້ານຊ້າຍເພື່ອເພີ່ມ · ກົດຊ້ຳເພື່ອເພີ່ມຈຳນວນ', 'กดเมนูด้านซ้ายเพื่อเพิ่ม · กดซ้ำเพื่อเพิ่มจำนวน')}</p></div>}
      <div className="pos-checkout" ref={checkoutRef}>
        {(error || soldOut) && <p className="form-error" role="alert">{error || t('ມີເມນູທີ່ໝົດໃນລາຍການ · ກະລຸນາລຶບອອກກ່ອນສົ່ງ', 'มีเมนูที่หมดในรายการ · กรุณาลบออกก่อนส่ง')}</p>}
        <div className="pos-total"><span>{t('ລວມທັງໝົດ', 'รวมทั้งหมด')}</span><strong>{money(orderTotal(cart))} <small>₭</small></strong></div>
        <button className="button primary full" disabled={!cart.length || soldOut} onClick={() => send(true)}><Banknote size={20}/>{t('ສົ່ງອໍເດີ ແລະ ຮັບເງິນ', 'ส่งออเดอร์และรับเงิน')}</button>
        <button className="button secondary full" disabled={!cart.length || soldOut} onClick={() => send(false)}><Send size={18}/>{t('ສົ່ງອໍເດີ · ຮັບເງິນທີຫຼັງ', 'ส่งออเดอร์ · รับเงินทีหลัง')}</button>
      </div>
    </aside>
    {count > 0 && !checkoutVisible && <button className="pos-jump" onClick={() => checkoutRef.current.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth', block: 'end' })}><b>{count}</b><span>{t('ເບິ່ງລາຍການ ແລະ ສົ່ງ', 'ดูรายการและส่ง')}</span>{money(orderTotal(cart))} ₭<ChevronDown size={18}/></button>}
  </section>;
}
