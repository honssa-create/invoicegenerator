'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import PrepPrintSheet from '@/components/kitchen-prep/PrepPrintSheet';
import type { PrepBatchView, PrepCalculation, PrepOrder, StewFormulaMapLike } from '@/lib/kitchen-prep';
import { BTN, bi } from '@/lib/ui-labels';

export default function KitchenPrepPrintPage() {
  const { id } = useParams();
  const [order, setOrder] = useState<PrepOrder | null>(null);
  const [calc, setCalc] = useState<PrepCalculation | null>(null);
  const [batch, setBatch] = useState<PrepBatchView | null>(null);
  const [stewFormulas, setStewFormulas] = useState<StewFormulaMapLike | undefined>(undefined);
  const [loggingPrint, setLoggingPrint] = useState(false);
  const [printedAt] = useState(() => new Date().toLocaleString('en-HK'));

  useEffect(() => {
    fetch(`/api/kitchen-prep/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.order) return;
        setOrder(d.order);
        setCalc(d.calculation ?? null);
        setBatch(d.batch ?? null);
        setStewFormulas(d.stewFormulas);
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

      <PrepPrintSheet
        order={order}
        calc={calc}
        batch={batch}
        stewFormulas={stewFormulas}
        printedAt={printedAt}
      />
    </div>
  );
}
