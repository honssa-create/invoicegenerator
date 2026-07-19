'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  COMPLETION_EXCEPTION_TAGS,
  PREP_CAPACITY_LABELS,
  PREP_ORDER_TYPE_LABELS,
  completionSplitsTotal,
  computePrepCalculation,
  defaultCompletionSplits,
  originalOrderQuantity,
  type PrepCompletionSplit,
  type PrepOrder,
} from '@/lib/kitchen-prep';
import { BTN, MSG, bi } from '@/lib/ui-labels';

interface CompletionModalProps {
  order: PrepOrder;
  onClose: () => void;
  onCompleted: (order: PrepOrder) => void;
}

export default function CompletionModal({ order, onClose, onCompleted }: CompletionModalProps) {
  const calc = useMemo(
    () =>
      computePrepCalculation(order.capacity, order.order_type, {
        osmanthus: order.qty_osmanthus,
        red_date: order.qty_red_date,
        rock_sugar: order.qty_rock_sugar,
      }),
    [order]
  );
  const expectedQty = calc.totals.bottles;
  const orderQty = originalOrderQuantity({
    osmanthus: order.qty_osmanthus,
    red_date: order.qty_red_date,
    rock_sugar: order.qty_rock_sugar,
  });

  const [splits, setSplits] = useState<PrepCompletionSplit[]>(() =>
    defaultCompletionSplits(calc, order.capacity)
  );
  const [remarks, setRemarks] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setSplits(defaultCompletionSplits(calc, order.capacity));
    setRemarks('');
    setError('');
  }, [order.id, calc, order.capacity]);

  const actualQty = completionSplitsTotal(splits);
  const hasVariance = actualQty !== expectedQty;

  const appendTag = (text: string) => {
    setRemarks((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return text;
      if (trimmed.includes(text)) return prev;
      return `${trimmed}；${text}`;
    });
  };

  const updateSplitQty = (index: number, qty: number) => {
    setSplits((rows) => rows.map((row, i) => (i === index ? { ...row, qty: Math.max(0, qty) } : row)));
  };

  const stepSplit = (index: number, delta: number) => {
    setSplits((rows) =>
      rows.map((row, i) =>
        i === index ? { ...row, qty: Math.max(0, row.qty + delta) } : row
      )
    );
  };

  const submit = async () => {
    setError('');
    if (splits.length === 0) {
      setError(bi('No flavor lines to complete — add order quantities first.', '尚無口味行可完成 — 請先新增訂單數量。'));
      return;
    }
    setSubmitting(true);
    const res = await fetch(`/api/kitchen-prep/${order.id}/complete`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        actual_yield: actualQty,
        completion_remarks: remarks || null,
        splits,
      }),
    });
    const data = await res.json();
    setSubmitting(false);
    if (!res.ok) {
      setError(data.error || MSG.submitFailed);
      return;
    }
    onCompleted(data.order);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-panel sm:max-w-2xl max-h-[96vh] p-0 sm:p-0" onClick={(e) => e.stopPropagation()}>
        <div className="px-4 sm:px-6 py-5 border-b border-gray-200 bg-brand-50 rounded-t-2xl">
          <p className="text-sm font-semibold text-brand-800 uppercase tracking-wide">完成與匯報</p>
          <h2 className="text-2xl font-bold text-gray-900 mt-1">Mark as Completed 完成燉製</h2>
          <p className="text-base text-gray-600 mt-2 font-mono">{order.order_code}</p>
          <p className="text-sm text-gray-500 mt-1">
            {order.stewing_date} · {PREP_ORDER_TYPE_LABELS[order.order_type]} · {PREP_CAPACITY_LABELS[order.capacity]}
          </p>
        </div>

        <div className="p-6 space-y-6">
          {error && (
            <div className="p-4 bg-red-50 text-red-700 text-base rounded-xl border border-red-200">{error}</div>
          )}

          <div className="grid sm:grid-cols-3 gap-4">
            <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-500 mb-1">Expected 預期產量</p>
              <p className="text-4xl font-bold text-gray-900 tabular-nums">{expectedQty}</p>
              <p className="text-xs text-gray-500 mt-1">樽 (incl. buffer)</p>
            </div>
            <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-4">
              <p className="text-sm font-medium text-gray-500 mb-1">Original 原訂單</p>
              <p className="text-4xl font-bold text-gray-700 tabular-nums">{orderQty}</p>
              <p className="text-xs text-gray-500 mt-1">樽 (excl. buffer)</p>
            </div>
            <div
              className={`rounded-xl border-2 p-4 ${
                hasVariance ? 'border-red-300 bg-red-50' : 'border-brand-300 bg-brand-50'
              }`}
            >
              <p className="text-sm font-medium text-gray-500 mb-1">Actual Yield 實際產出</p>
              <p
                className={`text-4xl font-bold tabular-nums ${
                  hasVariance ? 'text-red-800' : 'text-brand-800'
                }`}
              >
                {actualQty}
              </p>
              <p className="text-xs text-gray-500 mt-1">樽 (auto-sum of splits)</p>
            </div>
          </div>

          {hasVariance && (
            <p className="text-base font-medium text-red-600 -mt-2">
              Variance 差異: {actualQty - expectedQty > 0 ? '+' : ''}{actualQty - expectedQty} 樽 vs expected
            </p>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-3">
              Quantity Split 分拆子訂單（口味 + 容量）
            </label>
            <p className="text-xs text-gray-500 mb-3">
              Pre-filled per flavor. Adjust qty if bottles broke — actual yield updates automatically.
            </p>
            <div className="space-y-3">
              {splits.map((row, index) => {
                const calcRow = calc.rows.find((r) => r.flavor === row.flavor);
                return (
                  <div
                    key={row.flavor ?? index}
                    className="flex flex-wrap items-center gap-3 p-4 rounded-xl border-2 border-gray-200 bg-gray-50"
                  >
                    <div className="flex-1 min-w-[180px]">
                      <p className="text-base font-bold text-gray-900">{row.label}</p>
                      {calcRow && calcRow.weddingBuffer > 0 && (
                        <p className="text-xs text-gray-500 mt-0.5">
                          Expected {calcRow.actualQty} ({calcRow.orderQty} + {calcRow.weddingBuffer} buffer)
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => stepSplit(index, -1)}
                        className="w-14 h-14 text-2xl font-bold rounded-xl border-2 border-gray-300 bg-white hover:bg-gray-100"
                        aria-label="Decrease"
                      >
                        −
                      </button>
                      <input
                        type="number"
                        min={0}
                        inputMode="numeric"
                        value={row.qty}
                        onChange={(e) => updateSplitQty(index, Number(e.target.value) || 0)}
                        className="w-24 text-center text-3xl font-bold rounded-xl border-2 border-brand-300 py-2 tabular-nums"
                      />
                      <button
                        type="button"
                        onClick={() => stepSplit(index, 1)}
                        className="w-14 h-14 text-2xl font-bold rounded-xl border-2 border-gray-300 bg-white hover:bg-gray-100"
                        aria-label="Increase"
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            {splits.length === 0 && (
              <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                No flavors with order quantity — cannot complete.
              </p>
            )}
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-3">Exception Remarks 異常備註</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {COMPLETION_EXCEPTION_TAGS.map((tag) => (
                <button
                  key={tag.id}
                  type="button"
                  onClick={() => appendTag(tag.text)}
                  className="px-4 py-3 text-sm sm:text-base font-medium rounded-xl border-2 border-amber-200 bg-amber-50 text-amber-900 hover:bg-amber-100 active:bg-amber-200 min-h-[48px]"
                >
                  {tag.label}
                </button>
              ))}
            </div>
            <textarea
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
              rows={3}
              placeholder="e.g. 爆玻璃、燕餅不足…"
              className="w-full px-4 py-3 text-base rounded-xl border-2 border-gray-200 focus:border-brand-400 focus:ring-4 focus:ring-brand-100 outline-none resize-none min-h-[100px]"
            />
          </div>
        </div>

        <div className="sticky bottom-0 px-6 py-5 border-t border-gray-200 bg-white flex flex-col sm:flex-row gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="order-2 sm:order-1 flex-1 min-h-[56px] text-lg font-semibold rounded-xl border-2 border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50"
          >
            {BTN.cancel}
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || splits.length === 0}
            className="order-1 sm:order-2 flex-[2] min-h-[56px] text-lg font-bold rounded-xl bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50 shadow-lg"
          >
            {submitting ? bi('Submitting…', '提交中…') : bi('Submit & Complete', '確認完成')}
          </button>
        </div>
      </div>
    </div>
  );
}
