import React, { createContext, useContext, useEffect, useId, useRef } from 'react';
import { BarChart3, ChefHat, ClipboardList, LayoutGrid, QrCode, Settings, Smartphone, UserCog, Utensils, Wallet, X } from 'lucide-react';

// Shared pieces of the Lao/Thai staff screens.
export const Locale = createContext();
export const useL = () => useContext(Locale);
export const money = n => new Intl.NumberFormat('en-US').format(n);
export const pad = n => String(n).padStart(2, '0');
export const itemName = (item, lang) => item[lang] || item.lo;
export const clockTime = time => new Date(time).toLocaleTimeString('en-GB', { timeZone: 'Asia/Vientiane', hour: '2-digit', minute: '2-digit' });
export const shortDate = time => new Date(time).toLocaleDateString('en-GB', { timeZone: 'Asia/Vientiane', day: '2-digit', month: '2-digit', year: 'numeric' });
export const statusText = (status, t) => ({ pending: t('ລໍຖ້າຮັບເງິນ', 'รอรับเงิน'), queued: t('ລໍຖ້າຄົວ', 'รอครัวรับ'), cooking: t('ກຳລັງເຮັດ', 'กำลังทำ'), ready: t('ພ້ອມເສີບ', 'พร้อมเสิร์ฟ'), served: t('ເສີບແລ້ວ', 'เสิร์ฟแล้ว'), completed: t('ສຳເລັດ', 'เสร็จสิ้น'), empty: t('ໂຕະຫວ່າງ', 'โต๊ะว่าง') }[status]);
export const roleText = (role, t) => ({ owner: t('ເຈົ້າຂອງຮ້ານ', 'เจ้าของร้าน'), manager: t('ຜູ້ຈັດການ', 'ผู้จัดการ'), cashier: t('ແຄຊເຊຍ', 'แคชเชียร์'), kitchen: t('ພະນັກງານຄົວ', 'พนักงานครัว') }[role]);
export const methodText = (method, t) => method === 'transfer' ? t('ໂອນເງິນ', 'โอนเงิน') : t('ເງິນສົດ', 'เงินสด');
export const viewLabel = (view, t) => ({ tables: t('ໂຕະອາຫານ', 'โต๊ะอาหาร'), orders: t('ອໍເດີທັງໝົດ', 'ออเดอร์ทั้งหมด'), kitchen: t('ໜ້າຈໍຄົວ', 'หน้าจอครัว'), shift: t('ກະ & ເງິນສົດ', 'กะ & เงินสด'), menu: t('ຈັດການເມນູ', 'จัดการเมนู'), 'table-setup': t('ໂຕະ & QR', 'โต๊ะ & QR'), staff: t('ພະນັກງານ', 'พนักงาน'), reports: t('ສະຫຼຸບຍອດຂາຍ', 'สรุปยอดขาย'), settings: t('ຕັ້ງຄ່າ', 'ตั้งค่า'), customer: t('ເມນູລູກຄ້າ', 'เมนูลูกค้า') }[view]);
export const viewIcons = { tables: LayoutGrid, orders: ClipboardList, kitchen: ChefHat, shift: Wallet, menu: Utensils, 'table-setup': QrCode, staff: UserCog, reports: BarChart3, settings: Settings, customer: Smartphone };
// Lao and Thai write some vowels before the consonant, so skip them for an avatar letter.
export const initial = name => { const [first, second] = [...name.trim()]; return /[ເ-ໄเ-ไ]/.test(first) && second ? second : first ?? '?'; };

export function Badge({ status, children }) { const { t } = useL(); return <span className={`badge ${status}`}><span className="status-dot"/>{children || statusText(status, t)}</span>; }
export function IconButton({ label, children, ...props }) { return <button className="icon-button" aria-label={label} title={label} {...props}>{children}</button>; }
export function isDialogBackdropClick(event) {
  if (event.target !== event.currentTarget) return false;
  const bounds = event.currentTarget.getBoundingClientRect();
  return event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom;
}
export function Dialog({ title, onClose, children, className = '' }) {
  const ref = useRef();
  const titleId = useId();
  const { t } = useL();
  useEffect(() => {
    const previous = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current.showModal();
    // showModal focuses the first control (the close button), so move focus to the field the dialog asks for.
    ref.current.querySelector('[data-autofocus]')?.focus();
    return () => {
      document.body.style.overflow = overflow;
      if (previous?.isConnected) previous.focus({ preventScroll: true });
    };
  }, []);
  return <dialog ref={ref} className={`dialog ${className}`} aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (isDialogBackdropClick(event)) onClose(); }}><div className="dialog-head"><h2 id={titleId}>{title}</h2><IconButton label={t('ປິດ', 'ปิด')} onClick={onClose}><X size={22}/></IconButton></div>{children}</dialog>;
}
// Back-office page title: icon tile, heading and one line of help, with actions on the right.
export function PageHeader({ icon: Icon, title, text, children }) {
  return <div className="page-heading bo-heading"><div className="bo-title"><span className="bo-icon"><Icon size={24}/></span><div><h1>{title}</h1><p>{text}</p></div></div>{children && <div className="heading-actions">{children}</div>}</div>;
}
export function StatTiles({ items }) {
  return <div className="stat-tiles">{items.map(({ label, value, note, tone = '', icon: Icon }) => <div className={`stat-tile ${tone}`} key={label}><span className="stat-label">{Icon && <Icon size={17}/>}{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div>)}</div>;
}
export function RoleChip({ role }) { const { t } = useL(); return <span className={`role-chip role-${role}`}>{roleText(role, t)}</span>; }
export function EmptyState({ icon: Icon, title, text, children }) { return <div className="empty-state"><span className="empty-icon"><Icon size={38} strokeWidth={1.4}/></span><h3>{title}</h3><p>{text}</p>{children}</div>; }
