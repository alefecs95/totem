/** Ficha unica 80x32 mm; 2 vias 80x54 mm. */

export const FICHA_LARGURA_MM = 80;
export const FICHA_UNICA_ALTURA_MM = 32;
export const FICHA_2VIAS_ALTURA_MM = 54;
/** @deprecated use FICHA_UNICA_ALTURA_MM */
export const FICHA_ALTURA_MM = FICHA_UNICA_ALTURA_MM;

const PX_W = 576;
const PX_H_UNICA = 256; // 8 px/mm × 32mm
const PX_H_2VIAS = 432; // 8 px/mm × 54mm
const MARGIN_X = 12;
const MARGIN_BOTTOM = 36;

export type FichaVia = 'unica' | 'barman' | 'cliente';

export type FichaTicket = {
  key: string;
  nome: string;
  logo?: string | null;
  via?: FichaVia;
  codigo?: string;
  seqDia?: number;
};

export type PrintPage = {
  dataUrl: string;
  heightMm: number;
};

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const DAY_SEQ_KEY = 'pdvFichaDaySeq';

export function ticketHeightMm(via?: FichaVia): number {
  return via === 'barman' || via === 'cliente'
    ? FICHA_2VIAS_ALTURA_MM
    : FICHA_UNICA_ALTURA_MM;
}

function ticketPxH(via?: FichaVia): number {
  return via === 'barman' || via === 'cliente' ? PX_H_2VIAS : PX_H_UNICA;
}

