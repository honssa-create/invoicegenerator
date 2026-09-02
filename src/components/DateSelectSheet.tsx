'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import TapButton, { TapSurface } from '@/components/TapButton';
import { defaultYmdParts, daysInMonth, formatYmd } from '@/lib/date-ymd';
import { BTN, bi } from '@/lib/ui-labels';

/** iOS 15.8 cannot reliably open `<select>` inside position:fixed overlays. */
function Stepper({
  label,
  value,
  onChange,
  min,
  max,
}: {
  label: string;
  value: number;
  onChange: (n: number) => void;
  min: number;
  max: number;
}) {
  const pad = label === bi('Year', '年') ? String(value) : String(value).padStart(2, '0');
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="text-xs font-medium text-gray-500">{label}</div>
      <TapButton
        onTap={() => onChange(Math.min(max, value + 1))}
        disabled={value >= max}
        className="min-h-[48px] w-full rounded-lg border border-gray-300 text-xl font-semibold disabled:opacity-30"
      >
        +
      </TapButton>
      <div className="min-h-[48px] w-full flex items-center justify-center text-xl font-semibold tabular-nums">
        {pad}
      </div>
      <TapButton
        onTap={() => onChange(Math.max(min, value - 1))}
        disabled={value <= min}
        className="min-h-[48px] w-full rounded-lg border border-gray-300 text-xl font-semibold disabled:opacity-30"
      >
        −
      </TapButton>
    </div>
  );
}

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
  const thisYear = new Date().getFullYear();

  useEffect(() => {
    setMounted(true);
  }, []);

  const dim = daysInMonth(year, month);
  const safeDay = Math.min(day, dim);

  if (!mounted || typeof document === 'undefined') return null;

  return createPortal(
    <div className="fixed inset-0 z-[90] flex items-end justify-center p-0 sm:items-center sm:p-4">
      <TapSurface
        onTap={onClose}
        aria-label={BTN.close}
        className="absolute inset-0 bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="relative z-10 w-full max-w-md rounded-t-2xl bg-white p-5 shadow-xl sm:rounded-2xl"
      >
        <h2 className="text-lg font-semibold text-gray-900 mb-4">{title}</h2>
        <div className="grid grid-cols-3 gap-3 mb-5">
          <Stepper
            label={bi('Year', '年')}
            value={year}
            min={thisYear - 8}
            max={thisYear + 3}
            onChange={setYear}
          />
          <Stepper
            label={bi('Month', '月')}
            value={month}
            min={1}
            max={12}
            onChange={setMonth}
          />
          <Stepper
            label={bi('Day', '日')}
            value={safeDay}
            min={1}
            max={dim}
            onChange={setDay}
          />
        </div>
        <div className="flex flex-col gap-2">
          <TapButton
            onTap={() => onApply(formatYmd(year, month, safeDay))}
            className="min-h-[52px] w-full rounded-lg bg-brand-600 text-white text-base font-semibold"
          >
            {BTN.confirm}
          </TapButton>
          <div className="flex gap-2">
            <TapButton
              onTap={() => onApply('')}
              className="min-h-[48px] flex-1 rounded-lg border border-gray-300 text-gray-700"
            >
              {BTN.clear}
            </TapButton>
            <TapButton
              onTap={onClose}
              className="min-h-[48px] flex-1 rounded-lg border border-gray-300 text-gray-700"
            >
              {BTN.cancel}
            </TapButton>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
