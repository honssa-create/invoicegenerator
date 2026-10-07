'use client';

import { useEffect } from 'react';
import { tapProps } from '@/lib/tap-action';
import { formatElapsed, splitHkIso, type PartTimeStaff } from '@/lib/part-time';

type Props = {
  staff: PartTimeStaff;
  now: Date;
  busy: boolean;
  readOnly: boolean;
  error: string;
  onClose: () => void;
  onClockIn: () => void;
  onClockOut: () => void;
};

export default function WorkingDetailModal({
  staff,
  now,
  busy,
  readOnly,
  error,
  onClose,
  onClockIn,
  onClockOut,
}: Props) {
  const working = Boolean(staff.isClockedIn && staff.currentClockInTime);
  const startIso = staff.currentClockInTime || '';
  const start = startIso ? splitHkIso(startIso) : { date: '—', time: '—' };

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center overscroll-none sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="working-detail-title">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Close" {...tapProps(onClose, busy)} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl">
        <h2 id="working-detail-title" className="text-2xl font-semibold text-gray-900">{staff.name}</h2>
        <p className={`mt-1 text-sm font-semibold ${working ? 'text-brand-700' : 'text-gray-500'}`}>
          {working ? '上班中' : '未開工'}
        </p>

        {working ? (
          <dl className="mt-5 grid grid-cols-1 gap-3 text-sm">
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <dt className="text-gray-500">上班時間 / Start</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">{start.time}</dd>
              <dd className="text-sm text-gray-500">{start.date}</dd>
            </div>
            <div className="rounded-xl bg-gray-50 px-4 py-3">
              <dt className="text-gray-500">已返工時長 / Elapsed</dt>
              <dd className="mt-1 text-2xl font-semibold tabular-nums text-gray-900">
                {startIso ? formatElapsed(startIso, now) : '—'}
              </dd>
            </div>
          </dl>
        ) : (
          <p className="mt-5 rounded-xl bg-gray-50 px-4 py-6 text-center text-base text-gray-600">撳下面返工。Tap 返工 to start.</p>
        )}

        {error && <p className="mt-3 text-sm text-red-600" role="alert">{error}</p>}

        <div className="mt-5 grid grid-cols-2 gap-3">
          <button
            type="button"
            className="min-h-14 rounded-xl border border-gray-300 bg-white text-base font-semibold text-gray-800"
            {...tapProps(onClose, busy)}
          >
            返回 / Back
          </button>
          {working ? (
            <button
              type="button"
              disabled={readOnly || busy}
              className="min-h-14 rounded-xl bg-red-600 text-base font-semibold text-white disabled:opacity-40"
              {...tapProps(onClockOut, readOnly || busy)}
            >
              放工
            </button>
          ) : (
            <button
              type="button"
              disabled={readOnly || busy}
              className="min-h-14 rounded-xl bg-brand-600 text-base font-semibold text-white disabled:opacity-40"
              {...tapProps(onClockIn, readOnly || busy)}
            >
              {busy ? '打卡中…' : '返工'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
