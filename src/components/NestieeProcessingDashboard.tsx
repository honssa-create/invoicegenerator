'use client';

import type { ReactNode } from 'react';
import type { NestieeProcessingDemand } from '@/lib/nestiee-order-demand';
import { bi } from '@/lib/ui-labels';

function DemandCard({ label, qty, loading }: { label: string; qty: number; loading?: boolean }) {
  return (
    <div className="rounded-xl bg-[#F7F2E8] px-3 py-4 min-h-[5.5rem] flex flex-col items-center justify-center text-center shadow-sm">
      <p className="text-sm sm:text-base font-bold text-gray-900 leading-snug">{label}</p>
      <p className="mt-2 text-2xl sm:text-3xl font-bold tabular-nums text-gray-900">
        {loading ? '—' : qty}
      </p>
    </div>
  );
}

function DemandSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-[#C8B07A] p-4 sm:p-5">
      <h2 className="text-base sm:text-lg font-bold text-gray-900 mb-4">{title}</h2>
      {children}
    </section>
  );
}

export default function NestieeProcessingDashboard({
  demand,
  loading,
}: {
  demand: NestieeProcessingDemand;
  loading?: boolean;
}) {
  const giftBoxes = demand.giftBoxes.filter((g) => loading || g.qty > 0);
  const bottles = demand.bottles.filter((b) => loading || b.qty > 0);
  const hasDemand = giftBoxes.some((g) => g.qty > 0) || bottles.some((b) => b.qty > 0);

  return (
    <div className="mb-6 space-y-4">
      <p className="text-xs text-gray-500">
        {loading
          ? bi('Loading production totals…', '載入生產需求中…')
          : bi(
              `${demand.processingOrderCount} processing order(s)`,
              `${demand.processingOrderCount} 張處理中訂單`,
            )}
      </p>

      {!loading && demand.processingOrderCount > 0 && !hasDemand && (
        <p className="text-sm text-gray-500">
          {bi(
            'No 所需禮盒 quantities entered on processing orders yet.',
            '處理中訂單尚未填寫所需禮盒數量。',
          )}
        </p>
      )}

      <DemandSection title={bi('Gift boxes needed', '訂單所需禮盒')}>
        {giftBoxes.length === 0 && !loading ? (
          <p className="text-sm text-[#F7F2E8]/90">—</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {giftBoxes.map((box) => (
              <DemandCard key={box.id} label={box.label} qty={box.qty} loading={loading} />
            ))}
          </div>
        )}
      </DemandSection>

      <DemandSection title={bi('Finished bottles needed', '訂單所需燕窩樽數')}>
        {bottles.length === 0 && !loading ? (
          <p className="text-sm text-[#F7F2E8]/90">—</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {bottles.map((bottle) => (
              <DemandCard key={bottle.sku} label={bottle.label} qty={bottle.qty} loading={loading} />
            ))}
          </div>
        )}
      </DemandSection>
    </div>
  );
}
