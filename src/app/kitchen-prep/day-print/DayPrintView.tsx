'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  PREP_SCHEDULE_SLOT_LABELS,
  capacityScheduleTag,
  formatPrepMaterialAmount,
  summarizeDayMaterials,
  type DayMaterialsSummary,
  type PrepOrder,
  type StewFormulaMapLike,
} from '@/lib/kitchen-prep';
import { BTN, bi } from '@/lib/ui-labels';

function slotLabel(slot: DayMaterialsSummary['orders'][number]['scheduleSlot']): string {
  if (slot === 'AM' || slot === 'PM') return PREP_SCHEDULE_SLOT_LABELS[slot];
  return '未設定';
}

export default function KitchenPrepDayPrint() {
  const searchParams = useSearchParams();
  const date = searchParams.get('date') || '';
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const [summary, setSummary] = useState<DayMaterialsSummary | null>(null);
  const [error, setError] = useState('');
  const [printedAt] = useState(() => new Date().toLocaleString('en-HK'));

  useEffect(() => {
    if (!validDate) {
      setSummary(null);
      setError(bi('Choose a stewing date to print day materials.', '請選擇燉製日期以列印全日材料。'));
      return;
    }
    let cancelled = false;
    setError('');
    setSummary(null);
    (async () => {
      const res = await fetch(`/api/kitchen-prep?dateStart=${date}&dateEnd=${date}`);
      if (!res.ok) throw new Error('load');
      const data = await res.json();
      const orders = (data.orders || []) as PrepOrder[];
      let formulas: StewFormulaMapLike | undefined;
      const firstId = orders[0]?.id;
      if (firstId) {
        const detailRes = await fetch(`/api/kitchen-prep/${firstId}`);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          formulas = detail.stewFormulas as StewFormulaMapLike | undefined;
        }
      }
      if (cancelled) return;
      setSummary(formulas ? summarizeDayMaterials(orders, formulas) : summarizeDayMaterials(orders));
    })().catch(() => {
      if (!cancelled) setError(bi('Failed to load day materials.', '讀取全日材料失敗。'));
    });
    return () => {
      cancelled = true;
    };
  }, [date, validDate]);

  const handlePrint = () => {
    if (!summary?.lines.length) return;
    window.print();
  };

  return (
    <div className="prep-print-root min-h-screen bg-gray-100 print:bg-white">
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 0;
          }
        }
      `}</style>
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-3">
        <div>
          <Link href="/kitchen-prep" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            ← {bi('Back to schedule', '返回排程')}
          </Link>
          {validDate && (
            <p className="text-sm text-gray-600 mt-1">
              {date} · {bi('Day materials total', '全日材料合計')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handlePrint}
          disabled={!summary?.lines.length}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {BTN.printPdf}
        </button>
      </div>

      {error && (
        <div className="no-print max-w-3xl mx-auto mt-6 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
      )}

      {summary === null && !error && (
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      )}

      {summary && (
        <div className="prep-print-page max-w-[297mm] mx-auto my-8 bg-white shadow-lg print:shadow-none print:my-0 print:max-w-none">
          <div className="p-8 print:p-6 prep-print-sheet">
            <div className="flex justify-between items-start border-b-4 border-stone-800 pb-5 mb-6 print:pb-3 print:mb-4">
              <div>
                <h1 className="text-2xl print:text-xl font-bold text-gray-900 leading-tight">
                  {bi('Day materials', '全日材料')}
                </h1>
                <p className="text-base print:text-sm text-gray-600 mt-1">
                  {summary.stewingDate || date} · AM + PM + {bi('unset', '未設定')}
                </p>
              </div>
              <div className="text-right">
                <p className="text-sm print:text-xs text-gray-500">{bi('Printed', '列印時間')} {printedAt}</p>
                <p className="text-sm print:text-xs text-gray-500 mt-1">
                  {bi(`${summary.orders.length} order(s)`, `${summary.orders.length} 張`)}
                </p>
              </div>
            </div>

            <p className="mb-4 print:mb-3 text-sm print:text-xs text-gray-600">
              {bi(
                'One combined total for this stewing date. Grams follow each sheet’s order quantity (今次), across morning, afternoon, and unset.',
                '這是該燉製日的一份合計。克數跟各張備料單的今次訂單數量，包含上午、下午與未設定。',
              )}
            </p>

            <div className="flex flex-wrap gap-2 mb-6 print:mb-4 text-sm print:text-xs">
              <span className="px-3 py-1 rounded-full bg-sky-100 text-sky-800 font-semibold">
                {bi('AM', '上午')} {summary.slotBottles.AM}
              </span>
              <span className="px-3 py-1 rounded-full bg-violet-100 text-violet-800 font-semibold">
                {bi('PM', '下午')} {summary.slotBottles.PM}
              </span>
              <span className="px-3 py-1 rounded-full bg-gray-100 text-gray-700 font-semibold">
                {bi('Unset', '未設定')} {summary.slotBottles.unset}
              </span>
            </div>

            {summary.lines.length === 0 ? (
              <p className="text-gray-500 text-sm">{bi('No prep orders on this date.', '這天沒有備料單。')}</p>
            ) : (
              <div className="overflow-x-auto prep-print-table-wrap">
                <table className="w-full border-collapse text-sm print:text-xs">
                  <thead>
                    <tr className="bg-stone-800 text-white text-left">
                      <th className="px-3 py-2">{bi('Capacity', '容量')}</th>
                      <th className="px-3 py-2">{bi('Flavor', '口味')}</th>
                      <th className="px-3 py-2 text-right">{bi('Bottles', '樽')}</th>
                      <th className="px-3 py-2 text-right">{bi('Bird nest g', '燕餅 g')}</th>
                      <th className="px-3 py-2 text-right">{bi('Osmanthus g', '桂花 g')}</th>
                      <th className="px-3 py-2 text-right">{bi('Red date g', '紅棗 g')}</th>
                      <th className="px-3 py-2 text-right">{bi('Rock sugar g', '冰糖 g')}</th>
                      <th className="px-3 py-2 text-right">{bi('Slab sugar g', '片糖 g')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.lines.map((line) => (
                      <tr key={`${line.capacity}:${line.flavor}`} className="border-b border-gray-200">
                        <td className="px-3 py-2 font-semibold">{capacityScheduleTag(line.capacity)}</td>
                        <td className="px-3 py-2">{line.label}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{line.bottles}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPrepMaterialAmount(line.birdNest)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPrepMaterialAmount(line.osmanthus)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPrepMaterialAmount(line.redDate)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPrepMaterialAmount(line.rockSugar)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{formatPrepMaterialAmount(line.slabSugar)}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="bg-[#f7f3eb] font-bold">
                      <td className="px-3 py-2" colSpan={2}>{bi('Day total', '全日合計')}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{summary.totals.bottles}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPrepMaterialAmount(summary.totals.birdNest)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPrepMaterialAmount(summary.totals.osmanthus)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPrepMaterialAmount(summary.totals.redDate)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPrepMaterialAmount(summary.totals.rockSugar)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{formatPrepMaterialAmount(summary.totals.slabSugar)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}

            {summary.orders.length > 0 && (
              <div className="mt-6 print:mt-4">
                <p className="text-xs uppercase tracking-wider text-gray-500 mb-2">{bi('Included orders', '包含訂單')}</p>
                <ul className="text-sm print:text-xs text-gray-700 space-y-1">
                  {summary.orders.map((order) => (
                    <li key={`${order.id}-${order.orderCode}`}>
                      <span className="font-mono font-semibold">{order.orderCode || `#${order.id}`}</span>
                      {' · '}
                      {slotLabel(order.scheduleSlot)}
                      {' · '}
                      {order.bottles} {bi('bottles', '樽')}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
