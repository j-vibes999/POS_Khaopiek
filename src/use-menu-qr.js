import { useEffect, useState } from 'react';
import { menuUrlForTable } from './customer-model.mjs';

export function useMenuQr(table) {
  const menuUrl = menuUrlForTable(location.href, table, __LOCAL_MENU_HOST__);
  const localNetwork = Boolean(__LOCAL_MENU_HOST__) && new URL(menuUrl).hostname === __LOCAL_MENU_HOST__;
  const [image, setImage] = useState('');
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setImage('');
    setError(false);
    import('qrcode').then(({ default: QRCode }) => QRCode.toDataURL(menuUrl, {
      width: 460, margin: 4, errorCorrectionLevel: 'M',
      color: { dark: '#172b23', light: '#ffffff' },
    })).then(result => { if (active) setImage(result); }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [menuUrl]);

  return { menuUrl, image, error, localNetwork };
}
