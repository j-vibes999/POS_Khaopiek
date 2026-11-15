import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, QrCode } from 'lucide-react';
import Customer, { LanguageMenu, PaymentRecovery } from './Customer';
import { copy, languages } from './customer-copy.js';
import { checkoutReviewKey } from './customer-model.mjs';
import { menuQuoteFields, menuQuoteIdentity, orderTotal, quotedItemPrice } from './order-model.mjs';
import { getGuestClient } from './guest-client.mjs';
import { createCloudApi } from './cloud-api.mjs';
import { shareSnapshot } from './snapshot-sharing.mjs';

const guestKey = 'khao-piek:lan:guest:v1';
const languageKey = 'khao-piek:lan:language:v1';
const tableKey = () => typeof location === 'undefined' ? '' : new URLSearchParams(location.search).get('key') || '';
const draftKey = table => tableKey() ? `khao-piek:cart:${tableKey()}` : `khao-piek:lan:draft:v1:${table}`;
const emptyDraft = { cart: [], method: 'transfer', lastOrderId: null };
const token = /^[0-9a-f]{48}$/;
const rejectedCodes = new Set(['invalid-table', 'sold-out', 'cart-changed', 'invalid-order', 'access-denied', 'menu-changed', 'table', 'cart', 'method', 'guest-token', 'request-conflict']);
const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join('');
const errorWithCode = code => Object.assign(new Error(code || 'POS request failed'), { code });
const validOrderId = value => typeof value === 'string' && (/^\d+$/.test(value) || /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(value));

function readCookie(name) {
  try {
    const match = typeof document !== 'undefined' && document.cookie.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
    return match ? decodeURIComponent(match[1]) : null;
  } catch { return null; }
}

