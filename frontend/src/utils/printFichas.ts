import type { FichaTicket } from './fichas';

/** Largura = 100% do rolo 80mm. Só a altura é controlada pelo sistema. */
export const FICHA_LARGURA_MM = 80;
export const FICHA_ALTURA_MM = 25;

/** Área da logo em mm (entre evento e data) — altura fixa evita sumir no print. */
const LOGO_AREA_H_MM = 16;
const LOGO_RASTER_W = 576; // ~80mm @ 180dpi (típica térmica)
const LOGO_RASTER_H = 120; // ~16mm

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
  if (len <= 16) return '11px';
  if (len <= 22) return '9px';
  return '8px';
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
 * Rasteriza a logo em PNG opaco (fundo branco).
 * Drivers térmicos costumam falhar com PNG transparente / flex height 100%.
 */
async function rasterizeLogoForThermal(
  dataUrl: string
): Promise<string | null> {
  try {
    const img = new Image();
    img.decoding = 'sync';
    img.src = dataUrl;
    if (typeof img.decode === 'function') {
      await img.decode();
    } else {
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('logo_load_failed'));
      });
    }

    const canvas = document.createElement('canvas');
    canvas.width = LOGO_RASTER_W;
    canvas.height = LOGO_RASTER_H;
    const ctx = canvas.getContext('2d');
    if (!ctx) return dataUrl;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, LOGO_RASTER_W, LOGO_RASTER_H);

    const scale = Math.min(
      LOGO_RASTER_W / img.naturalWidth,
      LOGO_RASTER_H / img.naturalHeight
    );
    const dw = Math.max(1, Math.floor(img.naturalWidth * scale));
    const dh = Math.max(1, Math.floor(img.naturalHeight * scale));
    const dx = Math.floor((LOGO_RASTER_W - dw) / 2);
    const dy = Math.floor((LOGO_RASTER_H - dh) / 2);
    ctx.drawImage(img, dx, dy, dw, dh);

    return canvas.toDataURL('image/png');
  } catch {
    return dataUrl.startsWith('data:image/') ? dataUrl : null;
  }
}

async function prepareTicketsForPrint(
  tickets: FichaTicket[]
): Promise<FichaTicket[]> {
  const out: FichaTicket[] = [];
  for (const ticket of tickets) {
    const raw = ticket.logo;
    if (raw && raw.startsWith('data:image/')) {
      const raster = await rasterizeLogoForThermal(raw);
      out.push({ ...ticket, logo: raster });
    } else {
      out.push({ ...ticket, logo: null });
    }
  }
  return out;
}

/**
 * Ficha térmica (logo por produto):
 * - Com logo: EVENTO → LOGO → DATA/HORA
 * - Sem logo: EVENTO → NOME PRODUTO → DATA/HORA
 */
