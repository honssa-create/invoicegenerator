'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  NESTIEE_SHIPPING_BOX_SLOTS,
  shippingBoxDisplayLabel,
  DEMAND_FORECAST_DATE_FILTER_LABELS,
  type DemandForecastDateFilterType,
  type ShippingBoxForecastRow,
} from '@/lib/demand-forecast';
import { ForecastCard, shortfallClass } from './forecast-ui';

function bi(en: string, zh: string): string {
  return `${en} / ${zh}`;
}

interface Props {
  dateStart: string;
  dateEnd: string;
  dateFilterType: DemandForecastDateFilterType;
}

export default function ShippingBoxesForecast({ dateStart, dateEnd, dateFilterType }: Props) {
  const [rows, setRows] = useState<ShippingBoxForecastRow[]>([]);
  const [orderCountNeed, setOrderCountNeed] = useState(0);
  const [orderCountUsed, setOrderCountUsed] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    const params = new URLSearchParams();
    if (dateStart) params.set('dateStart', dateStart);
    if (dateEnd) params.set('dateEnd', dateEnd);
    params.set('dateFilterType', dateFilterType);
    fetch(`/api/demand-forecast/shipping-boxes?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (Array.isArray(d?.rows)) setRows(d.rows);
        if (typeof d?.orderCountNeed === 'number') setOrderCountNeed(d.orderCountNeed);
        if (typeof d?.orderCountUsed === 'number') setOrderCountUsed(d.orderCountUsed);
      })
      .catch(() => {
        /* keep previous */
      })
      .finally(() => setLoading(false));
  }, [dateStart, dateEnd, dateFilterType]);

  useEffect(() => {
    load();
  }, [load]);

  const displayRows = rows.length > 0
    ? rows
    : NESTIEE_SHIPPING_BOX_SLOTS.map((slot) => ({
        id: slot.id,
        label: slot.label,
        stock: 0,
        need: 0,
        used: 0,
      }));

  const totalStock = displayRows.reduce((sum, r) => sum + r.stock, 0);
  const totalNeed = displayRows.reduce((sum, r) => sum + r.need, 0);
  const totalUsed = displayRows.reduce((sum, r) => sum + r.used, 0);
  const dateBasis = DEMAND_FORECAST_DATE_FILTER_LABELS[dateFilterType];

  return (
    <ForecastCard
      title="Shipping Boxes Forecast"
      titleZh="物流箱預算"
      description={bi(
        'Used = shipped/completed in date range · Need = processing orders · Stock = on hand.',
        '已用 = 日期範圍內已出貨／已完成 · 需要 = 處理中訂單 · 庫存 = 現有數量。',
      )}
      footer={bi(
        'Need counts processing Nestiee orders. Adjust shipping box stock in Kitchen inventory when available.',
        '「需要」為處理中燕窩訂單所需外箱。庫存可在廚房庫存設定。',
      )}
    >
      <p className="text-xs text-gray-500 mb-4">
        {loading
          ? bi('Loading…', '載入中…')
          : bi(
              `${orderCountNeed} processing · ${orderCountUsed} shipped in range (${bi(dateBasis.en, dateBasis.zh)})`,
              `處理中 ${orderCountNeed} 張 · 範圍內已出貨 ${orderCountUsed} 張（${dateBasis.zh}）`,
            )}
      </p>

      <h3 className="text-sm font-medium text-gray-700 mb-2">
        {bi('Shipping boxes (Nestiee)', '物流外箱 (燕窩訂單)')}
      </h3>
      <p className="text-xs text-gray-500 mb-3">
        {bi('Date filter applies to used counts only.', '日期篩選只影響「已用」欄。')}
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[480px]">
          <thead>
            <tr className="text-left text-gray-500 border-b border-gray-200">
              <th className="py-2 pr-2">{bi('Box type', '箱型')}</th>
              <th className="py-2 pr-2 text-right">{bi('Stock', '庫存')}</th>
              <th className="py-2 pr-2 text-right">{bi('Need', '需要')}</th>
              <th className="py-2 text-right">{bi('Used (est.)', '已用（估計）')}</th>
            </tr>
          </thead>
          <tbody>
            {displayRows.map((row) => {
              const slot = NESTIEE_SHIPPING_BOX_SLOTS.find((s) => s.id === row.id);
              const label = slot ? shippingBoxDisplayLabel(slot) : row.label;
              return (
                <tr key={row.id} className="border-b border-gray-50">
                  <td className="py-2 pr-2">{label}</td>
                  <td className="py-2 pr-2 text-right font-medium tabular-nums">
                    {loading ? '—' : row.stock}
                  </td>
                  <td
                    className={`py-2 pr-2 text-right tabular-nums ${
                      loading ? '' : shortfallClass(row.stock, row.need)
                    }`}
                  >
                    {loading ? '—' : row.need}
                  </td>
                  <td className="py-2 text-right font-medium tabular-nums">
                    {loading ? '—' : row.used}
                  </td>
                </tr>
              );
            })}
            <tr className="font-semibold text-gray-900 border-t border-gray-200">
              <td className="py-2 pr-2">{bi('Total', '合計')}</td>
              <td className="py-2 pr-2 text-right tabular-nums">{loading ? '—' : totalStock}</td>
              <td
                className={`py-2 pr-2 text-right tabular-nums ${
                  loading ? '' : shortfallClass(totalStock, totalNeed)
                }`}
              >
                {loading ? '—' : totalNeed}
              </td>
              <td className="py-2 text-right tabular-nums">{loading ? '—' : totalUsed}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {!loading && orderCountUsed === 0 && (dateStart || dateEnd) && (
        <p className="text-sm text-gray-500 mt-3">
          {bi(
            'No shipped/completed Nestiee orders in this date range.',
            '此日期範圍內沒有已出貨／已完成的燕窩訂單。',
          )}
        </p>
      )}
    </ForecastCard>
  );
}
