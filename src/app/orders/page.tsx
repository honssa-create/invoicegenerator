'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { ORDER_STATUSES, STATUS_COLORS, orderTitle, type Order } from '@/lib/orders';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

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
      <div className="page-header">
        <div>
          <h1 className="page-title">{TITLE.orders}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">{bi('Manage production orders with a ClickUp-style detail view', '以 ClickUp 風格詳情頁管理生產訂單')}</p>
        </div>
        <div className="page-actions">
          <button onClick={() => { setForm(EMPTY); setShowForm(true); }} className="btn bg-brand-600 text-white hover:bg-brand-700">
            + {bi('New Order', '新增訂單')}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="p-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" /></div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center text-gray-500">{bi('No orders yet. Create your first order.', '尚無訂單。建立第一張訂單。')}</div>
        ) : (
          <div className="table-scroll">
          <table className="w-full min-w-[560px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-6 py-3">{bi('Order', '訂單')}</th>
                <th className="px-6 py-3">{bi('Status', '狀態')}</th>
                <th className="px-6 py-3">{bi('Delivery', '交貨')}</th>
                <th className="px-6 py-3">{bi('Updated', '更新')}</th>
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
          </div>
        )}
      </div>

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-panel">
            <h2 className="text-lg font-semibold mb-4">{bi('New Order', '新增訂單')}</h2>
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
                <button type="submit" disabled={saving} className="flex-1 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium">{saving ? BTN.creating : BTN.create}</button>
                <button type="button" onClick={() => setShowForm(false)} className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">{BTN.cancel}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
