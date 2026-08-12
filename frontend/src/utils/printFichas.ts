import type { FichaTicket, FichaVia } from './fichas';
import { readProductFichaLogos } from './fichas';

/** Largura = 100% do rolo 80mm. */
export const FICHA_LARGURA_MM = 80;
export const FICHA_UNICA_ALTURA_MM = 25;
export const FICHA_2VIAS_ALTURA_MM = 50;
/** @deprecated — use FICHA_UNICA_ALTURA_MM */
export const FICHA_ALTURA_MM = FICHA_UNICA_ALTURA_MM;

const PX_W = 576;
const PX_H_UNICA = 200;
const PX_H_2VIAS = 400;

export function ticketHeightMm(via?: FichaVia): number {
  return via === 'barman' || via === 'cliente'
    ? FICHA_2VIAS_ALTURA_MM
    : FICHA_UNICA_ALTURA_MM;
}

function ticketPxH(via?: FichaVia): number {
  return via === 'barman' || via === 'cliente' ? PX_H_2VIAS : PX_H_UNICA;
}

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

function toThermalMono(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
    const v = lum > 160 ? 255 : 0;
    px[i] = v;
    px[i + 1] = v;
    px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
}

function drawCoverImage(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  boxW: number,
  boxH: number
): void {
  const scale = Math.max(boxW / img.naturalWidth, boxH / img.naturalHeight);
  const dw = Math.max(1, Math.floor(img.naturalWidth * scale));
  const dh = Math.max(1, Math.floor(img.naturalHeight * scale));
  const dx = x + Math.floor((boxW - dw) / 2);
  const dy = y + Math.floor((boxH - dh) / 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, boxW, boxH);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

function resolveLogo(ticket: FichaTicket): string | null {
  if (ticket.logo && ticket.logo.startsWith('data:image/')) return ticket.logo;
  const logos = readProductFichaLogos();
  if (ticket.productId && logos[ticket.productId]) return logos[ticket.productId];
  const idFromKey = ticket.key.replace(/-\d+$/, '');
  if (idFromKey && logos[idFromKey]) return logos[idFromKey];
  return null;
}

function wrapLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return ['FICHA'];
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    if (ctx.measureText(trial).width <= maxWidth) {
      current = trial;
      continue;
    }
    if (current) lines.push(current);
    current = word;
    if (lines.length >= maxLines - 1) break;
  }
  if (lines.length < maxLines && current) lines.push(current);
  const last = lines[lines.length - 1] ?? text;
  if (ctx.measureText(last).width > maxWidth) {
    let cut = last;
    while (cut.length > 1 && ctx.measureText(`${cut}…`).width > maxWidth) {
      cut = cut.slice(0, -1);
    }
    lines[lines.length - 1] = `${cut}…`;
  }
  return lines.slice(0, maxLines);
}

