const labels = {
  lo: {
    title: 'ໃບງານຄົວ', table: 'ໂຕະ', order: 'ອໍເດີ', confirmed: 'ຢືນຢັນ',
    regular: 'ທຳມະດາ', large: 'ພິເສດ', note: 'ໝາຍເຫດ', print: 'ພິມໃບງານ', copy: 'ສຳເນົາ · ພິມຊ້ຳ',
  },
  th: {
    title: 'ใบงานครัว', table: 'โต๊ะ', order: 'ออเดอร์', confirmed: 'ยืนยัน',
    regular: 'ธรรมดา', large: 'พิเศษ', note: 'หมายเหตุ', print: 'พิมพ์ใบงาน', copy: 'สำเนา · พิมพ์ซ้ำ',
  },
};

const formatTime = new Intl.DateTimeFormat('en-GB', {
  dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Vientiane',
});
const entities = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const text = value => String(value ?? '').replace(/[&<>"']/g, character => entities[character]);

function ticketMarkup(order, { shopName, language, copy }, fontStylesheet) {
  const lang = language === 'th' ? 'th' : 'lo';
  const label = labels[lang];
  const confirmedAt = order.paidAt ?? order.createdAt;
  const lines = order.items.map(item => {
    const name = item[lang] || item.lo || item.th || item.id;
    const note = lang === 'th' ? item.noteTh || item.note : item.note;
    const size = item.size === 'large' ? label.large : label.regular;
    return `<li>
      <b class="quantity">${text(item.quantity)} ×</b>
      <div><b>${text(name)}</b>
      ${item.category === 'drinks' ? '' : `<p>${size}</p>`}
      ${note ? `<p class="note">${label.note}: ${text(note)}</p>` : ''}</div>
    </li>`;
  }).join('');

  return `<!doctype html>
<html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${label.title} #${text(order.orderNumber ?? order.id)}</title>
<link rel="stylesheet" href="${text(fontStylesheet)}">
<style>
  @page { margin: 2mm; }
  * { box-sizing: border-box; }
  body { margin: 0; color: #000; background: #fff; font: 10pt/1.5 'Noto Sans Lao', 'Noto Sans Thai', sans-serif; }
  main { width: 100%; max-width: 48mm; margin: 0 auto; overflow-wrap: anywhere; }
  header { text-align: center; border-bottom: 1px solid; padding-bottom: 2mm; }
  h1 { font-size: 16pt; margin: 0; }
  h2 { font-size: 17pt; margin: 1mm 0; }
  p { margin: 0; }
  .copy { display: block; border: 1px solid; margin: 1mm 0; padding: 1mm; }
  ul { list-style: none; padding: 0; margin: 0; }
  li { display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 2mm; padding: 2mm 0; border-bottom: 1px dashed; break-inside: avoid; }
  .quantity { white-space: nowrap; }
  .note { white-space: pre-wrap; font-weight: 700; }
  button { display: block; min-height: 44px; width: 100%; margin: 3mm 0 0; font: inherit; cursor: pointer; background: #fff; color: #000; border: 1px solid; }
  @media screen { body { padding: 16px; } }
  @media print { button { display: none; } }
</style></head>
<body><main>
  <header>
    <h1>${label.title}</h1>
    ${copy ? `<b class="copy">${label.copy}</b>` : ''}
    ${shopName ? `<p>${text(shopName)}</p>` : ''}
    <h2>${label.table} ${text(String(order.table).padStart(2, '0'))}</h2>
    <p>${label.order} <b>#${text(order.orderNumber ?? order.id)}</b></p>
    ${Number.isFinite(confirmedAt) ? `<p>${label.confirmed} ${formatTime.format(confirmedAt)}</p>` : ''}
  </header>
  <ul>${lines}</ul>
  <button type="button">${label.print}</button>
</main></body></html>`;
}

export function openKitchenPreview() {
  const preview = window.open('', '_blank', 'popup,width=420,height=650');
  if (preview) preview.opener = null;
  return preview;
}

export function printKitchenTicket(order, { shopName, language = 'lo', copy = false, preview = openKitchenPreview } = {}) {
  if (!order?.paid || order.status === 'pending' || !order.items?.length) {
    throw Object.assign(new Error('Only confirmed orders can print a kitchen ticket'), { code: 'order-unconfirmed' });
  }

  const fonts = new URL('/fonts/fonts.css', window.location.href).href;
  const markup = ticketMarkup(order, { shopName, language, copy }, fonts);
  const ticketWindow = typeof preview === 'function' ? preview() : preview;
  if (!ticketWindow || ticketWindow.closed) throw Object.assign(new Error('Could not open the print window'), { code: 'print-blocked' });

  try {
    const document = ticketWindow.document;
    document.open();
    document.write(markup);
    document.close();

    return new Promise((resolve, reject) => {
      let requested = false;
      let failed = false;
      const unavailable = () => Object.assign(new Error('The kitchen print request did not open'), { code: 'print-blocked' });
      const timer = setTimeout(() => fail(unavailable()), 15000);
      const closed = () => { if (!requested) fail(unavailable()); };
      function cleanup() {
        clearTimeout(timer);
        ticketWindow.removeEventListener?.('pagehide', closed);
      }
      function fail(error) {
        if (failed) return;
        failed = true;
        cleanup();
        try { ticketWindow.close(); } catch { /* the failed preview may already be gone */ }
        reject(error);
      }
      function requestPrint() {
        if (failed) return;
        if (ticketWindow.closed) { fail(unavailable()); return; }
        requested = true;
        try {
          ticketWindow.focus();
          ticketWindow.print();
          cleanup();
          resolve();
        } catch (error) { requested = false; fail(error); }
      }
      document.querySelector('button').addEventListener('click', requestPrint);
      ticketWindow.addEventListener?.('pagehide', closed, { once: true });

      function printAfterLoad() {
        const printOnce = () => { if (!requested) requestPrint(); };
        if (!document.fonts) { printOnce(); return; }
        // Let layout discover the local Lao and Thai font faces before printing.
        void document.body.offsetHeight;
        document.fonts.ready.then(printOnce, fail);
      }

      if (document.readyState === 'complete') printAfterLoad();
      else ticketWindow.addEventListener('load', printAfterLoad, { once: true });
    });
  } catch (error) {
    ticketWindow.close();
    throw error;
  }
}
