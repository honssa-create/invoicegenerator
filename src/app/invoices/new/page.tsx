'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import CustomerSelect from '@/components/CustomerSelect';
import { useAuth } from '@/components/AuthProvider';
import { formatCurrency } from '@/components/ui';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { calculateInvoiceTotals } from '@/lib/utils';
import type { Customer } from '@/lib/types';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

interface LineItem {
  service_date: string;
  product_service: string;
  description: string;
  quantity: number;
  unit_price: number;
}

const emptyLine = (): LineItem => ({
  service_date: '',
  product_service: '',
  description: '',
  quantity: 1,
  unit_price: 0,
});

export default function NewInvoicePage() {
  const router = useRouter();
  const { loading, isSectionReadOnly } = useAuth();
  const readOnly = isSectionReadOnly('invoices');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!loading && readOnly) router.replace('/invoices');
  }, [loading, readOnly, router]);

  const [customerId, setCustomerId] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [issueDate, setIssueDate] = useState(new Date().toISOString().split('T')[0]);
  const [dueDate, setDueDate] = useState(
    new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0]
  );
  const [taxRate, setTaxRate] = useState(0);
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('Payment due within 30 days.');
  const [status, setStatus] = useState('draft');
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);
  const [error, setError] = useState('');

  const totals = calculateInvoiceTotals(items, taxRate);

  const isDirty = useMemo(() => {
    const hasLineContent = items.some((item) => item.description.trim() || item.product_service.trim());
    const defaultDue = new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0];
    const defaultIssue = new Date().toISOString().split('T')[0];
    return Boolean(
      customerId ||
        customerName.trim() ||
        notes.trim() ||
        terms !== 'Payment due within 30 days.' ||
        taxRate !== 0 ||
        status !== 'draft' ||
        hasLineContent ||
        issueDate !== defaultIssue ||
        dueDate !== defaultDue,
    );
  }, [customerId, customerName, notes, terms, taxRate, status, items, issueDate, dueDate]);

  useUnsavedChangesWarning(!readOnly && isDirty);

  const updateItem = (index: number, field: keyof LineItem, value: string | number) => {
    setItems((prev) => prev.map((item, i) => (i === index ? { ...item, [field]: value } : item)));
  };

  const addItem = () => setItems((prev) => [...prev, emptyLine()]);
  const clearItems = () => setItems([emptyLine()]);
  const removeItem = (index: number) => {
    setItems((prev) => (prev.length <= 1 ? [emptyLine()] : prev.filter((_, i) => i !== index)));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const lineItems = items.filter((i) => i.description.trim() || i.product_service.trim());
    if (!customerId) {
      setError(bi('Select a customer.', '請選擇客戶。'));
      return;
    }
    if (!lineItems.length) {
      setError(bi('Add at least one line item with a product/service or description.', '請至少新增一項產品／服務或描述。'));
      return;
    }

    setSaving(true);
    try {
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
          items: lineItems,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError((data as { error?: string }).error || 'Failed to create invoice');
        return;
      }

      const createdId = (data as { invoice?: { id?: number } }).invoice?.id;
      if (!createdId) {
        setError('Failed to create invoice');
        return;
      }

      router.push(`/invoices/${createdId}`);
    } catch {
      setError(bi('Failed to create invoice. Please try again.', '建立發票失敗，請再試一次。'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      <div className="mb-8">
        <Link href="/invoices" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
          ← {bi('Back to invoices', '返回發票列表')}
        </Link>
        <h1 className="text-2xl font-bold text-gray-900 mt-2">{TITLE.newInvoice}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">{error}</div>
          )}

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">{bi('Invoice Details', '發票詳情')}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">{bi('Customer', '客戶')} *</label>
                <CustomerSelect
                  value={customerName}
                  onSelect={(c) => {
                    setCustomerId(String(c.id));
                    setCustomerName(c.name);
                  }}
                  placeholder={bi('Select or add customer…', '選擇或新增客戶…')}
                />
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

          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-gray-100">
              <h2 className="font-semibold text-gray-900">{bi('Line Items', '明細項目')}</h2>
            </div>
            <div className="p-5 overflow-x-auto">
              <table className="w-full min-w-[900px] text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                    <th className="text-left py-2 pr-2 font-medium w-8">#</th>
                    <th className="text-left py-2 pr-2 font-medium">{bi('Service date', '服務日期')}</th>
                    <th className="text-left py-2 pr-2 font-medium">{bi('Product/Service', '產品／服務')}</th>
                    <th className="text-left py-2 pr-2 font-medium">{bi('Description', '描述')}</th>
                    <th className="text-right py-2 pr-2 font-medium w-20">{bi('Qty', '數量')}</th>
                    <th className="text-right py-2 pr-2 font-medium w-24">{bi('Rate', '單價')}</th>
                    <th className="text-right py-2 pr-6 font-medium w-32">{bi('Amount', '金額')} (HKD)</th>
                    <th className="w-10 pr-2" />
                  </tr>
                </thead>
                <tbody>
                  {items.map((item, i) => (
                    <tr key={i} className="border-b border-gray-100 align-top">
                      <td className="py-2 pr-2 text-gray-400">{i + 1}</td>
                      <td className="py-2 pr-2">
                        <input
                          type="date"
                          value={item.service_date}
                          onChange={(e) => updateItem(i, 'service_date', e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          value={item.product_service}
                          onChange={(e) => updateItem(i, 'product_service', e.target.value)}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                          placeholder={bi('Product / service', '產品／服務')}
                        />
                      </td>
                      <td className="py-2 pr-2 min-w-[220px]">
                        <textarea
                          value={item.description}
                          onChange={(e) => updateItem(i, 'description', e.target.value)}
                          rows={3}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm resize-y min-h-[4.5rem]"
                          placeholder={bi('Description', '描述')}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          value={item.quantity}
                          onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-right"
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          type="number"
                          value={item.unit_price}
                          onChange={(e) => updateItem(i, 'unit_price', Number(e.target.value))}
                          className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-right"
                        />
                      </td>
                      <td className="py-2 pr-6 text-right tabular-nums pt-3">
                        {formatCurrency(item.quantity * item.unit_price)}
                      </td>
                      <td className="py-2 pr-2">
                        <button
                          type="button"
                          onClick={() => removeItem(i)}
                          className="text-gray-400 hover:text-red-600 text-sm px-1"
                          title={bi('Remove line', '刪除此行')}
                        >
                          🗑
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className="flex flex-wrap gap-2 mt-3">
                <button
                  type="button"
                  onClick={addItem}
                  className="px-3 py-1.5 text-sm font-medium text-brand-700 border border-brand-200 rounded-md hover:bg-brand-50"
                >
                  {bi('Add lines', '新增行')}
                </button>
                <button
                  type="button"
                  onClick={clearItems}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
                >
                  {bi('Clear all lines', '清除全部')}
                </button>
              </div>
            </div>

            <div className="px-6 pb-5 flex justify-end">
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

          <div className="flex flex-wrap items-center gap-3">
            <button type="submit" disabled={saving}
              className="px-6 py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
              {saving ? BTN.creating : bi('Create Invoice', '建立發票')}
            </button>
            <Link href="/invoices" className="px-6 py-2.5 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium">
              {BTN.cancel}
            </Link>
            {error && <p className="text-sm text-red-600">{error}</p>}
          </div>
        </form>
    </AppLayout>
  );
}
