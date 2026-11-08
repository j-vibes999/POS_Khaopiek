import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudApi, mapCloudMenuItem, mapCloudOrder, mapCloudSnapshot } from '../src/cloud-api.mjs';

const restaurantId = '10000000-0000-4000-8000-000000000001';
const memberId = '20000000-0000-4000-8000-000000000001';
const authUserId = '30000000-0000-4000-8000-000000000001';
const tableId = '40000000-0000-4000-8000-000000000001';
const tableKey = '50000000-0000-4000-8000-000000000001';
const menuId = '60000000-0000-4000-8000-000000000001';
const orderId = '70000000-0000-4000-8000-000000000001';
const lineId = '80000000-0000-4000-8000-000000000001';
const shiftId = '90000000-0000-4000-8000-000000000001';
const guestToken = 'a1'.repeat(24);
const requestId = 'b2'.repeat(24);
const createdAt = '2026-11-07T03:00:00.000Z';
const paidAt = '2026-11-07T03:02:00.000Z';
const epochCreated = 1794020400000;
const epochPaid = 1794020520000;

const rawMember = { id: memberId, restaurant_id: restaurantId, user_id: authUserId, display_name: 'Seng', role: 'owner', active: true, created_at: createdAt };
const rawTable = { id: tableId, restaurant_id: restaurantId, table_number: 3, seats: 4, zone: 'Front', enabled: true, public_key: tableKey, created_at: createdAt };
const rawMenu = {
  id: menuId, restaurant_id: restaurantId, code: 'pork', name_lo: 'ເຂົ້າປຽກໝູ', name_th: 'ข้าวเปียกหมู', name_en: 'Pork noodles', name_zh: '猪肉米粉', name_ko: '돼지고기 국수', name_ja: '豚肉麺',
  detail_lo: 'ເສັ້ນນຸ່ມ', detail_th: 'เส้นนุ่ม', price: 35000, category: 'khao', image_path: '/images/pork.jpg', popular: true, available: false, enabled: true, sort_order: 0, created_at: createdAt,
};
const rawLine = {
  ...rawMenu, id: lineId, menu_item_id: menuId, order_id: orderId, line_number: 1,
  unit_price: 45000, quantity: 2, line_total: 90000, size: 'large', no_herbs: true, customization_note: 'Separate soup',
};
const rawOrder = {
  id: orderId, restaurant_id: restaurantId, order_number: 27, table_id: tableId, source: 'qr', created_by: null,
  requested_method: 'cash', status: 'queued', paid: true, paid_at: paidAt, kitchen_pending: true, kitchen_sent_at: null,
  created_at: createdAt, revision: 2, request_key: null, order_items: [rawLine],
};
function rawSnapshot() {
  return {
    restaurantId, membership: { ...rawMember }, restaurants: { id: restaurantId, name: 'Khao Piek', branch: 'Vientiane', phone: '02012345678', payment_methods: ['transfer', 'cash'], enabled: true },
    members: [{ ...rawMember }], menu_items: [{ ...rawMenu }], dining_tables: [{ ...rawTable }], orders: [{ ...rawOrder }],
    shifts: [{ id: shiftId, restaurant_id: restaurantId, opened_by: memberId, opened_at: createdAt, opening_cash: 100000, closed_by: memberId, closed_at: paidAt, counted_cash: 200000, cash_sales: 90000, transfer_sales: 0, order_count: 1, expected_cash: 190000, difference: 10000 }],
    payments: [{ id: '10000000-0000-4000-8000-000000000002', order_id: orderId, shift_id: shiftId, confirmed_by: memberId, amount: 90000, method: 'cash', cash_received: 100000, confirmed_at: paidAt, idempotency_key: '10000000-0000-4000-8000-000000000003' }],
    kitchen_print_jobs: [],
    activity_log: [{ id: '10000000-0000-4000-8000-000000000004', actor_membership_id: memberId, order_id: orderId, event_type: 'pay', details: { table: 3, amount: 90000, method: 'cash' }, created_at: paidAt }],
    calls: [{ table_id: tableId, table_number: 3, restaurant_id: restaurantId, created_at: createdAt, active: true, reason: 'help', revision: 1 }],
  };
}

function rpcClient(responses) {
  let next = 0;
  return {
    rpc: async (name, args) => {
      const step = responses[next++];
      assert.ok(step, `Unexpected RPC ${name}`);
      assert.equal(name, step.name);
      assert.deepEqual(args, step.args);
      if (step.throws) throw step.throws;
      return { data: step.data ?? null, error: step.error ?? null };
    },
  };
}

