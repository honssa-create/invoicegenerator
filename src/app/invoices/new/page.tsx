'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { formatCurrency } from '@/components/ui';
import { calculateInvoiceTotals } from '@/lib/utils';
import type { Customer } from '@/lib/types';

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

const DEFAULT_ITEM: LineItem = { description: '', quantity: 1, unit_price: 0 };

export default function NewInvoicePage() {
  const router = useRouter();
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
  const [saving, setSaving] = useState(false);

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
          ← Back to invoices
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">New Invoice</h1>
      </div>

      {customers.length === 0 ? (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-6 text-yellow-800">
          You need at least one customer before creating an invoice.{' '}
          <Link href="/customers" className="font-medium underline">Add a customer</Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Invoice Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Customer *</label>
                <select
                  value={customerId}
                  onChange={(e) => setCustomerId(e.target.value)}
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none"
                >
                  <option value="">Select customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Issue Date *</label>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Due Date *</label>
                <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} required
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tax Rate (%)</label>
                <input type="number" min="0" step="0.01" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
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
              <h2 className="font-semibold text-gray-900">Line Items</h2>
              <button type="button" onClick={addItem} className="text-sm text-brand-600 hover:text-brand-700 font-medium">
                + Add line
              </button>
            </div>
            <div className="space-y-3">
              <div className="grid grid-cols-12 gap-3 text-xs text-gray-500 uppercase font-medium">
                <div className="col-span-5">Description</div>
                <div className="col-span-2">Qty</div>
                <div className="col-span-2">Unit Price</div>
                <div className="col-span-2">Amount</div>
                <div className="col-span-1"></div>
              </div>
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-3 items-center">
                  <input
                    value={item.description}
                    onChange={(e) => updateItem(i, 'description', e.target.value)}
                    placeholder="Service or product description"
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
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Tax ({taxRate}%)</span><span>{formatCurrency(totals.taxAmount)}</span></div>
                <div className="flex justify-between font-bold text-lg border-t pt-2"><span>Total</span><span>{formatCurrency(totals.total)}</span></div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6 grid md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                placeholder="Notes visible to customer" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Terms & Conditions</label>
              <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm" />
            </div>
          </div>

          <div className="flex gap-3">
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {saving ? 'Creating...' : 'Create Invoice'}
            </button>
            <Link href="/invoices" className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">
              Cancel
            </Link>
          </div>
        </form>
      )}
    </AppLayout>
  );
}
