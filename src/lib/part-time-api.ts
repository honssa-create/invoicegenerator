import type { AttendanceRecord, AttendanceSummary, PartTimeStaff, RecordQuery, UpdateStaffInput } from './part-time';

/**
 * Browser calls for the part-time module.
 * fetchRecords / createRecord / updateRecord are the swap points for another backend.
 * createRecord is clock-out (it writes one attendance row).
 * updateRecord patches the staff profile (name, hourly rate, kiosk visibility).
 */

export class PartTimeApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = 'PartTimeApiError';
    this.status = status;
  }
}

export interface RecordsResponse {
  records: AttendanceRecord[];
  summary: AttendanceSummary;
  truncated: boolean;
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers || {}),
    },
  });
  const data = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) {
    throw new PartTimeApiError(data.error || 'Request failed', res.status);
  }
  return data;
}

function recordsQuery(query: RecordQuery, format?: 'csv'): string {
  const params = new URLSearchParams();
  if (query.staffId) params.set('staffId', query.staffId);
  if (query.from) params.set('from', query.from);
  if (query.to) params.set('to', query.to);
  if (format) params.set('format', format);
  const text = params.toString();
  return text ? `?${text}` : '';
}

export function fetchStaff(includeInactive = false): Promise<PartTimeStaff[]> {
  const qs = includeInactive ? '?all=1' : '';
  return request<{ staff: PartTimeStaff[] }>(`/api/part-time/staff${qs}`).then((data) => data.staff);
}

export function createStaff(input: { name: string; hourlyRate: number; scheduledHours: number }): Promise<PartTimeStaff> {
  return request<{ staff: PartTimeStaff }>('/api/part-time/staff', {
    method: 'POST',
    body: JSON.stringify(input),
  }).then((data) => data.staff);
}

export function updateRecord(id: string, patch: UpdateStaffInput): Promise<PartTimeStaff> {
  return request<{ staff: PartTimeStaff }>(`/api/part-time/staff/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(patch),
  }).then((data) => data.staff);
}

export function clockIn(staffId: string): Promise<PartTimeStaff> {
  return request<{ staff: PartTimeStaff }>(`/api/part-time/staff/${staffId}/clock-in`, {
    method: 'POST',
  }).then((data) => data.staff);
}

/** Clock-out. Saves the shift and the signature. */
export function createRecord(staffId: string, signatureBase64: string, endedAt: string): Promise<AttendanceRecord> {
  return request<{ record: AttendanceRecord }>(`/api/part-time/staff/${staffId}/clock-out`, {
    method: 'POST',
    body: JSON.stringify({ signatureBase64, endedAt }),
  }).then((data) => data.record);
}

export function fetchRecords(query: RecordQuery = {}): Promise<RecordsResponse> {
  return request<RecordsResponse>(`/api/part-time/records${recordsQuery(query)}`);
}

export function deleteRecord(id: string): Promise<void> {
  return request<{ ok: boolean }>(`/api/part-time/records/${id}`, { method: 'DELETE' }).then(() => undefined);
}

export async function downloadRecordsCsv(query: RecordQuery = {}): Promise<void> {
  const res = await fetch(`/api/part-time/records${recordsQuery(query, 'csv')}`);
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new PartTimeApiError(data.error || 'Export failed', res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'part-time-attendance.csv';
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
