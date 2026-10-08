import db from './db';
import {
  ATTENDANCE_CSV_LIMIT,
  ATTENDANCE_LIST_LIMIT,
  DEFAULT_PART_TIME_STAFF,
  EMPTY_ATTENDANCE_SUMMARY,
  attendanceToCsv,
  calcScheduledPay,
  hkStamp,
  parseHourlyRate,
  parseScheduledHours,
  parseStaffName,
  resolveClockOutEnd,
  splitHkIso,
  type AttendanceRecord,
  type AttendanceSummary,
  type PartTimeStaff,
  type UpdateStaffInput,
} from './part-time';
import { parseSignatureDataUrl } from './part-time-signature';

type StaffRow = {
  id: number;
  name: string;
  hourly_rate: number;
  scheduled_hours: number;
  shift_hours: number | null;
  shift_rate: number | null;
  clocked_in_at: string | null;
  active: number | boolean;
};

type AttendanceRow = {
  id: number;
  staff_id: number;
  staff_name: string;
  work_date: string;
  start_time: string;
  end_time: string;
  start_at: string;
  end_at: string;
  total_hours: number;
  hourly_rate: number;
  total_salary: number;
  created_at: string;
};

type SummaryRow = {
  shift_count: number;
  total_hours: number | null;
  total_salary: number | null;
};

export type PartTimeFailure = { ok: false; error: string; status: number };
export type PartTimeSuccess<T> = { ok: true; data: T };

const STAFF_SQL = `SELECT id, name, hourly_rate, scheduled_hours, shift_hours, shift_rate, clocked_in_at, active
  FROM part_time_staff
  WHERE user_id = ?`;

function toStaff(row: StaffRow): PartTimeStaff {
  const clockedIn = Boolean(row.clocked_in_at);
  const scheduledHours = Number(row.scheduled_hours);
  return {
    id: String(row.id),
    name: row.name,
    hourlyRate: Number(row.hourly_rate),
    scheduledHours: Number.isFinite(scheduledHours) ? scheduledHours : 0,
    isClockedIn: clockedIn,
    currentClockInTime: clockedIn && row.clocked_in_at ? row.clocked_in_at : undefined,
    shiftHours: clockedIn && row.shift_hours != null ? Number(row.shift_hours) : undefined,
    shiftRate: clockedIn && row.shift_rate != null ? Number(row.shift_rate) : undefined,
    active: row.active === true || Number(row.active) === 1,
  };
}

function toRecord(row: AttendanceRow): AttendanceRecord {
  return {
    id: String(row.id),
    staffId: String(row.staff_id),
    staffName: row.staff_name,
    date: row.work_date,
    startTime: row.start_time,
    endTime: row.end_time,
    startDateTime: row.start_at,
    endDateTime: row.end_at,
    totalHours: Number(row.total_hours),
    hourlyRate: Number(row.hourly_rate),
    totalSalary: Number(row.total_salary),
    signatureBase64: '',
    signatureUrl: `/api/part-time/records/${row.id}/signature`,
    createdAt: row.created_at,
  };
}

function isUniqueViolation(err: unknown): boolean {
  if (!err || typeof err !== 'object') return false;
  if ('code' in err && (err as { code?: string }).code === '23505') return true;
  if ('cause' in err) return isUniqueViolation((err as { cause?: unknown }).cause);
  return false;
}

async function selectStaff(ownerId: number, includeInactive: boolean): Promise<StaffRow[]> {
  const sql = includeInactive
    ? `${STAFF_SQL} ORDER BY id`
    : `${STAFF_SQL} AND active = 1 ORDER BY id`;
  return db.prepare(sql).all(ownerId) as Promise<StaffRow[]>;
}

