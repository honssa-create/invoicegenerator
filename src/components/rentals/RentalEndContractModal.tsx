'use client';

import { useEffect, useState } from 'react';
import { BTN, MSG, bi } from '@/lib/ui-labels';
import { fromFormDate, todayFormDate } from '@/lib/rentals';
import { periodDateInputProps, RENTAL_DETAIL_INPUT_CLS } from '@/lib/rental-unit-detail-shared';
import RentalDetailModal from '@/components/rentals/RentalDetailModal';

interface Props {
  open: boolean;
  unitId: string;
  tenantName: string;
  baseRent: string;
  dueDateDay: string;
  defaultNewBaseRent?: string;
  onClose: () => void;
  onDone: (message: string) => void;
  onError: (message: string) => void;
}

export default function RentalEndContractModal({
  open,
  unitId,
  tenantName,
  baseRent,
  dueDateDay,
  defaultNewBaseRent,
  onClose,
  onDone,
  onError,
}: Props) {
  const [form, setForm] = useState({
    actualEndDate: todayFormDate(),
    depositRefund: '',
    depositDeductions: '',
    endNotes: '',
    startNew: false,
    newTenantName: '',
    newLeaseStart: todayFormDate(),
    newLeaseEnd: '',
    newBaseRent: '',
  });
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      actualEndDate: todayFormDate(),
      depositRefund: '',
      depositDeductions: '',
      endNotes: '',
      startNew: false,
      newTenantName: '',
      newLeaseStart: todayFormDate(),
      newLeaseEnd: '',
      newBaseRent: defaultNewBaseRent || '',
    });
  }, [open, defaultNewBaseRent]);

  if (!open) return null;

  const submit = async () => {
    setBusy(true);
    const body: Record<string, unknown> = {
      actualEndDate: fromFormDate(form.actualEndDate),
      depositRefund: form.depositRefund ? Number(form.depositRefund) : undefined,
      depositDeductions: form.depositDeductions ? Number(form.depositDeductions) : undefined,
      endNotes: form.endNotes || undefined,
      forceEnd: true,
    };
    if (form.startNew && form.newTenantName.trim()) {
      body.startNewLease = {
        tenantName: form.newTenantName.trim(),
        leaseStartDate: fromFormDate(form.newLeaseStart),
        leaseEndDate: fromFormDate(form.newLeaseEnd),
        baseRent: Number(form.newBaseRent) || Number(baseRent) || 0,
        dueDateDay: Number(dueDateDay) || 1,
      };
    }
    const res = await fetch(`/api/rentals/units/${unitId}/end-contract`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      onError(d.error || 'Failed to end contract');
      return;
    }
    onDone(form.startNew ? 'Contract ended — new lease started' : 'Contract ended');
    onClose();
  };

  return (
    <RentalDetailModal title="End Contract 完約" onClose={onClose}>
      <div className="space-y-4 text-sm">
        <p className="text-gray-600">
          {bi('Close the current lease for', '完結現任租約：')} <strong>{tenantName}</strong>.{' '}
          {bi('Auto-invoices will stop after the lease end date.', '租約完結日後將停止自動發票。')}
        </p>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Actual move-out date 實際退租日</label>
          <input
            {...periodDateInputProps(form.actualEndDate, (v) => setForm({ ...form, actualEndDate: v }), RENTAL_DETAIL_INPUT_CLS)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs text-gray-500 mb-1">Deposit refund 退按金</label>
            <input
              type="number"
              className={RENTAL_DETAIL_INPUT_CLS}
              value={form.depositRefund}
              onChange={(e) => setForm({ ...form, depositRefund: e.target.value })}
            />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Deductions 扣除</label>
            <input
              type="number"
              className={RENTAL_DETAIL_INPUT_CLS}
              value={form.depositDeductions}
              onChange={(e) => setForm({ ...form, depositDeductions: e.target.value })}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Notes 備註</label>
          <textarea
            className={RENTAL_DETAIL_INPUT_CLS}
            rows={2}
            value={form.endNotes}
            onChange={(e) => setForm({ ...form, endNotes: e.target.value })}
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.startNew}
            onChange={(e) => setForm({ ...form, startNew: e.target.checked })}
          />
          Start new lease immediately 立即新租約
        </label>
        {form.startNew && (
          <div className="rounded-xl border border-gray-200 p-3 space-y-3 bg-gray-50/50">
            <div>
              <label className="block text-xs text-gray-500 mb-1">{bi('New tenant name', '新租客姓名')}</label>
              <input
                className={RENTAL_DETAIL_INPUT_CLS}
                value={form.newTenantName}
                onChange={(e) => setForm({ ...form, newTenantName: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-gray-500 mb-1">{bi('Lease start', '起租日')}</label>
                <input
                  {...periodDateInputProps(form.newLeaseStart, (v) => setForm({ ...form, newLeaseStart: v }), RENTAL_DETAIL_INPUT_CLS)}
                />
              </div>
              <div>
                <label className="block text-xs text-gray-500 mb-1">{bi('Lease end', '完租日')}</label>
                <input
                  {...periodDateInputProps(form.newLeaseEnd, (v) => setForm({ ...form, newLeaseEnd: v }), RENTAL_DETAIL_INPUT_CLS)}
                />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">{bi('Base rent', '基本租金')}</label>
              <input
                type="number"
                className={RENTAL_DETAIL_INPUT_CLS}
                value={form.newBaseRent}
                onChange={(e) => setForm({ ...form, newBaseRent: e.target.value })}
              />
            </div>
          </div>
        )}
        <div className="flex justify-end gap-3 pt-2">
          <button onClick={onClose} className="px-4 py-2 border rounded-lg text-sm">
            {BTN.cancel}
          </button>
          <button
            onClick={() => void submit()}
            disabled={busy}
            className="px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
          >
            {busy ? MSG.processing : bi('Confirm End Contract', '確認完約')}
          </button>
        </div>
      </div>
    </RentalDetailModal>
  );
}