function writeCookie(name, value) {
  try {
    if (typeof document !== 'undefined') {
      document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=2592000; SameSite=Lax`;
    }
  } catch { /* The browser may restrict cookies in private mode. */ }
}

function guestId(storage) {
  let saved = null;
  try { saved = storage?.getItem(guestKey); } catch { /* Storage unavailable */ }
  if (token.test(saved)) {
    writeCookie(guestKey, saved);
    return saved;
  }
  const fromCookie = readCookie(guestKey);
  if (token.test(fromCookie)) {
    try { storage?.setItem(guestKey, fromCookie); } catch { /* Storage unavailable */ }
    return fromCookie;
  }
  const id = newToken();
  try { storage?.setItem(guestKey, id); } catch { /* Storage unavailable */ }
  writeCookie(guestKey, id);
  return id;
}

function readDraft(table) {
  const raw = localStorage.getItem(draftKey(table));
  let saved;
  try { saved = JSON.parse(raw); } catch { return emptyDraft; }
  if (!Array.isArray(saved?.cart) || !saved.cart.every(item => typeof item?.id === 'string' && Number.isFinite(item.price) && Number.isInteger(item.quantity))) return emptyDraft;
  const pending = saved.pending === true && token.test(saved.requestId) && ['cash', 'transfer'].includes(saved.method);
  const paymentIssue = Number.isFinite(saved.paymentIssue?.amount) && saved.paymentIssue.amount >= 0 ? saved.paymentIssue : null;
  return { ...saved, pending, paymentIssue };
}

function savedDraft(table) {
  try { return Number.isInteger(table) && table > 0 && typeof window !== 'undefined' ? readDraft(table) : emptyDraft; }
  catch { return emptyDraft; }
}

async function request(path, table, { guest, body, requestId, checkSetup = false } = {}) {
  const client = getGuestClient();
  if (!client) throw errorWithCode('unavailable');
  const api = createCloudApi(client);
  if (path === 'menu') {
    if (checkSetup) {
      const ready = client.rpc('pos_setup_status').then(({ data, error }) => {
        if (error || data?.schemaVersion < 2 || !data.guestOrdersReady) throw errorWithCode('unavailable');
      });
      const [, menu] = await Promise.all([ready, api.getMenu(tableKey())]);
      return menu;
    }
    return api.getMenu(tableKey());
  }
  if (path === 'orders') return body
    ? api.submitOrder(tableKey(), guest, body)
    : api.getOrders(tableKey(), guest, requestId);
  throw errorWithCode('unavailable');
}

async function loadMenu(table, options) {
  const shop = await request('menu', table, options);
  if (!Array.isArray(shop?.menu) || !Array.isArray(shop.methods) || !shop.methods.length || !Number.isInteger(shop.table)) throw errorWithCode();
  return shop;
}

function MenuState({ language, onLanguageChange, title, hint, loading, onRetry, draft = emptyDraft }) {
  const Icon = onRetry ? AlertCircle : QrCode;
  const c = (key, values) => copy(language, key, values);
  return <div className="dining-app dining-invalid-table" lang={language}>
    <header className="dining-page-banner"><div><div><h1>{c('restaurant')}</h1></div></div><LanguageMenu language={language} setLanguage={onLanguageChange} c={c}/></header>
    <main className="dining-main"><div className="dining-empty" role={loading ? 'status' : undefined}>
      {!loading && <span><Icon size={40} strokeWidth={1.35}/></span>}
      <h2>{copy(language, title)}</h2>{hint && <p>{copy(language, hint)}</p>}
      {onRetry && <button className="dining-primary" onClick={onRetry}>{copy(language, 'retry')}</button>}
    </div>{draft.paymentIssue && <section className="dining-cart-content"><PaymentRecovery amount={draft.paymentIssue.amount} c={c}/></section>}
      {draft.pending && <section className="dining-cart-content"><PaymentRecovery amount={orderTotal(draft.cart)} c={c} pending/></section>}
      {validOrderId(draft.receipt?.orderId) && !draft.pending && !draft.paymentIssue && <section className="dining-cart-content"><div className="dining-order-guidance" role="status"><h2>{c('orderReceived', { id: draft.receipt.orderNumber ?? draft.receipt.orderId })}</h2></div></section>}
    </main>
  </div>;
}

export default function LanCustomer({ table, initialLanguage = 'lo' }) {
  const [language, setLanguage] = useState(() => {
    try {
      const saved = typeof window === 'undefined' ? null : window.localStorage.getItem(languageKey);
      if (languages.some(option => option.id === saved)) return saved;
    } catch { /* The language still works for this visit without storage. */ }
    return initialLanguage;
  });
  useEffect(() => { document.documentElement.lang = language; }, [language]);
  function changeLanguage(value) {
    setLanguage(value);
    try { localStorage.setItem(languageKey, value); } catch { /* Keep the active language. */ }
  }
  return table === null || table === undefined
    ? <MenuState language={language} onLanguageChange={changeLanguage} title="scanTable" hint="scanTableHint"/>
    : <TableCustomer key={table} requestedTable={table} language={language} onLanguageChange={changeLanguage}/>;
}

function TableCustomer({ requestedTable, language, onLanguageChange }) {
  const requestedNumber = Number(requestedTable);
  const [connection, setConnection] = useState({});
  const [loadAttempt, retryMenu] = useState(0);
  const [draft, setDraft] = useState(() => savedDraft(requestedNumber));
  const [orders, setOrders] = useState([]);
  const [call, setCall] = useState(null);
  const [ordersStatus, setOrdersStatus] = useState('loading');
  const [historyAttempt, retryHistory] = useState(0);
  const historyVersion = useRef(0);
  const historyFlight = useRef(null);
  const menuVersion = useRef(0);
  const observedReceipt = useRef(draft.receipt?.requestId);
  const { guest, shop, error } = connection;
  const table = shop?.table ?? requestedNumber;
  const menuReady = Boolean(shop);
  const pendingRequestId = draft.pending ? draft.requestId : null;

  useEffect(() => {
    let stopped = false;
    setConnection({});
    async function load() {
      try {
        const guest = guestId(localStorage);
        setConnection({ guest });
        const shop = await loadMenu(requestedTable, { checkSetup: true });
        if (stopped) return;
        setDraft(readDraft(shop.table));
        setConnection({ guest, shop });
      } catch (error) {
        if (!stopped) setConnection(previous => ({ ...previous, error: error.code || 'unavailable' }));
      }
    }
    load();
    return () => { stopped = true; };
  }, [requestedTable, loadAttempt]);

  useEffect(() => {
    if (!table || !guest || (!menuReady && !pendingRequestId)) return;
    let stopped = false;
    let timer;
    let running = false;
    let queued = false;
    async function load() {
      clearTimeout(timer);
      if (stopped || document.visibilityState !== 'visible') return;
      if (running) { queued = true; return; }
      running = true;
      let version = historyVersion.current;
      try {
        // Effect dependencies can change while a request is still in transit.
        // Let that request settle before the new history observer starts another.
        if (historyFlight.current) await historyFlight.current.catch(() => {});
        if (stopped || document.visibilityState !== 'visible') return;
        version = historyVersion.current;
        const pending = request('orders', table, { guest, requestId: pendingRequestId });
        historyFlight.current = pending;
        let data;
        try { data = await pending; }
        finally { if (historyFlight.current === pending) historyFlight.current = null; }
        if (!Array.isArray(data?.orders)) throw errorWithCode();
        if (stopped || version !== historyVersion.current) return;
        const matchedOrder = data.matchedOrder;
        if (pendingRequestId && validOrderId(matchedOrder?.id)) recordAcceptance(pendingRequestId, matchedOrder.id, matchedOrder.orderNumber);
        setOrders(current => shareSnapshot(current, data.orders));
        if (Object.hasOwn(data, 'call')) setCall(current => shareSnapshot(current, data.call));
        setOrdersStatus(null);
      } catch {
        if (!stopped && version === historyVersion.current) setOrdersStatus('error');
      } finally {
        running = false;
        if (!stopped && document.visibilityState === 'visible') {
          if (queued) { queued = false; void load(); }
          else timer = setTimeout(load, 4000);
        }
      }
    }
    function visibilityChanged() {
      if (document.visibilityState !== 'visible') { clearTimeout(timer); queued = false; }
      else void load();
    }
    void load();
    document.addEventListener('visibilitychange', visibilityChanged);
    window.addEventListener('online', load);
    return () => { stopped = true; clearTimeout(timer); document.removeEventListener('visibilitychange', visibilityChanged); window.removeEventListener('online', load); };
  }, [table, guest, menuReady, pendingRequestId, historyAttempt]);

  useEffect(() => {
    if (!menuReady) return;
    function refreshVisible() {
      if (document.visibilityState === 'visible') refreshMenu().catch(() => {});
    }
    const timer = setInterval(refreshVisible, 15000);
    document.addEventListener('visibilitychange', refreshVisible);
    window.addEventListener('online', refreshVisible);
    return () => {
      ++menuVersion.current;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', refreshVisible);
      window.removeEventListener('online', refreshVisible);
    };
  }, [table, menuReady]);

  useEffect(() => {
    if (!table) return;
    function syncDraft(event) {
      if (event.key !== null && event.key !== draftKey(table)) return;
      const latest = savedDraft(table);
      const receipt = latest.receipt?.requestId;
      if (receipt && observedReceipt.current !== receipt) reloadHistory();
      observedReceipt.current = receipt;
      setDraft(latest);
    }
    window.addEventListener('storage', syncDraft);
    return () => window.removeEventListener('storage', syncDraft);
  }, [table]);

  function saveDraft(next) {
    localStorage.setItem(draftKey(table), JSON.stringify(next));
    setDraft(next);
  }

  function updateDraft(update) {
    const current = readDraft(table);
    if (current.pending) throw errorWithCode('checkout-pending');
    if (current.paymentIssue) throw errorWithCode('payment-recovery');
    const next = update(current);
    if (next.cart.length > 30 || next.cart.some(item => item.quantity > 30) || next.cart.reduce((sum, item) => sum + item.quantity, 0) > 60) {
      throw errorWithCode('order-limit');
    }
    saveDraft({ ...next, requestId: newToken() });
  }

  function currentMethod(draft, methods) {
    return methods.includes(draft.method) ? draft.method : methods[0];
  }

  async function refreshMenu() {
    const version = ++menuVersion.current;
    const fresh = await loadMenu(table);
    if (version === menuVersion.current) setConnection(previous => {
      const shop = shareSnapshot(previous.shop, fresh);
      return shop === previous.shop ? previous : { ...previous, shop };
    });
    return fresh;
  }

  async function validateReview(review) {
    const fresh = await refreshMenu();
    const current = readDraft(table);
    const method = currentMethod(current, shop.methods);
    if (current.paymentIssue || current.pending || checkoutReviewKey(table, current.cart, method) !== review.key) throw errorWithCode('cart-changed');
    const dishes = new Map(fresh.menu.filter(dish => dish.available).map(dish => [dish.id, dish]));
    if (current.cart.some(item => !dishes.has(item.id))) throw errorWithCode('sold-out');
    const cart = current.cart.map(item => {
      const dish = dishes.get(item.id);
      if (dish.category === 'drinks' && (item.size !== 'regular' || item.noHerbs)) throw errorWithCode('dish-changed');
      const price = quotedItemPrice(dish, item.size);
      if (price === item.price && menuQuoteIdentity(dish) === menuQuoteIdentity(item)) return item;
      const updated = { ...item, price };
      for (const field of menuQuoteFields) {
        if (dish[field] !== undefined) updated[field] = dish[field];
        else delete updated[field];
      }
      return updated;
    });
    const newMethod = currentMethod(current, fresh.methods);
    if (checkoutReviewKey(table, cart, newMethod) !== review.key) {
      saveDraft({ ...current, cart, method: newMethod, requestId: newToken() });
      throw errorWithCode('quote-updated');
    }
    const requestId = token.test(current.requestId) ? current.requestId : newToken();
    if (requestId !== current.requestId) saveDraft({ ...current, requestId });
    return requestId;
  }

  function clearPaymentIssue() {
    const current = readDraft(table);
    if (!current.paymentIssue || current.pending) return;
    saveDraft({ ...current, paymentIssue: null, requestId: newToken() });
  }

  function recordAcceptance(requestId, orderId, orderNumber) {
    const latest = savedDraft(table);
    if (latest.requestId !== requestId) return;
    const next = { ...emptyDraft, method: latest.method, lastOrderId: orderId, receipt: { requestId, orderId, orderNumber } };
    observedReceipt.current = requestId;
    try { saveDraft(next); } catch { setDraft(next); }
  }

  function reloadHistory() {
    ++historyVersion.current;
    setOrdersStatus('loading');
    retryHistory(count => count + 1);
  }

  async function callStaff(active) {
    const api = createCloudApi(getGuestClient());
    await api.guestCall(tableKey(), guest, { active });
    setCall(active ? { reason: 'help', at: Date.now() } : null);
    reloadHistory();
  }

  async function submitOrder(_table, _source, reviewedKey, review) {
    const current = readDraft(table);
    const requestId = review.requestId;
    if (current.receipt?.requestId === requestId && validOrderId(current.receipt.orderId)) {
      setDraft(current);
      reloadHistory();
      return current.receipt.orderId;
    }
    if (current.paymentIssue) throw errorWithCode('payment-recovery');
    const method = current.pending ? current.method : review.method;
    const paymentIssue = { amount: orderTotal(review.items) };
    if (current.requestId !== requestId || checkoutReviewKey(table, current.cart, method) !== reviewedKey) {
      // Another tab may have finished this quote and moved on to its next basket.
      const { matchedOrder } = await request('orders', table, { guest, requestId });
      if (validOrderId(matchedOrder?.id)) {
        setOrders(orders => [matchedOrder, ...orders.filter(order => order.id !== matchedOrder.id)]);
        reloadHistory();
        return matchedOrder.id;
      }
      const latest = readDraft(table);
      if (latest.receipt?.requestId === requestId && validOrderId(latest.receipt.orderId)) return latest.receipt.orderId;
      if (!latest.pending) saveDraft({ ...latest, paymentIssue });
      throw errorWithCode(latest.pending ? 'cart-changed' : 'payment-recovery');
    }
    saveDraft({ ...current, method, requestId, pending: true });

    let orderId, orderNumber;
    try {
      ({ orderId, orderNumber } = await request('orders', table, { guest, body: { table, cart: current.cart, method, reviewedKey, requestId } }));
      if (!validOrderId(orderId)) throw errorWithCode();
    } catch (error) {
      const latest = readDraft(table);
      if (latest.receipt?.requestId === requestId && validOrderId(latest.receipt.orderId)) return latest.receipt.orderId;
      if (rejectedCodes.has(error.code) && latest.requestId === requestId) {
        saveDraft({ ...current, method, pending: false, paymentIssue });
        if (['sold-out', 'cart-changed'].includes(error.code)) {
          refreshMenu().catch(() => {});
        }
        throw errorWithCode('payment-recovery');
      }
      throw error;
    }

    recordAcceptance(requestId, orderId, orderNumber);
    reloadHistory();
    return orderId;
  }

  if (error === 'invalid-table') return <MenuState language={language} onLanguageChange={onLanguageChange} draft={draft} title="invalidTable" hint="invalidTableHint"/>;
  if (error) return <MenuState language={language} onLanguageChange={onLanguageChange} draft={draft} title="menuUnavailable" hint="shopConnectionHint" onRetry={() => retryMenu(count => count + 1)}/>;
  if (!shop) return <MenuState language={language} onLanguageChange={onLanguageChange} draft={draft} title="loadingMenu" loading/>;
  return <Customer menu={shop.menu} shopName={shop.shopName} table={table} methods={draft.pending ? [draft.method] : shop.methods}
    call={call} callReasons={['help']} onCall={() => callStaff(true)} onCancelCall={() => callStaff(false)}
    draft={draft} onUpdateDraft={updateDraft} onSubmit={submitOrder} onValidateReview={validateReview} onClearPaymentIssue={clearPaymentIssue}
    initialLanguage={language} onLanguageChange={onLanguageChange} sharedOrders
    tableOrders={orders} ordersStatus={ordersStatus} onRetryOrders={reloadHistory}/>;
}
