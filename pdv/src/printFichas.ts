/** Bitmap da ficha 80×35 mm para impressão silenciosa no Electron. */

export const FICHA_LARGURA_MM = 80;
export const FICHA_ALTURA_MM = 30;
const PX_W = 576;
const PX_H = 240; // 8 px/mm × 30mm

export type FichaTicket = {
  key: string;
  nome: string;
  logo?: string | null;
};

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
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('img'));
    img.src = src;
  });
}

function toThermalMono(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
    const v = lum > 160 ? 255 : 0;
    px[i] = px[i + 1] = px[i + 2] = v;
    px[i + 3] = 255;
  }
  ctx.putImageData(data, 0, 0);
}

function drawCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  boxW: number,
  boxH: number
): void {
  const scale = Math.max(boxW / img.naturalWidth, boxH / img.naturalHeight);
  const dw = Math.floor(img.naturalWidth * scale);
  const dh = Math.floor(img.naturalHeight * scale);
  const dx = x + Math.floor((boxW - dw) / 2);
  const dy = y + Math.floor((boxH - dh) / 2);
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, boxW, boxH);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
}

export async function renderFichaBitmap(
  ticket: FichaTicket,
  festival: string,
  printedAt: Date = new Date()
): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = PX_W;
  canvas.height = PX_H;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, PX_W, PX_H);
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const headerH = 28;
  const footerH = 28;
  const midY = headerH;
  const midH = PX_H - headerH - footerH;
  const when = formatDataHora(printedAt);

  ctx.font = 'bold 18px Arial, Helvetica, sans-serif';
  ctx.fillText(festival.slice(0, 42).toUpperCase(), PX_W / 2, headerH / 2, PX_W - 24);

  let drewLogo = false;
  if (ticket.logo?.startsWith('data:image/')) {
    try {
      const img = await loadImage(ticket.logo);
      drawCover(ctx, img, 0, midY, PX_W, midH);
      drewLogo = true;
    } catch {
      drewLogo = false;
    }
  }

  if (!drewLogo) {
    const nome = (ticket.nome || 'FICHA').toUpperCase();
    ctx.fillStyle = '#000';
    ctx.fillRect(12, midY + 8, PX_W - 24, midH - 16);
    ctx.fillStyle = '#fff';
    const len = nome.length;
    const fontSize = len <= 10 ? 36 : len <= 16 ? 28 : 22;
    ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
    ctx.fillText(nome, PX_W / 2, midY + midH / 2, PX_W - 48);
    ctx.fillStyle = '#000';
  }

  ctx.font = 'bold 16px Arial, Helvetica, sans-serif';
  ctx.fillStyle = '#000';
  ctx.fillText(when, PX_W / 2, PX_H - footerH / 2, PX_W - 24);

  toThermalMono(ctx, PX_W, PX_H);
  return canvas.toDataURL('image/png');
}

export function expandFichas(
  items: Array<{
    nome: string;
    quantidade: number;
    imprime_ficha?: boolean;
    ficha_logo_data?: string | null;
  }>
): FichaTicket[] {
  const out: FichaTicket[] = [];
  for (const item of items) {
    if (!item.imprime_ficha) continue;
    const qtd = Math.max(0, Math.floor(item.quantidade));
    for (let i = 0; i < qtd; i += 1) {
      out.push({
        key: `${item.nome}-${i}-${Math.random().toString(36).slice(2, 6)}`,
        nome: item.nome,
        logo: item.ficha_logo_data ?? null,
      });
    }
  }
  return out;
}
