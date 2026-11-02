export const orderTotal = (items) => items.reduce((sum, item) => sum + item.price * item.quantity, 0);
export function nextOrderStatus(order, action) {
  if (action === 'pay' && order.status === 'pending') return 'queued';
  if (!order.paid) return order.status;
  const transitions = { queued: { start: 'cooking' }, cooking: { ready: 'ready' }, ready: { serve: 'served' }, served: { close: 'completed' } };
  return transitions[order.status]?.[action] ?? order.status;
}
export function addCartItem(cart, item) {
  const same = (row) => row.id === item.id && row.size === item.size && row.note === item.note;
  return cart.some(same) ? cart.map(row => same(row) ? { ...row, quantity: row.quantity + item.quantity } : row) : [...cart, { ...item, key: `${item.id}-${Date.now()}-${cart.length}` }];
}
