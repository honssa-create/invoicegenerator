'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { categoryLabel, expenseSupplierName, formatMoney } from '@/lib/expenses';
import type { Expense } from '@/lib/types';
import { expenseReceiptUrl } from '@/lib/image-url';

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
      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
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
        <div className="max-w-3xl mx-auto p-6 print:p-0 print:max-w-none">
          {expenses.map((e) => (
            <article key={e.id} className="expense-print-sheet mb-6 print:mb-0 bg-white rounded-xl border border-gray-200 print:border-0 print:rounded-none shadow-sm print:shadow-none">
              <div className="expense-print-summary">
                <div className="bg-brand-600 text-white px-6 py-4 print-exact flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider opacity-80">Receipt No.</p>
                    <p className="text-2xl font-bold font-mono">{e.receipt_no || `EXP-${e.id}`}</p>
                  </div>
                  <div className="text-right text-sm">
                    <p className="font-semibold">{expenseSupplierName(e) || 'Unnamed merchant'}</p>
                    <p className="opacity-80">{e.paid_date || '—'}</p>
                  </div>
                </div>

                <div className="px-6 py-4 grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div><span className="text-gray-500">Paid Date (支出日期):</span> {e.paid_date || '—'}</div>
                  <div><span className="text-gray-500">Platform (消費平台):</span> {e.platform || '—'}</div>
                  <div><span className="text-gray-500">Supplier (供應商):</span> {e.merchant || expenseSupplierName(e) || '—'}</div>
                  {e.supplier_input && (
                    <div><span className="text-gray-500">供應商 (input):</span> {e.supplier_input}</div>
                  )}
                  <div><span className="text-gray-500">Reason (支出原因):</span> {categoryLabel(e.category)}</div>
                  <div><span className="text-gray-500">Amount (RMB):</span> {formatMoney(e.amount_rmb, 'CNY')}</div>
                  <div><span className="text-gray-500">Amount (HKD):</span> {formatMoney(e.amount_hkd, 'HKD')}</div>
                  <div><span className="text-gray-500">Payment (支付方式):</span> {e.payment_method || '—'}</div>
                  <div><span className="text-gray-500">Status:</span> <span className="capitalize">{e.payment_status}</span></div>
                  <div><span className="text-gray-500">Order No.:</span> {e.order_no || '—'}</div>
                  {e.notes && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Notes (注意事項):</span> {e.notes}
                    </div>
                  )}
                  {e.special_notes && (
                    <div className="col-span-2">
                      <span className="text-gray-500">Special Notes (特別事項):</span> {e.special_notes}
                    </div>
                  )}
                </div>
              </div>

              <div className="px-6 pb-6 print:pb-4 space-y-4">
                {(e.receipts || []).length ? (
                  (e.receipts || []).map((r, ri) => (
                    <div key={r.id} className="expense-print-receipt border border-gray-200 rounded-lg print:rounded-none">
                      <div className="bg-gray-50 px-3 py-1.5 text-xs font-mono font-semibold text-gray-700 border-b border-gray-200">
                        {e.receipt_no || `EXP-${e.id}`} · #{ri + 1} — {expenseSupplierName(e)}
                      </div>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={expenseReceiptUrl(r)}
                        alt={`Receipt ${e.receipt_no || e.id} #${ri + 1}`}
                        className="w-full object-contain max-h-[70vh] print:max-h-none"
                      />
                    </div>
                  ))
                ) : (
                  <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-400 text-sm">
                    No receipt image uploaded for this expense.
                  </div>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
