/**
 * Utility meter dial reading extraction from OCR text / Paddle boxes.
 * Handles mechanical rollers, LCD digits, and slightly staggered digit windows.
 */

import type { OcrBox } from '@/lib/paddle-ocr';

/** Labels / specs that often OCR near the dial but are not the reading. */
const NOISE_NUMBERS = new Set([
  '0.1',
  '0.01',
  '0.001',
  '0.0001',
  '1',
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

function midY(b: OcrBox): number {
  return (b.y0 + b.y1) / 2;
}

function boxH(b: OcrBox): number {
  return Math.max(1, b.y1 - b.y0);
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

/**
 * Cluster digit fragments into horizontal bands (tolerate staggered Y),
 * concatenate left→right, pick the best meter-like reading.
 */
export function parseMeterReadingFromBoxes(boxes: OcrBox[]): {
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

  const heights = frags.map((f) => boxH(f.box)).sort((a, b) => a - b);
  const medH = heights[Math.floor(heights.length / 2)] || 20;
  const yTol = Math.max(12, medH * 0.85);

  const sorted = [...frags].sort((a, b) => midY(a.box) - midY(b.box) || a.box.x0 - b.box.x0);
  const clusters: DigitFrag[][] = [];
  for (const f of sorted) {
    let placed = false;
    for (const cluster of clusters) {
      const refY = cluster.reduce((s, c) => s + midY(c.box), 0) / cluster.length;
      if (Math.abs(midY(f.box) - refY) <= yTol) {
        cluster.push(f);
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push([f]);
  }

  let bestRaw: string | null = null;
  let bestScore = -1;
  for (const cluster of clusters) {
    const ordered = [...cluster].sort((a, b) => a.box.x0 - b.box.x0);
    // Deduplicate overlapping OCR of same digit window
    const parts: string[] = [];
    let lastX1 = -Infinity;
    for (const f of ordered) {
      if (f.box.x0 < lastX1 - 4 && parts.length) {
        // Heavy overlap: keep longer / prefer existing
        const prev = parts[parts.length - 1];
        if (f.text.length > prev.length) parts[parts.length - 1] = f.text;
        lastX1 = Math.max(lastX1, f.box.x1);
        continue;
      }
      parts.push(f.text);
      lastX1 = f.box.x1;
    }
    let raw = parts.join('');
    // Normalize accidental double / dangling dots ("05731" + ".8" → "05731.8")
    raw = raw.replace(/\.(?=.*\.)/g, '');
    if (raw.startsWith('.')) raw = `0${raw}`;
    if (raw.endsWith('.') && !/\.\d/.test(raw.slice(0, -1))) raw = raw.slice(0, -1);
    const s = scoreCandidate(raw);
    if (s > bestScore) {
      bestScore = s;
      bestRaw = raw;
    }
  }

  // Also consider any single multi-digit box that already looks complete
  for (const f of frags) {
    const s = scoreCandidate(f.text);
    if (s > bestScore) {
      bestScore = s;
      bestRaw = f.text;
    }
  }

  if (!bestRaw || bestScore < 0) {
    const flat = boxes.map((b) => b.text).join('\n');
    const reading = parseMeterReadingFromText(flat);
    return { reading, raw: reading != null ? String(reading) : null };
  }

  const n = Number(bestRaw);
  return {
    reading: Number.isFinite(n) ? n : null,
    raw: bestRaw,
  };
}
