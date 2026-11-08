// The browser sends commands to transactional RPCs; it never writes POS tables directly.
import { assertMenuImage, validateMenuImageTicket, MENU_IMAGE_BUCKET } from './menu-upload.mjs';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const guestIdentity = /^[0-9a-f]{48}$/;
const fail = code => Object.assign(new Error(code), { code });
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function list(value) {
  if (!Array.isArray(value)) throw fail('invalid-response');
  return value;
}

function instant(value) {
  if (value === null || value === undefined) return undefined;
  const time = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(time)) throw fail('invalid-response');
  return time;
}

function numeric(value) {
  if (value === null || value === undefined || value === '') throw fail('invalid-response');
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw fail('invalid-response');
  return number;
}

function translations(raw) {
  return {
    lo: raw.name_lo, th: raw.name_th || raw.name_lo,
    en: raw.name_en ?? '', zh: raw.name_zh ?? '', ko: raw.name_ko ?? '', ja: raw.name_ja ?? '',
    detailLo: raw.detail_lo ?? '', detailTh: raw.detail_th ?? '',
  };
}

export function mapCloudMenuItem(raw) {
  if (!record(raw) || !uuid.test(raw.id) || typeof raw.name_lo !== 'string') throw fail('invalid-response');
  return {
    id: raw.id, ...translations(raw), price: numeric(raw.price), category: raw.category,
    image: raw.image_path, popular: raw.popular === true, available: raw.available === true,
  };
}

function mapCloudOrderItem(raw) {
  if (!record(raw) || !uuid.test(raw.id) || typeof raw.name_lo !== 'string') throw fail('invalid-response');
  const customizationNote = raw.customization_note ?? '';
  const noHerbs = raw.no_herbs === true;
  return {
    id: raw.menu_item_id, key: raw.id, ...translations(raw), category: raw.category, image: raw.image_path,
    price: numeric(raw.unit_price), quantity: numeric(raw.quantity), size: raw.size, noHerbs, customizationNote,
    note: [noHerbs ? 'ບໍ່ໃສ່ຜັກ' : '', customizationNote].filter(Boolean).join(' · '),
    noteTh: [noHerbs ? 'ไม่ใส่ผัก' : '', customizationNote].filter(Boolean).join(' · '),
  };
}

export function mapCloudOrder(raw, tables = []) {
  if (!record(raw) || !uuid.test(raw.id)) throw fail('invalid-response');
  const table = tables.find(table => table.id === raw.table_id);
  return {
    id: raw.id, orderNumber: numeric(raw.order_number), tableId: raw.table_id,
    table: numeric(raw.table_number ?? table?.number ?? table?.table_number),
    source: raw.source, method: raw.requested_method, status: raw.status, paid: raw.paid === true,
    paidAt: instant(raw.paid_at), kitchenPending: raw.kitchen_pending === true, kitchenSentAt: instant(raw.kitchen_sent_at),
    createdAt: instant(raw.created_at), revision: numeric(raw.revision), items: list(raw.order_items).map(mapCloudOrderItem),
  };
}

function mapMember(raw) {
  if (!record(raw) || !uuid.test(raw.id) || !(uuid.test(raw.user_id) || (raw.user_id === null && raw.role === 'owner')) || typeof raw.display_name !== 'string'
    || !['owner', 'manager', 'cashier'].includes(raw.role) || typeof raw.active !== 'boolean') throw fail('invalid-response');
  return { id: raw.id, authUserId: raw.user_id, ...(typeof raw.email === 'string' && { authEmail: raw.email }), name: raw.display_name, role: raw.role, active: raw.active };
}

function mapShift(raw, members) {
  const member = id => members.find(member => member.id === id)?.name ?? '';
  const shift = {
    id: raw.id, openedBy: raw.opened_by, openedByName: member(raw.opened_by),
    openedAt: instant(raw.opened_at), openingCash: numeric(raw.opening_cash),
  };
  if (raw.closed_at !== null && raw.closed_at !== undefined) Object.assign(shift, {
    closedBy: raw.closed_by, closedByName: member(raw.closed_by), closedAt: instant(raw.closed_at),
    countedCash: numeric(raw.counted_cash), cashSales: numeric(raw.cash_sales), transferSales: numeric(raw.transfer_sales),
    orderCount: numeric(raw.order_count), expectedCash: numeric(raw.expected_cash), difference: numeric(raw.difference),
  });
  return shift;
}

