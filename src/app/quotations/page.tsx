'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import FilterBar from '@/components/FilterBar';
import { useAuth } from '@/components/AuthProvider';
import { formatCurrency } from '@/components/ui';
import { formatDate } from '@/lib/utils';
import { isSectionReadOnly } from '@/lib/permissions';
import {
  QUOTATION_STATUSES,
  QUOTATION_STATUS_COLORS,
  type QuotationWithDetails,
} from '@/lib/quotations';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

type SortKey = 'number' | 'customer' | 'date' | 'amount' | 'status';
const PAGE_SIZE = 50;

export default function QuotationsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const readOnly = user ? isSectionReadOnly(user.role, 'quotations') : false;
  const [quotations, setQuotations] = useState<QuotationWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [client, setClient] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({ key: 'date', dir: 'desc' });
  const [page, setPage] = useState(1);

  const load = () => {
    setLoading(true);
    fetch('/api/quotations')
      .then((r) => r.json())
      .then((d) => setQuotations(d.quotations || []))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
  }, []);

  const clientOptions = Array.from(
    new Set(quotations.map((q) => q.customer_name).filter(Boolean) as string[])
  );

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = quotations.filter((row) => {
      if (dateStart && row.issue_date < dateStart) return false;
      if (dateEnd && row.issue_date > dateEnd) return false;
      if (client && row.customer_name !== client) return false;
      if (status && row.status !== status) return false;
      if (q) {
        const hay = [row.quote_number, row.customer_name].filter(Boolean).join(' ').toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const dir = sort.dir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      let base: number;
      switch (sort.key) {
        case 'number':
          base = a.quote_number.localeCompare(b.quote_number);
          break;
        case 'customer':
          base = (a.customer_name || '').localeCompare(b.customer_name || '', 'zh');
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
  }, [quotations, dateStart, dateEnd, client, status, search, sort]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const pageStart = displayed.length ? (page - 1) * PAGE_SIZE : 0;
  const pageEnd = Math.min(page * PAGE_SIZE, displayed.length);
  const pageRows = displayed.slice(pageStart, pageEnd);

  useEffect(() => {
    setPage(1);
  }, [dateStart, dateEnd, client, status, search, sort]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' }
    );
  const arrow = (key: SortKey) => (sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ' ↕');
  const sortTh = (key: SortKey, label: string) => (
    <th
      onClick={() => toggleSort(key)}
      className={`px-6 py-3 cursor-pointer select-none whitespace-nowrap hover:text-gray-700 ${
        sort.key === key ? 'text-brand-700' : ''
      }`}
    >
      {label}
      <span className="text-gray-400">{arrow(key)}</span>
    </th>
  );

  const clearFilters = () => {
    setDateStart('');
    setDateEnd('');
    setClient('');
    setStatus('');
    setSearch('');
  };

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

  const selectCls =
    'px-2.5 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

  const pager = (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 text-sm">
      <div className="text-gray-600">
        {displayed.length === 0
          ? 'No records'
          : `Showing ${pageStart + 1}–${pageEnd} of ${displayed.length}`}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 text-xs font-medium"
        >
          ← Prev
        </button>
        <span className="text-xs text-gray-500">
          Page {page} / {totalPages}
        </span>
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="px-2.5 py-1 rounded-lg border border-gray-200 text-gray-700 hover:bg-gray-50 disabled:opacity-40 text-xs font-medium"
        >
          Next →
        </button>
      </div>
    </div>
  );

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{TITLE.quotations}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            {readOnly
              ? bi('View quotations (read-only)', '查看報價單（唯讀）')
              : bi(
                  'Create quotations, export, and convert to orders or invoices',
                  '建立報價單、匯出及轉換為訂單或發票'
                )}
          </p>
        </div>
        <div className="page-actions">
          {!readOnly && (
            <button
              onClick={create}
              disabled={creating}
              className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {creating ? BTN.creating : `+ ${bi('New Quotation', '新增報價單')}`}
            </button>
          )}
        </div>
      </div>

      <FilterBar
        dateStart={dateStart}
        dateEnd={dateEnd}
        onDateStart={setDateStart}
        onDateEnd={setDateEnd}
        search={search}
        onSearch={setSearch}
        searchPlaceholder={bi('Search quote # or client…', '搜尋報價編號或客戶…')}
        onClear={clearFilters}
      >
        <div className="flex flex-col">
          <label className="text-[11px] font-medium text-gray-500 mb-1">{bi('Client', '客戶')}</label>
          <select value={client} onChange={(e) => setClient(e.target.value)} className={selectCls}>
            <option value="">{BTN.all}</option>
            {clientOptions.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col">
          <label className="text-[11px] font-medium text-gray-500 mb-1">{bi('Status', '狀態')}</label>
          <select value={status} onChange={(e) => setStatus(e.target.value)} className={selectCls}>
            <option value="">{BTN.all}</option>
            {QUOTATION_STATUSES.map((s) => (
              <option key={s} value={s} className="capitalize">
                {s}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

      <div className="bg-white rounded-xl border border-gray-200">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
          </div>
        ) : quotations.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {bi('No quotations yet. Create your first quotation.', '尚無報價單。建立第一張報價單。')}
          </div>
        ) : displayed.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {bi('No quotations match your filters.', '沒有符合篩選條件的報價單。')}
          </div>
        ) : (
          <>
            <div className="border-b border-gray-100">{pager}</div>
            <div className="table-scroll">
              <table className="w-full min-w-[640px]">
                <thead>
                  <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                    {sortTh('number', bi('Quote #', '報價編號'))}
                    {sortTh('customer', bi('Customer', '客戶'))}
                    {sortTh('date', bi('Issue Date', '開立日期'))}
                    {sortTh('amount', bi('Total', '總計'))}
                    {sortTh('status', bi('Status', '狀態'))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {pageRows.map((q) => (
                    <tr key={q.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <Link
                          href={`/quotations/${q.id}`}
                          className="text-brand-600 hover:text-brand-700 font-medium text-sm"
                        >
                          {q.quote_number}
                        </Link>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-700">{q.customer_name || '—'}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">{formatDate(q.issue_date)}</td>
                      <td className="px-6 py-4 text-sm font-medium text-gray-900">
                        {formatCurrency(q.total)}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium capitalize ${QUOTATION_STATUS_COLORS[q.status]}`}
                        >
                          {q.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {displayed.length > PAGE_SIZE && (
              <div className="border-t border-gray-100">{pager}</div>
            )}
          </>
        )}
      </div>
    </AppLayout>
  );
}
