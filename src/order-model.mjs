export const orderTotal = (items) => items.reduce((sum, item) => sum + item.price * item.quantity, 0);
// Existing basket choices keep the base price quoted when that line was added.
export const quotedItemPrice = (item, size) => item.price - (item.size === 'large' ? 10000 : 0) + (size === 'large' ? 10000 : 0);
export function nextOrderStatus(order, action) {
  if (action === 'pay' && order.status === 'pending') return 'queued';
  if (!order.paid) return order.status;
  const transitions = { queued: { start: 'cooking' }, cooking: { ready: 'ready' }, ready: { serve: 'served' }, served: { close: 'completed' } };
  return transitions[order.status]?.[action] ?? order.status;
}
export function addCartItem(cart, item) {
  const same = (row) => row.id === item.id && row.size === item.size && row.note === item.note && row.price === item.price;
  return cart.some(same) ? cart.map(row => same(row) ? { ...row, quantity: row.quantity + item.quantity } : row) : [...cart, { ...item, key: `${item.id}-${Date.now()}-${cart.length}` }];
}
export function updateCartItem(cart, key, item) {
  if (!cart.some(row => row.key === key)) return cart;
  const matching = cart.find(row => row.key !== key && row.id === item.id && row.size === item.size && row.note === item.note && row.price === item.price);
  if (matching) {
    return cart.filter(row => row.key !== key).map(row => row.key === matching.key ? { ...row, quantity: row.quantity + item.quantity } : row);
  }
  return cart.map(row => row.key === key ? { ...item, key } : row);
}
