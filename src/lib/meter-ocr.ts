/**
 * Utility meter dial reading extraction from OCR text / Paddle boxes.
 * Prefers digits beside unit labels (kWh / m³); falls back to tall dial bands.
 */

import type { OcrBox } from '@/lib/paddle-ocr';

export type MeterKind = 'electricity' | 'water';

/** Labels / specs that often OCR near the dial but are not the reading.
 *  Do not list bare single digits here — a real dial's last digit is often "1". */
const NOISE_NUMBERS = new Set([
  '0.1',
  '0.01',
  '0.001',
  '0.0001',
  '10',
  '100',
  '1000',
  '10000',
  '15',
  '50',
  '60',
  '220',
  '380',
  '800',
  '862',
  '3666',
  '4064',
  '62053',
  '2003',
]);

function isTrailingDigitFrag(text: string): boolean {
  return /^\d$/.test(text) || /^\.\d$/.test(text);
}

function midY(b: OcrBox): number {
  return (b.y0 + b.y1) / 2;
}

function midX(b: OcrBox): number {
  return (b.x0 + b.x1) / 2;
}

function boxH(b: OcrBox): number {
  return Math.max(1, b.y1 - b.y0);
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)]!;
}

function digitRunsInText(text: string): string[] {
  const cleaned = text.replace(/,/g, '').replace(/\s+/g, '');
  return cleaned.match(/\d+(?:\.\d+)?/g) || [];
}

function isNoiseToken(raw: string): boolean {
  const t = raw.replace(/\s+/g, '');
  if (!t) return true;
  if (NOISE_NUMBERS.has(t)) return true;
  // Single dial digits must be kept for clustering.
  if (/^\d$/.test(t)) return false;
  // Spec-like short ints (ratings / place labels), not zero-padded dial runs
  if (/^\d{2,3}$/.test(t) && Number(t) <= 100 && !/^0/.test(t)) return true;
  return false;
}

function scoreCandidate(raw: string): number {
  const digits = raw.replace(/\D/g, '');
  const len = digits.length;
  if (len < 4 || len > 8) return -1;
  if (isNoiseToken(raw) && len <= 4) return -1;
  // Prefer typical meter lengths (5–7) and leading zeros (dial style).
  let score = len * 10;
  if (len >= 5 && len <= 7) score += 20;
  if (/^0\d/.test(digits)) score += 15;
  if (raw.includes('.')) score += 5; // electronic meters with 0.1 digit
  // Penalize values that look like years / serials without padding
  if (/^20\d{2}$/.test(digits)) score -= 30;
  return score;
}

/** Prefer longest plausible dial reading from flat OCR text. */
export function parseMeterReadingFromText(text: string): number | null {
  const cleaned = text.replace(/,/g, '');
  const matches = cleaned.match(/\d+(?:\.\d+)?/g);
  if (!matches?.length) return null;

  let best: string | null = null;
  let bestScore = -1;
  for (const m of matches) {
    if (isNoiseToken(m) && m.replace(/\D/g, '').length < 5) continue;
    const s = scoreCandidate(m);
    if (s > bestScore) {
      bestScore = s;
      best = m;
    }
  }
  if (!best || bestScore < 0) {
    // Fallback: longest digit run
    best = matches[0];
    for (const m of matches) {
      if (m.replace(/\D/g, '').length > best.replace(/\D/g, '').length) best = m;
    }
  }
  const n = Number(best);
  return Number.isFinite(n) ? n : null;
}

type DigitFrag = { text: string; box: OcrBox };

