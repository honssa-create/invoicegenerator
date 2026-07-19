'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { orderPaymentReceiptUrl } from '@/lib/image-url';
import { BTN, MSG, TITLE, bi } from '@/lib/ui-labels';

interface Entry {
  order_id: number;
  order_ref: string;
  title: string;
  customer: string;
  order_type: string;
  payment_date: string;
  amount: string;
  bank: string;
  method: string;
  reference: string;
  has_receipt: boolean;
  payment_receipt_path: string;
  verified: boolean;
}

export default function AccountingPage() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/accounting').then((r) => r.json()).then((d) => setEntries(d.entries || [])).finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const toggleVerify = async (e: Entry) => {
    const next = !e.verified;
    setEntries((prev) => prev.map((x) => (x.order_id === e.order_id ? { ...x, verified: next } : x)));
    await fetch(`/api/orders/${e.order_id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields: { payment_verified: next } }),
    });
  };

  const shown = onlyPending ? entries.filter((e) => !e.verified) : entries;
  const verifiedCount = entries.filter((e) => e.verified).length;

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{TITLE.accounting}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">{bi('One unified view of every order payment — tick each against your bank statement', '統一檢視所有訂單付款 — 與銀行對帳單逐筆核對')}</p>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 min-h-[44px] sm:min-h-0">
          <input type="checkbox" checked={onlyPending} onChange={(e) => setOnlyPending(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500" />
          {bi('Show pending only', '僅顯示待核對')}
        </label>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 max-w-none sm:max-w-md">
        <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-500">{bi('Entries', '筆數')}</p><p className="text-2xl font-bold">{entries.length}</p></div>
        <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-500">{BTN.verified}</p><p className="text-2xl font-bold text-green-600">{verifiedCount}</p></div>
        <div className="bg-white rounded-xl border border-gray-200 p-4"><p className="text-xs text-gray-500">{BTN.pending}</p><p className="text-2xl font-bold text-amber-600">{entries.length - verifiedCount}</p></div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" /></div>
        ) : shown.length === 0 ? (
          <div className="p-12 text-center text-gray-500">{MSG.noPaymentEntriesYet}</div>
        ) : (
          <table className="w-full min-w-[1000px] text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-4 py-3">Receipt</th>
                <th className="px-4 py-3">Order #</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Payment Date</th>
                <th className="px-4 py-3">Amount</th>
                <th className="px-4 py-3">Bank</th>
                <th className="px-4 py-3">Method</th>
                <th className="px-4 py-3">Reference</th>
                <th className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {shown.map((e) => (
                <tr key={e.order_id} className={`hover:bg-gray-50 ${e.verified ? 'bg-green-50/30' : ''}`}>
                  <td className="px-4 py-3">
                    {e.has_receipt ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={orderPaymentReceiptUrl(e.order_id, e.payment_receipt_path) || ''} alt="receipt" onClick={() => setLightbox(orderPaymentReceiptUrl(e.order_id, e.payment_receipt_path) || '')} className="h-11 w-11 object-cover rounded border border-gray-200 cursor-zoom-in hover:ring-2 hover:ring-brand-400" />
                    ) : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3">
                    <Link href={`/orders/${e.order_id}`} className="text-brand-600 hover:text-brand-700 font-medium font-mono">{e.order_ref}</Link>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{e.customer || '—'}</td>
                  <td className="px-4 py-3 text-gray-500">{e.order_type || '—'}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{e.payment_date || '—'}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{e.amount || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{e.bank || '—'}</td>
                  <td className="px-4 py-3 text-gray-700">{e.method || '—'}</td>
                  <td className="px-4 py-3 font-mono text-gray-600">{e.reference || '—'}</td>
                  <td className="px-4 py-3">
                    {e.verified ? (
                      <button onClick={() => toggleVerify(e)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200">✓ {BTN.verified}</button>
                    ) : (
                      <button onClick={() => toggleVerify(e)} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200">{BTN.confirmEntry}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4 cursor-zoom-out">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Receipt" className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg shadow-2xl bg-white" />
        </div>
      )}
    </AppLayout>
  );
}
