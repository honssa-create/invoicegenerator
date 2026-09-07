'use client';

import { useState } from 'react';
import DateSelectSheet from '@/components/DateSelectSheet';
import { tapProps } from '@/lib/tap-action';
import { bi } from '@/lib/ui-labels';

const defaultFieldCls =
  'w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg text-sm text-left focus:ring-2 focus:ring-brand-500 outline-none';

/** Tap-to-open calendar date picker (DateSelectSheet) shared by list filters and kitchen dashboards. */
export default function DateFilterField({
  label,
  value,
  onChange,
  className = defaultFieldCls,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[11px] font-medium text-gray-500 mb-1">{label}</span>
      <button
        type="button"
        className={`${className} ${value ? 'text-gray-900' : 'text-gray-400'}`}
        {...tapProps(() => setOpen(true))}
      >
        {value || bi('Any date', '不限日期')}
      </button>
      {open && (
        <DateSelectSheet
          title={label}
          value={value}
          onApply={(ymd) => {
            onChange(ymd);
            setOpen(false);
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
