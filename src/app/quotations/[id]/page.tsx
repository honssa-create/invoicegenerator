'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import ActivityFeed from '@/components/ActivityFeed';
import { formatCurrency } from '@/components/ui';
import { calculateInvoiceTotals } from '@/lib/utils';
import { QUOTATION_STATUSES, QUOTATION_STATUS_COLORS, type QuotationWithDetails } from '@/lib/quotations';
import type { Customer } from '@/lib/types';

interface LineItem { description: string; quantity: number; unit_price: number; }

export default function QuotationDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [quote, setQuote] = useState<QuotationWithDetails | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [issueDate, setIssueDate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [taxRate, setTaxRate] = useState(0);
  const [status, setStatus] = useState('draft');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [items, setItems] = useState<LineItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const [copying, setCopying] = useState(false);

  const load = () => {
    fetch(`/api/quotations/${id}`)
      .then((r) => r.json())
      .then((d) => {
        const q: QuotationWithDetails = d.quotation;
        if (!q) return;
        setQuote(q);
        setCustomerId(q.customer_id ? String(q.customer_id) : '');
        setIssueDate(q.issue_date);
        setValidUntil(q.valid_until || '');
        setTaxRate(q.tax_rate);
        setStatus(q.status);
        setNotes(q.notes || '');
        setTerms(q.terms || '');
        setItems(q.items.map((i) => ({ description: i.description, quantity: i.quantity, unit_price: i.unit_price })));
      });
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => { fetch('/api/customers').then((r) => r.json()).then((d) => setCustomers(d.customers || [])); }, []);

  const totals = calculateInvoiceTotals(items, taxRate);

  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/quotations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customer_id: customerId ? Number(customerId) : null, issue_date: issueDate, valid_until: validUntil, tax_rate: taxRate, status, notes, terms, items: items.filter((i) => i.description.trim()) }),
    });
    setSaving(false);
    if (res.ok) { setMsg('Saved'); load(); setTimeout(() => setMsg(''), 2000); }
  };

  const convert = async (target: 'invoice' | 'order') => {
    await save();
    const res = await fetch(`/api/quotations/${id}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    const data = await res.json();
    if (!res.ok) { alert(data.error || 'Conversion failed'); return; }
    router.push(target === 'invoice' ? `/invoices/${data.id}` : `/orders/${data.id}`);
  };

  // Copy this quotation into a brand-new invoice without modifying the original.
  const copyToInvoice = async () => {
    setCopying(true);
    // Persist any in-progress edits so the copy reflects the latest line items.
    await save();
    const res = await fetch(`/api/quotations/${id}/copy-to-invoice`, { method: 'POST' });
    const data = await res.json();
    setCopying(false);
    if (!res.ok) {
      setToast({ text: data.error || 'Failed to copy quotation', kind: 'error' });
      setTimeout(() => setToast(null), 5000);
      return;
    }
    setToast({ text: 'Successfully copied Quotation to a new Invoice!', kind: 'success' });
    setTimeout(() => router.push(`/invoices/${data.id}`), 1500);
  };

  const del = async () => {
    if (!confirm('Delete this quotation?')) return;
    await fetch(`/api/quotations/${id}`, { method: 'DELETE' });
    router.push('/quotations');
  };

  const updateItem = (i: number, field: keyof LineItem, value: string | number) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)));
  const addItem = () => setItems((prev) => [...prev, { description: '', quantity: 1, unit_price: 0 }]);
  const removeItem = (i: number) => setItems((prev) => prev.filter((_, idx) => idx !== i));

  if (!quote) {
    return <AppLayout><div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div></AppLayout>;
  }

  const inputCls = 'px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <Link href="/quotations" className="text-sm text-brand-600 hover:text-brand-700 font-medium">← Back to quotations</Link>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <h1 className="page-title">{quote.quote_number}</h1>
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${QUOTATION_STATUS_COLORS[status]}`}>{status}</span>
          </div>
        </div>
        <div className="page-actions">
          <Link href={`/quotations/${id}/print`} className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">🧾 Generate PDF</Link>
          <a href={`/api/quotations/${id}/export`} className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">⬇ Export Excel</a>
          <button onClick={copyToInvoice} disabled={copying} className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50">{copying ? 'Copying…' : '📋 Copy to New Invoice'}</button>
          <button onClick={() => convert('order')} className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700">→ Convert to Order</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
          <button onClick={del} className="px-4 py-2 text-red-600 border border-red-200 text-sm font-medium rounded-lg hover:bg-red-50">Delete</button>
        </div>
      </div>
      {msg && <div className="mb-4 text-sm text-green-700">{msg}</div>}

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="grid md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Customer</label>
                <select value={customerId} onChange={(e) => setCustomerId(e.target.value)} className={`${inputCls} w-full`}>
                  <option value="">— None —</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputCls} w-full`}>
                  {QUOTATION_STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Issue Date</label>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Valid Until</label>
                <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} className={`${inputCls} w-full`} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Tax Rate (%)</label>
                <input type="number" step="0.01" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className={`${inputCls} w-full`} />
              </div>
            </div>

            <div className="flex items-center justify-between mb-2">
              <h2 className="font-semibold text-gray-900">Line Items</h2>
              <button onClick={addItem} className="text-sm text-brand-600 hover:text-brand-700 font-medium">+ Add line</button>
            </div>
            <div className="space-y-2">
              <div className="grid grid-cols-12 gap-2 text-xs text-gray-500 uppercase font-medium">
                <div className="col-span-6">Description</div><div className="col-span-2">Qty</div><div className="col-span-2">Unit Price</div><div className="col-span-1">Amount</div><div className="col-span-1"></div>
              </div>
              {items.map((item, i) => (
                <div key={i} className="grid grid-cols-12 gap-2 items-center">
                  <input value={item.description} onChange={(e) => updateItem(i, 'description', e.target.value)} placeholder="Description" className="col-span-6 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <input type="number" value={item.quantity} onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))} className="col-span-2 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <input type="number" value={item.unit_price} onChange={(e) => updateItem(i, 'unit_price', Number(e.target.value))} className="col-span-2 px-2 py-1.5 border border-gray-300 rounded text-sm" />
                  <div className="col-span-1 text-sm">{formatCurrency(item.quantity * item.unit_price)}</div>
                  <button onClick={() => removeItem(i)} className="col-span-1 text-red-500 hover:text-red-700 text-sm">✕</button>
                </div>
              ))}
              {items.length === 0 && <p className="text-sm text-gray-400 py-2">No line items. Click “+ Add line”.</p>}
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
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} className={`${inputCls} w-full`} />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Terms</label>
              <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3} className={`${inputCls} w-full`} />
            </div>
          </div>
        </div>

        <div>
          <ActivityFeed entityType="quotation" entityId={quote.id} className="max-h-[600px]" />
        </div>
      </div>

      {toast && (
        <div className={`fixed bottom-6 right-6 z-[80] px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${toast.kind === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'}`}>
          {toast.text}
        </div>
      )}
    </AppLayout>
  );
}
