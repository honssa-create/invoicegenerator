'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import ActivityFeed from '@/components/ActivityFeed';
import { compressImage } from '@/lib/imageCompression';
import { compressPdfToImages } from '@/lib/pdfCompression';
import { orderFileUrl, orderPaymentReceiptUrl } from '@/lib/image-url';
import {
  ORDER_FIELDS,
  ORDER_STATUSES,
  ORDER_TYPES,
  PAYMENT_STATUS_LABELS,
  BIRD_NEST_FLAVORS,
  computeBirdNestTotals,
  STATUS_COLORS,
  orderTitle,
  type Order,
  type OrderFieldDef,
} from '@/lib/orders';
import { BTN, MSG, TITLE, bi } from '@/lib/ui-labels';

interface InvoiceOption {
  id: number;
  invoice_number: string;
  status: string;
}

interface QuotationOption {
  id: number;
  quote_number: string;
  status: string;
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [quotations, setQuotations] = useState<QuotationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const paymentInputRef = useRef<HTMLInputElement>(null);
  const [paymentPreview, setPaymentPreview] = useState<string | null>(null);
  const [paymentScanMsg, setPaymentScanMsg] = useState('');

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setOrder(d?.order || null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetch('/api/invoices')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInvoices((d?.invoices || []).map((i: InvoiceOption) => ({ id: i.id, invoice_number: i.invoice_number, status: i.status }))))
      .catch(() => {});
    fetch('/api/quotations')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setQuotations((d?.quotations || []).map((q: QuotationOption) => ({ id: q.id, quote_number: q.quote_number, status: q.status }))))
      .catch(() => {});
  }, []);

  const patch = async (payload: { core?: Record<string, unknown>; fields?: Record<string, unknown>; linked_invoice_id?: string | number | null; linked_quotation_id?: string | number | null }) => {
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.order) setOrder(data.order);
    }
  };

  const setCoreLocal = (col: string, value: unknown) =>
    setOrder((o) => (o ? ({ ...o, [col]: value } as Order) : o));
  const setFieldLocal = (key: string, value: unknown) =>
    setOrder((o) => (o ? { ...o, fields: { ...o.fields, [key]: value as string | boolean } } : o));

  const [uploadMsg, setUploadMsg] = useState('');
  const uploadFiles = async (files: FileList) => {
    setUploadMsg('Optimising files…');
    // Compress images (≤1600px JPEG) and convert heavy PDFs (>2MB) into compressed
    // JPEG page images so we store a lightweight image array, never the raw monster PDF.
    const prepared: File[] = [];
    for (const f of Array.from(files)) {
      try {
        if (f.type === 'application/pdf') {
          setUploadMsg(`Compressing PDF “${f.name}” pages…`);
          const pages = await compressPdfToImages(f);
          prepared.push(...pages);
        } else if (f.type.startsWith('image/')) {
          const c = await compressImage(f, { maxDim: 1600, targetBytes: 300 * 1024, mimeType: 'image/jpeg' });
          prepared.push(c.file);
        } else {
          prepared.push(f);
        }
      } catch {
        prepared.push(f);
      }
    }
    if (!prepared.length) { setUploadMsg(''); return; }

    setUploadMsg(`Uploading ${prepared.length} image(s)…`);
    const fd = new FormData();
    prepared.forEach((f) => fd.append('file', f));
    const res = await fetch(`/api/orders/${id}/files`, { method: 'POST', body: fd });
    if (res.ok) {
      const data = await res.json();
      setOrder((o) => (o ? { ...o, files: data.files } : o));
    }
    setUploadMsg('');
  };

  const deleteFile = async (fileId: number) => {
    const res = await fetch(`/api/order-files/${fileId}`, { method: 'DELETE' });
    if (res.ok) setOrder((o) => (o ? { ...o, files: o.files.filter((f) => f.id !== fileId) } : o));
  };

  const handlePaymentReceipt = async (rawFile: File) => {
    setPaymentScanMsg('Compressing & scanning receipt…');
    // Compress with the receipt rule: 1600px, quality 0.65, < 300KB. Heavy PDFs → first page image.
    let file = rawFile;
    try {
      if (rawFile.type === 'application/pdf') {
        const pages = await compressPdfToImages(rawFile, { quality: 0.65, maxWidthOrHeight: 1600 });
        if (pages[0]) file = pages[0];
      } else {
        const c = await compressImage(rawFile, { maxDim: 1600, targetBytes: 300 * 1024, mimeType: 'image/jpeg', quality: 0.65 });
        file = c.file;
      }
    } catch {
      /* fall back to original */
    }
    setPaymentPreview(URL.createObjectURL(file));

    const fd = new FormData();
    fd.append('receipt', file);
    try {
      const res = await fetch('/api/payments/scan', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setPaymentScanMsg(data.error || MSG.scanFailed); return; }
      const r = data.result;
      const upd: Record<string, string> = { payment_receipt_path: r.receipt_path || '' };
      if (r.payment_date) upd.payment_date = r.payment_date;
      if (r.amount != null) {
        upd.payment_amount = String(r.amount);
        if (Number(r.amount) > 0) upd.payment_status_label = '部分付款 Partly Paid';
      }
      if (r.bank) upd.payment_bank = r.bank;
      if (r.method) upd.payment_method_detail = r.method;
      if (r.reference) upd.payment_reference = r.reference;
      setOrder((o) => (o ? { ...o, fields: { ...o.fields, ...upd } } : o));
      patch({ fields: upd });
      const via = r.source === 'ai' ? 'AI vision (Gemini)' : 'on-device OCR';
      const found = [r.payment_date && 'date', r.amount != null && 'amount', r.bank && 'bank', r.method && 'method', r.reference && 'ref'].filter(Boolean);
      setPaymentScanMsg(found.length ? `Extracted via ${via}: ${found.join(', ')}. Please verify.` : `No fields auto-extracted (${via}). Enter manually.`);
    } catch {
      setPaymentScanMsg(MSG.scanFailed);
    }
  };

  const paymentBadge = () => {
    const inv = order?.linked_invoice;
    const fieldStatus = String(order?.fields.payment_status_label || '');
    if (inv?.status === 'paid') return { text: '✓ Paid · 100% Payment (全數付清)', cls: 'bg-green-100 text-green-700' };
    if (fieldStatus.includes('部分付款') || fieldStatus.toLowerCase().includes('part')) {
      return { text: '部分付款 Partly Paid', cls: 'bg-amber-100 text-amber-700' };
    }
    if (!inv) return { text: 'No invoice linked', cls: 'bg-gray-100 text-gray-600' };
    if (inv.status === 'overdue') return { text: '⚠ Overdue / 逾期未付', cls: 'bg-red-100 text-red-700' };
    return { text: '未付款 / 待核對 Unpaid', cls: 'bg-red-100 text-red-700' };
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
      </AppLayout>
    );
  }
  if (!order) {
    return (
      <AppLayout>
        <div className="p-12 text-center text-gray-500">{bi('Order not found.', '找不到訂單。')} <button onClick={() => router.push('/orders')} className="text-brand-600 underline">{bi('Back to orders', '返回訂單')}</button></div>
      </AppLayout>
    );
  }

  const cellCls = 'w-full bg-transparent hover:bg-gray-50 focus:bg-white border border-transparent hover:border-gray-200 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 rounded px-2 py-1 text-sm outline-none transition-colors';

  // Helpers for the structured section boxes (values stored in fields_json).
  const softInput = 'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50/40 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-colors';
  const fVal = (k: string) => (order.fields[k] as string) ?? '';
  const fInput = (key: string, type = 'text', placeholder = '') => (
    <input
      type={type}
      value={fVal(key)}
      onChange={(e) => setFieldLocal(key, e.target.value)}
      onBlur={(e) => patch({ fields: { [key]: e.target.value } })}
      placeholder={placeholder}
      className={softInput}
    />
  );
  const partialPaymentFields = (key: 'payment_amount' | 'payment1_amount', value: string) => {
    const amount = Number(value);
    const fields: Record<string, string> = { [key]: value };
    if (Number.isFinite(amount) && amount > 0 && fVal('payment_status_label') !== 'Full Paid') {
      fields.payment_status_label = '部分付款 Partly Paid';
      setFieldLocal('payment_status_label', fields.payment_status_label);
    }
    patch({ fields });
  };
  const paymentAmountInput = (
    <input
      type="number"
      value={fVal('payment_amount')}
      onChange={(e) => setFieldLocal('payment_amount', e.target.value)}
      onBlur={(e) => partialPaymentFields('payment_amount', e.target.value)}
      placeholder="0.00"
      className={softInput}
    />
  );
  const payment1AmountInput = (
    <input
      type="number"
      value={fVal('payment1_amount')}
      onChange={(e) => setFieldLocal('payment1_amount', e.target.value)}
      onBlur={(e) => partialPaymentFields('payment1_amount', e.target.value)}
      placeholder="0.00"
      className={softInput}
    />
  );
  const labeled = (label: string, node: React.ReactNode, hint?: string) => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">
        {label}
        {hint ? <span className="text-gray-400 font-normal"> · {hint}</span> : null}
      </label>
      {node}
    </div>
  );
  const readOnly = (label: string, value: React.ReactNode) => (
    <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-lg font-semibold text-gray-900 leading-tight mt-0.5">{value}</p>
    </div>
  );
  const orderType = fVal('order_type');
  const bn = computeBirdNestTotals(order.fields);

  const renderField = (f: OrderFieldDef) => {
    const value = f.col ? (order[f.col] as string) : order.fields[f.key];
    if (f.type === 'checkbox') {
      return (
        <input
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => { setFieldLocal(f.key, e.target.checked); patch({ fields: { [f.key]: e.target.checked } }); }}
          className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500 cursor-pointer"
        />
      );
    }
    if (f.type === 'select') {
      const commit = (val: string) => (f.col ? (setCoreLocal(f.col, val), patch({ core: { [f.col]: val } })) : (setFieldLocal(f.key, val), patch({ fields: { [f.key]: val } })));
      return (
        <select value={(value as string) || ''} onChange={(e) => commit(e.target.value)} className={cellCls}>
          <option value="">—</option>
          {f.options?.map((o) => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    }
    const commitText = (val: string) => (f.col ? patch({ core: { [f.col]: val } }) : patch({ fields: { [f.key]: val } }));
    const onChange = (val: string) => (f.col ? setCoreLocal(f.col, val) : setFieldLocal(f.key, val));
    if (f.type === 'textarea') {
      return (
        <textarea value={(value as string) || ''} rows={4} onChange={(e) => onChange(e.target.value)} onBlur={(e) => commitText(e.target.value)} placeholder={f.placeholder} className={`${cellCls} resize-y whitespace-pre-wrap`} />
      );
    }
    return (
      <input value={(value as string) || ''} onChange={(e) => onChange(e.target.value)} onBlur={(e) => commitText(e.target.value)} placeholder={f.placeholder} className={cellCls} />
    );
  };

  const fieldsBox = (
    <div className="rounded-xl border border-gray-200 p-5 bg-gray-50/40">
      <h3 className="font-semibold text-gray-900 mb-4">Fields 自訂欄位</h3>
      <div className="divide-y divide-gray-100">
        {ORDER_FIELDS.map((f) => (
          <div key={f.key} className="grid grid-cols-1 sm:grid-cols-[240px_1fr] gap-1 sm:gap-3 py-2 items-center">
            <div className="text-sm text-gray-500">{f.label}</div>
            <div>{renderField(f)}</div>
          </div>
        ))}
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
        <button onClick={() => router.push('/orders')} className="text-sm text-brand-600 hover:text-brand-700 font-medium min-h-[44px] sm:min-h-0 text-left">← {bi('Back to orders', '返回訂單')}</button>
        <Link href={`/orders/${order.id}/delivery-note`} className="btn bg-brand-600 text-white hover:bg-brand-700 w-full sm:w-auto">
          🚚 {bi('Generate Delivery Note', '產生出貨單')}
        </Link>
      </div>

      <div className="flex flex-col lg:flex-row gap-6 lg:items-stretch lg:min-h-0 lg:h-[calc(100vh-7rem)]">
        {/* LEFT COLUMN — 70% (scrolls independently on desktop) */}
        <div className="w-full lg:w-[70%] space-y-6 lg:h-full lg:overflow-y-auto lg:pr-2">
          {/* Header */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center gap-3 flex-wrap mb-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-400">Task</span>
              <select
                value={order.status}
                onChange={(e) => { setCoreLocal('status', e.target.value); patch({ core: { status: e.target.value } }); }}
                className={`text-xs font-medium rounded-full px-3 py-1 border-0 cursor-pointer ${STATUS_COLORS[order.status] || 'bg-gray-100 text-gray-700'}`}
              >
                {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="inline-flex items-center gap-1 text-xs font-medium bg-red-50 text-red-600 rounded-full px-3 py-1">
                🚚 交貨
                <input value={order.delivery_date} onChange={(e) => setCoreLocal('delivery_date', e.target.value)} onBlur={(e) => patch({ core: { delivery_date: e.target.value } })} placeholder="22/1" className="w-16 bg-transparent outline-none text-red-600 placeholder-red-300" />
              </span>
              {(() => { const b = paymentBadge(); return (
                order.linked_invoice ? (
                  <Link href={`/invoices/${order.linked_invoice.id}`} className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1 ${b.cls}`}>
                    💳 {b.text}
                  </Link>
                ) : (
                  <span className={`inline-flex items-center gap-1 text-xs font-semibold rounded-full px-3 py-1 ${b.cls}`}>💳 {b.text}</span>
                )
              ); })()}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">{orderTitle(order)}</h1>
            <input
              value={order.description}
              onChange={(e) => setCoreLocal('description', e.target.value)}
              onBlur={(e) => patch({ core: { description: e.target.value } })}
              placeholder="Description 描述 (e.g. 4款亞加力)"
              className="mt-2 w-full bg-transparent hover:bg-gray-50 focus:bg-white border border-transparent hover:border-gray-200 focus:border-brand-400 rounded px-2 py-1 text-sm outline-none"
            />
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes 備註</label>
              <textarea value={order.notes} onChange={(e) => setCoreLocal('notes', e.target.value)} onBlur={(e) => patch({ core: { notes: e.target.value } })} rows={2} placeholder="Add notes… (manually input or edited)" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm" />
            </div>
          </div>

          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Linked Records 關聯文件</h2>
            <div className="grid md:grid-cols-2 gap-5">
              {labeled(
                'Quotation 報價單',
                <div className="space-y-2">
                  {order.linked_quotation ? (
                    <Link href={`/quotations/${order.linked_quotation.id}`} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 text-brand-700 text-sm font-medium hover:bg-brand-100">
                      🔗 {order.linked_quotation.quote_number} · {order.linked_quotation.status}
                    </Link>
                  ) : (
                    <p className="text-sm text-gray-400">No quotation linked.</p>
                  )}
                  <select
                    value={order.quotation_id || ''}
                    onChange={(e) => patch({ linked_quotation_id: e.target.value || null })}
                    className={softInput}
                  >
                    <option value="">— Not linked —</option>
                    {quotations.map((q) => <option key={q.id} value={q.id}>{q.quote_number} · {q.status}</option>)}
                  </select>
                </div>
              )}
              {labeled(
                'Invoice 發票',
                <div className="space-y-2">
                  {order.linked_invoice ? (
                    <Link href={`/invoices/${order.linked_invoice.id}`} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 text-brand-700 text-sm font-medium hover:bg-brand-100">
                      🔗 {order.linked_invoice.invoice_number} · {order.linked_invoice.status}
                    </Link>
                  ) : (
                    <p className="text-sm text-gray-400">No invoice linked.</p>
                  )}
                  <select
                    value={order.linked_invoice?.id || ''}
                    onChange={(e) => patch({ linked_invoice_id: e.target.value || null })}
                    className={softInput}
                  >
                    <option value="">— Not linked —</option>
                    {invoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.invoice_number} · {inv.status}</option>)}
                  </select>
                </div>
              )}
            </div>
          </section>

          {/* BOX 1 — Order Detail (dynamic by Order Type) */}
          <section className="bg-white rounded-2xl border border-gray-200 p-8">
            <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold mb-1">Box 1</p>
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Order Detail 訂單詳情</h2>

            <div className="max-w-sm mb-8">
              {labeled(
                'Order Type 訂單類型',
                <select
                  value={orderType}
                  onChange={(e) => { setFieldLocal('order_type', e.target.value); patch({ fields: { order_type: e.target.value } }); }}
                  className={softInput}
                >
                  <option value="">Select type…</option>
                  {ORDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>

            {orderType === '訂製襟章' && (
              <div className="space-y-6">
                <div className="grid md:grid-cols-2 gap-5">
                  {labeled('Badge Style 襟章款式', fInput('badge_style', 'text', 'e.g. 亞加力雙面'))}
                  {labeled('Quantity 數量', fInput('badge_quantity', 'number', 'e.g. 100'))}
                </div>
                <div>
                  <p className="text-xs font-medium text-gray-500 mb-2">Image Preview 圖片預覽</p>
                  {order.files.length ? (
                    <div className="flex flex-wrap gap-2">
                      {order.files.map((f) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img key={f.id} src={orderFileUrl(f)} alt="preview" onClick={() => setLightbox(orderFileUrl(f))} className="h-16 w-16 object-cover rounded-lg border border-gray-200 cursor-zoom-in hover:ring-2 hover:ring-brand-400" />
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">Upload proofs in the “Design Proofs” section below.</p>
                  )}
                </div>
                {fieldsBox}
              </div>
            )}

            {orderType === '燕窩回禮燉製' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Dates 日期</h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
                    {labeled(
                      'Big Day',
                      <input
                        type="date"
                        value={fVal('big_day')}
                        onChange={(e) => setFieldLocal('big_day', e.target.value)}
                        onBlur={(e) => {
                          const v = e.target.value;
                          const upd: Record<string, string> = { big_day: v };
                          if (v && !fVal('expiry_date')) {
                            const d = new Date(v);
                            d.setDate(d.getDate() + 28);
                            const iso = d.toISOString().slice(0, 10);
                            upd.expiry_date = iso;
                            setFieldLocal('expiry_date', iso);
                          }
                          patch({ fields: upd });
                        }}
                        className={softInput}
                      />
                    )}
                    {labeled('到期日', fInput('expiry_date', 'date'), 'Big Day後4星期')}
                    {labeled('生產日期', fInput('production_date', 'date'))}
                    {labeled('客人送貨日期', fInput('client_delivery_date', 'date'))}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Client Quantities 客人訂購數量</h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 items-end">
                    {BIRD_NEST_FLAVORS.map((f) => (
                      <div key={f.key}>{labeled(f.label, fInput(f.key, 'number', '0'))}</div>
                    ))}
                    {readOnly('客人訂總數量', bn.totalOrdered)}
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Inventory & Production 本地模擬計算</h3>
                  <div className="max-w-xs mb-4">
                    {labeled('總生產樽數', fInput('production_bottles', 'number', `default ${bn.totalOrdered}`), 'defaults to 客人訂總數量')}
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
                    {readOnly('燕餅 (g)', `${bn.birdCakeGrams} g`)}
                    {readOnly('圓形tag', bn.roundTag)}
                    {readOnly('貼紙', bn.sticker)}
                    {readOnly('金繩', bn.goldString)}
                    {readOnly('Wedding Logo Tag', bn.weddingLogoTag)}
                  </div>
                  <p className="text-xs text-gray-400 mt-3">Auto-derived from 總生產樽數 (= {bn.productionBottles}) to simplify Tracy’s packing checklist. 燕餅 = 樽數 × {`${0.8}`}g.</p>
                </div>
              </div>
            )}

            {!orderType && <p className="text-sm text-gray-400">Choose an Order Type to reveal its fields.</p>}
          </section>

          {/* BOX 2 — Payment Detail */}
          <section className="bg-white rounded-2xl border border-gray-200 p-8">
            <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold mb-1">Box 2</p>
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Payment Detail 付款詳情</h2>

            {/* Payment receipt upload + AI scan */}
            <div className="grid md:grid-cols-[200px_1fr] gap-5 mb-6">
              <div>
                <div
                  onClick={() => paymentInputRef.current?.click()}
                  onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.[0]) handlePaymentReceipt(e.dataTransfer.files[0]); }}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-3 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors h-full flex flex-col items-center justify-center min-h-[130px]"
                >
                  <input ref={paymentInputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handlePaymentReceipt(e.target.files[0]); e.target.value = ''; }} />
                  {paymentPreview || order.fields.payment_receipt_path ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={paymentPreview || orderPaymentReceiptUrl(order.id, String(order.fields.payment_receipt_path || '')) || ''}
                      alt="Payment receipt"
                      onClick={(e) => { e.stopPropagation(); setLightbox(paymentPreview || orderPaymentReceiptUrl(order.id, String(order.fields.payment_receipt_path || '')) || ''); }}
                      className="max-h-28 rounded-lg cursor-zoom-in"
                    />
                  ) : (
                    <><div className="text-2xl mb-1">🧾</div><p className="text-xs font-medium text-gray-600">付款收據 Payment Receipt</p><p className="text-[11px] text-gray-400 mt-0.5">Drop / snap · AI auto-fills</p></>
                  )}
                </div>
                {paymentScanMsg && <p className="text-[11px] text-brand-700 mt-2">{paymentScanMsg}</p>}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 content-start">
                {labeled('支付日期 Payment Date', fInput('payment_date', 'date'))}
                {labeled('銀碼 Amount', paymentAmountInput, 'auto-sets 部分付款 Partly Paid')}
                {labeled('銀行 / 平台 Bank/Platform', fInput('payment_bank', 'text', 'e.g. 匯豐 / PayMe / FPS'))}
                {labeled('支付方式 Payment Method', fInput('payment_method_detail', 'text', 'e.g. FPS 轉數快'))}
                <div className="sm:col-span-2">{labeled('參考編號 Reference Number', fInput('payment_reference', 'text', 'Transaction / 流水號'))}</div>
              </div>
            </div>

            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5 border-t border-gray-100 pt-6">
              {labeled(
                'Payment Status 付款狀態',
                <select
                  value={fVal('payment_status_label')}
                  onChange={(e) => { setFieldLocal('payment_status_label', e.target.value); patch({ fields: { payment_status_label: e.target.value } }); }}
                  className={softInput}
                >
                  <option value="">—</option>
                  {PAYMENT_STATUS_LABELS.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              )}
              <div className="hidden lg:block" />
              <div className="hidden lg:block" />
              {labeled('第一次Payment 日期', fInput('payment1_date', 'date'))}
              {labeled('第一次Payment 金額', payment1AmountInput, 'auto-sets 部分付款 Partly Paid')}
              <div className="hidden lg:block" />
              {labeled('第二次Payment 日期', fInput('payment2_date', 'date'))}
              {labeled('第二次Payment 金額', fInput('payment2_amount', 'number', '0.00'))}
            </div>
          </section>

          {/* BOX 3 — Shipment Detail */}
          <section className="bg-white rounded-2xl border border-gray-200 p-8">
            <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold mb-1">Box 3</p>
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Shipment Detail 送貨詳情</h2>
            <div className="grid md:grid-cols-2 gap-5">
              {labeled('客人送貨日期', fInput('client_delivery_date', 'date'))}
              {labeled('客人收件時間', fInput('receiving_time', 'text', 'e.g. 2-6pm'))}
              {labeled('聯絡方式', fInput('contact_method', 'text', 'Phone / WhatsApp / WeChat'))}
              {labeled('Tracking Number 運單號', fInput('tracking_no', 'text', 'e.g. SF5120793357800'))}
              <div className="md:col-span-2">
                {labeled(
                  '送貨地址 Shipping Address',
                  <textarea
                    value={order.shipping_address}
                    onChange={(e) => setCoreLocal('shipping_address', e.target.value)}
                    onBlur={(e) => patch({ core: { shipping_address: e.target.value } })}
                    rows={3}
                    className={softInput}
                  />
                )}
              </div>
            </div>
          </section>

          {/* Client / Shipping info */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Client / Shipping 客戶及寄送</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name 客戶</label>
                <input value={order.name} onChange={(e) => setCoreLocal('name', e.target.value)} onBlur={(e) => patch({ core: { name: e.target.value } })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">電話 Phone</label>
                <input value={order.phone} onChange={(e) => setCoreLocal('phone', e.target.value)} onBlur={(e) => patch({ core: { phone: e.target.value } })} placeholder="+852…" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">E-mail</label>
                <input value={order.customer_email} onChange={(e) => setCoreLocal('customer_email', e.target.value)} onBlur={(e) => patch({ core: { customer_email: e.target.value } })} placeholder="name@email.com" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Shipping Address 寄出地址</label>
                <textarea value={order.shipping_address} onChange={(e) => setCoreLocal('shipping_address', e.target.value)} onBlur={(e) => patch({ core: { shipping_address: e.target.value } })} rows={3} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm" />
              </div>
            </div>
          </div>

          {/* Visual assets / image grid */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-gray-900">Design Proofs 設計圖 / Image Preview</h2>
                {uploadMsg && <p className="text-xs text-brand-700 mt-0.5">{uploadMsg}</p>}
              </div>
              <button onClick={() => fileInputRef.current?.click()} className="text-sm text-brand-600 hover:text-brand-700 font-medium">+ Upload images / PDF</button>
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ''; }} />
            </div>
            {order.files.length === 0 ? (
              <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 text-sm cursor-pointer hover:border-brand-400 hover:bg-brand-50/40">
                Click to upload product design proofs (images or PDF — heavy PDFs are auto-compressed to page images)
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {order.files.map((f) => (
                  <div key={f.id} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={orderFileUrl(f)} alt={f.original_name || 'proof'} onClick={() => setLightbox(orderFileUrl(f))} className="h-20 w-full object-cover rounded-lg border border-gray-200 cursor-zoom-in hover:ring-2 hover:ring-brand-400" />
                    <button onClick={() => deleteFile(f.id)} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100" aria-label="Delete image">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Structured custom fields — for 訂製襟章 this lives inside Box 1. */}
          {orderType !== '訂製襟章' && (
            <div className="bg-white rounded-xl border border-gray-200 p-6">
              <h2 className="font-semibold text-gray-900 mb-4">Fields 自訂欄位</h2>
              <div className="divide-y divide-gray-100">
                {ORDER_FIELDS.map((f) => (
                  <div key={f.key} className="grid grid-cols-1 sm:grid-cols-[240px_1fr] gap-1 sm:gap-3 py-2 items-center">
                    <div className="text-sm text-gray-500">{f.label}</div>
                    <div>{renderField(f)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* RIGHT COLUMN — 30% activity feed (fixed sidebar, feed scrolls) */}
        <div className="w-full lg:w-[30%] lg:h-full">
          <ActivityFeed entityType="order" entityId={order.id} className="lg:h-full max-h-[75vh] lg:max-h-none" />
        </div>
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4 cursor-zoom-out">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Proof" className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg shadow-2xl bg-white" />
        </div>
      )}
    </AppLayout>
  );
}