function todayKey(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

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

function inkBounds(img: HTMLImageElement): {
  sx: number;
  sy: number;
  sw: number;
  sh: number;
} {
  const iw = img.naturalWidth || img.width;
  const ih = img.naturalHeight || img.height;
  const full = { sx: 0, sy: 0, sw: iw, sh: ih };
  if (!iw || !ih) return full;
  const c = document.createElement('canvas');
  c.width = iw;
  c.height = ih;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  if (!ctx) return full;
  ctx.drawImage(img, 0, 0);
  const data = ctx.getImageData(0, 0, iw, ih).data;
  let minX = iw;
  let minY = ih;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < ih; y += 1) {
    for (let x = 0; x < iw; x += 1) {
      const i = (y * iw + x) * 4;
      const a = data[i + 3] ?? 0;
      if (a < 20) continue;
      const lum =
        0.299 * (data[i] ?? 0) +
        0.587 * (data[i + 1] ?? 0) +
        0.114 * (data[i + 2] ?? 0);
      if (lum > 232) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < minX || maxY < minY) return full;
  const pad = 2;
  const sx = Math.max(0, minX - pad);
  const sy = Math.max(0, minY - pad);
  const ex = Math.min(iw - 1, maxX + pad);
  const ey = Math.min(ih - 1, maxY + pad);
  return { sx, sy, sw: ex - sx + 1, sh: ey - sy + 1 };
}

function drawContain(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  boxW: number,
  boxH: number
): void {
  const b = inkBounds(img);
  if (!b.sw || !b.sh || boxW <= 0 || boxH <= 0) return;
  const scale = Math.min(boxW / b.sw, boxH / b.sh);
  const dw = Math.max(1, Math.floor(b.sw * scale));
  const dh = Math.max(1, Math.floor(b.sh * scale));
  const dx = x + Math.floor((boxW - dw) / 2);
  const dy = y + Math.floor((boxH - dh) / 2);
  ctx.drawImage(img, b.sx, b.sy, b.sw, b.sh, dx, dy, dw, dh);
}

/** Quebra o sabor em linhas para caber na largura. */
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
  // Se ainda passou, truncar ultima linha
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

function drawNomeBar(
  ctx: CanvasRenderingContext2D,
  nome: string,
  y: number,
  h: number
): void {
  const text = (nome || 'FICHA').toUpperCase();
  ctx.fillStyle = '#000';
  ctx.fillRect(MARGIN_X, y + 6, PX_W - MARGIN_X * 2, h - 12);
  ctx.fillStyle = '#fff';
  const len = text.length;
  const fontSize = len <= 10 ? 30 : len <= 16 ? 24 : 18;
  ctx.font = `bold ${fontSize}px Arial, Helvetica, sans-serif`;
  ctx.fillText(text, PX_W / 2, y + h / 2, PX_W - MARGIN_X * 4);
  ctx.fillStyle = '#000';
}

function drawDashedLine(
  ctx: CanvasRenderingContext2D,
  y: number,
  width = PX_W
): void {
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(16, y);
  ctx.lineTo(width - 16, y);
  ctx.stroke();
  ctx.setLineDash([]);
}

/** Via barman: SABOR em destaque; codigo secundario. */
function drawBarman(
  ctx: CanvasRenderingContext2D,
  ticket: FichaTicket,
  when: string,
  pxH: number
): void {
  const nome = (ticket.nome || 'FICHA').toUpperCase();
  const codigo = (ticket.codigo || 'B----').toUpperCase();
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

  // Bloco do sabor (prioridade visual)
  const saborTop = 52;
  const saborH = 250;
  ctx.fillStyle = '#000';
  ctx.fillRect(16, saborTop, PX_W - 32, saborH);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 14px Arial, Helvetica, sans-serif';
  ctx.fillText('SABOR', PX_W / 2, saborTop + 28);

  // Fonte grande, ajusta se o nome for longo
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

  // Codigo menor (secundario)
  ctx.fillStyle = '#000';
  ctx.font = 'bold 16px Arial, Helvetica, sans-serif';
  ctx.fillText(`CODIGO  ${codigo}`, PX_W / 2, pxH - MARGIN_BOTTOM - 22, PX_W - 24);
  ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
  ctx.fillText(when, PX_W / 2, pxH - MARGIN_BOTTOM - 4, PX_W - 24);
}

/** Via cliente: so o codigo em destaque. */
function drawCliente(
  ctx: CanvasRenderingContext2D,
  ticket: FichaTicket,
  when: string,
  pxH: number
): void {
  const codigo = (ticket.codigo || 'B----').toUpperCase();

  ctx.font = 'bold 16px Arial, Helvetica, sans-serif';
  ctx.fillText('CLIENTE', PX_W / 2, 24, PX_W - 24);
  drawDashedLine(ctx, 42);

  ctx.font = 'bold 18px Arial, Helvetica, sans-serif';
  ctx.fillText('SEU CODIGO', PX_W / 2, 90, PX_W - 24);

  // Caixa do codigo — ocupa o centro
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
  ctx.fillText('APRESENTE NO BAR', PX_W / 2, pxH - MARGIN_BOTTOM - 22, PX_W - 24);
  ctx.font = 'bold 12px Arial, Helvetica, sans-serif';
  ctx.fillText(when, PX_W / 2, pxH - MARGIN_BOTTOM - 4, PX_W - 24);
}

function drawUnica(
  ctx: CanvasRenderingContext2D,
  ticket: FichaTicket,
  festival: string,
  when: string,
  pxH: number
): Promise<void> {
  return (async () => {
    const nome = (ticket.nome || 'FICHA').toUpperCase();
    const headerH = 22;
    const dateH = 18;
    const logoX = MARGIN_X;
    const logoY = headerH + 2;
    const logoW = PX_W - MARGIN_X * 2;
    const logoH = pxH - logoY - dateH - MARGIN_BOTTOM;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = 'bold 16px Arial, Helvetica, sans-serif';
    ctx.fillText(
      festival.slice(0, 42).toUpperCase(),
      Math.floor(PX_W / 2),
      Math.floor(headerH / 2),
      logoW
    );

    let drewLogo = false;
    if (ticket.logo?.startsWith('data:image/')) {
      try {
        const img = await loadImage(ticket.logo);
        drawContain(ctx, img, logoX, logoY, logoW, logoH);
        drewLogo = true;
      } catch {
        drewLogo = false;
      }
    }

    if (!drewLogo) {
      drawNomeBar(ctx, nome, logoY, logoH);
    }

    ctx.font = 'bold 13px Arial, Helvetica, sans-serif';
    ctx.fillStyle = '#000';
    ctx.textAlign = 'center';
    ctx.fillText(
      when,
      Math.floor(PX_W / 2),
      pxH - MARGIN_BOTTOM - dateH / 2,
      logoW
    );
  })();
}

export async function renderFichaBitmap(
  ticket: FichaTicket,
  festival: string,
  printedAt: Date = new Date()
): Promise<string> {
  const via = ticket.via || 'unica';
  const pxH = ticketPxH(via);
  const canvas = document.createElement('canvas');
  canvas.width = PX_W;
  canvas.height = pxH;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('canvas');

  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, PX_W, pxH);
  ctx.fillStyle = '#000';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const when = formatDataHora(printedAt);

  if (via === 'barman') {
    drawBarman(ctx, ticket, when, pxH);
  } else if (via === 'cliente') {
    drawCliente(ctx, ticket, when, pxH);
  } else {
    await drawUnica(ctx, ticket, festival, when, pxH);
  }

  toThermalMono(ctx, PX_W, pxH);
  return canvas.toDataURL('image/png');
}

export async function renderFichaPage(
  ticket: FichaTicket,
  festival: string,
  printedAt: Date = new Date()
): Promise<PrintPage> {
  const dataUrl = await renderFichaBitmap(ticket, festival, printedAt);
  return { dataUrl, heightMm: ticketHeightMm(ticket.via) };
}

export type PrintItem = {
  nome: string;
  quantidade: number;
  imprime_ficha?: boolean;
  ficha_2_vias?: boolean;
  ficha_logo_data?: string | null;
};

/**
 * 2 vias e ficha unica sao independentes:
 * - ficha_2_vias → barman (sabor) + cliente (codigo)
 * - imprime_ficha (sem 2 vias) → ficha unica 28mm
 */
export function expandFichas(items: PrintItem[]): FichaTicket[] {
  const out: FichaTicket[] = [];
  for (const item of items) {
    const qtd = Math.max(0, Math.floor(item.quantidade));
    const dual = Boolean(item.ficha_2_vias);
    const unica = Boolean(item.imprime_ficha) && !dual;
    if (!dual && !unica) continue;

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
    if (!item.ficha_2_vias) continue;
    n += Math.max(0, Math.floor(item.quantidade));
  }
  return n;
}
