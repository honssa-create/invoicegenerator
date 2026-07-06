'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import RentPaymentNoticeMatrixView from '@/components/RentPaymentNoticeMatrix';
import {
  currentBillingPeriod,
  formatDisplayDate,
  formatMoney,
  type DebitNoteMode,
  type RentPaymentNoticeMatrix,
} from '@/lib/rentals';

function DebitNoteContent() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenantId') || searchParams.get('tenant_id');
  const unitId = searchParams.get('unitId') || searchParams.get('unit_id');
  const targetPeriod =
    searchParams.get('targetPeriod') ||
    searchParams.get('target_period') ||
    searchParams.get('period') ||
    currentBillingPeriod();
  const mode = (searchParams.get('mode') || 'grouped') as DebitNoteMode;
  const paidLookback = searchParams.get('paid_lookback') || '2';
  const from = searchParams.get('from') || '';

  const [matrix, setMatrix] = useState<RentPaymentNoticeMatrix | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenantId) {
      setError('tenantId is required');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    const qs = new URLSearchParams({
      tenantId,
      targetPeriod,
      mode,
      paid_lookback: paidLookback,
    });
    if (unitId) qs.set('unitId', unitId);
    if (from) qs.set('from', from);

    fetch(`/api/debit-note?${qs}`)
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = '/login';
          return null;
        }
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || 'Failed to load debit note');
        return data;
      })
      .then((d) => {
        if (d?.tenant) setMatrix(d);
        else if (!error) setError('Debit note not available');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tenantId, unitId, targetPeriod, mode, paidLookback, from]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  }

  if (error || !matrix) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-gray-500 px-6 text-center">
        <p>{error || 'Debit note unavailable'}</p>
        <Link href="/rentals" className="text-brand-600 text-sm font-medium">← Back to Rentals</Link>
      </div>
    );
  }

  const issued = formatDisplayDate(new Date().toISOString().slice(0, 10));
  const title = mode === 'single'
    ? `繳費通知單 Debit Note — ${matrix.units[0]?.unitName || 'Single Unit'}`
    : '繳費通知單 Debit Note — All Units 綜合';

  return (
    <div className="rent-notice-print-root min-h-screen bg-gray-100 print:bg-white">
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center">
        <Link href={unitId ? `/rentals/${unitId}` : `/rentals/tenants/${tenantId}`} className="text-sm text-brand-600 font-medium">
          ← Back
        </Link>
        <button onClick={() => window.print()} className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg">
          Print / Save PDF
        </button>
      </div>

      <main className="max-w-5xl mx-auto my-8 bg-white p-10 shadow print:shadow-none print:my-0 print:p-6">
        <div className="border-b-4 border-brand-600 pb-6 mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">{title}</h1>
          <p className="text-gray-500 mt-2 text-sm">
            Target {matrix.targetPeriod} · {matrix.fromPeriod} → {matrix.targetPeriod}
            {mode === 'single' ? ' · Single unit' : ` · ${matrix.units.length} unit(s)`}
            · Issued {issued}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <p className="text-gray-400 uppercase text-xs">Tenant 租客</p>
            <p className="font-semibold text-lg mt-1">{matrix.tenant.name}</p>
            {matrix.tenant.phone && <p className="text-gray-600">{matrix.tenant.phone}</p>}
            <p className="text-gray-600">{matrix.tenant.email || '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 uppercase text-xs">Total Outstanding 應付總額</p>
            <p className="text-3xl font-bold text-red-700 mt-1">{formatMoney(matrix.grandTotal)}</p>
          </div>
        </div>

        <RentPaymentNoticeMatrixView matrix={matrix} compact />
      </main>
    </div>
  );
}

export default function BillingDebitNotePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>}>
      <DebitNoteContent />
    </Suspense>
  );
}
