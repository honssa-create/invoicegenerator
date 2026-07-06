'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { categoryLabel, expenseSupplierName, formatMoney } from '@/lib/expenses';
import type { Expense } from '@/lib/types';
import { expenseReceiptUrl } from '@/lib/image-url';

type PrintPage = {
  key: string;
  expense: Expense;
  receipt?: { id: number; path: string };
  receiptIndex: number;
  receiptCount: number;
  showFullSummary: boolean;
};

function receiptSrc(receipt: { id: number; path: string }): string {
  const url = expenseReceiptUrl(receipt);
  if (url.startsWith('http')) return url;
  if (typeof window !== 'undefined') return `${window.location.origin}${url}`;
  return url;
}

function ExpenseSummary({ e }: { e: Expense }) {
  return (
    <div className="expense-print-summary shrink-0">
      <div className="expense-print-banner bg-brand-600 text-white px-4 py-3 sm:px-6 sm:py-4 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs uppercase tracking-wider opacity-80">Receipt No.</p>
          <p className="text-xl sm:text-2xl font-bold font-mono truncate">{e.receipt_no || `EXP-${e.id}`}</p>
        </div>
        <div className="text-right text-sm shrink-0">
          <p className="font-semibold max-w-[12rem] truncate">{expenseSupplierName(e) || 'Unnamed merchant'}</p>
          <p className="opacity-80">{e.paid_date || '—'}</p>
        </div>
      </div>

      <div className="expense-print-details px-4 py-3 sm:px-6 sm:py-4 grid grid-cols-2 gap-x-4 gap-y-1.5 text-sm">
        <div><span className="text-gray-500">Paid Date (支出日期):</span> {e.paid_date || '—'}</div>
        <div><span className="text-gray-500">Platform (消費平台):</span> {e.platform || '—'}</div>
        <div className="col-span-2 sm:col-span-1"><span className="text-gray-500">Supplier (供應商):</span> {e.merchant || expenseSupplierName(e) || '—'}</div>
        {e.supplier_input && (
          <div className="col-span-2 sm:col-span-1"><span className="text-gray-500">供應商 (input):</span> {e.supplier_input}</div>
        )}
        <div><span className="text-gray-500">Reason (支出原因):</span> {categoryLabel(e.category)}</div>
        <div><span className="text-gray-500">Amount (RMB):</span> {formatMoney(e.amount_rmb, 'CNY')}</div>
        <div><span className="text-gray-500">Amount (HKD):</span> {formatMoney(e.amount_hkd, 'HKD')}</div>
        <div><span className="text-gray-500">Payment (支付方式):</span> {e.payment_method || '—'}</div>
        <div><span className="text-gray-500">Status:</span> <span className="capitalize">{e.payment_status}</span></div>
        {e.order_no && <div><span className="text-gray-500">Order No.:</span> {e.order_no}</div>}
        {e.notes && (
          <div className="col-span-2 expense-print-notes">
            <span className="text-gray-500">Notes (注意事項):</span> {e.notes}
          </div>
        )}
        {e.special_notes && (
          <div className="col-span-2 expense-print-notes">
            <span className="text-gray-500">Special Notes (特別事項):</span> {e.special_notes}
          </div>
        )}
      </div>
    </div>
  );
}

function ExpenseMiniHeader({ e, receiptIndex, receiptCount }: { e: Expense; receiptIndex: number; receiptCount: number }) {
  return (
    <div className="expense-print-mini-header shrink-0 bg-brand-600 text-white px-4 py-2 flex items-center justify-between text-sm">
      <span className="font-mono font-semibold">{e.receipt_no || `EXP-${e.id}`}</span>
      <span className="opacity-90">
        Receipt {receiptIndex + 1} of {receiptCount} · {expenseSupplierName(e)}
      </span>
    </div>
  );
}

function ReceiptImage({
  e,
  receipt,
  index,
  onReady,
}: {
  e: Expense;
  receipt: { id: number; path: string };
  index: number;
  onReady: (id: number) => void;
}) {
  return (
    <figure className="expense-print-figure m-0 flex min-h-0 flex-1 flex-col">
      <figcaption className="expense-print-caption shrink-0 bg-gray-50 px-3 py-1.5 text-xs font-mono font-semibold text-gray-700 border border-gray-200 border-b-0">
        {e.receipt_no || `EXP-${e.id}`} · #{index + 1} — {expenseSupplierName(e)}
      </figcaption>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={receiptSrc(receipt)}
        alt={`Receipt ${e.receipt_no || e.id} #${index + 1}`}
        data-receipt-id={receipt.id}
        loading="eager"
        decoding="sync"
        className="expense-print-receipt-img block w-full min-h-0 flex-1 border border-gray-200 object-contain object-top max-h-[70vh]"
        onLoad={() => onReady(receipt.id)}
        onError={() => onReady(receipt.id)}
      />
    </figure>
  );
}

function buildPrintPages(expenses: Expense[]): PrintPage[] {
  const pages: PrintPage[] = [];
  for (const e of expenses) {
    const receipts = e.receipts || [];
    if (!receipts.length) {
      pages.push({
        key: `${e.id}-empty`,
        expense: e,
        receiptIndex: 0,
        receiptCount: 0,
        showFullSummary: true,
      });
      continue;
    }
    receipts.forEach((receipt, i) => {
      pages.push({
        key: `${e.id}-${receipt.id}`,
        expense: e,
        receipt,
        receiptIndex: i,
        receiptCount: receipts.length,
        showFullSummary: i === 0,
      });
    });
  }
  return pages;
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

  const printPages = useMemo(() => buildPrintPages(expenses), [expenses]);

  const expectedImageIds = useMemo(
    () => printPages.filter((p) => p.receipt).map((p) => p.receipt!.id),
    [printPages]
  );

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
    }, 8000);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(fallback);
    };
  }, [expectedImageIds, markImageReady]);

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
            {expenses.length} expense{expenses.length === 1 ? '' : 's'} · {printPages.length} print page
            {printPages.length === 1 ? '' : 's'}
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

      {printPages.length === 0 ? (
        <div className="p-12 text-center text-gray-500">No receipts selected.</div>
      ) : (
        <div className="expense-print-stack max-w-3xl mx-auto p-4 sm:p-6 print:p-0 print:max-w-none">
          {printPages.map((page) => (
            <article
              key={page.key}
              className="expense-print-sheet mb-6 print:mb-0 bg-white rounded-xl border border-gray-200 print:border-0 print:rounded-none shadow-sm print:shadow-none"
            >
              {page.showFullSummary ? (
                <ExpenseSummary e={page.expense} />
              ) : (
                <ExpenseMiniHeader
                  e={page.expense}
                  receiptIndex={page.receiptIndex}
                  receiptCount={page.receiptCount}
                />
              )}

              <div className="expense-print-body px-4 pb-4 sm:px-6 sm:pb-6 print:px-0 print:pb-0">
                {page.receipt ? (
                  <ReceiptImage
                    e={page.expense}
                    receipt={page.receipt}
                    index={page.receiptIndex}
                    onReady={markImageReady}
                  />
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
    </>
  );
}
