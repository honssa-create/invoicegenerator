'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import {
  TRASH_ENTITY_LABELS,
  TRASH_RETENTION_DAYS,
  type TrashEntityType,
  type TrashListItem,
} from '@/lib/trash-constants';

const TYPE_OPTIONS: { value: '' | TrashEntityType; label: string }[] = [
  { value: '', label: 'All types' },
  ...Object.entries(TRASH_ENTITY_LABELS).map(([value, label]) => ({
    value: value as TrashEntityType,
    label,
  })),
];

function entityHref(type: TrashEntityType, id: number): string | null {
  switch (type) {
    case 'invoice':
      return `/invoices/${id}`;
    case 'order':
      return `/orders/${id}`;
    case 'quotation':
      return `/quotations/${id}`;
    case 'kitchen_prep':
      return `/kitchen-prep/${id}`;
    case 'expense':
      return '/expenses';
    case 'customer':
      return '/customers';
    case 'other_income':
      return '/cashflow';
    case 'inbound':
      return '/inbound';
    case 'order_file':
      return null;
    default:
      return null;
  }
}

export default function TrashPage() {
  const [records, setRecords] = useState<TrashListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'' | TrashEntityType>('');
  const [search, setSearch] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' } | null>(null);

  const load = () => {
    setLoading(true);
    fetch('/api/trash')
      .then((r) => r.json())
      .then((d) => setRecords(d.records || []))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    return records.filter((r) => {
      if (typeFilter && r.entity_type !== typeFilter) return false;
      if (!q) return true;
      const hay = [r.label, r.summary, TRASH_ENTITY_LABELS[r.entity_type]].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(q);
    });
  }, [records, typeFilter, search]);

  const restore = async (record: TrashListItem) => {
    if (!record.can_restore) return;
    if (!confirm(`Restore "${record.label}"?`)) return;
    setBusyId(record.id);
    try {
      const res = await fetch(`/api/trash/${record.id}/restore`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setToast({ msg: data.error || 'Restore failed', kind: 'error' });
        return;
      }
      setToast({ msg: `Restored ${data.entity_label}: ${record.label}`, kind: 'success' });
      load();
    } catch {
      setToast({ msg: 'Restore failed', kind: 'error' });
    } finally {
      setBusyId(null);
    }
  };

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Deleted Records 已刪除紀錄</h1>
        <p className="text-gray-500 mt-1 text-sm sm:text-base">
          Deleted items are kept for {TRASH_RETENTION_DAYS} days. Find and restore them here before they expire.
        </p>
      </div>

      {toast && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm cursor-pointer ${
            toast.kind === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
          onClick={() => setToast(null)}
        >
          {toast.msg}
        </div>
      )}

      <div className="bg-white border border-gray-200 rounded-xl p-3 mb-6 flex flex-col sm:flex-row sm:flex-wrap gap-3">
        <div className="flex flex-col min-w-0 sm:min-w-[180px]">
          <label className="text-[11px] font-medium text-gray-500 mb-1">Type</label>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as '' | TrashEntityType)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value || 'all'} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col flex-1 min-w-0">
          <label className="text-[11px] font-medium text-gray-500 mb-1">Search</label>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search label or summary…"
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none"
          />
        </div>
      </div>

      <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
          </div>
        ) : displayed.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p className="text-4xl mb-3">🗑️</p>
            <p>No deleted records in the last {TRASH_RETENTION_DAYS} days.</p>
          </div>
        ) : (
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                <th className="px-4 py-3">Type</th>
                <th className="px-4 py-3">Label</th>
                <th className="px-4 py-3">Summary</th>
                <th className="px-4 py-3">Deleted</th>
                <th className="px-4 py-3">Expires in</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {displayed.map((r) => {
                const href = entityHref(r.entity_type, r.entity_id);
                return (
                  <tr key={r.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-600">{TRASH_ENTITY_LABELS[r.entity_type]}</td>
                    <td className="px-4 py-3 font-medium text-gray-900">{r.label}</td>
                    <td className="px-4 py-3 text-gray-500">{r.summary || '—'}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{r.deleted_at?.slice(0, 16)}</td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      {r.can_restore ? (
                        <span className="text-amber-700 font-medium">{r.days_remaining} day{r.days_remaining === 1 ? '' : 's'}</span>
                      ) : (
                        <span className="text-red-600">Expired</span>
                      )}
                    </td>
                    <td className="px-4 py-3 space-x-2 whitespace-nowrap">
                      {r.can_restore && (
                        <button
                          onClick={() => restore(r)}
                          disabled={busyId === r.id}
                          className="text-brand-600 hover:text-brand-700 font-medium disabled:opacity-50"
                        >
                          {busyId === r.id ? 'Restoring…' : '↩ Restore'}
                        </button>
                      )}
                      {href && r.can_restore && (
                        <Link href={href} className="text-gray-500 hover:text-gray-700">
                          Open
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </AppLayout>
  );
}
