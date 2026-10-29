'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import FilterBar from '@/components/FilterBar';
import { useAuth } from '@/components/AuthProvider';
import type { PaymentLedgerAttachment } from '@/lib/payment-ledger';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

type Entry = {
  id: number;
  paid_date: string | null;
  amount: number | null;
  order_no: string | null;
  notes: string | null;
  link: string | null;
  attachments: PaymentLedgerAttachment[];
};

type SyncInfo = {
  configured: boolean;
  list_id: string;
  scan_page: number;
  watermark: string | null;
  last: {
    tasks_seen?: number;
    comment_fetches?: number;
    upserted?: number;
    cycle_complete?: boolean;
    errors?: string[];
    skipped?: string;
  } | null;
};

function formatAmount(amount: number | null): string {
  if (amount == null || Number.isNaN(amount)) return '—';
  return amount.toLocaleString('en-HK', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export default function PaymentLedgerPage() {
  const { isSectionReadOnly } = useAuth();
  const readOnly = isSectionReadOnly('payment_ledger');
  const [entries, setEntries] = useState<Entry[]>([]);
  const [sync, setSync] = useState<SyncInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState('');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [search, setSearch] = useState('');

  const load = () => {
    setLoading(true);
    fetch('/api/payment-ledger')
      .then(async (res) => {
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load');
        setEntries(data.entries || []);
        setSync(data.sync || null);
      })
      .catch((err: unknown) => setError(err instanceof Error ? err.message : 'Failed to load'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return entries.filter((row) => {
      const date = row.paid_date || '';
      if (dateStart && date && date < dateStart) return false;
      if (dateEnd && date && date > dateEnd) return false;
      if ((dateStart || dateEnd) && !date) return false;
      if (!q) return true;
      const attachmentText = (row.attachments || []).map((item) => `${item.name} ${item.url}`).join(' ');
      return [row.order_no, row.notes, row.link, row.amount != null ? String(row.amount) : '', attachmentText]
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [entries, dateStart, dateEnd, search]);

  const syncNow = async () => {
    setSyncing(true);
    setError('');
    try {
      const res = await fetch('/api/payment-ledger/sync', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const lastErrors = (sync?.last?.errors || []).filter((message) => message && message !== sync?.last?.skipped);

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{TITLE.paymentLedger}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            {bi(
              'Nestiee wedding-gift payments recorded from ClickUp comments and payment fields.',
              '從 ClickUp 留言與付款欄位匯入的 Nestiee 婚宴回禮入帳。',
            )}
          </p>
        </div>
        {!readOnly && (
          <div className="page-actions">
            <button
              type="button"
              onClick={syncNow}
              disabled={syncing}
              className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {syncing ? bi('Syncing…', '同步中…') : bi('Sync from ClickUp', '從 ClickUp 同步')}
            </button>
          </div>
        )}
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      {sync && !sync.configured && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {bi(
            'ClickUp API token is not set. Add it under Settings → Integrations → ClickUp, or set CLICKUP_API_TOKEN.',
            '尚未設定 ClickUp API token。請到 設定 → 整合 → ClickUp 填入，或設定 CLICKUP_API_TOKEN。',
          )}{' '}
          <Link href="/settings" className="font-medium underline">
            {bi('Open Settings', '開啟設定')}
          </Link>
          <span className="mt-1 block text-amber-800">
            {bi('List', '清單')} {sync.list_id}
            {sync.list_id === '901812202272' ? ' · Nestiee 婚宴回禮' : ''}
            {'. '}
            {bi('Override with CLICKUP_PAYMENT_LIST_ID if needed.', '如需改清單，設定 CLICKUP_PAYMENT_LIST_ID。')}
          </span>
        </div>
      )}

      {sync?.last && sync.configured && (
        <p className="mb-4 text-xs text-gray-500">
          {bi('Last sync', '上次同步')}: {sync.last.tasks_seen ?? 0} {bi('tasks', '個任務')},{' '}
          {sync.last.comment_fetches ?? 0} {bi('comment threads', '則留言')}, {sync.last.upserted ?? 0}{' '}
          {bi('rows written', '筆寫入')}
          {sync.last.cycle_complete ? ` · ${bi('full list pass complete', '已掃完整個清單')}` : ''}
          {!sync.watermark ? ` · ${bi('first pass still walking the list', '首次同步仍在逐批掃描')}` : ''}
          {sync.scan_page > 0 ? ` · ${bi('page', '頁')} ${sync.scan_page}` : ''}
        </p>
      )}

      {lastErrors.length > 0 && (
        <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {lastErrors.slice(0, 3).map((message) => (
            <p key={message}>{message}</p>
          ))}
        </div>
      )}

      <FilterBar
        dateStart={dateStart}
        dateEnd={dateEnd}
        onDateStart={setDateStart}
        onDateEnd={setDateEnd}
        search={search}
        onSearch={setSearch}
        searchPlaceholder={bi('Order no., notes, amount…', '訂單編號、事由、金額…')}
        onClear={() => {
          setDateStart('');
          setDateEnd('');
          setSearch('');
        }}
      />

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between gap-3">
          <h2 className="font-semibold text-gray-900">{bi('Payment Ledger', '入帳紀錄')}</h2>
          {!loading && entries.length > 0 && (
            <span className="text-xs text-gray-500">
              {displayed.length === entries.length
                ? bi(`${entries.length} record(s)`, `${entries.length} 筆`)
                : bi(`${displayed.length} of ${entries.length}`, `${displayed.length} / ${entries.length} 筆`)}
            </span>
          )}
        </div>
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
          </div>
        ) : entries.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {bi(
              'No payment rows yet. Sync reads Nestiee 婚宴回禮 comments and the first / second payment fields.',
              '尚未有入帳。同步會讀取 Nestiee 婚宴回禮的付款留言，以及第一次／第二次付款欄位。',
            )}
          </div>
        ) : displayed.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {bi('No rows match these filters.', '沒有符合篩選條件的入帳。')}
          </div>
        ) : (
          <table className="w-full min-w-[960px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                <th className="px-6 py-3">Paid Date</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Order No.</th>
                <th className="px-6 py-3">Notes</th>
                <th className="px-6 py-3">Link</th>
                <th className="px-6 py-3">attachment</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.map((row) => (
                <tr key={row.id} className="hover:bg-gray-50 align-top">
                  <td className="px-6 py-3 text-sm text-gray-700 whitespace-nowrap">{row.paid_date || '—'}</td>
                  <td className="px-6 py-3 text-sm text-gray-900 tabular-nums whitespace-nowrap">{formatAmount(row.amount)}</td>
                  <td className="px-6 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">{row.order_no || '—'}</td>
                  <td className="px-6 py-3 text-sm text-gray-700 max-w-xs whitespace-pre-line">{row.notes || '—'}</td>
                  <td className="px-6 py-3 text-sm">
                    {row.link ? (
                      <a href={row.link} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline">
                        {BTN.open}
                      </a>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="px-6 py-3 text-sm text-gray-700">
                    {row.attachments?.length ? (
                      <ul className="space-y-1">
                        {row.attachments.map((item) => (
                          <li key={`${item.name}-${item.url}`}>
                            {item.url ? (
                              <a href={item.url} target="_blank" rel="noreferrer" className="text-brand-700 hover:underline break-all">
                                {item.name || 'attachment'}
                              </a>
                            ) : (
                              <span>{item.name || 'attachment'}</span>
                            )}
                          </li>
                        ))}
                      </ul>
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
