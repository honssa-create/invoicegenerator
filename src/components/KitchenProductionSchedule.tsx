'use client';

import { useCallback, useEffect, useState } from 'react';
import DateSelectSheet from '@/components/DateSelectSheet';
import type { ProductionScheduleSummary } from '@/lib/kitchen-production-schedule';
import { KITCHEN_DAILY_SESSION_LIMIT } from '@/lib/kitchen-production-schedule';
import {
  NESTIEE_DATE_FILTER_TYPES,
  type NestieeDateFilterType,
} from '@/lib/nestiee-order-demand';
import { localDateYmd } from '@/lib/orders';
import { tapProps } from '@/lib/tap-action';
import { FILTER, bi } from '@/lib/ui-labels';

const DATE_FILTER_LABELS: Record<NestieeDateFilterType, { en: string; zh: string }> = {
  order_date: { en: 'By order date', zh: '落下單日期' },
  delivery_date: { en: 'By delivery date', zh: '按送貨日期' },
};

function monthStartYmd(): string {
  const today = localDateYmd();
  return `${today.slice(0, 8)}01`;
}

function ScheduleDateField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const fieldCls =
    'w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg text-sm text-left focus:ring-2 focus:ring-brand-500 outline-none';
  return (
    <div className="flex flex-col min-w-0">
      <span className="text-[11px] font-medium text-gray-500 mb-1">{label}</span>
      <button
        type="button"
        className={`${fieldCls} ${value ? 'text-gray-900' : 'text-gray-400'}`}
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

export default function KitchenProductionSchedule() {
  const [dateStart, setDateStart] = useState(monthStartYmd);
  const [dateEnd, setDateEnd] = useState(localDateYmd);
  const [dateFilterType, setDateFilterType] = useState<NestieeDateFilterType>('delivery_date');
  const [schedule, setSchedule] = useState<ProductionScheduleSummary | null>(null);
  const [orderCount, setOrderCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateStart) params.set('dateStart', dateStart);
    if (dateEnd) params.set('dateEnd', dateEnd);
    params.set('dateFilterType', dateFilterType);
    fetch(`/api/kitchen/production-schedule?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.schedule) setSchedule(d.schedule);
        if (typeof d?.orderCount === 'number') setOrderCount(d.orderCount);
      })
      .catch(() => {
        /* keep previous */
      })
      .finally(() => setLoading(false));
  }, [dateStart, dateEnd, dateFilterType]);

  useEffect(() => {
    load();
  }, [load]);

  const totalSessions = schedule?.totalSessions ?? 0;
  const totalDays = schedule?.totalDaysNeeded ?? 0;
  const estDate = schedule?.estimatedCompletionDate ?? '—';

  return (
    <div className="h-full rounded-xl border border-gray-200 bg-white p-5 flex flex-col">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">燕窩生產排程</h2>
        <p className="text-sm text-gray-500 mt-1">
          {loading
            ? bi('Loading…', '載入中…')
            : bi(
                `${orderCount} unshipped processing order(s) in range`,
                `日期範圍內 ${orderCount} 張未出貨處理中訂單`,
              )}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-end gap-3 mb-4">
        <div className="grid grid-cols-2 gap-3 sm:contents">
          <ScheduleDateField label={FILTER.startDate} value={dateStart} onChange={setDateStart} />
          <ScheduleDateField label={FILTER.endDate} value={dateEnd} onChange={setDateEnd} />
        </div>
        <div
          className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-sm self-start"
          role="group"
          aria-label={bi('Date filter basis', '日期篩選基準')}
        >
          {NESTIEE_DATE_FILTER_TYPES.map((option) => {
            const active = dateFilterType === option;
            const label = DATE_FILTER_LABELS[option];
            return (
              <button
                key={option}
                type="button"
                className={`min-h-[44px] px-3 py-2 rounded-md transition-colors font-medium ${
                  active
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                {...tapProps(() => setDateFilterType(option))}
              >
                {bi(label.en, label.zh)}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="min-h-[44px] px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
          {...tapProps(() => {
            setDateStart('');
            setDateEnd('');
          })}
        >
          {bi('Clear dates', '清除日期')}
        </button>
      </div>

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-2">{bi('Product', '產品')}</th>
              <th className="py-2 pr-2 text-right">{bi('Stock', '庫存')}</th>
              <th className="py-2 pr-2 text-right">{bi('Demand', '需求')}</th>
              <th className="py-2 pr-2 text-right">{bi('Shortfall', '尚欠')}</th>
              <th className="py-2 text-right">{bi('Sessions', '所需轉數')}</th>
            </tr>
          </thead>
          <tbody>
            {(schedule?.rows ?? []).map((row) => (
              <tr key={row.flavor} className="border-b border-gray-50">
                <td className="py-2 pr-2 font-medium text-gray-900">{row.product}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{loading ? '—' : row.stock}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{loading ? '—' : row.demand}</td>
                <td className="py-2 pr-2 text-right tabular-nums">{loading ? '—' : row.shortfall}</td>
                <td className="py-2 text-right tabular-nums font-medium">
                  {loading ? '—' : row.sessions == null ? '—' : row.sessions}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-5 rounded-lg bg-[#F7F2E8] border border-[#E8DCC8] px-4 py-4 space-y-2">
        <p className="text-base font-semibold text-gray-900">
          {loading
            ? '—'
            : bi(
                `Total: ${totalSessions} session(s) (≈ ${totalDays} working day(s))`,
                `總共需要: ${totalSessions} 轉 (約 ${totalDays} 個工作日)`,
              )}
        </p>
        <p className="text-base font-semibold text-gray-900">
          {loading
            ? '—'
            : bi(
                `Est. ready date: ${estDate} (Sundays excluded)`,
                `預計全部起貨日: ${estDate} (已略過星期日)`,
              )}
        </p>
      </div>

      <p className="text-xs text-gray-500 mt-3">
        *{bi(
          `Kitchen daily capacity is ${KITCHEN_DAILY_SESSION_LIMIT} sessions. Closed on Sundays.`,
          `廚房每日總產能為 ${KITCHEN_DAILY_SESSION_LIMIT} 轉。星期日休息。`,
        )}
      </p>
    </div>
  );
}
