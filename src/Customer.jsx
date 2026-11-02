import React, { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, Banknote, BookOpen, Check, CheckCircle2, ChevronDown, ClipboardList, CreditCard, LayoutGrid, List, MapPin, Minus, Plus, QrCode, Search, ShoppingBag, Soup, Trash2, X } from 'lucide-react';
import QRCode from 'qrcode';
import { addCartItem, orderTotal } from './order-model.mjs';
import { customerOrders, filterCustomerMenu, summarizeCustomerOrders } from './customer-model.mjs';
import { copy, customerItemName, languages, menuTranslations } from './customer-copy';
import './customer.css';

const money = amount => new Intl.NumberFormat('en-US').format(amount);
const tableCode = table => `T ${String(table).padStart(2, '0')}`;
const currentTab = () => ['orders', 'qr', 'cart'].includes(location.hash.split('/')[1]) ? location.hash.split('/')[1] : 'menu';

function Flag({ language }) {
  const props = { width: 26, height: 19, viewBox: '0 0 30 21', 'aria-hidden': true, className: 'dining-flag' };
  if (language === 'lo') return <svg {...props}><rect width="30" height="21" fill="#ca2437"/><rect y="5" width="30" height="11" fill="#173b75"/><circle cx="15" cy="10.5" r="4" fill="white"/></svg>;
  if (language === 'th') return <svg {...props}><rect width="30" height="21" fill="#c52e41"/><rect y="3.5" width="30" height="14" fill="white"/><rect y="7" width="30" height="7" fill="#26336b"/></svg>;
  if (language === 'en') return <svg {...props}><rect width="30" height="21" fill="#21396e"/><path d="m0 0 30 21M30 0 0 21" stroke="white" strokeWidth="5"/><path d="m0 0 30 21M30 0 0 21" stroke="#c72840" strokeWidth="2"/><path d="M15 0v21M0 10.5h30" stroke="white" strokeWidth="7"/><path d="M15 0v21M0 10.5h30" stroke="#c72840" strokeWidth="4"/></svg>;
  if (language === 'zh') return <svg {...props}><rect width="30" height="21" fill="#d72b36"/><path d="m7 3 1.2 3.7h4L9 9l1.2 3.7L7 10.4l-3.2 2.3L5 9 1.8 6.7h4Z" fill="#ffdf60"/></svg>;
  if (language === 'ja') return <svg {...props}><rect width="30" height="21" fill="white"/><circle cx="15" cy="10.5" r="5" fill="#bb2945"/></svg>;
  return <svg {...props}><rect width="30" height="21" fill="white"/><path d="M15 5a5.5 5.5 0 1 1 0 11Z" fill="#c73548"/><path d="M15 5a5.5 5.5 0 0 0 0 11Z" fill="#275197"/><path d="m3 4 3-2m-2 4 3-2m16 13 3-2m-2 4 3-2M3 16l3 2m-2-4 3 2M23 3l3 2m-2-4 3 2" stroke="#252c38" strokeWidth="1.1"/></svg>;
}

function LanguageMenu({ language, setLanguage, c }) {
  const [open, setOpen] = useState(false);
  const container = useRef();
  const trigger = useRef();
  useEffect(() => {
    if (!open) return;
    container.current.querySelector('[aria-checked="true"]')?.focus();
    const dismiss = event => { if (!container.current?.contains(event.target)) setOpen(false); };
    document.addEventListener('pointerdown', dismiss);
    return () => document.removeEventListener('pointerdown', dismiss);
  }, [open]);
  function onKeyDown(event) {
    if (event.key === 'Escape') { setOpen(false); trigger.current?.focus(); }
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const buttons = [...container.current.querySelectorAll('[role="menuitemradio"]')];
    const index = buttons.indexOf(document.activeElement);
    buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length]?.focus();
  }
  return <div className="dining-language" ref={container} onKeyDown={onKeyDown} onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false); }}>
    <button ref={trigger} className="dining-language-trigger" aria-label={c('language')} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}><Flag language={language}/><ChevronDown size={15}/></button>
    {open && <div className="dining-language-menu" role="menu" aria-label={c('language')}>{languages.map(option => <button key={option.id} role="menuitemradio" aria-checked={option.id === language} onClick={() => { setLanguage(option.id); setOpen(false); trigger.current?.focus(); }}><Flag language={option.id}/><span>{option.label}</span>{option.id === language && <Check size={18}/>}</button>)}</div>}
  </div>;
}

