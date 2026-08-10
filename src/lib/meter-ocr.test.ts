import { describe, expect, it } from 'vitest';
import { parseMeterReadingFromBoxes, parseMeterReadingFromText } from '@/lib/meter-ocr';
import type { OcrBox } from '@/lib/paddle-ocr';

function box(text: string, x0: number, y0: number, w = 20, h = 28): OcrBox {
  return { text, score: 0.95, x0, y0, x1: x0 + w, y1: y0 + h };
}

describe('parseMeterReadingFromText', () => {
  it('prefers long dial readings over ratings', () => {
    const text = ['DT862', '220V', '50Hz', '038429', 'kWh', '60r/kW·h'].join('\n');
    expect(parseMeterReadingFromText(text)).toBe(38429);
  });

  it('keeps decimal readings', () => {
    expect(parseMeterReadingFromText('05731.8 kWh 800imp')).toBe(5731.8);
  });
});

describe('parseMeterReadingFromBoxes', () => {
  it('assembles staggered mechanical digits left-to-right (038429)', () => {
    // Slightly different Y like roller windows
    const boxes: OcrBox[] = [
      box('DT862', 10, 10, 40, 16),
      box('0', 40, 100, 18, 30),
      box('3', 62, 102, 18, 30),
      box('8', 84, 99, 18, 30),
      box('4', 106, 101, 18, 30),
      box('2', 128, 100, 18, 30),
      box('9', 150, 103, 18, 30),
      box('10000', 40, 140, 30, 12),
      box('kWh', 180, 105, 30, 16),
      box('220', 20, 200, 24, 14),
    ];
    const r = parseMeterReadingFromBoxes(boxes);
    expect(r.raw).toBe('038429');
    expect(r.reading).toBe(38429);
  });

  it('keeps electronic reading with decimal digit (05731.8)', () => {
    const boxes: OcrBox[] = [
      box('DDS3666', 10, 10, 50, 14),
      box('05731', 50, 100, 90, 28),
      box('.8', 145, 102, 22, 28),
      box('0.1', 145, 135, 20, 12),
      box('800', 20, 180, 24, 14),
      box('kWh', 180, 105, 30, 16),
    ];
    const r = parseMeterReadingFromBoxes(boxes);
    expect(r.raw).toMatch(/05731\.?8/);
    expect(r.reading).toBe(5731.8);
  });

  it('reads LCD-style full string (0031622)', () => {
    const boxes: OcrBox[] = [
      box('CLP', 10, 10, 30, 14),
      box('0031622', 40, 80, 120, 32),
      box('kWh', 170, 85, 30, 16),
      box('220', 40, 160, 24, 12),
    ];
    const r = parseMeterReadingFromBoxes(boxes);
    expect(r.raw).toBe('0031622');
    expect(r.reading).toBe(31622);
  });

  it('reads water roller main digits and ignores place-value labels', () => {
    const boxes: OcrBox[] = [
      box('00007', 60, 90, 100, 28),
      box('m3', 170, 95, 24, 14),
      box('0.1', 120, 140, 18, 12),
      box('0.01', 150, 160, 22, 12),
      box('1.5', 20, 200, 20, 12),
    ];
    const r = parseMeterReadingFromBoxes(boxes);
    expect(r.raw).toBe('00007');
    expect(r.reading).toBe(7);
  });
});
