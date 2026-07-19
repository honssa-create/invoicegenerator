'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/components/AuthProvider';
import { formatCurrency } from '@/components/ui';
import { calculateInvoiceTotals } from '@/lib/utils';
import { isSectionReadOnly } from '@/lib/permissions';
import type { Customer } from '@/lib/types';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

const DEFAULT_ITEM: LineItem = { description: '', quantity: 1, unit_price: 0 };

export default function NewInvoicePage() {
  const router = useRouter();
  const { user, loading } = useAuth();
  const readOnly = user ? isSectionReadOnly(user.role, 'invoices') : false;
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && readOnly) router.replace('/invoices');
  }, [loading, readOnly, router]);

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  );
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('Payment due within 30 days.');
  const [status, setStatus] = useState('draft');
  const [items, setItems] = useState<LineItem[]>([{ ...DEFAULT_ITEM }]);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/customers')
      .then((res) => res.json())
      .then((data) => setCustomers(data.customers || []));
  }, []);

  const totals = calculateInvoiceTotals(items, taxRate);

  const updateItem = (index: number, field: keyof LineItem, value: string | number) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const addItem = () => setItems((prev) => [...prev, { ...DEFAULT_ITEM }]);
  const removeItem = (index: number) => {
    if (items.length > 1) setItems((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSaving(true);

    const res = await fetch('/api/invoices', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: Number(customerId),
        issue_date: issueDate,
        due_date: dueDate,
        tax_rate: taxRate,
        notes,
        terms,
        status,
        items: items.filter((i) => i.description.trim()),
      }),
    });

    const data = await res.json();
    setSaving(false);

    if (!res.ok) {
      setError(data.error || 'Failed to create invoice');
      return;
    }

    router.push(`/invoices/${data.invoice.id}`);
  };

  return (
    <AppLayout>
      <div className="mb-8">
        <Link href="/invoices" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
          ← {bi('Back to invoices', '返回發票列表')}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{TITLE.newInvoice}</h1>
      </div>

      {customers.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-yellow-800">
          {bi('You need at least one customer before creating an invoice.', '建立發票前需至少有一位客戶。')}{' '}
          <Link href="/customers" className="font-medium underline">{bi('Add a customer', '新增客戶')}</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">{bi('Invoice Details', '發票詳情')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{bi('Customer', '客戶')} *</label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                >
                  <option value="">{bi('Select customer', '選擇客戶')}</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{bi('Issue Date', '開立日期')} *</label>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{bi('Due Date', '到期日')} *</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{bi('Tax Rate (%)', '稅率 (%)')}</label>
                <input type="number" min="0" step="0.01" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{bi('Status', '狀態')}</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none">
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="paid">Paid</option>
                  <option value="overdue">Overdue</option>
                </select>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-gray-900">{bi('Line Items', '明細項目')}</h2>
              <button type="button" onClick={addItem} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                + {bi('Add line', '新增行')}
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-3 text-xs text-gray-500 uppercase font-medium">
                <div className="col-span-5">{bi('Description', '描述')}</div>
                <div className="col-span-2">{bi('Qty', '數量')}</div>
                <div className="col-span-2">{bi('Unit Price', '單價')}</div>
                <div className="col-span-2">{bi('Amount', '金額')}</div>
                <div className="col-span-1"></div>
              </div>
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-3 items-center">
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(i, 'description', e.target.value)}
                    placeholder={bi('Service or product description', '服務或產品描述')}
                    className="col-span-5 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                  />
                  <input
                    type="number" min="0" step="0.01"
                    value={item.quantity}
                    onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                  />
                  <input
                    type="number" min="0" step="0.01"
                    value={item.unit_price}
                    onChange={(e) => updateItem(i, 'unit_price', Number(e.target.value))}
                    className="col-span-2 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                  />
                  <div className="col-span-2 text-sm font-medium text-gray-900 px-1">
                    {formatCurrency(item.quantity * item.unit_price)}
                  </div>
                  <button type="button" onClick={() => removeItem(i)} className="col-span-1 text-red-500 hover:text-red-700 text-sm">
                    ✕
                  </button>
                </div>
              ))}
            </div>

            <div className="mt-6 flex justify-end">
              <div className="w-64 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">{bi('Subtotal', '小計')}</span><span>{formatCurrency(totals.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">{bi('Tax', '稅項')} ({taxRate}%)</span><span>{formatCurrency(totals.taxAmount)}</span></div>
                <div className="flex justify-between font-bold text-lg border-t pt-2"><span>{bi('Total', '總計')}</span><span>{formatCurrency(totals.total)}</span></div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{bi('Notes', '備註')}</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                placeholder={bi('Notes visible to customer', '客戶可見備註')} />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{bi('Terms & Conditions', '條款及細則')}</label>
              <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm" />
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {saving ? BTN.creating : bi('Create Invoice', '建立發票')}
            </button>
            <Link href="/invoices" className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">
              {BTN.cancel}
            </Link>
          </div>
        </form>
      )}
    </AppLayout>
  );
}
