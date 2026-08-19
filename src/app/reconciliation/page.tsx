'use client';

import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AccountingTable from '@/components/AccountingTable';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/components/AuthProvider';
import FilterBar from '@/components/FilterBar';
import { formatMoney } from '@/lib/cashflow';
import { compressImage } from '@/lib/imageCompression';
import { reconciliationReceiptUrl } from '@/lib/image-url';
import {
  AMOUNT_TOLERANCE,
  amountsClose,
  isWithinHours,
  MEDIUM_MATCH_WINDOW_HOURS,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  RECON_STATUS_COLORS,
  type PaymentMethod,
  type ReconciliationRecord,
} from '@/lib/reconciliation';
import { BTN } from '@/lib/ui-labels';

interface MatchCandidate {
  order_id: number;
  order_no: string;
  invoice_id: number | null;
  invoice_number: string | null;
  invoice_total: number | null;
  invoice_status: string | null;
  customer_name: string | null;
  phone: string | null;
}

interface Summary {
  total: number;
  matched: number;
  unmatched: number;
  discrepancy: number;
  pendingApproval: number;
  pendingHigh: number;
  pendingMedium: number;
  grossTotal: number;
  netTotal: number;
  feeTotal: number;
}

type ZoneFilter = 'high' | 'medium' | 'attention' | 'matched';
type SortKey = 'deposit_time' | 'gross_amount' | 'status' | 'created_at' | 'created_by';
type ReconciliationView = 'reconciliation' | 'accounting';

const PAGE_SIZE = 50;

const EMPTY_MANUAL = {
  amount: '',
  payment_method: 'FPS' as PaymentMethod,
  invoice_no: '',
  order_no: '',
  remarks: '',
};

const ZONE_META: Record<
  ZoneFilter,
  { title: string; icon: string; color: string; ring: string }
> = {
  high: {
    title: 'Pending High 高信心',
    icon: '🎯',
    color: 'bg-blue-50 text-blue-700',
    ring: 'ring-blue-500',
  },
  medium: {
    title: 'Pending Medium 中信心',
    icon: '🔍',
    color: 'bg-indigo-50 text-indigo-700',
    ring: 'ring-indigo-500',
  },
  attention: {
    title: 'Needs Attention 待處理',
    icon: '⚠️',
    color: 'bg-amber-50 text-amber-700',
    ring: 'ring-amber-500',
  },
  matched: {
    title: 'Matched 已對帳',
    icon: '✅',
    color: 'bg-green-50 text-green-700',
    ring: 'ring-green-500',
  },
};

function depositDateKey(v: string): string {
  return v.replace('T', ' ').slice(0, 10);
}

function parseAmountHint(raw: string | null): number | null {
  if (!raw) return null;
  const n = Number(String(raw).replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

function parseDepositDate(v: string): Date | null {
  const s = v.replace('T', ' ').trim();
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2})(?::(\d{2}))?)?/.exec(s);
  if (!m) return null;
  const [, y, mo, d, h = '12', mi = '0', se = '0'] = m;
  const dt = new Date(+y, +mo - 1, +d, +h, +mi, +se);
  return isNaN(dt.getTime()) ? null : dt;
}

function isRelatedPending(
  r: ReconciliationRecord,
  linkOrderId: number,
  amountHint: number | null,
  dateHint: string | null
): boolean {
  if (r.status === 'Matched') return false;
  if (r.suggested_order_id === linkOrderId) return true;
  if (r.candidates?.some((c) => c.order_id === linkOrderId)) return true;
  if (amountHint != null && amountsClose(r.gross_amount, amountHint, AMOUNT_TOLERANCE)) {
    if (!dateHint) return true;
    const deposit = parseDepositDate(r.deposit_time);
    const anchor = parseDepositDate(dateHint);
    if (deposit && anchor && isWithinHours(deposit, anchor, MEDIUM_MATCH_WINDOW_HOURS)) return true;
  }
  return false;
}

function inZone(r: ReconciliationRecord, zone: ZoneFilter): boolean {
  if (zone === 'high') return r.status === 'Pending Approval' && r.confidence === 'high';
  if (zone === 'medium') return r.status === 'Pending Approval' && r.confidence === 'medium';
  if (zone === 'attention') return r.status === 'Unmatched' || r.status === 'Discrepancy';
  return r.status === 'Matched';
}

