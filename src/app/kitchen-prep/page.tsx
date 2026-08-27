'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import FilterBar from '@/components/FilterBar';
import CompletionModal from '@/components/kitchen-prep/CompletionModal';
import {
  PREP_CAPACITIES,
  PREP_CAPACITY_LABELS,
  PREP_ORDER_TYPES,
  PREP_ORDER_TYPE_LABELS,
  PREP_STATUSES,
  PREP_STATUS_LABELS,
  getPrepStatusAction,
  isRedDateAllowed,
  type PrepCapacity,
  type PrepOrder,
  type PrepOrderType,
  type PrepStatus,
} from '@/lib/kitchen-prep';
import { BTN, TITLE, bi } from '@/lib/ui-labels';
import { useModalUnsavedWarning } from '@/hooks/useUnsavedChangesWarning';
import { readListUi, writeListUi } from '@/lib/list-ui-storage';

const STATUS_COLORS: Record<string, string> = {
  not_started: 'bg-gray-100 text-gray-600',
  scheduled: 'bg-blue-100 text-blue-700',
  prepped: 'bg-amber-100 text-amber-700',
  stewing: 'bg-orange-100 text-orange-700',
  completed: 'bg-green-100 text-green-700',
};

interface CapacityOption {
  id: string;
  label: string;
}

interface CapacityLine {
  capacity: PrepCapacity;
  qty_osmanthus: string;
  qty_red_date: string;
  qty_rock_sugar: string;
}

interface FormState {
  stewing_date: string;
  order_type: PrepOrderType;
  order_code: string;
  lines: CapacityLine[];
}

const emptyLine = (capacity: PrepCapacity = '45g'): CapacityLine => ({
  capacity,
  qty_osmanthus: '',
  qty_red_date: '',
  qty_rock_sugar: '',
});

const EMPTY: FormState = {
  stewing_date: new Date().toISOString().slice(0, 10),
  order_type: 'daily',
  order_code: '',
  lines: [emptyLine()],
};

function parsePrefillForm(searchParams: URLSearchParams): FormState | null {
  if (searchParams.get('create') !== '1') return null;
  const orderTypeRaw = searchParams.get('order_type') || 'restock';
  const order_type: PrepOrderType = PREP_ORDER_TYPES.includes(orderTypeRaw as PrepOrderType)
    ? (orderTypeRaw as PrepOrderType)
    : 'restock';

  let lines: CapacityLine[] = [emptyLine()];
  const rawLines = searchParams.get('lines');
  if (rawLines) {
    try {
      const parsed = JSON.parse(rawLines) as Array<{
        capacity?: string;
        qty_osmanthus?: number;
        qty_red_date?: number;
        qty_rock_sugar?: number;
      }>;
      if (Array.isArray(parsed) && parsed.length > 0) {
        const withNums = parsed
          .filter((l) => Boolean(l.capacity))
          .map((l) => {
            const capacity = l.capacity as PrepCapacity;
            const o = Math.max(0, Math.round(Number(l.qty_osmanthus) || 0));
            const r = isRedDateAllowed(capacity)
              ? Math.max(0, Math.round(Number(l.qty_red_date) || 0))
              : 0;
            const s = Math.max(0, Math.round(Number(l.qty_rock_sugar) || 0));
            return {
              capacity,
              qty_osmanthus: o ? String(o) : '',
              qty_red_date: r ? String(r) : '',
              qty_rock_sugar: s ? String(s) : '',
            };
          })
          .filter((l) => l.qty_osmanthus || l.qty_red_date || l.qty_rock_sugar);
        if (withNums.length) lines = withNums;
      }
    } catch {
      /* ignore bad lines param */
    }
  }

  return {
    stewing_date: new Date().toISOString().slice(0, 10),
    order_type,
    order_code: '',
    lines,
  };
}

type SortKey = 'stewing_date' | 'order_code' | 'capacity' | 'status';
type SortDir = 'asc' | 'desc';
const KITCHEN_PREP_LIST_UI_KEY = 'kitchen-prep-list-ui';
const SORT_KEYS: SortKey[] = ['stewing_date', 'order_code', 'capacity', 'status'];

