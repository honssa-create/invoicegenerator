'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import PrepSummaryTable from '@/components/kitchen-prep/PrepSummaryTable';
import CompletionModal from '@/components/kitchen-prep/CompletionModal';
import {
  PREP_CAPACITIES,
  PREP_CAPACITY_LABELS,
  PREP_ORDER_TYPES,
  PREP_ORDER_TYPE_LABELS,
  PREP_STATUSES,
  PREP_STATUS_LABELS,
  getPrepStatusAction,
  BIRD_NEST_TYPES,
  BIRD_NEST_TYPE_LABELS,
  formulaSummaryForCapacity,
  isRedDateAllowed,
  resolveActualQty,
  type BirdNestType,
  type PrepCalculation,
  type PrepOrder,
} from '@/lib/kitchen-prep';
import { BTN, MSG, bi } from '@/lib/ui-labels';

export default function KitchenPrepDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [order, setOrder] = useState<PrepOrder | null>(null);
  const [calc, setCalc] = useState<PrepCalculation | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState('');
  const [showComplete, setShowComplete] = useState(false);
  const [advancingStatus, setAdvancingStatus] = useState(false);
  const [capacityOptions, setCapacityOptions] = useState<{ id: string; label: string }[]>(
    PREP_CAPACITIES.map((id) => ({ id, label: PREP_CAPACITY_LABELS[id] || id }))
  );
  const patchQueueRef = useRef(Promise.resolve());
  const patchSeqRef = useRef(0);

  const load = () =>
    fetch(`/api/kitchen-prep/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.order) {
          setOrder(d.order);
          setCalc(d.calculation);
        }
      })
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, [id]);

  useEffect(() => {
    fetch('/api/kitchen/catalog')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const caps = d?.catalog?.capacities as { id: string; label: string; sortOrder?: number }[] | undefined;
        if (!caps?.length) return;
        setCapacityOptions(
          [...caps]
            .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
            .map((c) => ({ id: c.id, label: c.label || PREP_CAPACITY_LABELS[c.id] || c.id }))
        );
      })
      .catch(() => undefined);
  }, []);

  const patch = (body: Record<string, unknown>) => {
    const seq = ++patchSeqRef.current;
    setSaving(true);
    setError('');
    patchQueueRef.current = patchQueueRef.current.then(async () => {
      try {
        const res = await fetch(`/api/kitchen-prep/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        const d = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError((d as { error?: string }).error || MSG.saveFailed);
          return;
        }
        if (seq === patchSeqRef.current && d.order) {
          setOrder(d.order);
          setCalc(d.calculation);
        }
      } catch {
        setError(MSG.saveFailed);
      } finally {
        if (seq === patchSeqRef.current) setSaving(false);
      }
    });
  };

  const remove = async () => {
    if (
      !confirm(
        bi(
          'Move this prep order to Deleted Records? You can restore it within 60 days.',
          '將此備料單移至已刪除紀錄？可於 60 天內還原。'
        )
      )
    ) {
      return;
    }
    setDeleting(true);
    setError('');
    const res = await fetch(`/api/kitchen-prep/${id}`, { method: 'DELETE' });
    const d = await res.json().catch(() => ({}));
    setDeleting(false);
    if (!res.ok) {
      setError(d.error || bi('Failed to delete', '刪除失敗'));
      return;
    }
    router.push('/kitchen-prep');
  };

  const handleStatusAction = async () => {
    if (!order) return;
    const action = getPrepStatusAction(order.status);
    if (!action) return;
    if (action.type === 'complete') {
      setShowComplete(true);
      return;
    }
    setAdvancingStatus(true);
    setError('');
    const res = await fetch(`/api/kitchen-prep/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: action.nextStatus }),
    });
    const d = await res.json();
    setAdvancingStatus(false);
    if (!res.ok) {
      setError(d.error || MSG.saveFailed);
      return;
    }
    setOrder(d.order);
    setCalc(d.calculation);
  };

  const input = 'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50/40 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none';

  if (loading) {
    return <AppLayout><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div></AppLayout>;
  }
  if (!order || !calc) {
    return <AppLayout><div className="p-12 text-center text-gray-500">{bi('Prep order not found.', '找不到備料單。')}</div></AppLayout>;
  }

  const flavorPair = (
    orderKey: 'qty_osmanthus' | 'qty_red_date' | 'qty_rock_sugar',
    actualKey: 'actual_qty_osmanthus' | 'actual_qty_red_date' | 'actual_qty_rock_sugar',
    birdNestKey: 'bird_nest_osmanthus' | 'bird_nest_red_date' | 'bird_nest_rock_sugar',
    label: string,
    disabled = false
  ) => (
    <div className="space-y-3 rounded-xl border border-gray-100 bg-gray-50/50 p-4">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">{label} · 客人訂</label>
          <input
            type="number"
            min="0"
            disabled={disabled}
            value={order[orderKey]}
            onChange={(e) => {
              const v = Number(e.target.value) || 0;
              setOrder((o) => (o ? { ...o, [orderKey]: v } : o));
            }}
            onBlur={(e) => {
              const v = Number(e.target.value) || 0;
              setOrder((o) => (o ? { ...o, [orderKey]: v } : o));
              patch({ [orderKey]: v });
            }}
            className={`${input} text-lg font-semibold ${disabled ? 'bg-gray-100 text-gray-400' : ''}`}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1.5">實際生產</label>
          <input
            type="number"
            min="0"
            disabled={disabled}
            value={resolveActualQty(order[orderKey], order[actualKey])}
            onChange={(e) => {
              const v = Number(e.target.value) || 0;
              setOrder((o) => (o ? { ...o, [actualKey]: v } : o));
            }}
            onBlur={(e) => {
              const typed = Number(e.target.value) || 0;
              let resolved = typed;
              setOrder((o) => {
                if (!o) return o;
                resolved = resolveActualQty(o[orderKey], typed);
                return { ...o, [actualKey]: resolved };
              });
              patch({ [actualKey]: resolved });
            }}
            className={`${input} text-lg font-semibold text-brand-800 ${disabled ? 'bg-gray-100 text-gray-400' : ''}`}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-500 mb-1.5">燕餅類型 Bird&apos;s-nest type</label>
        <select
          disabled={disabled}
          value={order[birdNestKey]}
          onChange={(e) => {
            const v = e.target.value as BirdNestType;
            setOrder((o) => (o ? { ...o, [birdNestKey]: v } : o));
            patch({ [birdNestKey]: v });
          }}
          className={`${input} ${disabled ? 'bg-gray-100 text-gray-400' : ''}`}
        >
          {BIRD_NEST_TYPES.map((t) => (
            <option key={t} value={t}>
              {BIRD_NEST_TYPE_LABELS[t]}
            </option>
          ))}
        </select>
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-6 gap-3">
        <button onClick={() => router.push('/kitchen-prep')} className="text-sm text-brand-600 hover:text-brand-700 font-medium min-h-[44px] sm:min-h-0 text-left">← {bi('Back to schedule', '返回排程')}</button>
        <div className="page-actions w-full sm:w-auto flex flex-col sm:flex-row gap-2">
          {(() => {
            const action = getPrepStatusAction(order.status);
            if (!action) return null;
            return (
              <button
                type="button"
                disabled={advancingStatus}
                onClick={() => { void handleStatusAction(); }}
                className="btn bg-green-600 text-white hover:bg-green-700 w-full sm:w-auto font-bold disabled:opacity-50"
              >
                {advancingStatus ? '更新中…' : action.label}
              </button>
            );
          })()}
          <Link href={`/kitchen-prep/${id}/print`} className="btn bg-brand-600 text-white hover:bg-brand-700 w-full sm:w-auto">
            🖨 {bi('Print Prep Sheet', '列印備料單')}
          </Link>
          <button
            type="button"
            disabled={deleting}
            onClick={remove}
            className="btn border border-red-200 text-red-600 hover:bg-red-50 w-full sm:w-auto disabled:opacity-50"
          >
            {deleting ? BTN.deleting : BTN.delete}
          </button>
        </div>
      </div>

      {error && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}

      {order.status === 'completed' && order.actual_yield != null && (
        <div className={`mb-6 rounded-xl border-2 p-5 ${order.expected_yield != null && order.actual_yield !== order.expected_yield ? 'border-red-200 bg-red-50' : 'border-green-200 bg-green-50'}`}>
          <p className="text-sm font-semibold text-gray-700">Production Completed 已完成燉製</p>
          <p className="text-2xl font-bold mt-1">
            Actual {order.actual_yield} 樽
            {order.expected_yield != null && (
              <span className={order.actual_yield !== order.expected_yield ? 'text-red-600' : 'text-gray-600'}>
                {' '}/ Expected {order.expected_yield}
              </span>
            )}
          </p>
          {order.completion_remarks && <p className="text-sm text-gray-700 mt-2">Remarks: {order.completion_remarks}</p>}
          {order.completion_splits && order.completion_splits.length > 0 && (
            <p className="text-sm text-gray-700 mt-2">
              Splits: {order.completion_splits.map((s) => `${s.label} ${s.qty}`).join(' · ')}
            </p>
          )}
          {order.completed_by && <p className="text-xs text-gray-500 mt-2">By {order.completed_by}{order.completed_at ? ` · ${order.completed_at}` : ''}</p>}
        </div>
      )}

      <div className="bg-white rounded-2xl border border-gray-200 p-8 mb-6">
        <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold mb-1">Ingredient Calculator 備料詳情與計算</p>
        <h1 className="text-2xl font-bold text-gray-900 font-mono mb-6">{order.order_code}</h1>

        <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 mb-8">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Stewing Date 燉製日期</label>
            <input
              type="date"
              value={order.stewing_date}
              onChange={(e) => {
                const v = e.target.value;
                setOrder((o) => (o ? { ...o, stewing_date: v } : o));
              }}
              onBlur={(e) => patch({ stewing_date: e.target.value })}
              className={input}
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Order Type 訂單類型</label>
            <select
              value={order.order_type}
              onChange={(e) => {
                const v = e.target.value as PrepOrder['order_type'];
                setOrder((o) => (o ? { ...o, order_type: v } : o));
                patch({ order_type: v });
              }}
              className={input}
            >
              {PREP_ORDER_TYPES.map((t) => <option key={t} value={t}>{PREP_ORDER_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Capacity 容量</label>
            <select
              value={order.capacity}
              onChange={(e) => {
                const v = e.target.value as PrepOrder['capacity'];
                const clearRed = !isRedDateAllowed(v);
                setOrder((o) =>
                  o ? { ...o, capacity: v, ...(clearRed ? { qty_red_date: 0 } : {}) } : o
                );
                patch({ capacity: v, ...(clearRed ? { qty_red_date: 0 } : {}) });
              }}
              className={input}
            >
              {capacityOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1.5">Status</label>
            <select
              value={order.status}
              onChange={(e) => {
                const v = e.target.value as PrepOrder['status'];
                setOrder((o) => (o ? { ...o, status: v } : o));
                patch({ status: v });
              }}
              className={input}
            >
              {PREP_STATUSES.map((s) => <option key={s} value={s}>{PREP_STATUS_LABELS[s]}</option>)}
            </select>
          </div>
        </div>

        <h3 className="text-sm font-semibold text-gray-700 mb-3">Order Quantities 訂購樽數</h3>
        <div className="grid md:grid-cols-3 gap-5 mb-4">
          {flavorPair('qty_osmanthus', 'actual_qty_osmanthus', 'bird_nest_osmanthus', '桂花 Osmanthus')}
          {flavorPair('qty_red_date', 'actual_qty_red_date', 'bird_nest_red_date', '紅棗 Red Date', !isRedDateAllowed(order.capacity))}
          {flavorPair('qty_rock_sugar', 'actual_qty_rock_sugar', 'bird_nest_rock_sugar', '冰糖 Rock Sugar')}
        </div>
        <p className="text-xs text-gray-500 mb-4">
          實際生產樽數 is used for the kitchen summary. Defaults to the ordered qty; set it higher for extra bottles (e.g. 回禮).
        </p>
        {!isRedDateAllowed(order.capacity) && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-6">
            ⚠ Red Date (紅棗) is disabled for {PREP_CAPACITY_LABELS[order.capacity]}.
          </p>
        )}
        {!calc.formulaReady && (
          <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-6">
            Formula for {PREP_CAPACITY_LABELS[order.capacity]} is not configured yet.
          </p>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50">
          <h2 className="text-lg font-bold text-gray-900">Kitchen Summary 廚房總結</h2>
          <p className="text-sm text-gray-500 mt-1">{formulaSummaryForCapacity(order.capacity)}</p>
        </div>
        <div className="overflow-x-auto p-2">
          <PrepSummaryTable calc={calc} capacity={order.capacity} variant="screen" />
        </div>
      </div>

      {saving && <p className="text-center text-sm text-gray-400 mt-4">Saving…</p>}

      {showComplete && (
        <CompletionModal
          order={order}
          onClose={() => setShowComplete(false)}
          onCompleted={(updated) => {
            setShowComplete(false);
            setOrder(updated);
            load();
          }}
        />
      )}
    </AppLayout>
  );
}
