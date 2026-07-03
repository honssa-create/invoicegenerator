'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import ActivityFeed from '@/components/ActivityFeed';
import {
  ORDER_FIELDS,
  ORDER_STATUSES,
  STATUS_COLORS,
  orderTitle,
  type Order,
  type OrderFieldDef,
} from '@/lib/orders';

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setOrder(d?.order || null))
      .finally(() => setLoading(false));
  }, [id]);

  const patch = async (payload: { core?: Record<string, unknown>; fields?: Record<string, unknown> }) => {
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

  const uploadFiles = async (files: FileList) => {
    const fd = new FormData();
    Array.from(files).forEach((f) => fd.append('file', f));
    const res = await fetch(`/api/orders/${id}/files`, { method: 'POST', body: fd });
    if (res.ok) {
      const data = await res.json();
      setOrder((o) => (o ? { ...o, files: data.files } : o));
    }
  };

  const deleteFile = async (fileId: number) => {
    const res = await fetch(`/api/order-files/${fileId}`, { method: 'DELETE' });
    if (res.ok) setOrder((o) => (o ? { ...o, files: o.files.filter((f) => f.id !== fileId) } : o));
  };

  const paymentBadge = () => {
    const inv = order?.linked_invoice;
    if (!inv) return { text: 'No invoice linked', cls: 'bg-gray-100 text-gray-600' };
    if (inv.status === 'paid') return { text: '✓ Paid · 100% Payment (全數付清)', cls: 'bg-green-100 text-green-700' };
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
        <div className="p-12 text-center text-gray-500">Order not found. <button onClick={() => router.push('/orders')} className="text-brand-600 underline">Back to orders</button></div>
      </AppLayout>
    );
  }

  const cellCls = 'w-full bg-transparent hover:bg-gray-50 focus:bg-white border border-transparent hover:border-gray-200 focus:border-brand-400 focus:ring-1 focus:ring-brand-400 rounded px-2 py-1 text-sm outline-none transition-colors';

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

  return (
    <AppLayout>
      <button onClick={() => router.push('/orders')} className="text-sm text-brand-600 hover:text-brand-700 font-medium mb-4">← Back to orders</button>

      <div className="flex flex-col lg:flex-row gap-6 lg:items-stretch lg:h-[calc(100vh-7rem)]">
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
            <h1 className="text-2xl font-bold text-gray-900">{orderTitle(order)}</h1>
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
              <h2 className="font-semibold text-gray-900">Design Proofs 設計圖 / Image Preview</h2>
              <button onClick={() => fileInputRef.current?.click()} className="text-sm text-brand-600 hover:text-brand-700 font-medium">+ Upload images</button>
              <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ''; }} />
            </div>
            {order.files.length === 0 ? (
              <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 text-sm cursor-pointer hover:border-brand-400 hover:bg-brand-50/40">
                Click to upload product design proof images
              </div>
            ) : (
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3">
                {order.files.map((f) => (
                  <div key={f.id} className="relative group">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/order-files/${f.id}`} alt={f.original_name || 'proof'} onClick={() => setLightbox(`/api/order-files/${f.id}`)} className="h-20 w-full object-cover rounded-lg border border-gray-200 cursor-zoom-in hover:ring-2 hover:ring-brand-400" />
                    <button onClick={() => deleteFile(f.id)} className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-red-500 text-white text-xs flex items-center justify-center opacity-0 group-hover:opacity-100" aria-label="Delete image">×</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Structured custom fields */}
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
