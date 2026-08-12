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
  if (len <= 8) return '13px';
  if (len <= 14) return '11px';
  if (len <= 20) return '9.5px';
  return '8px';
}

/**
 * Modelo da ficha térmica:
 * - Página = 80mm (largura / horizontal) × 25mm (altura / vertical)
 * - Com logo: faixa superior com a arte + faixa inferior preta com o nome
 * - Sem logo: nome centralizado em destaque
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
      const isLast = index === tickets.length - 1;
      const nome = ticket.nome.trim().toUpperCase() || 'FICHA';
      const size = nomeFontSize(nome);

      if (hasLogo) {
        return `<section class="page${isLast ? ' last' : ''}">
  <div class="ticket with-logo">
    <div class="logo-band">
      <img class="logo" src="${logoDataUrl}" alt="" />
    </div>
    <div class="name-band">
      <div class="nome" style="font-size:${size}">${escapeHtml(nome)}</div>
    </div>
  </div>
</section>`;
      }

      return `<section class="page${isLast ? ' last' : ''}">
  <div class="ticket no-logo">
    <div class="festival">${escapeHtml(festival)}</div>
    <div class="divider"></div>
    <div class="nome" style="font-size:${size}">${escapeHtml(nome)}</div>
    <div class="divider"></div>
    <div class="tag">FICHA</div>
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
    width: 80mm;
    margin: 0;
    padding: 0;
    background: #fff;
    color: #000;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  .page {
    width: 80mm;
    height: 25mm;
    margin: 0;
    padding: 0;
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
    width: 80mm;
    height: 25mm;
    overflow: hidden;
    border: 0.35mm solid #000;
  }

  /* —— Com logo: 2 faixas horizontais —— */
  .with-logo {
    display: flex;
    flex-direction: column;
  }

  .logo-band {
    height: 16mm;
    width: 80mm;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #fff;
    overflow: hidden;
  }

  .logo {
    width: 78mm;
    height: 15mm;
    object-fit: contain;
    object-position: center;
    display: block;
  }

  .name-band {
    height: 9mm;
    width: 80mm;
    background: #000;
    color: #fff;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 0 2mm;
  }

  .with-logo .nome {
    font-family: Impact, Haettenschweiler, 'Arial Black', Arial, sans-serif;
    font-weight: 900;
    letter-spacing: 0.6px;
    text-align: center;
    text-transform: uppercase;
    line-height: 1;
    word-break: break-word;
  }

  /* —— Sem logo —— */
  .no-logo {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1.2mm;
    padding: 1.5mm 2.5mm;
  }

  .festival {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 6px;
    font-weight: 800;
    letter-spacing: 1.5px;
  }

  .divider {
    width: 100%;
    border-top: 0.3mm solid #000;
  }

  .no-logo .nome {
    font-family: Impact, Haettenschweiler, 'Arial Black', Arial, sans-serif;
    font-weight: 900;
    letter-spacing: 0.6px;
    text-align: center;
    text-transform: uppercase;
    line-height: 1.05;
    word-break: break-word;
  }

  .tag {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 6px;
    font-weight: 900;
    letter-spacing: 2px;
  }

  @media print {
    html, body {
      width: 80mm !important;
      height: auto !important;
    }
    .page {
      width: 80mm !important;
      height: 25mm !important;
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
  logoDataUrl?: string | null
): void {
  if (tickets.length === 0) return;

  const html = buildFichasHtml(tickets, tenantName, logoDataUrl);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  // Tamanho real em mm evita o preview “carimbo” minúsculo no A4.
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
