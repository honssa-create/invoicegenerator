'use client';

import Link from 'next/link';
import DebitNotePaymentOptions from '@/components/DebitNotePaymentOptions';
import { bi } from '@/lib/ui-labels';
import {
  baseRentLineLabel,
  formatMoney,
  formatUtilityAmount,
  utilityLineLabel,
  type DebitNotePaymentTemplateId,
  type RentRecord,
  type RentalUnit,
} from '@/lib/rentals';
import { RENTAL_DETAIL_INPUT_CLS } from '@/lib/rental-unit-detail-shared';
import RentalDetailModal from '@/components/rentals/RentalDetailModal';

interface Props {
  open: boolean;
  rec: RentRecord;
  unit: RentalUnit;
  period: string;
  baseRent: string;
  waterFee: string;
  electricityFee: string;
  waterPeriodFrom: string;
  waterPeriodTo: string;
  electricityPeriodFrom: string;
  electricityPeriodTo: string;
  baseRentPeriodFrom: string;
  baseRentPeriodTo: string;
  invoiceTo: string;
  setInvoiceTo: (v: string) => void;
  invoiceSubject: string;
  setInvoiceSubject: (v: string) => void;
  invoiceBody: string;
  setInvoiceBody: (v: string) => void;
  invoiceNote: string;
  setInvoiceNote: (v: string) => void;
  invoicePaymentTemplate: DebitNotePaymentTemplateId;
  setInvoicePaymentTemplate: (v: DebitNotePaymentTemplateId) => void;
  invoicePaymentRemark: string;
  setInvoicePaymentRemark: (v: string) => void;
  hasPersistedRecord: boolean;
  busy: boolean;
  onClose: () => void;
  onSend: () => void;
}

export default function RentalInvoiceModal({
  open,
  rec,
  unit,
  period,
  baseRent,
  waterFee,
  electricityFee,
  waterPeriodFrom,
  waterPeriodTo,
  electricityPeriodFrom,
  electricityPeriodTo,
  baseRentPeriodFrom,
  baseRentPeriodTo,
  invoiceTo,
  setInvoiceTo,
  invoiceSubject,
  setInvoiceSubject,
  invoiceBody,
  setInvoiceBody,
  invoiceNote,
  setInvoiceNote,
  invoicePaymentTemplate,
  setInvoicePaymentTemplate,
  invoicePaymentRemark,
  setInvoicePaymentRemark,
  hasPersistedRecord,
  busy,
  onClose,
  onSend,
}: Props) {
  if (!open) return null;

  const inp = RENTAL_DETAIL_INPUT_CLS;

  return (
    <RentalDetailModal title="Send Invoice 發送租金單" onClose={onClose}>
      <div className="space-y-4">
        <div className="rounded-xl bg-gray-50 border border-gray-200 p-4 text-sm">
          <p className="font-semibold text-gray-700 mb-2">Bill Summary</p>
          <div className="space-y-1">
            <div className="flex justify-between text-brand-700 gap-2">
              <span className="text-xs">
                {baseRentLineLabel({ ...rec, billingPeriod: period, baseRentPeriodFrom, baseRentPeriodTo })}
              </span>
              <span className="font-medium shrink-0">{formatMoney(Number(baseRent) || rec.baseRent)}</span>
            </div>
            <div className="flex justify-between text-blue-700">
              <span>
                {utilityLineLabel('water', {
                  waterPeriodFrom,
                  waterPeriodTo,
                  electricityPeriodFrom: '',
                  electricityPeriodTo: '',
                })}
              </span>
              <span>{formatUtilityAmount(Number(waterFee))}</span>
            </div>
            <div className="flex justify-between text-yellow-700">
              <span>
                {utilityLineLabel('electricity', {
                  waterPeriodFrom: '',
                  waterPeriodTo: '',
                  electricityPeriodFrom,
                  electricityPeriodTo,
                })}
              </span>
              <span>{formatUtilityAmount(Number(electricityFee))}</span>
            </div>
            <div className="flex justify-between font-bold border-t pt-1 mt-1">
              <span>Total</span>
              <span className="text-lg">
                {formatMoney((Number(baseRent) || rec.baseRent) + Number(waterFee) + Number(electricityFee))}
              </span>
            </div>
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{bi('To', '收件人')}</label>
          <input
            type="email"
            className={inp}
            value={invoiceTo}
            onChange={(e) => setInvoiceTo(e.target.value)}
            placeholder="tenant@email.com"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{bi('Subject', '主旨')}</label>
          <input type="text" className={inp} value={invoiceSubject} onChange={(e) => setInvoiceSubject(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">{bi('Body', '內文')}</label>
          <textarea
            className={`${inp} font-mono text-xs`}
            rows={10}
            value={invoiceBody}
            onChange={(e) => setInvoiceBody(e.target.value)}
          />
          <p className="text-[11px] text-gray-400 mt-0.5">
            {bi('Edit before sending. Same flow as invoice payment reminders.', '發送前可編輯。與發票催款郵件相同流程。')}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-3">
          <p className="text-[11px] font-semibold text-gray-500 uppercase tracking-wide mb-2">{bi('Preview', '預覽')}</p>
          <p className="text-xs text-gray-500 mb-1">
            <span className="font-medium text-gray-700">{bi('To', '收件人')}:</span> {invoiceTo || '—'}
          </p>
          <p className="text-xs text-gray-500 mb-2">
            <span className="font-medium text-gray-700">{bi('Subject', '主旨')}:</span> {invoiceSubject || '—'}
          </p>
          <div className="text-sm text-gray-800 whitespace-pre-wrap border-t border-gray-100 pt-2 max-h-48 overflow-y-auto">
            {invoiceBody || '—'}
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {bi('Stored invoice note (optional)', '儲存於租金單的備註（選填）')}
          </label>
          <textarea
            className={inp}
            rows={2}
            value={invoiceNote}
            onChange={(e) => setInvoiceNote(e.target.value)}
            placeholder={`Dear ${unit.tenantName},…`}
          />
        </div>
        <DebitNotePaymentOptions
          templateId={invoicePaymentTemplate}
          onTemplateId={setInvoicePaymentTemplate}
          manualRemark={invoicePaymentRemark}
          onManualRemark={setInvoicePaymentRemark}
          showPreview
        />
        <div className="flex justify-between gap-3 flex-wrap">
          <div className="flex gap-2 flex-wrap">
            {hasPersistedRecord && (
              <Link
                href={`/rentals/records/${rec.id}/invoice`}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                {bi('Preview Print View', '預覽列印')}
              </Link>
            )}
            {unit.tenantId && (
              <Link
                href={`/billing/debit-note?tenantId=${unit.tenantId}&unitId=${unit.id}&targetPeriod=${period}&mode=single&paymentTemplate=${invoicePaymentTemplate}${invoicePaymentRemark ? `&paymentRemark=${encodeURIComponent(invoicePaymentRemark)}` : ''}`}
                className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50"
              >
                Formal Debit Note 繳費通知單
              </Link>
            )}
          </div>
          <button
            onClick={onSend}
            disabled={busy}
            className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {busy ? bi('Sending…', '發送中…') : bi('Send invoice', '發送租金單')}
          </button>
        </div>
      </div>
    </RentalDetailModal>
  );
}
