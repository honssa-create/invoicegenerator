'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
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

const STATUS_COLORS: Record<string, string> = {
  scheduled: 'bg-blue-100 text-blue-700',
  in_prep: 'bg-amber-100 text-amber-700',
  completed: 'bg-green-100 text-green-700',
};

interface FormState {
  stewing_date: string;
  order_type: PrepOrderType;
  capacity: PrepCapacity;
  qty_osmanthus: string;
  qty_red_date: string;
  qty_rock_sugar: string;
  order_code: string;
}

const EMPTY: FormState = {
  stewing_date: new Date().toISOString().slice(0, 10),
  order_type: 'daily',
  capacity: '45g',
  qty_osmanthus: '',
  qty_red_date: '',
  qty_rock_sugar: '',
  order_code: '',
};

export default function KitchenPrepListPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<PrepOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const load = () =>
    fetch('/api/kitchen-prep')
      .then((r) => r.json())
      .then((d) => setOrders(d.orders || []))
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const save = async () => {
    setError('');
    setSaving(true);
    const res = await fetch('/api/kitchen-prep', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        qty_osmanthus: Number(form.qty_osmanthus) || 0,
        qty_red_date: Number(form.qty_red_date) || 0,
        qty_rock_sugar: Number(form.qty_rock_sugar) || 0,
      }),
    });
    const d = await res.json();
    setSaving(false);
    if (!res.ok) { setError(d.error || 'Failed'); return; }
    setShowForm(false);
    setForm(EMPTY);
    router.push(`/kitchen-prep/${d.order.id}`);
  };

  const input = 'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8 flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Kitchen Prep 廚房備料系統</h1>
          <p className="text-gray-500 mt-1">Scheduled stewing orders — click a row to open the ingredient calculator</p>
        </div>
        <button onClick={() => { setError(''); setShowForm(true); }} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
          + New Prep Order 新增備料單
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="font-semibold text-gray-900">Scheduled Orders 排程列表</h2>
        </div>
        {loading ? (
          <div className="p-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" /></div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No scheduled prep orders yet. Create one to get started.</div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-4 py-3">Target Stewing Date 燉製日期</th>
                <th className="px-4 py-3">Order ID</th>
                <th className="px-4 py-3">Order Type 訂單類型</th>
                <th className="px-4 py-3">Capacity</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((o) => (
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
                  <td className="px-4 py-3 text-gray-600">{PREP_CAPACITY_LABELS[o.capacity]}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-700'}`}>
                      {PREP_STATUS_LABELS[o.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4 overflow-y-auto">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-xl my-8">
            <h2 className="text-lg font-semibold mb-4">New Prep Order 新增備料單</h2>
            {error && <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Stewing Date 燉製日期</label>
                  <input type="date" value={form.stewing_date} onChange={(e) => setForm({ ...form, stewing_date: e.target.value })} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Order ID (optional)</label>
                  <input value={form.order_code} onChange={(e) => setForm({ ...form, order_code: e.target.value })} className={input} placeholder="Auto PREP-0001" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Order Type</label>
                  <select value={form.order_type} onChange={(e) => setForm({ ...form, order_type: e.target.value as PrepOrderType })} className={input}>
                    {PREP_ORDER_TYPES.map((t) => <option key={t} value={t}>{PREP_ORDER_TYPE_LABELS[t]}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Capacity 容量</label>
                  <select value={form.capacity} onChange={(e) => setForm({ ...form, capacity: e.target.value as PrepCapacity, qty_red_date: e.target.value === '25g' ? '' : form.qty_red_date })} className={input}>
                    {PREP_CAPACITIES.map((c) => <option key={c} value={c}>{PREP_CAPACITY_LABELS[c]}</option>)}
                  </select>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">桂花 Osmanthus</label>
                  <input type="number" min="0" value={form.qty_osmanthus} onChange={(e) => setForm({ ...form, qty_osmanthus: e.target.value })} className={input} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">紅棗 Red Date</label>
                  <input type="number" min="0" value={form.qty_red_date} disabled={!isRedDateAllowed(form.capacity)} onChange={(e) => setForm({ ...form, qty_red_date: e.target.value })} className={`${input} disabled:bg-gray-100 disabled:text-gray-400`} placeholder={!isRedDateAllowed(form.capacity) ? 'N/A' : ''} />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">冰糖 Rock Sugar</label>
                  <input type="number" min="0" value={form.qty_rock_sugar} onChange={(e) => setForm({ ...form, qty_rock_sugar: e.target.value })} className={input} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button onClick={save} disabled={saving} className="flex-1 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium">{saving ? 'Creating…' : 'Create & Open Calculator'}</button>
                <button onClick={() => setShowForm(false)} className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">Cancel</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
