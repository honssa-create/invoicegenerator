'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { PaymentMethod, ReconciliationRecord } from '@/lib/reconciliation';
import { displayInvoiceNumber } from '@/lib/record-numbering-core';
import { bi } from '@/lib/ui-labels';
import {
  depositDateKey,
  isRelatedPendingRecord,
  reconciliationRecordInZone,
  RECONCILIATION_PAGE_SIZE,
  type MatchCandidate,
  type ReconciliationSortKey,
  type ReconciliationSummary,
  type ZoneFilter,
} from '@/lib/reconciliation-page-utils';

export function useReconciliationList() {
  const [records, setRecords] = useState<ReconciliationRecord[]>([]);
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
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter | null>('high');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [sort, setSort] = useState<{ key: ReconciliationSortKey; dir: 'asc' | 'desc' }>({
    key: 'deposit_time',
    dir: 'desc',
  });
  const [page, setPage] = useState(1);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/reconciliation')
      .then((r) => r.json())
      .then((d) => {
        setRecords(d.records || []);
        setSummary(d.summary || null);
        setYedpayConfigured(Boolean(d.yedpayConfigured));
      })
      .finally(() => setLoading(false));
  }, []);

  const loadCandidates = useCallback((q?: string) => {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    fetch(`/api/reconciliation/candidates${qs}`)
      .then((r) => r.json())
      .then((d) => setCandidates(d.candidates || []))
      .catch(() => setCandidates([]));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const zoneCounts = useMemo(
    () => ({
      high: records.filter((r) => reconciliationRecordInZone(r, 'high')).length,
      medium: records.filter((r) => reconciliationRecordInZone(r, 'medium')).length,
      attention: records.filter((r) => reconciliationRecordInZone(r, 'attention')).length,
      matched: records.filter((r) => reconciliationRecordInZone(r, 'matched')).length,
    }),
    [records],
  );

  const filterRecords = useCallback(
    (
      list: ReconciliationRecord[],
      opts: {
        focusRecordId: number | null;
        matchedOrderId: number | null;
        linkOrderId: number | null;
        linkAmountHint: number | null;
        linkDateHint: string | null;
        showAllLinkRecords: boolean;
      },
    ) => {
      const q = search.trim().toLowerCase();
      return list.filter((r) => {
        if (opts.focusRecordId != null) return r.id === opts.focusRecordId;
        if (opts.matchedOrderId != null) {
          return r.order_id === opts.matchedOrderId && r.status === 'Matched';
        }
        if (opts.linkOrderId != null) {
          if (!opts.showAllLinkRecords) {
            return isRelatedPendingRecord(r, opts.linkOrderId, opts.linkAmountHint, opts.linkDateHint);
          }
          return r.status !== 'Matched';
        }
        if (zoneFilter && !reconciliationRecordInZone(r, zoneFilter)) return false;
        if (methodFilter && r.payment_method !== methodFilter) return false;
        if (dateStart && depositDateKey(r.deposit_time) < dateStart) return false;
        if (dateEnd && depositDateKey(r.deposit_time) > dateEnd) return false;
        if (!q) return true;
        const hay = [
          r.order_no,
          r.invoice_number,
          r.suggested_order_no,
          r.suggested_invoice_number,
          r.remarks,
          r.created_by,
          r.external_id,
          r.suggested_customer_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    },
    [dateEnd, dateStart, methodFilter, search, zoneFilter],
  );

  const sortRecords = useCallback(
    (list: ReconciliationRecord[]) => {
      const dir = sort.dir === 'asc' ? 1 : -1;
      return [...list].sort((a, b) => {
        const key = sort.key;
        const av = a[key];
        const bv = b[key];
        if (key === 'deposit_time' || key === 'created_at') {
          return (new Date(String(av)).getTime() - new Date(String(bv)).getTime()) * dir;
        }
        if (key === 'status') {
          return String(av).localeCompare(String(bv)) * dir;
        }
        return ((Number(av) || 0) - (Number(bv) || 0)) * dir;
      });
    },
    [sort],
  );

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
    filterRecords,
    sortRecords,
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
