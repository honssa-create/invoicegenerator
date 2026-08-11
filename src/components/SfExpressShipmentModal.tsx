'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Order } from '@/lib/orders';
import {
  validateSfExpressForm,
  type SfExpressFormState,
  type SfExpressSenderInfo,
} from '@/lib/sf-express-form';
import { BTN, bi } from '@/lib/ui-labels';

const inputCls =
  'w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm bg-gray-50/40 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none transition-colors';

interface Props {
  orderId: number;
  onClose: () => void;
  onSuccess: (order: Order, meta: { waybill: string; pdfUrl: string | null; printError: string | null }) => void;
}

export default function SfExpressShipmentModal({ orderId, onClose, onSuccess }: Props) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [configured, setConfigured] = useState(true);
  const [existingTrackingNo, setExistingTrackingNo] = useState('');
  const [sender, setSender] = useState<SfExpressSenderInfo>({
    company: '',
    contact: '',
    tel: '',
    address: '',
  });
  const [form, setForm] = useState<SfExpressFormState | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(`/api/orders/${orderId}/sf-express`);
        const data = await res.json();
        if (!res.ok) {
          if (!cancelled) setError(data.error || 'Failed to load SF Express form');
          return;
        }
        if (cancelled) return;
        setConfigured(Boolean(data.configured));
        setSender(data.sender || { company: '', contact: '', tel: '', address: '' });
        setExistingTrackingNo(data.existingTrackingNo || '');
        setForm(data.form as SfExpressFormState);
      } catch {
        if (!cancelled) setError('Failed to load SF Express form');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [orderId]);

  const setField = <K extends keyof SfExpressFormState>(key: K, value: SfExpressFormState[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  };

  const submit = async () => {
    if (!form) return;
    setError('');
    const validationError = validateSfExpressForm(form);
    if (validationError) {
      setError(validationError);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/orders/${orderId}/sf-express`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'SF Express request failed');
        return;
      }
      onSuccess(data.order as Order, {
        waybill: data.waybill as string,
        pdfUrl: (data.pdfUrl as string | null) || null,
        printError: (data.printError as string | null) || null,
      });
    } catch {
      setError('SF Express request failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel sm:max-w-2xl max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold">
              SF Express 順豐
            </p>
            <h2 className="text-xl font-bold text-gray-900 mt-1">
              {bi('Create SF Express shipment', '建立順豐運單')}
            </h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {bi('Creates a waybill and opens the cloud-print label PDF.', '建立運單並開啟雲列印面單 PDF。')}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1"
            aria-label={BTN.close}
          >
            ✕
          </button>
        </div>

        {loading || !form ? (
          <div className="py-12 flex justify-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
          </div>
        ) : (
          <div className="space-y-5">
            {!configured && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {bi(
                  'SF Express is not fully configured. An admin must fill partner ID, checkword, monthly card, and sender under ',
                  '尚未完整設定順豐。請管理員於 '
                )}
                <Link href="/settings" className="font-semibold underline">
                  {bi('Settings → API Integrations', '設定 → API 整合')}
                </Link>
                {bi('.', ' 填寫。')}
              </div>
            )}

            {existingTrackingNo ? (
              <div className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm text-orange-900">
                {bi(
                  `This order already has tracking ${existingTrackingNo}. Submitting may reuse or conflict depending on the SF order ID.`,
                  `此訂單已有運單號 ${existingTrackingNo}。若客戶訂單號相同，順豐可能回傳原運單。`
                )}
              </div>
            ) : null}

            <section className="rounded-xl border border-gray-200 p-4 bg-gray-50/60">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 mb-3">
                {bi('Sender (from Settings)', '寄件人（來自設定）')}
              </p>
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm text-gray-800">
                <div>
                  <dt className="text-xs text-gray-500">Company</dt>
                  <dd>{sender.company || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Contact</dt>
                  <dd>{sender.contact || '—'}</dd>
                </div>
                <div>
                  <dt className="text-xs text-gray-500">Phone</dt>
                  <dd>{sender.tel || '—'}</dd>
                </div>
                <div className="sm:col-span-2">
                  <dt className="text-xs text-gray-500">Address</dt>
                  <dd className="whitespace-pre-wrap">{sender.address || '—'}</dd>
                </div>
              </dl>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-gray-500">Customer Order ID</label>
                <input
                  className={`${inputCls} mt-1`}
                  value={form.orderId}
                  onChange={(e) => setField('orderId', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Recipient Name 收件人</label>
                <input
                  className={`${inputCls} mt-1`}
                  value={form.recipientName}
                  onChange={(e) => setField('recipientName', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Recipient Phone</label>
                <input
                  className={`${inputCls} mt-1`}
                  value={form.recipientPhone}
                  onChange={(e) => setField('recipientPhone', e.target.value)}
                />
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-gray-500">Recipient Address</label>
                <textarea
                  className={`${inputCls} mt-1`}
                  rows={3}
                  value={form.recipientAddress}
                  onChange={(e) => setField('recipientAddress', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Country</label>
                <input
                  className={`${inputCls} mt-1`}
                  value={form.country}
                  onChange={(e) => setField('country', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Cargo Name 托寄物</label>
                <input
                  className={`${inputCls} mt-1`}
                  value={form.cargoName}
                  onChange={(e) => setField('cargoName', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Parcel Qty 件數</label>
                <input
                  className={`${inputCls} mt-1`}
                  type="number"
                  min={1}
                  value={form.parcelQty}
                  onChange={(e) => setField('parcelQty', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Weight (kg)</label>
                <input
                  className={`${inputCls} mt-1`}
                  type="number"
                  min={0.1}
                  step={0.1}
                  value={form.weightKg}
                  onChange={(e) => setField('weightKg', e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Pay Method</label>
                <select
                  className={`${inputCls} mt-1`}
                  value={form.payMethod}
                  onChange={(e) => setField('payMethod', e.target.value)}
                >
                  <option value="1">1 — 寄方付</option>
                  <option value="2">2 — 收方付</option>
                  <option value="3">3 — 第三方付</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-medium text-gray-500">Express Type ID</label>
                <select
                  className={`${inputCls} mt-1`}
                  value={form.expressTypeId}
                  onChange={(e) => setField('expressTypeId', e.target.value)}
                >
                  <option value="1">1 — 顺丰特快</option>
                  <option value="2">2 — 顺丰标快</option>
                  <option value="6">6 — 顺丰即日</option>
                  {!['1', '2', '6', ''].includes(form.expressTypeId) && (
                    <option value={form.expressTypeId}>{form.expressTypeId} — custom</option>
                  )}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-xs font-medium text-gray-500">Remark</label>
                <input
                  className={`${inputCls} mt-1`}
                  value={form.remark}
                  onChange={(e) => setField('remark', e.target.value)}
                />
              </div>
            </div>

            {error ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </div>
            ) : null}

            <div className="flex flex-col sm:flex-row justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={onClose}
                className="btn border border-gray-200 text-gray-700 hover:bg-gray-50 w-full sm:w-auto"
              >
                {BTN.cancel}
              </button>
              <button
                type="button"
                onClick={submit}
                disabled={submitting || !configured}
                className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50 w-full sm:w-auto"
              >
                {submitting
                  ? bi('Creating…', '建立中…')
                  : bi('Create & Print Label', '建立並列印面單')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
