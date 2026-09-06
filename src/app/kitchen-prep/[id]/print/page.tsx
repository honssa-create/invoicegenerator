'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import PrepSummaryTable from '@/components/kitchen-prep/PrepSummaryTable';
import {
  PREP_CAPACITY_LABELS,
  PREP_ORDER_TYPE_LABELS,
  PREP_STATUS_LABELS,
  formulaSummaryForCapacity,
  type PrepCalculation,
  type PrepOrder,
} from '@/lib/kitchen-prep';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

export default function KitchenPrepPrintPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<PrepOrder | null>(null);
  const [calc, setCalc] = useState<PrepCalculation | null>(null);
  const [loggingPrint, setLoggingPrint] = useState(false);

  useEffect(() => {
    fetch(`/api/kitchen-prep/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.order) return;
        setOrder(d.order);
        setCalc(d.calculation ?? null);
      });
  }, [id]);

  const handlePrint = async () => {
    if (loggingPrint) return;
    setLoggingPrint(true);
    try {
      await fetch(`/api/kitchen-prep/${id}/print-log`, { method: 'POST' });
    } catch {
      /* still allow print if log fails */
    } finally {
      setLoggingPrint(false);
    }
    window.print();
  };

  if (!order || !calc) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;
  }

  return (
    <div className="prep-print-root min-h-screen bg-gray-100 print:bg-white">
      {/* Dedicated prep print route: landscape A4 (overrides global portrait @page). */}
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 0;
          }
        }
      `}</style>
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <Link href={`/kitchen-prep/${id}`} className="text-sm text-brand-600 hover:text-brand-700 font-medium">← {bi('Back to calculator', '返回計算器')}</Link>
        <button
          type="button"
          onClick={handlePrint}
          disabled={loggingPrint}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {loggingPrint ? bi('Preparing…', '準備中…') : BTN.printPdf}
        </button>
      </div>

      <div className="max-w-[297mm] mx-auto my-8 bg-white shadow-lg print:shadow-none print:my-0 print:max-w-none">
        <div className="p-8 print:p-6 prep-print-sheet">
          <div className="flex justify-between items-start border-b-4 border-brand-600 pb-5 mb-6 print:pb-3 print:mb-4">
            <div>
              <h1 className="text-2xl print:text-xl font-bold text-gray-900 leading-tight">{TITLE.kitchenPrepSheet}</h1>
              <p className="text-base print:text-sm text-gray-600 mt-1">{bi('Kitchen Summary', '廚房總結')}</p>
            </div>
            <div className="text-right">
              <p className="text-xl print:text-lg font-bold font-mono text-brand-700">{order.order_code}</p>
              <p className="text-sm print:text-xs text-gray-500 mt-1">{bi('Printed', '列印時間')} {new Date().toLocaleString('en-HK')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 mb-6 print:mb-4 print:gap-2 text-[15px] print:text-xs leading-snug">
            <div><span className="text-gray-500">Stewing Date 燉製日期：</span><strong>{order.stewing_date}</strong></div>
            <div><span className="text-gray-500">Order Type：</span><strong>{PREP_ORDER_TYPE_LABELS[order.order_type]}</strong></div>
            <div><span className="text-gray-500">容量 Capacity：</span><strong>{PREP_CAPACITY_LABELS[order.capacity]}</strong></div>
            <div><span className="text-gray-500">Status：</span><strong>{PREP_STATUS_LABELS[order.status]}</strong></div>
          </div>

          <p className="mb-4 print:mb-3 text-sm print:text-xs text-gray-600">{formulaSummaryForCapacity(order.capacity)}</p>

          {!calc.formulaReady ? (
            <p className="text-amber-800 bg-amber-50 p-4 rounded text-[15px]">
              Formula for {PREP_CAPACITY_LABELS[order.capacity]} is not configured yet.
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