test('maps real menu translations and availability without substituting demo values', () => {
  assert.deepEqual(mapCloudMenuItem(rawMenu), {
    id: menuId, lo: 'ເຂົ້າປຽກໝູ', th: 'ข้าวเปียกหมู', en: 'Pork noodles', zh: '猪肉米粉', ko: '돼지고기 국수', ja: '豚肉麺', detailLo: 'ເສັ້ນນຸ່ມ', detailTh: 'เส้นนุ่ม',
    price: 35000, category: 'khao', image: '/images/pork.jpg', popular: true, available: false,
  });
});

test('keeps UUID order identity, display number, revision and historical item snapshots distinct', () => {
  const order = mapCloudOrder(rawOrder, [rawTable]);
  assert.deepEqual(order, {
    id: orderId, orderNumber: 27, tableId, table: 3, source: 'qr', method: 'cash', status: 'queued', paid: true,
    paidAt: epochPaid, kitchenPending: true, kitchenSentAt: undefined, createdAt: epochCreated, revision: 2,
    items: [{ id: menuId, key: lineId, lo: 'ເຂົ້າປຽກໝູ', th: 'ข้าวเปียกหมู', en: 'Pork noodles', zh: '猪肉米粉', ko: '돼지고기 국수', ja: '豚肉麺', detailLo: 'ເສັ້ນນຸ່ມ', detailTh: 'เส้นนุ่ม', category: 'khao', image: '/images/pork.jpg',
      price: 45000, quantity: 2, size: 'large', noHerbs: true, customizationNote: 'Separate soup', note: 'ບໍ່ໃສ່ຜັກ · Separate soup', noteTh: 'ไม่ใส่ผัก · Separate soup' }],
  });
});

test('guest order mapping uses the server table number without a staff table lookup', () => {
  const order = mapCloudOrder({ ...rawOrder, table_number: 9 });
  assert.equal(order.table, 9);
  assert.equal(order.id, orderId);
  assert.equal(order.items[0].price, 45000);
});

test('maps authenticated membership, financial timestamps and calls to the current staff session', () => {
  const session = mapCloudSnapshot(rawSnapshot());
  assert.equal(session.restaurantId, restaurantId);
  assert.equal(session.userId, memberId);
  assert.deepEqual(session.staff, [{ id: memberId, authUserId, name: 'Seng', role: 'owner', active: true }]);
  assert.deepEqual(session.settings, { shopName: 'Khao Piek', branch: 'Vientiane', phone: '02012345678', methods: ['transfer', 'cash'] });
  assert.deepEqual(session.tables, [{ id: tableId, tableKey, number: 3, seats: 4, zone: 'Front' }]);
  assert.deepEqual(session.soldOut, [menuId]);
  assert.equal(session.orders[0].id, orderId);
  assert.deepEqual(session.shifts[0], { id: shiftId, openedBy: memberId, openedByName: 'Seng', openedAt: epochCreated, openingCash: 100000, closedBy: memberId, closedByName: 'Seng', closedAt: epochPaid, countedCash: 200000, cashSales: 90000, transferSales: 0, orderCount: 1, expectedCash: 190000, difference: 10000 });
  assert.deepEqual(session.payments[0], { id: '10000000-0000-4000-8000-000000000002', orderId, shiftId, confirmedBy: memberId, amount: 90000, method: 'cash', cashReceived: 100000, confirmedAt: epochPaid, idempotencyKey: '10000000-0000-4000-8000-000000000003' });
  assert.deepEqual(session.activity[0], { id: '10000000-0000-4000-8000-000000000004', type: 'pay', at: epochPaid, by: 'Seng', role: 'owner', orderId, orderNumber: 27, table: 3, amount: 90000, method: 'cash' });
  assert.deepEqual(session.calls[3], { at: epochCreated, reason: 'help', revision: 1 });
  assert.deepEqual(session.drafts, {});
  assert.deepEqual(session.clearedAt, {});
  assert.equal('pin' in session.staff[0], false);
});

