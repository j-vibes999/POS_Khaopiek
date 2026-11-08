import { createContext, useContext, useEffect, useState } from 'react';
import { menuUrlForTable } from './customer-model.mjs';

export const MenuQrContext = createContext(null);
function tableUrl(table, cloud) {
  const number = typeof table === 'object' ? table.number : table;
  const menuUrl = menuUrlForTable(import.meta.env?.VITE_PUBLIC_APP_URL || location.href, number, __LOCAL_MENU_HOST__);
  if (!cloud) return menuUrl;
  const item = cloud.tables.find(item => item.number === Number(number));
  if (!item?.tableKey) return '';
  const url = new URL(menuUrl);
  url.searchParams.set('key', item.tableKey);
  return url.toString();
}
export function useMenuQr(table) {
  const cloud = useContext(MenuQrContext);
  const menuUrl = tableUrl(table, cloud);
  const localNetwork = Boolean(menuUrl && __LOCAL_MENU_HOST__) && new URL(menuUrl).hostname === __LOCAL_MENU_HOST__;
  const [image, setImage] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setImage('');
    setError(false);
    if (!menuUrl) { setError(true); return; }
    import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(menuUrl, {
      width: 460, margin: 4, errorCorrectionLevel: 'M',
      color: { dark: '#172b23', light: '#ffffff' },
    })).then(result => { if (active) setImage(result); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [menuUrl]);

  return { menuUrl, image, error, localNetwork };
}

// One QR image per table, for printing the whole set at once.
export function useMenuQrs(tables) {
  const cloud = useContext(MenuQrContext);
  const key = JSON.stringify(tables.map(table => [typeof table === 'object' ? table.number : table, tableUrl(table, cloud)]));
  const [images, setImages] = useState({});
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setImages({});
    setError(false);
    import('qrcode').then(({ default: QRCode }) => Promise.all(JSON.parse(key).map(([table,url]) => QRCode.toDataURL(url, {
      width: 320, margin: 3, errorCorrectionLevel: 'M',
      color: { dark: '#172b23', light: '#ffffff' },
    }).then(image => [table, image])))).then(entries => { if (active) setImages(Object.fromEntries(entries)); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [key]);

  return { images, error };
}
