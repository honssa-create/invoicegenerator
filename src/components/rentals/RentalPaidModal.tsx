'use client';

import { useEffect, useRef, useState } from 'react';
import PaymentPeriodTable, {
  emptyPaymentPeriodLine,
  sumPaymentPeriodLine,
  sumPaymentPeriodLines,
  type PaymentPeriodLine,
} from '@/components/PaymentPeriodTable';
import { compressImage } from '@/lib/imageCompression';
import { BTN, bi } from '@/lib/ui-labels';
import {
  RENTAL_PAYMENT_METHODS,
  RENTAL_PAYMENT_METHOD_LABELS,
  addBillingMonths,
  chargeOutstanding,
  currentBillingPeriod,
  formatMoney,
  fromFormDate,
  toFormDate,
  todayFormDate,
  type RentalChargeItem,
  type RentalUnit,
} from '@/lib/rentals';
import {
  chargeTypeTotal,
  formatBreakdownAmount,
  periodDateInputProps,
  RENTAL_DETAIL_INPUT_CLS,
} from '@/lib/rental-unit-detail-shared';

interface Props {
  open: boolean;
  unit: RentalUnit;
  period: string;
  outstandingCharges: RentalChargeItem[];
  monthlyRent: number;
  hasCurrentRecord: boolean;
  ensurePeriodRecord: () => Promise<number | null>;
  onClose: () => void;
  onSaved: (message: string) => void;
  onError: (message: string) => void;
}

