import type { FichaTicket } from './fichas';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function nomeFontSize(nome: string): string {
  const len = nome.trim().length;
  if (len <= 10) return '12px';
  if (len <= 16) return '10px';
  if (len <= 22) return '8.5px';
  return '7.5px';
}

function formatDataHora(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

/**
 * Ficha 80mm × 25mm
 * - Com logo: EVENTO → LOGO → DATA/HORA (sem tarja de produto)
 * - Sem logo: EVENTO → NOME PRODUTO → DATA/HORA
 */
export function buildFichasHtml(
  tickets: FichaTicket[],
  tenantName?: string,
  logoDataUrl?: string | null,
  printedAt: Date = new Date()
): string {
  const festival = (tenantName || 'FESTIVAL').trim().toUpperCase();
  const when = formatDataHora(printedAt);
  const hasLogo = Boolean(logoDataUrl && logoDataUrl.startsWith('data:image/'));

  const pages = tickets
    .map((ticket, index) => {
      const isLast = index === tickets.length - 1;
      const nome = ticket.nome.trim().toUpperCase() || 'FICHA';
      const size = nomeFontSize(nome);

      if (hasLogo) {
        return `<section class="page${isLast ? ' last' : ''}">
  <div class="ticket with-logo">
    <div class="event">${escapeHtml(festival)}</div>
    <div class="logo-area">
      <img class="logo" src="${logoDataUrl}" alt="${escapeHtml(nome)}" />
    </div>
    <div class="when">${escapeHtml(when)}</div>
  </div>
</section>`;
      }

      return `<section class="page${isLast ? ' last' : ''}">
  <div class="ticket no-logo">
    <div class="event">${escapeHtml(festival)}</div>
    <div class="nome-block">
      <span class="nome" style="font-size:${size}">${escapeHtml(nome)}</span>
    </div>
    <div class="when">${escapeHtml(when)}</div>
  </div>
</section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Fichas</title>
<style>
  @page {
    size: 80mm 25mm;
    margin: 0;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    width: 80mm !important;
    height: 25mm !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff;
    color: #000;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .page {
    width: 80mm !important;
    height: 25mm !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden;
    break-after: page;
    page-break-after: always;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .page.last {
    break-after: auto;
    page-break-after: auto;
  }

  .ticket {
    width: 80mm !important;
    height: 25mm !important;
    margin: 0 !important;
    padding: 0.8mm 2mm;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
  }

  .event {
    flex: 0 0 auto;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 6.5px;
    font-weight: 800;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
  }

  .when {
    flex: 0 0 auto;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 6.5px;
    font-weight: 700;
    letter-spacing: 0.3px;
    text-align: center;
    line-height: 1.2;
  }

  /* Com logo: EVENTO / LOGO / DATA */
  .with-logo .logo-area {
    flex: 1 1 auto;
    min-height: 0;
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0.4mm 0;
    overflow: hidden;
  }

  .with-logo .logo {
    width: 100%;
    height: 100%;
    max-height: 16mm;
    object-fit: contain;
    object-position: center;
    display: block;
  }

  /* Sem logo: EVENTO / PRODUTO / DATA */
  .no-logo .nome-block {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    margin: 0.4mm 0;
  }

  .no-logo .nome {
    font-family: Impact, Haettenschweiler, 'Arial Black', Arial, sans-serif;
    font-weight: 900;
    letter-spacing: 0.5px;
    text-align: center;
    text-transform: uppercase;
    line-height: 1.05;
    word-break: break-word;
    width: 100%;
    background: #000;
    color: #fff;
    padding: 1.8mm 2mm;
  }

  @media print {
    html, body, .page, .ticket {
      width: 80mm !important;
      height: 25mm !important;
      margin: 0 !important;
    }
  }
</style>
</head>
<body>
${pages}
</body>
</html>`;
}

export function printFichasViaIframe(
  tickets: FichaTicket[],
  tenantName?: string,
  logoDataUrl?: string | null,
  printedAt: Date = new Date()
): void {
  if (tickets.length === 0) return;

  const html = buildFichasHtml(tickets, tenantName, logoDataUrl, printedAt);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;left:0;top:0;width:80mm;height:25mm;border:0;opacity:0;pointer-events:none;z-index:-1;';
  document.body.appendChild(iframe);

  const win = iframe.contentWindow;
  const doc = iframe.contentDocument || win?.document;
  if (!win || !doc) {
    iframe.remove();
    return;
  }

  doc.open();
  doc.write(html);
  doc.close();

  const cleanup = () => {
    window.setTimeout(() => iframe.remove(), 1000);
  };

  let printed = false;
  const trigger = () => {
    if (printed) return;
    printed = true;
    try {
      win.focus();
      win.print();
    } finally {
      cleanup();
    }
  };

  const imgs = Array.from(doc.images);
  if (imgs.length === 0) {
    window.setTimeout(trigger, 150);
    return;
  }

  let pending = imgs.length;
  const done = () => {
    pending -= 1;
    if (pending <= 0) window.setTimeout(trigger, 100);
  };
  for (const img of imgs) {
    if (img.complete && img.naturalWidth > 0) done();
    else {
      img.onload = done;
      img.onerror = done;
    }
  }
  window.setTimeout(trigger, 2500);
}