test('a genuinely empty restaurant stays empty and disabled rows remain outside active setup', () => {
  const raw = rawSnapshot();
  raw.orders = []; raw.shifts = []; raw.payments = []; raw.activity_log = []; raw.calls = [];
  raw.menu_items[0].enabled = false;
  raw.dining_tables[0].enabled = false;
  const session = mapCloudSnapshot(raw);
  assert.deepEqual(session.menu, []);
  assert.deepEqual(session.tables, []);
  assert.deepEqual(session.orders, []);
  assert.deepEqual(session.calls, {});
});

test('maps an open shift without pretending a nullable close time is an epoch close', () => {
  const raw = rawSnapshot();
  Object.assign(raw.shifts[0], { closed_by: null, closed_at: null, counted_cash: null, cash_sales: null, transfer_sales: null, order_count: null, expected_cash: null, difference: null });
  assert.deepEqual(mapCloudSnapshot(raw).shifts[0], { id: shiftId, openedBy: memberId, openedByName: 'Seng', openedAt: epochCreated, openingCash: 100000 });
});

test('unauthenticated or malformed snapshots fail instead of restoring default staff or menu', () => {
  assert.throws(() => mapCloudSnapshot(null), error => error.code === 'session-expired');
  assert.throws(() => mapCloudSnapshot({ ...rawSnapshot(), membership: null }), error => error.code === 'session-expired');
  assert.throws(() => mapCloudSnapshot({ ...rawSnapshot(), orders: null }), error => error.code === 'invalid-response');
});

test('staff RPC operations return mapped server snapshots', async () => {
  const client = rpcClient([
    { name: 'pos_staff_snapshot', args: { p_restaurant_id: null }, data: rawSnapshot() },
    { name: 'pos_staff_command', args: { p_restaurant_id: restaurantId, p_action: 'order.pay', p_payload: { id: orderId, revision: 2, method: 'cash', received: 100000, idempotencyKey: authUserId } }, data: rawSnapshot() },
    { name: 'pos_claim_owner', args: { p_shop_name: 'Khao Piek' }, data: rawSnapshot() },
  ]);
  const api = createCloudApi(client);
  assert.equal((await api.snapshot()).userId, memberId);
  assert.equal((await api.command('order.pay', { id: orderId, revision: 2, method: 'cash', received: 100000, idempotencyKey: authUserId }, restaurantId)).orders[0].orderNumber, 27);
  assert.equal((await api.claimOwner('Khao Piek')).restaurantId, restaurantId);
});

test('business SQL failures retain their recovery code, and expired JWTs require login', async () => {
  for (const [remote, expected] of [
    [{ code: 'P0001', message: 'cart-changed', details: null, hint: null }, 'cart-changed'],
    [{ code: 'P0001', message: 'changed', details: null, hint: null }, 'changed'],
    [{ code: 'P0001', message: 'amount', details: null, hint: null }, 'amount'],
    [{ code: 'P0001', message: 'no-membership', details: null, hint: null }, 'no-membership'],
    [{ code: 'PGRST301', message: 'JWT expired', details: null, hint: null }, 'session-expired'],
    [{ code: '42501', message: 'permission denied for function', details: null, hint: null }, 'access-denied'],
  ]) {
    const api = createCloudApi(rpcClient([{ name: 'pos_staff_snapshot', args: { p_restaurant_id: null }, error: remote }]));
    await assert.rejects(api.snapshot(), error => error.code === expected);
  }
});

test('transport failures and missing response data never turn into a local success', async () => {
  const offline = createCloudApi(rpcClient([{ name: 'pos_staff_snapshot', args: { p_restaurant_id: null }, throws: new TypeError('Failed to fetch') }]));
  await assert.rejects(offline.snapshot(), error => error.code === 'unavailable');
  const missing = createCloudApi(rpcClient([{ name: 'pos_staff_snapshot', args: { p_restaurant_id: null } }]));
  await assert.rejects(missing.snapshot(), error => error.code === 'session-expired');
});

test('public menu uses the opaque table key and does not add staff data to its projection', async () => {
  const menu = { table: 3, shopName: 'Khao Piek', methods: ['cash'], menu: [{ id: menuId, lo: 'ເຂົ້າປຽກໝູ', price: 35000, category: 'khao', available: true }] };
  const api = createCloudApi(rpcClient([{ name: 'pos_get_menu', args: { p_table_key: tableKey }, data: menu }]));
  assert.deepEqual(await api.getMenu(tableKey), { ...menu, tableKey });
});

