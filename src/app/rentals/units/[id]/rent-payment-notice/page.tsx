'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import RentPaymentNoticeMatrixView from '@/components/RentPaymentNoticeMatrix';
import { currentBillingPeriod, formatDisplayDate, formatMoney, type RentPaymentNoticeMatrix } from '@/lib/rentals';

type UnitNoticePayload = RentPaymentNoticeMatrix & { tenantId?: number; unitId?: number };

function UnitRentPaymentNoticeContent() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const period = searchParams.get('period') || currentBillingPeriod();
  const from = searchParams.get('from') || period;
  const [matrix, setMatrix] = useState<UnitNoticePayload | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    fetch(`/api/rentals/units/${id}/rent-payment-notice?period=${period}&from=${from}`)
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = '/login';
          return null;
        }
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Failed to load notice');
        return data;
      })
      .then((d) => {
        if (d?.tenant) setMatrix(d);
        else setError('Notice not available');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load notice'))
      .finally(() => setLoading(false));
  }, [id, period, from]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  }

  if (error || !matrix) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-gray-500 px-6 text-center">
        <p>{error || 'Notice not available'}</p>
        <Link href={`/rentals/${id}`} className="text-brand-600 text-sm font-medium">← Back to Unit</Link>
      </div>
    );
  }

  const { tenant } = matrix;
  const issued = formatDisplayDate(new Date().toISOString().slice(0, 10));
  const tenantId = matrix.tenantId ?? tenant.id;

  return (
    <div className="rent-notice-print-root min-h-screen bg-gray-100 print:bg-white">
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center">
        <Link href={`/rentals/${id}`} className="text-sm text-brand-600 font-medium">← Back to Unit</Link>
        <button onClick={() => window.print()} className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg">
          Print / Save PDF
        </button>
      </div>

      <main className="max-w-5xl mx-auto my-8 bg-white p-10 shadow print:shadow-none print:my-0 print:p-6">
        <div className="border-b-4 border-brand-600 pb-6 mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            繳付租金通知單 Rent Payment Notice
          </h1>
          <p className="text-gray-500 mt-2 text-sm">Period 期間: {from} → {period} · Issued 發出日期: {issued}</p>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <p className="text-gray-400 uppercase text-xs">Tenant 租客</p>
            <p className="font-semibold text-lg mt-1">{tenant.name}</p>
            {tenant.phone && <p className="text-gray-600">{tenant.phone}</p>}
            <p className="text-gray-600">{tenant.email || '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 uppercase text-xs">Total Outstanding 應付總額</p>
            <p className="text-3xl font-bold text-red-700 mt-1">{formatMoney(matrix.grandTotal)}</p>
          </div>
        </div>

        <RentPaymentNoticeMatrixView matrix={matrix} compact />

        <div className="mt-10 pt-6 border-t border-gray-200 text-xs text-gray-500 space-y-1">
          <p>「/」= 該月無此費用 · 「—」= 已付清</p>
          <p>Please settle outstanding amounts by the due date. 請於到期日前繳付以上款項。</p>
          {tenantId && (
            <p className="no-print">
              <Link href={`/rentals/tenants/${tenantId}`} className="text-brand-600">Manage tenant ledger →</Link>
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

export default function UnitRentPaymentNoticePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>}>
      <UnitRentPaymentNoticeContent />
    </Suspense>
  );
}
