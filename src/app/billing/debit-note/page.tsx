'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import FormalDebitNoteDocument from '@/components/FormalDebitNoteDocument';
import {
  currentBillingPeriod,
  type DebitNoteMode,
  type FormalDebitNote,
} from '@/lib/rentals';

function DebitNoteContent() {
  const searchParams = useSearchParams();
  const tenantId = searchParams.get('tenantId') || searchParams.get('tenant_id');
  const unitId = searchParams.get('unitId') || searchParams.get('unit_id');
  const unitIds = searchParams.get('unitIds') || searchParams.get('unit_ids');
  const targetPeriod =
    searchParams.get('targetPeriod') ||
    searchParams.get('target_period') ||
    searchParams.get('period') ||
    currentBillingPeriod();
  const mode = (searchParams.get('mode') || 'grouped') as DebitNoteMode;
  const paidLookback = searchParams.get('paid_lookback') || '2';
  const from = searchParams.get('from') || '';

  const [doc, setDoc] = useState<FormalDebitNote | null>(null);
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
      format: 'formal',
    });
    if (unitId) qs.set('unitId', unitId);
    if (unitIds) qs.set('unitIds', unitIds);
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
        if (d?.tenant) setDoc(d);
        else if (!error) setError('Debit note not available');
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [tenantId, unitId, unitIds, targetPeriod, mode, paidLookback, from]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">Loading…</div>;
  }

  if (error || !doc) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 text-gray-500 px-6 text-center">
        <p>{error || 'Debit note unavailable'}</p>
        <Link href="/rentals" className="text-brand-600 text-sm font-medium">← Back to Rentals</Link>
      </div>
    );
  }

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

      <main className="max-w-4xl mx-auto my-8 bg-white p-10 shadow print:shadow-none print:my-0 print:p-8">
        <FormalDebitNoteDocument doc={doc} />
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
