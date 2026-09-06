'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  DEMAND_FORECAST_DATE_FILTER_LABELS,
  type DemandForecastDateFilterType,
  type ProductionScheduleRow,
} from '@/lib/demand-forecast';
import { ForecastCard } from './forecast-ui';

function bi(en: string, zh: string): string {
  return `${en} / ${zh}`;
}

interface Props {
  dateStart: string;
  dateEnd: string;
  dateFilterType: DemandForecastDateFilterType;
}

export default function BirdNestProductionSchedule({
  dateStart,
  dateEnd,
  dateFilterType,
}: Props) {
  const [rows, setRows] = useState<ProductionScheduleRow[]>([]);
  const [orderCount, setOrderCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateStart) params.set('dateStart', dateStart);
    if (dateEnd) params.set('dateEnd', dateEnd);
    params.set('dateFilterType', dateFilterType);
    fetch(`/api/demand-forecast/production-schedule?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.rows)) setRows(d.rows);
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

  return (
    <ForecastCard
      title="Bird's Nest Production Schedule"
      titleZh="燕窩生產排程"
      description={bi(
        '75g bottle demand vs finished stock for processing Nestiee orders.',
        '處理中燕窩訂單的 75g 樽裝需求與成品庫存對照。',
      )}
      footer={
        loading
          ? bi('Loading…', '載入中…')
          : bi(
              `${orderCount} processing order(s) · ${bi(
                DEMAND_FORECAST_DATE_FILTER_LABELS[dateFilterType].en,
                DEMAND_FORECAST_DATE_FILTER_LABELS[dateFilterType].zh,
              )}`,
              `範圍內 ${orderCount} 張處理中訂單 · ${DEMAND_FORECAST_DATE_FILTER_LABELS[dateFilterType].zh}`,
            )
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead>
            <tr className="text-left text-xs text-gray-500 uppercase border-b border-gray-200">
              <th className="py-2 pr-3">{bi('Product', '產品')}</th>
              <th className="py-2 pr-3 text-right">{bi('Stock', '庫存')}</th>
              <th className="py-2 pr-3 text-right">{bi('Demand', '需求')}</th>
              <th className="py-2 pr-3 text-right">{bi('Shortfall', '尚欠')}</th>
              <th className="py-2 pr-3 text-right">{bi('Days Needed', '預計所需日數')}</th>
              <th className="py-2 text-right">{bi('Est. Date', '預計完成日')}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {rows.map((row) => (
              <tr key={row.productId}>
                <td className="py-2.5 pr-3 font-medium text-gray-900">{row.product}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{loading ? '—' : row.stock}</td>
                <td className="py-2.5 pr-3 text-right tabular-nums">{loading ? '—' : row.demand}</td>
                <td
                  className={`py-2.5 pr-3 text-right tabular-nums ${
                    loading ? '' : row.shortfall > 0 ? 'text-red-600 font-semibold' : 'text-gray-700'
                  }`}
                >
                  {loading ? '—' : row.shortfall}
                </td>
                <td className="py-2.5 pr-3 text-right tabular-nums text-gray-700">
                  {loading ? '—' : row.daysNeeded ?? '—'}
                </td>
                <td className="py-2.5 text-right tabular-nums text-gray-700">
                  {loading ? '—' : row.estimatedDate ?? '—'}
                </td>
              </tr>
            ))}
            {rows.length === 0 && !loading && (
              <tr>
                <td colSpan={6} className="py-6 text-center text-gray-500 text-sm">
                  {bi('No 75g production rows yet.', '暫無 75g 生產排程資料。')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </ForecastCard>
  );
}
