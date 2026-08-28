'use client';

import type { ReactNode } from 'react';
import {
  NESTIEE_DEMAND_SCOPES,
  type NestieeDemandScope,
  type NestieeProcessingDemand,
} from '@/lib/nestiee-order-demand';
import { bi } from '@/lib/ui-labels';

const SCOPE_LABELS: Record<NestieeDemandScope, { en: string; zh: string }> = {
  processing: { en: 'Processing', zh: '處理中' },
  shipped: { en: 'Shipped', zh: '已出貨' },
  all: { en: 'All', zh: '全部' },
};

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

function orderCountLabel(scope: NestieeDemandScope, count: number): string {
  if (scope === 'processing') {
    return bi(`${count} processing order(s)`, `${count} 張處理中訂單`);
  }
  if (scope === 'shipped') {
    return bi(`${count} shipped order(s)`, `${count} 張已出貨訂單`);
  }
  return bi(`${count} related order(s)`, `${count} 張相關訂單`);
}

function emptyGiftBoxMessage(scope: NestieeDemandScope): string {
  if (scope === 'processing') {
    return bi(
      'No 所需禮盒 quantities entered on processing orders yet.',
      '處理中訂單尚未填寫所需禮盒數量。',
    );
  }
  if (scope === 'shipped') {
    return bi(
      'No 所需禮盒 quantities entered on shipped orders in this range.',
      '所選範圍內的已出貨訂單尚未填寫所需禮盒數量。',
    );
  }
  return bi(
    'No 所需禮盒 quantities entered for orders in this range.',
    '所選範圍內尚未填寫所需禮盒數量。',
  );
}

export default function NestieeProcessingDashboard({
  demand,
  scope,
  onScopeChange,
  loading,
}: {
  demand: NestieeProcessingDemand;
  scope: NestieeDemandScope;
  onScopeChange: (scope: NestieeDemandScope) => void;
  loading?: boolean;
}) {
  const giftBoxes = demand.giftBoxes.filter((g) => loading || g.qty > 0);
  const bottles = demand.bottles.filter((b) => loading || b.qty > 0);
  const hasDemand = giftBoxes.some((g) => g.qty > 0) || bottles.some((b) => b.qty > 0);

  return (
    <div className="mb-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-xs text-gray-500">
          {loading
            ? bi('Loading production totals…', '載入生產需求中…')
            : orderCountLabel(scope, demand.orderCount)}
        </p>
        <div
          className="inline-flex rounded-lg border border-[#C8B07A] bg-[#F7F2E8] p-0.5 text-sm self-start sm:self-auto"
          role="group"
          aria-label={bi('Production demand scope', '生產需求範圍')}
        >
          {NESTIEE_DEMAND_SCOPES.map((option) => {
            const active = scope === option;
            const label = SCOPE_LABELS[option];
            return (
              <button
                key={option}
                type="button"
                onClick={() => onScopeChange(option)}
                disabled={loading}
                className={`px-3 py-1.5 rounded-md transition-colors font-medium disabled:opacity-50 ${
                  active
                    ? 'bg-[#C8B07A] text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900 hover:bg-white/60'
                }`}
              >
                {bi(label.en, label.zh)}
              </button>
            );
          })}
        </div>
      </div>

      {!loading && demand.orderCount > 0 && !hasDemand && (
        <p className="text-sm text-gray-500">{emptyGiftBoxMessage(scope)}</p>
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
