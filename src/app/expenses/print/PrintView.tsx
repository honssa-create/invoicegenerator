'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { categoryLabel, expenseSupplierName, formatMoney } from '@/lib/expenses';
import { expenseReceiptUrl, isStoredImageUrl } from '@/lib/image-url';
import type { Expense } from '@/lib/types';

type PrintPage = {
  key: string;
  expense: Expense;
  receipt?: { id: number; path: string };
  receiptIndex: number;
  receiptCount: number;
  showFullSummary: boolean;
  imageKey: string;
};

function receiptSrc(expense: Expense, receipt: { id: number; path: string }): string {
  if (receipt.id > 0) {
    const url = expenseReceiptUrl(receipt);
    if (url.startsWith('http')) return url;
    if (typeof window !== 'undefined') return `${window.location.origin}${url}`;
    return url;
  }
  if (isStoredImageUrl(receipt.path)) return receipt.path;
  const legacy = `/api/expenses/${expense.id}/receipt`;
  if (typeof window !== 'undefined') return `${window.location.origin}${legacy}`;
  return legacy;
}

function receiptsForExpense(e: Expense): { id: number; path: string }[] {
  if (Array.isArray(e.receipts) && e.receipts.length) return e.receipts;
  if (e.receipt_path?.trim()) return [{ id: 0, path: e.receipt_path.trim() }];
  return [];
}

function ExpenseSummary({ e }: { e: Expense }) {
  return (
    <div className="expense-print-summary">
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
    <div className="expense-print-mini-header bg-brand-600 text-white px-4 py-2 flex items-center justify-between text-sm">
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
  imageKey,
  onReady,
}: {
  e: Expense;
  receipt: { id: number; path: string };
  index: number;
  imageKey: string;
  onReady: (key: string) => void;
}) {
  const src = receiptSrc(e, receipt);
  return (
    <figure className="expense-print-figure m-0">
      <figcaption className="expense-print-caption bg-gray-50 px-3 py-1.5 text-xs font-mono font-semibold text-gray-700 border border-gray-200 border-b-0 print:hidden">
        {e.receipt_no || `EXP-${e.id}`} · #{index + 1} — {expenseSupplierName(e)}
      </figcaption>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={src}
        alt={`Receipt ${e.receipt_no || e.id} #${index + 1}`}
        data-image-key={imageKey}
        loading="eager"
        decoding="sync"
        className="expense-print-receipt-img block w-full border border-gray-200 object-contain object-top bg-white"
        onLoad={() => onReady(imageKey)}
        onError={() => onReady(imageKey)}
      />
    </figure>
  );
}

function buildPrintPages(expenses: Expense[]): PrintPage[] {
  const pages: PrintPage[] = [];
  for (const e of expenses) {
    const receipts = receiptsForExpense(e);
    if (!receipts.length) {
      pages.push({
        key: `${e.id}-empty`,
        expense: e,
        receiptIndex: 0,
        receiptCount: 0,
        showFullSummary: true,
        imageKey: `${e.id}-empty`,
      });
      continue;
    }
    receipts.forEach((receipt, i) => {
      const imageKey = receipt.id > 0 ? `r-${receipt.id}` : `e-${e.id}-legacy`;
      pages.push({
        key: `${e.id}-${imageKey}`,
        expense: e,
        receipt,
        receiptIndex: i,
        receiptCount: receipts.length,
        showFullSummary: i === 0,
        imageKey,
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
  const [loadError, setLoadError] = useState('');
  const [imagesReady, setImagesReady] = useState<Set<string>>(new Set());

  const idsParam = searchParams.get('ids') || '';
  const ids = idsParam
    .split(',')
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isFinite(n) && n > 0);

  const printPages = useMemo(() => buildPrintPages(expenses), [expenses]);

  const expectedImageKeys = useMemo(
    () => printPages.filter((p) => p.receipt).map((p) => p.imageKey),
    [printPages]
  );

  const allImagesReady =
    expectedImageKeys.length === 0 || expectedImageKeys.every((key) => imagesReady.has(key));

  const markImageReady = useCallback((key: string) => {
    setImagesReady((prev) => {
      if (prev.has(key)) return prev;
      const next = new Set(prev);
      next.add(key);
      return next;
    });
  }, []);

  useEffect(() => {
    if (!expectedImageKeys.length) return;
    const markCached = () => {
      document.querySelectorAll<HTMLImageElement>('img[data-image-key]').forEach((img) => {
        if (img.complete && img.dataset.imageKey) markImageReady(img.dataset.imageKey);
      });
    };
    markCached();
    const t = window.setTimeout(markCached, 300);
    const fallback = window.setTimeout(() => {
      expectedImageKeys.forEach((key) => markImageReady(key));
    }, 8000);
    return () => {
      window.clearTimeout(t);
      window.clearTimeout(fallback);
    };
  }, [expectedImageKeys, markImageReady]);

  useEffect(() => {
    if (!ids.length) {
      setExpenses([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setLoadError('');
    fetch(`/api/expenses?ids=${ids.join(',')}`)
      .then((res) => {
        if (res.status === 401) {
          router.push('/login');
          return null;
        }
        if (!res.ok) throw new Error('Failed to load expenses');
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        const all: Expense[] = data.expenses || [];
        const byId = new Map(all.map((e) => [e.id, e]));
        const ordered = ids.map((id) => byId.get(id)).filter((e): e is Expense => Boolean(e));
        if (!ordered.length) setLoadError('No matching expenses found for the selected IDs.');
        setExpenses(ordered);
        setImagesReady(new Set());
      })
      .catch(() => setLoadError('Could not load expenses for printing.'))
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
            {!allImagesReady && expectedImageKeys.length > 0 ? ' · loading images…' : ''}
          </p>
        </div>
        <button
          onClick={handlePrint}
          disabled={!allImagesReady || printPages.length === 0}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          🖨 Print
        </button>
      </div>

      {loadError && (
        <div className="p-6 text-center text-red-600 text-sm">{loadError}</div>
      )}

      {!loadError && printPages.length === 0 ? (
        <div className="p-12 text-center text-gray-500">No receipts selected.</div>
      ) : (
        <div className="expense-print-stack max-w-3xl mx-auto p-4 sm:p-6 print:p-0 print:max-w-none print:block">
          {printPages.map((page, pageIndex) => (
            <article
              key={page.key}
              className={`expense-print-sheet mb-6 print:mb-0 bg-white rounded-xl border border-gray-200 print:border-0 print:rounded-none shadow-sm print:shadow-none${pageIndex > 0 ? ' expense-print-sheet--continued' : ''}`}
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
                    imageKey={page.imageKey}
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
