'use client';

import { useEffect, useState } from 'react';
import { tapProps } from '@/lib/tap-action';
import {
  formatHours,
  formatMoney,
  hkMonthRange,
  type AttendanceRecord,
  type AttendanceSummary,
  type PartTimeStaff,
  type RecordQuery,
} from '@/lib/part-time';
import { BTN } from '@/lib/ui-labels';

type Props = {
  directory: PartTimeStaff[];
  records: AttendanceRecord[];
  summary: AttendanceSummary;
  loading: boolean;
  truncated: boolean;
  readOnly: boolean;
  deletingId: string | null;
  exporting: boolean;
  error: string;
  loadDirectory: () => void;
  loadRecords: (query: RecordQuery) => void;
  onDelete: (id: string) => void;
  onExport: (query: RecordQuery) => void;
};

export default function AdminHistoryView({
  directory,
  records,
  summary,
  loading,
  truncated,
  readOnly,
  deletingId,
  exporting,
  error,
  loadDirectory,
  loadRecords,
  onDelete,
  onExport,
}: Props) {
  const initial = hkMonthRange();
  const [staffId, setStaffId] = useState('');
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [preview, setPreview] = useState<AttendanceRecord | null>(null);
  const query: RecordQuery = { staffId: staffId || undefined, from: from || undefined, to: to || undefined };

  useEffect(() => {
    loadDirectory();
  }, [loadDirectory]);

  useEffect(() => {
    loadRecords({ staffId: staffId || undefined, from: from || undefined, to: to || undefined });
  }, [staffId, from, to, loadRecords]);

  const inputCls = 'w-full rounded-lg border border-gray-300 bg-white px-3 py-3 text-base outline-none focus:ring-2 focus:ring-brand-500';

  return (
    <div>
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="text-sm text-gray-600">
          員工 / Staff
          <select className={`${inputCls} mt-1`} value={staffId} onChange={(event) => setStaffId(event.target.value)}>
            <option value="">全部 / All</option>
            {directory.map((person) => (
              <option key={person.id} value={person.id}>
                {person.name}{person.active ? '' : '（停用）'}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm text-gray-600">
          開始 / Start
          <input className={`${inputCls} mt-1`} type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </label>
        <label className="text-sm text-gray-600">
          結束 / End
          <input className={`${inputCls} mt-1`} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        <button type="button" className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium" {...tapProps(() => {
          const month = hkMonthRange();
          setFrom(month.from);
          setTo(month.to);
        })}>
          本月 / This month
        </button>
        <button type="button" className="min-h-11 rounded-lg border border-gray-300 bg-white px-3 text-sm font-medium" {...tapProps(() => {
          setFrom('');
          setTo('');
          setStaffId('');
        })}>
          {BTN.clearFilters}
        </button>
        <button
          type="button"
          disabled={exporting}
          className="min-h-11 rounded-lg bg-gray-900 px-3 text-sm font-semibold text-white disabled:opacity-40"
          {...tapProps(() => onExport(query), exporting)}
        >
          {exporting ? '匯出中…' : '匯出 CSV / Export CSV'}
        </button>
      </div>

      <p className="mb-3 text-sm text-gray-500">薪金 = 預定工時 × 時薪。返工同放工時間只作紀錄。</p>

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Kpi label="總更次 / Shifts" value={String(summary.shiftCount)} />
        <Kpi label="計薪工時 / Paid hours" value={formatHours(summary.totalHours)} />
        <Kpi label="總薪水 / Salary" value={formatMoney(summary.totalSalary)} />
      </div>

      {error && <p className="mb-3 text-sm text-red-600" role="alert">{error}</p>}
      {truncated && (
        <p className="mb-3 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">
          表格只顯示最近 {records.length} 筆。收窄日期，或用 CSV 匯出完整篩選結果。
        </p>
      )}

      {loading && records.length === 0 ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : records.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-gray-500">這個範圍沒有出勤紀錄。No shifts in this range.</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
          <table className="min-w-[860px] w-full text-left text-sm">
            <thead className="border-b border-gray-200 bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
              <tr>
                <th className="px-3 py-3 font-medium">日期 / Date</th>
                <th className="px-3 py-3 font-medium">員工姓名 / Name</th>
                <th className="px-3 py-3 font-medium">返工時間 / Start</th>
                <th className="px-3 py-3 font-medium">收工時間 / End</th>
                <th className="px-3 py-3 font-medium">計薪工時 / Paid hours</th>
                <th className="px-3 py-3 font-medium">時薪 / Rate</th>
                <th className="px-3 py-3 font-medium">總薪水 / Salary</th>
                <th className="px-3 py-3 font-medium">簽名 / Signature</th>
                <th className="px-3 py-3 font-medium">操作 / Actions</th>
              </tr>
            </thead>
            <tbody>
              {records.map((row) => (
                <tr key={row.id} className="border-b border-gray-100 last:border-0">
                  <td className="whitespace-nowrap px-3 py-3">{row.date}</td>
                  <td className="px-3 py-3 font-medium text-gray-900">{row.staffName}</td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums">{row.startTime}</td>
                  <td className="whitespace-nowrap px-3 py-3 tabular-nums">{row.endTime}</td>
                  <td className="px-3 py-3 tabular-nums">{formatHours(row.totalHours)}</td>
                  <td className="px-3 py-3 tabular-nums">{formatMoney(row.hourlyRate)}</td>
                  <td className="px-3 py-3 tabular-nums">{formatMoney(row.totalSalary)}</td>
                  <td className="px-3 py-3">
                    <button type="button" className="block" {...tapProps(() => setPreview(row))}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={row.signatureUrl}
                        alt={`${row.staffName} signature`}
                        loading="lazy"
                        decoding="async"
                        className="h-12 w-20 rounded border border-gray-200 bg-white object-contain"
                      />
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    {!readOnly && (
                      <button
                        type="button"
                        disabled={deletingId === row.id}
                        className="min-h-10 rounded-lg px-2 text-sm font-medium text-red-600 disabled:opacity-40"
                        {...tapProps(() => onDelete(row.id), deletingId === row.id)}
                      >
                        {deletingId === row.id ? '刪除中…' : '刪除 / Delete'}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {preview && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label="Signature">
          <button type="button" className="absolute inset-0 bg-black/50" aria-label="Close" {...tapProps(() => setPreview(null))} />
          <div className="relative z-10 w-full max-w-lg rounded-2xl bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between gap-3">
              <p className="font-medium text-gray-900">{preview.staffName} · {preview.date}</p>
              <button type="button" className="min-h-10 rounded-lg px-3 text-sm text-gray-600" {...tapProps(() => setPreview(null))}>關閉 / Close</button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={preview.signatureUrl} alt={`${preview.staffName} signature`} className="w-full rounded-xl border border-gray-200 bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-xs text-gray-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{value}</p>
    </div>
  );
}