function Quantity({ quantity, onChange, c, minimum = 1 }) {
  return <div className="dining-quantity"><button aria-label={c('decrease')} disabled={quantity <= minimum} onClick={() => onChange(quantity - 1)}><Minus size={17}/></button><span aria-live="polite">{quantity}</span><button aria-label={c('increase')} disabled={quantity >= 30} onClick={() => onChange(quantity + 1)}><Plus size={17}/></button></div>;
}

function FoodOptions({ item, language, c, onClose, onAdd }) {
  const ref = useRef();
  const [size, setSize] = useState('regular');
  const [quantity, setQuantity] = useState(1);
  const [noHerbs, setNoHerbs] = useState(false);
  const [note, setNote] = useState('');
  const price = item.price + (size === 'large' ? 10000 : 0);
  useEffect(() => {
    const focus = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current.showModal();
    return () => { document.body.style.overflow = overflow; if (focus?.isConnected) focus.focus({ preventScroll: true }); };
  }, []);
  function add() {
    onAdd({ ...item, size, price, quantity, noHerbs, customizationNote: note.trim(),
      note: [noHerbs ? 'ບໍ່ໃສ່ຜັກ' : '', note.trim()].filter(Boolean).join(' · '),
      noteTh: [noHerbs ? 'ไม่ใส่ผัก' : '', note.trim()].filter(Boolean).join(' · '),
    });
  }
  return <dialog className="dining-options" ref={ref} aria-labelledby="dining-food-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === ref.current) onClose(); }}>
    <div className="dining-sheet-handle"/>
    <button className="dining-sheet-close" aria-label={c('close')} onClick={onClose}><X size={23}/></button>
    <img className="dining-option-photo" src={item.image} alt={customerItemName(item, language)} width="600" height="300"/>
    <div className="dining-option-body"><div className="dining-option-title"><h2 id="dining-food-title">{customerItemName(item, language)}</h2><strong>{money(item.price)} ₭</strong></div>
      {['lo', 'th'].includes(language) && <p className="dining-option-description">{item[language === 'lo' ? 'detailLo' : 'detailTh']}</p>}
      {item.category !== 'drinks' && <><fieldset className="dining-sizes"><legend>{c('size')}</legend>{['regular', 'large'].map(option => <label key={option} className={size === option ? 'is-selected' : ''}><input type="radio" name="food-size" checked={size === option} onChange={() => setSize(option)}/><span>{c(option)}</span><strong>{money(item.price + (option === 'large' ? 10000 : 0))} ₭</strong></label>)}</fieldset><label className="dining-herbs"><input type="checkbox" checked={noHerbs} onChange={event => setNoHerbs(event.target.checked)}/><span>{c('noVeg')}</span></label></>}
      <label className="dining-note-label">{c('note')}<span>{c('optional')}</span><textarea rows={2} maxLength={150} value={note} onChange={event => setNote(event.target.value)} placeholder={c('noteHint')}/></label>
    </div>
    <div className="dining-option-bottom"><Quantity quantity={quantity} onChange={setQuantity} c={c}/><button className="dining-primary" onClick={add}><Plus size={20}/>{c('add')} · {money(price * quantity)} ₭</button></div>
  </dialog>;
}

function itemOptions(item, language, c) {
  const note = item.customizationNote ?? (item.note === 'ບໍ່ໃສ່ຜັກ' ? c('noVeg') : item.note);
  return [item.category !== 'drinks' ? c(item.size === 'large' ? 'large' : 'regular') : '', item.noHerbs ? c('noVeg') : '', note].filter(Boolean).join(' · ');
}

function OrderHistory({ orders, language, c, now, onMenu }) {
  const summary = summarizeCustomerOrders(orders);
  function relative(date) {
    const minutes = Math.max(0, Math.floor((now - date) / 60000));
    return minutes === 0 ? c('justNow') : c('minutesAgo', { count: minutes });
  }
  return <><section className="dining-order-list">
    {!orders.length && <Empty icon={ClipboardList} title={c('emptyOrders')} description={c('pickFood')}><button className="dining-primary" onClick={onMenu}><BookOpen size={20}/>{c('openMenu')}</button></Empty>}
    {orders.map(order => <article className="dining-order" key={order.id}><header><div className="dining-order-heading"><strong>#{order.id}</strong><span className={`dining-status ${order.status}`}>{c(order.status)}</span></div><strong className="dining-order-amount">{money(orderTotal(order.items))} ₭</strong><p><time>{new Date(order.createdAt).toLocaleTimeString(language, { timeZone: 'Asia/Vientiane', hour: '2-digit', minute: '2-digit', hour12: false })}</time><span>·</span>{relative(order.createdAt)}</p></header>
      <div className="dining-order-lines">{order.items.map((item, index) => <div className="dining-order-line" key={index}><img src={item.image} alt="" width="62" height="62"/><div><h3>{item.quantity}× {customerItemName(item, language)}</h3><p>{itemOptions(item, language, c)}</p></div><strong>{money(item.price * item.quantity)} ₭</strong></div>)}</div>
      {order.paid && <div className="dining-order-paid"><CheckCircle2 size={15}/>{c('paid')}</div>}
    </article>)}
  </section>{orders.length > 0 && <div className="dining-order-summary"><div><span>{c('total')}</span><strong>{money(summary.total)} ₭</strong></div>{summary.paid > 0 && <div className="dining-paid-total"><span>{c('paid')}</span><span>{money(summary.paid)} ₭</span></div>}<div className="dining-amount-due"><strong>{c('due')}</strong><strong>{money(summary.due)} ₭</strong></div></div>}</>;
}

