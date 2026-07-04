'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  PREP_CAPACITY_LABELS,
  PREP_ORDER_TYPE_LABELS,
  PREP_STATUS_LABELS,
  WEDDING_BUFFER,
  computePrepCalculation,
  formatGrams,
  type PrepOrder,
} from '@/lib/kitchen-prep';

export default function KitchenPrepPrintPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<PrepOrder | null>(null);

  useEffect(() => {
    fetch(`/api/kitchen-prep/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d?.order && setOrder(d.order));
  }, [id]);

  if (!order) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;
  }

  const calc = computePrepCalculation(order.capacity, order.order_type, {
    osmanthus: order.qty_osmanthus,
    red_date: order.qty_red_date,
    rock_sugar: order.qty_rock_sugar,
  });
  const activeRows = calc.rows.filter((r) => r.orderQty > 0);

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <Link href={`/kitchen-prep/${id}`} className="text-sm text-brand-600 hover:text-brand-700 font-medium">← Back to calculator</Link>
        <button onClick={() => window.print()} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">Print / Save as PDF</button>
      </div>

      <div className="max-w-4xl mx-auto my-8 bg-white shadow-lg print:shadow-none print:my-0">
        <div className="p-10 print:p-8">
          <div className="flex justify-between items-start border-b-4 border-brand-600 pb-6 mb-8">
            <div>
              <h1 className="text-4xl font-bold text-gray-900">KITCHEN PREP SHEET</h1>
              <p className="text-xl text-gray-600 mt-1">廚房備料單</p>
            </div>
            <div className="text-right">
              <p className="text-2xl font-bold font-mono text-brand-700">{order.order_code}</p>
              <p className="text-sm text-gray-500 mt-1">Printed {new Date().toLocaleString('en-HK')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8 text-sm">
            <div><span className="text-gray-500">Stewing Date 燉製日期：</span><strong className="text-lg">{order.stewing_date}</strong></div>
            <div><span className="text-gray-500">Order Type：</span><strong>{PREP_ORDER_TYPE_LABELS[order.order_type]}</strong></div>
            <div><span className="text-gray-500">Capacity 容量：</span><strong>{PREP_CAPACITY_LABELS[order.capacity]}</strong></div>
            <div><span className="text-gray-500">Status：</span><strong>{PREP_STATUS_LABELS[order.status]}</strong></div>
          </div>

          {order.order_type === 'wedding' && (
            <p className="mb-6 text-sm font-medium text-brand-800 bg-brand-50 px-4 py-2 rounded">Wedding buffer applied: +{WEDDING_BUFFER} bottles per flavor (回禮訂單 +3 樽)</p>
          )}

          {!calc.formulaReady ? (
            <p className="text-amber-800 bg-amber-50 p-4 rounded">45g formula only — {PREP_CAPACITY_LABELS[order.capacity]} weights pending configuration.</p>
          ) : (
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-gray-900 text-white">
                  <th className="px-4 py-3 text-left text-sm">Flavor 口味</th>
                  <th className="px-4 py-3 text-right text-sm">Order</th>
                  <th className="px-4 py-3 text-right text-sm">Actual 實際樽數</th>
                  <th className="px-4 py-3 text-right text-sm">燕餅</th>
                  <th className="px-4 py-3 text-right text-sm">Flavor 材料</th>
                  <th className="px-4 py-3 text-right text-sm">冰糖</th>
                  <th className="px-4 py-3 text-right text-sm">片糖</th>
                </tr>
              </thead>
              <tbody>
                {activeRows.map((r) => (
                  <tr key={r.flavor} className="border-b border-gray-200">
                    <td className="px-4 py-5 text-xl font-bold">{r.label}</td>
                    <td className="px-4 py-5 text-right text-xl">{r.orderQty}</td>
                    <td className="px-4 py-5 text-right text-3xl font-bold">{r.actualQty}</td>
                    <td className="px-4 py-5 text-right text-2xl font-bold">{formatGrams(r.birdNestGrams)}</td>
                    <td className="px-4 py-5 text-right text-2xl font-bold">{formatGrams(r.flavorGrams)}</td>
                    <td className="px-4 py-5 text-right text-xl">{formatGrams(r.rockSugarGrams)}</td>
                    <td className="px-4 py-5 text-right text-xl">{formatGrams(r.slabSugarGrams)}</td>
                  </tr>
                ))}
              </tbody>
              {activeRows.length > 0 && (
                <tfoot>
                  <tr className="bg-gray-100 font-bold">
                    <td className="px-4 py-4 text-lg">TOTAL</td>
                    <td className="px-4 py-4" />
                    <td className="px-4 py-4 text-right text-2xl">{calc.totals.bottles}</td>
                    <td className="px-4 py-4 text-right text-xl">{formatGrams(calc.totals.birdNestGrams)}</td>
                    <td className="px-4 py-4" />
                    <td className="px-4 py-4 text-right text-xl">{formatGrams(calc.totals.rockSugarGrams)}</td>
                    <td className="px-4 py-4 text-right text-xl">{formatGrams(calc.totals.slabSugarGrams)}</td>
                  </tr>
                </tfoot>
              )}
            </table>
          )}

          {order.notes && (
            <div className="mt-8 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 uppercase">Notes</p>
              <p className="text-sm mt-1">{order.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
