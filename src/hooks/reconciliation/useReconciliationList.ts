'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PaymentMethod, ReconciliationRecord } from '@/lib/reconciliation';
import { displayInvoiceNumber } from '@/lib/record-numbering-core';
import { readListUi, writeListUi } from '@/lib/list-ui-storage';
import { bi } from '@/lib/ui-labels';
import {
  RECONCILIATION_PAGE_SIZE,
  type MatchCandidate,
  type ReconciliationSortKey,
  type ReconciliationSummary,
  type ZoneFilter,
} from '@/lib/reconciliation-page-utils';

const RECONCILIATION_LIST_UI_KEY = 'reconciliation-list-ui';
const ZONE_FILTERS: ZoneFilter[] = ['high', 'medium', 'attention', 'matched'];
const SORT_KEYS: ReconciliationSortKey[] = [
  'deposit_time',
  'gross_amount',
  'transaction_fee',
  'net_amount',
  'status',
  'created_at',
  'created_by',
];

export type ReconciliationListScope = {
  focusRecordId: number | null;
  matchedOrderId: number | null;
  linkOrderId: number | null;
  linkAmount: number | null;
  linkDate: string | null;
  linkAll: boolean;
};

const EMPTY_SCOPE: ReconciliationListScope = {
  focusRecordId: null,
  matchedOrderId: null,
  linkOrderId: null,
  linkAmount: null,
  linkDate: null,
  linkAll: false,
};

type ReconciliationListUiState = {
  zoneFilter: ZoneFilter | null;
  dateStart: string;
  dateEnd: string;
  search: string;
  methodFilter: string;
  sort: { key: ReconciliationSortKey; dir: 'asc' | 'desc' };
  page: number;
};

