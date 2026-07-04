'use client';

import { useEffect, useState } from 'react';
import {
  COMPLETION_EXCEPTION_TAGS,
  PREP_CAPACITY_LABELS,
  PREP_ORDER_TYPE_LABELS,
  computePrepCalculation,
  originalOrderQuantity,
  type PrepCompletionSplit,
  type PrepOrder,
} from '@/lib/kitchen-prep';

interface CompletionModalProps {
  order: PrepOrder;
  onClose: () => void;
  onCompleted: (order: PrepOrder) => void;
}

function defaultSplits(orderQty: number): PrepCompletionSplit[] {
  return [{ label: 'Sub-order 1', qty: orderQty }];
}

export default function CompletionModal({ order, onClose, onCompleted }: CompletionModalProps) {
  const calc = computePrepCalculation(order.capacity, order.order_type, {
    osmanthus: order.qty_osmanthus,
    red_date: order.qty_red_date,
    rock_sugar: order.qty_rock_sugar,
  });
  const expectedQty = calc.totals.bottles;
  const orderQty = originalOrderQuantity({
    osmanthus: order.qty_osmanthus,
    red_date: order.qty_red_date,
    rock_sugar: order.qty_rock_sugar,
  });

  const [actualQty, setActualQty] = useState(expectedQty);
  const [remarks, setRemarks] = useState('');
  const [splits, setSplits] = useState<PrepCompletionSplit[]>(() => defaultSplits(orderQty));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setActualQty(expectedQty);
    setRemarks('');
    setSplits(defaultSplits(orderQty));
    setError('');
  }, [order.id, expectedQty, orderQty]);

  const splitSum = splits.reduce((s, row) => s + row.qty, 0);

  const step = (delta: number) => {
    setActualQty((v) => Math.max(0, v + delta));
  };

  const appendTag = (text: string) => {
    setRemarks((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return text;
      if (trimmed.includes(text)) return prev;
      return `${trimmed}；${text}`;
    });
  };

  const updateSplit = (index: number, patch: Partial<PrepCompletionSplit>) => {
    setSplits((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));
  };

  const addSplit = () => {
    setSplits((rows) => [...rows, { label: `Sub-order ${rows.length + 1}`, qty: 0 }]);
  };

  const removeSplit = (index: number) => {
    setSplits((rows) => (rows.length <= 1 ? rows : rows.filter((_, i) => i !== index)));
  };

  const submit = async () => {
    setError('');
    if (splitSum !== actualQty) {
      setError(`Split quantities must sum to actual yield (${actualQty} 樽). Current sum: ${splitSum} 樽.`);
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
      setError(data.error || 'Submit failed');
      return;
    }
    onCompleted(data.order);
  };

  const hasVariance = actualQty !== expectedQty;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
      <div
        className="bg-white w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl shadow-2xl max-h-[96vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-gray-200 bg-brand-50">
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

          <div className="grid sm:grid-cols-2 gap-4">
            <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-5">
              <p className="text-sm font-medium text-gray-500 mb-2">Expected Production Qty 預期產量</p>
              <p className="text-5xl font-bold text-gray-900 tabular-nums">{expectedQty}</p>
              <p className="text-sm text-gray-500 mt-2">樽 (actual production incl. buffer)</p>
            </div>
            <div className="rounded-xl border-2 border-gray-200 bg-gray-50 p-5">
              <p className="text-sm font-medium text-gray-500 mb-2">Original Order Qty 原訂單樽數</p>
              <p className="text-5xl font-bold text-gray-700 tabular-nums">{orderQty}</p>
              <p className="text-sm text-gray-500 mt-2">樽 (excl. wedding +3 buffer)</p>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-600 mb-3">Actual Yield Qty 實際產出數量</label>
            <div className="flex items-stretch gap-3">
              <button
                type="button"
                onClick={() => step(-1)}
                className="flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 text-3xl font-bold rounded-xl border-2 border-gray-300 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-800"
                aria-label="Decrease quantity"
              >
                −
              </button>
              <input
                type="number"
                min={0}
                inputMode="numeric"
                value={actualQty}
                onChange={(e) => setActualQty(Math.max(0, Number(e.target.value) || 0))}
                className={`flex-1 min-w-0 text-center text-4xl sm:text-5xl font-bold rounded-xl border-2 px-2 py-4 outline-none focus:ring-4 focus:ring-brand-200 ${
                  hasVariance ? 'border-red-400 bg-red-50 text-red-800' : 'border-brand-300 bg-white text-brand-900'
                }`}
              />
              <button
                type="button"
                onClick={() => step(1)}
                className="flex-shrink-0 w-16 h-16 sm:w-20 sm:h-20 text-3xl font-bold rounded-xl border-2 border-gray-300 bg-white hover:bg-gray-50 active:bg-gray-100 text-gray-800"
                aria-label="Increase quantity"
              >
                +
              </button>
            </div>
            {hasVariance && (
              <p className="mt-3 text-base font-medium text-red-600">
                Variance 差異: {actualQty - expectedQty > 0 ? '+' : ''}{actualQty - expectedQty} 樽 vs expected
              </p>
            )}
          </div>

          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-gray-600">Quantity Split 分拆子訂單</label>
              <button
                type="button"
                onClick={addSplit}
                className="min-h-[44px] px-4 text-sm font-semibold rounded-lg border-2 border-brand-200 text-brand-700 hover:bg-brand-50"
              >
                + Add Split 新增分拆
              </button>
            </div>
            <p className="text-xs text-gray-500 mb-3">
              Default matches original order qty ({orderQty} 樽). Split rows must sum to actual yield ({actualQty} 樽).
            </p>
            <div className="space-y-3">
              {splits.map((row, index) => (
                <div key={index} className="flex flex-wrap items-center gap-3 p-4 rounded-xl border-2 border-gray-200 bg-gray-50">
                  <input
                    value={row.label}
                    onChange={(e) => updateSplit(index, { label: e.target.value })}
                    className="flex-1 min-w-[140px] px-3 py-3 text-base rounded-lg border border-gray-300"
                    placeholder="Sub-order label"
                  />
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateSplit(index, { qty: Math.max(0, row.qty - 1) })}
                      className="w-12 h-12 text-xl font-bold rounded-lg border-2 border-gray-300 bg-white"
                    >
                      −
                    </button>
                    <input
                      type="number"
                      min={0}
                      value={row.qty}
                      onChange={(e) => updateSplit(index, { qty: Math.max(0, Number(e.target.value) || 0) })}
                      className="w-20 text-center text-2xl font-bold rounded-lg border-2 border-brand-300 py-2"
                    />
                    <button
                      type="button"
                      onClick={() => updateSplit(index, { qty: row.qty + 1 })}
                      className="w-12 h-12 text-xl font-bold rounded-lg border-2 border-gray-300 bg-white"
                    >
                      +
                    </button>
                  </div>
                  {splits.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeSplit(index)}
                      className="min-h-[44px] px-3 text-sm text-red-600 font-medium"
                    >
                      Remove
                    </button>
                  )}
                </div>
              ))}
            </div>
            <p className={`mt-2 text-sm font-medium ${splitSum === actualQty ? 'text-green-700' : 'text-red-600'}`}>
              Split total: {splitSum} / {actualQty} 樽
            </p>
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
            Cancel 取消
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting}
            className="order-1 sm:order-2 flex-[2] min-h-[56px] text-lg font-bold rounded-xl bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 disabled:opacity-50 shadow-lg"
          >
            {submitting ? 'Submitting…' : 'Submit & Complete 確認完成'}
          </button>
        </div>
      </div>
    </div>
  );
}