async function seedDefaultStaff(ownerId: number): Promise<void> {
  const defaults = DEFAULT_PART_TIME_STAFF;
  await db.transaction(async () => {
    await db.prepare('SELECT pg_advisory_xact_lock(?, ?)').get(814201, ownerId);
    const existing = await db.prepare('SELECT 1 AS ok FROM part_time_staff WHERE user_id = ? LIMIT 1').get(ownerId);
    if (existing) return;
    await db.prepare(
      `INSERT INTO part_time_staff (user_id, name, hourly_rate, active)
       VALUES (?, ?, ?, 1), (?, ?, ?, 1), (?, ?, ?, 1)`,
    ).run(
      ownerId, defaults[0].name, defaults[0].hourlyRate,
      ownerId, defaults[1].name, defaults[1].hourlyRate,
      ownerId, defaults[2].name, defaults[2].hourlyRate,
    );
  });
}

/** Active staff for the kiosk. Seeds 兼職 A/B/C once per org when the table is empty. */
export async function listStaff(ownerId: number, includeInactive = false): Promise<PartTimeStaff[]> {
  const active = await selectStaff(ownerId, false);
  if (active.length > 0) {
    if (!includeInactive) return active.map(toStaff);
    const all = await selectStaff(ownerId, true);
    return all.map(toStaff);
  }
  const any = await db.prepare('SELECT 1 AS ok FROM part_time_staff WHERE user_id = ? LIMIT 1').get(ownerId);
  if (!any) await seedDefaultStaff(ownerId);
  const rows = await selectStaff(ownerId, includeInactive);
  return rows.map(toStaff);
}

export async function createStaff(
  ownerId: number,
  input: { name: unknown; hourlyRate: unknown; scheduledHours: unknown },
): Promise<PartTimeSuccess<PartTimeStaff> | PartTimeFailure> {
  const name = parseStaffName(input.name);
  if (!name) return { ok: false, error: 'Enter a staff name 請輸入姓名', status: 400 };
  const hourlyRate = parseHourlyRate(input.hourlyRate);
  if (hourlyRate == null) return { ok: false, error: 'Hourly rate must be greater than 0 時薪必須大於 0', status: 400 };
  const scheduledHours = parseScheduledHours(input.scheduledHours);
  if (scheduledHours == null) return { ok: false, error: 'Today’s hours must be greater than 0 and at most 24 今日工時要大於 0，最多 24 小時', status: 400 };
  try {
    const inserted = await db
      .prepare('INSERT INTO part_time_staff (user_id, name, hourly_rate, scheduled_hours, active) VALUES (?, ?, ?, ?, 1)')
      .run(ownerId, name, hourlyRate, scheduledHours);
    const row = await db.prepare(`${STAFF_SQL} AND id = ?`).get(ownerId, inserted.lastInsertRowid) as StaffRow | undefined;
    if (!row) return { ok: false, error: 'Failed to add staff 未能新增員工', status: 500 };
    return { ok: true, data: toStaff(row) };
  } catch (err) {
    if (isUniqueViolation(err)) return { ok: false, error: 'That name is already in use 這個姓名已存在', status: 409 };
    throw err;
  }
}

export async function updateStaff(
  ownerId: number,
  staffId: number,
  patch: UpdateStaffInput,
): Promise<PartTimeSuccess<PartTimeStaff> | PartTimeFailure> {
  return db.transaction(async () => {
    const row = await db
      .prepare(`${STAFF_SQL} AND id = ? FOR UPDATE`)
      .get(ownerId, staffId) as StaffRow | undefined;
    if (!row) return { ok: false, error: 'Staff not found 找不到員工', status: 404 };

    const name = patch.name !== undefined ? parseStaffName(patch.name) : row.name;
    if (!name) return { ok: false, error: 'Enter a staff name 請輸入姓名', status: 400 };
    const hourlyRate = patch.hourlyRate !== undefined ? parseHourlyRate(patch.hourlyRate) : Number(row.hourly_rate);
    if (hourlyRate == null) return { ok: false, error: 'Hourly rate must be greater than 0 時薪必須大於 0', status: 400 };
    const scheduledHours = patch.scheduledHours !== undefined
      ? parseScheduledHours(patch.scheduledHours)
      : Number(row.scheduled_hours);
    if (scheduledHours == null) return { ok: false, error: 'Today’s hours must be greater than 0 and at most 24 今日工時要大於 0，最多 24 小時', status: 400 };

    let active = row.active === true || Number(row.active) === 1 ? 1 : 0;
    if (patch.active !== undefined) {
      active = patch.active ? 1 : 0;
      if (!active && row.clocked_in_at) {
        return { ok: false, error: 'Clock out before hiding this staff 請先收工再停用', status: 409 };
      }
    }

    try {
      await db
        .prepare('UPDATE part_time_staff SET name = ?, hourly_rate = ?, scheduled_hours = ?, active = ? WHERE id = ? AND user_id = ?')
        .run(name, hourlyRate, scheduledHours, active, staffId, ownerId);
    } catch (err) {
      if (isUniqueViolation(err)) return { ok: false, error: 'That name is already in use 這個姓名已存在', status: 409 };
      throw err;
    }

    return {
      ok: true,
      data: toStaff({ ...row, name, hourly_rate: hourlyRate, scheduled_hours: scheduledHours, active }),
    };
  });
}