test('unknown public table keys raise invalid-table and incomplete public menus fail closed', async () => {
  const api = createCloudApi(rpcClient([
    { name: 'pos_get_menu', args: { p_table_key: tableKey }, data: null },
    { name: 'pos_get_menu', args: { p_table_key: tableKey }, data: { table: 3, menu: [] } },
  ]));
  await assert.rejects(api.getMenu(tableKey), error => error.code === 'invalid-table');
  await assert.rejects(api.getMenu(tableKey), error => error.code === 'invalid-response');
});

test('guest request recovery preserves 48-hex request identity and UUID receipt identity', async () => {
  const cart = [{ id: menuId, key: 'line-1', lo: 'ເຂົ້າປຽກໝູ', price: 45000, quantity: 2, size: 'large', noHerbs: true, customizationNote: 'Separate soup' }];
  const reviewedKey = '[3,[],"cash"]';
  const api = createCloudApi(rpcClient([
    { name: 'pos_guest_orders', args: { p_table_key: tableKey, p_guest_token: guestToken, p_request_id: requestId }, data: { orders: [{ ...rawOrder, table_number: 3 }], matchedOrder: { ...rawOrder, table_number: 3 } } },
    { name: 'pos_guest_submit', args: { p_table_key: tableKey, p_guest_token: guestToken, p_request_id: requestId, p_cart: cart, p_method: 'cash', p_reviewed_key: reviewedKey }, data: { orderId, orderNumber: 27 } },
  ]));
  const history = await api.getOrders(tableKey, guestToken, requestId);
  assert.equal(history.orders[0].id, orderId);
  assert.equal(history.matchedOrder.id, orderId);
  assert.equal(history.matchedOrder.table, 3);
  assert.deepEqual(await api.submitOrder(tableKey, guestToken, { requestId, cart, method: 'cash', reviewedKey }), { orderId, orderNumber: 27 });
});

test('guest call and cancellation route opaque identities to their dedicated RPCs', async () => {
  const api = createCloudApi(rpcClient([
    { name: 'pos_guest_call', args: { p_table_key: tableKey, p_guest_token: guestToken, p_active: true }, data: { active: true } },
    { name: 'pos_guest_call', args: { p_table_key: tableKey, p_guest_token: guestToken, p_active: false }, data: { active: false } },
    { name: 'pos_guest_cancel', args: { p_table_key: tableKey, p_guest_token: guestToken, p_order_id: orderId }, data: { cancelled: true } },
  ]));
  assert.deepEqual(await api.guestCall(tableKey, guestToken), { active: true });
  assert.deepEqual(await api.guestCall(tableKey, guestToken, { active: false }), { active: false });
  assert.deepEqual(await api.cancelOrder(tableKey, guestToken, orderId), { cancelled: true });
});


test('canonical SQL event names become the staff activity labels and preserve immutable details', () => {
  const raw = rawSnapshot();
  raw.activity_log = [
    { id: 'log-pay', event_type: 'order.pay', actor_membership_id: memberId, order_id: orderId, created_at: paidAt, details: { amount: 90000, method: 'cash' } },
    { id: 'log-open', event_type: 'shift.open', actor_membership_id: memberId, order_id: null, created_at: createdAt, details: { amount: 100000 } },
    { id: 'log-available', event_type: 'menu.availability', actor_membership_id: memberId, order_id: null, created_at: createdAt, details: { itemId: menuId, available: false } },
  ];
  const activity = mapCloudSnapshot(raw).activity;
  assert.equal(activity[0].type, 'pay');
  assert.equal(activity[0].amount, 90000);
  assert.equal(activity[0].by, 'Seng');
  assert.equal(activity[1].type, 'shift-open');
  assert.equal(activity[1].amount, 100000);
  assert.equal(activity[2].type, 'sold-out');
  assert.equal(activity[2].itemId, menuId);
});

test('payment acknowledgement keeps server duplicate and created-order metadata for the one-print workflow', () => {
  const original = mapCloudSnapshot({ ...rawSnapshot(), commandChanged: true, commandOrderId: orderId });
  const retried = mapCloudSnapshot({ ...rawSnapshot(), commandChanged: false, commandOrderId: orderId });
  assert.equal(original.commandChanged, true);
  assert.equal(retried.commandChanged, false);
  assert.equal(retried.commandOrderId, orderId);
});