function digitFragments(boxes: OcrBox[]): DigitFrag[] {
  const out: DigitFrag[] = [];
  for (const box of boxes) {
    const cleaned = box.text.replace(/,/g, '').replace(/\s+/g, '');
    // Skip boxes that are mostly letters (e.g. m³, kWh, model IDs with a trailing digit)
    const letterCount = (cleaned.match(/[A-Za-z\u4e00-\u9fff]/g) || []).length;
    const digitCount = (cleaned.match(/\d/g) || []).length;
    if (letterCount > 0 && letterCount >= digitCount) continue;

    const runs = cleaned.match(/\d*\.?\d+/g) || digitRunsInText(box.text);
    for (const run of runs) {
      if (!run || run === '.') continue;
      if (NOISE_NUMBERS.has(run)) continue;
      if (isNoiseToken(run) && !/^\d$/.test(run) && !/^\.\d$/.test(run)) continue;
      out.push({ text: run, box });
    }
  }
  return out;
}

function normalizeUnitText(text: string): string {
  return text
    .replace(/\s+/g, '')
    .replace(/[·•･]/g, '')
    .replace(/³/g, '3')
    .replace(/\^3/g, '3')
    .toLowerCase();
}

/** Detect kWh / m³ (and OCR variants) on a box. */
export function boxMatchesMeterUnit(box: OcrBox, kind: MeterKind): boolean {
  const n = normalizeUnitText(box.text);
  if (kind === 'electricity') {
    // kWh, kwh, kw·h, kW.h, sometimes "kwh" glued to other chars
    if (/(?:^|[^a-z])kwh(?:[^a-z]|$)/.test(n) || n === 'kwh' || /kwh/.test(n)) {
      // Avoid matching bare "kw" without h; require wh
      return /k.?w.?h/.test(n) || n.includes('kwh');
    }
    return false;
  }
  // water: m3, m³, 立方米
  if (n.includes('立方米')) return true;
  if (/^m3$/.test(n) || /(?:^|[^a-z0-9])m3(?:[^a-z0-9]|$)/.test(n)) return true;
  if (/^m$/.test(n)) return false; // too weak alone
  return /m3/.test(n) && !/[a-z]{2,}m3/.test(n);
}

function assembleCluster(cluster: DigitFrag[]): string {
  const ordered = [...cluster].sort((a, b) => a.box.x0 - b.box.x0);
  const parts: string[] = [];
  let lastX0 = -Infinity;
  let lastX1 = -Infinity;
  for (const f of ordered) {
    const overlaps = parts.length > 0 && f.box.x0 < lastX1 - 4;
    if (overlaps) {
      const prev = parts[parts.length - 1]!;
      const prevW = Math.max(1, lastX1 - lastX0);
      // Tenths / last roller often sits inside the right edge of the main run box.
      // Append instead of dropping the short fragment when it is further right.
      if (
        isTrailingDigitFrag(f.text) &&
        prev.replace(/\D/g, '').length >= 3 &&
        f.box.x0 >= lastX0 + prevW * 0.55
      ) {
        parts.push(f.text);
        lastX0 = f.box.x0;
        lastX1 = Math.max(lastX1, f.box.x1);
        continue;
      }
      // Duplicate / re-OCR of the same window: keep the longer token
      if (f.text.length > prev.length) parts[parts.length - 1] = f.text;
      lastX1 = Math.max(lastX1, f.box.x1);
      continue;
    }
    parts.push(f.text);
    lastX0 = f.box.x0;
    lastX1 = f.box.x1;
  }
  let raw = parts.join('');
  raw = raw.replace(/\.(?=.*\.)/g, '');
  if (raw.startsWith('.')) raw = `0${raw}`;
  if (raw.endsWith('.') && !/\.\d/.test(raw.slice(0, -1))) raw = raw.slice(0, -1);
  return raw;
}

function clusterMedianHeight(cluster: DigitFrag[]): number {
  return median(cluster.map((f) => boxH(f.box)));
}

function singleDigitCount(cluster: DigitFrag[]): number {
  return cluster.filter((f) => /^\d$/.test(f.text) || /^\.\d$/.test(f.text)).length;
}

