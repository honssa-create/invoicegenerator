'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { formatCurrency } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { QUOTATION_STATUS_COLORS, type QuotationWithDetails } from '@/lib/quotations';

export default function QuotationsPage() {
  const router = useRouter();
  const [quotations, setQuotations] = useState<QuotationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = () => {
    setLoading(true);
    fetch('/api/quotations')
      .then((r) => r.json())
      .then((d) => setQuotations(d.quotations || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => { load(); }, []);

  const create = async () => {
    setCreating(true);
    const res = await fetch('/api/quotations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ issue_date: new Date().toISOString().slice(0, 10), items: [] }),
    });
    const data = await res.json();
    setCreating(false);
    if (res.ok && data.quotation) router.push(`/quotations/${data.quotation.id}`);
  };

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Quotations 報價單</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">Create quotations, export, and convert to orders or invoices</p>
        </div>
        <div className="page-actions">
          <button onClick={create} disabled={creating} className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50">
            {creating ? 'Creating…' : '+ New Quotation'}
          </button>
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="p-12 text-center"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" /></div>
        ) : quotations.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No quotations yet. Create your first quotation.</div>
        ) : (
          <div className="table-scroll">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-6 py-3">Quote #</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Issue Date</th>
                <th className="px-6 py-3">Total</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {quotations.map((q) => (
                <tr key={q.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link href={`/quotations/${q.id}`} className="text-brand-600 hover:text-brand-700 font-medium text-sm">{q.quote_number}</Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{q.customer_name || '—'}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(q.issue_date)}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{formatCurrency(q.total)}</td>
                  <td className="px-6 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${QUOTATION_STATUS_COLORS[q.status]}`}>{q.status}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
