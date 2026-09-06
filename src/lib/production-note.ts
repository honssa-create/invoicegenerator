/**
 * Honour / honour-en production note (生產單): prefill helpers + canvas compose.
 * Effect image is the full background; order texts are overlaid (position, size, color).
 */

import {
  computeHonourLineTotals,
  firstHonourProductLine,
  normalizeOrderDueDate,
  parseHonourLines,
  parseHonourSuppliers,
  type Order,
} from './orders';

export const PRODUCTION_NOTE_FILENAME = '生產單.png';

export interface ProductionNoteTextOffset {
  /** Fraction of image width (0–1), top-left of text block. */
  x: number;
  /** Fraction of image height (0–1), top-left of text block. */
  y: number;
  /** Font size as a fraction of min(image width, height). */
  fontScale?: number;
  /** CSS hex color for overlay text. */
  color?: string;
}

export const DEFAULT_FONT_SCALE = 0.028;
export const MIN_FONT_SCALE = 0.012;
export const MAX_FONT_SCALE = 0.12;
export const DEFAULT_TEXT_COLOR = '#000000';

export const DEFAULT_TEXT_OFFSET: ProductionNoteTextOffset = {
  x: 0.04,
  y: 0.06,
  fontScale: DEFAULT_FONT_SCALE,
  color: DEFAULT_TEXT_COLOR,
};

export const PRODUCTION_NOTE_COLOR_SWATCHES = [
  '#000000',
  '#ffffff',
  '#c9a227',
  '#dc2626',
  '#1d4ed8',
] as const;

export function clampFontScale(scale: number | null | undefined): number {
  if (scale == null || !Number.isFinite(scale)) return DEFAULT_FONT_SCALE;
  return Math.min(MAX_FONT_SCALE, Math.max(MIN_FONT_SCALE, scale));
}

export function normalizeTextColor(color: string | null | undefined): string {
  const s = String(color || '').trim();
  if (/^#[0-9a-fA-F]{6}$/.test(s)) return s.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(s)) {
    return `#${s[1]}${s[1]}${s[2]}${s[2]}${s[3]}${s[3]}`.toLowerCase();
  }
  return DEFAULT_TEXT_COLOR;
}

/** True when the fill is light enough to need a dark drop shadow. */
export function isLightTextColor(color: string | null | undefined): boolean {
  const hex = normalizeTextColor(color);
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.55;
}

export interface ProductionNoteFields {
  po: string;
  details: string;
  quantity: string;
  price: string;
  shipDate: string;
}

export function fieldStr(fields: Record<string, string | boolean>, key: string): string {
  const v = fields[key];
  if (typeof v === 'boolean') return v ? 'yes' : '';
  return String(v ?? '').trim();
}

/** Parse ISO / DMY / `M月D日寄出` → YYYY-MM-DD for a date input. */
export function isoFromProductionNoteShipDate(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const cn = s.match(/(\d{1,2})\s*月\s*(\d{1,2})\s*日/);
  if (cn) {
    const month = Number(cn[1]);
    const day = Number(cn[2]);
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      const y = new Date().getFullYear();
      return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    }
  }
  return normalizeOrderDueDate(s) || '';
}

/** Calendar / stored date → print label `M月D日寄出`. */
export function formatProductionNoteShipDate(raw: string | null | undefined): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  const iso = isoFromProductionNoteShipDate(s);
  if (!iso) return s;
  const month = Number(iso.slice(5, 7));
  const day = Number(iso.slice(8, 10));
  if (!month || !day) return s;
  return `${month}月${day}日寄出`;
}

/** Build initial form values from an honour / honour-en order. */
export function prefillProductionNote(order: Order): ProductionNoteFields {
  const f = order.fields || {};
  const lines = parseHonourLines(f);
  const { totalQuantity } = computeHonourLineTotals(lines);
  const suppliers = parseHonourSuppliers(f, {
    minCount: 1,
    cartonCountCore: order.carton_count,
    productLines: lines,
  });
  const firstSup = suppliers[0];

  const poRaw = (order.po_number || '').trim();
  const po = poRaw
    ? poRaw.startsWith('#')
      ? poRaw
      : `#${poRaw}`
    : order.id
    ? `#${order.id}`
    : '';

  const craft =
    firstSup?.craft || fieldStr(f, 'craft') || firstHonourProductLine(lines)?.craft || '';
  const clasp =
    firstSup?.clasp || fieldStr(f, 'clasp') || firstHonourProductLine(lines)?.clasp || '';
  const plating =
    firstSup?.plating_color ||
    fieldStr(f, 'plating_color') ||
    firstHonourProductLine(lines)?.plating_color ||
    '';
  const detailsParts = [craft, plating, clasp].filter(Boolean);
  const details = detailsParts.join(', ');

  const qty =
    totalQuantity > 0
      ? String(Math.round(totalQuantity) === totalQuantity ? Math.round(totalQuantity) : totalQuantity)
      : firstSup?.supplier_qty || fieldStr(f, 'supplier_qty') || fieldStr(f, 'badge_quantity') || '';

  return {
    po,
    details,
    quantity: qty,
    price: firstSup?.supplier_price || fieldStr(f, 'supplier_price'),
    shipDate: formatProductionNoteShipDate(
      firstSup?.supplier_ship_date || fieldStr(f, 'supplier_ship_date')
    ),
  };
}

