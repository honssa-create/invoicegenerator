'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import ExpenseDetailPanel from '@/components/ExpenseDetailPanel';
import type { Expense } from '@/lib/types';
import { BTN, bi } from '@/lib/ui-labels';

export default function ExpenseDetailPrintPage() {
  const { id } = useParams();
  const router = useRouter();
  const expenseId = Number(id);
  const [expense, setExpense] = useState<Expense | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [imagesReady, setImagesReady] = useState<Set<string>>(new Set());

  const expectedImageKeys = useMemo(
    () => (expense?.receipts || []).map((r) => `r-${r.id}`),
    [expense]
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
    if (!Number.isFinite(expenseId) || expenseId <= 0) {
      setLoadError('Invalid expense ID.');
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError('');
    fetch(`/api/expenses?ids=${expenseId}`)
      .then((res) => {
        if (res.status === 401) {
          router.push('/login');
          return null;
        }
        if (!res.ok) throw new Error('Failed to load expense');
        return res.json();
      })
      .then((data) => {
        if (!data) return;
        const found = (data.expenses || []).find((e: Expense) => e.id === expenseId) as Expense | undefined;
        if (!found) {
          setLoadError('Expense not found.');
          return;
        }
        setExpense(found);
        setImagesReady(new Set());
      })
      .catch(() => setLoadError('Could not load expense for printing.'))
      .finally(() => setLoading(false));
  }, [expenseId, router]);

  const handlePrint = () => {
    requestAnimationFrame(() => window.print());
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="expense-detail-print-root min-h-screen bg-gray-100 print:bg-white">
      <div className="no-print sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <div>
          <Link href="/expenses" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            ← {bi('Back to expenses', '返回支出紀錄')}
          </Link>
          {expense && (
            <p className="text-xs text-gray-500 mt-0.5">
              {expense.receipt_no || `EXP-${expense.id}`}
              {!allImagesReady && expectedImageKeys.length > 0 ? ' · loading images…' : ''}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handlePrint}
          disabled={!expense || !allImagesReady}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          🖨 {BTN.print}
        </button>
      </div>

      {loadError ? (
        <div className="p-6 text-center text-red-600 text-sm">{loadError}</div>
      ) : expense ? (
        <div className="max-w-3xl mx-auto p-4 sm:p-6 print:p-0 print:max-w-none">
          <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-5 sm:p-6 print:border-0 print:shadow-none print:rounded-none">
            <ExpenseDetailPanel expense={expense} onImageReady={markImageReady} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
