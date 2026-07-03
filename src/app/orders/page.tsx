'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { ORDER_STATUSES, STATUS_COLORS, orderTitle, type Order } from '@/lib/orders';

const EMPTY = { po_number: '', name: '', description: '', delivery_date: '' };

export default function OrdersPage() {
  const router = useRouter();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/orders')
      .then((r) => r.json())
      .then((d) => setOrders(d.orders || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    setSaving(false);
    if (res.ok && data.order) router.push(`/orders/${data.order.id}`);
  };

  const inputCls = 'w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm';

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Orders 訂單管理</h1>
          <p className="text-gray-500 mt-1">Manage production orders with a ClickUp-style detail view</p>
        </div>
        <button onClick={() => { setForm(EMPTY); setShowForm(true); }} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
          + New Order
        </button>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="p-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" /></div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No orders yet. Create your first order.</div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-6 py-3">Order</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Delivery</th>
                <th className="px-6 py-3">Updated</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {orders.map((o) => (
                <tr key={o.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link href={`/orders/${o.id}`} className="text-brand-600 hover:text-brand-700 font-medium text-sm">{orderTitle(o)}</Link>
                  </td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[o.status] || 'bg-gray-100 text-gray-700'}`}>{o.status}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-500">{o.delivery_date || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-400">{o.updated_at?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl w-full max-w-lg p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-4">New Order</h2>
            <form onSubmit={create} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">PO# *</label>
                <input required value={form.po_number} onChange={(e) => setForm({ ...form, po_number: e.target.value })} className={inputCls} placeholder="e.g. H3219" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name (客戶)</label>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className={inputCls} placeholder="e.g. Hoi Yan Chan" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Description 描述</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} className={inputCls} placeholder="e.g. 4款亞加力" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Delivery Date 交貨日期</label>
                <input value={form.delivery_date} onChange={(e) => setForm({ ...form, delivery_date: e.target.value })} className={inputCls} placeholder="e.g. 22/1" />
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="flex-1 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium">{saving ? 'Creating…' : 'Create'}</button>
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">Cancel</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