/** Lines drawn on the note (empty lines omitted). */
export function productionNoteTextLines(fields: ProductionNoteFields): string[] {
  const lines: string[] = [];
  const po = fields.po.trim();
  if (po) lines.push(po.startsWith('#') ? po : `#${po}`);
  if (fields.details.trim()) lines.push(fields.details.trim());
  if (fields.quantity.trim()) {
    const q = fields.quantity.trim();
    lines.push(/個\s*$/.test(q) ? `數量 : ${q}` : `數量 : ${q}個`);
  }
  if (fields.price.trim()) lines.push(`價錢 : ${fields.price.trim()}`);
  const ship = formatProductionNoteShipDate(fields.shipDate);
  if (ship) lines.push(ship);
  return lines;
}

export function clampTextOffset(
  offset: ProductionNoteTextOffset,
  blockWidthFrac = 0.35,
  blockHeightFrac = 0.22
): ProductionNoteTextOffset {
  return {
    ...offset,
    x: Math.min(Math.max(offset.x, 0), Math.max(0, 1 - blockWidthFrac * 0.25)),
    y: Math.min(Math.max(offset.y, 0), Math.max(0, 1 - blockHeightFrac * 0.25)),
    fontScale: clampFontScale(offset.fontScale),
    color: normalizeTextColor(offset.color),
  };
}

async function resolveImageSource(src: string): Promise<{ url: string; revoke: (() => void) | null }> {
  if (src.startsWith('blob:') || src.startsWith('data:')) {
    return { url: src, revoke: null };
  }
  if (src.startsWith('/') || (typeof window !== 'undefined' && src.startsWith(window.location.origin))) {
    const res = await fetch(src, { credentials: 'same-origin' });
    if (!res.ok) throw new Error('Failed to load effect image');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    return { url, revoke: () => URL.revokeObjectURL(url) };
  }
  return { url: src, revoke: null };
}

function loadHtmlImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Failed to load effect image'));
    img.src = url;
  });
}

export interface ComposeProductionNoteOpts {
  /** Object URL or same-origin API URL for the effect image. */
  imageSrc: string;
  fields: ProductionNoteFields;
  textOffset?: ProductionNoteTextOffset;
}

/**
 * Draw effect image full-bleed and overlay text at the given offset, scale, and color.
 * Returns a PNG blob suitable for download / upload.
 */
export async function composeProductionNotePng(opts: ComposeProductionNoteOpts): Promise<Blob> {
  if (typeof document === 'undefined') {
    throw new Error('composeProductionNotePng requires a browser');
  }

  const { url, revoke } = await resolveImageSource(opts.imageSrc);
  try {
    const img = await loadHtmlImage(url);
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error('Effect image has no dimensions');

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not available');

    ctx.drawImage(img, 0, 0, w, h);

    const lines = productionNoteTextLines(opts.fields);
    if (lines.length) {
      const offset = clampTextOffset(opts.textOffset || DEFAULT_TEXT_OFFSET);
      const fontScale = clampFontScale(offset.fontScale);
      const color = normalizeTextColor(offset.color);
      const fontSize = Math.max(18, Math.round(Math.min(w, h) * fontScale));
      const lineHeight = Math.round(fontSize * 1.45);
      const x = offset.x * w;
      let y = offset.y * h + fontSize;

      ctx.font = `600 ${fontSize}px "Helvetica Neue", Helvetica, Arial, "PingFang HK", "PingFang TC", "Noto Sans TC", sans-serif`;
      ctx.textBaseline = 'alphabetic';
      ctx.fillStyle = color;
      ctx.shadowColor = isLightTextColor(color) ? 'rgba(0,0,0,0.55)' : 'rgba(255,255,255,0.75)';
      ctx.shadowBlur = Math.max(2, Math.round(fontSize * 0.15));
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = Math.max(1, Math.round(fontSize * 0.06));

      for (const line of lines) {
        ctx.fillText(line, x, y);
        y += lineHeight;
      }
    }

    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Failed to encode PNG'));
        },
        'image/png'
      );
    });
  } finally {
    revoke?.();
  }
}

/** Trigger a browser download of a blob. */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
