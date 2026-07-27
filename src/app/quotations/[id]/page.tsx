'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import ActivityFeed from '@/components/ActivityFeed';
import { useAuth } from '@/components/AuthProvider';
import { formatCurrency } from '@/components/ui';
import { isSectionReadOnly } from '@/lib/permissions';
import {
  calculateQuotationTotals,
  QUOTATION_STATUSES,
  QUOTATION_STATUS_COLORS,
  QUOTATION_STATUS_FORM_LABEL,
  type QuotationDiscountType,
  type QuotationWithDetails,
} from '@/lib/quotations';
import type { Customer } from '@/lib/types';
import { BTN, MSG, bi } from '@/lib/ui-labels';

interface LineItem {
  service_date: string;
  product_service: string;
  description: string;
  quantity: number;
  unit_price: number;
  class_name: string;
}

const emptyLine = (): LineItem => ({
  service_date: '',
  product_service: '',
  description: '',
  quantity: 1,
  unit_price: 0,
  class_name: '',
});

export default function QuotationDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const readOnly = user ? isSectionReadOnly(user.role, 'quotations') : false;
  const [quote, setQuote] = useState<QuotationWithDetails | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState('');
  const [email, setEmail] = useState('');
  const [sendLater, setSendLater] = useState(false);
  const [issueDate, setIssueDate] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [taxRate, setTaxRate] = useState(0);
  const [status, setStatus] = useState('draft');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState('');
  const [billingAddress, setBillingAddress] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shipVia, setShipVia] = useState('');
  const [shippingDate, setShippingDate] = useState('');
  const [trackingNo, setTrackingNo] = useState('');
  const [orderNo, setOrderNo] = useState('');
  const [receiptDate, setReceiptDate] = useState('');
  const [currency, setCurrency] = useState('HKD');
  const [discountType, setDiscountType] = useState<QuotationDiscountType>('percent');
  const [discountValue, setDiscountValue] = useState(0);
  const [shippingAmount, setShippingAmount] = useState(0);
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);
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
        setEmail(q.email || q.customer_email || '');
        setSendLater(Boolean(q.send_later));
        setIssueDate(q.issue_date);
        setValidUntil(q.valid_until || '');
        setTaxRate(q.tax_rate);
        setStatus(q.status);
        setNotes(q.notes || '');
        setTerms(q.terms || '');
        setBillingAddress(q.billing_address || '');
        setShippingAddress(q.shipping_address || '');
        setShipVia(q.ship_via || '');
        setShippingDate(q.shipping_date || '');
        setTrackingNo(q.tracking_no || '');
        setOrderNo(q.order_no || '');
        setReceiptDate(q.receipt_date || '');
        setCurrency(q.currency || 'HKD');
        setDiscountType(q.discount_type || 'percent');
        setDiscountValue(q.discount_value || 0);
        setShippingAmount(q.shipping_amount || 0);
        setItems(
          q.items.length
            ? q.items.map((i) => ({
                service_date: i.service_date || '',
                product_service: i.product_service || '',
                description: i.description || '',
                quantity: i.quantity,
                unit_price: i.unit_price,
                class_name: i.class_name || '',
              }))
            : [emptyLine()]
        );
      });
  };
  useEffect(() => {
    load();
  }, [id]);
  useEffect(() => {
    fetch('/api/customers')
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers || []));
  }, []);

  const totals = useMemo(
    () =>
      calculateQuotationTotals(items, {
        taxRate,
        discountType,
        discountValue,
        shippingAmount,
      }),
    [items, taxRate, discountType, discountValue, shippingAmount]
  );

  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/quotations/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId ? Number(customerId) : null,
        issue_date: issueDate,
        valid_until: validUntil,
        tax_rate: taxRate,
        status,
        notes,
        terms,
        billing_address: billingAddress,
        shipping_address: shippingAddress,
        email,
        send_later: sendLater,
        ship_via: shipVia,
        shipping_date: shippingDate,
        tracking_no: trackingNo,
        order_no: orderNo,
        receipt_date: receiptDate,
        currency,
        discount_type: discountType,
        discount_value: discountValue,
        shipping_amount: shippingAmount,
        items: items.filter((i) => i.description.trim() || i.product_service.trim()),
      }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg('Saved');
      load();
      setTimeout(() => setMsg(''), 2000);
    }
  };

  const convert = async (target: 'invoice' | 'order') => {
    await save();
    const res = await fetch(`/api/quotations/${id}/convert`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ target }),
    });
    const data = await res.json();
    if (!res.ok) {
      alert(data.error || MSG.conversionFailed);
      return;
    }
    router.push(target === 'invoice' ? `/invoices/${data.id}` : `/orders/${data.id}`);
  };

  const copyToInvoice = async () => {
    setCopying(true);
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
    if (!confirm('Move this quotation to Deleted Records? You can restore it within 60 days.')) return;
    await fetch(`/api/quotations/${id}`, { method: 'DELETE' });
    router.push('/quotations');
  };

  const updateItem = (i: number, field: keyof LineItem, value: string | number) =>
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, [field]: value } : it)));
  const addItem = () => setItems((prev) => [...prev, emptyLine()]);
  const clearItems = () => setItems([emptyLine()]);
  const removeItem = (i: number) =>
    setItems((prev) => (prev.length <= 1 ? [emptyLine()] : prev.filter((_, idx) => idx !== i)));

  const applyCustomer = (nextId: string) => {
    setCustomerId(nextId);
    if (!nextId) return;
    const c = customers.find((x) => String(x.id) === nextId);
    if (!c) return;
    if (!email.trim() && c.email) setEmail(c.email);
    const composed = [c.name, c.address, [c.city, c.state, c.zip].filter(Boolean).join(', '), c.phone]
      .filter(Boolean)
      .join('\n');
    if (!billingAddress.trim() && composed) setBillingAddress(composed);
    if (!shippingAddress.trim() && composed) setShippingAddress(composed);
  };

  if (!quote) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      </AppLayout>
    );
  }

  const inputCls =
    'w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-brand-500 outline-none disabled:bg-gray-50';
  const labelCls = 'block text-xs font-medium text-gray-600 mb-1';
  const hintCls = 'text-[11px] text-gray-400 mt-0.5';
  const currencyLabel = currency || 'HKD';

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <Link href="/quotations" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            ← {bi('Back to quotations', '返回報價單')}
          </Link>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <h1 className="page-title">{quote.quote_number}</h1>
            <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${QUOTATION_STATUS_COLORS[status]}`}>
              {QUOTATION_STATUS_FORM_LABEL[status as keyof typeof QUOTATION_STATUS_FORM_LABEL] || status}
            </span>
          </div>
        </div>
        <div className="page-actions">
          <Link href={`/quotations/${id}/print`} className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
            🧾 {bi('Generate PDF', '產生 PDF')}
          </Link>
          <a href={`/api/quotations/${id}/export`} className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50">
            ⬇ {BTN.exportExcel}
          </a>
          {!readOnly && (
            <>
              <button
                onClick={copyToInvoice}
                disabled={copying}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                {copying ? bi('Copying…', '複製中…') : `📋 ${bi('Copy to New Invoice', '複製為新發票')}`}
              </button>
              <button onClick={() => convert('order')} className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700">
                → {bi('Convert to Order', '轉換為訂單')}
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? BTN.saving : BTN.save}
              </button>
              <button onClick={del} className="px-4 py-2 text-red-600 border border-red-200 text-sm font-medium rounded-lg hover:bg-red-50">
                {BTN.delete}
              </button>
            </>
          )}
        </div>
      </div>
      {msg && <div className="mb-4 text-sm text-green-700">{msg}</div>}

      <div className="grid xl:grid-cols-[1fr_280px] gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {/* Header: customer / email / status / total */}
          <div className="p-5 border-b border-gray-100 grid lg:grid-cols-[1fr_1fr_auto] gap-4 items-start">
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{bi('Customer', '客戶')}</label>
                <select value={customerId} onChange={(e) => applyCustomer(e.target.value)} disabled={readOnly} className={inputCls}>
                  <option value="">Choose a customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Email</label>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={readOnly} className={inputCls} placeholder="customer@email.com" />
                <label className="mt-2 inline-flex items-center gap-2 text-sm text-gray-700 select-none">
                  <input
                    type="checkbox"
                    checked={sendLater}
                    onChange={(e) => setSendLater(e.target.checked)}
                    disabled={readOnly}
                    className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                  />
                  Send later
                </label>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Status</label>
                <select value={status} onChange={(e) => setStatus(e.target.value)} disabled={readOnly} className={inputCls}>
                  {QUOTATION_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {QUOTATION_STATUS_FORM_LABEL[s]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="text-right lg:pl-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">AMOUNT</p>
              <p className="text-3xl font-bold text-gray-900 tabular-nums mt-1">
                {currencyLabel} {totals.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          {/* Addresses + date/shipping meta */}
          <div className="p-5 border-b border-gray-100 grid lg:grid-cols-[1.1fr_1fr] gap-6">
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Billing address</label>
                <textarea
                  value={billingAddress}
                  onChange={(e) => setBillingAddress(e.target.value)}
                  disabled={readOnly}
                  rows={4}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Shipping to</label>
                <textarea
                  value={shippingAddress}
                  onChange={(e) => setShippingAddress(e.target.value)}
                  disabled={readOnly}
                  rows={4}
                  className={inputCls}
                />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-3 content-start">
              <div>
                <label className={labelCls}>Estimate date</label>
                <input type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} disabled={readOnly} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Expiration date</label>
                <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} disabled={readOnly} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Ship via</label>
                <input value={shipVia} onChange={(e) => setShipVia(e.target.value)} disabled={readOnly} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Shipping date</label>
                <input type="date" value={shippingDate} onChange={(e) => setShippingDate(e.target.value)} disabled={readOnly} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Tracking no.</label>
                <input value={trackingNo} onChange={(e) => setTrackingNo(e.target.value)} disabled={readOnly} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Order no.</label>
                <input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} disabled={readOnly} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Receipt Date</label>
                <input type="date" value={receiptDate} onChange={(e) => setReceiptDate(e.target.value)} disabled={readOnly} className={inputCls} />
                <p className={hintCls}>Not printed on form</p>
              </div>
              <div>
                <label className={labelCls}>Currency</label>
                <input value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={readOnly} className={inputCls} />
                <p className={hintCls}>Not printed on form</p>
              </div>
            </div>
          </div>

          {/* Line items */}
          <div className="p-5 border-b border-gray-100 overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="text-[11px] uppercase tracking-wide text-gray-500 border-b border-gray-200">
                  <th className="text-left py-2 pr-2 font-medium w-8">#</th>
                  <th className="text-left py-2 pr-2 font-medium">Service date</th>
                  <th className="text-left py-2 pr-2 font-medium">Product/Service</th>
                  <th className="text-left py-2 pr-2 font-medium">Description</th>
                  <th className="text-right py-2 pr-2 font-medium w-20">Qty</th>
                  <th className="text-right py-2 pr-2 font-medium w-24">Rate</th>
                  <th className="text-right py-2 pr-2 font-medium w-28">Amount ({currencyLabel})</th>
                  <th className="text-left py-2 pr-2 font-medium w-24">Class</th>
                  <th className="w-8" />
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
                        disabled={readOnly}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={item.product_service}
                        onChange={(e) => updateItem(i, 'product_service', e.target.value)}
                        disabled={readOnly}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                        placeholder="Product / service"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        value={item.description}
                        onChange={(e) => updateItem(i, 'description', e.target.value)}
                        disabled={readOnly}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                        placeholder="Description"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        value={item.quantity}
                        onChange={(e) => updateItem(i, 'quantity', Number(e.target.value))}
                        disabled={readOnly}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-right"
                      />
                    </td>
                    <td className="py-2 pr-2">
                      <input
                        type="number"
                        value={item.unit_price}
                        onChange={(e) => updateItem(i, 'unit_price', Number(e.target.value))}
                        disabled={readOnly}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm text-right"
                      />
                    </td>
                    <td className="py-2 pr-2 text-right tabular-nums pt-3">{formatCurrency(item.quantity * item.unit_price)}</td>
                    <td className="py-2 pr-2">
                      <input
                        value={item.class_name}
                        onChange={(e) => updateItem(i, 'class_name', e.target.value)}
                        disabled={readOnly}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm"
                      />
                    </td>
                    <td className="py-2">
                      {!readOnly && (
                        <button type="button" onClick={() => removeItem(i)} className="text-gray-400 hover:text-red-600 text-sm px-1" title="Remove line">
                          🗑
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!readOnly && (
              <div className="flex flex-wrap gap-2 mt-3">
                <button type="button" onClick={addItem} className="px-3 py-1.5 text-sm font-medium text-brand-700 border border-brand-200 rounded-md hover:bg-brand-50">
                  Add lines
                </button>
                <button type="button" onClick={clearItems} className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50">
                  Clear all lines
                </button>
              </div>
            )}
          </div>

          {/* Messages + totals */}
          <div className="p-5 grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Message displayed on estimate</label>
                <textarea value={notes} onChange={(e) => setNotes(e.target.value)} disabled={readOnly} rows={4} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Message displayed on statement</label>
                <textarea
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  disabled={readOnly}
                  rows={3}
                  className={inputCls}
                  placeholder="This description will show up if the estimate is converted to an invoice."
                />
              </div>
            </div>
            <div className="space-y-2 text-sm max-w-sm ml-auto w-full">
              <div className="flex justify-between py-1">
                <span className="text-gray-500">Subtotal</span>
                <span className="tabular-nums">{formatCurrency(totals.subtotal)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="text-gray-500 shrink-0">Discount</span>
                <div className="flex items-center gap-1">
                  <select
                    value={discountType}
                    onChange={(e) => setDiscountType(e.target.value as QuotationDiscountType)}
                    disabled={readOnly}
                    className="px-2 py-1 border border-gray-300 rounded text-xs"
                  >
                    <option value="percent">Discount percent</option>
                    <option value="amount">Discount amount</option>
                  </select>
                  <input
                    type="number"
                    value={discountValue}
                    onChange={(e) => setDiscountValue(Number(e.target.value))}
                    disabled={readOnly}
                    className="w-20 px-2 py-1 border border-gray-300 rounded text-right text-sm"
                  />
                </div>
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span />
                <span>− {formatCurrency(totals.discountAmount)}</span>
              </div>
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="text-gray-500">Shipping</span>
                <input
                  type="number"
                  value={shippingAmount}
                  onChange={(e) => setShippingAmount(Number(e.target.value))}
                  disabled={readOnly}
                  className="w-28 px-2 py-1 border border-gray-300 rounded text-right text-sm"
                />
              </div>
              <div className="flex items-center justify-between gap-2 py-1">
                <span className="text-gray-500">Tax rate (%)</span>
                <input
                  type="number"
                  step="0.01"
                  value={taxRate}
                  onChange={(e) => setTaxRate(Number(e.target.value))}
                  disabled={readOnly}
                  className="w-28 px-2 py-1 border border-gray-300 rounded text-right text-sm"
                />
              </div>
              <div className="flex justify-between text-xs text-gray-400">
                <span />
                <span>{formatCurrency(totals.taxAmount)}</span>
              </div>
              <div className="flex justify-between font-semibold border-t border-gray-200 pt-2 mt-1">
                <span>Total</span>
                <span className="tabular-nums">{formatCurrency(totals.total)}</span>
              </div>
              <div className="flex justify-between font-bold text-base">
                <span>Estimate Total</span>
                <span className="tabular-nums">
                  {currencyLabel} {totals.total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div>
          <ActivityFeed entityType="quotation" entityId={quote.id} className="max-h-[700px]" />
        </div>
      </div>

      {toast && (
        <div
          className={`fixed bottom-6 right-6 z-[80] px-4 py-3 rounded-lg shadow-lg text-sm font-medium ${
            toast.kind === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white'
          }`}
        >
          {toast.text}
        </div>
      )}
    </AppLayout>
  );
}
