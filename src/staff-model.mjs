import { isActiveOrder, needsKitchenHandoff, orderTotal } from './order-model.mjs';

export const staffOrderState = order => needsKitchenHandoff(order) ? 'handoff' : order.status;
const urgency = ['pending', 'handoff', 'ready', 'cooking', 'queued', 'served'];
const matchesStatus = (order, filter) => filter === 'kitchen'
  ? ['queued', 'cooking'].includes(staffOrderState(order)) : staffOrderState(order) === filter;

export function summarizeStaffTable(orders, call = null) {
  const active = orders.filter(isActiveOrder);
  return {
    orders: active,
    status: urgency.find(status => active.some(order => staffOrderState(order) === status)) ?? 'empty',
    due: active.filter(order => !order.paid).reduce((sum, order) => sum + orderTotal(order.items), 0),
    total: active.reduce((sum, order) => sum + orderTotal(order.items), 0),
    pendingCount: active.filter(order => order.status === 'pending').length,
    readyCount: active.filter(order => order.status === 'ready').length,
    call,
  };
}

export function matchesStaffTable(summary, filter = 'all') {
  if (filter === 'all') return true;
  if (filter === 'calls') return Boolean(summary.call);
  if (filter === 'empty') return summary.orders.length === 0;
  return summary.orders.some(order => matchesStatus(order, filter));
}

export function nextStaffOrder(orders, selectedId = null, filter = 'all') {
  const active = orders.filter(isActiveOrder);
  const selected = active.find(order => order.id === selectedId);
  if (selected) return selected;
  const matching = ['pending', 'handoff', 'ready', 'kitchen', 'served'].includes(filter) ? active.filter(order => matchesStatus(order, filter)) : active;
  const candidates = matching.length ? matching : active;
  return candidates.sort((a, b) => urgency.indexOf(staffOrderState(a)) - urgency.indexOf(staffOrderState(b)) || a.createdAt - b.createdAt)[0] ?? null;
}
