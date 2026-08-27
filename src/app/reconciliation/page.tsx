'use client';

import { Suspense, useEffect, useMemo, useRef, useState, Fragment } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import AccountingTable from '@/components/AccountingTable';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/components/AuthProvider';
import FilterBar from '@/components/FilterBar';
import { formatMoney } from '@/lib/cashflow';
import { reconciliationReceiptUrl } from '@/lib/image-url';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  RECON_STATUS_COLORS,
  type PaymentMethod,
  type ReconciliationRecord,
} from '@/lib/reconciliation';
import {
  RECONCILIATION_PAGE_SIZE,
  RECONCILIATION_SELECT_CLS,
  RECONCILIATION_TABLE_COL_COUNT,
  RECONCILIATION_ZONE_META,
  depositDateKey,
  formatReconciliationDateTime,
  isRelatedPendingRecord,
  parseReconciliationAmountHint,
  reconciliationRecordInZone,
  type ReconciliationView,
  type ReconciliationSortKey,
  type ZoneFilter,
} from '@/lib/reconciliation-page-utils';
import { useReconciliationList } from '@/hooks/reconciliation/useReconciliationList';
import { BTN, bi } from '@/lib/ui-labels';
import { displayInvoiceNumber } from '@/lib/record-numbering-core';
import { PAYMENT_SLOTS, normalizePaymentSlot, type PaymentSlot } from '@/lib/orders';

const ReconciliationManualEntryModal = dynamic(
  () => import('@/components/reconciliation/ReconciliationManualEntryModal'),
  { loading: () => null },
);
const ReconciliationLinkModal = dynamic(
  () => import('@/components/reconciliation/ReconciliationLinkModal'),
  { loading: () => null },
);