function geometryBoost(cluster: DigitFrag[], maxH: number, centerY: number): number {
  const h = clusterMedianHeight(cluster);
  let boost = 0;
  if (maxH > 0) boost += (h / maxH) * 40;
  const cy = median(cluster.map((f) => midY(f.box)));
  const ySpan = Math.max(1, maxH * 8);
  boost += Math.max(0, 12 - (Math.abs(cy - centerY) / ySpan) * 12);
  const singles = singleDigitCount(cluster);
  if (singles >= 4) boost += 25;
  else if (singles >= 3) boost += 10;
  // Prefer similar-height fragments (roller / LCD row)
  const heights = cluster.map((f) => boxH(f.box));
  const mh = median(heights);
  if (mh > 0) {
    const similar = heights.filter((x) => Math.abs(x - mh) <= mh * 0.45).length;
    if (similar >= cluster.length * 0.7) boost += 10;
  }
  return boost;
}

function scoreCluster(
  cluster: DigitFrag[],
  maxH: number,
  centerY: number,
  unitAnchored: boolean,
): { raw: string; score: number } {
  const raw = assembleCluster(cluster);
  const base = scoreCandidate(raw);
  if (base < 0) return { raw, score: -1 };
  let score = base + geometryBoost(cluster, maxH, centerY);
  if (unitAnchored) score += 50;
  return { raw, score };
}

