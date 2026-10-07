'use client';

import { useEffect, useRef, useState } from 'react';
import { tapProps } from '@/lib/tap-action';
import { calcShiftPay, formatHours, formatMoney, hkStamp, splitHkIso, type PartTimeStaff } from '@/lib/part-time';
import { SignaturePad, type SignaturePadHandle } from './SignaturePad';

type Props = {
  staff: PartTimeStaff;
  now: Date;
  saving: boolean;
  error: string;
  onCancel: () => void;
  onConfirm: (signatureBase64: string) => void;
};

export default function SignatureModal({ staff, now, saving, error, onCancel, onConfirm }: Props) {
  const padRef = useRef<SignaturePadHandle>(null);
  const [empty, setEmpty] = useState(true);
  const startIso = staff.currentClockInTime || '';
  const end = hkStamp(now);
  const start = startIso ? splitHkIso(startIso) : { date: end.date, time: '—' };
  const pay = startIso ? calcShiftPay(startIso, end.iso, staff.hourlyRate) : { totalHours: 0, totalSalary: 0 };

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const confirm = () => {
    if (saving || empty) return;
    const dataUrl = padRef.current?.toDataUrl() || '';
    if (!dataUrl) return;
    onConfirm(dataUrl);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center overscroll-none sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="clock-out-title">
      <div className="absolute inset-0 bg-black/45" />
      <div className="relative z-10 flex max-h-[100dvh] w-full max-w-lg flex-col bg-white shadow-xl sm:rounded-2xl">
        <div className="border-b border-gray-100 px-4 py-4">
          <h2 id="clock-out-title" className="text-lg font-semibold text-gray-900">收工結算 / Clock out</h2>
          <p className="mt-1 text-sm text-gray-500">工時計算至按下確認。Hours are finalized when you confirm.</p>
        </div>

        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 text-sm">
          <div>
            <dt className="text-gray-500">員工 / Name</dt>
            <dd className="font-medium text-gray-900">{staff.name}</dd>
          </div>
          <div>
            <dt className="text-gray-500">日期 / Date</dt>
            <dd className="font-medium text-gray-900">{start.date}</dd>
          </div>
          <div>
            <dt className="text-gray-500">返工 / Start</dt>
            <dd className="font-medium text-gray-900">{start.time}</dd>
          </div>
          <div>
            <dt className="text-gray-500">收工 / End</dt>
            <dd className="font-medium text-gray-900">{end.time}</dd>
          </div>
          <div>
            <dt className="text-gray-500">總工時 / Hours</dt>
            <dd className="font-medium text-gray-900">{formatHours(pay.totalHours)} hrs</dd>
          </div>
          <div>
            <dt className="text-gray-500">時薪 / Rate</dt>
            <dd className="font-medium text-gray-900">{formatMoney(staff.hourlyRate)}</dd>
          </div>
          <div className="col-span-2">
            <dt className="text-gray-500">總薪水 / Salary</dt>
            <dd className="text-2xl font-semibold text-gray-900">{formatMoney(pay.totalSalary)}</dd>
          </div>
        </dl>

        <div className="px-4 pb-2">
          <p className="mb-2 text-sm font-medium text-gray-700">簽名 / Sign with your finger</p>
          <SignaturePad ref={padRef} onEmptyChange={setEmpty} />
        </div>

        {error && <p className="px-4 pb-2 text-sm text-red-600" role="alert">{error}</p>}

        <div className="grid grid-cols-2 gap-3 p-4">
          <button
            type="button"
            className="min-h-14 rounded-xl border border-gray-300 bg-white text-base font-semibold text-gray-800"
            {...tapProps(() => padRef.current?.clear(), saving)}
          >
            清除重簽 / Clear
          </button>
          <button
            type="button"
            disabled={empty || saving}
            className="min-h-14 rounded-xl bg-red-600 text-base font-semibold text-white disabled:opacity-40"
            {...tapProps(confirm, empty || saving)}
          >
            {saving ? '提交中…' : '確認提交 / Confirm & Submit'}
          </button>
          <button
            type="button"
            className="col-span-2 min-h-12 rounded-xl text-sm font-medium text-gray-500"
            {...tapProps(onCancel, saving)}
          >
            取消 / Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
