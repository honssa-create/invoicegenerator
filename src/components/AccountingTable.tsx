'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { orderPaymentReceiptUrl } from '@/lib/image-url';
import type { PaymentSlot } from '@/lib/orders';
import { displayOrderNumber } from '@/lib/record-numbering-core';
import { BTN, MSG, bi } from '@/lib/ui-labels';

interface Entry {
  order_id: number;
  payment_slot: PaymentSlot;
  installment_label: string;
  order_ref: string;
  po_number?: string;
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
  linked_reconciliation_id: number | null;
}

const PAGE_SIZE = 50;

export default function AccountingTable() {
  const router = useRouter();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [onlyPending, setOnlyPending] = useState(false);
  const [page, setPage] = useState(1);

  useEffect(() => {
    fetch('/api/accounting')
      .then((r) => r.json())
      .then((d) => setEntries(d.entries || []))
      .finally(() => setLoading(false));
  }, []);

  const goLinkPayment = (entry: Entry) => {
    const params = new URLSearchParams();
    params.set('linkOrderId', String(entry.order_id));
    params.set('paymentSlot', String(entry.payment_slot));
    if (entry.amount) params.set('amount', entry.amount);
    if (entry.payment_date) params.set('date', entry.payment_date);
    if (entry.order_ref) params.set('orderRef', entry.order_ref);
    router.push(`/reconciliation?${params.toString()}`);
  };

  const goVerifiedRecord = (entry: Entry) => {
    if (entry.linked_reconciliation_id) {
      router.push(`/reconciliation?recordId=${entry.linked_reconciliation_id}`);
      return;
    }
    router.push(`/reconciliation?matchedOrderId=${entry.order_id}`);
  };

  const shown = useMemo(
    () => (onlyPending ? entries.filter((entry) => !entry.verified) : entries),
    [entries, onlyPending]
  );

  useEffect(() => {
    setPage(1);
  }, [onlyPending]);

  const totalPages = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const pageRows = shown.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const verifiedCount = entries.filter((entry) => entry.verified).length;

  return (
    <>
      <div className="flex flex-col gap-4 mb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 w-full sm:max-w-md">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{bi('Entries', '筆數')}</p>
            <p className="text-2xl font-bold">{entries.length}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{BTN.verified}</p>
            <p className="text-2xl font-bold text-green-600">{verifiedCount}</p>
          </div>
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-xs text-gray-500">{BTN.pending}</p>
            <p className="text-2xl font-bold text-amber-600">{entries.length - verifiedCount}</p>
          </div>
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-600 min-h-[44px] sm:min-h-0">
          <input
            type="checkbox"
            checked={onlyPending}
            onChange={(event) => setOnlyPending(event.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
          />
          {bi('Show pending only', '僅顯示待核對')}
        </label>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
          </div>
        ) : shown.length === 0 ? (
          <div className="p-12 text-center text-gray-500">{MSG.noPaymentEntriesYet}</div>
        ) : (
          <>
            <table className="w-full min-w-[1080px] text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  <th className="px-4 py-3">Receipt</th>
                  <th className="px-4 py-3">Order #</th>
                  <th className="px-4 py-3">{bi('Installment', '期數')}</th>
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
                {pageRows.map((entry) => {
                  const receiptUrl = orderPaymentReceiptUrl(
                    entry.order_id,
                    entry.payment_receipt_path,
                    entry.payment_slot
                  );
                  return (
                    <tr
                      key={`${entry.order_id}-${entry.payment_slot}`}
                      className={`hover:bg-gray-50 ${entry.verified ? 'bg-green-50/30' : ''}`}
                    >
                      <td className="px-4 py-3">
                        {entry.has_receipt && receiptUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={receiptUrl}
                            alt="receipt"
                            loading="lazy"
                            onClick={() => setLightbox(receiptUrl)}
                            className="h-11 w-11 object-cover rounded border border-gray-200 cursor-zoom-in hover:ring-2 hover:ring-brand-400"
                          />
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Link
                          href={`/orders/${entry.order_id}`}
                          className="text-brand-600 hover:text-brand-700 font-medium font-mono"
                        >
                          {displayOrderNumber(entry.po_number) || entry.order_ref}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{entry.installment_label}</td>
                      <td className="px-4 py-3 text-gray-700">{entry.customer || '—'}</td>
                      <td className="px-4 py-3 text-gray-500">{entry.order_type || '—'}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">
                        {entry.payment_date || '—'}
                      </td>
                      <td className="px-4 py-3 font-medium text-gray-900">{entry.amount || '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{entry.bank || '—'}</td>
                      <td className="px-4 py-3 text-gray-700">{entry.method || '—'}</td>
                      <td className="px-4 py-3 font-mono text-gray-600">{entry.reference || '—'}</td>
                      <td className="px-4 py-3">
                        {entry.verified ? (
                          <button
                            type="button"
                            onClick={() => goVerifiedRecord(entry)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700 hover:bg-green-200"
                          >
                            ✓ {BTN.verified}
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => goLinkPayment(entry)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-700 hover:bg-amber-200"
                          >
                            {BTN.confirmEntry}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 text-sm text-gray-600">
                <span>
                  {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, shown.length)} of {shown.length}
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.max(1, current - 1))}
                    disabled={page <= 1}
                    className="px-2.5 py-1 rounded-lg border border-gray-200 disabled:opacity-40"
                  >
                    ← Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                    disabled={page >= totalPages}
                    className="px-2.5 py-1 rounded-lg border border-gray-200 disabled:opacity-40"
                  >
                    Next →
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4 cursor-zoom-out"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Receipt"
            className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg shadow-2xl bg-white"
          />
        </div>
      )}
    </>
  );
}