function Empty({ icon: Icon, title, description, children }) {
  return <div className="dining-empty"><span><Icon size={40} strokeWidth={1.35}/></span><h2>{title}</h2><p>{description}</p>{children}</div>;
}

function TableQR({ table, c, onMenu, onBack }) {
  const [image, setImage] = useState('');
  const [error, setError] = useState(false);
  const url = new URL(location.href);
  url.searchParams.set('table', table);
  url.hash = 'customer';
  const menuUrl = url.toString();
  useEffect(() => { let active = true; QRCode.toDataURL(menuUrl, { width: 320, margin: 2, color: { dark: '#27313d', light: '#ffffff' } }).then(result => { if (active) setImage(result); }).catch(() => { if (active) setError(true); }); return () => { active = false; }; }, [menuUrl]);
  return <section className="dining-qr-page"><div className="dining-qr-card"><span className="dining-qr-logo"><Soup size={34} strokeWidth={1.5}/></span><h2>{c('restaurant')}</h2><p>{c('qrHint')}</p><div className="dining-qr-image">{image ? <img src={image} width="248" height="248" alt={c('qrTitle')}/> : error ? <p role="status">{c('qrError')}</p> : <div className="dining-qr-placeholder" aria-label="Loading QR"/>}</div><strong className="dining-qr-table">{tableCode(table)}</strong><button className="dining-primary" onClick={onMenu}><BookOpen size={20}/>{c('openMenu')}</button></div><p className="dining-qr-caption">{c('qrDemo')}</p><div className="dining-demo-info"><span>{c('demo')}</span><p>{c('demoHint')}</p><button onClick={onBack}><ArrowLeft size={17}/>{c('staff')}</button></div></section>;
}