function ReconciliationContent() {
  const { user, canAccess } = useAuth();
  const [view, setView] = useState<ReconciliationView>('reconciliation');
  const [linkOrderId, setLinkOrderId] = useState<number | null>(null);
  const [linkAmountHint, setLinkAmountHint] = useState<number | null>(null);
  const [linkDateHint, setLinkDateHint] = useState<string | null>(null);
  const [linkOrderRef, setLinkOrderRef] = useState<string | null>(null);
  const [showAllLinkRecords, setShowAllLinkRecords] = useState(false);
  const [focusRecordId, setFocusRecordId] = useState<number | null>(null);
  const [matchedOrderId, setMatchedOrderId] = useState<number | null>(null);
  const [records, setRecords] = useState<ReconciliationRecord[]>([]);
  const [summary, setSummary] = useState<Summary | null>(null);
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
  const [linkRecordId, setLinkRecordId] = useState<number | null>(null);
  const [selectedInvoiceId, setSelectedInvoiceId] = useState('');
  const [candidateSearch, setCandidateSearch] = useState('');
  const [linking, setLinking] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualForm, setManualForm] = useState(EMPTY_MANUAL);
  const [manualReceiptPath, setManualReceiptPath] = useState('');
  const [manualPreview, setManualPreview] = useState<string | null>(null);
  const [manualUploadMsg, setManualUploadMsg] = useState('');
  const [manualSaving, setManualSaving] = useState(false);
  const [manualError, setManualError] = useState('');
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [zoneFilter, setZoneFilter] = useState<ZoneFilter | null>('high');
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [sort, setSort] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'deposit_time',
    dir: 'desc',
  });
  const [page, setPage] = useState(1);
  const fileRef = useRef<HTMLInputElement>(null);
  const receiptRef = useRef<HTMLInputElement>(null);
  const canViewAccounting = canAccess('accounting');
  const focusMode = linkOrderId != null || focusRecordId != null || matchedOrderId != null;
  const searchParams = useSearchParams();
  const viewParam = searchParams.get('view');
  const linkOrderIdParam = searchParams.get('linkOrderId');
  const recordIdParam = searchParams.get('recordId');
  const matchedOrderIdParam = searchParams.get('matchedOrderId');

  useEffect(() => {
    if (!user) return;

    if (canViewAccounting && viewParam === 'accounting') {
      setView('accounting');
      setLinkOrderId(null);
      setFocusRecordId(null);
      setMatchedOrderId(null);
      return;
    }

    const linkId = Number(linkOrderIdParam);
    const recordId = Number(recordIdParam);
    const matchedId = Number(matchedOrderIdParam);

    setView('reconciliation');
    if (Number.isFinite(linkId) && linkId > 0) {
      setLinkOrderId(linkId);
      setLinkAmountHint(parseAmountHint(searchParams.get('amount')));
      setLinkDateHint(searchParams.get('date') || null);
      setLinkOrderRef(searchParams.get('orderRef') || null);
      setShowAllLinkRecords(false);
      setFocusRecordId(null);
      setMatchedOrderId(null);
      setZoneFilter(null);
    } else if (Number.isFinite(recordId) && recordId > 0) {
      setFocusRecordId(recordId);
      setLinkOrderId(null);
      setMatchedOrderId(null);
      setZoneFilter(null);
    } else if (Number.isFinite(matchedId) && matchedId > 0) {
      setMatchedOrderId(matchedId);
      setLinkOrderId(null);
      setFocusRecordId(null);
      setZoneFilter(null);
    } else {
      setLinkOrderId(null);
      setFocusRecordId(null);
      setMatchedOrderId(null);
    }
  }, [
    user,
    canViewAccounting,
    viewParam,
    linkOrderIdParam,
    recordIdParam,
    matchedOrderIdParam,
    searchParams,
  ]);

  const changeView = (nextView: ReconciliationView) => {
    setView(nextView);
    setLinkOrderId(null);
    setFocusRecordId(null);
    setMatchedOrderId(null);
    const url = new URL(window.location.href);
    url.search = '';
    if (nextView === 'accounting') url.searchParams.set('view', 'accounting');
    window.history.replaceState(null, '', `${url.pathname}${url.search}`);
  };

  const clearFocusMode = () => {
    setLinkOrderId(null);
    setFocusRecordId(null);
    setMatchedOrderId(null);
    setLinkAmountHint(null);
    setLinkDateHint(null);
    setLinkOrderRef(null);
    setShowAllLinkRecords(false);
    setZoneFilter('high');
    window.history.replaceState(null, '', '/reconciliation');
  };

  const returnToAccounting = () => {
    setLinkOrderId(null);
    setFocusRecordId(null);
    setMatchedOrderId(null);
    setShowAllLinkRecords(false);
    setView('accounting');
    window.history.replaceState(null, '', '/reconciliation?view=accounting');
  };

  const load = () => {
    setLoading(true);
    fetch('/api/reconciliation')
      .then((r) => r.json())
      .then((d) => {
        setRecords(d.records || []);
        setSummary(d.summary || null);
        setYedpayConfigured(Boolean(d.yedpayConfigured));
      })
      .finally(() => setLoading(false));
  };

  const loadCandidates = (q?: string) => {
    const qs = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : '';
    fetch(`/api/reconciliation/candidates${qs}`)
      .then((r) => r.json())
      .then((d) => setCandidates(d.candidates || []))
      .catch(() => setCandidates([]));
  };

  useEffect(() => {
    load();
  }, []);

  const zoneCounts = useMemo(
    () => ({
      high: records.filter((r) => inZone(r, 'high')).length,
      medium: records.filter((r) => inZone(r, 'medium')).length,
      attention: records.filter((r) => inZone(r, 'attention')).length,
      matched: records.filter((r) => inZone(r, 'matched')).length,
    }),
    [records]
  );

  const highCount = zoneCounts.high;

  const relatedPending = useMemo(() => {
    if (linkOrderId == null) return [];
    return records.filter((r) => isRelatedPending(r, linkOrderId, linkAmountHint, linkDateHint));
  }, [records, linkOrderId, linkAmountHint, linkDateHint]);

  const linkShowingAllUnverified =
    linkOrderId != null && (relatedPending.length === 0 || showAllLinkRecords);

  const displayed = useMemo(() => {
    const q = search.trim().toLowerCase();
    let list = records.filter((r) => {
      if (focusRecordId != null) return r.id === focusRecordId;
      if (matchedOrderId != null) return r.status === 'Matched' && r.order_id === matchedOrderId;
      if (linkOrderId != null) {
        if (relatedPending.length > 0 && !showAllLinkRecords) {
          return isRelatedPending(r, linkOrderId, linkAmountHint, linkDateHint);
        }
        return r.status !== 'Matched';
      }
      if (zoneFilter && !inZone(r, zoneFilter)) return false;
      if (methodFilter && r.payment_method !== methodFilter) return false;
      const d = depositDateKey(r.deposit_time);
      if (dateStart && d < dateStart) return false;
      if (dateEnd && d > dateEnd) return false;
      if (q) {
        const hay = [
          r.order_no,
          r.invoice_number,
          r.suggested_order_no,
          r.suggested_invoice_number,
          r.suggested_customer_name,
          r.remarks,
          r.created_by,
          r.approved_by,
          r.payment_method,
          r.status,
          String(r.gross_amount),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const dir = sort.dir === 'asc' ? 1 : -1;
    list = [...list].sort((a, b) => {
      const av = a[sort.key];
      const bv = b[sort.key];
      if (sort.key === 'gross_amount') {
        return ((a.gross_amount || 0) - (b.gross_amount || 0)) * dir;
      }
      const as = String(av ?? '');
      const bs = String(bv ?? '');
      return as.localeCompare(bs, undefined, { numeric: true }) * dir;
    });
    return list;
  }, [
    records,
    zoneFilter,
    methodFilter,
    dateStart,
    dateEnd,
    search,
    sort,
    linkOrderId,
    linkAmountHint,
    linkDateHint,
    relatedPending,
    showAllLinkRecords,
    focusRecordId,
    matchedOrderId,
  ]);

  const totalPages = Math.max(1, Math.ceil(displayed.length / PAGE_SIZE));
  const pageStart = displayed.length ? (page - 1) * PAGE_SIZE : 0;
  const pageEnd = Math.min(page * PAGE_SIZE, displayed.length);
  const pageRows = displayed.slice(pageStart, pageEnd);

  useEffect(() => {
    setPage(1);
  }, [zoneFilter, methodFilter, dateStart, dateEnd, search, sort, linkOrderId, focusRecordId, matchedOrderId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

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

  const toggleSort = (key: SortKey) => {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'desc' }
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
    const res = await fetch('/api/reconciliation/sync-yedpay', { method: 'POST' });
    const d = await res.json();
    setSyncing(false);
    if (!res.ok) {
      setError(d.error || 'Sync failed');
      return;
    }
    setMessage(
      `Yedpay sync: fetched ${d.fetched}, imported ${d.imported}, suggested ${d.suggested}, skipped ${d.skipped}`
    );
    load();
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
      }`
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

  const linkToOrder = async (id: number) => {
    if (!linkOrderId) return;
    setBusyId(id);
    setError('');
    const res = await fetch(`/api/reconciliation/${id}/link`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ order_id: linkOrderId }),
    });
    const d = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(d.error || 'Link failed');
      return;
    }
    setMessage(`Linked #${id} to order — payment verified`);
    returnToAccounting();
  };

  const unlinkOne = async (id: number) => {
    setBusyId(id);
    setError('');
    const res = await fetch(`/api/reconciliation/${id}/unlink`, { method: 'POST' });
    const d = await res.json();
    setBusyId(null);
    if (!res.ok) {
      setError(d.error || 'Unlink failed');
      return;
    }
    setMessage(`Record #${id} unlinked`);
    if (focusRecordId === id || matchedOrderId != null) {
      clearFocusMode();
    }
    load();
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

  const openLink = (id: number) => {
    setLinkRecordId(id);
    setSelectedInvoiceId('');
    setCandidateSearch('');
    loadCandidates();
  };

  const submitManualLink = async () => {
    if (!linkRecordId || !selectedInvoiceId) return;
    setLinking(true);
    setError('');
    const res = await fetch(`/api/reconciliation/${linkRecordId}/match`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invoice_id: Number(selectedInvoiceId) }),
    });
    const d = await res.json();
    setLinking(false);
    if (!res.ok) {
      setError(d.error || 'Manual link failed');
      return;
    }
    setLinkRecordId(null);
    setSelectedInvoiceId('');
    setMessage(`Record #${linkRecordId} linked & approved → ${d.record?.invoice_number || 'invoice'}`);
    load();
  };

  const openManualForm = () => {
    setManualForm(EMPTY_MANUAL);
    setManualReceiptPath('');
    setManualPreview(null);
    setManualUploadMsg('');
    setManualError('');
    setShowManual(true);
  };

  const handleManualReceipt = async (file: File) => {
    setManualUploadMsg('Compressing…');
    let out = file;
    try {
      const c = await compressImage(file, {
        maxDim: 1600,
        targetBytes: 300 * 1024,
        mimeType: 'image/jpeg',
        quality: 0.65,
      });
      out = c.file;
      setManualUploadMsg(`Compressed → ${Math.round(out.size / 1024)}KB`);
    } catch {
      /* keep original */
    }
    setManualPreview(URL.createObjectURL(out));
    const fd = new FormData();
    fd.append('file', out);
    const res = await fetch('/api/reconciliation/upload-receipt', { method: 'POST', body: fd });
    const d = await res.json();
    if (res.ok) {
      setManualReceiptPath(d.path);
      setManualUploadMsg(`Uploaded · ${Math.round(out.size / 1024)}KB`);
    } else {
      setManualUploadMsg(d.error || 'Upload failed');
    }
  };

  const saveManualPayment = async () => {
    setManualError('');
    const amount = Number(manualForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setManualError('請輸入有效銀碼');
      return;
    }
    setManualSaving(true);
    const res = await fetch('/api/reconciliation/manual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        amount,
        payment_method: manualForm.payment_method,
        invoice_no: manualForm.invoice_no.trim() || undefined,
        order_no: manualForm.order_no.trim() || undefined,
        remarks: manualForm.remarks.trim() || undefined,
        receipt_path: manualReceiptPath || undefined,
      }),
    });
    const d = await res.json();
    setManualSaving(false);
    if (!res.ok) {
      setManualError(d.error || 'Failed to save');
      return;
    }
    setShowManual(false);
    setMessage(
      `Manual payment #${d.record?.id} saved` +
        (d.record?.status === 'Pending Approval' ? ' — pending approval' : '') +
        (d.record?.status === 'Discrepancy' ? ' — amount discrepancy' : '')
    );
    load();
  };

  const filteredCandidates = useMemo(() => {
    const q = candidateSearch.trim().toLowerCase();
    if (!q) return candidates;
    return candidates.filter((c) =>
      [c.order_no, c.invoice_number, c.customer_name, c.phone]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q)
    );
  }, [candidates, candidateSearch]);

  const selectCls =
    'w-full px-3 py-2.5 sm:py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

  const fmtDt = (v: string | null | undefined) => {
    if (!v) return '—';
    return v.replace('T', ' ').slice(0, 16);
  };

  const invoiceCell = (r: ReconciliationRecord) => {
    const matched = r.status === 'Matched';
    const id = matched ? r.invoice_id : r.suggested_invoice_id;
    const no = matched ? r.invoice_number : r.suggested_invoice_number;
    if (id && no) {
      return (
        <Link href={`/invoices/${id}`} className="font-mono text-brand-600 hover:text-brand-700">
          {no}
        </Link>
      );
    }
    return <span className="text-gray-400">—</span>;
  };

  const orderCell = (r: ReconciliationRecord) => {
    const matched = r.status === 'Matched';
    const id = matched ? r.order_id : r.suggested_order_id;
    const no = matched
      ? r.order_no || (id ? `#${id}` : null)
      : r.suggested_order_no || r.order_no || (id ? `#${id}` : null);
    if (id && no) {
      return (
        <Link href={`/orders/${id}`} className="font-mono text-brand-600 hover:text-brand-700">
          {no}
        </Link>
      );
    }
    if (no) return <span className="font-mono text-gray-700">{no}</span>;
    return <span className="text-gray-400">—</span>;
  };

  const amountCell = (r: ReconciliationRecord) => {
    const receiptUrl = reconciliationReceiptUrl(r.id, r.receipt_path);
    return (
      <div className="flex gap-2 items-center">
        {receiptUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={receiptUrl}
            alt="receipt"
            onClick={() => setLightbox(receiptUrl)}
            className="h-9 w-9 object-cover rounded border border-gray-200 cursor-zoom-in hover:ring-2 hover:ring-brand-400 shrink-0"
          />
        ) : null}
        <div>
          <div className="font-medium text-gray-900">{formatMoney(r.gross_amount)}</div>
          <div className="text-[11px] text-gray-400">{PAYMENT_METHOD_LABELS[r.payment_method]}</div>
        </div>
      </div>
    );
  };

  const statusCell = (r: ReconciliationRecord) => (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${RECON_STATUS_COLORS[r.status]}`}>
      {r.status}
    </span>
  );

  const colHeaders = () => {
    const matchedOnly = zoneFilter === 'matched';
    const inv = matchedOnly ? '對應 Invoice' : zoneFilter ? '建議 Invoice' : 'Invoice';
    const ord = matchedOnly ? '對應 Order' : zoneFilter ? '建議 Order' : 'Order';
    const sortBtn = (key: SortKey, label: string) => (
      <th className="px-4 py-2 whitespace-nowrap">
        <button
          type="button"
          onClick={() => toggleSort(key)}
          className="inline-flex items-center gap-1 hover:text-gray-800"
        >
          {label}
          {sort.key === key ? (sort.dir === 'asc' ? ' ↑' : ' ↓') : ''}
        </button>
      </th>
    );
    return (
      <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-100">
        {sortBtn('deposit_time', '入帳日期')}
        {sortBtn('gross_amount', '銀碼')}
        <th className="px-4 py-2 whitespace-nowrap">{inv}</th>
        <th className="px-4 py-2 whitespace-nowrap">{ord}</th>
        {sortBtn('status', 'Status')}
        {sortBtn('created_at', '建立日期')}
        {sortBtn('created_by', '上傳人')}
        <th className="px-4 py-2 whitespace-nowrap">Actions</th>
      </tr>
    );
  };

  const actionsFor = (r: ReconciliationRecord) => {
    if (r.status === 'Matched') {
      return (
        <div className="flex flex-wrap items-center gap-1.5">
          {r.approved_by ? <span className="text-xs text-gray-400">by {r.approved_by}</span> : null}
          <button
            type="button"
            disabled={busyId === r.id}
            onClick={() => unlinkOne(r.id)}
            className="text-xs px-2.5 py-1 rounded-full bg-red-50 text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {busyId === r.id ? '…' : BTN.unlink}
          </button>
        </div>
      );
    }

    if (linkOrderId != null) {
      return (
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={busyId === r.id}
            onClick={() => linkToOrder(r.id)}
            className="text-xs px-2.5 py-1 rounded-full bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
          >
            {busyId === r.id ? '…' : BTN.linkToOrder}
          </button>
          <button
            type="button"
            onClick={() => openLink(r.id)}
            className="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 hover:bg-brand-100"
          >
            Manual Link
          </button>
        </div>
      );
    }

    return (
      <div className="flex flex-wrap gap-1.5">
        {(r.status === 'Pending Approval' || (r.status === 'Discrepancy' && r.suggested_invoice_id)) && (
          <button
            disabled={busyId === r.id}
            onClick={async () => {
              if (await approveOne(r.id)) {
                setMessage(`Approved #${r.id}`);
                load();
              }
            }}
            className="text-xs px-2.5 py-1 rounded-full bg-green-100 text-green-800 hover:bg-green-200 disabled:opacity-50"
          >
            {busyId === r.id ? '…' : 'Approve'}
          </button>
        )}
        {r.status === 'Pending Approval' && r.confidence === 'medium' && (
          <button
            disabled={busyId === r.id}
            onClick={() => rejectOne(r.id)}
            className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            Reject
          </button>
        )}
        {(r.status === 'Unmatched' || r.status === 'Discrepancy' || r.status === 'Pending Approval') && (
          <button
            onClick={() => openLink(r.id)}
            className="text-xs px-2.5 py-1 rounded-full bg-brand-50 text-brand-700 hover:bg-brand-100"
          >
            {r.status === 'Pending Approval' ? 'Relink' : 'Manual Link'}
          </button>
        )}
        {r.status === 'Discrepancy' && (
          <button
            disabled={busyId === r.id}
            onClick={() => rejectOne(r.id)}
            className="text-xs px-2.5 py-1 rounded-full bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
          >
            Clear
          </button>
        )}
      </div>
    );
  };

  const recordRow = (r: ReconciliationRecord) => (
    <tr key={r.id} className="hover:bg-gray-50">
      <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{fmtDt(r.deposit_time)}</td>
      <td className="px-4 py-3">{amountCell(r)}</td>
      <td className="px-4 py-3">{invoiceCell(r)}</td>
      <td className="px-4 py-3">
        {orderCell(r)}
        {r.status !== 'Matched' && r.suggested_customer_name ? (
          <div className="text-xs text-gray-500">{r.suggested_customer_name}</div>
        ) : null}
      </td>
      <td className="px-4 py-3">{statusCell(r)}</td>
      <td className="px-4 py-3 text-gray-600 whitespace-nowrap">{fmtDt(r.created_at)}</td>
      <td className="px-4 py-3 text-gray-600">{r.created_by || '—'}</td>
      <td className="px-4 py-3">{actionsFor(r)}</td>
    </tr>
  );

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Accounting & Reconciliation 會計及對帳</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            {view === 'reconciliation'
              ? 'Suggest matches from Yedpay / bank statements — approve before marking invoices paid'
              : 'Review every order payment and confirm each entry against your bank statement'}
          </p>
        </div>
        {view === 'reconciliation' && !focusMode && (
          <div className="page-actions flex flex-col sm:flex-row gap-2">
          <button
            onClick={exportExcel}
            className="btn border border-gray-300 text-gray-700 hover:bg-gray-50 whitespace-nowrap"
          >
            ⬇ {BTN.exportExcel}
          </button>
          <button
            onClick={openManualForm}
            className="btn bg-brand-600 text-white hover:bg-brand-700 whitespace-nowrap"
          >
            手動入帳 Manual Payment
          </button>
          <button
            onClick={syncYedpay}
            disabled={syncing || !yedpayConfigured}
            className="btn border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50"
            title={yedpayConfigured ? undefined : 'Add Yedpay credentials in Settings → API Integrations'}
          >
            {syncing ? 'Syncing…' : 'Sync Yedpay Transactions'}
          </button>
          <div className="flex gap-2">
            <select
              value={uploadMethod}
              onChange={(e) => setUploadMethod(e.target.value as PaymentMethod)}
              className={selectCls}
            >
              <option value="FPS">FPS</option>
              <option value="Payme">PayMe</option>
            </select>
            <button
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="btn border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50 whitespace-nowrap"
            >
              {uploading ? 'Uploading…' : 'Upload Bank Statement'}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) uploadStatement(f);
                e.target.value = '';
              }}
            />
          </div>
          </div>
        )}
      </div>

      <div className="mb-6 inline-flex w-full sm:w-auto rounded-xl border border-gray-200 bg-gray-100 p-1">
        <button
          type="button"
          onClick={() => changeView('reconciliation')}
          className={`flex-1 sm:flex-none rounded-lg px-5 py-2.5 text-sm font-medium transition ${
            view === 'reconciliation'
              ? 'bg-white text-gray-900 shadow-sm'
              : 'text-gray-600 hover:text-gray-900'
          }`}
        >
          Reconciliation 入帳
        </button>
        {canViewAccounting && (
          <button
            type="button"
            onClick={() => changeView('accounting')}
            className={`flex-1 sm:flex-none rounded-lg px-5 py-2.5 text-sm font-medium transition ${
              view === 'accounting'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Accounting 對帳
          </button>
        )}
      </div>

      {view === 'accounting' ? (
        <AccountingTable />
      ) : (
        <>
      {linkOrderId != null && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-900">
          <div>
            Linking payment for order{' '}
            <span className="font-mono font-medium">{linkOrderRef || `#${linkOrderId}`}</span>
            {linkAmountHint != null ? ` · ${formatMoney(linkAmountHint)}` : ''}
            {linkDateHint ? ` · ${linkDateHint}` : ''}
            <div className="text-brand-700/80 text-xs mt-0.5">
              {linkShowingAllUnverified
                ? relatedPending.length === 0
                  ? `No close matches found — showing all unverified deposits. Pick one and confirm with “${BTN.linkToOrder}”`
                  : `Showing all unverified deposits — choose any record and confirm with “${BTN.linkToOrder}”`
                : `Showing related pending deposits — confirm with “${BTN.linkToOrder}”`}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {relatedPending.length > 0 && (
              <button
                type="button"
                onClick={() => setShowAllLinkRecords((current) => !current)}
                className="px-3 py-1.5 rounded-lg border border-brand-300 bg-white text-brand-800 hover:bg-brand-50 whitespace-nowrap"
              >
                {showAllLinkRecords ? 'Show suggested matches' : 'Choose another record'}
              </button>
            )}
            <button
              type="button"
              onClick={returnToAccounting}
              className="px-3 py-1.5 rounded-lg border border-brand-300 bg-white text-brand-800 hover:bg-brand-50 whitespace-nowrap"
            >
              Cancel → Accounting
            </button>
          </div>
        </div>
      )}
      {(focusRecordId != null || matchedOrderId != null) && (
        <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-900">
          <div>
            {focusRecordId != null
              ? `Showing linked payment record #${focusRecordId}`
              : `Showing matched payment(s) for order #${matchedOrderId}`}
          </div>
          <button
            type="button"
            onClick={returnToAccounting}
            className="px-3 py-1.5 rounded-lg border border-green-300 bg-white text-green-800 hover:bg-green-50 whitespace-nowrap"
          >
            Back to Accounting
          </button>
        </div>
      )}
      {message && (
        <div className="mb-4 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">
          {message}
        </div>
      )}
      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {!focusMode && (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        {(Object.keys(ZONE_META) as ZoneFilter[]).map((z) => {
          const meta = ZONE_META[z];
          const count =
            z === 'high'
              ? summary?.pendingHigh ?? zoneCounts.high
              : z === 'medium'
                ? summary?.pendingMedium ?? zoneCounts.medium
                : z === 'attention'
                  ? (summary?.unmatched ?? 0) + (summary?.discrepancy ?? 0)
                  : summary?.matched ?? zoneCounts.matched;
          const active = zoneFilter === z;
          return (
            <button
              key={z}
              type="button"
              onClick={() => toggleZone(z)}
              className={`bg-white rounded-xl border border-gray-200 p-6 text-left transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 ${
                active ? `ring-2 ${meta.ring} shadow-sm` : ''
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-500">{meta.title}</p>
                  <p className="text-2xl font-bold text-gray-900 mt-1">{count}</p>
                </div>
                <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-xl ${meta.color}`}>
                  {meta.icon}
                </div>
              </div>
            </button>
          );
        })}
      </div>
      )}

      {!focusMode && (
      <FilterBar
        dateStart={dateStart}
        dateEnd={dateEnd}
        onDateStart={setDateStart}
        onDateEnd={setDateEnd}
        search={search}
        onSearch={setSearch}
        searchPlaceholder="Search order / invoice / remarks / uploader…"
        onClear={clearFilters}
      >
        <div className="flex flex-col min-w-0">
          <label className="text-[11px] font-medium text-gray-500 mb-1">Payment method</label>
          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value)}
            className={selectCls}
          >
            <option value="">All</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABELS[m]}
              </option>
            ))}
          </select>
        </div>
      </FilterBar>
      )}

      {loading ? (
        <div className="p-12 text-center bg-white rounded-xl border border-gray-200">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
            <div className="text-sm text-gray-600">
              {displayed.length === 0
                ? 'No records'
                : `Showing ${pageStart + 1}–${pageEnd} of ${displayed.length}`}
              {zoneFilter ? (
                <span className="text-gray-400"> · {ZONE_META[zoneFilter].title}</span>
              ) : (
                <span className="text-gray-400"> · All types</span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              {(zoneFilter === 'high' || zoneFilter === null) && highCount > 0 && !focusMode && (
                <button
                  onClick={approveAllHigh}
                  disabled={batchApproving}
                  className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 whitespace-nowrap text-sm"
                >
                  {batchApproving ? 'Approving…' : `Approve All High-Confidence (${highCount})`}
                </button>
              )}
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
          {pageRows.length === 0 ? (
            <div className="p-10 text-center text-sm text-gray-500">No records match these filters.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1100px] text-sm">
                <thead>{colHeaders()}</thead>
                <tbody className="divide-y divide-gray-50">{pageRows.map(recordRow)}</tbody>
              </table>
            </div>
          )}
          {displayed.length > PAGE_SIZE && (
            <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-gray-100">
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
          )}
        </div>
      )}

      {linkRecordId !== null && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-lg p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">Manual Link 手動連結訂單</h2>
            <p className="text-sm text-gray-500 mb-4">
              Link record #{linkRecordId} to an unpaid invoice (approves immediately).
            </p>
            <label className="text-xs font-medium text-gray-500">Search name / phone / order / invoice</label>
            <input
              value={candidateSearch}
              onChange={(e) => setCandidateSearch(e.target.value)}
              placeholder="e.g. 張先生 / 9123 / NES-…"
              className={`${selectCls} mt-1 mb-3`}
            />
            <label className="text-xs font-medium text-gray-500">Invoice</label>
            <select
              value={selectedInvoiceId}
              onChange={(e) => setSelectedInvoiceId(e.target.value)}
              className={`${selectCls} mt-1 mb-4`}
            >
              <option value="">Select invoice…</option>
              {filteredCandidates.map((c) => (
                <option key={c.invoice_id!} value={c.invoice_id!}>
                  {c.invoice_number}
                  {c.order_no ? ` · ${c.order_no}` : ''}
                  {c.invoice_total != null ? ` · ${formatMoney(c.invoice_total)}` : ''}
                  {c.customer_name ? ` · ${c.customer_name}` : ''}
                  {c.phone ? ` · ${c.phone}` : ''}
                </option>
              ))}
            </select>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => {
                  setLinkRecordId(null);
                  setSelectedInvoiceId('');
                }}
                className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={submitManualLink}
                disabled={!selectedInvoiceId || linking}
                className="px-4 py-2 text-sm rounded-lg bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
              >
                {linking ? 'Saving…' : 'Manual Link & Approve'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showManual && (
        <div className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 my-4">
            <h2 className="text-lg font-semibold text-gray-900 mb-1">手動入帳 Manual Payment</h2>
            <p className="text-sm text-gray-500 mb-4">Enter a deposit not from Yedpay / bank statement upload</p>
            {manualError && (
              <div className="mb-3 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{manualError}</div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">銀碼 Amount *</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={manualForm.amount}
                  onChange={(e) => setManualForm({ ...manualForm, amount: e.target.value })}
                  className={selectCls}
                  placeholder="0.00"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Payment method 付款方式 *</label>
                <select
                  value={manualForm.payment_method}
                  onChange={(e) =>
                    setManualForm({ ...manualForm, payment_method: e.target.value as PaymentMethod })
                  }
                  className={selectCls}
                >
                  {PAYMENT_METHODS.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_METHOD_LABELS[m]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Invoice no.</label>
                <input
                  value={manualForm.invoice_no}
                  onChange={(e) => setManualForm({ ...manualForm, invoice_no: e.target.value })}
                  className={selectCls}
                  placeholder="e.g. 2026080012"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Order no.</label>
                <input
                  value={manualForm.order_no}
                  onChange={(e) => setManualForm({ ...manualForm, order_no: e.target.value })}
                  className={selectCls}
                  placeholder="e.g. ORD-0000123 / PO#"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">備註 Remarks</label>
                <textarea
                  value={manualForm.remarks}
                  onChange={(e) => setManualForm({ ...manualForm, remarks: e.target.value })}
                  rows={2}
                  className={selectCls}
                  placeholder="Optional notes"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">收據上傳 Receipt</label>
                <div
                  onClick={() => receiptRef.current?.click()}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (e.dataTransfer.files?.[0]) handleManualReceipt(e.dataTransfer.files[0]);
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40"
                >
                  <input
                    ref={receiptRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      if (e.target.files?.[0]) handleManualReceipt(e.target.files[0]);
                      e.target.value = '';
                    }}
                  />
                  {manualPreview ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={manualPreview} alt="receipt" className="max-h-28 mx-auto rounded" />
                  ) : (
                    <>
                      <div className="text-2xl mb-1">📎</div>
                      <p className="text-xs text-gray-500">Drag/drop or click to upload</p>
                    </>
                  )}
                  {manualUploadMsg && <p className="text-[11px] text-brand-700 mt-2">{manualUploadMsg}</p>}
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  onClick={saveManualPayment}
                  disabled={manualSaving}
                  className="flex-1 py-2 bg-brand-600 text-white rounded-lg hover:bg-brand-700 disabled:opacity-50 font-medium"
                >
                  {manualSaving ? 'Saving…' : '儲存 Save'}
                </button>
                <button
                  onClick={() => setShowManual(false)}
                  className="flex-1 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
      )}

    </AppLayout>
  );
}

export default function ReconciliationPage() {
  return (
    <Suspense fallback={null}>
      <ReconciliationContent />
    </Suspense>
  );
}
