'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { categoryLabel, expenseSupplierName, formatMoney } from '@/lib/expenses';
import type { Expense } from '@/lib/types';
import { expenseReceiptUrl } from '@/lib/image-url';

function receiptSrc(receipt: { id: number; path: string }): string {
  const url = expenseReceiptUrl(receipt);
  if (url.startsWith('http')) return url;
  if (typeof window !== 'undefined') return `${window.location.origin}${url}`;
  return url;
}

function ExpenseSummary({ e }: { e: Expense }) {
  return (
    <div className="expense-print-summary">
      <div className="bg-brand-600 text-white px-6 py-4 flex items-center justify-between">
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
  );
}

function ReceiptImage({
  e,
  receipt,
  index,
  extra,
  onReady,
}: {
  e: Expense;
  receipt: { id: number; path: string };
  index: number;
  extra?: boolean;
  onReady: (id: number) => void;
}) {
  return (
    <div className={`expense-print-receipt border border-gray-200 rounded-lg print:rounded-none ${extra ? 'expense-print-receipt--extra' : ''}`}>
      <div className="bg-gray-50 px-3 py-1.5 text-xs font-mono font-semibold text-gray-700 border-b border-gray-200">
        {e.receipt_no || `EXP-${e.id}`} · #{index + 1} — {expenseSupplierName(e)}
      </div>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={receiptSrc(receipt)}
        alt={`Receipt ${e.receipt_no || e.id} #${index + 1}`}
        data-receipt-id={receipt.id}
        loading="eager"
        decoding="sync"
        className="expense-print-receipt-img w-full object-contain max-h-[70vh]"
        onLoad={() => onReady(receipt.id)}
        onError={() => onReady(receipt.id)}
      />
    </div>
  );
}

export default function PrintView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [imagesReady, setImagesReady] = useState<Set<number>>(new Set());

  const idsParam = searchParams.get('ids') || '';
  const ids = idsParam
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const expectedImageIds = useMemo(() => {
    const list: number[] = [];
    for (const e of expenses) {
      for (const r of e.receipts || []) list.push(r.id);
    }
    return list;
  }, [expenses]);

  const allImagesReady =
    expectedImageIds.length === 0 || expectedImageIds.every((id) => imagesReady.has(id));

  const markImageReady = useCallback((id: number) => {
    setImagesReady((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!expectedImageIds.length) return;
    const markCached = () => {
      document.querySelectorAll<HTMLImageElement>('img[data-receipt-id]').forEach((img) => {
        if (img.complete) {
          const id = Number(img.dataset.receiptId);
          if (Number.isFinite(id)) markImageReady(id);
        }
      });
    };
    markCached();
    const t = window.setTimeout(markCached, 300);
    const fallback = window.setTimeout(() => {
      expectedImageIds.forEach((id) => markImageReady(id));
    }, 10000);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(fallback);
    };
  }, [expectedImageIds, markImageReady, expenses]);

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
        setImagesReady(new Set());
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsParam]);

  const handlePrint = () => {
    if (!allImagesReady) return;
    window.print();
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <>
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
            {!allImagesReady && expectedImageIds.length > 0 ? ' · loading images…' : ''}
          </p>
        </div>
        <button
          onClick={handlePrint}
          disabled={!allImagesReady}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          🖨 Print
        </button>
      </div>

      {expenses.length === 0 ? (
        <div className="p-12 text-center text-gray-500">No receipts selected.</div>
      ) : (
        <div className="expense-print-stack max-w-3xl mx-auto p-6 print:p-0">
          {expenses.map((e) => {
            const receipts = e.receipts || [];
            const [firstReceipt, ...extraReceipts] = receipts;

            return (
              <article
                key={e.id}
                className="expense-print-sheet mb-6 print:mb-0 bg-white rounded-xl border border-gray-200 print:border-0 print:rounded-none shadow-sm print:shadow-none"
              >
                <div className="expense-print-page-unit">
                  <ExpenseSummary e={e} />
                  <div className="px-6 pb-6 print:pb-4">
                    {firstReceipt ? (
                      <ReceiptImage e={e} receipt={firstReceipt} index={0} onReady={markImageReady} />
                    ) : (
                      <div className="border border-dashed border-gray-300 rounded-lg p-8 text-center text-gray-400 text-sm">
                        No receipt image uploaded for this expense.
                      </div>
                    )}
                  </div>
                </div>

                {extraReceipts.length > 0 && (
                  <div className="px-6 pb-6 print:pb-4 space-y-4">
                    {extraReceipts.map((r, ri) => (
                      <ReceiptImage
                        key={r.id}
                        e={e}
                        receipt={r}
                        index={ri + 1}
                        extra
                        onReady={markImageReady}
                      />
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
