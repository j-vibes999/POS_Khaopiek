import { orderTotal } from './order-model.mjs';

export const customerOrders = (orders, table) => orders.filter(order => order.table === table);

export function summarizeCustomerOrders(orders) {
  return orders.reduce((summary, order) => {
    const amount = orderTotal(order.items);
    summary.total += amount;
    summary[order.paid ? 'paid' : 'due'] += amount;
    summary.itemCount += order.items.reduce((count, item) => count + item.quantity, 0);
    return summary;
  }, { total: 0, paid: 0, due: 0, itemCount: 0 });
}

export function customerCategory(item) {
  return item.category === 'drinks' ? 'drinks' : ['pork', 'chicken'].includes(item.id) ? 'khao' : 'pho';
}

export function filterCustomerMenu(menu, category, search) {
  const query = search.trim().toLocaleLowerCase();
  return menu.filter(item => (category === 'all' || customerCategory(item) === category)
    && (!query || ['lo', 'th', 'en', 'zh', 'ko', 'ja'].some(lang => item[lang]?.toLocaleLowerCase().includes(query))));
}
