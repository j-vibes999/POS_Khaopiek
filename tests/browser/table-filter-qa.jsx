// Synthetic Auth/RPC only. No cloud connection, payments, or printer is used.
import React from 'react';
import { createRoot } from 'react-dom/client';
import CloudApp from '../../src/CloudApp.jsx';
import '../../src/styles.css';

const id = number => `00000000-0000-4000-8000-${String(number).padStart(12, '0')}`;
const now = new Date().toISOString();
const scenario = new URLSearchParams(location.search).get('scenario') || 'calls';
const paid = ['ready', 'handoff', 'close'].includes(scenario);
const membership = { id: id(2), user_id: id(3), display_name: 'QA Staff', role: scenario === 'cashier' ? 'cashier' : 'owner', active: true };
const snapshot = {
 restaurantId: id(1), membership, members: [membership],
 restaurants: { id: id(1), name: 'Isolated Table QA', branch: '', phone: '', payment_methods: ['cash'] },
 dining_tables: [1, 2].map(number => ({ id: id(number + 3), public_key: id(number + 5), table_number: number, seats: 4, zone: '', enabled: true })),
 menu_items: [], shifts: scenario === 'mobile' ? [{ id: id(16), opened_by: membership.id, opened_at: now, closed_at: null, opening_cash: 0 }] : [], payments: [], activity_log: [],
 orders: [{ id: id(10), order_number: 41, table_id: id(4), table_number: 1, source: 'cashier', requested_method: 'cash', status: ['ready', 'close'].includes(scenario) ? 'ready' : scenario === 'handoff' ? 'queued' : 'pending', paid, kitchen_pending: scenario === 'handoff', paid_at: paid ? now : null, kitchen_sent_at: ['ready', 'close'].includes(scenario) ? now : null, created_at: now, revision: 1,
  order_items: [{ id: id(11), menu_item_id: id(12), name_lo: 'QA Noodles', name_th: 'QA Noodles', unit_price: 35000, quantity: 1, category: 'khao', size: 'regular', no_herbs: false, customization_note: '' }] }],
 calls: scenario === 'calls' ? [{ id: id(13), table_id: id(4), table_number: 1, reason: 'water', active: true, created_at: now, revision: 1 }] : [],
};
const clone = value => JSON.parse(JSON.stringify(value));
if (scenario === 'close') {
 const served = clone(snapshot.orders[0]);
 snapshot.orders.push({ ...served, id: id(14), order_number: 42, status: 'served', order_items: served.order_items.map(item => ({ ...item, id: id(15) })) });
}
const qa = window.tableFilterQa = { commands: [], snapshots: 0, snapshot };
let refresh;
qa.finishKitchenHandoff = () => {
 snapshot.orders[0].kitchen_pending = false;
 snapshot.orders[0].kitchen_sent_at = now;
 snapshot.orders[0].revision++;
 refresh?.();
};
const client = {
 auth: {
  getSession: async () => ({ data: { session: { user: { id: membership.user_id, email: 'qa@invalid.example' } } } }),
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
 },
 channel() { return { on(event, options, callback) { refresh = callback; return this; }, subscribe() { return this; } }; },
 removeChannel() {},
 async rpc(name, args) {
  if (name === 'pos_setup_status') return { data: { schemaVersion: 2, guestOrdersReady: true, paymentsReady: true }, error: null };
  if (name === 'pos_staff_snapshot') { qa.snapshots++; return { data: clone(snapshot), error: null }; }
  if (name !== 'pos_staff_command') throw new Error('Unexpected isolated RPC');
  const { p_action: action, p_payload: payload } = args;
  qa.commands.push({ action, payload: clone(payload) });
  if (action === 'call.answer' && payload.table === 1) snapshot.calls = [];
  else if (action === 'order.serve' && payload.id === id(10) && payload.revision === snapshot.orders[0].revision) { snapshot.orders[0].status = 'served'; snapshot.orders[0].revision++; }
  else if (action === 'order.close') {
   const order = snapshot.orders.find(item => item.id === payload.id && item.revision === payload.revision && item.status === 'served');
   if (!order) throw new Error('Unexpected order closure');
   order.status = 'completed';
   order.revision++;
  }
  else throw new Error('Unexpected isolated command');
  return { data: clone(snapshot), error: null };
 },
};
createRoot(document.getElementById('root')).render(<CloudApp client={client}/>);
