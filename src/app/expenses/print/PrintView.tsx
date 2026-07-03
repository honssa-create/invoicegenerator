'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { CATEGORY_LABELS, formatMoney } from '@/lib/expenses';
import type { Expense } from '@/lib/types';

export default function PrintView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const idsParam = searchParams.get('ids') || '';
  const ids = idsParam
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  useEffect(() => {
    fetch('/api/expenses')
      .then((res) => {
        if (res.status === 401) {
          router.push('/login');
          return null;
        }
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        const all: Expense[] = data.expenses || [];
        const byId = new Map(all.map((e) => [e.id, e]));
        setExpenses(ids.map((id) => byId.get(id)).filter((e): e is Expense => Boolean(e)));
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsParam]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      {/* Toolbar — hidden when printing */}
      <div className="print:hidden sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <button
            onClick={() => router.push('/expenses')}
            className="text-sm text-brand-600 hover:text-brand-700 font-medium"
          >
            ← Back to expenses
          </button>
          <p className="text-xs text-gray-500 mt-0.5">
            {expenses.length} receipt{expenses.length === 1 ? '' : 's'} selected for printing
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
        >
          🖨 Print
        </button>
      </div>

      {expenses.length === 0 ? (
        <div className="p-12 text-center text-gray-500">No receipts selected.</div>
      ) : (
        <div className="max-w-3xl mx-auto p-6 print:p-0 space-y-6 print:space-y-0">
          {expenses.map((e, idx) => (
            <div
              key={e.id}
              className={`bg-white rounded-xl border border-gray-200 print:border-0 print:rounded-none overflow-hidden break-inside-avoid ${
                idx < expenses.length - 1 ? 'print:break-after-page' : ''
              }`}
            >
              <div className="bg-brand-600 text-white px-6 py-4 print:bg-brand-600 flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wider opacity-80">Receipt No.</p>
                  <p className="text-2xl font-bold font-mono">{e.receipt_no || `EXP-${e.id}`}</p>
                </div>
                <div className="text-right text-sm">
                  <p className="font-semibold">{e.merchant || 'Unnamed merchant'}</p>
                  <p className="opacity-80">{e.paid_date || '—'}</p>
                </div>
              </div>

              <div className="px-6 py-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                <div><span className="text-gray-500">Category:</span> {CATEGORY_LABELS[e.category] || e.category}</div>
                <div><span className="text-gray-500">Status:</span> <span className="capitalize">{e.payment_status}</span></div>
                <div><span className="text-gray-500">Amount (HKD):</span> {formatMoney(e.amount_hkd, 'HKD')}</div>
                <div><span className="text-gray-500">Amount (RMB):</span> {formatMoney(e.amount_rmb, 'CNY')}</div>
                <div><span className="text-gray-500">Order No.:</span> {e.order_no || '—'}</div>
                <div><span className="text-gray-500">Platform (消費平台):</span> {e.platform || '—'}</div>
                {e.notes && <div className="col-span-2"><span className="text-gray-500">Notes:</span> {e.notes}</div>}
              </div>

              <div className="px-6 pb-6">
                {e.receipt_path ? (
                  <div className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-3 py-1.5 text-xs font-mono font-semibold text-gray-700 border-b border-gray-200">
                      {e.receipt_no || `EXP-${e.id}`} — {e.merchant || ''}
                    </div>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/expenses/${e.id}/receipt`}
                      alt={`Receipt ${e.receipt_no || e.id}`}
                      className="w-full object-contain max-h-[70vh] print:max-h-none"
                    />
                  </div>
                ) : (
                  <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-400 text-sm">
                    No receipt image uploaded for this expense.
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
