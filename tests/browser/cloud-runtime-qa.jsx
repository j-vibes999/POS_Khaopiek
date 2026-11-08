// Synthetic RPC and Auth responses only; this fixture never connects to a shop.
import React from 'react';
import { createRoot } from 'react-dom/client';
import CloudApp from '../../src/CloudApp.jsx';
import '../../src/styles.css';

const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const now = new Date().toISOString();
const clone = value => JSON.parse(JSON.stringify(value));
const params = new URLSearchParams(location.search);
const shops = Object.fromEntries(['A', 'B'].map((key, index) => {
 const offset = index * 100;
 const membership = { id: id(offset + 2), user_id: id(offset + 3), display_name: `${key} Owner`, role: 'owner', active: true };
 return [key, {
  restaurantId: id(offset + 1), membership, members: [membership],
  restaurants: { id: id(offset + 1), name: `${key} Restaurant`, branch: 'Main', phone: '123', payment_methods: params.has('cash') ? ['cash'] : ['transfer', 'cash'] },
  dining_tables: [{ id: id(offset + 4), public_key: id(offset + 5), table_number: 1, seats: 4, zone: '', enabled: true }],
  menu_items: [{ id: id(offset + 6), name_lo: 'Noodles', name_th: 'Noodles', name_en: '', name_zh: '', name_ko: '', name_ja: '', detail_lo: '', detail_th: '', price: 35000, category: 'khao', image_path: '/images/menu-placeholder.svg', popular: false, available: true }],
  orders: [], shifts: [], payments: [], activity_log: [], calls: [],
 }];
}));
const qa = window.cloudQa = { shops, active: 'A', commands: [], snapshots: [], receipts: {}, delay: Number(params.get('delay') || 0), holdCommand: false, rejectCreate: false, loseCreateAck: false, signOutFail: false };
let listener;
const session = key => ({ user: { id: shops[key].membership.user_id, email: `${key.toLowerCase()}@qa.invalid` } });
qa.refreshAuth = () => listener?.('TOKEN_REFRESHED', session(qa.active));
const client = {
 auth: {
  getSession: async () => ({ data: { session: session(qa.active) } }),
  onAuthStateChange(callback) { listener = callback; return { data: { subscription: { unsubscribe() {} } } }; },
  async signInWithPassword({ email }) { qa.active = email.startsWith('b') ? 'B' : 'A'; const value = session(qa.active); listener?.('SIGNED_IN', value); return { data: { session: value } }; },
  async signOut() { if (qa.signOutFail) throw new Error('offline'); listener?.('SIGNED_OUT', null); return {}; },
 },
 channel() { return { on() { return this; }, subscribe() { return this; } }; }, removeChannel() {},
 async rpc(name, args) {
  if (name === 'pos_setup_status') return { data: { schemaVersion: 2, guestOrdersReady: true, paymentsReady: true }, error: null };
  const key = qa.active;
  if (name === 'pos_staff_snapshot') {
   qa.snapshots.push({ key, restaurantId: args.p_restaurant_id });
   const result = clone(shops[key]);
   if (qa.delay) await new Promise(resolve => setTimeout(resolve, qa.delay));
   return { data: result, error: null };
  }
  if (name !== 'pos_staff_command') throw new Error('Unexpected isolated RPC');
  const { p_action: action, p_payload: payload } = args;
  qa.commands.push({ key, action, payload: clone(payload) });
  const result = clone(shops[key]);
  if (action === 'settings.save') {
   if (!payload.name || !payload.methods?.length) return { data: null, error: { code: 'P0001', message: 'invalid' } };
   Object.assign(result.restaurants, { name: payload.name, branch: payload.branch, phone: payload.phone, payment_methods: payload.methods });
  } else if (action === 'table.add') {
   result.dining_tables.push({ id: id(8), public_key: id(9), table_number: payload.number, seats: payload.seats, zone: payload.zone });
  } else if (action === 'order.create') {
   if (qa.receipts[payload.requestId]) return { data: { ...result, commandOrderId: qa.receipts[payload.requestId], commandChanged: false }, error: null };
   if (qa.rejectCreate || !result.restaurants.payment_methods.includes(payload.method)) return { data: null, error: { code: 'P0001', message: typeof qa.rejectCreate === 'string' ? qa.rejectCreate : 'method' } };
   result.commandOrderId = id(10 + result.orders.length); result.commandChanged = true;qa.receipts[payload.requestId] = result.commandOrderId;
   result.orders.push({ id: result.commandOrderId, order_number: result.orders.length + 1, table_id: result.dining_tables[0].id, table_number: 1, source: 'cashier', requested_method: payload.method, status: 'pending', paid: false, created_at: now, revision: 1,
    order_items: payload.cart.map((item, index) => ({ id: id(20 + index), menu_item_id: item.id, name_lo: item.lo, name_th: item.th, unit_price: item.price, quantity: item.quantity, category: item.category, size: item.size, no_herbs: item.noHerbs, customization_note: item.customizationNote })) });
  }
  if (qa.holdCommand) await new Promise(resolve => { qa.releaseCommand = resolve; });
  shops[key] = clone(result);
  if (action === 'order.create' && qa.loseCreateAck) { qa.loseCreateAck = false;return { data: null, error: { code: '502', message: 'response-lost' } }; }
  return { data: result, error: null };
 },
};
createRoot(document.getElementById('root')).render(<CloudApp client={client}/>);