async function lockStaff(ownerId: number, staffId: number): Promise<StaffRow | undefined> {
  return db
    .prepare(`${STAFF_SQL} AND id = ? FOR UPDATE`)
    .get(ownerId, staffId) as Promise<StaffRow | undefined>;
}

export async function clockIn(
  ownerId: number,
  staffId: number,
  now = new Date(),
): Promise<PartTimeSuccess<PartTimeStaff> | PartTimeFailure> {
  return db.transaction(async () => {
    const row = await lockStaff(ownerId, staffId);
    if (!row || !(row.active === true || Number(row.active) === 1)) {
      return { ok: false, error: 'Staff not found 找不到員工', status: 404 };
    }
    if (row.clocked_in_at) return { ok: false, error: 'Already clocked in 已經返工', status: 409 };
    const scheduledHours = Number(row.scheduled_hours);
    if (!Number.isFinite(scheduledHours) || scheduledHours <= 0) {
      return { ok: false, error: 'Set today’s hours before clock-in 請先設定今日工時', status: 400 };
    }
    const rate = Number(row.hourly_rate);
    const stamp = hkStamp(now);
    await db.prepare(
      'UPDATE part_time_staff SET clocked_in_at = ?, shift_hours = ?, shift_rate = ? WHERE id = ? AND user_id = ?',
    ).run(stamp.iso, scheduledHours, rate, staffId, ownerId);
    return {
      ok: true,
      data: toStaff({ ...row, clocked_in_at: stamp.iso, shift_hours: scheduledHours, shift_rate: rate }),
    };
  });
}