function drawDashedLine(ctx: CanvasRenderingContext2D, y: number): void {
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(16, y);
  ctx.lineTo(PX_W - 16, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

type PageImage = { src: string; heightMm: number; pxH: number };

async function renderFichaBitmap(
  ticket: FichaTicket,
  festival: string,
  when: string
): Promise<PageImage> {
  const via = ticket.via || 'unica';
  const pxH = ticketPxH(via);
  const heightMm = ticketHeightMm(via);
  const canvas = document.createElement('canvas');
  canvas.width = PX_W;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('no_canvas');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, PX_W, pxH);
  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const nome = (ticket.nome || 'FICHA').toUpperCase();
  const codigo = (ticket.codigo || 'B----').toUpperCase();

  if (via === 'barman') {
    const seq =
      ticket.seqDia != null
        ? `#${String(ticket.seqDia).padStart(3, '0')}`
        : '';
    ctx.font = 'bold 18px Arial, Helvetica, sans-serif';
    ctx.fillText(
      seq ? `BARMAN  ${seq}` : 'BARMAN',
      PX_W / 2,
      22,
      PX_W - 24
    );
    drawDashedLine(ctx, 40);

    const saborTop = 52;
    const saborH = 250;
    ctx.fillStyle = '#000';
    ctx.fillRect(16, saborTop, PX_W - 32, saborH);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial, Helvetica, sans-serif';
    ctx.fillText('SABOR', PX_W / 2, saborTop + 28);

    let fontSize = nome.length <= 12 ? 64 : nome.length <= 20 ? 48 : 40;
    ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
    let lines = wrapLines(ctx, nome, PX_W - 64, 3);
    while (fontSize > 32 && lines.length > 2) {
      fontSize -= 4;
      ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
      lines = wrapLines(ctx, nome, PX_W - 64, 3);
    }
    const lineH = fontSize + 10;
    const blockH = lines.length * lineH;
    let ty = saborTop + 40 + (saborH - 56 - blockH) / 2 + lineH / 2;
    for (const line of lines) {
      ctx.fillText(line, PX_W / 2, ty, PX_W - 64);
      ty += lineH;
    }

    ctx.fillStyle = '#000';
    ctx.font = 'bold 16px Arial, Helvetica, sans-serif';
    ctx.fillText(`CODIGO  ${codigo}`, PX_W / 2, pxH - 36, PX_W - 24);
    ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
    ctx.fillText(when, PX_W / 2, pxH - 14, PX_W - 24);
  } else if (via === 'cliente') {
    ctx.font = 'bold 16px Arial, Helvetica, sans-serif';
    ctx.fillText('CLIENTE', PX_W / 2, 24, PX_W - 24);
    drawDashedLine(ctx, 42);

    ctx.font = 'bold 18px Arial, Helvetica, sans-serif';
    ctx.fillText('SEU CODIGO', PX_W / 2, 90, PX_W - 24);

    const boxY = 120;
    const boxH = 200;
    const x = 40;
    const w = PX_W - 80;
    ctx.fillStyle = '#000';
    ctx.fillRect(x, boxY, w, boxH);
    ctx.fillStyle = '#fff';
    ctx.fillRect(x + 8, boxY + 8, w - 16, boxH - 16);
    ctx.fillStyle = '#000';
    ctx.fillRect(x + 18, boxY + 18, w - 36, boxH - 36);
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 72px Arial, Helvetica, sans-serif';
    ctx.fillText(codigo, PX_W / 2, boxY + boxH / 2 + 8, w - 56);

    ctx.fillStyle = '#000';
    ctx.font = 'bold 14px Arial, Helvetica, sans-serif';
    ctx.fillText('APRESENTE NO BAR', PX_W / 2, pxH - 36, PX_W - 24);
    ctx.font = 'bold 12px Arial, Helvetica, sans-serif';
    ctx.fillText(when, PX_W / 2, pxH - 14, PX_W - 24);
  } else {
    const headerH = 24;
    const footerH = 24;
    const midY = headerH;
    const midH = pxH - headerH - footerH;
    const padX = 12;

    ctx.font = 'bold 15px Arial, Helvetica, sans-serif';
    ctx.fillText(festival.slice(0, 42), PX_W / 2, headerH / 2, PX_W - padX * 2);

    const logoSrc = resolveLogo(ticket);
    let drewLogo = false;
    if (logoSrc) {
      try {
        const img = await loadImage(logoSrc);
        drawCoverImage(ctx, img, 0, midY, PX_W, midH);
        drewLogo = true;
      } catch {
        drewLogo = false;
      }
    }

    if (!drewLogo) {
      ctx.fillStyle = '#000000';
      const barPad = 6;
      ctx.fillRect(padX, midY + barPad, PX_W - padX * 2, midH - barPad * 2);
      ctx.fillStyle = '#ffffff';
      const len = nome.length;
      const fontSize = len <= 10 ? 30 : len <= 16 ? 24 : len <= 22 ? 18 : 16;
      ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
      ctx.fillText(nome, PX_W / 2, midY + midH / 2, PX_W - padX * 4);
      ctx.fillStyle = '#000000';
    }

    ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
    ctx.fillStyle = '#000000';
    ctx.fillText(when, PX_W / 2, pxH - footerH / 2, PX_W - padX * 2);
  }

  toThermalMono(ctx, PX_W, pxH);
  return { src: canvas.toDataURL('image/png'), heightMm, pxH };
}

function buildSingleFichaHtml(page: PageImage): string {
  const w = FICHA_LARGURA_MM;
  const h = page.heightMm;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Ficha</title>
<style>
  @page { size: ${w}mm ${h}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: ${w}mm !important;
    height: ${h}mm !important;
    margin: 0 !important;
    padding: 0 !important;
    background: #fff;
    overflow: hidden;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  img.ficha {
    display: block !important;
    width: ${w}mm !important;
    height: ${h}mm !important;
    object-fit: fill !important;
  }
</style>
</head>
<body>
  <img class="ficha" width="${PX_W}" height="${page.pxH}" src="${page.src}" alt="Ficha" />
</body>
</html>`;
}

function buildBatchFichasHtml(pageImages: PageImage[], heightMm: number): string {
  const w = FICHA_LARGURA_MM;
  const h = heightMm;
  const totalH = h * Math.max(1, pageImages.length);

  const pages = pageImages
    .map((page, index) => {
      const isLast = index === pageImages.length - 1;
      return `<section class="page${isLast ? ' last' : ''}">
  <img class="ficha" width="${PX_W}" height="${page.pxH}" src="${page.src}" alt="Ficha ${index + 1}" />
</section>`;
    })
    .join('\n');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Fichas</title>
<style>
  @page { size: ${w}mm ${h}mm; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body {
    width: ${w}mm;
    height: auto;
    min-height: ${totalH}mm;
    margin: 0;
    padding: 0;
    background: #fff;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
  }
  .page {
    display: block;
    width: ${w}mm;
    height: ${h}mm;
    min-height: ${h}mm;
    max-height: ${h}mm;
    margin: 0;
    padding: 0;
    overflow: hidden;
    page-break-after: always;
    break-after: page;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .page.last { page-break-after: auto; break-after: auto; }
  .page + .page { page-break-before: always; break-before: page; }
  img.ficha {
    display: block !important;
    width: ${w}mm !important;
    height: ${h}mm !important;
    object-fit: fill !important;
  }
  @media print {
    .page {
      width: ${w}mm !important;
      height: ${h}mm !important;
      page-break-after: always !important;
      break-after: page !important;
    }
    .page.last { page-break-after: auto !important; break-after: auto !important; }
  }
</style>
</head>
<body>
${pages}
</body>
</html>`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function printHtmlOnce(html: string, frameHeightMm: number): Promise<void> {
  return new Promise((resolve) => {
    const iframe = document.createElement('iframe');
    iframe.setAttribute('aria-hidden', 'true');
    iframe.style.cssText = [
      'position:fixed',
      'left:0',
      'top:0',
      `width:${FICHA_LARGURA_MM}mm`,
      `height:${frameHeightMm}mm`,
      'border:0',
      'opacity:0.01',
      'pointer-events:none',
      'z-index:9999',
    ].join(';');
    document.body.appendChild(iframe);

    const win = iframe.contentWindow;
    const doc = iframe.contentDocument || win?.document;
    if (!win || !doc) {
      iframe.remove();
      resolve();
      return;
    }

    doc.open();
    doc.write(html);
    doc.close();

    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      window.setTimeout(() => {
        try {
          iframe.remove();
        } catch {
          /* ignore */
        }
        resolve();
      }, 350);
    };

    const run = async () => {
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
        win.focus();
        win.addEventListener('afterprint', finish, { once: true });
        win.print();
      } catch {
        finish();
      }
      window.setTimeout(finish, 180_000);
    };

    window.setTimeout(() => {
      void run();
    }, 250);
  });
}

/** @deprecated */
export function buildFichasHtml(
  tickets: FichaTicket[],
  tenantName?: string,
  printedAt: Date = new Date()
): string {
  const festival = (tenantName || 'FESTIVAL').trim().toUpperCase();
  const when = formatDataHora(printedAt);
  const pages = tickets
    .map((t, i) => {
      const isLast = i === tickets.length - 1;
      return `<section class="page${isLast ? ' last' : ''}"><div>${escapeHtml(festival)} — ${escapeHtml(t.nome)} — ${escapeHtml(when)}</div></section>`;
    })
    .join('');
  return `<!DOCTYPE html><html><body>${pages}</body></html>`;
}

/**
 * Imprime fichas via iframe. Agrupa por altura (25mm unica / 50mm 2 vias).
 */
export function printFichasViaIframe(
  tickets: FichaTicket[],
  tenantName?: string,
  printedAt: Date = new Date(),
  _alturaMm: number = FICHA_ALTURA_MM
): void {
  if (tickets.length === 0) return;

  const festival = (tenantName || 'FESTIVAL').trim().toUpperCase();
  const when = formatDataHora(printedAt);
  const cutEach = localStorage.getItem('fichaPrintCutEach') === '1';

  void (async () => {
    const pageImages: PageImage[] = [];
    for (const ticket of tickets) {
      try {
        pageImages.push(await renderFichaBitmap(ticket, festival, when));
      } catch {
        pageImages.push(
          await renderFichaBitmap({ ...ticket, logo: null }, festival, when)
        );
      }
    }

    if (cutEach) {
      for (let i = 0; i < pageImages.length; i += 1) {
        await printHtmlOnce(buildSingleFichaHtml(pageImages[i]!), pageImages[i]!.heightMm);
        if (i < pageImages.length - 1) await sleep(400);
      }
      return;
    }

    // Agrupa por altura para um @page consistente por job
    const byHeight = new Map<number, PageImage[]>();
    for (const page of pageImages) {
      const list = byHeight.get(page.heightMm) ?? [];
      list.push(page);
      byHeight.set(page.heightMm, list);
    }

    for (const [heightMm, group] of byHeight) {
      await printHtmlOnce(
        buildBatchFichasHtml(group, heightMm),
        heightMm * group.length
      );
      await sleep(400);
    }
  })();
}
