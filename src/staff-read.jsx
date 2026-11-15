import React, { useEffect, useState } from 'react';
import { ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';
import { useL } from './staff-ui.jsx';

// Each screen owns its read. Leaving the screen or changing its query ignores late responses.
export function useStaffRead(read, view, params, revision) {
  const key = JSON.stringify(params);
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!read) return;
    let active = true;
    read(view, JSON.parse(key)).then(data => {
      if (active) setResult({ key, view, read, revision, attempt, data });
    }).catch(() => {
      if (active) setResult(previous => ({
        key, view, read, revision, attempt, error: true,
        data: previous?.key === key && previous.view === view && previous.read === read ? previous.data : undefined,
      }));
    });
    return () => { active = false; };
  }, [read, view, key, revision, attempt]);

  const match = read && result?.key === key && result.view === view && result.read === read ? result : null;
  const settled = match && match.revision === revision && match.attempt === attempt;
  return { data: match?.data, loading: Boolean(read && !settled), error: Boolean(settled && match.error), retry: () => setAttempt(value => value + 1) };
}

export function StaffReadStatus({ request }) {
  const { t } = useL();
  if (request.error) return <div className="staff-read-status">
    <p role="alert">{t('ໂຫຼດຂໍ້ມູນບໍ່ສຳເລັດ', 'โหลดข้อมูลไม่สำเร็จ')}</p>
    <button className="button secondary" type="button" onClick={request.retry}><RefreshCw size={17}/>{t('ລອງໃໝ່', 'ลองใหม่')}</button>
  </div>;
  if (request.loading && !request.data) return <p className="staff-read-status" role="status">{t('ກຳລັງໂຫຼດ…', 'กำลังโหลด…')}</p>;
  return null;
}

export function StaffReadRefresh({ request }) {
  const { t } = useL();
  return <button className="button secondary" type="button" onClick={request.retry} disabled={request.loading}><RefreshCw size={17}/>{t('ໂຫຼດໃໝ່', 'โหลดใหม่')}</button>;
}

export function StaffReadPages({ request, offset, limit, onPage }) {
  const { t } = useL();
  const page = request.data;
  if (!page?.hasMore && !offset) return null;
  return <nav className="staff-read-pages" aria-label={t('ໜ້າຜົນຄົ້ນຫາ', 'หน้าผลการค้นหา')}>
    <button className="button secondary" type="button" disabled={!offset} onClick={() => onPage(Math.max(0, offset - limit))}><ChevronLeft size={17}/>{t('ກ່ອນໜ້າ', 'ก่อนหน้า')}</button>
    <span aria-live="polite">{t('ໜ້າ', 'หน้า')} {Math.floor(offset / limit) + 1}</span>
    <button className="button secondary staff-read-next" type="button" disabled={!page?.hasMore || request.loading} onClick={() => onPage(offset + limit)}>{t('ຖັດໄປ', 'ถัดไป')}<ChevronRight size={17}/></button>
  </nav>;
}
