'use client';

import {
  CHARGE_TYPE_LABELS,
  formatDisplayDate,
  formatMoney,
  paymentMethodLabel,
  type RentalPaymentAllocationDetail,
} from '@/lib/rentals';

interface Props {
  rows: RentalPaymentAllocationDetail[];
  compact?: boolean;
}

export default function PaymentAllocationLedger({ rows, compact }: Props) {
  if (!rows.length) {
    return (
      <p className="text-sm text-gray-400 py-6 text-center">
        No payment allocations yet — record a payment and split across billing items.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className={`w-full border-collapse ${compact ? 'text-xs' : 'text-sm'}`}>
        <thead>
          <tr className="bg-gray-900 text-white text-left">
            <th className="px-3 py-2 border border-gray-700 whitespace-nowrap">收款日期 Date</th>
            <th className="px-3 py-2 border border-gray-700 whitespace-nowrap">Payment #</th>
            <th className="px-3 py-2 border border-gray-700">方式 Method</th>
            <th className="px-3 py-2 border border-gray-700">參考 Ref</th>
            <th className="px-3 py-2 border border-gray-700 text-right">收款總額</th>
            <th className="px-3 py-2 border border-gray-700">→ 單位 Unit</th>
            <th className="px-3 py-2 border border-gray-700 whitespace-nowrap">月份 Period</th>
            <th className="px-3 py-2 border border-gray-700">費用類別</th>
            <th className="px-3 py-2 border border-gray-700 text-right">沖銷金額 Allocated</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, idx) => {
            const prev = idx > 0 ? rows[idx - 1] : null;
            const samePayment = prev?.paymentId === row.paymentId;
            return (
              <tr key={row.id} className={`border-b border-gray-100 ${samePayment ? 'bg-gray-50/40' : 'hover:bg-brand-50/30'}`}>
                <td className="px-3 py-2 border-r border-gray-100 whitespace-nowrap">
                  {samePayment ? '' : formatDisplayDate(row.paymentDate)}
                </td>
                <td className="px-3 py-2 border-r border-gray-100 text-gray-500">
                  {samePayment ? '↳' : `#${row.paymentId}`}
                </td>
                <td className="px-3 py-2 border-r border-gray-100 text-gray-600">
                  {samePayment ? '' : paymentMethodLabel(row.paymentMethod)}
                </td>
                <td className="px-3 py-2 border-r border-gray-100 text-gray-600 truncate max-w-[8rem]">
                  {samePayment ? '' : (row.paymentReference || '—')}
                </td>
                <td className="px-3 py-2 border-r border-gray-100 text-right font-medium">
                  {samePayment ? '' : formatMoney(row.paymentAmount)}
                </td>
                <td className="px-3 py-2 border-r border-gray-100 font-medium">{row.unitName}</td>
                <td className="px-3 py-2 border-r border-gray-100">{row.billingPeriod}</td>
                <td className="px-3 py-2 border-r border-gray-100">{CHARGE_TYPE_LABELS[row.chargeType]}</td>
                <td className="px-3 py-2 text-right font-semibold text-green-700">{formatMoney(row.allocatedAmount)}</td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-brand-50 font-bold">
            <td colSpan={8} className="px-3 py-3 text-right border-t-2 border-brand-200">核銷總計 Total Allocated</td>
            <td className="px-3 py-3 text-right text-brand-700 border-t-2 border-brand-200">
              {formatMoney(rows.reduce((s, r) => s + r.allocatedAmount, 0))}
            </td>
          </tr>
        </tfoot>
      </table>
      <p className="text-xs text-gray-400 mt-2 px-1">
        N-to-N: one payment can allocate to many billing items; one billing item can receive from many payments.
      </p>
    </div>
  );
}
