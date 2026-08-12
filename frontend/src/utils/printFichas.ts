import type { FichaTicket } from './fichas';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Monta HTML de fichas 80×25mm (1 página por unidade). */
export function buildFichasHtml(
  tickets: FichaTicket[],
  tenantName?: string
): string {
  const pages = tickets
    .map((ticket, index) => {
      const breakAfter =
        index < tickets.length - 1 ? 'page-break-after:always;' : '';
      const festival = tenantName
        ? `<div class="festival">${escapeHtml(tenantName)}</div>`
        : '';
      return `<div class="page" style="${breakAfter}">
  <div class="inner">
    ${festival}
    <div class="nome">${escapeHtml(ticket.nome.toUpperCase())}</div>
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
  html, body { width: 80mm; background: #fff; color: #000; }
  .page {
    width: 80mm;
    height: 25mm;
    overflow: hidden;
    page-break-inside: avoid;
  }
  .inner {
    width: 80mm;
    height: 25mm;
    padding: 1mm 2mm;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
  }
  .festival {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 7px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 1mm;
    max-width: 76mm;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .nome {
    font-family: Arial Black, Arial, Helvetica, sans-serif;
    font-size: 16px;
    font-weight: 900;
    line-height: 1.05;
    letter-spacing: 0.5px;
    max-width: 76mm;
    word-break: break-word;
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

  // Aguarda imagens/fonts; em HTML simples um frame basta.
  if (doc.readyState === 'complete') {
    window.setTimeout(trigger, 100);
  } else {
    iframe.onload = () => window.setTimeout(trigger, 100);
    window.setTimeout(trigger, 400);
  }
}