function activityType(entry) {
  if (entry.event_type === 'menu.availability') return entry.details?.available ? 'available' : 'sold-out';
  return {
    'order.create': 'order', 'order.pay': 'pay', 'order.reject': 'reject', 'order.kitchen-sent': 'kitchen-sent',
    'order.serve': 'serve', 'order.close': 'close', 'order.cancel': 'reject',
    'menu.save': 'dish', 'menu.remove': 'dish-deleted', 'table.add': 'table', 'table.update': 'table', 'table.remove': 'table',
    'staff.save': 'staff', 'settings.save': 'settings', 'shift.open': 'shift-open', 'shift.close': 'shift-close',
    'call.answer': 'call-answered', 'guest.call': 'call',
  }[entry.event_type] ?? entry.event_type;
}

export function mapCloudSnapshot(raw) {
  if (!record(raw) || !raw.membership) throw fail('session-expired');
  const membership = mapMember(raw.membership);
  if (!membership.active) throw fail('access-denied');
  const restaurant = raw.restaurants ?? raw.restaurant;
  if (!record(restaurant) || !uuid.test(raw.restaurantId) || restaurant.id !== raw.restaurantId
    || typeof restaurant.name !== 'string' || !Array.isArray(restaurant.payment_methods) || !restaurant.payment_methods.length) throw fail('invalid-response');
  const staff = list(raw.members).map(mapMember);
  if (!staff.some(member => member.id === membership.id && member.active)) throw fail('access-denied');
  const rawTables = list(raw.dining_tables);
  const tables = rawTables.filter(table => table.enabled !== false).map(table => ({
    id: table.id, tableKey: table.public_key, number: numeric(table.table_number), seats: numeric(table.seats), zone: table.zone,
  }));
  const menu = list(raw.menu_items).filter(item => item.enabled !== false).map(mapCloudMenuItem);
  const orders = list(raw.orders).map(order => mapCloudOrder(order, rawTables));
  const orderNumbers = new Map(orders.map(order => [order.id, order.orderNumber]));
  const calls = {};
  for (const call of list(raw.calls)) {
    if (!call.active) continue;
    const table = rawTables.find(table => table.id === call.table_id);
    const number = numeric(call.table_number ?? table?.table_number);
    calls[number] = { at: instant(call.created_at), reason: call.reason ?? 'help', revision: numeric(call.revision) };
  }
  return {
    restaurantId: raw.restaurantId, userId: membership.id, staff,
    ...(Object.hasOwn(raw, 'commandChanged') && { commandChanged: raw.commandChanged }),
    ...(raw.commandOrderId && { commandOrderId: raw.commandOrderId }),
    settings: { shopName: restaurant.name, branch: restaurant.branch ?? '', phone: restaurant.phone ?? '', methods: [...restaurant.payment_methods] },
    menu, soldOut: menu.filter(item => !item.available).map(item => item.id), tables,
    orders,
    shifts: list(raw.shifts).map(shift => mapShift(shift, staff)),
    payments: list(raw.payments).map(payment => ({
      id: payment.id, orderId: payment.order_id, shiftId: payment.shift_id, confirmedBy: payment.confirmed_by,
      amount: numeric(payment.amount), method: payment.method, cashReceived: payment.cash_received === null ? null : numeric(payment.cash_received),
      confirmedAt: instant(payment.confirmed_at), idempotencyKey: payment.idempotency_key,
    })),
    activity: list(raw.activity_log).map(entry => {
      const actor = staff.find(member => member.id === entry.actor_membership_id);
      const orderNumber = entry.details?.orderNumber ?? orderNumbers.get(entry.order_id);
      return { ...entry.details, ...(Number.isSafeInteger(orderNumber) && { orderNumber }), id: entry.id, type: activityType(entry), at: instant(entry.created_at), by: actor?.name ?? null, role: actor?.role ?? null, orderId: entry.order_id ?? undefined };
    }),
    calls, drafts: {}, clearedAt: {},
  };
}

function cloudError(error) {
  const message = typeof error?.message === 'string' ? error.message : '';
  let code = 'unavailable';
  if (error?.code === 'P0001' && /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(message)) code = message;
  else if (['PGRST301', 'PGRST302', 'PGRST303'].includes(error?.code) || error?.status === 401) code = 'session-expired';
  else if (error?.code === '42501' || error?.status === 403) code = 'access-denied';
  return Object.assign(new Error(message || code), { code, databaseCode: error?.code, cause: error });
}

function checkTable(tableKey) {
  if (!uuid.test(tableKey)) throw fail('invalid-table');
}

function checkGuest(tableKey, guestToken) {
  checkTable(tableKey);
  if (!guestIdentity.test(guestToken)) throw fail('access-denied');
}

