'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import FilterBar from '@/components/FilterBar';
import { StatusBadge, formatCurrency } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import type { InvoiceWithDetails } from '@/lib/types';

type SortKey = 'number' | 'customer' | 'date' | 'due' | 'amount' | 'status';
const STATUSES = ['draft', 'sent', 'paid', 'overdue'];

export default function InvoicesList() {
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<InvoiceWithDetails[]>([]);
  const [loading, setLoading] = useState(true);

  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [client, setClient] = useState('');
  const [status, setStatus] = useState(searchParams.get('status') || '');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });

  const loadInvoices = () => {
    setLoading(true);
    fetch('/api/invoices')
      .then((res) => res.json())
      .then((data) => setInvoices(data.invoices || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadInvoices();
  }, []);

  const clientOptions = Array.from(new Set(invoices.map((i) => i.customer_name).filter(Boolean)));

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = invoices.filter((inv) => {
      if (dateStart && inv.issue_date < dateStart) return false;
      if (dateEnd && inv.issue_date > dateEnd) return false;
      if (client && inv.customer_name !== client) return false;
      if (status && inv.status !== status) return false;
      if (q) {
        const hay = [inv.invoice_number, inv.customer_name].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      let base: number;
      switch (sort.key) {
        case 'number':
          base = a.invoice_number.localeCompare(b.invoice_number);
          break;
        case 'customer':
          base = a.customer_name.localeCompare(b.customer_name);
          break;
        case 'due':
          base = a.due_date.localeCompare(b.due_date);
          break;
        case 'amount':
          base = a.total - b.total;
          break;
        case 'status':
          base = a.status.localeCompare(b.status);
          break;
        default:
          base = a.issue_date.localeCompare(b.issue_date);
      }
      return dir * base;
    });
    return list;
  }, [invoices, dateStart, dateEnd, client, status, search, sort]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }));
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ' ↕');
  const sortTh = (key: SortKey, label: string) => (
    <th
      onClick={() => toggleSort(key)}
      className={`px-6 py-3 cursor-pointer select-none whitespace-nowrap hover:text-gray-700 ${sort.key === key ? 'text-brand-700' : ''}`}
    >
      {label}
      <span className="text-gray-400">{arrow(key)}</span>
    </th>
  );

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this invoice?')) return;
    await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
    setInvoices((prev) => prev.filter((i) => i.id !== id));
  };

  const clearFilters = () => {
    setDateStart('');
    setDateEnd('');
    setClient('');
    setStatus('');
    setSearch('');
  };

  const [remindering, setRemindering] = useState(false);
  const runReminders = async () => {
    setRemindering(true);
    try {
      const res = await fetch('/api/cron/payment-reminders', { method: 'POST' });
      const data = await res.json();
      if (res.ok) {
        const sentCount = (data.reminders || []).filter((r: { sent: boolean }) => r.sent).length;
        alert(`Checked invoices ≥ ${data.days} days old.\nReminders processed: ${data.processed}\nEmails actually sent: ${sentCount}${sentCount === 0 && data.processed > 0 ? '\n(No email provider configured — reminders were logged to each record\u2019s activity feed.)' : ''}`);
      } else {
        alert(data.error || 'Failed to run reminders');
      }
    } finally {
      setRemindering(false);
    }
  };

  const selectCls = 'px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

  return (
    <AppLayout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Invoices</h1>
          <p className="text-gray-500 mt-1">Create and manage your invoices</p>
        </div>
        <div className="flex gap-3">
          <button onClick={runReminders} disabled={remindering} className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50">
            {remindering ? 'Checking…' : '⏰ Run 30-day reminders'}
          </button>
          <a href="/api/invoices/export" className="px-4 py-2 bg-white border border-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
            ⬇ Export to Excel
          </a>
          <Link href="/invoices/new" className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors">
            + New Invoice
          </Link>
        </div>
      </div>

      <FilterBar
        dateStart={dateStart}
        dateEnd={dateEnd}
        onDateStart={setDateStart}
        onDateEnd={setDateEnd}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search invoice # or client…"
        onClear={clearFilters}
      >
        <div className="flex flex-col">
          <label className="text-[11px] font-medium text-gray-500 mb-1">Client</label>
          <select value={client} onChange={(e) => setClient(e.target.value)} className={selectCls}>
            <option value="">All</option>
            {clientOptions.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] font-medium text-gray-500 mb-1">Status</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
            <option value="">All</option>
            {STATUSES.map((s) => <option key={s} value={s} className="capitalize">{s}</option>)}
          </select>
        </div>
      </FilterBar>

      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p>No invoices match your filters.</p>
            <Link href="/invoices/new" className="mt-2 inline-block text-brand-600 font-medium text-sm">Create an invoice</Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                {sortTh('number', 'Invoice #')}
                {sortTh('customer', 'Customer')}
                {sortTh('date', 'Issue Date')}
                {sortTh('due', 'Due Date')}
                {sortTh('amount', 'Amount')}
                {sortTh('status', 'Status')}
                <th className="px-6 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link href={`/invoices/${inv.id}`} className="text-brand-600 hover:text-brand-700 font-medium text-sm">{inv.invoice_number}</Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{inv.customer_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(inv.issue_date)}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(inv.due_date)}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{formatCurrency(inv.total)}</td>
                  <td className="px-6 py-4"><StatusBadge status={inv.status} /></td>
                  <td className="px-6 py-4 text-sm space-x-3">
                    <Link href={`/invoices/${inv.id}`} className="text-brand-600 hover:text-brand-700 font-medium">View</Link>
                    <Link href={`/invoices/${inv.id}/print`} className="text-gray-600 hover:text-gray-800 font-medium">Print</Link>
                    <button onClick={() => handleDelete(inv.id)} className="text-red-600 hover:text-red-700 font-medium">Delete</button>
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
