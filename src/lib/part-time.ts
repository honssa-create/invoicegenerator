import { parseYmd } from './date-ymd';

/** Org part-time staff shown on the iPad kiosk. */
export interface PartTimeStaff {
  id: string;
  name: string;
  hourlyRate: number;
  /** Hours agreed before the shift. Pay uses this, not the clock. */
  scheduledHours: number;
  isClockedIn: boolean;
  /** ISO 8601 with +08:00. Set only while clocked in. */
  currentClockInTime?: string;
  /** Hours confirmed when this shift started. */
  shiftHours?: number;
  /** Rate confirmed when this shift started. */
  shiftRate?: number;
  active: boolean;
}

/** One closed shift. List payloads omit the signature body (`signatureBase64` is empty). */
export interface AttendanceRecord {
  id: string;
  staffId: string;
  staffName: string;
  date: string;
  startTime: string;
  endTime: string;
  startDateTime: string;
  endDateTime: string;
  totalHours: number;
  hourlyRate: number;
  totalSalary: number;
  signatureBase64: string;
  signatureUrl: string;
  createdAt: string;
}

export interface AttendanceSummary {
  shiftCount: number;
  totalHours: number;
  totalSalary: number;
}

export interface RecordQuery {
  staffId?: string;
  from?: string;
  to?: string;
}

export interface UpdateStaffInput {
  name?: string;
  hourlyRate?: number;
  scheduledHours?: number;
  active?: boolean;
}

export const DEFAULT_PART_TIME_STAFF = [
  { name: '兼職 A', hourlyRate: 70 },
  { name: '兼職 B', hourlyRate: 70 },
  { name: '兼職 C', hourlyRate: 70 },
] as const;

export const EMPTY_ATTENDANCE_SUMMARY: AttendanceSummary = {
  shiftCount: 0,
  totalHours: 0,
  totalSalary: 0,
};

/** JSON list cap. CSV export uses a higher cap and never sends signature bytes. */
export const ATTENDANCE_LIST_LIMIT = 500;
export const ATTENDANCE_CSV_LIMIT = 20000;

const HK_TZ = 'Asia/Hong_Kong';

export function hkStamp(now: Date = new Date()): { date: string; time: string; iso: string } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: HK_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    (parts.find((p) => p.type === type)?.value ?? '00').padStart(2, '0');
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  const time = `${get('hour')}:${get('minute')}:${get('second')}`;
  return { date, time, iso: `${date}T${time}+08:00` };
}

export function hkMonthRange(now: Date = new Date()): { from: string; to: string } {
  const date = hkStamp(now).date;
  return { from: `${date.slice(0, 8)}01`, to: date };
}

export function splitHkIso(iso: string): { date: string; time: string } {
  const m = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})/.exec(iso);
  if (!m) return { date: iso.slice(0, 10), time: '00:00:00' };
  return { date: m[1], time: m[2] };
}

/** Pay for a shift whose hours were agreed in advance. Clock times are not used. */
export function calcScheduledPay(hours: number, hourlyRate: number): {
  totalHours: number;
  totalSalary: number;
} {
  if (!Number.isFinite(hours) || !Number.isFinite(hourlyRate) || hours <= 0 || hourlyRate <= 0) {
    return { totalHours: 0, totalSalary: 0 };
  }
  const totalHours = Number(hours.toFixed(2));
  const totalSalary = Number((totalHours * hourlyRate).toFixed(1));
  return { totalHours, totalSalary };
}

const HK_ISO = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2}:\d{2})\+08:00$/;

/**
 * End time frozen when 放工 is tapped. Rejects a missing, early, or future stamp
 * and falls back to the server clock.
 */
export function resolveClockOutEnd(
  startIso: string,
  requestedIso: unknown,
  now: Date = new Date(),
): { date: string; time: string; iso: string } {
  const server = hkStamp(now);
  if (typeof requestedIso !== 'string') return server;
  const match = HK_ISO.exec(requestedIso);
  if (!match) return server;
  const requestedMs = Date.parse(requestedIso);
  const startMs = Date.parse(startIso);
  const serverMs = Date.parse(server.iso);
  if (!Number.isFinite(requestedMs) || !Number.isFinite(startMs) || !Number.isFinite(serverMs)) return server;
  if (requestedMs < startMs) return server;
  if (requestedMs > serverMs + 2 * 60 * 1000) return server;
  return { date: match[1], time: match[2], iso: requestedIso };
}

/** totalHours rounded to 2 decimals; totalSalary = hours × rate, 1 decimal. */
export function calcShiftPay(startIso: string, endIso: string, hourlyRate: number): {
  totalHours: number;
  totalSalary: number;
} {
  const startMs = Date.parse(startIso);
  const endMs = Date.parse(endIso);
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || !Number.isFinite(hourlyRate)) {
    return { totalHours: 0, totalSalary: 0 };
  }
  const totalMinutes = Math.max(0, (endMs - startMs) / (1000 * 60));
  const totalHours = Number((totalMinutes / 60).toFixed(2));
  const totalSalary = Number((totalHours * hourlyRate).toFixed(1));
  return { totalHours, totalSalary };
}

export function formatHours(hours: number): string {
  if (!Number.isFinite(hours)) return '0';
  return String(Number(hours.toFixed(2)));
}

export function formatMoney(amount: number): string {
  if (!Number.isFinite(amount)) return '$0';
  const rounded = Number(amount.toFixed(1));
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return `$${text}`;
}

export function formatElapsed(startIso: string, now: Date): string {
  const startMs = Date.parse(startIso);
  if (!Number.isFinite(startMs)) return '0:00:00';
  const totalSec = Math.max(0, Math.floor((now.getTime() - startMs) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function parseEntityId(value: string): number | null {
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

export function parseStaffName(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const name = value.trim().replace(/\s+/g, ' ');
  if (!name || name.length > 40) return null;
  return name;
}

export function parseScheduledHours(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 24) return null;
  return Number(n.toFixed(2));
}

export function parseHourlyRate(value: unknown): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(n) || n <= 0 || n > 9999) return null;
  return Number(n.toFixed(2));
}

export function parseRecordQuery(search: URLSearchParams):
  | { ok: true; staffId: number | null; from: string; to: string }
  | { ok: false; error: string } {
  const staffRaw = search.get('staffId')?.trim() || '';
  let staffId: number | null = null;
  if (staffRaw) {
    staffId = parseEntityId(staffRaw);
    if (!staffId) return { ok: false, error: 'Invalid staff 員工不正確' };
  }
  const from = search.get('from')?.trim() || '';
  const to = search.get('to')?.trim() || '';
  if (from && !parseYmd(from)) return { ok: false, error: 'Invalid start date 開始日期不正確' };
  if (to && !parseYmd(to)) return { ok: false, error: 'Invalid end date 結束日期不正確' };
  if (from && to && from > to) return { ok: false, error: 'Start date is after end date 開始日期晚於結束日期' };
  return { ok: true, staffId, from, to };
}

function csvCell(value: string | number): string {
  let s = String(value);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function attendanceToCsv(records: AttendanceRecord[]): string {
  const header = ['日期', '員工姓名', '返工時間', '收工時間', '計薪工時', '時薪', '總薪水'];
  const lines = [header.join(',')];
  for (const row of records) {
    lines.push(
      [
        csvCell(row.date),
        csvCell(row.staffName),
        csvCell(row.startTime),
        csvCell(row.endTime),
        csvCell(row.totalHours),
        csvCell(row.hourlyRate),
        csvCell(row.totalSalary),
      ].join(','),
    );
  }
  return `\uFEFF${lines.join('\n')}`;
}
