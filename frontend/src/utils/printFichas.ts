import type { FichaTicket } from './fichas';
import { readProductFichaLogos } from './fichas';

/** Largura = 100% do rolo 80mm. SÃ³ a altura Ã© controlada pelo sistema. */
export const FICHA_LARGURA_MM = 80;
export const FICHA_ALTURA_MM = 30;

/**
 * ResoluÃ§Ã£o proporcional (576Ã—200 para 80Ã—25mm â†’ 8 px/mm).
 * 80Ã—30mm â†’ 576Ã—240.
 */
const PX_W = 576;
const PX_H = 240;

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

/** Converte canvas para preto/branco â€” tÃ©rmica monÃ³croma falha com verde/cor. */
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

/** Preenche 100% do box (cover) â€” sem faixas brancas; pode cortar bordas da arte. */
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

  const via = ticket.via || 'unica';
  const nome = (ticket.nome || 'FICHA').toUpperCase();
  const padX = 12;

  if (via === 'barman') {
    const seq =
      ticket.seqDia != null
        ? `#${String(ticket.seqDia).padStart(3, '0')}`
        : '';
    ctx.font = 'bold 16px Arial, Helvetica, sans-serif';
    ctx.fillText(
      seq ? `BARMAN  ${seq}` : 'BARMAN',
      PX_W / 2,
      16,
      PX_W - 24
    );

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(16, 30);
    ctx.lineTo(PX_W - 16, 30);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = 'bold 24px Arial, Helvetica, sans-serif';
    ctx.fillText(nome.slice(0, 26), PX_W / 2, 52, PX_W - 24);

    const codigo = (ticket.codigo || 'B----').toUpperCase();
    const x = 28;
    const y = 68;
    const w = PX_W - 56;
    const h = 132;
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 14, y + 14, w - 28, h - 28);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
    ctx.fillText('CODIGO', PX_W / 2, y + 32);
    ctx.font = 'bold 48px Arial, Helvetica, sans-serif';
    ctx.fillText(codigo, PX_W / 2, y + h / 2 + 10, w - 48);
    ctx.fillStyle = '#000000';

    ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
    ctx.fillText(when, PX_W / 2, PX_H - 14, PX_W - 24);
  } else if (via === 'cliente') {
    ctx.font = 'bold 14px Arial, Helvetica, sans-serif';
    ctx.fillText(
      `CLIENTE - ${(festival || '').slice(0, 28).toUpperCase()}`,
      PX_W / 2,
      16,
      PX_W - 24
    );

    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(16, 30);
    ctx.lineTo(PX_W - 16, 30);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = 'bold 22px Arial, Helvetica, sans-serif';
    ctx.fillText(nome.slice(0, 26), PX_W / 2, 52, PX_W - 24);

    const codigo = (ticket.codigo || 'B----').toUpperCase();
    const x = 28;
    const y = 68;
    const w = PX_W - 56;
    const h = 132;
    ctx.fillStyle = '#000000';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x + 6, y + 6, w - 12, h - 12);
    ctx.fillStyle = '#000000';
    ctx.fillRect(x + 14, y + 14, w - 28, h - 28);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
    ctx.fillText('CODIGO', PX_W / 2, y + 32);
    ctx.font = 'bold 48px Arial, Helvetica, sans-serif';
    ctx.fillText(codigo, PX_W / 2, y + h / 2 + 10, w - 48);
    ctx.fillStyle = '#000000';

    ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
    ctx.fillText(when, PX_W / 2, PX_H - 14, PX_W - 24);
  } else {
    const headerH = 28;
    const footerH = 28;
    const midY = headerH;
    const midH = PX_H - headerH - footerH;

    ctx.font = 'bold 18px Arial, Helvetica, sans-serif';
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
      const barPad = 8;
      ctx.fillRect(padX, midY + barPad, PX_W - padX * 2, midH - barPad * 2);
      ctx.fillStyle = '#ffffff';
      const len = nome.length;
      const fontSize = len <= 10 ? 36 : len <= 16 ? 28 : len <= 22 ? 22 : 18;
      ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
      ctx.fillText(nome, PX_W / 2, midY + midH / 2, PX_W - padX * 4);
      ctx.fillStyle = '#000000';
    }

    ctx.font = 'bold 16px Arial, Helvetica, sans-serif';
    ctx.fillStyle = '#000000';
    ctx.fillText(when, PX_W / 2, PX_H - footerH / 2, PX_W - padX * 2);
  }

  toThermalMono(ctx, PX_W, PX_H);
  return canvas.toDataURL('image/png');
}

/**
 * HTML de UMA ficha = UMA pÃ¡gina 80Ã—35 (modo corte com kiosk silencioso).
 */
function buildSingleFichaHtml(pngDataUrl: string): string {
  const w = FICHA_LARGURA_MM;
  const h = FICHA_ALTURA_MM;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<title>Ficha</title>
<style>
  @page {
    size: ${w}mm ${h}mm;
    margin: 0;
  }
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
    color-adjust: exact !important;
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
  <img class="ficha" width="${PX_W}" height="${PX_H}" src="${pngDataUrl}" alt="Ficha" />
</body>
</html>`;
}

/**
 * HTML com N fichas (1 confirmaÃ§Ã£o no Chrome).
 * page-break ajuda se o driver respeitar; senÃ£o corta sÃ³ no fim.
 */
function buildBatchFichasHtml(pageImages: string[]): string {
  const w = FICHA_LARGURA_MM;
  const h = FICHA_ALTURA_MM;
  const totalH = h * Math.max(1, pageImages.length);

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
    height: auto;
    min-height: ${totalH}mm;
    margin: 0;
    padding: 0;
    background: #fff;
    -webkit-print-color-adjust: exact !important;
    print-color-adjust: exact !important;
    color-adjust: exact !important;
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
  .page.last {
    page-break-after: auto;
    break-after: auto;
  }
  .page + .page {
    page-break-before: always;
    break-before: page;
  }
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
    .page.last {
      page-break-after: auto !important;
      break-after: auto !important;
    }
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
      return `<section class="page${isLast ? ' last' : ''}"><div>${escapeHtml(festival)} â€” ${escapeHtml(t.nome)} â€” ${escapeHtml(when)}</div></section>`;
    })
    .join('');
  return `<!DOCTYPE html><html><body>${pages}</body></html>`;
}

/**
 * PadrÃ£o: 1 diÃ¡logo sÃ³ (todas as fichas no mesmo job) â€” operador confirma 1x.
 *
 * Corte por ficha sem confirmar N vezes: sÃ³ com Chrome em modo silencioso
 * (`--kiosk-printing`) + localStorage fichaPrintCutEach=1.
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
    const pageImages: string[] = [];
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
      // Requer --kiosk-printing; senÃ£o o operador confirma cada ficha.
      for (let i = 0; i < pageImages.length; i += 1) {
        await printHtmlOnce(
          buildSingleFichaHtml(pageImages[i]),
          FICHA_ALTURA_MM
        );
        if (i < pageImages.length - 1) await sleep(400);
      }
      return;
    }

    await printHtmlOnce(
      buildBatchFichasHtml(pageImages),
      FICHA_ALTURA_MM * pageImages.length
    );
  })();
}

