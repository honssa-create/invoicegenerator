'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ProductionScheduleSummary } from '@/lib/kitchen-production-schedule';
import { KITCHEN_DAILY_SESSION_LIMIT } from '@/lib/kitchen-production-schedule';
import { bi } from '@/lib/ui-labels';

export default function KitchenProductionSchedule() {
  const [schedule, setSchedule] = useState<ProductionScheduleSummary | null>(null);
  const [orderCount, setOrderCount] = useState(0);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/kitchen/production-schedule')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.schedule) setSchedule(d.schedule);
        if (typeof d?.orderCount === 'number') setOrderCount(d.orderCount);
      })
      .catch(() => {
        /* keep previous */
      })
      .finally(() => setLoading(false));
  }, []);

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
                `${orderCount} unshipped processing order(s)`,
                `${orderCount} 張未出貨處理中訂單`,
              )}
        </p>
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