export function buildFichasHtml(
  tickets: FichaTicket[],
  tenantName?: string,
  printedAt: Date = new Date(),
  alturaMm: number = FICHA_ALTURA_MM
): string {
  const festival = (tenantName || 'FESTIVAL').trim().toUpperCase();
  const when = formatDataHora(printedAt);
  const h = Math.max(15, Math.min(80, alturaMm));
  const w = FICHA_LARGURA_MM;
  const logoH = Math.min(LOGO_AREA_H_MM, h - 6);

  const pages = tickets
    .map((ticket, index) => {
      const isLast = index === tickets.length - 1;
      const nome = ticket.nome.trim().toUpperCase() || 'FICHA';
      const size = nomeFontSize(nome);
      const logo = ticket.logo || null;
      const hasLogo = Boolean(logo && logo.startsWith('data:image/'));

      if (hasLogo) {
        return `<section class="page${isLast ? ' last' : ''}">
  <table class="ticket with-logo" cellpadding="0" cellspacing="0">
    <tr><td class="event">${escapeHtml(festival)}</td></tr>
    <tr><td class="logo-cell">
      <img class="logo" width="${LOGO_RASTER_W}" height="${LOGO_RASTER_H}" src="${logo}" alt="${escapeHtml(nome)}" />
    </td></tr>
    <tr><td class="when">${escapeHtml(when)}</td></tr>
  </table>
</section>`;
      }

      return `<section class="page${isLast ? ' last' : ''}">
  <table class="ticket no-logo" cellpadding="0" cellspacing="0">
    <tr><td class="event">${escapeHtml(festival)}</td></tr>
    <tr><td class="nome-cell">
      <div class="nome" style="font-size:${size}">${escapeHtml(nome)}</div>
    </td></tr>
    <tr><td class="when">${escapeHtml(when)}</td></tr>
  </table>
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
    size: ${w}mm ${h}mm;
    margin: 0;
  }

  * { box-sizing: border-box; margin: 0; padding: 0; }

  html, body {
    width: ${w}mm !important;
    height: auto !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff !important;
    color: #000 !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }

  .page {
    width: ${w}mm !important;
    height: ${h}mm !important;
    margin: 0 !important;
    padding: 0 !important;
    overflow: hidden;
    display: block;
    break-after: page;
    page-break-after: always;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .page.last {
    break-after: auto;
    page-break-after: auto;
  }

  table.ticket {
    width: ${w}mm !important;
    height: ${h}mm !important;
    border-collapse: collapse;
    table-layout: fixed;
  }

  table.ticket td {
    padding: 0.6mm 1.5mm;
    vertical-align: middle;
    text-align: center;
  }

  .event, .when {
    font-family: Arial, Helvetica, sans-serif;
    font-size: 8px;
    font-weight: 900;
    letter-spacing: 0.4px;
    text-transform: uppercase;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.2;
    height: 3.5mm;
  }

  .logo-cell {
    height: ${logoH}mm !important;
    background: #fff !important;
  }

  img.logo {
    display: block !important;
    width: ${w - 3}mm !important;
    height: ${logoH - 1}mm !important;
    max-width: ${w - 3}mm !important;
    max-height: ${logoH - 1}mm !important;
    object-fit: contain !important;
    object-position: center !important;
    margin: 0 auto !important;
    background: #fff !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  .nome-cell {
    height: ${logoH}mm !important;
  }

  .nome {
    font-family: Impact, Haettenschweiler, 'Arial Black', Arial, sans-serif;
    font-weight: 900;
    letter-spacing: 0.5px;
    text-align: center;
    text-transform: uppercase;
    line-height: 1.05;
    word-break: break-word;
    width: 100%;
    background: #000 !important;
    color: #fff !important;
    padding: 2mm;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }

  @media print {
    html, body, .page, table.ticket {
      width: ${w}mm !important;
    }
    .page, table.ticket {
      height: ${h}mm !important;
    }
    img.logo {
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
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
  printedAt: Date = new Date(),
  alturaMm: number = FICHA_ALTURA_MM
): void {
  if (tickets.length === 0) return;

  const h = Math.max(15, Math.min(80, alturaMm));

  void (async () => {
    const prepared = await prepareTicketsForPrint(tickets);
    // Um único job: N páginas de 80×25 (papel da impressora). Corte = após cada página.
    const html = buildFichasHtml(prepared, tenantName, printedAt, h);

    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = [
      'position:fixed',
      'left:-10000px',
      'top:0',
      `width:${FICHA_LARGURA_MM}mm`,
      `height:${h}mm`,
      'border:0',
      'visibility:hidden',
      'pointer-events:none',
      'z-index:-1',
    ].join(';');
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

    let finished = false;
    const cleanup = () => {
      if (finished) return;
      finished = true;
      window.setTimeout(() => {
        try {
          iframe.remove();
        } catch {
          /* ignore */
        }
      }, 1500);
    };

    const trigger = async () => {
      try {
        const imgs = Array.from(doc.images);
        await Promise.all(
          imgs.map(async (img) => {
            try {
              if (!img.complete || img.naturalWidth === 0) {
                if (typeof img.decode === 'function') await img.decode();
                else {
                  await new Promise<void>((r) => {
                    img.onload = () => r();
                    img.onerror = () => r();
                  });
                }
              }
            } catch {
              /* ignore */
            }
          })
        );
      } catch {
        /* ignore */
      }

      try {
        iframe.style.visibility = 'visible';
        iframe.style.left = '0';
        iframe.style.top = '0';
        win.focus();
        win.addEventListener('afterprint', cleanup, { once: true });
        win.print();
      } catch {
        cleanup();
      }
      window.setTimeout(cleanup, 180_000);
    };

    window.setTimeout(() => {
      void trigger();
    }, 250);
  })();
}
