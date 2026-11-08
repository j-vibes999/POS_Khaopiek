import { useEffect, useMemo, useRef, useState } from 'react';
import { LAN_ORDER_ID_START } from './customer-model.mjs';

const readKey = 'khao-piek:order-alerts:read';
const chimeKey = 'khao-piek:order-alerts:chimed';

function readNumber(storage, key) {
  try {
    const value = storage?.getItem(key);
    const id = Number(value);
    return value != null && Number.isSafeInteger(id) && id >= 0 ? id : null;
  } catch { return null; }
}

function saveNumber(storage, key, value) {
  try { storage?.setItem(key, String(value)); } catch { /* Alerts still work in this tab. */ }
}

function chime(context) {
  if (context.state !== 'running') return false;
  const now = context.currentTime;
  for (const [frequency, delay] of [[660, 0], [880, 0.12]]) {
    const tone = context.createOscillator();
    const volume = context.createGain();
    const start = now + delay;
    tone.frequency.value = frequency;
    volume.gain.setValueAtTime(0.001, start);
    volume.gain.exponentialRampToValueAtTime(0.16, start + 0.025);
    volume.gain.exponentialRampToValueAtTime(0.001, start + 0.19);
    tone.connect(volume);
    volume.connect(context.destination);
    tone.onended = () => { tone.disconnect(); volume.disconnect(); };
    tone.start(start);
    tone.stop(start + 0.20);
  }
  return true;
}

export function useOrderAlerts({ orders, storage, enabled, scope = '' }) {
  const scopedStorage = useMemo(() => scope && storage ? { getItem: key => storage.getItem(`${key}:${scope}`), setItem: (key,value) => storage.setItem(`${key}:${scope}`,value) } : storage, [storage,scope]);
  const sharedStorage = storage;
  const orderAlerts = useMemo(() => orders.filter(order => order.source === 'qr' && (Number.isSafeInteger(order.orderNumber) || Number(order.id) >= LAN_ORDER_ID_START))
    .sort((a, b) => Number(b.orderNumber ?? b.id) - Number(a.orderNumber ?? a.id)), [orders]);
  const newestId = Number(orderAlerts[0]?.orderNumber ?? orderAlerts[0]?.id ?? 0);
  const newestSeen = useRef({ scope, id: newestId });
  const [readState, setReadState] = useState(() => ({ scope, id: readNumber(scopedStorage, readKey) ?? newestId }));
  const lastRead = readState.scope === scope ? readState.id : readNumber(scopedStorage, readKey) ?? newestId;
  const [notice, setNotice] = useState(null);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const audio = useRef(null);
  const soundOn = useRef(false);
  const generation = useRef(0);
  const soundRequest = useRef(0);

  useEffect(() => {
    ++generation.current;
    // A new restaurant starts from its own inbox, even when its order numbers are lower.
    newestSeen.current = { scope, id: newestId };
    const saved = readNumber(scopedStorage, readKey);
    const id = saved ?? newestId;
    setReadState({ scope, id });
    setNotice(null);
    setSoundEnabled(false);
    if (enabled && saved === null) saveNumber(scopedStorage, readKey, id);
    function syncRead(event) {
      if (event.storageArea !== sharedStorage || event.key !== (scope ? `${readKey}:${scope}` : readKey)) return;
      setReadState(value => value.scope === scope ? { scope, id: Math.max(value.id, readNumber(scopedStorage, readKey) ?? 0) } : value);
    }
    window.addEventListener('storage', syncRead);
    return () => {
      window.removeEventListener('storage', syncRead);
      ++generation.current;
      ++soundRequest.current;
      soundOn.current = false;
      if (audio.current) void audio.current.close().catch(() => {});
      audio.current = null;
    };
    // Reset only when access/storage changes; new orders are handled below.
  }, [scopedStorage, sharedStorage, scope, enabled]);

  useEffect(() => {
    if (!enabled || newestSeen.current.scope !== scope || newestId <= newestSeen.current.id) return;
    const arrivals = orderAlerts.filter(order => order.status === 'pending' && Number(order.orderNumber ?? order.id) > newestSeen.current.id);
    newestSeen.current = { scope, id: newestId };
    if (!arrivals.length) return;
    const newest = arrivals[0];
    setNotice({ scope, id: newest.id, orderNumber:newest.orderNumber, table: newest.table, createdAt: newest.createdAt, count: arrivals.length });

    if (!soundOn.current) return;
    const stamp = generation.current;
    const ringOnce = () => {
      if (stamp !== generation.current || !soundOn.current || !audio.current || (readNumber(scopedStorage, chimeKey) ?? 0) >= Number(newest.orderNumber ?? newest.id)) return;
      if (chime(audio.current)) saveNumber(scopedStorage, chimeKey, Number(newest.orderNumber ?? newest.id));
    };
    // Tabs share the order inbox. Only one enabled tab should play its chime.
    if (navigator.locks) void navigator.locks.request(`khao-piek:order-chime:${scope}`, ringOnce).catch(() => {});
    else {
      try { ringOnce(); } catch { /* The visual alert is already visible. */ }
    }
  }, [enabled, newestId, orderAlerts, scopedStorage, scope]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  function markRead() {
    const id = Math.max(newestId, readNumber(scopedStorage, readKey) ?? 0);
    saveNumber(scopedStorage, readKey, id);
    setReadState({ scope, id });
    setNotice(null);
  }

  async function setSound(next) {
    const request = ++soundRequest.current;
    if (!next) {
      soundOn.current = false;
      setSoundEnabled(false);
      return true;
    }
    try {
      if (!enabled) return false;
      const stamp = generation.current;
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return false;
      if (!audio.current) audio.current = new Audio();
      const context = audio.current;
      if (context.state !== 'running') await context.resume();
      if (stamp !== generation.current || request !== soundRequest.current || !chime(context)) return false;
      soundOn.current = true;
      setSoundEnabled(true);
      return true;
    } catch { return false; }
  }

  return {
    orderAlerts, unreadCount: orderAlerts.filter(order => Number(order.orderNumber ?? order.id) > lastRead).length,
    notice: notice?.scope === scope ? notice : null, dismissNotice: () => setNotice(null), markRead, soundEnabled, setSound,
  };
}
