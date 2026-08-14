'use client';

import { Fragment, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import ActivityFeed from '@/components/ActivityFeed';
import SfExpressShipmentModal from '@/components/SfExpressShipmentModal';
import OrderPropertyBar, { type AccountUser } from '@/components/OrderPropertyBar';
import SupplierSelect from '@/components/SupplierSelect';
import { DEFAULT_OPTIONS } from '@/lib/expenses';
import { mergeSupplierLists } from '@/lib/expense-suppliers';
import { compressImage } from '@/lib/imageCompression';
import { orderFileUrl, orderPaymentReceiptUrl } from '@/lib/image-url';
import {
  ORDER_FIELDS,
  ORDER_TYPES,
  ORDER_PAYMENT_METHODS,
  ORDER_PAYMENT_METHOD_OTHER,
  WEDDING_GIFT_BOTTLE_CAPACITIES,
  WEDDING_GIFT_CLIENT_FLAVORS,
  WEDDING_GIFT_ACTUAL_FLAVORS,
  WEDDING_GIFT_MATERIAL_FIELDS,
  WEDDING_GIFT_PACK_BOW_FIELDS,
  WEDDING_GIFT_PACK_BAG_FIELDS,
  WEDDING_GIFT_PACK_CARTON_FIELDS,
  WEDDING_GIFT_PACK_CAPACITIES,
  WEDDING_GIFT_PACK_FLAVORS,
  computeBirdNestTotals,
  computeBirdNestActualTotal,
  computeOrderPaidTotal,
  computeHonourLineTotals,
  computeWeddingGiftTotal,
  derivePaymentStatusLabel,
  emptyHonourLine,
  emptyHonourSupplier,
  ensureHonourSupplierCount,
  honourLinesDerivedFields,
  honourProductLineCount,
  honourSuppliersDerivedFields,
  isHonourShippingLine,
  normalizeWeddingGiftBottleCapacity,
  computeWeddingGiftMaterials,
  computeWeddingGiftPacking,
  normalizeOrderPaymentMethod,
  parseHonourLines,
  parseHonourSuppliers,
  getNestieeLines,
  NESTIEE_GIFT_BOX_TYPES,
  nestieeGiftQtyManualKey,
  weddingGiftFoilStickerKey,
  weddingGiftRoundTagKey,
  parseAssigneeIds,
  parseOrderTags,
  parseOrderDueDateField,
  serializeAssigneeIds,
  serializeOrderTags,
  orderTitle,
  isBadgeOrderType,
  isWeddingGiftOrderType,
  type HonourLineItem,
  type HonourSupplierItem,
  type Order,
} from '@/lib/orders';
import { parseWeddingGiftConfirmation, addCalendarDays } from '@/lib/wedding-gift-confirmation';
import { BTN, MSG, TITLE, bi } from '@/lib/ui-labels';

interface InvoiceOption {
  id: number;
  invoice_number: string;
  status: string;
}

interface QuotationOption {
  id: number;
  quote_number: string;
  status: string;
}

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [order, setOrder] = useState<Order | null>(null);
  const [invoices, setInvoices] = useState<InvoiceOption[]>([]);
  const [quotations, setQuotations] = useState<QuotationOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const [renamingFileId, setRenamingFileId] = useState<number | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const renameCancelledRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const payment1InputRef = useRef<HTMLInputElement>(null);
  const payment2InputRef = useRef<HTMLInputElement>(null);
  const payment3InputRef = useRef<HTMLInputElement>(null);
  const [paymentPreview, setPaymentPreview] = useState<{ 1?: string; 2?: string; 3?: string }>({});
  const [paymentScanMsg, setPaymentScanMsg] = useState<{ 1?: string; 2?: string; 3?: string }>({});
  const [convertingQuote, setConvertingQuote] = useState(false);
  const [quoteToast, setQuoteToast] = useState<{ text: string; kind: 'success' | 'error' } | null>(null);
  const [confirmPasteOpen, setConfirmPasteOpen] = useState(false);
  const [confirmPasteText, setConfirmPasteText] = useState('');
  const [confirmPasteError, setConfirmPasteError] = useState('');
  const [sfModalOpen, setSfModalOpen] = useState(false);
  const [accountUsers, setAccountUsers] = useState<AccountUser[]>([]);
  const [tagSuggestions, setTagSuggestions] = useState<string[]>([]);
  const [supplierOptions, setSupplierOptions] = useState<string[]>([...DEFAULT_OPTIONS.supplier]);
  /** Big Day value last persisted with derived dates (or loaded from server). */
  const bigDayPersistedRef = useRef('');
  /** Skip blur PATCH when onChange already saved this Big Day + derived dates. */
  const bigDaySavedOnChangeRef = useRef<string | null>(null);

  useEffect(() => {
    fetch(`/api/orders/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const o = d?.order || null;
        setOrder(o);
        if (o) {
          bigDayPersistedRef.current = String(o.fields?.big_day || '');
          bigDaySavedOnChangeRef.current = null;
        }
      })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    fetch('/api/invoices')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInvoices((d?.invoices || []).map((i: InvoiceOption) => ({ id: i.id, invoice_number: i.invoice_number, status: i.status }))))
      .catch(() => {});
    fetch('/api/quotations')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setQuotations((d?.quotations || []).map((q: QuotationOption) => ({ id: q.id, quote_number: q.quote_number, status: q.status }))))
      .catch(() => {});
    fetch('/api/account/users')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setAccountUsers(Array.isArray(d?.users) ? d.users : []))
      .catch(() => {});
    fetch('/api/orders/tag-options')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setTagSuggestions(Array.isArray(d?.tags) ? d.tags : []))
      .catch(() => {});
    fetch('/api/expense-options')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const list = d?.options?.supplier;
        if (Array.isArray(list)) setSupplierOptions(list.map(String));
      })
      .catch(() => {});
  }, []);

  const patch = async (payload: { core?: Record<string, unknown>; fields?: Record<string, unknown>; linked_invoice_id?: string | number | null; linked_quotation_id?: string | number | null }) => {
    // Keep UI in sync immediately so a later server response can't briefly wipe autofills.
    if (payload.fields && Object.keys(payload.fields).length) {
      setOrder((o) =>
        o
          ? {
              ...o,
              fields: {
                ...o.fields,
                ...(payload.fields as Record<string, string | boolean>),
              },
            }
          : o
      );
    }
    const res = await fetch(`/api/orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.order) {
        setOrder(data.order);
        bigDayPersistedRef.current = String(data.order.fields?.big_day || '');
      }
    }
  };

  const convertToQuotation = async () => {
    setConvertingQuote(true);
    setQuoteToast(null);
    try {
      const res = await fetch(`/api/orders/${id}/convert-to-quotation`, { method: 'POST' });
      let data: { error?: string; quote_number?: string; id?: number } = {};
      try {
        data = await res.json();
      } catch {
        setQuoteToast({
          text: `Failed to convert order (HTTP ${res.status}). Try refreshing or restarting the app.`,
          kind: 'error',
        });
        return;
      }
      if (!res.ok) {
        setQuoteToast({ text: data.error || `Failed to convert order (HTTP ${res.status})`, kind: 'error' });
        return;
      }
      if (!data.id) {
        setQuoteToast({ text: 'Failed to convert order — no quotation id returned', kind: 'error' });
        return;
      }
      setQuoteToast({ text: `Created quotation ${data.quote_number}`, kind: 'success' });
      const orderRes = await fetch(`/api/orders/${id}`);
      const orderData = await orderRes.json();
      if (orderData.order) setOrder(orderData.order);
      setTimeout(() => router.push(`/quotations/${data.id}`), 800);
    } catch {
      setQuoteToast({ text: 'Failed to convert order', kind: 'error' });
    } finally {
      setConvertingQuote(false);
    }
  };

  const deleteOrder = async () => {
    if (!confirm(bi(
      'Move this order to Deleted Records? You can restore it within 60 days.',
      '將此訂單移至已刪除紀錄？可於 60 天內還原。',
    ))) return;
    const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setQuoteToast({ text: data.error || bi('Failed to delete order', '刪除訂單失敗'), kind: 'error' });
      return;
    }
    router.push('/orders');
  };

  const setCoreLocal = (col: string, value: unknown) =>
    setOrder((o) => (o ? ({ ...o, [col]: value } as Order) : o));
  const setFieldLocal = (key: string, value: unknown) =>
    setOrder((o) => (o ? { ...o, fields: { ...o.fields, [key]: value as string | boolean } } : o));

  const [uploadMsg, setUploadMsg] = useState('');
  const uploadFiles = async (files: FileList) => {
    setUploadMsg('Optimising files…');
    // Compress images (≤1600px JPEG) and convert heavy PDFs (>2MB) into compressed
    // JPEG page images so we store a lightweight image array, never the raw monster PDF.
    const prepared: File[] = [];
    for (const f of Array.from(files)) {
      try {
        if (f.type === 'application/pdf') {
          setUploadMsg(`Compressing PDF “${f.name}” pages…`);
          const { compressPdfToImages } = await import('@/lib/pdfCompression');
          const pages = await compressPdfToImages(f);
          prepared.push(...pages);
        } else if (f.type.startsWith('image/')) {
          const c = await compressImage(f, { maxDim: 1600, targetBytes: 300 * 1024, mimeType: 'image/jpeg' });
          prepared.push(c.file);
        } else {
          prepared.push(f);
        }
      } catch {
        prepared.push(f);
      }
    }
    if (!prepared.length) { setUploadMsg(''); return; }

    setUploadMsg(`Uploading ${prepared.length} image(s)…`);
    const fd = new FormData();
    prepared.forEach((f) => fd.append('file', f));
    const res = await fetch(`/api/orders/${id}/files`, { method: 'POST', body: fd });
    if (res.ok) {
      const data = await res.json();
      setOrder((o) => (o ? { ...o, files: data.files } : o));
    }
    setUploadMsg('');
  };

  const deleteFile = async (fileId: number) => {
    const res = await fetch(`/api/order-files/${fileId}`, { method: 'DELETE' });
    if (res.ok) setOrder((o) => (o ? { ...o, files: o.files.filter((f) => f.id !== fileId) } : o));
  };

  const downloadFile = async (f: { id: number; path: string; original_name: string | null }) => {
    try {
      const res = await fetch(`${orderFileUrl(f)}?download=1`);
      if (!res.ok) return;
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = f.original_name || `order-file-${f.id}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      /* ignore */
    }
  };

  const startRenameFile = (f: { id: number; original_name: string | null }) => {
    renameCancelledRef.current = false;
    setRenamingFileId(f.id);
    setRenameDraft(f.original_name || `Image #${f.id}`);
  };

  const cancelRenameFile = () => {
    renameCancelledRef.current = true;
    setRenamingFileId(null);
    setRenameDraft('');
  };

  const saveRenameFile = async (fileId: number) => {
    if (renameCancelledRef.current) {
      renameCancelledRef.current = false;
      setRenamingFileId(null);
      setRenameDraft('');
      return;
    }
    const name = renameDraft.trim();
    if (!name) {
      setRenamingFileId(null);
      setRenameDraft('');
      return;
    }
    const current = order?.files.find((f) => f.id === fileId);
    if (current && (current.original_name || '').trim() === name) {
      setRenamingFileId(null);
      setRenameDraft('');
      return;
    }
    const res = await fetch(`/api/order-files/${fileId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ original_name: name }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data.file) {
        setOrder((o) =>
          o
            ? {
                ...o,
                files: o.files.map((f) => (f.id === fileId ? { ...f, original_name: data.file.original_name } : f)),
              }
            : o
        );
      }
    }
    setRenamingFileId(null);
    setRenameDraft('');
  };

  const handlePaymentReceipt = async (rawFile: File, slot: 1 | 2 | 3) => {
    setPaymentScanMsg((m) => ({ ...m, [slot]: 'Compressing & scanning receipt…' }));
    // Compress with the receipt rule: 1600px, quality 0.65, < 300KB. Heavy PDFs → first page image.
    let file = rawFile;
    try {
      if (rawFile.type === 'application/pdf') {
        const { compressPdfToImages } = await import('@/lib/pdfCompression');
        const pages = await compressPdfToImages(rawFile, { quality: 0.65, maxWidthOrHeight: 1600 });
        if (pages[0]) file = pages[0];
      } else {
        const c = await compressImage(rawFile, { maxDim: 1600, targetBytes: 300 * 1024, mimeType: 'image/jpeg', quality: 0.65 });
        file = c.file;
      }
    } catch {
      /* fall back to original */
    }
    setPaymentPreview((p) => ({ ...p, [slot]: URL.createObjectURL(file) }));

    const prefix = slot === 1 ? 'payment' : `payment${slot}`;
    const fd = new FormData();
    fd.append('receipt', file);
    try {
      const res = await fetch('/api/payments/scan', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setPaymentScanMsg((m) => ({ ...m, [slot]: data.error || MSG.scanFailed }));
        return;
      }
      const r = data.result;
      const bankKey = slot === 1 ? 'payment_bank' : `${prefix}_bank`;
      const methodKey = slot === 1 ? 'payment_method_detail' : `${prefix}_method_detail`;
      const refKey = slot === 1 ? 'payment_reference' : `${prefix}_reference`;
      const upd: Record<string, string> = {
        [`${prefix}_receipt_path`]: r.receipt_path || '',
      };
      if (r.payment_date) {
        upd[`${prefix}_date`] = r.payment_date;
        if (slot === 1) upd.payment1_date = r.payment_date;
      }
      if (r.amount != null) {
        upd[`${prefix}_amount`] = String(r.amount);
        if (slot === 1) upd.payment1_amount = String(r.amount);
      }
      if (r.bank) upd[bankKey] = r.bank;
      if (r.method) {
        const normalized = normalizeOrderPaymentMethod(r.method);
        if (normalized.method) upd[methodKey] = normalized.method;
        if (normalized.note) {
          const noteKey = slot === 1 ? 'payment_method_note' : `${prefix}_method_note`;
          upd[noteKey] = normalized.note;
        }
      }
      if (r.reference) upd[refKey] = r.reference;
      const nextFields = { ...(order?.fields || {}), ...upd };
      const paid = computeOrderPaidTotal(nextFields);
      const orderType = String(order?.fields?.order_type || '');
      const honourDue =
        isBadgeOrderType(orderType) && order
          ? computeHonourLineTotals(parseHonourLines(nextFields)).totalAmount
          : 0;
      const weddingDue =
        isWeddingGiftOrderType(orderType) ? computeWeddingGiftTotal(nextFields) : 0;
      const due =
        order?.linked_invoice?.total ??
        (honourDue > 0
          ? honourDue
          : weddingDue > 0
            ? weddingDue
            : order?.total_amount != null && order.total_amount > 0
              ? order.total_amount
              : null);
      upd.payment_status_label = derivePaymentStatusLabel(paid, due);
      setOrder((o) => (o ? { ...o, fields: { ...o.fields, ...upd } } : o));
      patch({ fields: upd });
      const via = r.source === 'ai' ? 'AI vision (Gemini)' : 'on-device OCR';
      const found = [r.payment_date && 'date', r.amount != null && 'amount', r.bank && 'bank', r.method && 'method', r.reference && 'ref'].filter(Boolean);
      setPaymentScanMsg((m) => ({
        ...m,
        [slot]: found.length
          ? `Extracted via ${via}: ${found.join(', ')}. Please verify.`
          : `No fields auto-extracted (${via}). Enter manually.`,
      }));
    } catch {
      setPaymentScanMsg((m) => ({ ...m, [slot]: MSG.scanFailed }));
    }
  };

  if (loading) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64"><div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" /></div>
      </AppLayout>
    );
  }
  if (!order) {
    return (
      <AppLayout>
        <div className="p-12 text-center text-gray-500">{bi('Order not found.', '找不到訂單。')} <button onClick={() => router.push('/orders')} className="text-brand-600 underline">{bi('Back to orders', '返回訂單')}</button></div>
      </AppLayout>
    );
  }

  // Helpers for the structured section boxes (values stored in fields_json).
  const softInput = 'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50/40 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-colors';
  const fVal = (k: string) => (order.fields[k] as string) ?? '';
  /** Clamp typed quantity to ≥ 0 (empty stays empty). */
  const nonNeg = (value: string): string => {
    if (value.trim() === '') return '';
    const n = Number(value);
    if (!Number.isFinite(n)) return value;
    return n < 0 ? '0' : value;
  };
  const fInput = (key: string, type = 'text', placeholder = '') => (
    <input
      type={type}
      min={type === 'number' ? 0 : undefined}
      value={fVal(key)}
      onChange={(e) => setFieldLocal(key, type === 'number' ? nonNeg(e.target.value) : e.target.value)}
      onBlur={(e) => {
        const v = type === 'number' ? nonNeg(e.target.value) : e.target.value;
        if (type === 'number' && v !== e.target.value) setFieldLocal(key, v);
        patch({ fields: { [key]: v } });
      }}
      placeholder={placeholder}
      className={softInput}
    />
  );
  const orderType = fVal('order_type');
  const honourLines = isBadgeOrderType(orderType) ? parseHonourLines(order.fields) : [];
  const honourTotals = computeHonourLineTotals(honourLines);
  const honourSuppliers = isBadgeOrderType(orderType)
    ? parseHonourSuppliers(order.fields, {
        minCount: honourProductLineCount(honourLines),
        cartonCountCore: order.carton_count,
      })
    : [];
  const honourDue =
    isBadgeOrderType(orderType) && honourTotals.totalAmount > 0 ? honourTotals.totalAmount : null;
  const weddingGiftTotal = isWeddingGiftOrderType(orderType) ? computeWeddingGiftTotal(order.fields) : 0;
  const weddingDue = weddingGiftTotal > 0 ? weddingGiftTotal : null;
  const dueTotal =
    order.linked_invoice?.total != null && order.linked_invoice.total > 0
      ? order.linked_invoice.total
      : honourDue != null
        ? honourDue
        : weddingDue != null
          ? weddingDue
          : order.total_amount != null && order.total_amount > 0
            ? order.total_amount
            : null;
  const paidTotal = computeOrderPaidTotal(order.fields);
  const autoStatus = derivePaymentStatusLabel(paidTotal, dueTotal);

  const applyAmountAndStatus = (key: 'payment_amount' | 'payment2_amount' | 'payment3_amount', value: string) => {
    const fields: Record<string, string> = { [key]: value };
    if (key === 'payment_amount') fields.payment1_amount = value;
    const nextFields = { ...order.fields, ...fields };
    const paid = computeOrderPaidTotal(nextFields);
    fields.payment_status_label = derivePaymentStatusLabel(paid, dueTotal);
    setFieldLocal('payment_status_label', fields.payment_status_label);
    patch({ fields });
  };
  const paymentAmountInput = (key: 'payment_amount' | 'payment2_amount' | 'payment3_amount') => (
    <input
      type="number"
      value={fVal(key) || (key === 'payment_amount' ? fVal('payment1_amount') : '')}
      onChange={(e) => {
        setFieldLocal(key, e.target.value);
        if (key === 'payment_amount') setFieldLocal('payment1_amount', e.target.value);
      }}
      onBlur={(e) => applyAmountAndStatus(key, e.target.value)}
      placeholder="0.00"
      className={softInput}
    />
  );
  const paymentMethodFields = (slot: 1 | 2 | 3) => {
    const methodKey = slot === 1 ? 'payment_method_detail' : `payment${slot}_method_detail`;
    const noteKey = slot === 1 ? 'payment_method_note' : `payment${slot}_method_note`;
    const raw = fVal(methodKey);
    const known = (ORDER_PAYMENT_METHODS as readonly string[]).includes(raw);
    const selectValue = known ? raw : raw ? ORDER_PAYMENT_METHOD_OTHER : '';
    const showNote = selectValue === ORDER_PAYMENT_METHOD_OTHER;
    const noteValue = fVal(noteKey) || (!known && raw ? raw : '');
    return (
      <>
        {labeled(
          '支付方式 Payment Method',
          <select
            value={selectValue}
            onChange={(e) => {
              const v = e.target.value;
              const fields: Record<string, string> = { [methodKey]: v };
              if (v !== ORDER_PAYMENT_METHOD_OTHER) fields[noteKey] = '';
              else if (!known && raw && !fVal(noteKey)) fields[noteKey] = raw;
              setFieldLocal(methodKey, v);
              if (fields[noteKey] !== undefined) setFieldLocal(noteKey, fields[noteKey]);
              patch({ fields });
            }}
            className={softInput}
          >
            <option value="">—</option>
            {ORDER_PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>{m}</option>
            ))}
          </select>
        )}
        {showNote && (
          <div className="sm:col-span-2">
            {labeled(
              '備註 Remarks',
              <input
                value={noteValue}
                onChange={(e) => setFieldLocal(noteKey, e.target.value)}
                onBlur={(e) => {
                  const fields: Record<string, string> = { [noteKey]: e.target.value };
                  if (!known && raw && selectValue === ORDER_PAYMENT_METHOD_OTHER) {
                    fields[methodKey] = ORDER_PAYMENT_METHOD_OTHER;
                  }
                  patch({ fields });
                }}
                placeholder="請註明其他支付方式…"
                className={softInput}
              />
            )}
          </div>
        )}
      </>
    );
  };
  const labeled = (label: string, node: React.ReactNode, hint?: string) => (
    <div>
      <label className="block text-xs font-medium text-gray-500 mb-1.5">
        {label}
        {hint ? <span className="text-gray-400 font-normal"> · {hint}</span> : null}
      </label>
      {node}
    </div>
  );
  const readOnly = (label: string, value: React.ReactNode) => (
    <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-gray-400">{label}</p>
      <p className="text-lg font-semibold text-gray-900 leading-tight mt-0.5">{value}</p>
    </div>
  );
  const bn = computeBirdNestTotals(order.fields);

  const setHonourLinesLocal = (lines: HonourLineItem[]) => {
    const derived = honourLinesDerivedFields(lines);
    const { totalAmount } = computeHonourLineTotals(lines);
    // Grow supplier cards when product count increases (never auto-shrink).
    const productCount = honourProductLineCount(lines);
    const currentSuppliers = parseHonourSuppliers(order.fields, {
      minCount: 1,
      cartonCountCore: order.carton_count,
    });
    const padded = ensureHonourSupplierCount(currentSuppliers, productCount);
    const supplierDerived =
      padded.length !== currentSuppliers.length ? honourSuppliersDerivedFields(padded) : {};
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            fields: { ...prev.fields, ...derived, ...supplierDerived },
            total_amount: totalAmount > 0 ? totalAmount : prev.total_amount,
          }
        : prev
    );
  };

  const commitHonourLines = (lines: HonourLineItem[]) => {
    const derived = honourLinesDerivedFields(lines);
    const { totalAmount } = computeHonourLineTotals(lines);
    const productCount = honourProductLineCount(lines);
    const currentSuppliers = parseHonourSuppliers(order.fields, {
      minCount: 1,
      cartonCountCore: order.carton_count,
    });
    const padded = ensureHonourSupplierCount(currentSuppliers, productCount);
    const supplierDerived =
      padded.length !== currentSuppliers.length ? honourSuppliersDerivedFields(padded) : {};
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            fields: { ...prev.fields, ...derived, ...supplierDerived },
            total_amount: totalAmount > 0 ? totalAmount : prev.total_amount,
          }
        : prev
    );
    patch({
      fields: { ...derived, ...supplierDerived },
      ...(totalAmount > 0 ? { core: { total_amount: totalAmount } } : {}),
    });
  };

  const setHonourSuppliersLocal = (suppliers: HonourSupplierItem[]) => {
    const derived = honourSuppliersDerivedFields(suppliers);
    const firstCarton = suppliers[0]?.carton_count ?? '';
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            fields: { ...prev.fields, ...derived },
            carton_count: firstCarton,
          }
        : prev
    );
  };

  const commitHonourSuppliers = (suppliers: HonourSupplierItem[]) => {
    const derived = honourSuppliersDerivedFields(suppliers);
    const firstCarton = suppliers[0]?.carton_count ?? '';
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            fields: { ...prev.fields, ...derived },
            carton_count: firstCarton,
          }
        : prev
    );
    patch({
      fields: derived,
      core: { carton_count: firstCarton },
    });
  };

  const syncWeddingGiftTotalAmount = (fieldsPatch: Record<string, string> = {}) => {
    const nextFields = { ...order.fields, ...fieldsPatch };
    const total = computeWeddingGiftTotal(nextFields);
    if (total > 0) {
      setOrder((prev) => (prev ? { ...prev, total_amount: total } : prev));
      patch({ fields: fieldsPatch, core: { total_amount: total } });
    } else if (Object.keys(fieldsPatch).length) {
      patch({ fields: fieldsPatch });
    }
  };

  /** Recalc 材料 + 包裝 from capacity / flavor qtys; keeps fields editable afterward. */
  const syncWeddingGiftDerived = (fieldsPatch: Record<string, string> = {}) => {
    const nextFields = { ...order.fields, ...fieldsPatch };
    const materials = computeWeddingGiftMaterials(nextFields);
    const packing = computeWeddingGiftPacking(nextFields);
    const derived = { ...fieldsPatch, ...materials, ...packing };
    const total = computeWeddingGiftTotal(nextFields);
    setOrder((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        fields: { ...prev.fields, ...derived },
        ...(total > 0 ? { total_amount: total } : {}),
      };
    });
    if (total > 0) {
      patch({ fields: derived, core: { total_amount: total } });
    } else {
      patch({ fields: derived });
    }
  };

  /** Apply pasted 即食燕窩回禮 confirmation → core + fields + derived materials/packing. */
  const applyWeddingGiftConfirmation = () => {
    if (!order) return;
    const parsed = parseWeddingGiftConfirmation(confirmPasteText);
    const fieldsPatch: Record<string, string> = {};
    for (const [k, v] of Object.entries(parsed.fields)) {
      if (!v) continue;
      // Derived from Big Day — applied only when Big Day itself changes (below).
      if (k === 'expiry_date' || k === 'production_date') continue;
      fieldsPatch[k] = v;
    }
    if (fieldsPatch.big_day && fieldsPatch.big_day !== fVal('big_day')) {
      // Big Day change always refreshes derived dates (overrides prior edits).
      fieldsPatch.expiry_date = addCalendarDays(fieldsPatch.big_day, 28);
      fieldsPatch.production_date = addCalendarDays(fieldsPatch.big_day, -10);
    }

    const corePatch: Record<string, unknown> = {};
    if (parsed.core.name) corePatch.name = parsed.core.name;
    if (parsed.core.phone) corePatch.phone = parsed.core.phone;
    if (parsed.core.shipping_address) corePatch.shipping_address = parsed.core.shipping_address;
    if (parsed.core.notes) {
      const existing = (order.notes || '').trim();
      corePatch.notes = existing ? `${existing}\n\n${parsed.core.notes}` : parsed.core.notes;
    }

    if (!Object.keys(fieldsPatch).length && !Object.keys(corePatch).length) {
      setConfirmPasteError(
        parsed.warnings[0] || bi('No recognizable fields found', '未能辨識任何欄位')
      );
      return;
    }

    const nextFields = { ...order.fields, ...fieldsPatch };
    const materials = computeWeddingGiftMaterials(nextFields);
    const packing = computeWeddingGiftPacking(nextFields);
    const derived = { ...fieldsPatch, ...materials, ...packing };
    const total = computeWeddingGiftTotal(nextFields);
    if (total > 0) corePatch.total_amount = total;

    setOrder((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        ...(corePatch as Partial<Order>),
        fields: { ...prev.fields, ...derived },
      };
    });
    patch({
      fields: derived,
      ...(Object.keys(corePatch).length ? { core: corePatch } : {}),
    });
    setConfirmPasteOpen(false);
    setConfirmPasteText('');
    setConfirmPasteError('');
    setQuoteToast({
      text: bi('Confirmation applied — review fields', '已套用確認訊息 — 請核對欄位'),
      kind: 'success',
    });
  };

  const weddingGiftQtyInput = (key: string) => (
    <input
      type="number"
      min={0}
      value={fVal(key)}
      onChange={(e) => setFieldLocal(key, nonNeg(e.target.value))}
      onBlur={(e) => {
        const v = nonNeg(e.target.value);
        setFieldLocal(key, v);
        syncWeddingGiftDerived({ [key]: v });
      }}
      placeholder="0"
      className={softInput}
    />
  );

  const packQtyMatrix = (
    title: string,
    keyFor: (capacityId: string, flavorId: string) => string
  ) => (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="bg-gray-50/80 border-b border-gray-200">
            <th className="text-left font-semibold text-gray-700 px-3 py-2.5 whitespace-nowrap">{title}</th>
            {WEDDING_GIFT_PACK_CAPACITIES.map((c) => (
              <th key={c.id} className="font-medium text-gray-500 px-2 py-2.5 text-center">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEDDING_GIFT_PACK_FLAVORS.map((flavor) => (
            <tr key={flavor.id} className="border-b border-gray-100 last:border-0">
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{flavor.label}</td>
              {WEDDING_GIFT_PACK_CAPACITIES.map((cap) => {
                const key = keyFor(cap.id, flavor.id);
                return (
                  <td key={cap.id} className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      value={fVal(key)}
                      onChange={(e) => setFieldLocal(key, nonNeg(e.target.value))}
                      onBlur={(e) => {
                        const v = nonNeg(e.target.value);
                        setFieldLocal(key, v);
                        patch({ fields: { [key]: v } });
                      }}
                      placeholder="0"
                      className={`${softInput} text-center`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <AppLayout>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3">
        <button onClick={() => router.push('/orders')} className="text-sm text-brand-600 hover:text-brand-700 font-medium min-h-[44px] sm:min-h-0 text-left">← {bi('Back to orders', '返回訂單')}</button>
        <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
          <button
            type="button"
            onClick={convertToQuotation}
            disabled={convertingQuote}
            className="btn bg-teal-600 text-white hover:bg-teal-700 disabled:opacity-50 w-full sm:w-auto"
          >
            {convertingQuote ? bi('Converting…', '轉換中…') : `→ ${bi('Convert to Quotation', '轉換為報價單')}`}
          </button>
          <Link href={`/orders/${order.id}/delivery-note`} className="btn bg-brand-600 text-white hover:bg-brand-700 w-full sm:w-auto">
            🚚 {bi('Generate Delivery Note', '產生出貨單')}
          </Link>
          <button
            type="button"
            onClick={() => setSfModalOpen(true)}
            className="btn bg-orange-600 text-white hover:bg-orange-700 w-full sm:w-auto"
          >
            {bi('Create SF Express', '建立順豐運單')}
          </button>
          {isBadgeOrderType(orderType) && (
            <Link
              href={`/orders/${order.id}/production-note`}
              className="btn bg-slate-800 text-white hover:bg-slate-900 w-full sm:w-auto"
            >
              {bi('Prepare Production Note', '準備生產單')}
            </Link>
          )}
          <button
            type="button"
            onClick={deleteOrder}
            className="btn text-red-600 border border-red-200 hover:bg-red-50 w-full sm:w-auto"
          >
            {BTN.delete}
          </button>
        </div>
      </div>
      {quoteToast && (
        <div
          className={`mb-4 px-3 py-2 rounded-lg text-sm ${
            quoteToast.kind === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {quoteToast.text}
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-6 lg:items-stretch lg:min-h-0 lg:h-[calc(100vh-7rem)]">
        {/* LEFT COLUMN — 70% (scrolls independently on desktop) */}
        <div className="w-full lg:w-[70%] space-y-6 lg:h-full lg:overflow-y-auto lg:pr-2">
          {/* Header */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900 min-w-0">{orderTitle(order)}</h1>
              <div className="text-right shrink-0">
                <p className="text-[11px] uppercase tracking-wide text-gray-400">{bi('Total', '總額')}</p>
                <p className="text-xl sm:text-2xl font-bold text-gray-900 tabular-nums leading-tight">
                  {dueTotal != null
                    ? `$${dueTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    : '—'}
                </p>
              </div>
            </div>
            <OrderPropertyBar
              orderType={orderType}
              status={order.status}
              dueDate={parseOrderDueDateField(order.fields)}
              assigneeIds={parseAssigneeIds(order.fields)}
              tags={parseOrderTags(order.fields)}
              users={accountUsers}
              tagSuggestions={tagSuggestions}
              onStatusChange={(next) => {
                setCoreLocal('status', next);
                patch({ core: { status: next } });
              }}
              onDueDateChange={(next) => {
                setFieldLocal('due_date', next);
                patch({ fields: { due_date: next } });
              }}
              onAssigneesChange={(ids) => {
                const serialized = serializeAssigneeIds(ids);
                setFieldLocal('assignee_ids', serialized);
                patch({ fields: { assignee_ids: serialized } });
              }}
              onTagsChange={(nextTags) => {
                const serialized = serializeOrderTags(nextTags);
                setFieldLocal('tags', serialized);
                patch({ fields: { tags: serialized } });
                setTagSuggestions((prev) => {
                  const merged = new Set([...prev, ...nextTags]);
                  return Array.from(merged).sort((a, b) => a.localeCompare(b, 'zh'));
                });
              }}
            />
            <input
              value={order.description}
              onChange={(e) => setCoreLocal('description', e.target.value)}
              onBlur={(e) => patch({ core: { description: e.target.value } })}
              placeholder="Description 描述 (e.g. 4款亞加力)"
              className="mt-3 w-full bg-transparent hover:bg-gray-50 focus:bg-white border border-transparent hover:border-gray-200 focus:border-brand-400 rounded px-2 py-1 text-sm outline-none"
            />
            <div className="mt-4">
              <label className="block text-xs font-medium text-gray-500 mb-1">Notes 備註</label>
              <textarea value={order.notes} onChange={(e) => setCoreLocal('notes', e.target.value)} onBlur={(e) => patch({ core: { notes: e.target.value } })} rows={2} placeholder="Add notes… (manually input or edited)" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm" />
            </div>
          </div>

          <section className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Linked Records 關聯文件</h2>
            <div className="grid md:grid-cols-2 gap-5">
              {labeled(
                'Quotation 報價單',
                <div className="space-y-2">
                  {order.linked_quotation ? (
                    <Link href={`/quotations/${order.linked_quotation.id}`} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 text-brand-700 text-sm font-medium hover:bg-brand-100">
                      🔗 {order.linked_quotation.quote_number} · {order.linked_quotation.status}
                    </Link>
                  ) : (
                    <p className="text-sm text-gray-400">No quotation linked.</p>
                  )}
                  <select
                    value={order.quotation_id || ''}
                    onChange={(e) => patch({ linked_quotation_id: e.target.value || null })}
                    className={softInput}
                  >
                    <option value="">— Not linked —</option>
                    {quotations.map((q) => <option key={q.id} value={q.id}>{q.quote_number} · {q.status}</option>)}
                  </select>
                </div>
              )}
              {labeled(
                'Invoice 發票',
                <div className="space-y-2">
                  {order.linked_invoice ? (
                    <Link href={`/invoices/${order.linked_invoice.id}`} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 text-brand-700 text-sm font-medium hover:bg-brand-100">
                      🔗 {order.linked_invoice.invoice_number} · {order.linked_invoice.status}
                    </Link>
                  ) : (
                    <p className="text-sm text-gray-400">No invoice linked.</p>
                  )}
                  <select
                    value={order.linked_invoice?.id || ''}
                    onChange={(e) => patch({ linked_invoice_id: e.target.value || null })}
                    className={softInput}
                  >
                    <option value="">— Not linked —</option>
                    {invoices.map((inv) => <option key={inv.id} value={inv.id}>{inv.invoice_number} · {inv.status}</option>)}
                  </select>
                </div>
              )}
            </div>
          </section>

          {/* Client info */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h2 className="font-semibold text-gray-900 mb-4">Client 客戶</h2>
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Name 客戶</label>
                <input value={order.name} onChange={(e) => setCoreLocal('name', e.target.value)} onBlur={(e) => patch({ core: { name: e.target.value } })} className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">電話 Phone</label>
                <input value={order.phone} onChange={(e) => setCoreLocal('phone', e.target.value)} onBlur={(e) => patch({ core: { phone: e.target.value } })} placeholder="+852…" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">E-mail</label>
                <input value={order.customer_email} onChange={(e) => setCoreLocal('customer_email', e.target.value)} onBlur={(e) => patch({ core: { customer_email: e.target.value } })} placeholder="name@email.com" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm" />
              </div>
            </div>
          </div>

          {/* BOX 3 — Shipment Detail */}
          <section className="bg-white rounded-2xl border border-gray-200 p-8">
            <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold mb-1">Box 3</p>
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Shipment Detail 送貨詳情</h2>
            <div className="grid md:grid-cols-2 gap-5">
              {labeled('客人送貨日期', fInput('client_delivery_date', 'date'))}
              {labeled('客人收件時間', fInput('receiving_time', 'text', 'e.g. 2-6pm'))}
              {labeled('聯絡方式', fInput('contact_method', 'text', 'Phone / WhatsApp / WeChat'))}
              {labeled('Tracking Number 運單號', fInput('tracking_no', 'text', 'e.g. SF5120793357800'))}
              <div className="md:col-span-2">
                {labeled(
                  'Shipping Method 寄出方式',
                  <select
                    value={fVal('shipping_method')}
                    onChange={(e) => {
                      setFieldLocal('shipping_method', e.target.value);
                      patch({ fields: { shipping_method: e.target.value } });
                    }}
                    className={softInput}
                  >
                    <option value="">—</option>
                    {(ORDER_FIELDS.find((f) => f.key === 'shipping_method')?.options || []).map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                )}
              </div>
              <div>
                {labeled(
                  '送貨地址 Shipping Address',
                  <textarea
                    value={order.shipping_address}
                    onChange={(e) => setCoreLocal('shipping_address', e.target.value)}
                    onBlur={(e) => patch({ core: { shipping_address: e.target.value } })}
                    rows={3}
                    className={softInput}
                  />
                )}
              </div>
              <div>
                {labeled(
                  '帳單地址 Billing Address',
                  <textarea
                    value={String(order.fields.billing_address ?? '')}
                    onChange={(e) => setFieldLocal('billing_address', e.target.value)}
                    onBlur={(e) => patch({ fields: { billing_address: e.target.value } })}
                    rows={3}
                    className={softInput}
                  />
                )}
              </div>
            </div>
          </section>

          {/* BOX 1 — Order Detail (dynamic by Order Type) */}
          <section className="bg-white rounded-2xl border border-gray-200 p-8">
            <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold mb-1">Box 1</p>
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Order Detail 訂單詳情</h2>

            <div className="grid md:grid-cols-2 gap-5 mb-8">
              {labeled(
                'PO# 訂單號碼',
                <input
                  value={order.po_number}
                  onChange={(e) => setCoreLocal('po_number', e.target.value)}
                  onBlur={(e) => patch({ core: { po_number: e.target.value } })}
                  placeholder="e.g. PO-1001"
                  className={softInput}
                />
              )}
              {labeled(
                'Order Type 訂單種類',
                <select
                  value={orderType}
                  onChange={(e) => { setFieldLocal('order_type', e.target.value); patch({ fields: { order_type: e.target.value } }); }}
                  className={softInput}
                >
                  <option value="">Select type…</option>
                  {ORDER_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
                </select>
              )}
            </div>

            {isBadgeOrderType(orderType) && (
              <div className="space-y-8">
                {/* Line items — per-product craft & packaging */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">Items 款式明細</h3>
                    <button
                      type="button"
                      onClick={() => commitHonourLines([...honourLines, emptyHonourLine()])}
                      className="text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      + Add product
                    </button>
                  </div>
                  <div className="space-y-6">
                    {honourLines.map((line, index) => {
                      const shipping = isHonourShippingLine(line);
                      const productIndex =
                        honourLines.slice(0, index + 1).filter((l) => !isHonourShippingLine(l)).length;
                      const updateLine = (patchLine: Partial<HonourLineItem>, commit: boolean) => {
                        const next = honourLines.map((l, i) => (i === index ? { ...l, ...patchLine } : l));
                        if (commit) commitHonourLines(next);
                        else setHonourLinesLocal(next);
                      };
                      if (shipping) {
                        return (
                          <div
                            key={`ship-${index}`}
                            className="rounded-xl border border-dashed border-gray-200 bg-gray-50/60 p-4"
                          >
                            <div className="flex items-center justify-between mb-3">
                              <h4 className="text-sm font-semibold text-gray-600">Shipping 運費</h4>
                              <button
                                type="button"
                                disabled={honourLines.length <= 1}
                                onClick={() => commitHonourLines(honourLines.filter((_, i) => i !== index))}
                                className="text-sm text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                              >
                                Remove
                              </button>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-w-md">
                              {labeled(
                                'Amount 金額',
                                <div className="relative">
                                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                                  <input
                                    type="number"
                                    value={line.unit_price}
                                    onChange={(e) => updateLine({ unit_price: e.target.value }, false)}
                                    onBlur={(e) => updateLine({ unit_price: e.target.value, quantity: '1' }, true)}
                                    placeholder="0.00"
                                    className={`${softInput} pl-7`}
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      }
                      return (
                        <div
                          key={`product-${index}`}
                          className="rounded-xl border border-gray-200 bg-white p-4 space-y-5 shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-gray-800">
                              Product {productIndex} 產品 {productIndex}
                            </h4>
                            <button
                              type="button"
                              disabled={honourProductLineCount(honourLines) <= 1}
                              onClick={() => commitHonourLines(honourLines.filter((_, i) => i !== index))}
                              className="text-sm text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              Remove
                            </button>
                          </div>

                          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px_140px] gap-3">
                            {labeled(
                              'Style 款式',
                              <input
                                value={line.style}
                                onChange={(e) => updateLine({ style: e.target.value }, false)}
                                onBlur={(e) => updateLine({ style: e.target.value }, true)}
                                placeholder="e.g. 亞加力雙面"
                                className={softInput}
                              />
                            )}
                            {labeled(
                              'Quantity 數量',
                              <input
                                type="number"
                                min={0}
                                value={line.quantity}
                                onChange={(e) => updateLine({ quantity: nonNeg(e.target.value) }, false)}
                                onBlur={(e) => updateLine({ quantity: nonNeg(e.target.value) }, true)}
                                placeholder="0"
                                className={softInput}
                              />
                            )}
                            {labeled(
                              'Amount per 單價',
                              <div className="relative">
                                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                                <input
                                  type="number"
                                  value={line.unit_price}
                                  onChange={(e) => updateLine({ unit_price: e.target.value }, false)}
                                  onBlur={(e) => updateLine({ unit_price: e.target.value }, true)}
                                  placeholder="0.00"
                                  className={`${softInput} pl-7`}
                                />
                              </div>
                            )}
                          </div>

                          <div className="border-t border-dashed border-gray-100 pt-4 space-y-4">
                            <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Craft 工藝
                            </h5>
                            <div className="grid md:grid-cols-2 gap-4">
                              {labeled(
                                '紙卡尺寸',
                                <input
                                  value={line.card_size}
                                  onChange={(e) => updateLine({ card_size: e.target.value }, false)}
                                  onBlur={(e) => updateLine({ card_size: e.target.value }, true)}
                                  className={softInput}
                                />
                              )}
                              {labeled(
                                '加工工藝',
                                <input
                                  value={line.craft}
                                  onChange={(e) => updateLine({ craft: e.target.value }, false)}
                                  onBlur={(e) => updateLine({ craft: e.target.value }, true)}
                                  placeholder="e.g. 亞加力-單面"
                                  className={softInput}
                                />
                              )}
                              {labeled(
                                '電鍍色',
                                <input
                                  value={line.plating_color}
                                  onChange={(e) => updateLine({ plating_color: e.target.value }, false)}
                                  onBlur={(e) => updateLine({ plating_color: e.target.value }, true)}
                                  className={softInput}
                                />
                              )}
                              {labeled(
                                '背扣',
                                <input
                                  value={line.clasp}
                                  onChange={(e) => updateLine({ clasp: e.target.value }, false)}
                                  onBlur={(e) => updateLine({ clasp: e.target.value }, true)}
                                  placeholder="e.g. 四節圓圈"
                                  className={softInput}
                                />
                              )}
                            </div>
                          </div>

                          <div className="border-t border-dashed border-gray-100 pt-4 space-y-4">
                            <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                              Packaging 包裝
                            </h5>
                            <div className="grid md:grid-cols-2 gap-4">
                              {labeled(
                                '內部包裝處理',
                                <input
                                  value={line.internal_pack}
                                  onChange={(e) => updateLine({ internal_pack: e.target.value }, false)}
                                  onBlur={(e) => updateLine({ internal_pack: e.target.value }, true)}
                                  placeholder="e.g. 不需要"
                                  className={softInput}
                                />
                              )}
                              {labeled(
                                '交貨包裝',
                                <input
                                  value={line.pack_required}
                                  onChange={(e) => updateLine({ pack_required: e.target.value }, false)}
                                  onBlur={(e) => updateLine({ pack_required: e.target.value }, true)}
                                  placeholder="e.g. OPP 獨立包裝"
                                  className={softInput}
                                />
                              )}
                            </div>
                          </div>

                          <div className="border-t border-dashed border-gray-100 pt-4">
                            {labeled(
                              '其他選項 Other options',
                              <textarea
                                value={line.other_options}
                                onChange={(e) => updateLine({ other_options: e.target.value }, false)}
                                onBlur={(e) => updateLine({ other_options: e.target.value }, true)}
                                rows={4}
                                placeholder="Unmatched Woo / CPO options for this product…"
                                className={softInput}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="grid md:grid-cols-2 gap-5 mt-4 max-w-lg">
                    {readOnly('total quantity 總數量', honourTotals.totalQuantity)}
                    {readOnly(
                      'total amount 總金額',
                      `$${honourTotals.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    )}
                  </div>
                </div>

                {/* Platform */}
                <div className="border-t border-dashed border-gray-200 pt-6 space-y-5">
                  <h3 className="text-sm font-semibold text-gray-700">Platform 下單平台</h3>
                  <div className="grid md:grid-cols-2 gap-5">
                    {labeled('platform 下單平台', fInput('order_from', 'text', 'e.g. honour.com.hk'))}
                    {labeled('payment option 下單時付款選項', fInput('payment_option', 'text', 'e.g. yedpay'))}
                  </div>
                </div>

                {/* Supplier cards */}
                <div className="border-t border-dashed border-gray-200 pt-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">Supplier 供應商</h3>
                    <button
                      type="button"
                      onClick={() => commitHonourSuppliers([...honourSuppliers, emptyHonourSupplier()])}
                      className="text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      + Add more
                    </button>
                  </div>
                  <div className="space-y-5">
                    {honourSuppliers.map((sup, sIndex) => {
                      const updateSup = (patchSup: Partial<HonourSupplierItem>, commit: boolean) => {
                        const next = honourSuppliers.map((s, i) => (i === sIndex ? { ...s, ...patchSup } : s));
                        if (commit) commitHonourSuppliers(next);
                        else setHonourSuppliersLocal(next);
                      };
                      return (
                        <div
                          key={`supplier-${sIndex}`}
                          className="rounded-xl border border-gray-200 bg-white p-4 space-y-4 shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-gray-800">
                              Supplier-{sIndex + 1} 供應商-{sIndex + 1}
                            </h4>
                            <button
                              type="button"
                              disabled={honourSuppliers.length <= 1}
                              onClick={() =>
                                commitHonourSuppliers(honourSuppliers.filter((_, i) => i !== sIndex))
                              }
                              className="text-sm text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="max-w-md">
                            {labeled(
                              '供應商',
                              <SupplierSelect
                                value={sup.supplier}
                                options={mergeSupplierLists(supplierOptions, [sup.supplier])}
                                onChange={(v) => updateSup({ supplier: v }, true)}
                                onAdd={async (v) => {
                                  const res = await fetch('/api/expense-options', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ type: 'supplier', value: v }),
                                  });
                                  if (res.ok) {
                                    const data = await res.json();
                                    if (Array.isArray(data.options)) setSupplierOptions(data.options.map(String));
                                    else setSupplierOptions((prev) => mergeSupplierLists(prev, [v]));
                                  } else {
                                    setSupplierOptions((prev) => mergeSupplierLists(prev, [v]));
                                  }
                                }}
                                placeholder={bi('Select supplier…', '選擇供應商…')}
                              />
                            )}
                          </div>
                          <div className="grid md:grid-cols-3 gap-4">
                            {labeled(
                              '單價 ($)',
                              <input
                                value={sup.supplier_price}
                                onChange={(e) => updateSup({ supplier_price: e.target.value }, false)}
                                onBlur={(e) => updateSup({ supplier_price: e.target.value }, true)}
                                placeholder="e.g. rmb 4.2"
                                className={softInput}
                              />
                            )}
                            {labeled(
                              '模費/印刷費 ($)',
                              <input
                                value={sup.mould_print_fee}
                                onChange={(e) => updateSup({ mould_print_fee: e.target.value }, false)}
                                onBlur={(e) => updateSup({ mould_print_fee: e.target.value }, true)}
                                className={softInput}
                              />
                            )}
                            {labeled(
                              '生產數量',
                              <input
                                value={sup.supplier_qty}
                                onChange={(e) => updateSup({ supplier_qty: e.target.value }, false)}
                                onBlur={(e) => updateSup({ supplier_qty: e.target.value }, true)}
                                className={softInput}
                              />
                            )}
                          </div>
                          <div className="grid md:grid-cols-3 gap-4">
                            {labeled(
                              '出貨包裝',
                              <input
                                value={sup.supplier_pack}
                                onChange={(e) => updateSup({ supplier_pack: e.target.value }, false)}
                                onBlur={(e) => updateSup({ supplier_pack: e.target.value }, true)}
                                placeholder="e.g. OPP獨立包裝"
                                className={softInput}
                              />
                            )}
                            {labeled(
                              '寄出日期',
                              <input
                                value={sup.supplier_ship_date}
                                onChange={(e) => updateSup({ supplier_ship_date: e.target.value }, false)}
                                onBlur={(e) => updateSup({ supplier_ship_date: e.target.value }, true)}
                                placeholder="e.g. 15/1/26"
                                className={softInput}
                              />
                            )}
                            {labeled(
                              '箱數',
                              <input
                                value={sup.carton_count}
                                onChange={(e) => updateSup({ carton_count: e.target.value }, false)}
                                onBlur={(e) => updateSup({ carton_count: e.target.value }, true)}
                                placeholder="e.g. 5"
                                className={softInput}
                              />
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Extra actions */}
                <div className="border-t border-dashed border-gray-200 pt-6">
                  {labeled(
                    '額外動作',
                    <textarea
                      value={fVal('extra_actions')}
                      onChange={(e) => setFieldLocal('extra_actions', e.target.value)}
                      onBlur={(e) => patch({ fields: { extra_actions: e.target.value } })}
                      rows={3}
                      placeholder="Extra actions / notes…"
                      className={softInput}
                    />
                  )}
                </div>
              </div>
            )}

            {isWeddingGiftOrderType(orderType) && (
              <div className="space-y-8">
                {/* Section 1 — 客人訂購數量 */}
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-sm text-gray-500">
                      {bi('Paste a confirmation message to autofill fields', '貼上確認訊息以自動填入欄位')}
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmPasteText('');
                        setConfirmPasteError('');
                        setConfirmPasteOpen(true);
                      }}
                      className="btn bg-brand-600 text-white hover:bg-brand-700 w-full sm:w-auto shrink-0"
                    >
                      {bi('Paste confirmation', '貼上確認訊息')}
                    </button>
                  </div>
                  <div className="grid md:grid-cols-3 gap-5">
                    {labeled(
                      'Big Day',
                      <input
                        type="date"
                        value={fVal('big_day')}
                        onChange={(e) => {
                          const v = e.target.value;
                          const prev = fVal('big_day');
                          setFieldLocal('big_day', v);
                          if (v && v !== prev) {
                            const expiryIso = addCalendarDays(v, 28);
                            const productionIso = addCalendarDays(v, -10);
                            setFieldLocal('expiry_date', expiryIso);
                            setFieldLocal('production_date', productionIso);
                            // Persist all three immediately — a later blur that only sends
                            // big_day would overwrite these via setOrder(server).
                            bigDaySavedOnChangeRef.current = v;
                            bigDayPersistedRef.current = v;
                            void patch({
                              fields: {
                                big_day: v,
                                expiry_date: expiryIso,
                                production_date: productionIso,
                              },
                            });
                          }
                        }}
                        onBlur={(e) => {
                          const v = e.target.value;
                          // onChange already saved this value with derived dates.
                          if (bigDaySavedOnChangeRef.current === v) {
                            bigDaySavedOnChangeRef.current = null;
                            return;
                          }
                          const upd: Record<string, string> = { big_day: v };
                          if (v && v !== bigDayPersistedRef.current) {
                            const expiryIso = addCalendarDays(v, 28);
                            const productionIso = addCalendarDays(v, -10);
                            upd.expiry_date = expiryIso;
                            upd.production_date = productionIso;
                            setFieldLocal('expiry_date', expiryIso);
                            setFieldLocal('production_date', productionIso);
                            bigDayPersistedRef.current = v;
                          }
                          void patch({ fields: upd });
                        }}
                        className={softInput}
                      />
                    )}
                    {labeled('到期日', fInput('expiry_date', 'date'), 'Big Day後4星期')}
                    {labeled('生產日期', fInput('production_date', 'date'), 'Big Day前10天')}
                  </div>

                  <h3 className="text-sm font-semibold text-gray-700">客人訂購數量</h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 items-end">
                    {WEDDING_GIFT_CLIENT_FLAVORS.map((f) => (
                      <div key={f.key}>{labeled(f.label, weddingGiftQtyInput(f.key))}</div>
                    ))}
                    {readOnly('客人訂購總數', bn.totalOrdered)}
                  </div>

                  <div className="grid md:grid-cols-3 gap-5 items-end">
                    {labeled(
                      '單樽容量',
                      <select
                        value={normalizeWeddingGiftBottleCapacity(fVal('bottle_capacity'))}
                        onChange={(e) => {
                          setFieldLocal('bottle_capacity', e.target.value);
                          syncWeddingGiftDerived({ bottle_capacity: e.target.value });
                        }}
                        className={softInput}
                      >
                        <option value="">—</option>
                        {WEDDING_GIFT_BOTTLE_CAPACITIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    )}
                    {labeled(
                      '單樽價格',
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={fVal('unit_bottle_price')}
                          onChange={(e) => setFieldLocal('unit_bottle_price', e.target.value)}
                          onBlur={(e) => syncWeddingGiftTotalAmount({ unit_bottle_price: e.target.value })}
                          placeholder="0.00"
                          className={`${softInput} pl-7`}
                        />
                      </div>
                    )}
                    {readOnly(
                      '總金額',
                      `$${weddingGiftTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    )}
                  </div>
                </div>

                {/* Section 2 — 實際生產 / 材料 / 包裝 */}
                <div className="border-t border-dashed border-gray-200 pt-6 space-y-5">
                  <h3 className="text-sm font-semibold text-gray-700">實際生產樽數</h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 items-end">
                    {WEDDING_GIFT_ACTUAL_FLAVORS.map((f) => {
                      const raw = fVal(f.key);
                      const display = raw !== '' ? raw : fVal(f.clientKey);
                      return (
                        <div key={f.key}>
                          {labeled(
                            f.label,
                            <input
                              type="number"
                              min={0}
                              value={display}
                              onChange={(e) => setFieldLocal(f.key, nonNeg(e.target.value))}
                              onBlur={(e) => {
                                const v = nonNeg(e.target.value);
                                setFieldLocal(f.key, v);
                                syncWeddingGiftDerived({ [f.key]: v });
                              }}
                              placeholder="0"
                              className={softInput}
                            />
                          )}
                        </div>
                      );
                    })}
                    {readOnly('實際生產總數量', computeBirdNestActualTotal(order.fields))}
                  </div>

                  <h3 className="text-sm font-semibold text-gray-700">材料</h3>
                  <div className="grid md:grid-cols-3 gap-5">
                    {WEDDING_GIFT_MATERIAL_FIELDS.slice(0, 3).map((f) => (
                      <div key={f.key}>{labeled(f.label, fInput(f.key, 'number', '0'))}</div>
                    ))}
                  </div>
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
                    {WEDDING_GIFT_MATERIAL_FIELDS.slice(3).map((f) => (
                      <div key={f.key}>
                        {labeled(
                          f.label,
                          <input
                            type="number"
                            min={0}
                            step={f.step || '1'}
                            value={fVal(f.key)}
                            onChange={(e) => setFieldLocal(f.key, nonNeg(e.target.value))}
                            onBlur={(e) => {
                              const v = nonNeg(e.target.value);
                              setFieldLocal(f.key, v);
                              patch({ fields: { [f.key]: v } });
                            }}
                            placeholder="0"
                            className={softInput}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <h3 className="text-sm font-semibold text-gray-700">包裝(蝴蝶結紗袋)</h3>
                  <div className="grid md:grid-cols-2 gap-5">
                    {WEDDING_GIFT_PACK_BOW_FIELDS.map((f) => (
                      <div key={f.key}>{labeled(f.label, fInput(f.key, 'number', '0'))}</div>
                    ))}
                  </div>
                  {packQtyMatrix('圓形tag', weddingGiftRoundTagKey)}
                  {packQtyMatrix('長方形燙金貼紙', weddingGiftFoilStickerKey)}
                  <div className="grid md:grid-cols-3 gap-5">
                    {WEDDING_GIFT_PACK_BAG_FIELDS.map((f) => (
                      <div key={f.key}>{labeled(f.label, fInput(f.key, 'number', '0'))}</div>
                    ))}
                  </div>
                  <div className="grid md:grid-cols-2 gap-5">
                    {WEDDING_GIFT_PACK_CARTON_FIELDS.map((f) => (
                      <div key={f.key}>{labeled(f.label, fInput(f.key, 'number', '0'))}</div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {orderType === 'Nestiee 燕窩訂單' && (
              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Ordered Products 訂購產品</h3>
                  {(() => {
                    const nestieeLines = getNestieeLines(order.fields);
                    if (!nestieeLines.length) {
                      return (
                        <p className="text-sm text-gray-400">
                          No store line items yet. Import from Hub / Nestiee WooCommerce to fill products and prices.
                          {order.description ? (
                            <span className="block mt-1 text-gray-500">Description: {order.description}</span>
                          ) : null}
                        </p>
                      );
                    }
                    const fmt = (n: number) =>
                      n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                    return (
                      <div className="overflow-x-auto rounded-xl border border-gray-200">
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-400">
                            <tr>
                              <th className="px-4 py-2.5 font-medium">Product</th>
                              <th className="px-4 py-2.5 font-medium text-right">Qty</th>
                              <th className="px-4 py-2.5 font-medium text-right">Unit price</th>
                              <th className="px-4 py-2.5 font-medium text-right">Line total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {nestieeLines.map((line, i) => (
                              <Fragment key={`${line.name}-${i}`}>
                                <tr className="bg-white">
                                  <td className="px-4 py-3 text-gray-900">{line.name}</td>
                                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{line.quantity}</td>
                                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmt(line.unit_price)}</td>
                                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                                    {fmt(line.line_total)}
                                  </td>
                                </tr>
                                {line.options?.length ? (
                                  <tr className="bg-gray-50/80">
                                    <td colSpan={4} className="px-4 py-2.5">
                                      <ul className="space-y-1 text-xs text-gray-600">
                                        {line.options.map((opt, oi) => (
                                          <li key={`${opt.label}-${oi}`} className="flex flex-wrap gap-x-2">
                                            <span className="font-medium text-gray-700">{opt.label}:</span>
                                            <span>{opt.value}</span>
                                            {opt.price > 0 ? (
                                              <span className="tabular-nums text-gray-500">(+{fmt(opt.price)})</span>
                                            ) : null}
                                          </li>
                                        ))}
                                      </ul>
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">所需禮盒</h3>
                  <p className="text-xs text-gray-400 mb-3">Enter how many of each gift-box type are needed for this order.</p>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {NESTIEE_GIFT_BOX_TYPES.map((box) => (
                      <div key={box.id}>
                        {labeled(
                          box.label,
                          <input
                            type="number"
                            min={0}
                            value={fVal(box.qtyKey)}
                            onChange={(e) => setFieldLocal(box.qtyKey, nonNeg(e.target.value))}
                            onBlur={(e) => {
                              const v = nonNeg(e.target.value);
                              const manualKey = nestieeGiftQtyManualKey(box.qtyKey);
                              setFieldLocal(box.qtyKey, v);
                              setFieldLocal(manualKey, 'true');
                              patch({ fields: { [box.qtyKey]: v, [manualKey]: 'true' } });
                            }}
                            placeholder="0"
                            className={softInput}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {!orderType && <p className="text-sm text-gray-400">Choose an Order Type to reveal its fields.</p>}
          </section>

          {/* BOX 2 — Payment Detail */}
          <section className="bg-white rounded-2xl border border-gray-200 p-8">
            <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold mb-1">Box 2</p>
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Payment Detail 付款詳情</h2>

            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
              {readOnly('已付總額 Current Paid', paidTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))}
              {readOnly(
                '應付金額 Amount Due',
                dueTotal != null
                  ? dueTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
                  : '—'
              )}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1.5">
                  Payment Status 付款狀態
                  <span className="text-gray-400 font-normal"> · auto</span>
                </label>
                <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5 text-sm font-semibold text-gray-900">
                  {autoStatus}
                </div>
              </div>
            </div>

            {/* First payment */}
            <div className="rounded-xl border border-gray-200 p-5 mb-6 bg-gray-50/30">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">第一次付款 First Payment</h3>
              <div className="grid md:grid-cols-[200px_1fr] gap-5">
                <div>
                  <div
                    onClick={() => payment1InputRef.current?.click()}
                    onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.[0]) handlePaymentReceipt(e.dataTransfer.files[0], 1); }}
                    onDragOver={(e) => e.preventDefault()}
                    className="border-2 border-dashed border-gray-300 rounded-xl p-3 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors h-full flex flex-col items-center justify-center min-h-[130px] bg-white"
                  >
                    <input ref={payment1InputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handlePaymentReceipt(e.target.files[0], 1); e.target.value = ''; }} />
                    {paymentPreview[1] || order.fields.payment_receipt_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={paymentPreview[1] || orderPaymentReceiptUrl(order.id, String(order.fields.payment_receipt_path || ''), 1) || ''}
                        alt="First payment receipt"
                        onClick={(e) => { e.stopPropagation(); setLightbox(paymentPreview[1] || orderPaymentReceiptUrl(order.id, String(order.fields.payment_receipt_path || ''), 1) || ''); }}
                        className="max-h-28 rounded-lg cursor-zoom-in"
                      />
                    ) : (
                      <><div className="text-2xl mb-1">🧾</div><p className="text-xs font-medium text-gray-600">付款收據 Receipt</p><p className="text-[11px] text-gray-400 mt-0.5">Drop / snap · AI auto-fills</p></>
                    )}
                  </div>
                  {paymentScanMsg[1] && <p className="text-[11px] text-brand-700 mt-2">{paymentScanMsg[1]}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 content-start">
                  {labeled(
                    '支付日期 Payment Date',
                    <input
                      type="date"
                      value={fVal('payment_date') || fVal('payment1_date')}
                      onChange={(e) => {
                        setFieldLocal('payment_date', e.target.value);
                        setFieldLocal('payment1_date', e.target.value);
                      }}
                      onBlur={(e) => patch({ fields: { payment_date: e.target.value, payment1_date: e.target.value } })}
                      className={softInput}
                    />
                  )}
                  {labeled('銀碼 Amount', paymentAmountInput('payment_amount'))}
                  {labeled('銀行 / 平台 Bank/Platform', fInput('payment_bank', 'text', 'e.g. 匯豐 / PayMe / FPS'))}
                  {paymentMethodFields(1)}
                  <div className="sm:col-span-2">{labeled('參考編號 Reference Number', fInput('payment_reference', 'text', 'Transaction / 流水號'))}</div>
                </div>
              </div>
            </div>

            {/* Second payment */}
            <div className="rounded-xl border border-gray-200 p-5 mb-6 bg-gray-50/30">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">第二次付款 Second Payment</h3>
              <div className="grid md:grid-cols-[200px_1fr] gap-5">
                <div>
                  <div
                    onClick={() => payment2InputRef.current?.click()}
                    onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.[0]) handlePaymentReceipt(e.dataTransfer.files[0], 2); }}
                    onDragOver={(e) => e.preventDefault()}
                    className="border-2 border-dashed border-gray-300 rounded-xl p-3 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors h-full flex flex-col items-center justify-center min-h-[130px] bg-white"
                  >
                    <input ref={payment2InputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handlePaymentReceipt(e.target.files[0], 2); e.target.value = ''; }} />
                    {paymentPreview[2] || order.fields.payment2_receipt_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={paymentPreview[2] || orderPaymentReceiptUrl(order.id, String(order.fields.payment2_receipt_path || ''), 2) || ''}
                        alt="Second payment receipt"
                        onClick={(e) => { e.stopPropagation(); setLightbox(paymentPreview[2] || orderPaymentReceiptUrl(order.id, String(order.fields.payment2_receipt_path || ''), 2) || ''); }}
                        className="max-h-28 rounded-lg cursor-zoom-in"
                      />
                    ) : (
                      <><div className="text-2xl mb-1">🧾</div><p className="text-xs font-medium text-gray-600">付款收據 Receipt</p><p className="text-[11px] text-gray-400 mt-0.5">Drop / snap · AI auto-fills</p></>
                    )}
                  </div>
                  {paymentScanMsg[2] && <p className="text-[11px] text-brand-700 mt-2">{paymentScanMsg[2]}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 content-start">
                  {labeled('支付日期 Payment Date', fInput('payment2_date', 'date'))}
                  {labeled('銀碼 Amount', paymentAmountInput('payment2_amount'))}
                  {labeled('銀行 / 平台 Bank/Platform', fInput('payment2_bank', 'text', 'e.g. 匯豐 / PayMe / FPS'))}
                  {paymentMethodFields(2)}
                  <div className="sm:col-span-2">{labeled('參考編號 Reference Number', fInput('payment2_reference', 'text', 'Transaction / 流水號'))}</div>
                </div>
              </div>
            </div>

            {/* Third payment */}
            <div className="rounded-xl border border-gray-200 p-5 bg-gray-50/30">
              <h3 className="text-sm font-semibold text-gray-800 mb-4">第三次付款 Third Payment</h3>
              <div className="grid md:grid-cols-[200px_1fr] gap-5">
                <div>
                  <div
                    onClick={() => payment3InputRef.current?.click()}
                    onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files?.[0]) handlePaymentReceipt(e.dataTransfer.files[0], 3); }}
                    onDragOver={(e) => e.preventDefault()}
                    className="border-2 border-dashed border-gray-300 rounded-xl p-3 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40 transition-colors h-full flex flex-col items-center justify-center min-h-[130px] bg-white"
                  >
                    <input ref={payment3InputRef} type="file" accept="image/*,application/pdf" className="hidden" onChange={(e) => { if (e.target.files?.[0]) handlePaymentReceipt(e.target.files[0], 3); e.target.value = ''; }} />
                    {paymentPreview[3] || order.fields.payment3_receipt_path ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={paymentPreview[3] || orderPaymentReceiptUrl(order.id, String(order.fields.payment3_receipt_path || ''), 3) || ''}
                        alt="Third payment receipt"
                        onClick={(e) => { e.stopPropagation(); setLightbox(paymentPreview[3] || orderPaymentReceiptUrl(order.id, String(order.fields.payment3_receipt_path || ''), 3) || ''); }}
                        className="max-h-28 rounded-lg cursor-zoom-in"
                      />
                    ) : (
                      <><div className="text-2xl mb-1">🧾</div><p className="text-xs font-medium text-gray-600">付款收據 Receipt</p><p className="text-[11px] text-gray-400 mt-0.5">Drop / snap · AI auto-fills</p></>
                    )}
                  </div>
                  {paymentScanMsg[3] && <p className="text-[11px] text-brand-700 mt-2">{paymentScanMsg[3]}</p>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 content-start">
                  {labeled('支付日期 Payment Date', fInput('payment3_date', 'date'))}
                  {labeled('銀碼 Amount', paymentAmountInput('payment3_amount'))}
                  {labeled('銀行 / 平台 Bank/Platform', fInput('payment3_bank', 'text', 'e.g. 匯豐 / PayMe / FPS'))}
                  {paymentMethodFields(3)}
                  <div className="sm:col-span-2">{labeled('參考編號 Reference Number', fInput('payment3_reference', 'text', 'Transaction / 流水號'))}</div>
                </div>
              </div>
            </div>
          </section>

          {/* Visual assets / image grid */}
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-semibold text-gray-900">Design Proofs 設計圖 / Image Preview</h2>
                {uploadMsg && <p className="text-xs text-brand-700 mt-0.5">{uploadMsg}</p>}
              </div>
              <button onClick={() => fileInputRef.current?.click()} className="text-sm text-brand-600 hover:text-brand-700 font-medium">+ Upload images / PDF</button>
              <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => { if (e.target.files?.length) uploadFiles(e.target.files); e.target.value = ''; }} />
            </div>
            {order.files.length === 0 ? (
              <div onClick={() => fileInputRef.current?.click()} className="border-2 border-dashed border-gray-300 rounded-xl p-8 text-center text-gray-400 text-sm cursor-pointer hover:border-brand-400 hover:bg-brand-50/40">
                Click to upload product design proofs (images or PDF — heavy PDFs are auto-compressed to page images)
              </div>
            ) : (
              <ul className="space-y-2">
                {order.files.map((f) => {
                  const url = orderFileUrl(f);
                  const name = f.original_name || `Image #${f.id}`;
                  const renaming = renamingFileId === f.id;
                  return (
                    <li
                      key={f.id}
                      className="flex items-center gap-3 rounded-lg border border-gray-200 bg-gray-50/80 px-3 py-2"
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={url}
                        alt={name}
                        onClick={() => setLightbox(url)}
                        className="h-14 w-14 rounded-md object-cover border border-gray-200 shrink-0 bg-white cursor-zoom-in hover:ring-2 hover:ring-brand-400"
                      />
                      {renaming ? (
                        <input
                          autoFocus
                          value={renameDraft}
                          onChange={(e) => setRenameDraft(e.target.value)}
                          onBlur={() => saveRenameFile(f.id)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              (e.target as HTMLInputElement).blur();
                            } else if (e.key === 'Escape') {
                              e.preventDefault();
                              cancelRenameFile();
                            }
                          }}
                          className="flex-1 min-w-0 rounded-md border border-brand-300 bg-white px-2 py-1.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                          aria-label={bi('Rename file', '重新命名檔案')}
                        />
                      ) : (
                        <button
                          type="button"
                          onClick={() => setLightbox(url)}
                          onDoubleClick={(e) => {
                            e.preventDefault();
                            startRenameFile(f);
                          }}
                          className="flex-1 min-w-0 text-left text-sm text-brand-700 hover:underline truncate"
                          title={bi('Double-click to rename', '雙擊重新命名')}
                        >
                          {name}
                        </button>
                      )}
                      {!renaming && (
                        <button
                          type="button"
                          onClick={() => startRenameFile(f)}
                          className="text-xs text-gray-600 hover:text-gray-800 font-medium shrink-0 px-2 py-1"
                        >
                          {bi('Rename', '重新命名')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => downloadFile(f)}
                        className="text-xs text-brand-600 hover:text-brand-700 font-medium shrink-0 px-2 py-1"
                      >
                        {bi('Download', '下載')}
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteFile(f.id)}
                        className="text-xs text-red-600 hover:text-red-700 font-medium shrink-0 px-2 py-1"
                        aria-label="Delete image"
                      >
                        {BTN.delete}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN — 30% activity feed (fixed sidebar, feed scrolls) */}
        <div className="w-full lg:w-[30%] lg:h-full">
          <ActivityFeed entityType="order" entityId={order.id} className="lg:h-full max-h-[75vh] lg:max-h-none" />
        </div>
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4 cursor-zoom-out">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="Proof" className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg shadow-2xl bg-white" />
        </div>
      )}

      {confirmPasteOpen && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-[70] p-4"
          onClick={() => setConfirmPasteOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h3 className="text-lg font-semibold text-gray-900">
                {bi('Paste confirmation', '貼上確認訊息')}
              </h3>
              <p className="text-sm text-gray-500 mt-1">
                {bi(
                  'Paste the WhatsApp / IG confirmation message. Fields will autofill; you can edit afterward.',
                  '貼上 WhatsApp / IG 確認訊息，系統會自動填入欄位，之後仍可手動修改。'
                )}
              </p>
            </div>
            <textarea
              value={confirmPasteText}
              onChange={(e) => {
                setConfirmPasteText(e.target.value);
                if (confirmPasteError) setConfirmPasteError('');
              }}
              rows={12}
              placeholder={'【📩 即食燕窩回禮 Confirmation】\n…'}
              className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm font-mono bg-gray-50/40 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none resize-y min-h-[200px]"
              autoFocus
            />
            {confirmPasteError && (
              <p className="text-sm text-red-600">{confirmPasteError}</p>
            )}
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmPasteOpen(false)}
                className="btn border border-gray-200 text-gray-700 hover:bg-gray-50 w-full sm:w-auto"
              >
                {BTN.cancel}
              </button>
              <button
                type="button"
                onClick={applyWeddingGiftConfirmation}
                disabled={!confirmPasteText.trim()}
                className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 w-full sm:w-auto"
              >
                {bi('Apply', '套用')}
              </button>
            </div>
          </div>
        </div>
      )}
      {sfModalOpen && (
        <SfExpressShipmentModal
          orderId={order.id}
          onClose={() => setSfModalOpen(false)}
          onSuccess={(updated, meta) => {
            setOrder(updated);
            setSfModalOpen(false);
            if (meta.pdfUrl) {
              window.open(meta.pdfUrl, '_blank', 'noopener,noreferrer');
            }
            if (meta.printError) {
              setQuoteToast({
                kind: 'error',
                text: bi(
                  `Waybill ${meta.waybill} saved, but label print failed: ${meta.printError}`,
                  `運單 ${meta.waybill} 已儲存，但面單列印失敗：${meta.printError}`
                ),
              });
            } else {
              setQuoteToast({
                kind: 'success',
                text: bi(
                  `SF Express waybill ${meta.waybill} created.`,
                  `已建立順豐運單 ${meta.waybill}。`
                ),
              });
            }
            setTimeout(() => setQuoteToast(null), 6000);
          }}
        />
      )}
    </AppLayout>
  );
}