export function createCloudApi(client) {
  if (typeof client?.rpc !== 'function') throw new TypeError('A Supabase client with rpc() is required');
  async function rpc(name, args) {
    let result;
    try { result = await client.rpc(name, args); }
    catch (error) { throw cloudError(error); }
    if (result?.error) throw cloudError(result.error);
    if (!record(result) || !('data' in result)) throw fail('invalid-response');
    return result.data;
  }
  return {
    async snapshot(restaurantId = null) {
      return mapCloudSnapshot(await rpc('pos_staff_snapshot', { p_restaurant_id: restaurantId }));
    },
    async command(action, payload, restaurantId) {
      if (action === 'menu.save' && (await rpc('pos_setup_status', {}))?.integrityReady !== true) throw fail('upgrade-required');
      return mapCloudSnapshot(await rpc('pos_staff_command', { p_restaurant_id: restaurantId, p_action: action, p_payload: payload }));
    },
    async claimOwner(shopName) {
      return mapCloudSnapshot(await rpc('pos_claim_owner', { p_shop_name: shopName }));
    },
    async uploadMenuImage(blob, restaurantId) {
      await assertMenuImage(blob);
      let url;
      if (client.accessMode === 'device') {
        const result = await client.uploadMenuImage(blob);
        if (result?.error) throw cloudError(result.error);
        url = result?.data?.url;
      } else {
        let ticket;
        try { ticket = validateMenuImageTicket(await rpc('pos_menu_upload_ticket', { p_restaurant_id: restaurantId })); }
        catch (error) {
          if (['PGRST202', '42883', '42P01'].includes(error.databaseCode)) throw fail('storage-not-ready');
          throw error;
        }
        const bucket = client.storage?.from(ticket.bucket);
        if (!bucket) throw fail('upload-failed');
        let result;
        try { result = await bucket.upload(ticket.path, blob, { contentType: 'image/webp', cacheControl: '31536000', upsert: false }); }
        catch { throw fail('upload-failed'); }
        if (result?.error) {
          const status = Number(result.error.statusCode ?? result.error.status);
          throw fail(status === 403 ? 'access-denied' : status === 404 ? 'storage-not-ready' : 'upload-failed');
        }
        url = bucket.getPublicUrl(ticket.path)?.data?.publicUrl;
      }
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !parsed.pathname.includes(`/storage/v1/object/public/${MENU_IMAGE_BUCKET}/`) || url.length > 512) throw new Error();
      } catch { throw fail('invalid-response'); }
      return url;
    },
    async getMenu(tableKey) {
      checkTable(tableKey);
      const data = await rpc('pos_get_menu', { p_table_key: tableKey });
      if (data === null) throw fail('invalid-table');
      if (!record(data) || !Number.isInteger(data.table) || data.table < 1 || typeof data.shopName !== 'string'
        || !Array.isArray(data.methods) || !data.methods.length || !data.methods.every(method => ['cash', 'transfer'].includes(method))
        || !Array.isArray(data.menu)) throw fail('invalid-response');
      return { ...data, tableKey };
    },
    async getOrders(tableKey, guestToken, requestId = null) {
      checkGuest(tableKey, guestToken);
      if (requestId !== null && !guestIdentity.test(requestId)) throw fail('invalid-order');
      const data = await rpc('pos_guest_orders', { p_table_key: tableKey, p_guest_token: guestToken, p_request_id: requestId });
      if (!record(data)) throw fail('invalid-response');
      return { orders: list(data.orders).map(order => mapCloudOrder(order)), matchedOrder: data.matchedOrder ? mapCloudOrder(data.matchedOrder) : null,
        ...(Object.hasOwn(data, 'call') && { call: data.call ? { reason: data.call.reason, at: instant(data.call.created_at) } : null }) };
    },
    async submitOrder(tableKey, guestToken, { requestId, cart, method, reviewedKey }) {
      checkGuest(tableKey, guestToken);
      if (!guestIdentity.test(requestId)) throw fail('invalid-order');
      const data = await rpc('pos_guest_submit', { p_table_key: tableKey, p_guest_token: guestToken, p_request_id: requestId, p_cart: cart, p_method: method, p_reviewed_key: reviewedKey });
      if (!record(data) || !uuid.test(data.orderId)) throw fail('invalid-response');
      return { orderId: data.orderId, orderNumber: numeric(data.orderNumber) };
    },
    async guestCall(tableKey, guestToken, { active = true } = {}) {
      checkGuest(tableKey, guestToken);
      return rpc('pos_guest_call', { p_table_key: tableKey, p_guest_token: guestToken, p_active: active });
    },
    async cancelOrder(tableKey, guestToken, orderId) {
      checkGuest(tableKey, guestToken);
      if (!uuid.test(orderId)) throw fail('invalid-order');
      return rpc('pos_guest_cancel', { p_table_key: tableKey, p_guest_token: guestToken, p_order_id: orderId });
    },
  };
}
