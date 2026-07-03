'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { orderTitle, type Order } from '@/lib/orders';

interface Business { name: string; company_name: string | null; email: string; }

export default function DeliveryNotePage() {
  const { id } = useParams();
  const [order, setOrder] = useState<Order | null>(null);
  const [business, setBusiness] = useState<Business | null>(null);

  useEffect(() => {
    fetch(`/api/orders/${id}`).then((r) => (r.ok ? r.json() : null)).then((d) => setOrder(d?.order || null));
    fetch('/api/auth/me').then((r) => r.json()).then((d) => d?.user && setBusiness({ name: d.user.name, company_name: d.user.company_name, email: d.user.email }));
  }, [id]);

  // Log delivery-note generation to the order activity feed (once per session).
  useEffect(() => {
    if (!order) return;
    const key = `dn-logged-${id}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
    fetch('/api/activities', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'order', id, body: '🚚 Generated delivery note (出貨單)' }),
    }).catch(() => {});
  }, [order, id]);

  if (!order) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>;
  }

  const productDesc = order.description || order.name || '—';
  const quantity = (order.fields.qty_ordered as string) || (order.fields.supplier_qty as string) || '—';
  const cartons = order.carton_count || '—';

  return (
    <div className="min-h-screen bg-gray-100">
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between">
        <Link href={`/orders/${id}`} className="text-sm text-brand-600 hover:text-brand-700 font-medium">← Back to order</Link>
        <button onClick={() => window.print()} className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700">Print / Save as PDF</button>
      </div>

      <div className="max-w-3xl mx-auto my-8 bg-white shadow-lg rounded-lg overflow-hidden print:shadow-none print:my-0 print:rounded-none">
        <div className="p-12">
          <div className="flex justify-between items-start mb-10">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">DELIVERY NOTE</h1>
              <p className="text-lg text-gray-500 font-medium mt-1">出貨單</p>
            </div>
            <div className="text-right">
              <p className="font-bold text-lg text-gray-900">{business?.company_name || business?.name || 'InvoiceFlow'}</p>
              {business?.email && <p className="text-sm text-gray-600">{business.email}</p>}
              <p className="text-sm text-gray-500 mt-1">Date: {new Date().toLocaleDateString('en-HK')}</p>
            </div>
          </div>

          {/* Prominent carton count for the courier */}
          <div className="mb-10 border-2 border-gray-900 rounded-xl p-5 flex items-center justify-between print-exact bg-gray-900 text-white">
            <div>
              <p className="text-xs uppercase tracking-widest opacity-80">Total Cartons 箱數</p>
              <p className="text-sm opacity-80">Number of boxes to hand over</p>
            </div>
            <p className="text-5xl font-extrabold leading-none">{cartons}</p>
          </div>

          <div className="grid grid-cols-2 gap-10 mb-10">
            <div>
              <p className="text-xs text-gray-500 uppercase font-semibold tracking-wider mb-2">Ship To 送貨地址</p>
              <p className="font-semibold text-gray-900 text-lg">{order.name || '—'}</p>
              <p className="text-sm text-gray-700 whitespace-pre-wrap mt-1">{order.shipping_address || '—'}</p>
              <p className="text-sm text-gray-700 mt-2"><span className="text-gray-500">電話 Phone:</span> {order.phone || '—'}</p>
              {order.customer_email && <p className="text-sm text-gray-700"><span className="text-gray-500">E-mail:</span> {order.customer_email}</p>}
            </div>
            <div className="text-right">
              <div className="inline-block text-left space-y-2">
                <div className="flex justify-between gap-8"><span className="text-sm text-gray-500">PO#:</span><span className="text-sm font-semibold">{order.po_number || '—'}</span></div>
                <div className="flex justify-between gap-8"><span className="text-sm text-gray-500">Order:</span><span className="text-sm font-medium">{orderTitle(order)}</span></div>
                <div className="flex justify-between gap-8"><span className="text-sm text-gray-500">交貨 Delivery:</span><span className="text-sm font-medium">{order.delivery_date || '—'}</span></div>
                {order.fields.tracking_no ? (
                  <div className="flex justify-between gap-8"><span className="text-sm text-gray-500">Tracking:</span><span className="text-sm font-medium">{order.fields.tracking_no as string}</span></div>
                ) : null}
              </div>
            </div>
          </div>

          <table className="w-full mb-10">
            <thead>
              <tr className="border-b-2 border-gray-900">
                <th className="text-left py-3 text-sm font-semibold uppercase tracking-wider">Product Description 產品描述</th>
                <th className="text-right py-3 text-sm font-semibold uppercase tracking-wider">Quantity 數量</th>
                <th className="text-right py-3 text-sm font-semibold uppercase tracking-wider">Cartons 箱數</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-b border-gray-100">
                <td className="py-4 text-sm">{productDesc}</td>
                <td className="py-4 text-sm text-right">{quantity}</td>
                <td className="py-4 text-sm text-right font-semibold">{cartons}</td>
              </tr>
            </tbody>
          </table>

          <div className="grid grid-cols-2 gap-10 pt-16">
            <div>
              <div className="border-t border-gray-400 pt-2 text-sm text-gray-600">Delivered by (簽名) / Date</div>
            </div>
            <div>
              <div className="border-t border-gray-400 pt-2 text-sm text-gray-600">Received by (客戶簽收) / Date</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
