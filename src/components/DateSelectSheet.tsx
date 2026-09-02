'use client';

import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { defaultYmdParts, daysInMonth, formatYmd } from '@/lib/date-ymd';
import { tapProps } from '@/lib/tap-action';
import { BTN, bi } from '@/lib/ui-labels';

const selectCls =
  'min-h-[48px] flex-1 rounded-lg border border-gray-300 bg-white px-2 text-base text-gray-900';

export default function DateSelectSheet({
  title,
  value,
  onApply,
  onClose,
}: {
  title: string;
  value: string;
  onApply: (ymd: string) => void;
  onClose: () => void;
}) {
  const initial = defaultYmdParts(value);
  const [year, setYear] = useState(initial.year);
  const [month, setMonth] = useState(initial.month);
  const [day, setDay] = useState(initial.day);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const years = useMemo(() => {
    const y = new Date().getFullYear();
    const out: number[] = [];
    for (let n = y - 8; n <= y + 3; n += 1) out.push(n);
    return out;
  }, []);

  const dim = daysInMonth(year, month);
  const safeDay = Math.min(day, dim);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <button
        type="button"
        aria-label={BTN.close}
        className="absolute inset-0 cursor-pointer"
        {...tapProps(onClose)}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
        <div className="flex gap-2 mb-5">
          <select
            aria-label={bi('Year', '年')}
            className={selectCls}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <select
            aria-label={bi('Month', '月')}
            className={selectCls}
            value={month}
            onChange={(e) => setMonth(Number(e.target.value))}
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>
                {String(m).padStart(2, '0')}
              </option>
            ))}
          </select>
          <select
            aria-label={bi('Day', '日')}
            className={selectCls}
            value={safeDay}
            onChange={(e) => setDay(Number(e.target.value))}
          >
            {Array.from({ length: dim }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                {String(d).padStart(2, '0')}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col-reverse sm:flex-row gap-2">
          <button
            type="button"
            className="min-h-[48px] flex-1 rounded-lg border border-gray-300 text-gray-700"
            {...tapProps(() => onApply(''))}
          >
            {BTN.clear}
          </button>
          <button
            type="button"
            className="min-h-[48px] flex-1 rounded-lg border border-gray-300 text-gray-700"
            {...tapProps(onClose)}
          >
            {BTN.cancel}
          </button>
          <button
            type="button"
            className="min-h-[48px] flex-1 rounded-lg bg-brand-600 text-white font-medium"
            {...tapProps(() => onApply(formatYmd(year, month, safeDay)))}
          >
            {BTN.confirm}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