export default function RentalPaidModal({
  open,
  unit,
  period,
  outstandingCharges,
  monthlyRent,
  hasCurrentRecord,
  ensurePeriodRecord,
  onClose,
  onSaved,
  onError,
}: Props) {
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const [periodRows, setPeriodRows] = useState<PaymentPeriodLine[]>([]);
  const [paymentForm, setPaymentForm] = useState({
    paymentDate: todayFormDate(),
    amount: '',
    method: '',
    reference: '',
    notes: '',
  });
  const [paidNote, setPaidNote] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [ocrLoading, setOcrLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  const buildOutstandingPeriodRows = (): PaymentPeriodLine[] => {
    const seen = new Set<string>();
    const rows: PaymentPeriodLine[] = [];
    const charges = [...outstandingCharges]
      .filter((c) => chargeOutstanding(c) > 0)
      .sort((a, b) => a.billingPeriod.localeCompare(b.billingPeriod));
    for (const c of charges) {
      if (seen.has(c.billingPeriod)) continue;
      seen.add(c.billingPeriod);
      rows.push({
        unitId: unit.id,
        billingPeriod: c.billingPeriod,
        rent: formatBreakdownAmount(chargeTypeTotal(charges, c.billingPeriod, 'rent')),
        electricity: formatBreakdownAmount(chargeTypeTotal(charges, c.billingPeriod, 'electricity')),
        water: formatBreakdownAmount(chargeTypeTotal(charges, c.billingPeriod, 'water')),
      });
    }
    return rows;
  };

  const startPaymentPeriod = () => {
    const periods = outstandingCharges
      .filter((c) => chargeOutstanding(c) > 0)
      .map((c) => c.billingPeriod)
      .sort();
    return periods[0] || period;
  };

  useEffect(() => {
    if (!open) return;
    const outstanding = buildOutstandingPeriodRows();
    const rows = outstanding.length
      ? outstanding
      : [emptyPaymentPeriodLine({ unitId: unit.id, billingPeriod: period })];
    setPeriodRows(rows);
    setPaymentForm({
      paymentDate: todayFormDate(),
      amount: String(sumPaymentPeriodLines(rows) || ''),
      method: '',
      reference: '',
      notes: '',
    });
    setPaidNote('');
    setReceiptFile(null);
  }, [open, unit.id, period, outstandingCharges]);

  if (!open || !unit.tenantId) return null;

  const inp = RENTAL_DETAIL_INPUT_CLS;

  const applyPeriodRows = (rows: PaymentPeriodLine[]) => {
    setPeriodRows(rows);
    setPaymentForm((f) => ({ ...f, amount: String(sumPaymentPeriodLines(rows) || '') }));
  };

  const fillOutstandingPeriodRows = () => {
    const rows = buildOutstandingPeriodRows();
    applyPeriodRows(
      rows.length
        ? rows
        : [emptyPaymentPeriodLine({ unitId: unit.id, billingPeriod: startPaymentPeriod() })],
    );
  };

  const fillAdvanceMonths = (months: number) => {
    const rows: PaymentPeriodLine[] = [];
    let p = startPaymentPeriod();
    for (let i = 0; i < months; i += 1) {
      rows.push({
        unitId: unit.id,
        billingPeriod: p,
        rent: monthlyRent ? String(monthlyRent) : '',
        electricity: '',
        water: '',
      });
      p = addBillingMonths(p, 1);
    }
    applyPeriodRows(rows);
  };

  const handleReceiptUpload = async (file: File) => {
    setOcrLoading(true);
    let f = file;
    try {
      const c = await compressImage(file, {
        maxDim: 1600,
        targetBytes: 300 * 1024,
        mimeType: 'image/jpeg',
        quality: 0.65,
      });
      f = c.file;
    } catch {
      /* keep original */
    }
    setReceiptFile(f);

    const recordId = await ensurePeriodRecord();
    if (!recordId) {
      setOcrLoading(false);
      return;
    }
    const fd = new FormData();
    fd.append('receipt', f);
    const res = await fetch(`/api/rentals/records/${recordId}/receipt-scan`, { method: 'POST', body: fd });
    const d = await res.json();
    setOcrLoading(false);
    if (res.ok) {
      if (d.extracted?.transfer_date) {
        setPaymentForm((prev) => ({ ...prev, paymentDate: toFormDate(d.extracted.transfer_date) }));
      }
      if (d.extracted?.amount) {
        setPaymentForm((prev) => ({ ...prev, amount: String(d.extracted.amount) }));
      }
    }
  };

  const confirmPaid = async () => {
    const amount = Number(paymentForm.amount);
    if (!Number.isFinite(amount) || amount <= 0) {
      onError('Enter a valid payment amount 請輸入有效收款金額');
      return;
    }

    const body: Record<string, unknown> = {
      tenantId: unit.tenantId,
      paymentDate: fromFormDate(paymentForm.paymentDate),
      amount,
      method: paymentForm.method || null,
      reference: paymentForm.reference || null,
      notes: paidNote || paymentForm.notes || null,
      unitIds: [unit.id],
    };

    const periodAllocations = periodRows
      .filter((r) => r.billingPeriod && sumPaymentPeriodLine(r) > 0)
      .map((r) => ({
        unitId: unit.id,
        billingPeriod: r.billingPeriod,
        rent: Number(r.rent) || undefined,
        electricity: Number(r.electricity) || undefined,
        water: Number(r.water) || undefined,
      }));
    if (periodAllocations.length) {
      body.periodAllocations = periodAllocations;
    } else {
      body.autoAllocate = true;
    }

    setBusy(true);
    const res = await fetch('/api/rentals/payments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    const d = await res.json().catch(() => ({}));
    if (!res.ok) {
      onError(d.error || 'Failed to record payment');
      return;
    }
    onSaved('Payment recorded — outstanding balance updated 收款已記錄');
    onClose();
  };

  return (
    <div className="modal-overlay">
      <div className="modal-panel sm:max-w-3xl max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">Record Payment 記錄收款</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              {bi(
                'Each line is one period with rent, electricity and water. Add or remove lines as needed.',
                '每列為一個帳期（租金、電費、水費）。可增刪列數。',
              )}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-xl"
            aria-label={BTN.close}
          >
            ✕
          </button>
        </div>

        <div className="rounded-xl bg-green-50 border border-green-200 p-4 mb-4">
          <p className="text-sm text-green-700">Outstanding for {unit.unitName} 未付總額</p>
          <p className="text-2xl font-bold text-green-800">
            {formatMoney(outstandingCharges.reduce((s, c) => s + chargeOutstanding(c), 0))}
          </p>
          <p className="text-xs text-green-600 mt-1">
            {outstandingCharges.length} {bi('open charge item(s)', '未結收費項目')}
          </p>
        </div>

        <div className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-gray-500">Paid Date 交租日</label>
              <input
                {...periodDateInputProps(paymentForm.paymentDate, (v) =>
                  setPaymentForm({ ...paymentForm, paymentDate: v }),
                inp)}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Total Amount 收款總額</label>
              <input
                type="number"
                className={inp}
                value={paymentForm.amount}
                onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Method 方式</label>
              <select
                className={inp}
                value={paymentForm.method}
                onChange={(e) => setPaymentForm({ ...paymentForm, method: e.target.value })}
              >
                <option value="">Select method 選擇方式</option>
                {RENTAL_PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {RENTAL_PAYMENT_METHOD_LABELS[m]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-gray-500">Reference 參考</label>
              <input
                className={inp}
                value={paymentForm.reference}
                onChange={(e) => setPaymentForm({ ...paymentForm, reference: e.target.value })}
              />
            </div>
          </div>

          <PaymentPeriodTable
            rows={periodRows}
            onChange={applyPeriodRows}
            defaultUnitId={unit.id}
            defaultPeriod={startPaymentPeriod() || currentBillingPeriod()}
            extraActions={
              <>
                <button
                  type="button"
                  className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                  onClick={fillOutstandingPeriodRows}
                >
                  {bi('Fill arrears', '填未付')}
                </button>
                <button
                  type="button"
                  className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                  onClick={() => fillAdvanceMonths(3)}
                >
                  {bi('3 months', '預付3個月')}
                </button>
                <button
                  type="button"
                  className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                  onClick={() => fillAdvanceMonths(6)}
                >
                  {bi('6 months', '預付6個月')}
                </button>
                <button
                  type="button"
                  className="text-xs px-2 py-1 border rounded hover:bg-gray-50"
                  onClick={() => fillAdvanceMonths(12)}
                >
                  {bi('12 months', '預付12個月')}
                </button>
              </>
            }
          />
          <p className="text-xs text-gray-500">
            {bi('Period total', '帳期合計')}: {formatMoney(sumPaymentPeriodLines(periodRows))}
            {paymentForm.amount && ` · ${bi('Payment', '收款')} ${formatMoney(Number(paymentForm.amount) || 0)}`}
          </p>

          {hasCurrentRecord && (
            <div>
              <p className="text-sm font-medium text-gray-700 mb-2">Upload Bank Slip / 收款憑證 (optional)</p>
              <div
                role="button"
                tabIndex={0}
                aria-label={bi('Upload bank slip', '上傳收款憑證')}
                onClick={() => receiptInputRef.current?.click()}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    receiptInputRef.current?.click();
                  }
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const f = e.dataTransfer.files?.[0];
                  if (f) void handleReceiptUpload(f);
                }}
                onDragOver={(e) => e.preventDefault()}
                className="border-2 border-dashed border-gray-300 rounded-xl p-4 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/40"
              >
                <input
                  ref={receiptInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  aria-label={bi('Upload bank slip', '上傳收款憑證')}
                  onChange={(e) => {
                    if (e.target.files?.[0]) void handleReceiptUpload(e.target.files[0]);
                    e.target.value = '';
                  }}
                />
                {ocrLoading ? (
                  <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600 mx-auto" />
                ) : receiptFile ? (
                  <p className="text-sm text-green-700 font-medium">✅ {receiptFile.name}</p>
                ) : (
                  <p className="text-sm text-gray-500">Drop receipt image for AI extract (current period)</p>
                )}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Notes 備註</label>
            <textarea className={inp} rows={2} value={paidNote} onChange={(e) => setPaidNote(e.target.value)} />
          </div>
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">
            {BTN.cancel}
          </button>
          <button
            onClick={() => void confirmPaid()}
            disabled={busy || !Number(paymentForm.amount)}
            className="px-5 py-2.5 bg-green-600 text-white rounded-lg text-sm font-bold disabled:opacity-50"
          >
            {busy ? BTN.saving : bi('Save & Allocate', '儲存並核銷')}
          </button>
        </div>
      </div>
    </div>
  );
}