export async function clockOut(
  ownerId: number,
  staffId: number,
  signatureBase64: unknown,
  endedAt?: unknown,
  now = new Date(),
): Promise<PartTimeSuccess<AttendanceRecord> | PartTimeFailure> {
  const signature = parseSignatureDataUrl(signatureBase64);
  if (!signature) return { ok: false, error: 'Signature required 請先簽名', status: 400 };

  return db.transaction(async () => {
    const row = await lockStaff(ownerId, staffId);
    if (!row || !(row.active === true || Number(row.active) === 1)) {
      return { ok: false, error: 'Staff not found 找不到員工', status: 404 };
    }
    if (!row.clocked_in_at) return { ok: false, error: 'Not clocked in 尚未返工', status: 409 };

    const end = resolveClockOutEnd(row.clocked_in_at, endedAt, now);
    const start = splitHkIso(row.clocked_in_at);
    const rate = row.shift_rate != null ? Number(row.shift_rate) : Number(row.hourly_rate);
    const hours = row.shift_hours != null ? Number(row.shift_hours) : Number(row.scheduled_hours);
    const pay = calcScheduledPay(hours, rate);
    const inserted = await db.prepare(
      `INSERT INTO part_time_attendance (
         user_id, staff_id, staff_name, work_date, start_time, end_time,
         start_at, end_at, total_hours, hourly_rate, total_salary, signature_data, created_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).run(
      ownerId,
      staffId,
      row.name,
      start.date,
      start.time,
      end.time,
      row.clocked_in_at,
      end.iso,
      pay.totalHours,
      rate,
      pay.totalSalary,
      signature.dataUrl,
      end.iso,
    );
    await db.prepare(
      'UPDATE part_time_staff SET clocked_in_at = NULL, shift_hours = NULL, shift_rate = NULL WHERE id = ? AND user_id = ?',
    ).run(staffId, ownerId);

    return {
      ok: true,
      data: toRecord({
        id: Number(inserted.lastInsertRowid),
        staff_id: staffId,
        staff_name: row.name,
        work_date: start.date,
        start_time: start.time,
        end_time: end.time,
        start_at: row.clocked_in_at,
        end_at: end.iso,
        total_hours: pay.totalHours,
        hourly_rate: rate,
        total_salary: pay.totalSalary,
        created_at: end.iso,
      }),
    };
  });
}

function attendanceWhere(ownerId: number, staffId: number | null, from: string, to: string): { sql: string; params: unknown[] } {
  const where = ['user_id = ?'];
  const params: unknown[] = [ownerId];
  if (staffId) {
    where.push('staff_id = ?');
    params.push(staffId);
  }
  if (from) {
    where.push('work_date >= ?');
    params.push(from);
  }
  if (to) {
    where.push('work_date <= ?');
    params.push(to);
  }
  return { sql: where.join(' AND '), params };
}

export async function listRecords(
  ownerId: number,
  filter: { staffId: number | null; from: string; to: string },
  opts?: { forCsv?: boolean },
): Promise<{ records: AttendanceRecord[]; summary: AttendanceSummary; truncated: boolean; csv?: string }> {
  const limit = opts?.forCsv ? ATTENDANCE_CSV_LIMIT : ATTENDANCE_LIST_LIMIT;
  const { sql, params } = attendanceWhere(ownerId, filter.staffId, filter.from, filter.to);
  const [rows, summaryRow] = await Promise.all([
    db.prepare(
      `SELECT id, staff_id, staff_name, work_date, start_time, end_time, start_at, end_at,
              total_hours, hourly_rate, total_salary, created_at
       FROM part_time_attendance
       WHERE ${sql}
       ORDER BY work_date DESC, id DESC
       LIMIT ?`,
    ).all(...params, limit + 1) as Promise<AttendanceRow[]>,
    db.prepare(
      `SELECT COUNT(*)::int AS shift_count,
              COALESCE(SUM(total_hours), 0) AS total_hours,
              COALESCE(SUM(total_salary), 0) AS total_salary
       FROM part_time_attendance
       WHERE ${sql}`,
    ).get(...params) as Promise<SummaryRow | undefined>,
  ]);

  const truncated = rows.length > limit;
  const page = truncated ? rows.slice(0, limit) : rows;
  const records = page.map(toRecord);
  const summary: AttendanceSummary = summaryRow
    ? {
        shiftCount: Number(summaryRow.shift_count) || 0,
        totalHours: Number(Number(summaryRow.total_hours || 0).toFixed(2)),
        totalSalary: Number(Number(summaryRow.total_salary || 0).toFixed(1)),
      }
    : EMPTY_ATTENDANCE_SUMMARY;

  return {
    records,
    summary,
    truncated,
    csv: opts?.forCsv ? attendanceToCsv(records) : undefined,
  };
}

export async function readSignaturePng(ownerId: number, recordId: number): Promise<Uint8Array | null> {
  const row = await db
    .prepare('SELECT signature_data FROM part_time_attendance WHERE id = ? AND user_id = ?')
    .get(recordId, ownerId) as { signature_data: string } | undefined;
  if (!row) return null;
  return parseSignatureDataUrl(row.signature_data)?.bytes ?? null;
}

export async function deleteRecord(ownerId: number, recordId: number): Promise<boolean> {
  const result = await db
    .prepare('DELETE FROM part_time_attendance WHERE id = ? AND user_id = ?')
    .run(recordId, ownerId);
  return result.changes > 0;
}
