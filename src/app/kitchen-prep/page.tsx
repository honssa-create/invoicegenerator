'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import CompletionModal from '@/components/kitchen-prep/CompletionModal';
import {
  PREP_CAPACITIES,
  PREP_CAPACITY_LABELS,
  PREP_ORDER_TYPES,
  PREP_ORDER_TYPE_LABELS,
  PREP_STATUS_LABELS,
  isRedDateAllowed,
  type PrepCapacity,
  type PrepOrder,
  type PrepOrderType,
} from '@/lib/kitchen-prep';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_prep: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
};

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

type SortKey = 'stewing_date' | 'order_code' | 'capacity' | 'status';
type SortDir = 'asc' | 'desc';

export default function KitchenPrepListPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<PrepOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [completeOrder, setCompleteOrder] = useState<PrepOrder | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>('stewing_date');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const load = () =>
    fetch('/api/kitchen-prep')
      .then((r) => r.json())
      .then((d) => setOrders(d.orders || []))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const sortedOrders = useMemo(() => {
    const list = [...orders];
    list.sort((a, b) => {
      let cmp = 0;
      if (sortKey === 'stewing_date') cmp = a.stewing_date.localeCompare(b.stewing_date);
      else if (sortKey === 'order_code') cmp = a.order_code.localeCompare(b.order_code);
      else if (sortKey === 'capacity') cmp = a.capacity.localeCompare(b.capacity);
      else if (sortKey === 'status') cmp = a.status.localeCompare(b.status);
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return list;
  }, [orders, sortKey, sortDir]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(key); setSortDir('asc'); }
  };

  const sortIndicator = (key: SortKey) => (sortKey === key ? (sortDir === 'asc' ? ' ↑' : ' ↓') : '');

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

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Scheduled Orders 排程列表</h2>
        </div>
        {loading ? (
          <div className="p-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" /></div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-gray-500">{bi('No scheduled prep orders yet. Create one to get started.', '尚無排程備料單。建立第一張以開始。')}</div>
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
                  <td className="px-4 py-3 text-right">
                    {o.status !== 'completed' ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setCompleteOrder(o); }}
                        className="inline-flex items-center justify-center min-h-[48px] px-4 py-2.5 text-sm sm:text-base font-bold rounded-xl bg-green-600 text-white hover:bg-green-700 active:bg-green-800 shadow-sm whitespace-nowrap"
                      >
                        {bi('完成燉製', '完成燉製')}
                      </button>
                    ) : (
                      <span className="text-xs text-gray-400">—</span>
                    )}
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
                  {PREP_CAPACITIES.map((c) => {
                    const selected = form.lines.some((l) => l.capacity === c);
                    return (
                      <button
                        key={c}
                        type="button"
                        onClick={() => toggleCapacity(c)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold border-2 min-h-[44px] ${
                          selected
                            ? 'bg-brand-600 text-white border-brand-600'
                            : 'bg-white text-gray-700 border-gray-300 hover:border-brand-300'
                        }`}
                      >
                        {PREP_CAPACITY_LABELS[c]}
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
