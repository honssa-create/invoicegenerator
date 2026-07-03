'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import { StatusBadge, formatCurrency } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import type { InvoiceWithDetails } from '@/lib/types';

const STATUS_FILTERS = ['all', 'draft', 'sent', 'paid', 'overdue'] as const;

export default function InvoicesList() {
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<InvoiceWithDetails[]>([]);
  const [filter, setFilter] = useState(searchParams.get('status') || 'all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const url = filter === 'all' ? '/api/invoices' : `/api/invoices?status=${filter}`;
    setLoading(true);
    fetch(url)
      .then((res) => res.json())
      .then((data) => setInvoices(data.invoices || []))
      .finally(() => setLoading(false));
  }, [filter]);

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this invoice?')) return;
    await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
    setInvoices((prev) => prev.filter((i) => i.id !== id));
  };

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-500 mt-1">Create and manage your invoices</p>
        </div>
        <div className="flex gap-3">
          <a
            href="/api/invoices/export"
            className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
          >
            ⬇ Export to Excel
          </a>
          <Link
            href="/invoices/new"
            className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
          >
            + New Invoice
          </Link>
        </div>
      </div>

      <div className="flex gap-2 mb-6">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 text-sm rounded-lg capitalize transition-colors ${
              filter === s
                ? 'bg-brand-600 text-white'
                : 'bg-white border border-gray-200 text-gray-600 hover:bg-gray-50'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p>No invoices found.</p>
            <Link href="/invoices/new" className="mt-2 inline-block text-brand-600 font-medium text-sm">
              Create an invoice
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-6 py-3">Invoice #</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Issue Date</th>
                <th className="px-6 py-3">Due Date</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Status</th>
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {invoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link href={`/invoices/${inv.id}`} className="text-brand-600 hover:text-brand-700 font-medium text-sm">
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{inv.customer_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(inv.issue_date)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(inv.due_date)}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{formatCurrency(inv.total)}</td>
                  <td className="px-6 py-4"><StatusBadge status={inv.status} /></td>
                  <td className="px-6 py-4 text-sm space-x-3">
                    <Link href={`/invoices/${inv.id}`} className="text-brand-600 hover:text-brand-700 font-medium">
                      View
                    </Link>
                    <Link href={`/invoices/${inv.id}/print`} className="text-gray-600 hover:text-gray-800 font-medium">
                      Print
                    </Link>
                    <button onClick={() => handleDelete(inv.id)} className="text-red-600 hover:text-red-700 font-medium">
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}
