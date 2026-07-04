'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { StatusBadge, PaymentStatusBadge, formatCurrency } from '@/components/ui';
import { formatDate, calculateInvoiceTotals } from '@/lib/utils';
import { useAuth } from '@/components/AuthProvider';
import type { InvoiceWithDetails, PaymentWithDetails } from '@/lib/types';

interface LineItem {
  description: string;
  quantity: number;
  unit_price: number;
}

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const [invoice, setInvoice] = useState<InvoiceWithDetails | null>(null);
  const [payments, setPayments] = useState<PaymentWithDetails[]>([]);
  const [editing, setEditing] = useState(false);
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    amount: '',
    payment_date: new Date().toISOString().slice(0, 10),
    receipt_note: '',
    receipt_filename: '',
  });
  const [verifyingId, setVerifyingId] = useState<number | null>(null);
  const [items, setItems] = useState<LineItem[]>([]);
  const [taxRate, setTaxRate] = useState(0);
  const [status, setStatus] = useState('draft');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [saving, setSaving] = useState(false);

  const loadInvoice = () => {
    fetch(`/api/invoices/${id}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.invoice) {
          setInvoice(data.invoice);
          setItems(data.invoice.items.map((i: { description: string; quantity: number; unit_price: number }) => ({
            description: i.description,
            quantity: i.quantity,
            unit_price: i.unit_price,
          })));
          setTaxRate(data.invoice.tax_rate);
          setStatus(data.invoice.status);
          setNotes(data.invoice.notes || '');
          setTerms(data.invoice.terms || '');
          setPaymentForm((prev) => ({
            ...prev,
            amount: String(data.invoice.total),
          }));
        }
      });
    fetch(`/api/payments?invoice_id=${id}`)
      .then((res) => res.json())
      .then((data) => setPayments(data.payments || []));
  };

  useEffect(() => { loadInvoice(); }, [id]);

  const handleSave = async () => {
    setSaving(true);
    const res = await fetch(`/api/invoices/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tax_rate: taxRate, status, notes, terms, items }),
    });
    setSaving(false);
    if (res.ok) {
      setEditing(false);
      loadInvoice();
    }
  };

  const handleDelete = async () => {
    if (!confirm('Delete this invoice?')) return;
    await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
    router.push('/invoices');
  };

  const handleUploadReceipt = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await fetch('/api/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        invoice_id: Number(id),
        ...paymentForm,
        amount: Number(paymentForm.amount),
      }),
    });
    if (res.ok) {
      setShowPaymentForm(false);
      loadInvoice();
    }
  };

  const handleReceiptFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setPaymentForm((prev) => ({
        ...prev,
        receipt_filename: file.name,
        receipt_note: prev.receipt_note || `Receipt: ${file.name}`,
      }));
    }
  };

  const handleVerifyPayment = async (paymentId: number) => {
    setVerifyingId(paymentId);
    const res = await fetch(`/api/payments/${paymentId}/verify`, { method: 'POST' });
    setVerifyingId(null);
    if (res.ok) loadInvoice();
  };

  const isAccountant = user?.role === 'accountant';

  if (!invoice) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      </AppLayout>
    );
  }

  const totals = editing ? calculateInvoiceTotals(items, taxRate) : {
    subtotal: invoice.subtotal,
    taxAmount: invoice.tax_amount,
    total: invoice.total,
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <Link href="/invoices" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            ← Back to invoices
          </Link>
          <div className="flex items-center gap-3 mt-2">
            <h1 className="text-2xl font-bold text-gray-900">{invoice.invoice_number}</h1>
            <StatusBadge status={invoice.status} />
          </div>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/invoices/${id}/print`}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            Print / PDF
          </Link>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">
              Edit
            </button>
          ) : (
            <>
              <button onClick={handleSave} disabled={saving} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50">
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button onClick={() => setEditing(false)} className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
                Cancel
              </button>
            </>
          )}
          <button onClick={handleDelete} className="px-4 py-2 text-red-600 border border-red-200 text-sm font-medium rounded-lg hover:bg-red-50">
            Delete
          </button>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="grid md:grid-cols-2 gap-6 mb-6">
              <div>
                <p className="text-xs text-gray-500 uppercase font-medium mb-1">Bill To</p>
                <p className="font-semibold text-gray-900">{invoice.customer_name}</p>
                {invoice.customer_email && <p className="text-sm text-gray-600">{invoice.customer_email}</p>}
                {invoice.customer_address && <p className="text-sm text-gray-600">{invoice.customer_address}</p>}
                {(invoice.customer_city || invoice.customer_state) && (
                  <p className="text-sm text-gray-600">
                    {[invoice.customer_city, invoice.customer_state, invoice.customer_zip].filter(Boolean).join(', ')}
                  </p>
                )}
              </div>
              <div className="text-right text-sm space-y-1">
                <p><span className="text-gray-500">Issue Date:</span> <span className="font-medium">{formatDate(invoice.issue_date)}</span></p>
                <p><span className="text-gray-500">Due Date:</span> <span className="font-medium">{formatDate(invoice.due_date)}</span></p>
              </div>
            </div>

            {editing && (
              <div className="mb-4 flex gap-4">
                <div>
                  <label className="text-sm text-gray-500">Status</label>
                  <select value={status} onChange={(e) => setStatus(e.target.value)}
                    className="block mt-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm">
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="paid">Paid</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>
                <div>
                  <label className="text-sm text-gray-500">Tax Rate (%)</label>
                  <input type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))}
                    className="block mt-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm w-24" />
                </div>
              </div>
            )}

            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">
                  <th className="pb-3">Description</th>
                  <th className="pb-3 text-right">Qty</th>
                  <th className="pb-3 text-right">Rate</th>
                  <th className="pb-3 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {(editing ? items : invoice.items).map((item, i) => (
                  <tr key={i}>
                    <td className="py-3 text-sm">
                      {editing ? (
                        <input value={item.description} onChange={(e) => {
                          const updated = [...items];
                          updated[i] = { ...updated[i], description: e.target.value };
                          setItems(updated);
                        }} className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                      ) : (
                        item.description
                      )}
                    </td>
                    <td className="py-3 text-sm text-right">
                      {editing ? (
                        <input type="number" value={item.quantity} onChange={(e) => {
                          const updated = [...items];
                          updated[i] = { ...updated[i], quantity: Number(e.target.value) };
                          setItems(updated);
                        }} className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right" />
                      ) : (
                        item.quantity
                      )}
                    </td>
                    <td className="py-3 text-sm text-right">
                      {editing ? (
                        <input type="number" value={item.unit_price} onChange={(e) => {
                          const updated = [...items];
                          updated[i] = { ...updated[i], unit_price: Number(e.target.value) };
                          setItems(updated);
                        }} className="w-24 px-2 py-1 border border-gray-300 rounded text-sm text-right" />
                      ) : (
                        formatCurrency(item.unit_price)
                      )}
                    </td>
                    <td className="py-3 text-sm text-right font-medium">
                      {formatCurrency(item.quantity * item.unit_price)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <div className="mt-6 flex justify-end">
              <div className="w-64 space-y-2 text-sm">
                <div className="flex justify-between"><span className="text-gray-500">Subtotal</span><span>{formatCurrency(totals.subtotal)}</span></div>
                <div className="flex justify-between"><span className="text-gray-500">Tax</span><span>{formatCurrency(totals.taxAmount)}</span></div>
                <div className="flex justify-between font-bold text-lg border-t pt-2"><span>Total</span><span>{formatCurrency(totals.total)}</span></div>
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Notes</h3>
            {editing ? (
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            ) : (
              <p className="text-sm text-gray-600">{invoice.notes || 'No notes'}</p>
            )}
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="font-semibold text-gray-900 mb-3">Terms</h3>
            {editing ? (
              <textarea value={terms} onChange={(e) => setTerms(e.target.value)} rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm" />
            ) : (
              <p className="text-sm text-gray-600">{invoice.terms || 'No terms specified'}</p>
            )}
          </div>

          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-900">Payment Flow</h3>
                <p className="text-xs text-gray-500 mt-0.5">Upload receipt → Pending Verification → Bank Cleared</p>
              </div>
              {!showPaymentForm && invoice.status !== 'paid' && (
                <button
                  onClick={() => setShowPaymentForm(true)}
                  className="px-3 py-1.5 bg-yellow-500 text-white text-xs font-medium rounded-lg hover:bg-yellow-600"
                >
                  + Upload Receipt
                </button>
              )}
            </div>

            {showPaymentForm && (
              <form onSubmit={handleUploadReceipt} className="mb-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg space-y-3">
                <div>
                  <label className="text-xs text-gray-600">Amount</label>
                  <input
                    type="number"
                    step="0.01"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                    required
                    className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Payment Date</label>
                  <input
                    type="date"
                    value={paymentForm.payment_date}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payment_date: e.target.value })}
                    required
                    className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Receipt File</label>
                  <input
                    type="file"
                    accept="image/*,.pdf"
                    onChange={handleReceiptFile}
                    className="w-full mt-1 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-gray-600">Notes</label>
                  <input
                    type="text"
                    value={paymentForm.receipt_note}
                    onChange={(e) => setPaymentForm({ ...paymentForm, receipt_note: e.target.value })}
                    className="w-full mt-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm"
                    placeholder="Payment reference or notes"
                  />
                </div>
                <div className="flex gap-2">
                  <button type="submit" className="px-3 py-1.5 bg-yellow-600 text-white text-xs font-medium rounded-lg hover:bg-yellow-700">
                    Submit for Verification
                  </button>
                  <button type="button" onClick={() => setShowPaymentForm(false)} className="px-3 py-1.5 border border-gray-300 text-xs font-medium rounded-lg hover:bg-gray-50">
                    Cancel
                  </button>
                </div>
              </form>
            )}

            {payments.length === 0 ? (
              <p className="text-sm text-gray-500">No payments recorded yet.</p>
            ) : (
              <div className="space-y-3">
                {payments.map((pay) => (
                  <div key={pay.id} className="p-3 border border-gray-100 rounded-lg">
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium">{formatCurrency(pay.amount)}</span>
                      <PaymentStatusBadge status={pay.status} />
                    </div>
                    <p className="text-xs text-gray-500 mt-1">{formatDate(pay.payment_date)}</p>
                    {pay.receipt_filename && (
                      <p className="text-xs text-gray-500">📎 {pay.receipt_filename}</p>
                    )}
                    {pay.receipt_note && (
                      <p className="text-xs text-gray-600 mt-1">{pay.receipt_note}</p>
                    )}
                    {pay.status === 'pending_verification' && isAccountant && (
                      <button
                        onClick={() => handleVerifyPayment(pay.id)}
                        disabled={verifyingId === pay.id}
                        className="mt-2 px-3 py-1 bg-green-600 text-white text-xs font-medium rounded-lg hover:bg-green-700 disabled:opacity-50"
                      >
                        {verifyingId === pay.id ? 'Verifying...' : 'Verify (Bank Cleared)'}
                      </button>
                    )}
                    {pay.status === 'bank_cleared' && pay.verified_by_name && (
                      <p className="text-xs text-green-700 mt-1">Verified by {pay.verified_by_name}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
