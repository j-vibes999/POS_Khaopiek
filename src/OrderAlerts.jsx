import React, { useEffect, useId, useRef, useState } from 'react';
import { Bell, BellRing, ChevronRight, ClipboardList, Volume2, VolumeX, X } from 'lucide-react';
import { clockTime, pad, useL } from './staff-ui';
import './order-alerts.css';

export function OrderAlerts({ orders, unreadCount, soundEnabled, onSoundToggle, onRead, onViewOrders, onOpenOrder, notice, onDismissNotice }) {
  const { t } = useL();
  const [open, setOpen] = useState(false);
  const container = useRef(null);
  const trigger = useRef(null);
  const panelId = useId();
  const headingId = useId();
  const title = t('ແຈ້ງເຕືອນອໍເດີໃໝ່', 'แจ้งเตือนออเดอร์ใหม่');

  function close() {
    setOpen(false);
    trigger.current?.focus({ preventScroll: true });
  }

  function openOrder(id) {
    close();
    if (notice) onDismissNotice?.();
    onOpenOrder(id);
  }

  useEffect(() => {
    if (!open) return;
    function dismiss(event) {
      if (!container.current?.contains(event.target)) setOpen(false);
    }
    function handleEscape(event) {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      close();
    }
    document.addEventListener('pointerdown', dismiss);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', dismiss);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (open && unreadCount > 0) onRead();
  }, [open, unreadCount, onRead]);

  const recent = open ? [...orders].sort((a, b) => b.createdAt - a.createdAt).slice(0, 8) : [];
  const bellLabel = unreadCount > 0 ? `${title} · ${unreadCount} ${t('ຍັງບໍ່ອ່ານ', 'ยังไม่อ่าน')}` : title;
  const noticeTitle = notice?.count > 1 ? t(`${notice.count} ອໍເດີໃໝ່`, `${notice.count} ออเดอร์ใหม่`) : t('ອໍເດີໃໝ່', 'ออเดอร์ใหม่');
  const noticeDetails = notice ? `${t('ໂຕະ', 'โต๊ะ')} ${pad(notice.table)} · #${notice.orderNumber ?? notice.id}` : '';

  return <div className="order-alerts" ref={container}>
    <button type="button" className={`icon-button order-alerts-trigger${unreadCount > 0 ? ' has-unread' : ''}`} ref={trigger} aria-label={bellLabel} title={title} aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen(value => !value)}>
      <Bell size={28} aria-hidden="true"/>
      {unreadCount > 0 && <span className="order-alerts-count" aria-hidden="true">{unreadCount > 99 ? '99+' : unreadCount}</span>}
    </button>
    <span className="order-alerts-announcement" role="status">{notice && !open ? `${noticeTitle} · ${noticeDetails}` : ''}</span>
    {notice && !open && <div className="order-alerts-notice">
      <button type="button" className="order-alerts-notice-open" onClick={() => openOrder(notice.id)}>
        <span className="order-alerts-notice-icon"><BellRing size={21} aria-hidden="true"/></span>
        <span className="order-alerts-order"><strong>{noticeTitle}</strong><span>{noticeDetails}</span></span>
        <ChevronRight size={18} aria-hidden="true"/>
      </button>
      {onDismissNotice && <button type="button" className="icon-button" aria-label={t('ປິດແຈ້ງເຕືອນ', 'ปิดการแจ้งเตือน')} onClick={() => { close(); onDismissNotice(); }}><X size={18} aria-hidden="true"/></button>}
    </div>}
    {open && <section className="order-alerts-panel" id={panelId} aria-labelledby={headingId}>
      <header className="order-alerts-heading">
        <div>
          <h2 id={headingId}>{title}</h2>
          {recent.length > 0 && <p>{t(`ລ່າສຸດ ${recent.length} ອໍເດີ`, `ล่าสุด ${recent.length} ออเดอร์`)}</p>}
        </div>
        <button type="button" className="icon-button" aria-label={t('ປິດແຈ້ງເຕືອນ', 'ปิดการแจ้งเตือน')} onClick={close}><X size={19} aria-hidden="true"/></button>
      </header>
      <button type="button" className="order-alerts-sound" aria-pressed={soundEnabled} onClick={() => onSoundToggle(!soundEnabled)}>
        {soundEnabled ? <Volume2 size={20} aria-hidden="true"/> : <VolumeX size={20} aria-hidden="true"/>}
        <span>{t('ສຽງແຈ້ງເຕືອນ', 'เสียงแจ้งเตือน')}</span>
        <strong aria-hidden="true">{soundEnabled ? t('ເປີດ', 'เปิด') : t('ປິດ', 'ปิด')}</strong>
      </button>
      {recent.length ? <ul className="order-alerts-list">
        {recent.map(order => {
          const created = new Date(order.createdAt);
          return <li key={order.id}>
            <button type="button" className="order-alerts-row" onClick={() => openOrder(order.id)}>
              <span className="order-alerts-order">
                <strong>{t('ອໍເດີ', 'ออเดอร์')} #{order.orderNumber ?? order.id}</strong>
                <span>{t('ໂຕະ', 'โต๊ะ')} {pad(order.table)}</span>
              </span>
              {Number.isFinite(created.getTime()) && <time dateTime={created.toISOString()}>{clockTime(order.createdAt)}</time>}
              <ChevronRight size={18} aria-hidden="true"/>
            </button>
          </li>;
        })}
      </ul> : <p className="order-alerts-empty">{t('ຍັງບໍ່ມີອໍເດີໃໝ່', 'ยังไม่มีออเดอร์ใหม่')}</p>}
      <button type="button" className="button primary full order-alerts-view" onClick={() => { close(); onViewOrders(); }}>
        <ClipboardList size={18} aria-hidden="true"/>{t('ເບິ່ງອໍເດີທີ່ລໍຖ້າ', 'ดูออเดอร์ที่รอ')}
      </button>
    </section>}
  </div>;
}
