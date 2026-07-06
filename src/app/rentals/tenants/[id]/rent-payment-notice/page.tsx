'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import RentPaymentNoticeMatrixView from '@/components/RentPaymentNoticeMatrix';
import { currentBillingPeriod, formatDisplayDate, formatMoney, type RentPaymentNoticeMatrix } from '@/lib/rentals';

function RentPaymentNoticeContent() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const period = searchParams.get('period') || currentBillingPeriod();
  const from = searchParams.get('from') || period;
  const [matrix, setMatrix] = useState<RentPaymentNoticeMatrix | null>(null);
  const [error, setError] = useState('');
  const [unitHint, setUnitHint] = useState<{ unitId: number; unitName: string; tenantId: number | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    setUnitHint(null);
    fetch(`/api/rentals/tenants/${id}/rent-payment-notice?period=${period}&from=${from}`)
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
        else setError('Tenant not found');
      })
      .catch(async (e) => {
        setError(e instanceof Error ? e.message : 'Failed to load notice');
        const unitRes = await fetch(`/api/rentals/units/${id}?period=${period}`);
        if (unitRes.ok) {
          const unitData = await unitRes.json();
          if (unitData?.unit) {
            setUnitHint({
              unitId: unitData.unit.id,
              unitName: unitData.unit.unitName,
              tenantId: unitData.unit.tenantId ?? null,
            });
          }
        }
      })
      .finally(() => setLoading(false));
  }, [id, period, from]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  }

  if (error || !matrix) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500 px-6 text-center max-w-lg mx-auto">
        <p className="font-medium text-gray-700">繳付租金通知單 unavailable</p>
        <p className="text-sm">{error || 'Tenant not found'}</p>
        {unitHint && (
          <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-4 text-left w-full">
            <p className="text-amber-800">
              <strong>{id}</strong> is a <strong>unit</strong> ({unitHint.unitName}), not a tenant ID.
            </p>
            {unitHint.tenantId ? (
              <Link
                href={`/rentals/units/${unitHint.unitId}/rent-payment-notice?period=${period}&from=${from}`}
                className="text-brand-600 font-medium mt-2 inline-block"
              >
                Open rent payment notice for this unit →
              </Link>
            ) : (
              <p className="text-amber-700 mt-2">Save a tenant name on the unit lease first.</p>
            )}
          </div>
        )}
        <Link href="/rentals" className="text-brand-600 text-sm font-medium">← Back to Rentals</Link>
      </div>
    );
  }

  const { tenant } = matrix;
  const issued = formatDisplayDate(new Date().toISOString().slice(0, 10));

  return (
    <div className="rent-notice-print-root min-h-screen bg-gray-100 print:bg-white">
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center">
        <Link href={`/rentals/tenants/${id}`} className="text-sm text-brand-600 font-medium">← Back to Tenant</Link>
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

        <div className="mt-6 text-xs text-gray-500 print:hidden">
          <p>Document: 繳付租金通知單 Rent Payment Notice · Generated {issued}</p>
        </div>
      </main>
    </div>
  );
}

export default function RentPaymentNoticePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>}>
      <RentPaymentNoticeContent />
    </Suspense>
  );
}
