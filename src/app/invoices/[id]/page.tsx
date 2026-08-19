'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import ActivityFeed from '@/components/ActivityFeed';
import { useAuth } from '@/components/AuthProvider';
import { formatCurrency, StatusBadge } from '@/components/ui';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { CONFLICT_MESSAGE, CONFLICT_MESSAGE_ZH } from '@/lib/concurrency';
import { invoiceFileUrl } from '@/lib/image-url';
import { isSectionReadOnly } from '@/lib/permissions';
import { calculateInvoiceTotals } from '@/lib/utils';
import type {
  Customer,
  InvoiceDiscountType,
  InvoiceFile,
  InvoiceStatus,
  InvoiceWithDetails,
  LinkedOrderSummary,
} from '@/lib/types';
import { orderTitle } from '@/lib/orders';
import { BTN, MSG, bi } from '@/lib/ui-labels';

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

const MAX_ATTACHMENT_BYTES = 20 * 1024 * 1024;

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function isImageName(name: string | null | undefined): boolean {
  return /\.(png|jpe?g|gif|webp)$/i.test(name || '');
}

const INVOICE_STATUSES = ['draft', 'sent', 'paid', 'overdue'] as const;

export default function InvoiceDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const readOnly = user ? isSectionReadOnly(user.role, 'invoices') : false;
  const [invoice, setInvoice] = useState<InvoiceWithDetails | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [orders, setOrders] = useState<
    { id: number; reference_number: string; po_number?: string; name?: string }[]
  >([]);
  const [linkedOrder, setLinkedOrder] = useState<LinkedOrderSummary | null>(null);
  const [customerId, setCustomerId] = useState('');
  const [email, setEmail] = useState('');
  const [sendLater, setSendLater] = useState(false);
  const [issueDate, setIssueDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [term, setTerm] = useState('NET30');
  const [taxRate, setTaxRate] = useState(0);
  const [status, setStatus] = useState<InvoiceStatus>('draft');
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
  const [discountType, setDiscountType] = useState<InvoiceDiscountType>('percent');
  const [discountValue, setDiscountValue] = useState(0);
  const [shippingAmount, setShippingAmount] = useState(0);
  const [items, setItems] = useState<LineItem[]>([emptyLine()]);
  const [files, setFiles] = useState<InvoiceFile[]>([]);
  const [uploadMsg, setUploadMsg] = useState('');
  const [saving, setSaving] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [converting, setConverting] = useState(false);
  const [msg, setMsg] = useState('');
  const [toast, setToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const load = useCallback(() => {
    fetch(`/api/invoices/${id}`)
      .then((r) => r.json())
      .then((d) => {
        const inv: InvoiceWithDetails = d.invoice;
        if (!inv) return;
        setInvoice(inv);
        setLinkedOrder(d.linkedOrder || null);
        setCustomerId(inv.customer_id ? String(inv.customer_id) : '');
        setEmail(inv.email || inv.customer_email || '');
        setSendLater(Boolean(inv.send_later));
        setIssueDate(inv.issue_date);
        setDueDate(inv.due_date);
        setTerm(inv.term || 'NET30');
        setTaxRate(inv.tax_rate);
        setStatus(inv.status);
        setNotes(inv.notes || '');
        setTerms(inv.terms || '');
        setBillingAddress(inv.billing_address || '');
        setShippingAddress(inv.shipping_address || '');
        setShipVia(inv.ship_via || '');
        setShippingDate(inv.shipping_date || '');
        setTrackingNo(inv.tracking_no || '');
        setOrderNo(inv.order_no || '');
        setReceiptDate(inv.receipt_date || '');
        setCurrency(inv.currency || 'HKD');
        setDiscountType(inv.discount_type || 'percent');
        setDiscountValue(inv.discount_value || 0);
        setShippingAmount(inv.shipping_amount || 0);
        setItems(
          inv.items.length
            ? inv.items.map((i) => ({
                service_date: i.service_date || '',
                product_service: i.product_service || '',
                description: i.description || '',
                quantity: i.quantity,
                unit_price: i.unit_price,
              }))
            : [emptyLine()],
        );
        setFiles(inv.files || []);
      });
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  useRefetchOnFocus(load, Boolean(id));

  useEffect(() => {
    fetch('/api/customers')
      .then((r) => r.json())
      .then((d) => setCustomers(d.customers || []));
    fetch('/api/orders?fields=options')
      .then((r) => r.json())
      .then((d) => setOrders(d.orders || []))
      .catch(() => {});
  }, []);

  const totals = useMemo(
    () =>
      calculateInvoiceTotals(items, {
        taxRate,
        discountType,
        discountValue,
        shippingAmount,
      }),
    [items, taxRate, discountType, discountValue, shippingAmount],
  );

  const save = async () => {
    setSaving(true);
    const res = await fetch(`/api/invoices/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        customer_id: customerId ? Number(customerId) : undefined,
        issue_date: issueDate,
        due_date: dueDate,
        term,
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
        expected_updated_at: invoice?.updated_at || undefined,
      }),
    });
    setSaving(false);
    if (res.ok) {
      setMsg('Saved');
      load();
      setTimeout(() => setMsg(''), 2000);
    } else {
      const data = await res.json().catch(() => ({}));
      if (res.status === 409) {
        setToast({ text: bi(CONFLICT_MESSAGE, CONFLICT_MESSAGE_ZH), kind: 'error' });
        if ((data as { invoice?: InvoiceWithDetails }).invoice) load();
        else load();
      } else {
        setMsg((data as { error?: string }).error || 'Save failed');
      }
    }
  };

  const linkOrder = async (orderId: string) => {
    const res = await fetch(`/api/invoices/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        order_id: orderId ? Number(orderId) : null,
        expected_updated_at: invoice?.updated_at || undefined,
      }),
    });
    if (res.status === 409) {
      setToast({ text: bi(CONFLICT_MESSAGE, CONFLICT_MESSAGE_ZH), kind: 'error' });
    }
    load();
  };

  const duplicate = async () => {
    setDuplicating(true);
    await save();
    try {
      const res = await fetch(`/api/invoices/${id}/duplicate`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setToast({ text: data.error || bi('Failed to duplicate invoice', '複製發票失敗'), kind: 'error' });
        setTimeout(() => setToast(null), 5000);
        return;
      }
      setToast({
        text: bi(`Duplicated as ${data.invoice_number}`, `已複製為 ${data.invoice_number}`),
        kind: 'success',
      });
      setTimeout(() => router.push(`/invoices/${data.id}`), 800);
    } catch {
      setToast({ text: bi('Failed to duplicate invoice', '複製發票失敗'), kind: 'error' });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setDuplicating(false);
    }
  };

  const convertToOrder = async () => {
    setConverting(true);
    await save();
    try {
      const res = await fetch(`/api/invoices/${id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ target: 'order' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setToast({ text: data.error || MSG.conversionFailed, kind: 'error' });
        setTimeout(() => setToast(null), 5000);
        return;
      }
      router.push(`/orders/${data.id}`);
    } catch {
      setToast({ text: MSG.conversionFailed, kind: 'error' });
      setTimeout(() => setToast(null), 5000);
    } finally {
      setConverting(false);
    }
  };

  const del = async () => {
    if (!confirm('Move this invoice to Deleted Records? You can restore it within 60 days.')) return;
    await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
    router.push('/invoices');
  };

  const uploadFiles = async (list: FileList) => {
    if (readOnly) return;
    const selected = Array.from(list);
    const tooBig = selected.find((f) => f.size > MAX_ATTACHMENT_BYTES);
    if (tooBig) {
      setUploadMsg(
        bi(
          `“${tooBig.name}” is over 20 MB (${formatFileSize(tooBig.size)})`,
          `「${tooBig.name}」超過 20 MB（${formatFileSize(tooBig.size)}）`,
        ),
      );
      return;
    }
    if (!selected.length) return;

    setUploadMsg(bi(`Uploading ${selected.length} file(s)…`, `正在上傳 ${selected.length} 個檔案…`));
    const fd = new FormData();
    selected.forEach((f) => fd.append('file', f));
    try {
      const res = await fetch(`/api/invoices/${id}/files`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setUploadMsg(data.error || MSG.uploadFailed);
        return;
      }
      setFiles(data.files || []);
      setUploadMsg(bi('Uploaded', '已上傳'));
      setTimeout(() => setUploadMsg(''), 2000);
    } catch {
      setUploadMsg(MSG.uploadFailed);
    }
  };

  const deleteFile = async (fileId: number) => {
    if (readOnly) return;
    const res = await fetch(`/api/invoice-files/${fileId}`, { method: 'DELETE' });
    if (res.ok) setFiles((prev) => prev.filter((f) => f.id !== fileId));
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

  if (!invoice) {
    return (
      <AppLayout>
        <div className="page-header">
          <div>
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-64 bg-gray-100 rounded mt-2 animate-pulse" />
          </div>
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-64 bg-gray-100 rounded-xl animate-pulse" />
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
          <Link href="/invoices" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            ← {bi('Back to invoices', '返回發票列表')}
          </Link>
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            <h1 className="page-title">{invoice.invoice_number}</h1>
            <StatusBadge status={status} />
          </div>
          {invoice.external_invoice_number && (
            <p className="mt-1 text-sm text-gray-500">
              {bi('External invoice number', '外部發票編號')}: {invoice.external_invoice_number}
            </p>
          )}
        </div>
        <div className="page-actions">
          <Link
            href={`/invoices/${id}/print`}
            className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50"
          >
            🧾 {bi('Generate PDF', '產生 PDF')}
          </Link>
          {!readOnly && (
            <>
              <button
                onClick={duplicate}
                disabled={duplicating}
                className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-lg hover:bg-gray-50 disabled:opacity-50"
              >
                {duplicating
                  ? bi('Duplicating…', '複製中…')
                  : `📄 ${bi('Duplicate', '複製發票')}`}
              </button>
              <button
                onClick={convertToOrder}
                disabled={converting}
                className="px-4 py-2 bg-teal-600 text-white text-sm font-medium rounded-lg hover:bg-teal-700 disabled:opacity-50"
              >
                {converting
                  ? bi('Converting…', '轉換中…')
                  : `→ ${bi('Convert to Order', '轉換為訂單')}`}
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
              >
                {saving ? BTN.saving : BTN.save}
              </button>
              <button
                onClick={del}
                className="px-4 py-2 text-red-600 border border-red-200 text-sm font-medium rounded-lg hover:bg-red-50"
              >
                {BTN.delete}
              </button>
            </>
          )}
        </div>
      </div>
      {msg && <div className="mb-4 text-sm text-green-700">{msg}</div>}

      <div className="grid xl:grid-cols-[1fr_280px] gap-6">
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="p-5 border-b border-gray-100 grid lg:grid-cols-[1fr_1fr_auto] gap-4 items-start">
            <div className="space-y-3">
              <div>
                <label className={labelCls}>{bi('Customer', '客戶')}</label>
                <select
                  value={customerId}
                  onChange={(e) => applyCustomer(e.target.value)}
                  disabled={readOnly}
                  className={inputCls}
                >
                  <option value="">Choose a customer</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-3">
              <div>
                <label className={labelCls}>Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={readOnly}
                  className={inputCls}
                  placeholder="customer@email.com"
                />
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
            <div className="text-right lg:pl-4">
              <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">AMOUNT</p>
              <p className="text-3xl font-bold text-gray-900 tabular-nums mt-1">
                {currencyLabel}{' '}
                {totals.total.toLocaleString(undefined, {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>

          <div className="p-5 border-b border-gray-100 flex flex-col lg:flex-row gap-6">
            <div className="space-y-4 w-full lg:w-1/4 lg:min-w-[11rem] lg:max-w-xs shrink-0">
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
            <div className="grid sm:grid-cols-2 gap-3 content-start w-full lg:w-1/2 shrink-0">
              <div>
                <label className={labelCls}>{bi('Issue date', '開立日期')}</label>
                <input
                  type="date"
                  value={issueDate}
                  onChange={(e) => setIssueDate(e.target.value)}
                  disabled={readOnly}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>{bi('Due date', '到期日')}</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  disabled={readOnly}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Term</label>
                <input value={term} onChange={(e) => setTerm(e.target.value)} disabled={readOnly} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Ship via</label>
                <input value={shipVia} onChange={(e) => setShipVia(e.target.value)} disabled={readOnly} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Shipping date</label>
                <input
                  type="date"
                  value={shippingDate}
                  onChange={(e) => setShippingDate(e.target.value)}
                  disabled={readOnly}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Tracking no.</label>
                <input
                  value={trackingNo}
                  onChange={(e) => setTrackingNo(e.target.value)}
                  disabled={readOnly}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Order no.</label>
                <input value={orderNo} onChange={(e) => setOrderNo(e.target.value)} disabled={readOnly} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Receipt Date</label>
                <input
                  type="date"
                  value={receiptDate}
                  onChange={(e) => setReceiptDate(e.target.value)}
                  disabled={readOnly}
                  className={inputCls}
                />
                <p className={hintCls}>Not printed on form</p>
              </div>
              <div>
                <label className={labelCls}>Currency</label>
                <input value={currency} onChange={(e) => setCurrency(e.target.value)} disabled={readOnly} className={inputCls} />
                <p className={hintCls}>Not printed on form</p>
              </div>
            </div>
          </div>

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
                  <th className="text-right py-2 pr-6 font-medium w-32">Amount ({currencyLabel})</th>
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
                    <td className="py-2 pr-2 min-w-[220px]">
                      <textarea
                        value={item.description}
                        onChange={(e) => updateItem(i, 'description', e.target.value)}
                        disabled={readOnly}
                        rows={3}
                        className="w-full px-2 py-1.5 border border-gray-200 rounded text-sm resize-y min-h-[4.5rem]"
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
                    <td className="py-2 pr-6 text-right tabular-nums pt-3">
                      {formatCurrency(item.quantity * item.unit_price)}
                    </td>
                    <td className="py-2 pr-2">
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => removeItem(i)}
                          className="text-gray-400 hover:text-red-600 text-sm px-1"
                          title="Remove line"
                        >
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
                <button
                  type="button"
                  onClick={addItem}
                  className="px-3 py-1.5 text-sm font-medium text-brand-700 border border-brand-200 rounded-md hover:bg-brand-50"
                >
                  Add lines
                </button>
                <button
                  type="button"
                  onClick={clearItems}
                  className="px-3 py-1.5 text-sm font-medium text-gray-600 border border-gray-200 rounded-md hover:bg-gray-50"
                >
                  Clear all lines
                </button>
              </div>
            )}
          </div>

          <div className="p-5 grid lg:grid-cols-[1.2fr_0.8fr] gap-6">
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Message displayed on invoice</label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={readOnly}
                  rows={4}
                  className={inputCls}
                />
              </div>
              <div>
                <label className={labelCls}>Message displayed on statement</label>
                <textarea
                  value={terms}
                  onChange={(e) => setTerms(e.target.value)}
                  disabled={readOnly}
                  rows={3}
                  className={inputCls}
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
                    onChange={(e) => setDiscountType(e.target.value as InvoiceDiscountType)}
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
                <span>Invoice Total</span>
                <span className="tabular-nums">
                  {currencyLabel}{' '}
                  {totals.total.toLocaleString(undefined, {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>
          </div>

          <div className="border-t border-gray-100 p-5">
            <div className="flex items-center justify-between gap-3 mb-3">
              <div>
                <h3 className="text-sm font-semibold text-gray-900">{bi('Attachments', '附件')}</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {bi('Any file type · max 20 MB each', '任意檔案類型 · 每個上限 20 MB')}
                </p>
                {uploadMsg && <p className="text-xs text-brand-700 mt-1">{uploadMsg}</p>}
              </div>
              {!readOnly && (
                <>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-sm text-brand-600 hover:text-brand-700 font-medium shrink-0"
                  >
                    + {bi('Attach files', '附加檔案')}
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.length) void uploadFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </>
              )}
            </div>

            {files.length === 0 ? (
              <div
                onClick={() => !readOnly && fileInputRef.current?.click()}
                className={`border-2 border-dashed border-gray-300 rounded-xl p-6 text-center text-gray-400 text-sm ${
                  readOnly ? '' : 'cursor-pointer hover:border-brand-400 hover:bg-brand-50/40'
                }`}
              >
                {bi('No attachments yet', '尚無附件')}
                {!readOnly && (
                  <span className="block mt-1 text-xs">
                    {bi('Click to upload (under 20 MB each)', '點擊上傳（每個不超過 20 MB）')}
                  </span>
                )}
              </div>
            ) : (
              <ul className="space-y-2">
                {files.map((f) => {
                  const url = invoiceFileUrl(f);
                  const name = f.original_name || `File #${f.id}`;
                  return (
                    <li
                      key={f.id}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2"
                    >
                      {isImageName(f.original_name) ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={url}
                          alt={name}
                          className="h-10 w-10 rounded object-cover border border-gray-200 shrink-0 bg-white"
                        />
                      ) : (
                        <span className="h-10 w-10 rounded bg-white border border-gray-200 flex items-center justify-center text-gray-400 text-xs shrink-0">
                          FILE
                        </span>
                      )}
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex-1 min-w-0 text-sm text-brand-700 hover:underline truncate"
                      >
                        {name}
                      </a>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => void deleteFile(f.id)}
                          className="text-xs text-red-600 hover:text-red-700 shrink-0"
                        >
                          {BTN.delete}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              {bi('Linked Order', '關聯訂單')}
            </h3>
            {linkedOrder ? (
              <div className="mb-3">
                <Link
                  href={`/orders/${linkedOrder.id}`}
                  className="text-sm text-brand-700 hover:underline font-medium"
                >
                  {orderTitle(linkedOrder)}
                </Link>
              </div>
            ) : (
              <p className="text-xs text-gray-400 mb-3">{bi('No linked order', '尚未關聯訂單')}</p>
            )}
            {!readOnly && (
              <select
                value={invoice.order_id ? String(invoice.order_id) : ''}
                onChange={(e) => void linkOrder(e.target.value)}
                className={inputCls}
              >
                <option value="">{bi('Select order…', '選擇訂單…')}</option>
                {orders.map((o) => (
                  <option key={o.id} value={o.id}>
                    {orderTitle(o)}
                  </option>
                ))}
              </select>
            )}
            <div className="mt-4 pt-4 border-t border-gray-100">
              <label className={labelCls}>Status</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as InvoiceStatus)}
                disabled={readOnly}
                className={inputCls}
              >
                {INVOICE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <ActivityFeed entityType="invoice" entityId={invoice.id} className="max-h-[700px]" />
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
