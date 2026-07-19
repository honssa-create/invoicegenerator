'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import RentPaymentNoticeMatrixView from '@/components/RentPaymentNoticeMatrix';
import { currentBillingPeriod, formatDisplayDate, formatMoney, type RentPaymentNoticeMatrix } from '@/lib/rentals';
import { BTN, MSG, bi } from '@/lib/ui-labels';

function RentPaymentNoticeContent() {
  const { id } = useParams();
  const searchParams = useSearchParams();
  const period = searchParams.get('target_period') || searchParams.get('period') || currentBillingPeriod();
  const from = searchParams.get('from') || period;
  const paidLookback = searchParams.get('paid_lookback') || '2';
  const [matrix, setMatrix] = useState<RentPaymentNoticeMatrix | null>(null);
  const [error, setError] = useState('');
  const [unitHint, setUnitHint] = useState<{ unitId: number; unitName: string; tenantId: number | null } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    setError('');
    setUnitHint(null);
    fetch(`/api/rentals/tenants/${id}/rent-payment-notice?period=${period}${from && from !== period ? `&from=${from}` : ''}&paid_lookback=${paidLookback}`)
      .then(async (r) => {
        if (r.status === 401) {
          window.location.href = '/login';
          return null;
        }
        const data = await r.json();
        if (!r.ok) throw new Error(data.error || MSG.loadNoticeFailed);
        return data;
      })
      .then((d) => {
        if (d?.tenant) setMatrix(d);
        else setError(bi('Tenant not found', '找不到租客'));
      })
      .catch(async (e) => {
        setError(e instanceof Error ? e.message : MSG.loadNoticeFailed);
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
  }, [id, period, from, paidLookback]);

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center text-gray-400">{BTN.loading}</div>;
  }

  if (error || !matrix) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 text-gray-500 px-6 text-center max-w-lg mx-auto">
        <p className="font-medium text-gray-700">{bi('Rent Payment Notice unavailable', '繳付租金通知單不可用')}</p>
        <p className="text-sm">{error || bi('Tenant not found', '找不到租客')}</p>
        {unitHint && (
          <div className="text-sm bg-amber-50 border border-amber-200 rounded-lg p-4 text-left w-full">
            <p className="text-amber-800">
              <strong>{id}</strong> {bi('is a unit', '是單位')} (<strong>{unitHint.unitName}</strong>), {bi('not a tenant ID', '不是租客 ID')}。
            </p>
            {unitHint.tenantId ? (
              <Link
                href={`/rentals/units/${unitHint.unitId}/rent-payment-notice?period=${period}&from=${from}`}
                className="text-brand-600 font-medium mt-2 inline-block"
              >
                {bi('Open rent payment notice for this unit →', '開啟此單位的繳租通知單 →')}
              </Link>
            ) : (
              <p className="text-amber-700 mt-2">{MSG.saveTenantForNotice}</p>
            )}
          </div>
        )}
        <Link href="/rentals" className="text-brand-600 text-sm font-medium">← {bi('Back to Rentals', '返回租金管理')}</Link>
      </div>
    );
  }

  const { tenant } = matrix;
  const issued = formatDisplayDate(new Date().toISOString().slice(0, 10));

  return (
    <div className="rent-notice-print-root min-h-screen bg-gray-100 print:bg-white">
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex justify-between items-center">
        <Link href={`/rentals/tenants/${id}`} className="text-sm text-brand-600 font-medium">← {bi('Back to Tenant', '返回租客')}</Link>
        <button onClick={() => window.print()} className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg">
          {BTN.printSavePdf}
        </button>
      </div>

      <main className="max-w-5xl mx-auto my-8 bg-white p-10 shadow print:shadow-none print:my-0 print:p-6">
        <div className="border-b-4 border-brand-600 pb-6 mb-8">
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900">
            {bi('Rent Payment Notice', '繳付租金通知單')}
          </h1>
          <p className="text-gray-500 mt-2 text-sm">
            {bi('Target', '目標月份')}: {matrix.targetPeriod} · {bi('Range', '範圍')}: {matrix.fromPeriod} → {matrix.targetPeriod} · {bi('Issued', '發出日期')}: {issued}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <p className="text-gray-400 uppercase text-xs">{bi('Tenant', '租客')}</p>
            <p className="font-semibold text-lg mt-1">{tenant.name}</p>
            {tenant.phone && <p className="text-gray-600">{tenant.phone}</p>}
            <p className="text-gray-600">{tenant.email || '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-gray-400 uppercase text-xs">{bi('Total Outstanding', '應付總額')}</p>
            <p className="text-3xl font-bold text-red-700 mt-1">{formatMoney(matrix.grandTotal)}</p>
          </div>
        </div>

        <RentPaymentNoticeMatrixView matrix={matrix} compact />

        <div className="mt-6 text-xs text-gray-500 print:hidden">
          <p>{bi('Document: Rent Payment Notice · Generated', '文件：繳付租金通知單 · 產生於')} {issued}</p>
        </div>
      </main>
    </div>
  );
}

export default function RentPaymentNoticePage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center text-gray-400">{BTN.loading}</div>}>
      <RentPaymentNoticeContent />
    </Suspense>
  );
}
