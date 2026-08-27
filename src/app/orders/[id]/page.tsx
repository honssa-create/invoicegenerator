'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import ActivityFeed from '@/components/ActivityFeed';
import CustomerSelect from '@/components/CustomerSelect';
import OrderDetailTypePanel from '@/components/orders/OrderDetailTypePanel';
import PaymentDetailSection from '@/components/orders/sections/PaymentDetailSection';
import { labeled, nonNeg, readOnly, ORDER_DETAIL_SOFT_INPUT } from '@/components/orders/order-detail-ui';
import OrderPropertyBar from '@/components/OrderPropertyBar';
import { useOrderDetail } from '@/hooks/orders/useOrderDetail';
import { orderFileUrl } from '@/lib/image-url';
import EntityAttachments from '@/components/EntityAttachments';
import {
  ORDER_SHIPPING_METHODS,
  ORDER_TYPES,
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
  parseHonourLines,
  parseHonourSuppliers,
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
import { BTN, bi } from '@/lib/ui-labels';

const SfExpressShipmentModal = dynamic(
  () => import('@/components/SfExpressShipmentModal'),
  { loading: () => null },
);

const WeddingGiftConfirmPasteModal = dynamic(
  () => import('@/components/orders/WeddingGiftConfirmPasteModal'),
  { loading: () => null },
);

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const {
    order,
    setOrder,
    loading,
    invoices,
    quotations,
    quoteToast,
    setQuoteToast,
    accountUsers,
    tagSuggestions,
    setTagSuggestions,
    supplierOptions,
    setSupplierOptions,
    nestieeGiftBoxes,
    bigDayPersistedRef,
    bigDaySavedOnChangeRef,
    patch,
    setCoreLocal,
    setFieldLocal,
    updatedAtRef,
  } = useOrderDetail(id);

  const [lightbox, setLightbox] = useState<string | null>(null);
  const [convertingQuote, setConvertingQuote] = useState(false);
  const [confirmPasteOpen, setConfirmPasteOpen] = useState(false);
  const [confirmPasteText, setConfirmPasteText] = useState('');
  const [confirmPasteError, setConfirmPasteError] = useState('');
  const [sfModalOpen, setSfModalOpen] = useState(false);

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
  const softInput = ORDER_DETAIL_SOFT_INPUT;
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

          <PaymentDetailSection
            order={order}
            dueTotal={dueTotal}
            form={{ softInput, fVal, fInput, labeled, readOnly, nonNeg, setFieldLocal, patch, setOrder }}
            onReceiptPreview={setLightbox}
          />

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
