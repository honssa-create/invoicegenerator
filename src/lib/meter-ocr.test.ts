import { describe, expect, it } from 'vitest';
import {
  boxMatchesMeterUnit,
  parseMeterReadingFromBoxes,
  parseMeterReadingFromText,
} from '@/lib/meter-ocr';
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

describe('boxMatchesMeterUnit', () => {
  it('matches kWh variants for electricity', () => {
    expect(boxMatchesMeterUnit(box('kWh', 0, 0), 'electricity')).toBe(true);
    expect(boxMatchesMeterUnit(box('kW·h', 0, 0), 'electricity')).toBe(true);
    expect(boxMatchesMeterUnit(box('KWH', 0, 0), 'electricity')).toBe(true);
    expect(boxMatchesMeterUnit(box('m3', 0, 0), 'electricity')).toBe(false);
  });

  it('matches m3 variants for water', () => {
    expect(boxMatchesMeterUnit(box('m3', 0, 0), 'water')).toBe(true);
    expect(boxMatchesMeterUnit(box('m³', 0, 0), 'water')).toBe(true);
    expect(boxMatchesMeterUnit(box('立方米', 0, 0), 'water')).toBe(true);
    expect(boxMatchesMeterUnit(box('kWh', 0, 0), 'water')).toBe(false);
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
    const r = parseMeterReadingFromBoxes(boxes, 'electricity');
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
    const r = parseMeterReadingFromBoxes(boxes, 'electricity');
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
    const r = parseMeterReadingFromBoxes(boxes, 'electricity');
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
    const r = parseMeterReadingFromBoxes(boxes, 'water');
    expect(r.raw).toBe('00007');
    expect(r.reading).toBe(7);
  });

  it('picks dial beside kWh over a longer distractor serial', () => {
    const boxes: OcrBox[] = [
      box('12345678', 10, 20, 80, 12), // small serial, longer string
      box('0', 40, 100, 18, 32),
      box('3', 62, 101, 18, 32),
      box('8', 84, 100, 18, 32),
      box('4', 106, 102, 18, 32),
      box('2', 128, 100, 18, 32),
      box('9', 150, 101, 18, 32),
      box('kWh', 180, 104, 28, 16),
    ];
    const r = parseMeterReadingFromBoxes(boxes, 'electricity');
    expect(r.raw).toBe('038429');
    expect(r.reading).toBe(38429);
  });

  it('picks water dial beside m3 over distractors', () => {
    const boxes: OcrBox[] = [
      box('998877', 10, 10, 60, 12),
      box('00007', 60, 90, 100, 28),
      box('m³', 170, 95, 24, 14),
      box('0.1', 120, 140, 18, 12),
    ];
    const r = parseMeterReadingFromBoxes(boxes, 'water');
    expect(r.raw).toBe('00007');
    expect(r.reading).toBe(7);
  });

  it('falls back to tall dial when unit label is missing', () => {
    const boxes: OcrBox[] = [
      box('999999', 10, 10, 70, 12),
      box('0', 40, 100, 18, 32),
      box('3', 62, 101, 18, 32),
      box('8', 84, 100, 18, 32),
      box('4', 106, 102, 18, 32),
      box('2', 128, 100, 18, 32),
      box('9', 150, 101, 18, 32),
    ];
    const r = parseMeterReadingFromBoxes(boxes, 'electricity');
    expect(r.raw).toBe('038429');
    expect(r.reading).toBe(38429);
  });

  it('does not lock onto wrong-kind unit; uses height fallback', () => {
    // Only m3 present while scanning as electricity — ignore water unit, use tall dial
    const boxes: OcrBox[] = [
      box('11111111', 10, 10, 80, 12),
      box('0', 40, 100, 18, 32),
      box('3', 62, 101, 18, 32),
      box('8', 84, 100, 18, 32),
      box('4', 106, 102, 18, 32),
      box('2', 128, 100, 18, 32),
      box('9', 150, 101, 18, 32),
      box('m3', 180, 104, 24, 14),
    ];
    const r = parseMeterReadingFromBoxes(boxes, 'electricity');
    expect(r.raw).toBe('038429');
    expect(r.reading).toBe(38429);
  });

  it('keeps overlapping tenths digit instead of dropping it (05731.8)', () => {
    // Main run box extends into the red 0.1 window; old logic kept longer "05731" only
    const boxes: OcrBox[] = [
      box('05731', 50, 100, 100, 28), // x0=50 x1=150
      box('.8', 138, 102, 22, 26), // overlaps right edge
      box('0.1', 140, 138, 20, 12),
      box('kWh', 175, 105, 30, 16),
    ];
    const r = parseMeterReadingFromBoxes(boxes, 'electricity');
    expect(r.raw).toMatch(/05731\.?8/);
    expect(r.reading).toBe(5731.8);
  });

  it('keeps overlapping last roller digit (038429)', () => {
    const boxes: OcrBox[] = [
      box('03842', 40, 100, 110, 30), // x0=40 x1=150
      box('9', 140, 101, 18, 30), // overlaps right edge
      box('kWh', 175, 105, 28, 16),
    ];
    const r = parseMeterReadingFromBoxes(boxes, 'electricity');
    expect(r.raw).toBe('038429');
    expect(r.reading).toBe(38429);
  });

  it('keeps last digit when it is 1', () => {
    const boxes: OcrBox[] = [
      box('0', 40, 100, 18, 30),
      box('3', 62, 101, 18, 30),
      box('8', 84, 100, 18, 30),
      box('4', 106, 102, 18, 30),
      box('2', 128, 100, 18, 30),
      box('1', 150, 101, 18, 30),
      box('kWh', 180, 104, 28, 16),
    ];
    const r = parseMeterReadingFromBoxes(boxes, 'electricity');
    expect(r.raw).toBe('038421');
    expect(r.reading).toBe(38421);
  });

  it('keeps shorter red tenths digit beside kWh', () => {
    const boxes: OcrBox[] = [
      box('05731', 50, 100, 90, 30),
      box('8', 145, 108, 18, 18), // shorter / slightly lower red window
      box('kWh', 175, 105, 30, 16),
    ];
    const r = parseMeterReadingFromBoxes(boxes, 'electricity');
    expect(r.raw).toMatch(/05731\.?8|057318/);
    expect(r.reading).toBeGreaterThanOrEqual(5731);
  });
});
