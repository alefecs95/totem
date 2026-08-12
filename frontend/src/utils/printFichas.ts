import type { FichaTicket } from './fichas';
import { readProductFichaLogos } from './fichas';

/** Largura = 100% do rolo 80mm. Só a altura é controlada pelo sistema. */
export const FICHA_LARGURA_MM = 80;
export const FICHA_ALTURA_MM = 25;

/** Resolução térmica ~203 dpi: 80mm ≈ 640px, 25mm ≈ 200px. Usamos 576×200 (comum em POS 80mm). */
const PX_W = 576;
const PX_H = 200;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function formatDataHora(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'sync';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('img_load_failed'));
    img.src = src;
  });
}

/** Converte canvas para preto/branco — térmica monócroma falha com verde/cor. */
function toThermalMono(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const v = lum > 160 ? 255 : 0;
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
}

function drawContainedImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  boxW: number,
  boxH: number
): void {
  const scale = Math.min(boxW / img.naturalWidth, boxH / img.naturalHeight);
  const dw = Math.max(1, Math.floor(img.naturalWidth * scale));
  const dh = Math.max(1, Math.floor(img.naturalHeight * scale));
  const dx = x + Math.floor((boxW - dw) / 2);
  const dy = y + Math.floor((boxH - dh) / 2);
  ctx.drawImage(img, dx, dy, dw, dh);
}

function resolveLogo(ticket: FichaTicket): string | null {
  if (ticket.logo && ticket.logo.startsWith('data:image/')) return ticket.logo;
  const logos = readProductFichaLogos();
  if (ticket.productId && logos[ticket.productId]) return logos[ticket.productId];
  // key = `${id}-${index}`
  const idFromKey = ticket.key.replace(/-\d+$/, '');
  if (idFromKey && logos[idFromKey]) return logos[idFromKey];
  return null;
}

/**
 * Renderiza a ficha INTEIRA como bitmap.
 * Drivers POS80 costumam imprimir imagem de página inteira e falhar com HTML+logo colorida.
 */
async function renderFichaBitmap(
  ticket: FichaTicket,
  festival: string,
  when: string
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = PX_W;
  canvas.height = PX_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no_canvas');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PX_W, PX_H);
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const padX = 12;
  const headerH = 28;
  const footerH = 28;
  const midY = headerH;
  const midH = PX_H - headerH - footerH;

  // Evento
  ctx.font = 'bold 18px Arial, Helvetica, sans-serif';
  ctx.fillText(festival.slice(0, 42), PX_W / 2, headerH / 2, PX_W - padX * 2);

  const logoSrc = resolveLogo(ticket);
  let drewLogo = false;
  if (logoSrc) {
    try {
      const img = await loadImage(logoSrc);
      drawContainedImage(ctx, img, padX, midY + 2, PX_W - padX * 2, midH - 4);
      drewLogo = true;
    } catch {
      drewLogo = false;
    }
  }

  if (!drewLogo) {
    const nome = (ticket.nome || 'FICHA').toUpperCase();
    // Tarja preta com nome
    ctx.fillStyle = '#000000';
    const barPad = 8;
    ctx.fillRect(padX, midY + barPad, PX_W - padX * 2, midH - barPad * 2);
    ctx.fillStyle = '#ffffff';
    const len = nome.length;
    const fontSize = len <= 10 ? 36 : len <= 16 ? 28 : len <= 22 ? 22 : 18;
    ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
    ctx.fillText(nome, PX_W / 2, midY + midH / 2, PX_W - padX * 4);
    ctx.fillStyle = '#000000';
  }

  // Data/hora
  ctx.font = 'bold 16px Arial, Helvetica, sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText(when, PX_W / 2, PX_H - footerH / 2, PX_W - padX * 2);

  toThermalMono(ctx, PX_W, PX_H);
  // PNG 1-bit-ish (já mono) — JPEG também ok em alguns drivers; PNG preserva contraste
  return canvas.toDataURL('image/png');
}

/**
 * HTML: só bitmaps de página inteira (80×25).
 * Um job, N páginas → cortador "após cada página" com papel 80×25.
 */
function buildBitmapPagesHtml(pageImages: string[]): string {
  const w = FICHA_LARGURA_MM;
  const h = FICHA_ALTURA_MM;

  const pages = pageImages
    .map((src, index) => {
      const isLast = index === pageImages.length - 1;
      return `<section class="page${isLast ? ' last' : ''}">
  <img class="ficha" width="${PX_W}" height="${PX_H}" src="${src}" alt="Ficha ${index + 1}" />
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
    width: ${w}mm;
    margin: 0;
    padding: 0;
    background: #fff;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
  }
  .page {
    width: ${w}mm;
    height: ${h}mm;
    margin: 0;
    padding: 0;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .page.last {
    page-break-after: auto;
    break-after: auto;
  }
  img.ficha {
    display: block !important;
    width: ${w}mm !important;
    height: ${h}mm !important;
    max-width: ${w}mm !important;
    max-height: ${h}mm !important;
    object-fit: fill !important;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  @media print {
    .page {
      width: ${w}mm !important;
      height: ${h}mm !important;
      page-break-after: always !important;
      break-after: page !important;
    }
    .page.last {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    img.ficha {
      width: ${w}mm !important;
      height: ${h}mm !important;
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

/** @deprecated layout HTML antigo — mantido só se precisar debug */
export function buildFichasHtml(
  tickets: FichaTicket[],
  tenantName?: string,
  printedAt: Date = new Date()
): string {
  const festival = (tenantName || 'FESTIVAL').trim().toUpperCase();
  const when = formatDataHora(printedAt);
  // fallback textual mínimo
  const pages = tickets
    .map((t, i) => {
      const isLast = i === tickets.length - 1;
      return `<section class="page${isLast ? ' last' : ''}"><div>${escapeHtml(festival)} — ${escapeHtml(t.nome)} — ${escapeHtml(when)}</div></section>`;
    })
    .join('');
  return `<!DOCTYPE html><html><body>${pages}</body></html>`;
}

export function printFichasViaIframe(
  tickets: FichaTicket[],
  tenantName?: string,
  printedAt: Date = new Date(),
  _alturaMm: number = FICHA_ALTURA_MM
): void {
  if (tickets.length === 0) return;

  const festival = (tenantName || 'FESTIVAL').trim().toUpperCase();
  const when = formatDataHora(printedAt);
  const h = FICHA_ALTURA_MM;

  void (async () => {
    const pageImages: string[] = [];
    for (const ticket of tickets) {
      try {
        pageImages.push(await renderFichaBitmap(ticket, festival, when));
      } catch {
        // fallback: ficha só com texto (ainda como bitmap)
        pageImages.push(
          await renderFichaBitmap(
            { ...ticket, logo: null },
            festival,
            when
          )
        );
      }
    }

    const html = buildBitmapPagesHtml(pageImages);

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
      }, 2000);
    };

    const trigger = async () => {
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
    }, 300);
  })();
}
