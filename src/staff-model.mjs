import { orderTotal } from './order-model.mjs';

const urgency = ['pending', 'ready', 'cooking', 'queued', 'served'];
const matchesStatus = (order, filter) => filter === 'kitchen'
  ? ['queued', 'cooking'].includes(order.status) : order.status === filter;

export function summarizeStaffTable(orders, call = null) {
  const active = orders.filter(order => order.status !== 'completed');
  return {
    orders: active,
    status: urgency.find(status => active.some(order => order.status === status)) ?? 'empty',
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
  const active = orders.filter(order => order.status !== 'completed');
  const selected = active.find(order => order.id === selectedId);
  if (selected) return selected;
  const matching = ['pending', 'ready', 'kitchen', 'served'].includes(filter) ? active.filter(order => matchesStatus(order, filter)) : active;
  const candidates = matching.length ? matching : active;
  return candidates.sort((a, b) => urgency.indexOf(a.status) - urgency.indexOf(b.status) || a.createdAt - b.createdAt)[0] ?? null;
}