type KitchenPrepListUiState = {
  dateStart: string;
  dateEnd: string;
  search: string;
  status: string;
  sortKey: SortKey;
  sortDir: SortDir;
};

function localIsoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function thisWeekRange(date = new Date()): { start: string; end: string } {
  const d = new Date(date);
  const weekday = d.getDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const start = new Date(d);
  start.setDate(d.getDate() + mondayOffset);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  return { start: localIsoDate(start), end: localIsoDate(end) };
}

function thisMonthRange(date = new Date()): { start: string; end: string } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { start: localIsoDate(start), end: localIsoDate(end) };
}

export default function KitchenPrepListPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      }
    >
      <KitchenPrepListContent />
    </Suspense>
  );
}

function KitchenPrepListContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const savedUi = useMemo(() => readListUi<KitchenPrepListUiState>(KITCHEN_PREP_LIST_UI_KEY), []);
  const [orders, setOrders] = useState<PrepOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [completeOrder, setCompleteOrder] = useState<PrepOrder | null>(null);
  const [advancingId, setAdvancingId] = useState<number | null>(null);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>(() => {
    const key = savedUi?.sortKey;
    return key && SORT_KEYS.includes(key) ? key : 'stewing_date';
  });
  const [sortDir, setSortDir] = useState<SortDir>(() => {
    const dir = savedUi?.sortDir;
    return dir === 'asc' || dir === 'desc' ? dir : 'asc';
  });
  const [dateStart, setDateStart] = useState(savedUi?.dateStart ?? '');
  const [dateEnd, setDateEnd] = useState(savedUi?.dateEnd ?? '');
  const [status, setStatus] = useState<PrepStatus | ''>(() => {
    const saved = savedUi?.status;
    return saved && (PREP_STATUSES as readonly string[]).includes(saved) ? (saved as PrepStatus) : '';
  });
  const [search, setSearch] = useState(savedUi?.search ?? '');
  const [capacityOptions, setCapacityOptions] = useState<CapacityOption[]>(
    PREP_CAPACITIES.map((id) => ({ id, label: PREP_CAPACITY_LABELS[id] || id }))
  );

  useModalUnsavedWarning(showForm, form);

  const load = () =>
    fetch('/api/kitchen-prep')
      .then((r) => r.json())
      .then((d) => setOrders(d.orders || []))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  useEffect(() => {
    writeListUi(KITCHEN_PREP_LIST_UI_KEY, { dateStart, dateEnd, search, status, sortKey, sortDir });
  }, [dateStart, dateEnd, search, status, sortKey, sortDir]);

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

  useEffect(() => {
    const prefill = parsePrefillForm(searchParams);
    if (!prefill) return;
    setError('');
    setForm(prefill);
    setShowForm(true);
    router.replace('/kitchen-prep', { scroll: false });
  }, [searchParams, router]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (dateStart && o.stewing_date < dateStart) return false;
      if (dateEnd && o.stewing_date > dateEnd) return false;
      if (status && o.status !== status) return false;
      if (!q) return true;
      const haystack = [
        o.stewing_date,
        o.order_code,
        o.capacity,
        o.status,
        PREP_ORDER_TYPE_LABELS[o.order_type],
        PREP_CAPACITY_LABELS[o.capacity],
        PREP_STATUS_LABELS[o.status],
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [orders, dateStart, dateEnd, search, status]);

  const sortedOrders = useMemo(() => {
    const list = [...filteredOrders];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'stewing_date') cmp = a.stewing_date.localeCompare(b.stewing_date);
      else if (sortKey === 'order_code') cmp = a.order_code.localeCompare(b.order_code);
      else if (sortKey === 'capacity') cmp = a.capacity.localeCompare(b.capacity);
      else if (sortKey === 'status') cmp = a.status.localeCompare(b.status);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [filteredOrders, sortKey, sortDir]);

  const applyThisWeek = () => {
    const { start, end } = thisWeekRange();
    setDateStart(start);
    setDateEnd(end);
  };

  const applyThisMonth = () => {
    const { start, end } = thisMonthRange();
    setDateStart(start);
    setDateEnd(end);
  };

  const clearFilters = () => {
    setDateStart('');
    setDateEnd('');
    setStatus('');
    setSearch('');
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

  const handleStatusAction = async (order: PrepOrder, e: React.MouseEvent) => {
    e.stopPropagation();
    const action = getPrepStatusAction(order.status);
    if (!action) return;
    if (action.type === 'complete') {
      setCompleteOrder(order);
      return;
    }
    setAdvancingId(order.id);
    const res = await fetch(`/api/kitchen-prep/${order.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: action.nextStatus }),
    });
    const data = await res.json();
    setAdvancingId(null);
    if (!res.ok) {
      setError(data.error || bi('Failed to update status', '更新狀態失敗'));
      return;
    }
    setOrders((prev) => prev.map((o) => (o.id === order.id ? data.order : o)));
  };

  const toggleCapacity = (capacity: PrepCapacity) => {
    setForm((prev) => {
      const exists = prev.lines.some((l) => l.capacity === capacity);
      if (exists) {
        const next = prev.lines.filter((l) => l.capacity !== capacity);
        return { ...prev, lines: next.length ? next : [emptyLine(capacity)] };
      }
      return { ...prev, lines: [...prev.lines, emptyLine(capacity)] };
    });
  };

  const updateLine = (index: number, patch: Partial<CapacityLine>) => {
    setForm((prev) => ({
      ...prev,
      lines: prev.lines.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    }));
  };

  const save = async () => {
    setError('');
    if (form.lines.length === 0) {
      setError('Select at least one capacity 容量');
      return;
    }
    setSaving(true);
    const res = await fetch('/api/kitchen-prep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        stewing_date: form.stewing_date,
        order_type: form.order_type,
        order_code: form.order_code || undefined,
        lines: form.lines.map((line) => ({
          capacity: line.capacity,
          qty_osmanthus: Number(line.qty_osmanthus) || 0,
          qty_red_date: Number(line.qty_red_date) || 0,
          qty_rock_sugar: Number(line.qty_rock_sugar) || 0,
        })),
      }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setError(d.error || 'Failed'); return; }
    setShowForm(false);
    setForm(EMPTY);
    if (d.orders?.length > 1) {
      load();
    } else {
      router.push(`/kitchen-prep/${d.order.id}`);
    }
  };

  const remove = async (id: number) => {
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
    setDeletingId(id);
    setError('');
    const res = await fetch(`/api/kitchen-prep/${id}`, { method: 'DELETE' });
    const d = await res.json().catch(() => ({}));
    setDeletingId(null);
    if (!res.ok) {
      setError(d.error || bi('Failed to delete', '刪除失敗'));
      return;
    }
    setOrders((prev) => prev.filter((o) => o.id !== id));
  };

  const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{TITLE.kitchenPrep}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">{bi('Scheduled stewing orders — click a row to open the ingredient calculator', '排程燉製訂單 — 點擊列開啟配料計算器')}</p>
        </div>
        <div className="page-actions">
          <button onClick={() => { setError(''); setShowForm(true); }} className="btn bg-brand-600 text-white hover:bg-brand-700">
            + {bi('New Prep Order', '新增備料單')}
          </button>
        </div>
      </div>

      {error && !showForm && (
        <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
      )}

      <FilterBar
        dateStart={dateStart}
        dateEnd={dateEnd}
        onDateStart={setDateStart}
        onDateEnd={setDateEnd}
        search={search}
        onSearch={setSearch}
        searchPlaceholder={bi('Order ID, capacity, status, type…', '訂單編號、容量、狀態、類型…')}
        onClear={clearFilters}
      >
        <div className="flex flex-col min-w-[140px]">
          <label className="text-[11px] font-medium text-gray-500 mb-1">{bi('Status', '狀態')}</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as PrepStatus | '')}
            className="px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          >
            <option value="">{BTN.all}</option>
            {PREP_STATUSES.map((s) => (
              <option key={s} value={s}>
                {PREP_STATUS_LABELS[s]}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

      <p className="text-sm text-gray-600 -mt-4 mb-6">
        {bi('Quick filters:', '快速篩選：')}{' '}
        <button type="button" onClick={applyThisWeek} className="text-brand-600 hover:text-brand-700 hover:underline font-medium">
          {bi('This week', '本週')}
        </button>
        <span className="text-gray-400 mx-1">·</span>
        <button type="button" onClick={applyThisMonth} className="text-brand-600 hover:text-brand-700 hover:underline font-medium">
          {bi('This month', '本月')}
        </button>
      </p>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900">Scheduled Orders 排程列表</h2>
          {!loading && orders.length > 0 && (
            <span className="text-xs text-gray-500">
              {sortedOrders.length === orders.length
                ? bi(`${orders.length} order(s)`, `${orders.length} 張`)
                : bi(`${sortedOrders.length} of ${orders.length}`, `${sortedOrders.length} / ${orders.length} 張`)}
            </span>
          )}
        </div>
        {loading ? (
          <div className="p-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" /></div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-gray-500">{bi('No scheduled prep orders yet. Create one to get started.', '尚無排程備料單。建立第一張以開始。')}</div>
        ) : sortedOrders.length === 0 ? (
          <div className="p-12 text-center text-gray-500">{bi('No prep orders match these filters.', '沒有符合篩選條件的備料單。')}</div>
        ) : (
          <table className="w-full min-w-[800px] text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-4 py-3 cursor-pointer hover:text-gray-800" onClick={() => toggleSort('stewing_date')}>
                  Target Stewing Date 燉製日期{sortIndicator('stewing_date')}
                </th>
                <th className="px-4 py-3 cursor-pointer hover:text-gray-800" onClick={() => toggleSort('order_code')}>
                  Order ID{sortIndicator('order_code')}
                </th>
                <th className="px-4 py-3">Order Type 訂單類型</th>
                <th className="px-4 py-3 cursor-pointer hover:text-gray-800" onClick={() => toggleSort('capacity')}>
                  容量 Capacity{sortIndicator('capacity')}
                </th>
                <th className="px-4 py-3 cursor-pointer hover:text-gray-800" onClick={() => toggleSort('status')}>
                  Status{sortIndicator('status')}
                </th>
                <th className="px-4 py-3 whitespace-nowrap">開始炖製時間</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {sortedOrders.map((o) => (
                <tr
                  key={o.id}
                  onClick={() => router.push(`/kitchen-prep/${o.id}`)}
                  className="hover:bg-brand-50/50 cursor-pointer"
                >
                  <td className="px-4 py-3 whitespace-nowrap font-medium text-gray-900">{o.stewing_date}</td>
                  <td className="px-4 py-3 font-mono text-brand-600">
                    {o.linked_order_id ? (
                      <Link href={`/orders/${o.linked_order_id}`} onClick={(e) => e.stopPropagation()} className="hover:underline">
                        {o.order_code}
                      </Link>
                    ) : (
                      o.order_code
                    )}
                  </td>
                  <td className="px-4 py-3 text-gray-700">{PREP_ORDER_TYPE_LABELS[o.order_type]}</td>
                  <td className="px-4 py-3 font-semibold text-gray-800">{PREP_CAPACITY_LABELS[o.capacity]}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-700'}`}>
                      {PREP_STATUS_LABELS[o.status]}
                    </span>
                    {o.status === 'completed' && o.actual_yield != null && (
                      <p className="text-xs text-gray-500 mt-1">
                        Yield {o.actual_yield}
                        {o.expected_yield != null && o.actual_yield !== o.expected_yield && (
                          <span className="text-red-600 font-medium"> / exp {o.expected_yield}</span>
                        )}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-gray-600 tabular-nums">
                    {o.stewing_started_at || '—'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center justify-end gap-2">
                      {(() => {
                        const action = getPrepStatusAction(o.status);
                        if (!action) return null;
                        return (
                          <button
                            type="button"
                            disabled={advancingId === o.id}
                            onClick={(e) => { void handleStatusAction(o, e); }}
                            className="inline-flex items-center justify-center min-h-[40px] px-3 py-2 text-sm font-bold rounded-xl bg-green-600 text-white hover:bg-green-700 active:bg-green-800 shadow-sm whitespace-nowrap disabled:opacity-50"
                          >
                            {advancingId === o.id ? '更新中…' : action.label}
                          </button>
                        );
                      })()}
                      <button
                        type="button"
                        disabled={deletingId === o.id}
                        onClick={(e) => { e.stopPropagation(); remove(o.id); }}
                        className="inline-flex items-center justify-center min-h-[40px] px-3 py-2 text-sm font-medium rounded-xl border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50 whitespace-nowrap"
                      >
                        {deletingId === o.id ? BTN.deleting : BTN.delete}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {completeOrder && (
        <CompletionModal
          order={completeOrder}
          onClose={() => setCompleteOrder(null)}
          onCompleted={(updated) => {
            setCompleteOrder(null);
            setOrders((prev) => prev.map((o) => (o.id === updated.id ? updated : o)));
          }}
        />
      )}

      {showForm && (
        <div className="modal-overlay overflow-y-auto">
          <div className="modal-panel sm:max-w-2xl my-0 sm:my-8">
            <h2 className="text-lg font-semibold mb-4">New Prep Order 新增備料單</h2>
            {error && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Stewing Date 燉製日期</label>
                  <input type="date" value={form.stewing_date} onChange={(e) => setForm({ ...form, stewing_date: e.target.value })} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Order ID (optional)</label>
                  <input value={form.order_code} onChange={(e) => setForm({ ...form, order_code: e.target.value })} className={input} placeholder="Auto PREP-0001" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Order Type</label>
                <select value={form.order_type} onChange={(e) => setForm({ ...form, order_type: e.target.value as PrepOrderType })} className={input}>
                  {PREP_ORDER_TYPES.map((t) => <option key={t} value={t}>{PREP_ORDER_TYPE_LABELS[t]}</option>)}
                </select>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-600 mb-2">容量 Capacities (multi-select)</label>
                <div className="flex flex-wrap gap-2 mb-3">
                  {capacityOptions.map((c) => {
                    const selected = form.lines.some((l) => l.capacity === c.id);
                    return (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => toggleCapacity(c.id)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 min-h-[44px] ${
                          selected
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-brand-300'
                        }`}
                      >
                        {c.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {form.lines.map((line, index) => (
                <div key={`${line.capacity}-${index}`} className="border border-gray-200 rounded-lg p-4 space-y-3 bg-gray-50/50">
                  <p className="text-sm font-bold text-brand-700">{PREP_CAPACITY_LABELS[line.capacity]} 容量</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">桂花 Osmanthus</label>
                      <input type="number" min="0" value={line.qty_osmanthus} onChange={(e) => updateLine(index, { qty_osmanthus: e.target.value })} className={input} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">紅棗 Red Date</label>
                      <input
                        type="number"
                        min="0"
                        value={line.qty_red_date}
                        disabled={!isRedDateAllowed(line.capacity)}
                        onChange={(e) => updateLine(index, { qty_red_date: e.target.value })}
                        className={`${input} disabled:bg-gray-100 disabled:text-gray-400`}
                        placeholder={!isRedDateAllowed(line.capacity) ? 'N/A' : ''}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-600 mb-1">冰糖 Rock Sugar</label>
                      <input type="number" min="0" value={line.qty_rock_sugar} onChange={(e) => updateLine(index, { qty_rock_sugar: e.target.value })} className={input} />
                    </div>
                  </div>
                  <p className="text-xs text-gray-500">桂花: 片糖 only · 紅棗/冰糖: 冰糖 only (no 片糖)</p>
                </div>
              ))}

              <div className="flex gap-3 pt-2">
                <button onClick={save} disabled={saving} className="flex-1 py-2.5 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium min-h-[48px]">
                  {saving ? BTN.creating : form.lines.length > 1 ? bi(`Create ${form.lines.length} Orders`, `建立 ${form.lines.length} 張訂單`) : bi('Create & Open Calculator', '建立並開啟計算器')}
                </button>
                <button onClick={() => setShowForm(false)} className="flex-1 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium min-h-[48px]">{BTN.cancel}</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
