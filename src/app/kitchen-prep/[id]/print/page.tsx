'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import PrepSummaryTable from '@/components/kitchen-prep/PrepSummaryTable';
import {
  PREP_CAPACITY_LABELS,
  PREP_ORDER_TYPE_LABELS,
  PREP_STATUS_LABELS,
  WEDDING_BUFFER,
  computePrepCalculation,
  formulaSummaryForCapacity,
  type PrepOrder,
} from '@/lib/kitchen-prep';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

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

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <Link href={`/kitchen-prep/${id}`} className="text-sm text-brand-600 hover:text-brand-700 font-medium">← {bi('Back to calculator', '返回計算器')}</Link>
        <button onClick={() => window.print()} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">{BTN.printPdf}</button>
      </div>

      <div className="max-w-5xl mx-auto my-8 bg-white shadow-lg print:shadow-none print:my-0 print:max-w-none">
        <div className="p-8 print:p-6 prep-print-sheet">
          <div className="flex justify-between items-start border-b-4 border-brand-600 pb-5 mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 leading-tight">{TITLE.kitchenPrepSheet}</h1>
              <p className="text-base text-gray-600 mt-1">{bi('Kitchen Summary', '廚房總結')}</p>
            </div>
            <div className="text-right">
              <p className="text-xl font-bold font-mono text-brand-700">{order.order_code}</p>
              <p className="text-sm text-gray-500 mt-1">{bi('Printed', '列印時間')} {new Date().toLocaleString('en-HK')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6 text-[15px] leading-snug">
            <div><span className="text-gray-500">Stewing Date 燉製日期：</span><strong>{order.stewing_date}</strong></div>
            <div><span className="text-gray-500">Order Type：</span><strong>{PREP_ORDER_TYPE_LABELS[order.order_type]}</strong></div>
            <div><span className="text-gray-500">容量 Capacity：</span><strong>{PREP_CAPACITY_LABELS[order.capacity]}</strong></div>
            <div><span className="text-gray-500">Status：</span><strong>{PREP_STATUS_LABELS[order.status]}</strong></div>
          </div>

          {order.order_type === 'wedding' && (
            <p className="mb-4 text-[15px] font-medium text-brand-800 bg-brand-50 px-4 py-2 rounded">
              Wedding buffer applied: +{WEDDING_BUFFER} bottles per flavor (回禮訂單 +3 樽)
            </p>
          )}

          <p className="mb-4 text-sm text-gray-600">{formulaSummaryForCapacity(order.capacity)}</p>

          {!calc.formulaReady ? (
            <p className="text-amber-800 bg-amber-50 p-4 rounded text-[15px]">
              {PREP_CAPACITY_LABELS[order.capacity]} formula pending configuration (25g and 45g are ready).
            </p>
          ) : (
            <PrepSummaryTable calc={calc} capacity={order.capacity} variant="print" />
          )}

          {order.notes && (
            <div className="mt-6 pt-4 border-t border-gray-200">
              <p className="text-xs text-gray-500 uppercase">Notes</p>
              <p className="text-[15px] mt-1">{order.notes}</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
