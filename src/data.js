export const initialMenu = [
  { id: 'pork', lo: 'ຂ້າວປຽກເສັ້ນໝູ', th: 'ข้าวเปียกเส้นหมู', detailLo: 'ເສັ້ນນຸ່ມ ນ້ຳຊຸບກະດູກໝູ ໃສ່ຜັກຫອມ', detailTh: 'เส้นนุ่ม น้ำซุปกระดูกหมู โรยต้นหอม', price: 35000, category: 'noodles', image: '/images/khao-piak.jpg', popular: true, available: true },
  { id: 'chicken', lo: 'ຂ້າວປຽກເສັ້ນໄກ່', th: 'ข้าวเปียกเส้นไก่', detailLo: 'ຊີ້ນໄກ່ນຸ່ມ ນ້ຳຊຸບຫອມ ລົດຊາດກົມກ່ອມ', detailTh: 'เนื้อไก่นุ่ม น้ำซุปหอม รสชาติกลมกล่อม', price: 35000, category: 'noodles', image: '/images/khao-piak.jpg', available: true },
  { id: 'pho', lo: 'ເຝີຊີ້ນງົວ', th: 'เฝอเนื้อ', detailLo: 'ຊີ້ນງົວສົດ ເສັ້ນເຝີ ນ້ຳຊຸບເຄື່ອງເທດ', detailTh: 'เนื้อสด เส้นเฝอ น้ำซุปเครื่องเทศ', price: 45000, category: 'noodles', image: '/images/pho.jpg', popular: true, available: true },
  { id: 'mixed', lo: 'ເຝີລວມມິດ', th: 'เฝอรวมมิตร', detailLo: 'ຊີ້ນງົວ ລູກຊີ້ນ ແລະ ເຄື່ອງໃນ', detailTh: 'เนื้อ ลูกชิ้น และเครื่องใน', price: 50000, category: 'noodles', image: '/images/pho.jpg', available: true },
  { id: 'coffee', lo: 'ກາເຟລາວເຢັນ', th: 'กาแฟลาวเย็น', detailLo: 'ກາເຟຫອມເຂັ້ມ ຈາກພູພຽງບໍລະເວນ', detailTh: 'กาแฟเข้ม หอม จากที่ราบสูงโบลาเวน', price: 20000, category: 'drinks', image: '/images/coffee.jpg', available: true },
  { id: 'tea', lo: 'ຊາໝາກນາວ', th: 'ชามะนาว', detailLo: 'ຊາຫອມ ສົ້ມຫວານ ສົດຊື່ນ', detailTh: 'ชาหอม เปรี้ยวหวาน สดชื่น', price: 15000, category: 'drinks', image: '/images/drink.jpg', available: true },
];
const line = (id, quantity, note = '') => ({ ...initialMenu.find(item => item.id === id), quantity, note, noteTh: note ? 'ไม่ใส่ผัก' : '', size: 'regular' });
export const initialOrders = [
  { id: '1024', table: 3, status: 'pending', paid: false, method: 'transfer', createdAt: Date.now() - 3 * 60000, items: [line('pork', 2, 'ບໍ່ໃສ່ຜັກ'), line('pho', 1), line('tea', 2)] },
  { id: '1023', table: 7, status: 'pending', paid: false, method: 'cash', createdAt: Date.now() - 5 * 60000, items: [line('chicken', 2), line('coffee', 1)] },
  { id: '1022', table: 1, status: 'cooking', paid: true, method: 'transfer', createdAt: Date.now() - 11 * 60000, items: [line('pho', 2), line('tea', 2)] },
  { id: '1021', table: 5, status: 'queued', paid: true, method: 'cash', createdAt: Date.now() - 8 * 60000, items: [line('pork', 3), line('coffee', 1)] },
  { id: '1020', table: 8, status: 'ready', paid: true, method: 'transfer', createdAt: Date.now() - 15 * 60000, items: [line('mixed', 2), line('tea', 1)] },
  { id: '1019', table: 10, status: 'served', paid: true, method: 'cash', createdAt: Date.now() - 24 * 60000, items: [line('chicken', 2)] },
];
