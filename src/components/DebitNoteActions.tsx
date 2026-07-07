'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { currentBillingPeriod } from '@/lib/rentals';

interface Props {
  tenantId: number;
  unitId: number;
  unitName: string;
  period?: string;
}

export default function DebitNoteActions({ tenantId, unitId, unitName, period }: Props) {
  const targetPeriod = period || currentBillingPeriod();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, []);

  const groupedHref = `/billing/debit-note?tenantId=${tenantId}&targetPeriod=${targetPeriod}&mode=grouped`;
  const singleHref = `/billing/debit-note?tenantId=${tenantId}&unitId=${unitId}&targetPeriod=${targetPeriod}&mode=single`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="px-3 py-2 text-sm bg-brand-600 text-white rounded-lg hover:bg-brand-700 inline-flex items-center gap-1"
      >
        🖨️ 繳費通知單 Debit Note <span className="text-xs opacity-80">▾</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-lg z-20 py-1 text-sm">
          <Link
            href={groupedHref}
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 hover:bg-gray-50 text-gray-800"
          >
            <span className="font-medium">🖨️ Print Grouped Debit Note</span>
            <span className="block text-xs text-gray-500 mt-0.5">All units for this tenant 租客所有單位</span>
          </Link>
          <Link
            href={singleHref}
            onClick={() => setOpen(false)}
            className="block px-4 py-2.5 hover:bg-gray-50 text-gray-800 border-t border-gray-100"
          >
            <span className="font-medium">📄 Print Single Unit Debit Note</span>
            <span className="block text-xs text-gray-500 mt-0.5">{unitName} only 只顯示此單位</span>
          </Link>
        </div>
      )}
    </div>
  );
}
