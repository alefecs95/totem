import { PDFDocument } from 'pdf-lib';
import type { FichaTicket } from './fichas';
import { readProductFichaLogos } from './fichas';

/** Largura = rolo 80mm. Altura = 1 ficha. */
export const FICHA_LARGURA_MM = 80;
export const FICHA_ALTURA_MM = 25;

/** ~203 dpi térmica: 80mm≈640px, 25mm≈200px */
const PX_W = 640;
const PX_H = 200;

/** PDF usa pontos (1 pt = 1/72"). */
const PDF_W_PT = (FICHA_LARGURA_MM * 72) / 25.4;
const PDF_H_PT = (FICHA_ALTURA_MM * 72) / 25.4;

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

function dataUrlToBytes(dataUrl: string): Uint8Array {
  const base64 = dataUrl.split(',')[1] || '';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/** Preto/branco para térmica monócroma. */
function toThermalMono(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const v = lum > 170 ? 255 : 0;
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
  const idFromKey = ticket.key.replace(/-\d+$/, '');
  if (idFromKey && logos[idFromKey]) return logos[idFromKey];
  return null;
}

/**
 * Bitmap da ficha com margem interna e logo usando quase toda a largura útil.
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

  // Margem interna (~2mm nas bordas)
  const marginX = 16;
  const marginY = 14;
  const contentW = PX_W - marginX * 2;
  const contentH = PX_H - marginY * 2;

  const headerH = 32;
  const footerH = 30;
  const midY = marginY + headerH;
  const midH = contentH - headerH - footerH;

  ctx.fillStyle = '#000000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Evento (com folga da borda)
  ctx.font = 'bold 20px Arial, Helvetica, sans-serif';
  ctx.fillText(
    festival.slice(0, 40),
    PX_W / 2,
    marginY + headerH / 2,
    contentW
  );

  const logoSrc = resolveLogo(ticket);
  let drewLogo = false;
  if (logoSrc) {
    try {
      const img = await loadImage(logoSrc);
      // Logo quase na largura toda (só a margem lateral)
      drawContainedImage(ctx, img, marginX, midY, contentW, midH);
      drewLogo = true;
    } catch {
      drewLogo = false;
    }
  }

  if (!drewLogo) {
    const nome = (ticket.nome || 'FICHA').toUpperCase();
    const barPad = 6;
    ctx.fillStyle = '#000000';
    ctx.fillRect(marginX, midY + barPad, contentW, midH - barPad * 2);
    ctx.fillStyle = '#ffffff';
    const len = nome.length;
    const fontSize = len <= 10 ? 40 : len <= 16 ? 30 : len <= 22 ? 24 : 20;
    ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
    ctx.fillText(nome, PX_W / 2, midY + midH / 2, contentW - 24);
    ctx.fillStyle = '#000000';
  }

  // Data/hora
  ctx.font = 'bold 18px Arial, Helvetica, sans-serif';
  ctx.fillStyle = '#000000';
  ctx.fillText(when, PX_W / 2, PX_H - marginY - footerH / 2, contentW);

  toThermalMono(ctx, PX_W, PX_H);
  return canvas.toDataURL('image/png');
}

/**
 * PDF com N páginas de 80×25 mm — o spooler Windows vê páginas reais
 * (HTML page-break é ignorado por vários drivers POS e vira 1 página só).
 */
async function buildFichasPdf(pagePngs: string[]): Promise<Blob> {
  const pdf = await PDFDocument.create();

  for (const pngDataUrl of pagePngs) {
    const page = pdf.addPage([PDF_W_PT, PDF_H_PT]);
    const png = await pdf.embedPng(dataUrlToBytes(pngDataUrl));
    page.drawImage(png, {
      x: 0,
      y: 0,
      width: PDF_W_PT,
      height: PDF_H_PT,
    });
  }

  const bytes = await pdf.save();
  return new Blob([bytes], { type: 'application/pdf' });
}

function printPdfBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const iframe = document.createElement('iframe');
  iframe.setAttribute('aria-hidden', 'true');
  iframe.style.cssText = [
    'position:fixed',
    'left:-10000px',
    'top:0',
    'width:80mm',
    'height:25mm',
    'border:0',
    'visibility:hidden',
  ].join(';');
  document.body.appendChild(iframe);

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    window.setTimeout(() => {
      try {
        iframe.remove();
      } catch {
        /* ignore */
      }
      URL.revokeObjectURL(url);
    }, 2000);
  };

  iframe.onload = () => {
    const win = iframe.contentWindow;
    if (!win) {
      cleanup();
      return;
    }
    try {
      iframe.style.visibility = 'visible';
      iframe.style.left = '0';
      win.focus();
      win.addEventListener('afterprint', cleanup, { once: true });
      // PDF embutido: alguns Chromium precisam de um tick
      window.setTimeout(() => {
        try {
          win.print();
        } catch {
          cleanup();
        }
      }, 250);
    } catch {
      cleanup();
    }
    window.setTimeout(cleanup, 180_000);
  };

  iframe.src = url;
}

/** Mantido para compat — o fluxo real usa PDF. */
export function buildFichasHtml(
  tickets: FichaTicket[],
  tenantName?: string,
  printedAt: Date = new Date()
): string {
  const festival = (tenantName || 'FESTIVAL').trim().toUpperCase();
  const when = formatDataHora(printedAt);
  return `<!DOCTYPE html><html><body><pre>${festival}\n${tickets
    .map((t) => t.nome)
    .join('\n')}\n${when}</pre></body></html>`;
}

/**
 * Um job de impressão: PDF com 1 página 80×25 por ficha.
 * Com papel 80×25 e “Cutting: After one page”, corta a cada ficha.
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

  void (async () => {
    const pagePngs: string[] = [];
    for (const ticket of tickets) {
      try {
        pagePngs.push(await renderFichaBitmap(ticket, festival, when));
      } catch {
        pagePngs.push(
          await renderFichaBitmap({ ...ticket, logo: null }, festival, when)
        );
      }
    }

    const pdfBlob = await buildFichasPdf(pagePngs);
    printPdfBlob(pdfBlob);
  })();
}
