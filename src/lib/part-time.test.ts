import { describe, expect, it } from 'vitest';
import {
  attendanceToCsv,
  calcShiftPay,
  formatElapsed,
  formatHours,
  formatMoney,
  hkMonthRange,
  hkStamp,
  parseHourlyRate,
  parseRecordQuery,
  parseStaffName,
  splitHkIso,
  type AttendanceRecord,
} from './part-time';
import { parseSignatureDataUrl } from './part-time-signature';

const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

function record(overrides: Partial<AttendanceRecord> = {}): AttendanceRecord {
  return {
    id: '1',
    staffId: '2',
    staffName: '兼職 A',
    date: '2026-04-07',
    startTime: '09:00:00',
    endTime: '13:30:00',
    startDateTime: '2026-04-07T09:00:00+08:00',
    endDateTime: '2026-04-07T13:30:00+08:00',
    totalHours: 4.5,
    hourlyRate: 70,
    totalSalary: 315,
    signatureBase64: '',
    signatureUrl: '/api/part-time/records/1/signature',
    createdAt: '2026-04-07T13:30:00+08:00',
    ...overrides,
  };
}

describe('calcShiftPay', () => {
  it('rounds 4.5 hours at $70 to $315', () => {
    expect(calcShiftPay('2026-04-07T09:00:00+08:00', '2026-04-07T13:30:00+08:00', 70)).toEqual({
      totalHours: 4.5,
      totalSalary: 315,
    });
  });

  it('rounds minutes to 2 decimal hours and salary to 1 decimal', () => {
    expect(calcShiftPay('2026-04-07T09:00:00+08:00', '2026-04-07T09:08:00+08:00', 70)).toEqual({
      totalHours: 0.13,
      totalSalary: 9.1,
    });
  });

  it('clamps a negative duration to zero', () => {
    expect(calcShiftPay('2026-04-07T13:00:00+08:00', '2026-04-07T09:00:00+08:00', 70)).toEqual({
      totalHours: 0,
      totalSalary: 0,
    });
  });
});

describe('hk time', () => {
  it('formats Hong Kong wall time with a fixed offset', () => {
    const stamp = hkStamp(new Date('2026-04-07T01:00:00.000Z'));
    expect(stamp).toEqual({
      date: '2026-04-07',
      time: '09:00:00',
      iso: '2026-04-07T09:00:00+08:00',
    });
    expect(splitHkIso(stamp.iso)).toEqual({ date: '2026-04-07', time: '09:00:00' });
  });

  it('builds the current Hong Kong month range', () => {
    expect(hkMonthRange(new Date('2026-04-07T01:00:00.000Z'))).toEqual({
      from: '2026-04-01',
      to: '2026-04-07',
    });
  });
});

describe('formatters', () => {
  it('formats hours, money, and elapsed time', () => {
    expect(formatHours(4.5)).toBe('4.5');
    expect(formatMoney(315)).toBe('$315');
    expect(formatMoney(9.1)).toBe('$9.1');
    expect(formatElapsed('2026-04-07T09:00:00+08:00', new Date('2026-04-07T02:30:05.000Z'))).toBe('1:30:05');
  });
});

describe('parsers', () => {
  it('accepts a staff name and hourly rate', () => {
    expect(parseStaffName('  兼職 A  ')).toBe('兼職 A');
    expect(parseStaffName('')).toBeNull();
    expect(parseHourlyRate('70')).toBe(70);
    expect(parseHourlyRate(0)).toBeNull();
  });

  it('rejects an inverted date range', () => {
    const params = new URLSearchParams({ from: '2026-05-02', to: '2026-05-01' });
    expect(parseRecordQuery(params).ok).toBe(false);
  });

  it('accepts a small PNG signature and rejects other types', () => {
    const parsed = parseSignatureDataUrl(TINY_PNG);
    expect(parsed?.bytes[0]).toBe(0x89);
    expect(parseSignatureDataUrl('data:image/jpeg;base64,aaaa')).toBeNull();
    expect(parseSignatureDataUrl('')).toBeNull();
  });
});

describe('attendanceToCsv', () => {
  it('quotes commas and neutralizes spreadsheet formulas', () => {
    const csv = attendanceToCsv([
      record({ staffName: 'A, B' }),
      record({ staffName: '=cmd' }),
    ]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain('"A, B"');
    expect(csv).toContain("'=cmd");
    expect(csv).toContain('315');
  });
});
