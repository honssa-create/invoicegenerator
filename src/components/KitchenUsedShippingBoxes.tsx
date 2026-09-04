'use client';

import { useCallback, useEffect, useState } from 'react';
import DateSelectSheet from '@/components/DateSelectSheet';
import {
  NESTIEE_DATE_FILTER_TYPES,
  shippingBoxDisplayLabel,
  type NestieeDateFilterType,
  type NestieeUsedShippingBoxesSummary,
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

function UsedDateField({
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

export default function KitchenUsedShippingBoxes() {
  const [dateStart, setDateStart] = useState(monthStartYmd);
  const [dateEnd, setDateEnd] = useState(localDateYmd);
  const [dateFilterType, setDateFilterType] = useState<NestieeDateFilterType>('order_date');
  const [summary, setSummary] = useState<NestieeUsedShippingBoxesSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateStart) params.set('dateStart', dateStart);
    if (dateEnd) params.set('dateEnd', dateEnd);
    params.set('dateFilterType', dateFilterType);
    fetch(`/api/kitchen/used-shipping-boxes?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.summary) setSummary(d.summary);
      })
      .catch(() => {
        /* keep previous */
      })
      .finally(() => setLoading(false));
  }, [dateStart, dateEnd, dateFilterType]);

  useEffect(() => {
    load();
  }, [load]);

  const boxes = summary?.shippingBoxes ?? [];
  const total = boxes.reduce((sum, b) => sum + b.qty, 0);

  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-5">
      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4 mb-4">
        <div>
          <h2 className="font-semibold text-gray-900">
            {bi('Used shipping boxes (Nestiee)', '已用物流箱統計 (燕窩訂單)')}
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            {bi(
              'Shipped / completed Nestiee orders only — estimated outer boxes used in the selected date range.',
              '只計已出貨／已完成燕窩訂單，按日期範圍估計已用外箱。',
            )}
          </p>
        </div>
        <p className="text-xs text-gray-500 shrink-0">
          {loading
            ? bi('Loading…', '載入中…')
            : bi(
                `${summary?.orderCount ?? 0} shipped order(s)`,
                `${summary?.orderCount ?? 0} 張已出貨訂單`,
              )}
        </p>
      </div>

      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-end gap-3 mb-4">
        <div className="grid grid-cols-2 gap-3 sm:contents">
          <UsedDateField label={FILTER.startDate} value={dateStart} onChange={setDateStart} />
          <UsedDateField label={FILTER.endDate} value={dateEnd} onChange={setDateEnd} />
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

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-2">{bi('Box type', '箱型')}</th>
              <th className="py-2 text-right">{bi('Used (est.)', '已用（估計）')}</th>
            </tr>
          </thead>
          <tbody>
            {boxes.map((box) => (
              <tr key={box.id} className="border-b border-gray-50">
                <td className="py-2 pr-2">{shippingBoxDisplayLabel(box)}</td>
                <td className="py-2 text-right font-medium tabular-nums">
                  {loading ? '—' : box.qty}
                </td>
              </tr>
            ))}
            <tr className="font-semibold text-gray-900">
              <td className="py-2 pr-2">{bi('Total', '合計')}</td>
              <td className="py-2 text-right tabular-nums">{loading ? '—' : total}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {!loading && (summary?.orderCount ?? 0) === 0 && (
        <p className="text-sm text-gray-500 mt-3">
          {bi(
            'No shipped/completed Nestiee orders in this date range.',
            '此日期範圍內沒有已出貨／已完成的燕窩訂單。',
          )}
        </p>
      )}
    </div>
  );
}
