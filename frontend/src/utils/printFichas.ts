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
  if (len <= 10) return '11px';
  if (len <= 16) return '9px';
  if (len <= 22) return '8px';
  return '7px';
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
 * Ficha 80mm × 25mm — ocupa 100% da área
 * - Com logo: logo em cima (preenche) + tarja preta com nome do produto
 * - Sem logo: evento / nome produto / data-hora
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
    <div class="logo-area">
      <img class="logo" src="${logoDataUrl}" alt="${escapeHtml(nome)}" />
    </div>
    <div class="bar">
      <span class="nome" style="font-size:${size}">${escapeHtml(nome)}</span>
    </div>
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
    padding: 0 !important;
    overflow: hidden;
    position: relative;
  }

  /* Com logo: logo preenche tudo acima da tarja */
  .with-logo {
    display: flex;
    flex-direction: column;
  }

  .logo-area {
    flex: 1 1 auto;
    width: 80mm;
    height: 16mm;
    min-height: 16mm;
    max-height: 16mm;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    overflow: hidden;
  }

  .logo {
    width: 80mm;
    height: 16mm;
    object-fit: contain;
    object-position: center;
    display: block;
  }

  .bar {
    flex: 0 0 9mm;
    width: 80mm;
    height: 9mm;
    background: #000 !important;
    color: #fff !important;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 2mm;
  }

  .bar .nome {
    font-family: Arial, Helvetica, sans-serif;
    font-weight: 900;
    letter-spacing: 0.6px;
    text-align: center;
    text-transform: uppercase;
    line-height: 1.05;
    word-break: break-word;
    color: #fff !important;
  }

  /* Sem logo: evento / produto / data — preenche 80×25 */
  .no-logo {
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 1.5mm 2.5mm;
  }

  .no-logo .event {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 6.5px;
    font-weight: 800;
    letter-spacing: 0.8px;
    text-transform: uppercase;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .no-logo .nome-block {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
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
    padding: 2mm 2.5mm;
  }

  .no-logo .when {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 6.5px;
    font-weight: 700;
    text-align: center;
  }

  @media print {
    html, body, .page, .ticket {
      width: 80mm !important;
      height: 25mm !important;
      margin: 0 !important;
      padding: 0 !important;
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
