'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import type { Customer } from '@/lib/types';
import { ORDER_TYPES } from '@/lib/orders';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

const EMPTY_FORM = { name: '', company_name: '', email: '', phone: '', address: '', ordered: '' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const loadCustomers = () => {
    fetch('/api/customers')
      .then((res) => res.json())
      .then((data) => setCustomers(data.customers || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadCustomers(); }, []);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditingId(null);
    setShowForm(true);
    setError('');
  };

  const openEdit = (customer: Customer) => {
    setForm({
      name: customer.name,
      company_name: customer.company_name || '',
      email: customer.email || '',
      phone: customer.phone || '',
      address: customer.address || '',
      ordered: customer.ordered || '',
    });
    setEditingId(customer.id);
    setShowForm(true);
    setError('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    const url = editingId ? `/api/customers/${editingId}` : '/api/customers';
    const method = editingId ? 'PUT' : 'POST';

    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(form),
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Failed to save customer');
      return;
    }
    setShowForm(false);
    loadCustomers();
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Move this customer to Deleted Records? You can restore it within 60 days.')) return;
    const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || 'Failed to delete');
      return;
    }
    loadCustomers();
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{TITLE.customers}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">{bi('Manage your client list', '管理客戶名單')}</p>
        </div>
        <div className="page-actions">
          <button onClick={openCreate} className="btn bg-brand-600 text-white hover:bg-brand-700">
            + {bi('Add Customer', '新增客戶')}
          </button>
        </div>
      </div>

      {showForm && (
        <div className="modal-overlay">
          <div className="modal-panel">
            <h2 className="text-lg font-semibold mb-4">
              {editingId ? bi('Edit Customer', '編輯客戶') : bi('New Customer', '新增客戶')}
            </h2>
            {error && (
              <div className="mb-4 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>
            )}
            <form onSubmit={handleSubmit} className="space-y-3">
              <input
                placeholder={bi('Name *', '名稱 *')}
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <input
                placeholder="公司名"
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <input
                placeholder={bi('Email', '電郵')}
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <input
                placeholder={bi('Phone', '電話')}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <textarea
                placeholder={bi('Address', '地址')}
                value={form.address}
                onChange={(e) => setForm({ ...form, address: e.target.value })}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
              />
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">{bi('Order type', '訂單類型')}</label>
                {editingId ? (
                  <input
                    value={form.ordered}
                    readOnly
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg bg-gray-50 text-gray-600 outline-none"
                  />
                ) : (
                  <select
                    value={form.ordered}
                    onChange={(e) => setForm({ ...form, ordered: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none bg-white"
                  >
                    <option value="">{bi('Select order type', '選擇訂單類型')}</option>
                    {ORDER_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                )}
              </div>
              <div className="flex gap-3 pt-2">
                <button type="submit" className="flex-1 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700">
                  {editingId ? BTN.update : BTN.create}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
                >
                  {BTN.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
          </div>
        ) : customers.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p>{bi('No customers yet. Add your first client to start invoicing.', '尚無客戶。新增第一位客戶以開始開立發票。')}</p>
          </div>
        ) : (
          <div className="table-scroll">
          <table className="w-full min-w-[720px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-6 py-3">{bi('Name', '名稱')}</th>
                <th className="px-6 py-3">公司名</th>
                <th className="px-6 py-3">{bi('Email', '電郵')}</th>
                <th className="px-6 py-3">{bi('Phone', '電話')}</th>
                <th className="px-6 py-3">{bi('Address', '地址')}</th>
                <th className="px-6 py-3">{bi('Ordered', '訂單類型')}</th>
                <th className="px-6 py-3">{bi('Actions', '操作')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {customers.map((c) => (
                <tr key={c.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{c.name}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{c.company_name || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{c.email || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600">{c.phone || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-600 max-w-[200px] truncate" title={c.address || ''}>
                    {c.address || '—'}
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">{c.ordered || '—'}</td>
                  <td className="px-6 py-4 text-sm space-x-3">
                    <button onClick={() => openEdit(c)} className="text-brand-600 hover:text-brand-700 font-medium">
                      {BTN.edit}
                    </button>
                    <button onClick={() => handleDelete(c.id)} className="text-red-600 hover:text-red-700 font-medium">
                      {BTN.delete}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
