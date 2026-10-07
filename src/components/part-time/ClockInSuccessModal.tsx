'use client';

import { useEffect } from 'react';
import { tapProps } from '@/lib/tap-action';
import { splitHkIso, type PartTimeStaff } from '@/lib/part-time';

type Props = {
  staff: PartTimeStaff;
  onClose: () => void;
};

export default function ClockInSuccessModal({ staff, onClose }: Props) {
  const start = staff.currentClockInTime ? splitHkIso(staff.currentClockInTime) : { date: '', time: '' };

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const timer = window.setTimeout(onClose, 4000);
    return () => {
      document.body.style.overflow = previous;
      window.clearTimeout(timer);
    };
    // Mount once so the kiosk clock does not keep resetting this timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center overscroll-none sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="clock-in-success-title">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Close" {...tapProps(onClose)} />
      <div className="relative z-10 w-full max-w-md rounded-t-2xl bg-white px-6 py-8 text-center shadow-xl sm:rounded-2xl">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-brand-600 text-white" aria-hidden="true">
          <svg viewBox="0 0 24 24" className="h-10 w-10" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <h2 id="clock-in-success-title" className="mt-5 text-3xl font-semibold text-gray-900">開工順利</h2>
        <p className="mt-2 text-2xl font-semibold text-gray-900">{staff.name}</p>
        <p className="mt-4 text-sm text-gray-500">上班時間 / Start</p>
        <p className="mt-1 text-4xl font-semibold tabular-nums text-brand-800">{start.time || '—'}</p>
        {start.date && <p className="mt-1 text-sm text-gray-500">{start.date}</p>}
        <button
          type="button"
          className="mt-6 min-h-14 w-full rounded-xl bg-brand-600 text-lg font-semibold text-white"
          {...tapProps(onClose)}
        >
          知道了
        </button>
      </div>
    </div>
  );
}
