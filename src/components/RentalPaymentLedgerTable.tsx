'use client';

import { useState } from 'react';
import Link from 'next/link';
import PeriodPaymentDetailModal from '@/components/PeriodPaymentDetailModal';
import {
  formatDisplayDate,
  formatMoney,
  formatUtilityAmount,
  periodLedgerStatusBadge,
  periodLedgerStatusLabel,
  type UnitLeasePaymentLedgerRow,
} from '@/lib/rentals';

interface Props {
  rows: UnitLeasePaymentLedgerRow[];
  leaseLabel?: string;
}

export default function RentalPaymentLedgerTable({ rows, leaseLabel }: Props) {
  const [detailRow, setDetailRow] = useState<UnitLeasePaymentLedgerRow | null>(null);

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm min-w-[760px]">
          <thead className="text-xs uppercase tracking-wider text-gray-500 bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="px-4 py-3 text-left">Period 帳期</th>
              <th className="px-4 py-3 text-right">Base 租金</th>
              <th className="px-4 py-3 text-right">Water 水費</th>
              <th className="px-4 py-3 text-right">Electricity 電費</th>
              <th className="px-4 py-3 text-right">Total 總額</th>
              <th className="px-4 py-3 text-left">Received Date 收款日</th>
              <th className="px-4 py-3 text-left">Status 狀態</th>
              <th className="px-4 py-3 text-right">Docs 文件</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {rows.map((r) => (
              <tr
                key={r.billingPeriod}
                className="hover:bg-brand-50/40 cursor-pointer"
                onClick={() => setDetailRow(r)}
                title="Click for charge breakdown 點擊查看明細"
              >
                <td className="px-4 py-3 font-medium text-gray-900">{r.billingPeriod}</td>
                <td className="px-4 py-3 text-right text-gray-600">{formatMoney(r.baseRent)}</td>
                <td className="px-4 py-3 text-right text-gray-600">{formatUtilityAmount(r.waterFee)}</td>
                <td className="px-4 py-3 text-right text-gray-600">{formatUtilityAmount(r.electricityFee)}</td>
                <td className="px-4 py-3 text-right font-semibold text-gray-900">
                  {formatMoney(r.total)}
                  {r.amountReceived > 0 && r.amountReceived < r.total && (
                    <p className="text-[10px] text-orange-600 font-normal">Received {formatMoney(r.amountReceived)}</p>
                  )}
                </td>
                <td className="px-4 py-3 text-gray-600">{formatDisplayDate(r.receivedDate) || '—'}</td>
                <td className="px-4 py-3">
                  <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-semibold ${periodLedgerStatusBadge(r.status)}`}>
                    {periodLedgerStatusLabel(r.status)}
                  </span>
                </td>
                <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                  <span className="space-x-2">
                    {r.recordId && r.invoiceRef && (
                      <Link href={`/rentals/records/${r.recordId}/invoice`} className="text-brand-600 text-xs hover:underline">
                        Invoice
                      </Link>
                    )}
                    {r.recordId && r.receiptRef && (
                      <Link href={`/rentals/records/${r.recordId}/receipt`} className="text-brand-600 text-xs hover:underline">
                        Receipt
                      </Link>
                    )}
                    {!r.invoiceRef && !r.receiptRef && <span className="text-gray-300 text-xs">—</span>}
                  </span>
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-10 text-center text-gray-400">
                  {leaseLabel ? `No billing periods for ${leaseLabel}` : 'No lease period — add a lease to track payments'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {detailRow && (
        <PeriodPaymentDetailModal row={detailRow} onClose={() => setDetailRow(null)} />
      )}
    </>
  );
}
