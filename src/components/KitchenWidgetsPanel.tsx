'use client';

import { useCallback, useEffect, useState } from 'react';
import DateFilterField from '@/components/DateFilterField';
import KitchenProductionSchedule from '@/components/KitchenProductionSchedule';
import KitchenUsedShippingBoxes from '@/components/KitchenUsedShippingBoxes';
import type { ProductionScheduleSummary } from '@/lib/kitchen-production-schedule';
import {
  NESTIEE_DATE_FILTER_TYPES,
  type NestieeDateFilterType,
  type NestieeUsedShippingBoxesSummary,
} from '@/lib/nestiee-order-demand';
import { tapProps } from '@/lib/tap-action';
import { FILTER, bi } from '@/lib/ui-labels';

const DATE_FILTER_LABELS: Record<NestieeDateFilterType, { en: string; zh: string }> = {
  order_date: { en: 'By order date', zh: '落下單日期' },
  delivery_date: { en: 'By delivery date', zh: '按送貨日期' },
};

type ShippingInventoryRow = {
  boxId: string;
  label: string;
  quantity: number;
  needed: number;
};

export default function KitchenWidgetsPanel() {
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [dateFilterType, setDateFilterType] = useState<NestieeDateFilterType>('delivery_date');
  const [loading, setLoading] = useState(true);
  const [schedule, setSchedule] = useState<ProductionScheduleSummary | null>(null);
  const [scheduleOrderCount, setScheduleOrderCount] = useState(0);
  const [usedSummary, setUsedSummary] = useState<NestieeUsedShippingBoxesSummary | null>(null);
  const [shippingInventory, setShippingInventory] = useState<ShippingInventoryRow[]>([]);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateStart) params.set('dateStart', dateStart);
    if (dateEnd) params.set('dateEnd', dateEnd);
    params.set('dateFilterType', dateFilterType);
    fetch(`/api/kitchen/widgets?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.productionSchedule?.schedule) setSchedule(d.productionSchedule.schedule);
        if (typeof d?.productionSchedule?.orderCount === 'number') {
          setScheduleOrderCount(d.productionSchedule.orderCount);
        }
        if (d?.usedShippingBoxes?.summary) setUsedSummary(d.usedShippingBoxes.summary);
        if (Array.isArray(d?.usedShippingBoxes?.shippingInventory)) {
          setShippingInventory(d.usedShippingBoxes.shippingInventory);
        }
      })
      .catch(() => {
        /* keep previous */
      })
      .finally(() => setLoading(false));
  }, [dateStart, dateEnd, dateFilterType]);

  useEffect(() => {
    load();
  }, [load]);

  const hasDateFilter = Boolean(dateStart || dateEnd);

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3">
        <p className="text-sm font-medium text-gray-700 w-full sm:w-auto">
          {bi('Nestiee date filter (schedule + shipping stats)', '燕窩訂單日期篩選（排程與物流統計）')}
        </p>
        <DateFilterField
          label={FILTER.startDate}
          value={dateStart}
          onChange={setDateStart}
          className="min-w-[9rem]"
        />
        <DateFilterField
          label={FILTER.endDate}
          value={dateEnd}
          onChange={setDateEnd}
          className="min-w-[9rem]"
        />
        <div className="flex flex-wrap gap-2">
          {NESTIEE_DATE_FILTER_TYPES.map((t) => (
            <button
              key={t}
              type="button"
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                dateFilterType === t
                  ? 'bg-brand-600 text-white border-brand-600'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
              {...tapProps(() => setDateFilterType(t))}
            >
              {bi(DATE_FILTER_LABELS[t].en, DATE_FILTER_LABELS[t].zh)}
            </button>
          ))}
        </div>
        {hasDateFilter ? (
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-800 underline"
            {...tapProps(() => {
              setDateStart('');
              setDateEnd('');
            })}
          >
            {bi('Clear dates', '清除日期')}
          </button>
        ) : null}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-stretch">
        <KitchenUsedShippingBoxes
          embedded
          loading={loading}
          dateStart={dateStart}
          dateEnd={dateEnd}
          dateFilterType={dateFilterType}
          summary={usedSummary}
          shippingInventory={shippingInventory}
        />
        <KitchenProductionSchedule
          embedded
          loading={loading}
          dateStart={dateStart}
          dateEnd={dateEnd}
          dateFilterType={dateFilterType}
          schedule={schedule}
          orderCount={scheduleOrderCount}
        />
      </div>
    </div>
  );
}
