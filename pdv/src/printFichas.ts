/** Bitmap da ficha 80x25 mm (2,5 cm) para impressao silenciosa no Electron. */

export const FICHA_LARGURA_MM = 80;
export const FICHA_ALTURA_MM = 25;
const PX_W = 576;
const PX_H = 200; // 8 px/mm x 25mm

export type FichaVia = 'unica' | 'barman' | 'cliente';

export type FichaTicket = {
  key: string;
  nome: string;
  logo?: string | null;
  /** unica = ficha normal; barman/cliente = 2 vias */
  via?: FichaVia;
  /** Codigo de retirada (mesmo no par barman/cliente), ex. B-K7P2 */
  codigo?: string;
  /** Contador do dia (#047) — so via barman */
  seqDia?: number;
};

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const DAY_SEQ_KEY = 'pdvFichaDaySeq';

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Contador diario local (reinicia a cada dia). */
export function nextDaySeq(): number {
  try {
    const raw = localStorage.getItem(DAY_SEQ_KEY);
    const parsed = raw ? (JSON.parse(raw) as { day: string; n: number }) : null;
    const day = todayKey();
    const n = parsed && parsed.day === day ? Number(parsed.n) || 0 : 0;
    const next = n + 1;
    localStorage.setItem(DAY_SEQ_KEY, JSON.stringify({ day, n: next }));
    return next;
  } catch {
    return Math.floor(Math.random() * 900) + 100;
  }
}

/** Codigo curto com prefixo B- (drink / 2 vias). */
export function generateFichaCodigo(len = 4): string {
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  let out = '';
  for (let i = 0; i < len; i += 1) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
  }
  return `B-${out}`;
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
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('img'));
    img.src = src;
  });
}

function toThermalMono(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  const data = ctx.getImageData(0, 0, w, h);
  const px = data.data;
  for (let i = 0; i < px.length; i += 4) {
    const lum = 0.299 * px[i]! + 0.587 * px[i + 1]! + 0.114 * px[i + 2]!;
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

function drawNomeBar(
  ctx: CanvasRenderingContext2D,
  nome: string,
  y: number,
  h: number
): void {
  const text = (nome || 'FICHA').toUpperCase();
  ctx.fillStyle = '#000';
  ctx.fillRect(12, y + 6, PX_W - 24, h - 12);
  ctx.fillStyle = '#fff';
  const len = text.length;
  const fontSize = len <= 10 ? 30 : len <= 16 ? 24 : 18;
  ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.fillText(text, PX_W / 2, y + h / 2, PX_W - 48);
  ctx.fillStyle = '#000';
}

/** Caixa de codigo com alto contraste (borda dupla + tracking). */
function drawCodigoBox(
  ctx: CanvasRenderingContext2D,
  codigo: string,
  y: number,
  h: number
): void {
  const x = 28;
  const w = PX_W - 56;
  ctx.fillStyle = '#000';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#fff';
  ctx.fillRect(x + 5, y + 5, w - 10, h - 10);
  ctx.fillStyle = '#000';
  ctx.fillRect(x + 12, y + 12, w - 24, h - 24);

  ctx.fillStyle = '#fff';
  ctx.font = 'bold 11px Arial, Helvetica, sans-serif';
  ctx.fillText('CODIGO', PX_W / 2, y + 26);
  ctx.font = 'bold 40px Arial, Helvetica, sans-serif';
  const code = (codigo || 'B----').toUpperCase();
  ctx.fillText(code, PX_W / 2, y + h / 2 + 8, w - 40);
  ctx.fillStyle = '#000';
}

function drawDashedLine(
  ctx: CanvasRenderingContext2D,
  y: number
): void {
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(16, y);
  ctx.lineTo(PX_W - 16, y);
  ctx.stroke();
  ctx.setLineDash([]);
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

  const via = ticket.via || 'unica';
  const when = formatDataHora(printedAt);
  const nome = (ticket.nome || 'FICHA').toUpperCase();
  const codigo = (ticket.codigo || 'B----').toUpperCase();

  if (via === 'barman') {
    const seq =
      ticket.seqDia != null
        ? `#${String(ticket.seqDia).padStart(3, '0')}`
        : '';
    ctx.font = 'bold 14px Arial, Helvetica, sans-serif';
    ctx.fillText(
      seq ? `BARMAN  ${seq}` : 'BARMAN',
      PX_W / 2,
      14,
      PX_W - 24
    );
    drawDashedLine(ctx, 26);

    ctx.font = 'bold 20px Arial, Helvetica, sans-serif';
    ctx.fillText(nome.slice(0, 26), PX_W / 2, 44, PX_W - 24);

    drawCodigoBox(ctx, codigo, 56, 110);

    ctx.font = 'bold 12px Arial, Helvetica, sans-serif';
    ctx.fillText(when, PX_W / 2, PX_H - 12, PX_W - 24);
  } else if (via === 'cliente') {
    ctx.font = 'bold 12px Arial, Helvetica, sans-serif';
    ctx.fillText(
      `CLIENTE - ${(festival || '').slice(0, 28).toUpperCase()}`,
      PX_W / 2,
      14,
      PX_W - 24
    );
    drawDashedLine(ctx, 26);

    ctx.font = 'bold 18px Arial, Helvetica, sans-serif';
    ctx.fillText(nome.slice(0, 26), PX_W / 2, 44, PX_W - 24);

    drawCodigoBox(ctx, codigo, 56, 110);

    ctx.font = 'bold 12px Arial, Helvetica, sans-serif';
    ctx.fillText(when, PX_W / 2, PX_H - 12, PX_W - 24);
  } else {
    const headerH = 24;
    const footerH = 24;
    const midY = headerH;
    const midH = PX_H - headerH - footerH;

    ctx.font = 'bold 15px Arial, Helvetica, sans-serif';
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
      drawNomeBar(ctx, nome, midY, midH);
    }

    ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
    ctx.fillStyle = '#000';
    ctx.fillText(when, PX_W / 2, PX_H - footerH / 2, PX_W - 24);
  }

  toThermalMono(ctx, PX_W, PX_H);
  return canvas.toDataURL('image/png');
}

export type PrintItem = {
  nome: string;
  quantidade: number;
  imprime_ficha?: boolean;
  ficha_2_vias?: boolean;
  ficha_logo_data?: string | null;
};

export function expandFichas(items: PrintItem[]): FichaTicket[] {
  const out: FichaTicket[] = [];
  for (const item of items) {
    if (!item.imprime_ficha) continue;
    const qtd = Math.max(0, Math.floor(item.quantidade));
    const dual = Boolean(item.ficha_2_vias);
    for (let i = 0; i < qtd; i += 1) {
      const base = `${item.nome}-${i}-${Math.random().toString(36).slice(2, 6)}`;
      if (dual) {
        const codigo = generateFichaCodigo(4);
        const seqDia = nextDaySeq();
        out.push({
          key: `${base}-bar`,
          nome: item.nome,
          via: 'barman',
          codigo,
          seqDia,
        });
        out.push({
          key: `${base}-cli`,
          nome: item.nome,
          via: 'cliente',
          codigo,
          seqDia,
        });
      } else {
        out.push({
          key: base,
          nome: item.nome,
          logo: item.ficha_logo_data ?? null,
          via: 'unica',
        });
      }
    }
  }
  return out;
}

export function countDualUnits(items: PrintItem[]): number {
  let n = 0;
  for (const item of items) {
    if (!item.imprime_ficha || !item.ficha_2_vias) continue;
    n += Math.max(0, Math.floor(item.quantidade));
  }
  return n;
}