function ReconciliationContent() {
  const { user, canAccess } = useAuth();
  const list = useReconciliationList();
  const {
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
    clearFilters,
    toggleZone,
    toggleSort,
    exportExcel,
    syncYedpay,
    uploadStatement,
    approveOne,
    rejectOne,
    linkToOrder: linkRecordToOrder,
    unlinkOne: unlinkRecord,
    approveAllHigh,
    submitManualLink,
  } = list;

  const [view, setView] = useState<ReconciliationView>('reconciliation');
  const [linkOrderId, setLinkOrderId] = useState<number | null>(null);
  const [linkAmountHint, setLinkAmountHint] = useState<number | null>(null);
  const [linkDateHint, setLinkDateHint] = useState<string | null>(null);
  const [linkOrderRef, setLinkOrderRef] = useState<string | null>(null);
  const [linkPaymentSlot, setLinkPaymentSlot] = useState<PaymentSlot>(1);
  const [showAllLinkRecords, setShowAllLinkRecords] = useState(false);
  const [focusRecordId, setFocusRecordId] = useState<number | null>(null);
  const [matchedOrderId, setMatchedOrderId] = useState<number | null>(null);
  const [linkRecordId, setLinkRecordId] = useState<number | null>(null);
  const [linking, setLinking] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<number>>(() => new Set());
  const fileRef = useRef<HTMLInputElement>(null);
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
      setLinkAmountHint(parseReconciliationAmountHint(searchParams.get('amount')));
      setLinkDateHint(searchParams.get('date') || null);
      setLinkOrderRef(searchParams.get('orderRef') || null);
      setLinkPaymentSlot(normalizePaymentSlot(searchParams.get('paymentSlot')));
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
    setZoneFilter,
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
    setLinkPaymentSlot(1);
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

  const linkToOrder = async (id: number) => {
    if (!linkOrderId) return;
    const ok = await linkRecordToOrder(id, linkOrderId, linkPaymentSlot);
    if (ok) returnToAccounting();
  };

  const unlinkOne = async (id: number) => {
    const ok = await unlinkRecord(id);
    if (!ok) return;
    if (focusRecordId === id || matchedOrderId != null) {
      clearFocusMode();
    }
  };

  const openLink = (id: number) => {
    setLinkRecordId(id);
    loadCandidates();
  };

  const highCount = zoneCounts.high;

  const relatedPending = useMemo(() => {
    if (linkOrderId == null) return [];
    return records.filter((r) => isRelatedPendingRecord(r, linkOrderId, linkAmountHint, linkDateHint));
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
          return isRelatedPendingRecord(r, linkOrderId, linkAmountHint, linkDateHint);
        }
        return r.status !== 'Matched';
      }
      if (zoneFilter && !reconciliationRecordInZone(r, zoneFilter)) return false;
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
      if (
        sort.key === 'gross_amount' ||
        sort.key === 'transaction_fee' ||
        sort.key === 'net_amount'
      ) {
        return ((Number(av) || 0) - (Number(bv) || 0)) * dir;
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

  const totalPages = Math.max(1, Math.ceil(displayed.length / RECONCILIATION_PAGE_SIZE));
  const pageStart = displayed.length ? (page - 1) * RECONCILIATION_PAGE_SIZE : 0;
  const pageEnd = Math.min(page * RECONCILIATION_PAGE_SIZE, displayed.length);
  const pageRows = displayed.slice(pageStart, pageEnd);

  useEffect(() => {
    setPage(1);
  }, [zoneFilter, methodFilter, dateStart, dateEnd, search, sort, linkOrderId, focusRecordId, matchedOrderId]);

  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);

  const suggestionCell = (r: ReconciliationRecord) => {
    const matched = r.status === 'Matched';
    const orderId = matched ? r.order_id : r.suggested_order_id;
    const orderNo = matched
      ? r.order_no || (orderId ? `#${orderId}` : null)
      : r.suggested_order_no || r.order_no || (orderId ? `#${orderId}` : null);
    const invoiceId = matched ? r.invoice_id : r.suggested_invoice_id;
    const invoiceNo = matched ? r.invoice_number : r.suggested_invoice_number;

    return (
      <div className="space-y-0.5 text-xs leading-snug">
        <div className="text-gray-700">
          <span className="text-gray-400">order:</span>{' '}
          {orderId && orderNo ? (
            <Link href={`/orders/${orderId}`} className="font-mono text-brand-600 hover:text-brand-700">
              {orderNo}
            </Link>
          ) : orderNo ? (
            <span className="font-mono text-gray-700">{orderNo}</span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </div>
        <div className="text-gray-700">
          <span className="text-gray-400">Invoice:</span>{' '}
          {invoiceId && invoiceNo ? (
            <Link href={`/invoices/${invoiceId}`} className="font-mono text-brand-600 hover:text-brand-700">
              {displayInvoiceNumber(invoiceNo)}
            </Link>
          ) : invoiceNo ? (
            <span className="font-mono text-gray-700">{displayInvoiceNumber(invoiceNo)}</span>
          ) : (
            <span className="text-gray-400">—</span>
          )}
        </div>
      </div>
    );
  };

  const toggleExpanded = (id: number) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const amountCell = (r: ReconciliationRecord) => (
    <span className="font-medium text-gray-900 whitespace-nowrap">{formatMoney(r.gross_amount)}</span>
  );

  const statusCell = (r: ReconciliationRecord) => (
    <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-medium ${RECON_STATUS_COLORS[r.status]}`}>
      {r.status}
      {r.confidence ? (
        <span className="ml-1 opacity-70">· {r.confidence}</span>
      ) : null}
    </span>
  );

  const colHeaders = () => {
    const matchedOnly = zoneFilter === 'matched' || focusRecordId != null || matchedOrderId != null;
    const suggestionTitle = matchedOnly ? '對應' : '建議';
    const sortBtn = (key: ReconciliationSortKey, label: string) => (
      <th className="px-2 py-2 whitespace-nowrap">
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
        <th className="px-1.5 py-2 w-8" aria-label="Expand" />
        {sortBtn('deposit_time', '入帳日期')}
        {sortBtn('gross_amount', '金額')}
        {sortBtn('net_amount', '凈額')}
        <th className="px-2 py-2 whitespace-nowrap">{suggestionTitle}</th>
        {sortBtn('status', 'Status')}
        <th className="px-2 py-2 whitespace-nowrap">Actions</th>
      </tr>
    );
  };

  const moreInfoPanel = (r: ReconciliationRecord) => {
    const receiptUrl = reconciliationReceiptUrl(r.id, r.receipt_path);
    const sourceLabel =
      r.source === 'yedpay' ? 'Yedpay' : r.source === 'bank_upload' ? 'Bank upload' : 'Manual';
    const fromLabel = PAYMENT_METHOD_LABELS[r.payment_method] || r.payment_method;
    const txnId = r.external_id || null;
    const notes = r.remarks?.trim() || null;

    return (
      <tr className="bg-gray-50/80">
        <td colSpan={RECONCILIATION_TABLE_COL_COUNT} className="px-4 py-3">
          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-gray-500 mb-3">
              More info 詳細資料
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-sm">
              <div>
                <p className="text-[11px] font-medium text-gray-500 mb-0.5">Transaction ID</p>
                <p className="font-mono text-gray-800 break-all">{txnId || '—'}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-gray-500 mb-0.5">From 來源方式</p>
                <p className="text-gray-800">
                  {fromLabel}
                  <span className="text-gray-400"> · {sourceLabel}</span>
                </p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-gray-500 mb-0.5">Record #</p>
                <p className="font-mono text-gray-800">{r.id}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-gray-500 mb-0.5">建立日期 Created</p>
                <p className="text-gray-800">{formatReconciliationDateTime(r.created_at)}</p>
              </div>
              <div>
                <p className="text-[11px] font-medium text-gray-500 mb-0.5">上傳人 Uploaded by</p>
                <p className="text-gray-800">{r.created_by || '—'}</p>
              </div>
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-[11px] font-medium text-gray-500 mb-0.5">Notes 備註</p>
                <p className="text-gray-800 whitespace-pre-wrap">{notes || '—'}</p>
              </div>
              {r.suggested_customer_name ? (
                <div>
                  <p className="text-[11px] font-medium text-gray-500 mb-0.5">Suggested customer</p>
                  <p className="text-gray-800">{r.suggested_customer_name}</p>
                </div>
              ) : null}
              {r.suggested_amount != null ? (
                <div>
                  <p className="text-[11px] font-medium text-gray-500 mb-0.5">Suggested amount</p>
                  <p className="text-gray-800">{formatMoney(r.suggested_amount)}</p>
                </div>
              ) : null}
              {r.confidence ? (
                <div>
                  <p className="text-[11px] font-medium text-gray-500 mb-0.5">Confidence</p>
                  <p className="text-gray-800 capitalize">{r.confidence}</p>
                </div>
              ) : null}
              {r.matched_at ? (
                <div>
                  <p className="text-[11px] font-medium text-gray-500 mb-0.5">Matched at</p>
                  <p className="text-gray-800">{formatReconciliationDateTime(r.matched_at)}</p>
                </div>
              ) : null}
              {r.approved_by ? (
                <div>
                  <p className="text-[11px] font-medium text-gray-500 mb-0.5">Approved by</p>
                  <p className="text-gray-800">
                    {r.approved_by}
                    {r.approved_at ? ` · ${formatReconciliationDateTime(r.approved_at)}` : ''}
                  </p>
                </div>
              ) : null}
              {r.candidates?.length ? (
                <div className="sm:col-span-2 lg:col-span-3">
                  <p className="text-[11px] font-medium text-gray-500 mb-1">Candidates</p>
                  <ul className="space-y-1 text-gray-700">
                    {r.candidates.map((c) => (
                      <li key={`${c.order_id}-${c.invoice_id ?? 'x'}`} className="font-mono text-xs">
                        {c.order_no || `#${c.order_id}`}
                        {c.invoice_number ? ` · ${displayInvoiceNumber(c.invoice_number)}` : ''}
                        {c.amount != null ? ` · ${formatMoney(c.amount)}` : ''}
                        {c.customer_name ? ` · ${c.customer_name}` : ''}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              <div className="sm:col-span-2 lg:col-span-3">
                <p className="text-[11px] font-medium text-gray-500 mb-1">Receipt 收據</p>
                {receiptUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={receiptUrl}
                    alt="receipt"
                    onClick={() => setLightbox(receiptUrl)}
                    className="h-28 w-auto max-w-full object-contain rounded border border-gray-200 cursor-zoom-in hover:ring-2 hover:ring-brand-400 bg-gray-50"
                  />
                ) : (
                  <p className="text-gray-400">—</p>
                )}
              </div>
            </div>
          </div>
        </td>
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

  const recordRow = (r: ReconciliationRecord) => {
    const expanded = expandedIds.has(r.id);
    return (
      <Fragment key={r.id}>
        <tr className="hover:bg-gray-50">
          <td className="px-1.5 py-2">
            <button
              type="button"
              onClick={() => toggleExpanded(r.id)}
              aria-expanded={expanded}
              className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-gray-200 text-gray-600 hover:bg-gray-100 text-xs"
              title={expanded ? 'Hide details' : 'More info'}
            >
              {expanded ? '▾' : '▸'}
            </button>
          </td>
          <td className="px-2 py-2 text-gray-700 whitespace-nowrap">{formatReconciliationDateTime(r.deposit_time)}</td>
          <td className="px-2 py-2">{amountCell(r)}</td>
          <td className="px-2 py-2 whitespace-nowrap">
            <div className="font-medium text-gray-900">{formatMoney(r.net_amount)}</div>
            <div className="text-[11px] text-gray-400">費用 {formatMoney(r.transaction_fee || 0)}</div>
          </td>
          <td className="px-2 py-2">{suggestionCell(r)}</td>
          <td className="px-2 py-2">{statusCell(r)}</td>
          <td className="px-2 py-2">{actionsFor(r)}</td>
        </tr>
        {expanded ? moreInfoPanel(r) : null}
      </Fragment>
    );
  };

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
            onClick={() => setShowManual(true)}
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
              className={RECONCILIATION_SELECT_CLS}
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
            {` · ${PAYMENT_SLOTS.find((s) => s.slot === linkPaymentSlot)?.shortLabel || `Installment ${linkPaymentSlot}`}`}
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
        {(Object.keys(RECONCILIATION_ZONE_META) as ZoneFilter[]).map((z) => {
          const meta = RECONCILIATION_ZONE_META[z];
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
            className={RECONCILIATION_SELECT_CLS}
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
                <span className="text-gray-400"> · {RECONCILIATION_ZONE_META[zoneFilter].title}</span>
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
              <table className="w-full text-sm">
                <thead>{colHeaders()}</thead>
                <tbody className="divide-y divide-gray-50">{pageRows.map(recordRow)}</tbody>
              </table>
            </div>
          )}
          {displayed.length > RECONCILIATION_PAGE_SIZE && (
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

      <ReconciliationLinkModal
        linkRecordId={linkRecordId}
        candidates={candidates}
        onSearch={loadCandidates}
        linking={linking}
        onClose={() => setLinkRecordId(null)}
        onSubmit={async (invoiceId) => {
          if (linkRecordId == null) return false;
          setLinking(true);
          const ok = await submitManualLink(linkRecordId, invoiceId);
          setLinking(false);
          if (ok) setLinkRecordId(null);
          return ok;
        }}
      />

      <ReconciliationManualEntryModal
        open={showManual}
        onClose={() => setShowManual(false)}
        onSaved={(msg) => {
          setMessage(msg);
          load();
        }}
        onError={setError}
      />

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
