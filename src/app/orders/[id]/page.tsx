'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import ActivityFeed from '@/components/ActivityFeed';
import CustomerSelect from '@/components/CustomerSelect';
import OrderDetailTypePanel from '@/components/orders/OrderDetailTypePanel';
import OrderPropertyBar, { type AccountUser } from '@/components/OrderPropertyBar';
import { useRefetchOnFocus } from '@/hooks/useRefetchOnFocus';
import { CONFLICT_MESSAGE, CONFLICT_MESSAGE_ZH } from '@/lib/concurrency';
import { DEFAULT_OPTIONS } from '@/lib/expenses';
import { mergeSupplierLists } from '@/lib/expense-suppliers';
import { compressImage } from '@/lib/imageCompression';
import { orderFileUrl, orderPaymentReceiptUrl } from '@/lib/image-url';
import EntityAttachments from '@/components/EntityAttachments';
import {
  ORDER_SHIPPING_METHODS,
  ORDER_TYPES,
  ORDER_PAYMENT_METHODS,
  ORDER_PAYMENT_METHOD_OTHER,
  computeBirdNestTotals,
  computeOrderPaidTotal,
  computeHonourLineTotals,
  computeWeddingGiftTotal,
  derivePaymentStatusLabel,
  ensureHonourSupplierCount,
  honourLinesDerivedFields,
  honourProductLineCount,
  honourSuppliersDerivedFields,
  computeWeddingGiftMaterials,
  computeWeddingGiftPacking,
  normalizeOrderPaymentMethod,
  parseHonourLines,
  parseHonourSuppliers,
  NESTIEE_GIFT_BOX_TYPES,
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
  type CupmokaLineItem,
  type Order,
} from '@/lib/orders';
import { displayInvoiceNumber, displayQuotationNumber } from '@/lib/record-numbering-core';
import type { Customer } from '@/lib/types';
import { parseWeddingGiftConfirmation, addCalendarDays } from '@/lib/wedding-gift-confirmation';
import { BTN, MSG, TITLE, bi } from '@/lib/ui-labels';
import {
  formatKitchenShortageConfirm,
  parseKitchenShortageResponse,
} from '@/lib/kitchen-ship-allocate';

const SfExpressShipmentModal = dynamic(
  () => import('@/components/SfExpressShipmentModal'),
  { loading: () => null },
);