export function useReconciliationList() {
  const savedUi = useMemo(() => readListUi<ReconciliationListUiState>(RECONCILIATION_LIST_UI_KEY), []);
  const [records, setRecords] = useState<ReconciliationRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [linkRelatedTotal, setLinkRelatedTotal] = useState(0);
  const [summary, setSummary] = useState<ReconciliationSummary | null>(null);
  const [candidates, setCandidates] = useState<MatchCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [yedpayConfigured, setYedpayConfigured] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadMethod, setUploadMethod] = useState<PaymentMethod>('FPS');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<number | null>(null);
  const [batchApproving, setBatchApproving] = useState(false);
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter | null>(() => {
    const saved = savedUi?.zoneFilter;
    if (saved === null) return null;
    if (saved && ZONE_FILTERS.includes(saved)) return saved;
    return 'high';
  });
  const [dateStart, setDateStart] = useState(savedUi?.dateStart ?? '');
  const [dateEnd, setDateEnd] = useState(savedUi?.dateEnd ?? '');
  const [search, setSearch] = useState(savedUi?.search ?? '');
  const [methodFilter, setMethodFilter] = useState(savedUi?.methodFilter ?? '');
  const [sort, setSort] = useState<{ key: ReconciliationSortKey; dir: 'asc' | 'desc' }>(() => {
    const key = savedUi?.sort?.key;
    const dir = savedUi?.sort?.dir;
    if (key && SORT_KEYS.includes(key) && (dir === 'asc' || dir === 'desc')) {
      return { key, dir };
    }
    return { key: 'deposit_time', dir: 'desc' };
  });
  const [page, setPage] = useState(() => {
    const n = Number(savedUi?.page);
    return Number.isFinite(n) && n >= 1 ? Math.floor(n) : 1;
  });
  const [debouncedSearch, setDebouncedSearch] = useState(savedUi?.search ?? '');
  const [scope, setScopeState] = useState<ReconciliationListScope>(EMPTY_SCOPE);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);

  const setScope = useCallback((next: ReconciliationListScope) => {
    setScopeState((prev) => {
      if (
        prev.focusRecordId === next.focusRecordId &&
        prev.matchedOrderId === next.matchedOrderId &&
        prev.linkOrderId === next.linkOrderId &&
        prev.linkAmount === next.linkAmount &&
        prev.linkDate === next.linkDate &&
        prev.linkAll === next.linkAll
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams();
    params.set('limit', String(RECONCILIATION_PAGE_SIZE));
    params.set('offset', String((page - 1) * RECONCILIATION_PAGE_SIZE));
    params.set('sort', sort.key);
    params.set('dir', sort.dir);
    if (scope.focusRecordId) {
      params.set('id', String(scope.focusRecordId));
    } else if (scope.matchedOrderId) {
      params.set('matchedOrderId', String(scope.matchedOrderId));
    } else if (scope.linkOrderId) {
      params.set('linkOrderId', String(scope.linkOrderId));
      if (scope.linkAmount != null) params.set('linkAmount', String(scope.linkAmount));
      if (scope.linkDate) params.set('linkDate', scope.linkDate);
      if (scope.linkAll) params.set('linkAll', '1');
    } else {
      if (zoneFilter) params.set('zone', zoneFilter);
      if (methodFilter) params.set('method', methodFilter);
      if (dateStart) params.set('dateStart', dateStart);
      if (dateEnd) params.set('dateEnd', dateEnd);
      if (debouncedSearch) params.set('q', debouncedSearch);
    }
    fetch(`/api/reconciliation?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => {
        if (cancelled) return;
        setRecords(d.records || []);
        setTotal(Number(d.total) || 0);
        setLinkRelatedTotal(Number(d.linkRelatedTotal) || 0);
        setSummary(d.summary || null);
        setYedpayConfigured(Boolean(d.yedpayConfigured));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    page,
    sort,
    scope,
    zoneFilter,
    methodFilter,
    dateStart,
    dateEnd,
    debouncedSearch,
  ]);

  const loadCandidates = useCallback((q?: string) => {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    fetch(`/api/reconciliation/candidates${qs}`)
      .then((r) => r.json())
      .then((d) => setCandidates(d.candidates || []))
      .catch(() => setCandidates([]));
  }, []);

  useEffect(() => {
    const cancel = load();
    return cancel;
  }, [load]);

  useEffect(() => {
    writeListUi(RECONCILIATION_LIST_UI_KEY, {
      zoneFilter,
      dateStart,
      dateEnd,
      search,
      methodFilter,
      sort,
      page,
    });
  }, [zoneFilter, dateStart, dateEnd, search, methodFilter, sort, page]);

  const zoneCounts = {
    high: summary?.pendingHigh ?? 0,
    medium: summary?.pendingMedium ?? 0,
    attention: (summary?.unmatched ?? 0) + (summary?.discrepancy ?? 0),
    matched: summary?.matched ?? 0,
  };

  const clearFilters = () => {
    setDateStart('');
    setDateEnd('');
    setSearch('');
    setMethodFilter('');
    setZoneFilter(null);
  };

  const toggleZone = (z: ZoneFilter) => {
    setZoneFilter((prev) => (prev === z ? null : z));
  };

  const toggleSort = (key: ReconciliationSortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' },
    );
  };

  const exportExcel = () => {
    const params = new URLSearchParams();
    if (zoneFilter) params.set('zone', zoneFilter);
    if (methodFilter) params.set('method', methodFilter);
    if (dateStart) params.set('dateStart', dateStart);
    if (dateEnd) params.set('dateEnd', dateEnd);
    if (search.trim()) params.set('q', search.trim());
    const qs = params.toString();
    window.location.href = `/api/reconciliation/export${qs ? `?${qs}` : ''}`;
  };

  const syncYedpay = async () => {
    setSyncing(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/reconciliation/sync-yedpay', { method: 'POST' });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error || 'Sync failed');
        return;
      }
      setMessage(
        `Yedpay sync: fetched ${d.fetched}, imported ${d.imported}, suggested ${d.suggested}, skipped ${d.skipped}`,
      );
      load();
    } catch {
      setError(bi('Sync failed — check network and try again', '同步失敗 — 請檢查網絡後重試'));
    } finally {
      setSyncing(false);
    }
  };

  const uploadStatement = async (file: File) => {
    setUploading(true);
    setError('');
    setMessage('');
    const fd = new FormData();
    fd.append('file', file);
    fd.append('payment_method', uploadMethod);
    const res = await fetch('/api/reconciliation/upload', { method: 'POST', body: fd });
    const d = await res.json();
    setUploading(false);
    if (!res.ok) {
      setError(d.error || 'Upload failed');
      return;
    }
    setMessage(
      `Bank statement (${uploadMethod}): imported ${d.imported}, suggested ${d.suggested}, skipped ${d.skipped}${
        d.errors?.length ? `, ${d.errors.length} row warnings` : ''
      }`,
    );
    load();
  };

  const approveOne = async (id: number, invoiceId?: number) => {
    setBusyId(id);
    setError('');
    const res = await fetch(`/api/reconciliation/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invoiceId ? { invoice_id: invoiceId } : {}),
    });
    const d = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(d.error || 'Approve failed');
      return false;
    }
    return true;
  };

  const rejectOne = async (id: number) => {
    setBusyId(id);
    setError('');
    const res = await fetch(`/api/reconciliation/${id}/reject`, { method: 'POST' });
    const d = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(d.error || 'Reject failed');
      return;
    }
    setMessage(`Record #${id} rejected — back to Unmatched`);
    load();
  };

  const linkToOrder = async (id: number, linkOrderId: number, linkPaymentSlot: number) => {
    setBusyId(id);
    setError('');
    const res = await fetch(`/api/reconciliation/${id}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: linkOrderId, payment_slot: linkPaymentSlot }),
    });
    const d = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(d.error || 'Link failed');
      return false;
    }
    setMessage(`Linked #${id} to order — payment verified`);
    load();
    return true;
  };

  const unlinkOne = async (id: number) => {
    setBusyId(id);
    setError('');
    const res = await fetch(`/api/reconciliation/${id}/unlink`, { method: 'POST' });
    const d = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(d.error || 'Unlink failed');
      return false;
    }
    setMessage(`Record #${id} unlinked`);
    load();
    return true;
  };

  const approveAllHigh = async () => {
    setBatchApproving(true);
    setError('');
    setMessage('');
    const res = await fetch('/api/reconciliation/approve-batch', { method: 'POST' });
    const d = await res.json();
    setBatchApproving(false);
    if (!res.ok) {
      setError(d.error || 'Batch approve failed');
      return;
    }
    setMessage(`Approved ${d.approved} high-confidence record(s)`);
    load();
  };

  const submitManualLink = async (linkRecordId: number, selectedInvoiceId: string) => {
    setBusyId(linkRecordId);
    setError('');
    const res = await fetch(`/api/reconciliation/${linkRecordId}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: Number(selectedInvoiceId) }),
    });
    const d = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(d.error || 'Manual link failed');
      return false;
    }
    setMessage(
      `Record #${linkRecordId} linked & approved → ${displayInvoiceNumber(d.record?.invoice_number) || 'invoice'}`,
    );
    load();
    return true;
  };

  return {
    records,
    total,
    linkRelatedTotal,
    summary,
    candidates,
    loading,
    yedpayConfigured,
    syncing,
    uploading,
    uploadMethod,
    setUploadMethod,
    message,
    setMessage,
    error,
    setError,
    busyId,
    batchApproving,
    zoneFilter,
    setZoneFilter,
    dateStart,
    setDateStart,
    dateEnd,
    setDateEnd,
    search,
    setSearch,
    methodFilter,
    setMethodFilter,
    sort,
    page,
    setPage,
    zoneCounts,
    load,
    loadCandidates,
    setScope,
    clearFilters,
    toggleZone,
    toggleSort,
    exportExcel,
    syncYedpay,
    uploadStatement,
    approveOne,
    rejectOne,
    linkToOrder,
    unlinkOne,
    approveAllHigh,
    submitManualLink,
    pageSize: RECONCILIATION_PAGE_SIZE,
  };
}
