'use client';

import { useRef, useState } from 'react';
import { compressImage } from '@/lib/imageCompression';
import { orderPaymentReceiptUrl } from '@/lib/image-url';
import {
  ORDER_PAYMENT_METHODS,
  ORDER_PAYMENT_METHOD_OTHER,
  computeOrderDueTotal,
  computeOrderPaidTotal,
  derivePaymentStatusLabel,
  normalizeOrderPaymentMethod,
  type Order,
} from '@/lib/orders';
import { MSG, bi } from '@/lib/ui-labels';
import type { OrderDetailFormHelpers } from '../order-detail-types';
import { labeled, readOnly } from '../order-detail-ui';

interface Props {
  order: Order;
  dueTotal: number | null;
  form: OrderDetailFormHelpers;
  onReceiptPreview: (url: string) => void;
}

export default function PaymentDetailSection({ order, dueTotal, form, onReceiptPreview }: Props) {
  const { softInput, fVal, fInput, setFieldLocal, patch, setOrder } = form;

  const payment1InputRef = useRef<HTMLInputElement>(null);
  const payment2InputRef = useRef<HTMLInputElement>(null);
  const payment3InputRef = useRef<HTMLInputElement>(null);
  const [paymentPreview, setPaymentPreview] = useState<{ 1?: string; 2?: string; 3?: string }>({});
  const [paymentScanMsg, setPaymentScanMsg] = useState<{ 1?: string; 2?: string; 3?: string }>({});

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
          </select>,
        )}
        {showNote ? (
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
              />,
            )}
          </div>
        ) : null}
      </>
    );
  };

  const handlePaymentReceipt = async (rawFile: File, slot: 1 | 2 | 3) => {
    setPaymentScanMsg((m) => ({ ...m, [slot]: 'Compressing & scanning receipt…' }));
    let file = rawFile;
    try {
      if (rawFile.type === 'application/pdf') {
        const { compressPdfToImages } = await import('@/lib/pdfCompression');
        const pages = await compressPdfToImages(rawFile, { quality: 0.65, maxWidthOrHeight: 1600 });
        if (pages[0]) file = pages[0];
      } else {
        const c = await compressImage(rawFile, {
          maxDim: 1600,
          targetBytes: 300 * 1024,
          mimeType: 'image/jpeg',
          quality: 0.65,
        });
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
      const nextFields = { ...(order.fields || {}), ...upd };
      const paid = computeOrderPaidTotal(nextFields);
      const due = computeOrderDueTotal({
        ...order,
        fields: nextFields,
      });
      upd.payment_status_label = derivePaymentStatusLabel(paid, due);
      setOrder((o) => (o ? { ...o, fields: { ...o.fields, ...upd } } : o));
      patch({ fields: upd });
      const via = r.source === 'ai' ? 'AI vision (Gemini)' : 'on-device OCR';
      const found = [
        r.payment_date && 'date',
        r.amount != null && 'amount',
        r.bank && 'bank',
        r.method && 'method',
        r.reference && 'ref',
      ].filter(Boolean);
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

  const previewReceipt = (slot: 1 | 2 | 3, pathKey: 'payment_receipt_path' | 'payment2_receipt_path' | 'payment3_receipt_path') => {
    const url =
      paymentPreview[slot] ||
      orderPaymentReceiptUrl(order.id, String(order.fields[pathKey] || ''), slot) ||
      '';
    if (url) onReceiptPreview(url);
  };

  return (
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
                        onClick={(e) => { e.stopPropagation(); previewReceipt(1, 'payment_receipt_path'); }}
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
                        onClick={(e) => { e.stopPropagation(); previewReceipt(2, 'payment2_receipt_path'); }}
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
                          onClick={(e) => { e.stopPropagation(); previewReceipt(3, 'payment3_receipt_path'); }}
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
  );
}