export default function Customer({ menu, table, manual, onSubmit, orders, onBack, initialLanguage = 'lo' }) {
  const [language, setLanguage] = useState(initialLanguage);
  const c = (key, values) => copy(language, key, values);
  const [tab, setTab] = useState(currentTab);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [layout, setLayout] = useState('grid');
  const [cart, setCart] = useState([]);
  const [product, setProduct] = useState(null);
  const [method, setMethod] = useState('transfer');
  const [notice, setNotice] = useState(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(Date.now());
  const lock = useRef(false);
  const menuScroll = useRef(0);
  const originalLanguage = useRef(document.documentElement.lang);
  const tableOrders = customerOrders(orders, table);
  const count = cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = orderTotal(cart);
  const translatedMenu = menu.map(item => ({ ...item, ...menuTranslations[item.id] }));
  const shown = filterCustomerMenu(translatedMenu, category, query);

  useEffect(() => { const update = () => { setTab(currentTab()); }; addEventListener('hashchange', update); return () => removeEventListener('hashchange', update); }, []);
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  useEffect(() => { const meta = document.querySelector('meta[name="theme-color"]'); const original = meta?.content; if (meta) meta.content = '#ffffff'; return () => { document.documentElement.lang = originalLanguage.current; if (meta) meta.content = original; }; }, []);
  useEffect(() => { const id = setInterval(() => setNow(Date.now()), 30000); return () => clearInterval(id); }, []);
  useEffect(() => { if (!notice) return; const id = setTimeout(() => setNotice(null), 5000); return () => clearTimeout(id); }, [notice]);

  function navigate(next) {
    if (tab === 'menu') menuScroll.current = scrollY;
    setTab(next);
    location.hash = next === 'menu' ? 'customer' : `customer/${next}`;
    requestAnimationFrame(() => window.scrollTo({ top: next === 'menu' ? menuScroll.current : 0, behavior: 'instant' }));
  }
  function add(item) {
    setCart(old => addCartItem(old, item));
    lock.current = false;
    setBusy(false);
    setProduct(null);
  }
  function changeQuantity(key, quantity) { setCart(old => old.map(item => item.key === key ? { ...item, quantity } : item)); }
  function remove(item) {
    setCart(old => old.filter(row => row.key !== item.key));
    setNotice({ text: c('removed'), undo: () => { setCart(old => addCartItem(old, item)); setNotice(null); } });
  }
  function sendOrder() {
    if (lock.current || !cart.length) return;
    lock.current = true;
    setBusy(true);
    onSubmit(cart, method, table, manual ? 'cashier' : 'qr');
    setCart([]);
    setNotice({ text: c('orderSent') });
    navigate('orders');
  }

  return <div className={`dining-app dining-tab-${tab} ${count > 0 ? 'dining-has-basket' : ''}`} lang={language}>
    <a className="dining-skip" href="#dining-main" onClick={event => { event.preventDefault(); document.getElementById('dining-main')?.focus(); }}>{c('menu')}</a>
    {tab === 'menu' ? <><header className="dining-header"><div className="dining-header-inner"><div className="dining-restaurant-row"><button className="dining-restaurant-mark" onClick={() => navigate('qr')} aria-label={c('qrTitle')}><Soup size={31} strokeWidth={1.5}/></button><div className="dining-restaurant-name"><h1>{c('restaurant')}</h1><p><MapPin size={16}/><span>{tableCode(table)}</span>{manual && <button onClick={onBack}><ArrowLeft size={13}/>{c('staff')}</button>}</p></div><LanguageMenu language={language} setLanguage={setLanguage} c={c}/></div><label className="dining-search"><Search size={22}/><input value={query} onChange={event => setQuery(event.target.value)} placeholder={c('search')} aria-label={c('search')} type="search" enterKeyHint="search"/>{query && <button aria-label={c('clearSearch')} onClick={() => setQuery('')}><X size={19}/></button>}</label></div></header>
      <div className="dining-category-bar"><div className="dining-category-inner"><nav className="dining-categories" aria-label={c('menu')}>{['all', 'khao', 'pho', 'drinks'].map(id => <button key={id} aria-pressed={category === id} className={category === id ? 'is-active' : ''} onClick={() => setCategory(id)}>{c(id)}</button>)}</nav><div className="dining-layout" role="group" aria-label={c('grid')}><button className={layout === 'grid' ? 'is-active' : ''} aria-label={c('grid')} aria-pressed={layout === 'grid'} onClick={() => setLayout('grid')}><LayoutGrid size={21}/></button><button className={layout === 'list' ? 'is-active' : ''} aria-label={c('list')} aria-pressed={layout === 'list'} onClick={() => setLayout('list')}><List size={23}/></button></div></div></div></> : <header className="dining-page-banner"><div><div><h1>{tab === 'orders' ? c('orders') : tab === 'cart' ? c('cart') : c('qrTitle')}</h1>{tab === 'orders' && <span className="dining-banner-count">({tableOrders.length}) · {c('items', { count: tableOrders.reduce((n, order) => n + order.items.reduce((sum, item) => sum + item.quantity, 0), 0) })}</span>}{tab === 'cart' && <span className="dining-banner-count">({c('items', { count })})</span>}</div><p>{tableCode(table)}</p></div>{tab === 'cart' ? <button className="dining-banner-close" aria-label={c('close')} onClick={() => navigate('menu')}><X size={26}/></button> : <LanguageMenu language={language} setLanguage={setLanguage} c={c}/>}</header>}

    <main id="dining-main" tabIndex={-1} className="dining-main">
      {tab === 'menu' && <section className="dining-menu-content"><div className="dining-section-title"><h2>{c(category === 'all' ? 'ourMenu' : category)}</h2><span>{c('items', { count: shown.length })}</span></div><div className={`dining-food-grid ${layout === 'list' ? 'is-list' : ''}`}>{shown.map(item => <article className={`dining-food ${!item.available ? 'is-unavailable' : ''}`} key={item.id}><button className="dining-food-target" disabled={!item.available} aria-label={`${c(item.available ? 'add' : 'soldOut')} ${customerItemName(item, language)}`} onClick={() => setProduct(item)}><div className="dining-food-photo"><img src={item.image} alt={customerItemName(item, language)} width="600" height="450" loading="lazy"/>{!item.available ? <span className="dining-sold-out">{c('soldOut')}</span> : <span className="dining-food-plus"><Plus size={25} strokeWidth={2}/></span>}</div><div className="dining-food-copy"><h3>{customerItemName(item, language)}</h3>{layout === 'list' && ['lo', 'th'].includes(language) && <p>{item[language === 'lo' ? 'detailLo' : 'detailTh']}</p>}<strong>{money(item.price)} ₭</strong></div></button></article>)}</div>{!shown.length && <Empty icon={Search} title={c('noResults')} description={c('trySearch')}><button className="dining-secondary" onClick={() => { setQuery(''); setCategory('all'); }}>{c('all')}</button></Empty>}<footer className="dining-menu-notes"><p>{c('allergy')}</p><a href="/credits.txt" target="_blank" rel="noreferrer">{c('photos')} · Spencer / Wikimedia · Unsplash</a></footer></section>}

      {tab === 'cart' && <><section className="dining-cart-content">{cart.length ? <><div className="dining-cart-list">{cart.map(item => <article className="dining-cart-item" key={item.key}><img src={item.image} alt="" width="84" height="84"/><div className="dining-cart-item-body"><h2>{customerItemName(item, language)}</h2><p>{itemOptions(item, language, c)}</p><Quantity quantity={item.quantity} onChange={quantity => changeQuantity(item.key, quantity)} c={c}/></div><div className="dining-cart-item-actions"><strong>{money(item.price * item.quantity)} ₭</strong><button className="dining-remove" aria-label={`${c('remove')} ${customerItemName(item, language)}`} onClick={() => remove(item)}><Trash2 size={21}/></button></div></article>)}</div><fieldset className="dining-payment-choice"><legend>{c('payment')}</legend><div>{[['transfer', CreditCard], ['cash', Banknote]].map(([value, Icon]) => <label key={value} className={method === value ? 'is-selected' : ''}><input type="radio" name="payment-method" checked={method === value} onChange={() => setMethod(value)}/><Icon size={20}/><span>{c(value)}</span>{method === value && <Check size={17}/>}</label>)}</div><p>{c('payAtCashier')}</p></fieldset></> : <Empty icon={ShoppingBag} title={c('emptyCart')} description={c('pickFood')}><button className="dining-primary" onClick={() => navigate('menu')}><Plus size={21}/>{c('orderMore')}</button></Empty>}</section>{cart.length > 0 && <div className="dining-cart-checkout"><div className="dining-cart-checkout-inner"><div className="dining-cart-total"><div><span>{c('total')}</span><small>{c('items', { count })}</small></div><strong>{money(total)} ₭</strong></div><div className="dining-checkout-actions"><button className="dining-secondary" onClick={() => navigate('menu')}><Plus size={21}/>{c('orderMore')}</button><button className="dining-primary" onClick={sendOrder} disabled={busy}>{c(busy ? 'sending' : 'orderNow')}<ArrowRight size={23}/></button></div><p>{c('demoHint')}</p></div></div>}</>}

      {tab === 'orders' && <OrderHistory orders={tableOrders} language={language} c={c} now={now} onMenu={() => navigate('menu')}/>}
      {tab === 'qr' && <TableQR table={table} c={c} onMenu={() => navigate('menu')} onBack={onBack}/>}
    </main>

    {tab === 'menu' && count > 0 && <div className="dining-basket-dock"><button onClick={() => navigate('cart')}><span className="dining-basket-count">{count}</span><ShoppingBag size={20}/><span>{c('viewCart')}</span><strong>{money(total)} ₭</strong><ArrowRight size={21}/></button></div>}
    {tab !== 'cart' && <nav className="dining-bottom-nav" aria-label={c('menu')}>{[['menu', BookOpen], ['orders', ClipboardList], ['qr', QrCode]].map(([id, Icon]) => <button key={id} className={tab === id ? 'is-active' : ''} aria-current={tab === id ? 'page' : undefined} onClick={() => navigate(id)}><Icon size={24} strokeWidth={tab === id ? 2.1 : 1.7}/><span>{c(id)}</span>{id === 'orders' && tableOrders.length > 0 && <i>{tableOrders.length}</i>}</button>)}</nav>}
    {product && <FoodOptions item={product} language={language} c={c} onClose={() => setProduct(null)} onAdd={add}/>}
    {notice && <div className={`dining-notice ${tab === 'cart' ? 'above-checkout' : ''}`} role="status"><CheckCircle2 size={19}/><span>{notice.text}</span>{notice.undo && <button onClick={notice.undo}>{c('undo')}</button>}<button className="dining-notice-close" aria-label={c('close')} onClick={() => setNotice(null)}><X size={17}/></button></div>}
  </div>;
}