const WeddingGiftConfirmPasteModal = dynamic(
  () => import('@/components/orders/WeddingGiftConfirmPasteModal'),
  { loading: () => null },
);

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
  const [nestieeGiftBoxes, setNestieeGiftBoxes] = useState(NESTIEE_GIFT_BOX_TYPES);
  /** Big Day value last persisted with derived dates (or loaded from server). */
  const bigDayPersistedRef = useRef('');
  /** Skip blur PATCH when onChange already saved this Big Day + derived dates. */
  const bigDaySavedOnChangeRef = useRef<string | null>(null);
  const patchQueueRef = useRef(Promise.resolve());
  const updatedAtRef = useRef('');
  /** Monotonic seq so an older PATCH response cannot wipe newer local edits. */
  const patchSeqRef = useRef(0);
  const patchesInFlightRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fetch(`/api/orders/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled) return;
        const o = d?.order || null;
        setOrder(o);
        if (o) {
          bigDayPersistedRef.current = String(o.fields?.big_day || '');
          bigDaySavedOnChangeRef.current = null;
          updatedAtRef.current = o.updated_at || '';
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/kitchen/catalog')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (cancelled || !d?.catalog?.giftBoxTypes) return;
        const boxes = (d.catalog.giftBoxTypes as {
          id: string;
          label: string;
          qtyKey: string;
          active?: boolean;
        }[])
          .filter((g) => g.active !== false)
          .map((g) => ({
            id: g.id,
            label: g.label,
            qtyKey: g.qtyKey || `nestiee_gift_qty_${g.id}`,
          }));
        if (boxes.length) setNestieeGiftBoxes(boxes);
      })
      .catch(() => {
        /* keep defaults */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const refetchOrder = useCallback(() => {
    if (patchesInFlightRef.current > 0) return;
    fetch(`/api/orders/${id}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (patchesInFlightRef.current > 0) return;
        const o = d?.order || null;
        if (!o) return;
        setOrder(o);
        bigDayPersistedRef.current = String(o.fields?.big_day || '');
        updatedAtRef.current = o.updated_at || '';
      })
      .catch(() => {});
  }, [id]);

  useRefetchOnFocus(refetchOrder, Boolean(id) && !loading);

  useEffect(() => {
    fetch('/api/invoices?fields=options')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setInvoices((d?.invoices || []).map((i: InvoiceOption) => ({ id: i.id, invoice_number: i.invoice_number, status: i.status }))))
      .catch(() => {});
    fetch('/api/quotations?fields=options')
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

  const patch = (payload: {
    core?: Record<string, unknown>;
    fields?: Record<string, unknown>;
    linked_invoice_id?: string | number | null;
    linked_quotation_id?: string | number | null;
    skip_kitchen_allocation?: boolean;
  }, opts?: { revertStatusTo?: string }) => {
    const seq = ++patchSeqRef.current;
    patchesInFlightRef.current += 1;
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
    patchQueueRef.current = patchQueueRef.current.then(async () => {
      try {
        const res = await fetch(`/api/orders/${id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            ...payload,
            expected_updated_at: updatedAtRef.current || undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.order) {
          updatedAtRef.current = data.order.updated_at || '';
          // Skip full replace when a newer local patch already updated the UI.
          if (seq === patchSeqRef.current) {
            setOrder(data.order);
            bigDayPersistedRef.current = String(data.order.fields?.big_day || '');
          }
          return;
        }
        const shortages = parseKitchenShortageResponse(data);
        if (res.status === 409 && shortages) {
          const shipAnyway = window.confirm(formatKitchenShortageConfirm(shortages));
          if (shipAnyway) {
            patch({ ...payload, skip_kitchen_allocation: true }, opts);
          } else if (opts?.revertStatusTo != null) {
            setCoreLocal('status', opts.revertStatusTo);
          }
          return;
        }
        if (res.status === 409) {
          if (data.order) {
            setOrder(data.order);
            bigDayPersistedRef.current = String(data.order.fields?.big_day || '');
            updatedAtRef.current = data.order.updated_at || '';
          } else {
            refetchOrder();
          }
          setQuoteToast({
            text: bi(CONFLICT_MESSAGE, CONFLICT_MESSAGE_ZH),
            kind: 'error',
          });
        } else if (!res.ok) {
          if (opts?.revertStatusTo != null) setCoreLocal('status', opts.revertStatusTo);
          setQuoteToast({
            text: (data as { error?: string }).error || MSG.saveFailed,
            kind: 'error',
          });
        }
      } catch {
        if (opts?.revertStatusTo != null) setCoreLocal('status', opts.revertStatusTo);
        setQuoteToast({ text: MSG.saveFailed, kind: 'error' });
      } finally {
        patchesInFlightRef.current = Math.max(0, patchesInFlightRef.current - 1);
      }
    });
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
      setQuoteToast({ text: `Created ${displayQuotationNumber(data.quote_number)}`, kind: 'success' });
      const orderRes = await fetch(`/api/orders/${id}`);
      const orderData = await orderRes.json();
      if (orderData.order) {
        setOrder(orderData.order);
        updatedAtRef.current = orderData.order.updated_at || '';
      }
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

  /** Keep status-bar receipt date and Shipment 客人收貨日期 in sync. */
  const setLinkedDeliveryDatesLocal = (next: string) =>
    setOrder((o) =>
      o
        ? {
            ...o,
            fields: {
              ...o.fields,
              due_date: next,
              client_delivery_date: next,
            },
          }
        : o
    );
  const commitLinkedDeliveryDates = (next: string) => {
    setLinkedDeliveryDatesLocal(next);
    patch({ fields: { due_date: next, client_delivery_date: next } });
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
        <div className="page-header">
          <div>
            <div className="h-8 w-48 bg-gray-200 rounded animate-pulse" />
            <div className="h-4 w-64 bg-gray-100 rounded mt-2 animate-pulse" />
          </div>
        </div>
        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 h-96 bg-gray-100 rounded-xl animate-pulse" />
          <div className="h-96 bg-gray-100 rounded-xl animate-pulse" />
        </div>
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

  const applyCustomerFromList = (c: Customer) => {
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            name: c.name,
            phone: c.phone || '',
            customer_email: c.email || '',
            shipping_address: c.address || '',
            fields: {
              ...prev.fields,
              company_name: c.company_name || '',
              ...(c.ordered ? { order_type: c.ordered } : {}),
            },
          }
        : prev
    );
    patch({
      core: {
        name: c.name,
        phone: c.phone || null,
        customer_email: c.email || null,
        shipping_address: c.address || null,
      },
      fields: {
        company_name: c.company_name || '',
        ...(c.ordered ? { order_type: c.ordered } : {}),
      },
    });
  };

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
        productLines: honourLines,
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

  const payment3FieldKeys = [
    'payment3_amount',
    'payment3_date',
    'payment3_bank',
    'payment3_reference',
    'payment3_receipt_path',
    'payment3_method_detail',
    'payment3_method_note',
  ] as const;
  const hasPayment3Content =
    Boolean(paymentPreview[3]) ||
    payment3FieldKeys.some((k) => String(order.fields[k] ?? '').trim());
  const showPayment3 =
    hasPayment3Content ||
    order.fields.payment3_enabled === true ||
    String(order.fields.payment3_enabled ?? '').trim() === 'true';

  const applyAmountAndStatus = (key: 'payment_amount' | 'payment2_amount' | 'payment3_amount', value: string) => {
    let fields: Record<string, string> = {};
    setOrder((prev) => {
      if (!prev) return prev;
      fields = { [key]: value };
      if (key === 'payment_amount') fields.payment1_amount = value;
      const nextFields = { ...prev.fields, ...fields };
      const paid = computeOrderPaidTotal(nextFields);
      fields.payment_status_label = derivePaymentStatusLabel(paid, dueTotal);
      return { ...prev, fields: { ...prev.fields, ...fields } };
    });
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
      <label className="block text-xs font-medium text-gray-900 mb-1.5">
        {label}
        {hint ? <span className="text-gray-400 font-normal"> · {hint}</span> : null}
      </label>
      {node}
    </div>
  );
  const readOnly = (label: string, value: React.ReactNode) => (
    <div className="rounded-lg bg-gray-50 border border-gray-100 px-3 py-2.5">
      <p className="text-[11px] uppercase tracking-wide text-gray-900">{label}</p>
      <p className="text-lg font-semibold text-gray-900 leading-tight mt-0.5">{value}</p>
    </div>
  );
  const bn = computeBirdNestTotals(order.fields);

  const commitHonourLines = (lines: HonourLineItem[]) => {
    let patchPayload: {
      fields: Record<string, string>;
      core?: { total_amount: number };
    } | null = null;
    setOrder((prev) => {
      if (!prev) return prev;
      const derived = honourLinesDerivedFields(lines);
      const { totalAmount } = computeHonourLineTotals(lines);
      const productCount = honourProductLineCount(lines);
      const currentSuppliers = parseHonourSuppliers(prev.fields, {
        minCount: 1,
        cartonCountCore: prev.carton_count,
        productLines: lines,
      });
      const padded = ensureHonourSupplierCount(currentSuppliers, productCount);
      const supplierDerived =
        padded.length !== currentSuppliers.length ? honourSuppliersDerivedFields(padded) : {};
      patchPayload = {
        fields: { ...derived, ...supplierDerived },
        ...(totalAmount > 0 ? { core: { total_amount: totalAmount } } : {}),
      };
      return {
        ...prev,
        fields: { ...prev.fields, ...derived, ...supplierDerived },
        total_amount: totalAmount > 0 ? totalAmount : prev.total_amount,
      };
    });
    if (patchPayload) patch(patchPayload);
  };

  const commitCupmokaLines = (lines: CupmokaLineItem[]) => {
    const serialized = JSON.stringify(lines);
    const totalAmount = Math.round(
      lines.reduce((sum, line) => sum + (Number(line.line_total) || 0), 0) * 100
    ) / 100;
    setOrder((prev) =>
      prev
        ? {
            ...prev,
            fields: { ...prev.fields, cupmoka_lines: serialized },
            total_amount: totalAmount > 0 ? totalAmount : prev.total_amount,
          }
        : prev
    );
    patch({
      fields: { cupmoka_lines: serialized },
      ...(totalAmount > 0 ? { core: { total_amount: totalAmount } } : {}),
    });
  };

  /** Apply supplier-card edits from latest order state (avoids stale rapid-click overwrites). */
  const applyHonourSuppliers = (
    updater: (suppliers: HonourSupplierItem[]) => HonourSupplierItem[],
    commit: boolean,
  ) => {
    // Declared without a null initializer so TS does not permanently narrow to `null`
    // (assignments inside setState updaters are invisible to control-flow analysis).
    let toCommit: HonourSupplierItem[] | undefined;
    setOrder((prev) => {
      if (!prev) return prev;
      const orderType = String(prev.fields.order_type ?? '');
      if (!isBadgeOrderType(orderType)) return prev;
      const lines = parseHonourLines(prev.fields);
      const current = parseHonourSuppliers(prev.fields, {
        minCount: honourProductLineCount(lines),
        cartonCountCore: prev.carton_count,
        productLines: lines,
      });
      const next = updater(current);
      const derived = honourSuppliersDerivedFields(next);
      const firstCarton = next[0]?.carton_count ?? '';
      if (commit) toCommit = next;
      return {
        ...prev,
        fields: { ...prev.fields, ...derived },
        carton_count: firstCarton,
      };
    });
    if (toCommit) {
      const derived = honourSuppliersDerivedFields(toCommit);
      patch({
        fields: derived,
        core: { carton_count: toCommit[0]?.carton_count ?? '' },
      });
    }
  };

  const syncWeddingGiftTotalAmount = (fieldsPatch: Record<string, string> = {}) => {
    let patchPayload: { fields: Record<string, string>; core?: { total_amount: number } } | null = null;
    setOrder((prev) => {
      if (!prev) return prev;
      const nextFields = { ...prev.fields, ...fieldsPatch };
      const total = computeWeddingGiftTotal(nextFields);
      patchPayload =
        total > 0
          ? { fields: fieldsPatch, core: { total_amount: total } }
          : Object.keys(fieldsPatch).length
            ? { fields: fieldsPatch }
            : null;
      return total > 0 ? { ...prev, total_amount: total } : prev;
    });
    if (patchPayload) patch(patchPayload);
  };

  /** Recalc 材料 + 包裝 from capacity / flavor qtys; keeps fields editable afterward. */
  const syncWeddingGiftDerived = (fieldsPatch: Record<string, string> = {}) => {
    let patchPayload: { fields: Record<string, string>; core?: { total_amount: number } } | null = null;
    setOrder((prev) => {
      if (!prev) return prev;
      const nextFields = { ...prev.fields, ...fieldsPatch };
      const materials = computeWeddingGiftMaterials(nextFields);
      const packing = computeWeddingGiftPacking(nextFields);
      const derived = { ...fieldsPatch, ...materials, ...packing };
      const total = computeWeddingGiftTotal(nextFields);
      patchPayload =
        total > 0
          ? { fields: derived, core: { total_amount: total } }
          : { fields: derived };
      return {
        ...prev,
        fields: { ...prev.fields, ...derived },
        ...(total > 0 ? { total_amount: total } : {}),
      };
    });
    if (patchPayload) patch(patchPayload);
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

  const openConfirmPaste = () => {
    setConfirmPasteText('');
    setConfirmPasteError('');
    setConfirmPasteOpen(true);
  };

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
                <p className="text-[11px] uppercase tracking-wide text-gray-900">{bi('Total', '總額')}</p>
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
              paymentStatusLabel={autoStatus}
              dueDate={parseOrderDueDateField(order.fields)}
              assigneeIds={parseAssigneeIds(order.fields)}
              tags={parseOrderTags(order.fields)}
              users={accountUsers}
              tagSuggestions={tagSuggestions}
              onStatusChange={(next) => {
                const prev = order.status;
                setCoreLocal('status', next);
                patch({ core: { status: next } }, { revertStatusTo: prev });
              }}
              onDueDateChange={(next) => {
                commitLinkedDeliveryDates(next);
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
              <label className="block text-xs font-medium text-gray-900 mb-1">Notes 備註</label>
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
                      🔗 {displayQuotationNumber(order.linked_quotation.quote_number)} · {order.linked_quotation.status}
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
                    {quotations.map((q) => <option key={q.id} value={q.id}>{displayQuotationNumber(q.quote_number)} · {q.status}</option>)}
                  </select>
                </div>
              )}
              {labeled(
                'Invoice 發票',
                <div className="space-y-2">
                  {order.linked_invoice ? (
                    <Link href={`/invoices/${order.linked_invoice.id}`} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-brand-50 text-brand-700 text-sm font-medium hover:bg-brand-100">
                      🔗 {displayInvoiceNumber(order.linked_invoice.invoice_number)} · {order.linked_invoice.status}
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
                    {invoices.map((inv) => <option key={inv.id} value={inv.id}>{displayInvoiceNumber(inv.invoice_number)} · {inv.status}</option>)}
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
                <label className="block text-xs font-medium text-gray-900 mb-1">Name 客戶</label>
                <CustomerSelect
                  value={order.name}
                  orderType={fVal('order_type')}
                  requireOrderType
                  onSelect={applyCustomerFromList}
                  placeholder={bi('Select or add customer…', '選擇或新增客戶…')}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-900 mb-1">公司名</label>
                <input
                  value={fVal('company_name')}
                  onChange={(e) => setFieldLocal('company_name', e.target.value)}
                  onBlur={(e) => patch({ fields: { company_name: e.target.value } })}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-900 mb-1">電話 Phone</label>
                <input value={order.phone} onChange={(e) => setCoreLocal('phone', e.target.value)} onBlur={(e) => patch({ core: { phone: e.target.value } })} placeholder="+852…" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-900 mb-1">E-mail</label>
                <input value={order.customer_email} onChange={(e) => setCoreLocal('customer_email', e.target.value)} onBlur={(e) => patch({ core: { customer_email: e.target.value } })} placeholder="name@email.com" className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-brand-500 outline-none text-sm" />
              </div>
            </div>
          </div>

          {/* BOX 3 — Shipment Detail */}
          <section className="bg-white rounded-2xl border border-gray-200 p-8">
            <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold mb-1">Box 3</p>
            <h2 className="text-lg font-semibold text-gray-900 mb-6">Shipment Detail 送貨詳情</h2>
            <div className="grid md:grid-cols-2 gap-5">
              {labeled(
                '客人收貨日期',
                <input
                  type="date"
                  value={parseOrderDueDateField(order.fields)}
                  onChange={(e) => setLinkedDeliveryDatesLocal(e.target.value)}
                  onBlur={(e) => commitLinkedDeliveryDates(e.target.value)}
                  className={softInput}
                />
              )}
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
                    {ORDER_SHIPPING_METHODS.map((o) => (
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

            <OrderDetailTypePanel
              orderType={orderType}
              order={order}
              form={{ softInput, fVal, fInput, labeled, readOnly, nonNeg, setFieldLocal, patch, setOrder }}
              honourLines={honourLines}
              honourTotals={honourTotals}
              honourSuppliers={honourSuppliers}
              supplierOptions={supplierOptions}
              setSupplierOptions={setSupplierOptions}
              commitHonourLines={commitHonourLines}
              applyHonourSuppliers={applyHonourSuppliers}
              weddingGiftTotal={weddingGiftTotal}
              birdNestTotals={bn}
              bigDayPersistedRef={bigDayPersistedRef}
              bigDaySavedOnChangeRef={bigDaySavedOnChangeRef}
              onOpenConfirmPaste={openConfirmPaste}
              syncWeddingGiftDerived={syncWeddingGiftDerived}
              syncWeddingGiftTotalAmount={syncWeddingGiftTotalAmount}
              nestieeGiftBoxes={nestieeGiftBoxes}
              commitCupmokaLines={commitCupmokaLines}
            />

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
                <label className="block text-xs font-medium text-gray-900 mb-1.5">
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
              <h3 className="text-sm font-semibold text-gray-800 mb-4">第一期付款 First Payment</h3>
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
                      <><div className="text-2xl mb-1">🧾</div><p className="text-xs font-medium text-gray-900">付款收據 Receipt</p><p className="text-[11px] text-gray-400 mt-0.5">Drop / snap · AI auto-fills</p></>
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
              <h3 className="text-sm font-semibold text-gray-800 mb-4">第二期付款 Second Payment</h3>
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
                      <><div className="text-2xl mb-1">🧾</div><p className="text-xs font-medium text-gray-900">付款收據 Receipt</p><p className="text-[11px] text-gray-400 mt-0.5">Drop / snap · AI auto-fills</p></>
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

            {/* Third payment — hidden until enabled or existing data */}
            {showPayment3 ? (
              <div className="rounded-xl border border-gray-200 p-5 bg-gray-50/30">
                <div className="flex items-center justify-between gap-3 mb-4">
                  <h3 className="text-sm font-semibold text-gray-800">第三期付款 Third Payment</h3>
                  {!hasPayment3Content ? (
                    <button
                      type="button"
                      onClick={() => {
                        setFieldLocal('payment3_enabled', '');
                        patch({ fields: { payment3_enabled: '' } });
                      }}
                      className="text-sm text-gray-500 hover:text-red-600"
                    >
                      {bi('Remove', '移除')}
                    </button>
                  ) : null}
                </div>
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
                        <><div className="text-2xl mb-1">🧾</div><p className="text-xs font-medium text-gray-900">付款收據 Receipt</p><p className="text-[11px] text-gray-400 mt-0.5">Drop / snap · AI auto-fills</p></>
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
            ) : (
              <button
                type="button"
                onClick={() => {
                  setFieldLocal('payment3_enabled', 'true');
                  patch({ fields: { payment3_enabled: 'true' } });
                }}
                className="w-full rounded-xl border border-dashed border-gray-300 px-4 py-3 text-sm font-medium text-brand-600 hover:border-brand-400 hover:bg-brand-50/40 transition-colors"
              >
                + {bi('Add third payment', '新增第三期付款')}
              </button>
            )}
          </section>

          <EntityAttachments
            className="bg-white rounded-xl border border-gray-200 p-6"
            title="Design Proofs 設計圖 / Image Preview"
            files={order.files}
            fileUrl={orderFileUrl}
            uploadUrl={`/api/orders/${id}/files`}
            fileApiBase="/api/order-files"
            thumbnailFileId={order.fields.thumbnail_file_id}
            onFilesChange={(files) => setOrder((o) => (o ? { ...o, files } : o))}
            onSetThumbnail={(fileId) => {
              setOrder((o) =>
                o
                  ? {
                      ...o,
                      fields: {
                        ...o.fields,
                        thumbnail_file_id: fileId ? String(fileId) : '',
                      },
                    }
                  : o
              );
              patch({ fields: { thumbnail_file_id: fileId ? String(fileId) : '' } });
            }}
          />
        </div>

        {/* RIGHT COLUMN — 30% activity feed (fixed sidebar, feed scrolls) */}
        <div className="w-full lg:w-[30%] lg:h-full">
          <ActivityFeed entityType="order" entityId={order.id} className="lg:h-full max-h-[75vh] lg:max-h-none" />
        </div>
      </div>

      {lightbox && (
        <div onClick={() => setLightbox(null)} className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4 cursor-zoom-out">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={lightbox} alt="" className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg shadow-2xl bg-white" />
        </div>
      )}

      <WeddingGiftConfirmPasteModal
        open={confirmPasteOpen}
        text={confirmPasteText}
        error={confirmPasteError}
        onClose={() => setConfirmPasteOpen(false)}
        onTextChange={(text) => {
          setConfirmPasteText(text);
          if (confirmPasteError) setConfirmPasteError('');
        }}
        onApply={applyWeddingGiftConfirmation}
      />
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