test('guest staff-call status comes only from the scoped server response', async () => {
  const api = createCloudApi(rpcClient([{ name: 'pos_guest_orders', args: { p_table_key: tableKey, p_guest_token: guestToken, p_request_id: null }, data: { orders: [], matchedOrder: null, call: { reason: 'help', created_at: createdAt } } }]));
  const data = await api.getOrders(tableKey, guestToken);
  assert.deepEqual(data.call, { reason: 'help', at: epochCreated });
});

test('maps device owner without inventing an Auth account; account staff still require an Auth identity', () => {
 const raw = rawSnapshot();
 raw.membership.user_id = null;
 raw.members[0].user_id = null;
 const mapped = mapCloudSnapshot(raw);
 assert.equal(mapped.userId, memberId);
 assert.equal(mapped.staff[0].authUserId, null);
 assert.equal(mapped.staff[0].role, 'owner');
 raw.membership.role = 'cashier';
 raw.members[0].role = 'cashier';
 assert.throws(() => mapCloudSnapshot(raw), { code: 'invalid-response' });
});

const preparedPhoto=()=>new Blob([Uint8Array.from([82,73,70,70,12,0,0,0,87,69,66,80,86,80,56,32,0,0,0,0])],{type:'image/webp'});
test('menu image upload waits for authorized Storage upload and returns its permanent public URL',async()=>{
 const path=restaurantId+'/'+menuId+'.webp';const calls=[];
 const client={rpc:async(name,args)=>{assert.equal(name,'pos_menu_upload_ticket');assert.deepEqual(args,{p_restaurant_id:restaurantId});return{data:{bucket:'pos-menu-images',path},error:null};},storage:{from(bucket){assert.equal(bucket,'pos-menu-images');return{async upload(object,file,options){calls.push({object,file,options});return{data:{path:object},error:null};},getPublicUrl(object){return{data:{publicUrl:'https://example.supabase.co/storage/v1/object/public/pos-menu-images/'+object}};}};}}};
 const file=preparedPhoto();const result=await createCloudApi(client).uploadMenuImage(file,restaurantId);
 assert.equal(result,'https://example.supabase.co/storage/v1/object/public/pos-menu-images/'+path);
 assert.equal(calls[0].file,file);assert.equal(calls[0].options.upsert,false);
});
test('menu image upload refuses local failures and preserves the Storage error instead of claiming success',async()=>{
 const client={rpc:async()=>({data:{bucket:'pos-menu-images',path:restaurantId+'/'+menuId+'.webp'},error:null}),storage:{from(){return{upload:async()=>({error:{statusCode:'403',message:'denied'}})};}}};
 await assert.rejects(createCloudApi(client).uploadMenuImage(preparedPhoto(),restaurantId),{code:'access-denied'});
 await assert.rejects(createCloudApi(client).uploadMenuImage(new Blob(['bad'],{type:'image/webp'}),restaurantId),{code:'image-type'});
 const missing={rpc:async()=>({data:null,error:{code:'PGRST202',message:'not installed'}})};
 await assert.rejects(createCloudApi(missing).uploadMenuImage(preparedPhoto(),restaurantId),{code:'storage-not-ready'});
});
test('device menu photos use the private gateway without an Auth or Storage client in the browser',async()=>{
 const file=preparedPhoto();const url='https://example.supabase.co/storage/v1/object/public/pos-menu-images/'+restaurantId+'/'+menuId+'.webp';
 const client={rpc(){assert.fail('Device upload must use its upload gateway');},accessMode:'device',uploadMenuImage:async blob=>{assert.equal(blob,file);return{data:{url},error:null};}};
 assert.equal(await createCloudApi(client).uploadMenuImage(file,restaurantId),url);
});

test('menu saves refuse legacy unsafe workflows and require the integrity migration before writing',async()=>{
 const dish={creationId:menuId,lo:'Soup',price:35000,category:'khao'};
 const old=createCloudApi(rpcClient([{name:'pos_setup_status',args:{},data:{schemaVersion:2}}]));
 await assert.rejects(old.command('menu.save',dish,restaurantId),{code:'upgrade-required'});
 const ready=createCloudApi(rpcClient([{name:'pos_setup_status',args:{},data:{schemaVersion:2,integrityReady:true}},{name:'pos_staff_command',args:{p_restaurant_id:restaurantId,p_action:'menu.save',p_payload:dish},data:rawSnapshot()}]));
 assert.equal((await ready.command('menu.save',dish,restaurantId)).restaurantId,restaurantId);
});
