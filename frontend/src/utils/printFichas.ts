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
  if (len <= 10) return '14px';
  if (len <= 16) return '12px';
  if (len <= 22) return '10px';
  return '9px';
}

/**
 * Ficha térmica: página SEMPRE 80mm (horizontal) × 25mm (vertical).
 * Logo (se houver) preenche toda a área; nome do produto sobreposto.
 */
export function buildFichasHtml(
  tickets: FichaTicket[],
  tenantName?: string,
  logoDataUrl?: string | null
): string {
  const festival = (tenantName || 'FESTIVAL').trim().toUpperCase();
  const hasLogo = Boolean(logoDataUrl && logoDataUrl.startsWith('data:image/'));

  const pages = tickets
    .map((ticket, index) => {
      const breakAfter =
        index < tickets.length - 1 ? 'page-break-after:always;' : '';
      const nome = ticket.nome.trim().toUpperCase() || 'FICHA';
      const size = nomeFontSize(nome);
      const logoLayer = hasLogo
        ? `<img class="logo" src="${logoDataUrl}" alt="" />`
        : '';

      return `<div class="page" style="${breakAfter}">
  <div class="ticket${hasLogo ? ' has-logo' : ''}">
    ${logoLayer}
    <div class="overlay">
      <div class="top">
        <span class="festival">${escapeHtml(festival)}</span>
      </div>
      <div class="nome-wrap">
        <div class="nome" style="font-size:${size}">${escapeHtml(nome)}</div>
      </div>
      <div class="bottom">✦ FICHA · 80×25mm ✦</div>
    </div>
  </div>
</div>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Fichas</title>
<style>
  /* Largura 80mm × altura 25mm — orientação paisagem (horizontal) */
  @page {
    size: 80mm 25mm;
    margin: 0;
  }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 80mm;
    height: 25mm;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .page {
    width: 80mm;
    height: 25mm;
    overflow: hidden;
    page-break-inside: avoid;
    page-break-after: always;
  }
  .page:last-child {
    page-break-after: auto;
  }
  .ticket {
    position: relative;
    width: 80mm;
    height: 25mm;
    overflow: hidden;
    border: 0.4mm solid #000;
    background: #fff;
  }
  .logo {
    position: absolute;
    inset: 0;
    width: 80mm;
    height: 25mm;
    object-fit: contain;
    object-position: center;
    display: block;
    background: #fff;
  }
  .overlay {
    position: absolute;
    inset: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 1.2mm 2.5mm;
    z-index: 1;
  }
  .has-logo .overlay {
    background: linear-gradient(
      to bottom,
      rgba(255,255,255,0.82) 0%,
      rgba(255,255,255,0.15) 35%,
      rgba(255,255,255,0.15) 55%,
      rgba(255,255,255,0.88) 100%
    );
  }
  .top {
    text-align: center;
  }
  .festival {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 6.5px;
    font-weight: 800;
    letter-spacing: 1.4px;
    text-transform: uppercase;
  }
  .nome-wrap {
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
    color: #fff;
    border-radius: 0.5mm;
    padding: 1mm 2mm;
    min-height: 8.5mm;
  }
  .has-logo .nome-wrap {
    background: rgba(0,0,0,0.88);
  }
  .nome {
    font-family: Impact, Haettenschweiler, 'Arial Black', Arial, sans-serif;
    font-weight: 900;
    line-height: 1.05;
    letter-spacing: 0.7px;
    text-align: center;
    text-transform: uppercase;
    word-break: break-word;
  }
  .bottom {
    text-align: center;
    font-family: Arial, Helvetica, sans-serif;
    font-size: 5.5px;
    font-weight: 800;
    letter-spacing: 0.8px;
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
  logoDataUrl?: string | null
): void {
  if (tickets.length === 0) return;

  const html = buildFichasHtml(tickets, tenantName, logoDataUrl);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText =
    'position:fixed;right:0;bottom:0;width:0;height:0;border:0;opacity:0;pointer-events:none;';
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
    window.setTimeout(() => iframe.remove(), 800);
  };

  const trigger = () => {
    try {
      win.focus();
      win.print();
    } finally {
      cleanup();
    }
  };

  // Espera a logo carregar antes de imprimir.
  const imgs = Array.from(doc.images);
  if (imgs.length === 0) {
    window.setTimeout(trigger, 120);
    return;
  }

  let pending = imgs.length;
  const done = () => {
    pending -= 1;
    if (pending <= 0) window.setTimeout(trigger, 80);
  };
  for (const img of imgs) {
    if (img.complete) done();
    else {
      img.onload = done;
      img.onerror = done;
    }
  }
  window.setTimeout(trigger, 2000);
}