function clusterByYAndHeight(frags: DigitFrag[]): DigitFrag[][] {
  if (!frags.length) return [];
  const heights = frags.map((f) => boxH(f.box));
  const medH = median(heights) || 20;
  const yTol = Math.max(12, medH * 0.85);

  const sorted = [...frags].sort((a, b) => midY(a.box) - midY(b.box) || a.box.x0 - b.box.x0);
  const clusters: DigitFrag[][] = [];
  for (const f of sorted) {
    let placed = false;
    for (const cluster of clusters) {
      const refY = cluster.reduce((s, c) => s + midY(c.box), 0) / cluster.length;
      const refH = clusterMedianHeight(cluster);
      const yOk = Math.abs(midY(f.box) - refY) <= yTol;
      // Red tenths / last roller is often slightly shorter — allow trailing singles looser height match
      const hRatio = Math.max(refH, boxH(f.box)) * (isTrailingDigitFrag(f.text) ? 0.75 : 0.55);
      const hOk = Math.abs(boxH(f.box) - refH) <= hRatio;
      if (yOk && hOk) {
        cluster.push(f);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([f]);
  }
  return clusters;
}

function pickFromClusters(
  clusters: DigitFrag[][],
  frags: DigitFrag[],
  opts: { unitAnchored: boolean; allowSmallSingles: boolean },
): { raw: string | null; score: number } {
  const maxH = Math.max(...frags.map((f) => boxH(f.box)), 1);
  const centerY = median(frags.map((f) => midY(f.box)));

  let bestRaw: string | null = null;
  let bestScore = -1;
  let bestClusterH = 0;

  for (const cluster of clusters) {
    const { raw, score } = scoreCluster(cluster, maxH, centerY, opts.unitAnchored);
    const h = clusterMedianHeight(cluster);
    if (score > bestScore || (score === bestScore && h > bestClusterH)) {
      bestScore = score;
      bestRaw = raw;
      bestClusterH = h;
    }
  }

  // Single multi-digit boxes — only if height-competitive with best dial cluster
  for (const f of frags) {
    if (f.text.replace(/\D/g, '').length < 4) continue;
    const h = boxH(f.box);
    if (!opts.allowSmallSingles && bestClusterH > 0 && h < bestClusterH * 0.7) continue;
    const s = scoreCandidate(f.text);
    if (s < 0) continue;
    let score = s + (h / maxH) * 40;
    if (opts.unitAnchored) score += 50;
    if (score > bestScore) {
      bestScore = score;
      bestRaw = f.text;
      bestClusterH = h;
    }
  }

  return { raw: bestRaw, score: bestScore };
}

/**
 * Prefer digit band beside kWh / m³ at similar midY and height.
 */
function pickByUnitAnchor(
  boxes: OcrBox[],
  frags: DigitFrag[],
  kind: MeterKind,
): { raw: string | null; score: number } | null {
  const units = boxes.filter((b) => boxMatchesMeterUnit(b, kind));
  if (!units.length) return null;

  const maxH = Math.max(...frags.map((f) => boxH(f.box)), 1);
  const centerY = median(frags.map((f) => midY(f.box)));

  let bestRaw: string | null = null;
  let bestScore = -1;
  let bestBandH = 0;

  for (const unit of units) {
    const uy = midY(unit);
    const uh = boxH(unit);
    const yTol = Math.max(14, Math.max(uh, maxH * 0.35) * 1.2);

    // Prefer digits left of unit; fall back to any same-row digits
    const sameRow = frags.filter((f) => Math.abs(midY(f.box) - uy) <= yTol);
    if (!sameRow.length) continue;

    const leftOf = sameRow.filter((f) => f.box.x1 <= unit.x0 + 8 || midX(f.box) < unit.x0);
    let band = leftOf.length ? leftOf : sameRow;

    // Drop tiny place-value labels, but keep short trailing dial digits (red 0.1 window)
    const bandMedH = median(band.map((f) => boxH(f.box))) || uh;
    const kept = band.filter((f) => boxH(f.box) >= bandMedH * 0.45);
    const rightEdge = kept.length
      ? Math.max(...kept.map((f) => f.box.x1))
      : Math.max(...band.map((f) => f.box.x1));
    for (const f of band) {
      if (kept.includes(f)) continue;
      if (
        isTrailingDigitFrag(f.text) &&
        f.box.x0 >= rightEdge - boxH(f.box) * 2 &&
        boxH(f.box) >= bandMedH * 0.28
      ) {
        kept.push(f);
      }
    }
    band = kept;

    if (!band.length) continue;

    const { raw, score } = scoreCluster(band, maxH, centerY, true);
    if (score < 0) continue;
    const h = clusterMedianHeight(band);
    // Prefer taller dial bands when multiple unit hits (e.g. tiny "imp/kWh")
    if (score > bestScore || (score === bestScore && h > bestBandH)) {
      bestScore = score;
      bestRaw = raw;
      bestBandH = h;
    }
  }

  if (!bestRaw || bestScore < 0) return null;
  return { raw: bestRaw, score: bestScore };
}

function finish(raw: string | null): { reading: number | null; raw: string | null } {
  if (!raw) return { reading: null, raw: null };
  const n = Number(raw);
  return {
    reading: Number.isFinite(n) ? n : null,
    raw,
  };
}

/**
 * Cluster digit fragments into horizontal bands (tolerate staggered Y),
 * concatenate left→right, pick the best meter-like reading.
 * When `kind` is set, prefer digits beside kWh (electricity) or m³ (water).
 */
export function parseMeterReadingFromBoxes(
  boxes: OcrBox[],
  kind?: MeterKind | null,
): {
  reading: number | null;
  raw: string | null;
} {
  if (!boxes.length) return { reading: null, raw: null };

  const frags = digitFragments(boxes);
  if (!frags.length) {
    const flat = boxes.map((b) => b.text).join('\n');
    const reading = parseMeterReadingFromText(flat);
    return { reading, raw: reading != null ? String(reading) : null };
  }

  if (kind === 'electricity' || kind === 'water') {
    const anchored = pickByUnitAnchor(boxes, frags, kind);
    if (anchored?.raw && anchored.score >= 0) {
      return finish(anchored.raw);
    }
  }

  const clusters = clusterByYAndHeight(frags);
  const picked = pickFromClusters(clusters, frags, {
    unitAnchored: false,
    allowSmallSingles: false,
  });

  if (!picked.raw || picked.score < 0) {
    const flat = boxes.map((b) => b.text).join('\n');
    const reading = parseMeterReadingFromText(flat);
    return { reading, raw: reading != null ? String(reading) : null };
  }

  return finish(picked.raw);
}
