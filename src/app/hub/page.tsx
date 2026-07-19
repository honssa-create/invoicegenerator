'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AppLayout from '@/components/AppLayout';
import FilterBar from '@/components/FilterBar';
import { StatCard } from '@/components/ui';
import { formatMoney } from '@/lib/cashflow';
import {
  HUB_PLATFORMS,
  HUB_PLATFORM_LABELS,
  type HubIntegrationStatus,
  type HubOrderRow,
  type HubPlatform,
} from '@/lib/hub';

interface HubResponse {
  orders: HubOrderRow[];
  integrations: HubIntegrationStatus[];
  summary: { total: number; external: number; byPlatform: Record<string, number> };
}

const PLATFORM_COLORS: Record<HubPlatform, string> = {
  nestiee: 'bg-pink-100 text-pink-800',
  honour: 'bg-indigo-100 text-indigo-800',
  cupmoka: 'bg-orange-100 text-orange-800',
  quickbooks: 'bg-green-100 text-green-800',
  manual: 'bg-gray-100 text-gray-700',
};

export default function OrderHubPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center text-gray-500">Loading hub…</div>}>
      <OrderHubContent />
    </Suspense>
  );
}

function OrderHubContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<HubResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncingWoo, setSyncingWoo] = useState(false);
  const [syncingQb, setSyncingQb] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [platformFilter, setPlatformFilter] = useState<HubPlatform | 'all'>('all');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/hub')
      .then((r) => r.json())
      .then(setData)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    const connected = searchParams.get('connected');
    const qbError = searchParams.get('qb_error');
    if (connected === 'quickbooks') setMessage('QuickBooks connected successfully.');
    if (qbError) setError(`QuickBooks OAuth error: ${qbError}`);
  }, [searchParams]);

  const filtered = useMemo(() => {
    let rows = data?.orders || [];
    if (platformFilter !== 'all') rows = rows.filter((r) => r.source_platform === platformFilter);
    if (dateStart) rows = rows.filter((r) => r.created_at.slice(0, 10) >= dateStart);
    if (dateEnd) rows = rows.filter((r) => r.created_at.slice(0, 10) <= dateEnd);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      rows = rows.filter((r) =>
        [r.system_order_no, r.po_number, r.customer_name, r.original_order_id, r.status]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q)
      );
    }
    return rows;
  }, [data, platformFilter, dateStart, dateEnd, search]);

  const syncWoo = async () => {
    setSyncingWoo(true);
    setError('');
    setMessage('');
    const res = await fetch('/api/hub/sync/woocommerce', { method: 'POST' });
    const d = await res.json();
    setSyncingWoo(false);
    if (!res.ok) {
      setError(d.error || 'WooCommerce sync failed');
      return;
    }
    const totals = (d.results || []).reduce(
      (acc: { inserted: number; updated: number }, r: { inserted: number; updated: number }) => ({
        inserted: acc.inserted + r.inserted,
        updated: acc.updated + r.updated,
      }),
      { inserted: 0, updated: 0 }
    );
    setMessage(`WooCommerce sync complete: ${totals.inserted} new, ${totals.updated} updated`);
    load();
  };

  const syncQb = async () => {
    setSyncingQb(true);
    setError('');
    setMessage('');
    const res = await fetch('/api/hub/sync/quickbooks', { method: 'POST' });
    const d = await res.json();
    setSyncingQb(false);
    if (!res.ok) {
      setError(d.error || 'QuickBooks sync failed');
      return;
    }
    const r = d.result;
    setMessage(`QuickBooks sync: ${r.inserted} new, ${r.updated} updated (${r.fetched} fetched)`);
    load();
  };

  const selectCls =
    'w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Centralized Order Hub 訂單中心</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            Sync orders from Nestiee, Honour, Cup Moka (WooCommerce) and QuickBooks — upsert only, never deleted
          </p>
        </div>
        <div className="page-actions flex flex-col sm:flex-row gap-2">
          <button
            onClick={syncWoo}
            disabled={syncingWoo}
            className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {syncingWoo ? 'Syncing WooCommerce…' : 'Sync WooCommerce'}
          </button>
          <a href="/api/integrations/quickbooks/connect" className="btn border border-gray-300 text-gray-700 hover:bg-gray-50 text-center">
            Connect QuickBooks
          </a>
          <button
            onClick={syncQb}
            disabled={syncingQb}
            className="btn border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            {syncingQb ? 'Syncing QB…' : 'Sync QuickBooks'}
          </button>
        </div>
      </div>

      {message && <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{message}</div>}
      {error && <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <StatCard title="Total Orders 總訂單" value={String(data?.summary.total ?? 0)} icon="📦" color="bg-gray-50 text-gray-700" />
        <StatCard title="External Sync 外部同步" value={String(data?.summary.external ?? 0)} icon="🛰️" color="bg-brand-50 text-brand-700" />
        <StatCard title="WooCommerce" value={String((data?.summary.byPlatform.nestiee || 0) + (data?.summary.byPlatform.honour || 0) + (data?.summary.byPlatform.cupmoka || 0))} icon="🛒" color="bg-pink-50 text-pink-700" />
        <StatCard title="QuickBooks" value={String(data?.summary.byPlatform.quickbooks || 0)} icon="📒" color="bg-green-50 text-green-700" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        {(data?.integrations || []).map((intg) => (
          <div key={intg.platform} className="bg-white rounded-xl border border-gray-200 p-4">
            <p className="text-sm font-medium text-gray-900">{intg.label}</p>
            <p className="text-xs text-gray-500 mt-1">
              {intg.configured ? (intg.connected ? '● Connected' : '○ Not connected') : '○ Not configured'}
            </p>
            <p className="text-xs text-gray-400 mt-1">
              Last sync: {intg.last_synced_at ? intg.last_synced_at.slice(0, 19) : 'Never'}
            </p>
          </div>
        ))}
      </div>

      <FilterBar
        dateStart={dateStart}
        dateEnd={dateEnd}
        onDateStart={setDateStart}
        onDateEnd={setDateEnd}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="System order #, customer, status…"
        onClear={() => {
          setDateStart('');
          setDateEnd('');
          setSearch('');
          setPlatformFilter('all');
        }}
      >
        <div className="flex flex-col min-w-[140px]">
          <label className="text-[11px] font-medium text-gray-500 mb-1">Platform 來源</label>
          <select value={platformFilter} onChange={(e) => setPlatformFilter(e.target.value as HubPlatform | 'all')} className={selectCls}>
            <option value="all">All</option>
            {HUB_PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {HUB_PLATFORM_LABELS[p]}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            No orders yet. Configure WooCommerce / QuickBooks credentials and run a sync.
          </div>
        ) : (
          <table className="w-full min-w-[1100px] text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-4 py-3">System Order No.</th>
                <th className="px-4 py-3">Platform</th>
                <th className="px-4 py-3">Original ID</th>
                <th className="px-4 py-3">Customer</th>
                <th className="px-4 py-3">Total</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Created</th>
                <th className="px-4 py-3">Invoice</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    <Link href={`/orders/${r.id}`} className="font-mono text-brand-600 hover:text-brand-700 font-medium">
                      {r.system_order_no || r.po_number || `#${r.id}`}
                    </Link>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${PLATFORM_COLORS[r.source_platform]}`}>
                      {HUB_PLATFORM_LABELS[r.source_platform]}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-mono text-gray-500 text-xs">{r.original_order_id || '—'}</td>
                  <td className="px-4 py-3 text-gray-800">{r.customer_name || '—'}</td>
                  <td className="px-4 py-3 font-medium">{r.total_amount != null ? formatMoney(r.total_amount) : '—'}</td>
                  <td className="px-4 py-3 text-gray-600">{r.status}</td>
                  <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{r.created_at?.slice(0, 10)}</td>
                  <td className="px-4 py-3">
                    {r.linked_invoice_id ? (
                      <Link href={`/invoices/${r.linked_invoice_id}`} className="text-brand-600 hover:text-brand-700">
                        {r.linked_invoice_number}
                      </Link>
                    ) : (
                      '—'
                    )}
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
