import type { FichaTicket } from './fichas';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Ajusta o tamanho do nome para caber em 80mm. */
function nomeFontSize(nome: string): string {
  const len = nome.trim().length;
  if (len <= 10) return '15px';
  if (len <= 16) return '13px';
  if (len <= 22) return '11px';
  return '9.5px';
}

/** Monta HTML de fichas 80×25mm (1 página por unidade). */
export function buildFichasHtml(
  tickets: FichaTicket[],
  tenantName?: string
): string {
  const festival = (tenantName || 'FESTIVAL').trim().toUpperCase();

  const pages = tickets
    .map((ticket, index) => {
      const breakAfter =
        index < tickets.length - 1 ? 'page-break-after:always;' : '';
      const nome = ticket.nome.trim().toUpperCase() || 'FICHA';
      const size = nomeFontSize(nome);
      return `<div class="page" style="${breakAfter}">
  <div class="ticket">
    <div class="edge edge-left"></div>
    <div class="body">
      <div class="top">
        <span class="stars">★★★</span>
        <span class="festival">${escapeHtml(festival)}</span>
        <span class="stars">★★★</span>
      </div>
      <div class="rule"></div>
      <div class="nome-wrap">
        <div class="nome" style="font-size:${size}">${escapeHtml(nome)}</div>
      </div>
      <div class="rule"></div>
      <div class="bottom">
        <span class="badge">✦ FICHA ✦</span>
        <span class="hint">VALIDA NO BALCAO</span>
      </div>
    </div>
    <div class="edge edge-right"></div>
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
  @page { size: 80mm 25mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: 80mm;
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
  }
  .ticket {
    width: 80mm;
    height: 25mm;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    border: 0.45mm solid #000;
  }
  .edge {
    width: 4.5mm;
    flex-shrink: 0;
    background:
      radial-gradient(circle at 0 2.5mm, #fff 1.35mm, #000 1.4mm, #000 1.55mm, transparent 1.6mm) 0 0 / 100% 5mm repeat-y,
      #000;
  }
  .edge-left {
    background:
      radial-gradient(circle at 100% 2.5mm, #fff 1.35mm, #000 1.4mm, #000 1.55mm, transparent 1.6mm) 0 0 / 100% 5mm repeat-y,
      #000;
  }
  .edge-right {
    background:
      radial-gradient(circle at 0 2.5mm, #fff 1.35mm, #000 1.4mm, #000 1.55mm, transparent 1.6mm) 0 0 / 100% 5mm repeat-y,
      #000;
  }
  .body {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    padding: 1.2mm 2mm;
    background: #fff;
  }
  .top {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 1.5mm;
  }
  .stars {
    font-size: 6px;
    letter-spacing: 0.3px;
    line-height: 1;
  }
  .festival {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 7px;
    font-weight: 700;
    letter-spacing: 1.2px;
    text-transform: uppercase;
    max-width: 48mm;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .rule {
    height: 0;
    border-top: 0.35mm dashed #000;
    margin: 0.4mm 0;
  }
  .nome-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #000;
    color: #fff;
    border-radius: 0.6mm;
    padding: 0.8mm 1.5mm;
    min-height: 9mm;
  }
  .nome {
    font-family: Impact, Haettenschweiler, 'Arial Black', Arial, sans-serif;
    font-weight: 900;
    line-height: 1.05;
    letter-spacing: 0.8px;
    text-align: center;
    text-transform: uppercase;
    word-break: break-word;
    max-width: 100%;
  }
  .bottom {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 2mm;
  }
  .badge {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 7px;
    font-weight: 900;
    letter-spacing: 1px;
  }
  .hint {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 5.5px;
    font-weight: 700;
    letter-spacing: 0.6px;
    opacity: 0.9;
  }
</style>
</head>
<body>
${pages}
</body>
</html>`;
}

/**
 * Imprime fichas em iframe isolado (mais confiável em totem/tablet
 * do que window.print() na página principal).
 */
export function printFichasViaIframe(
  tickets: FichaTicket[],
  tenantName?: string
): void {
  if (tickets.length === 0) return;

  const html = buildFichasHtml(tickets, tenantName);
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
    window.setTimeout(() => iframe.remove(), 500);
  };

  const trigger = () => {
    try {
      win.focus();
      win.print();
    } finally {
      cleanup();
    }
  };

  if (doc.readyState === 'complete') {
    window.setTimeout(trigger, 120);
  } else {
    iframe.onload = () => window.setTimeout(trigger, 120);
    window.setTimeout(trigger, 450);
  }
}
