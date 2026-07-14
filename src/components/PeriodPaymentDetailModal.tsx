'use client';

import Link from 'next/link';
import {
  CHARGE_STATUS_LABELS,
  CHARGE_TYPE_LABELS,
  formatDisplayDate,
  formatMoney,
  formatUtilityAmount,
  periodLedgerStatusBadge,
  periodLedgerStatusLabel,
  type UnitLeasePaymentLedgerRow,
} from '@/lib/rentals';

interface Props {
  row: UnitLeasePaymentLedgerRow;
  onClose: () => void;
}

export default function PeriodPaymentDetailModal({ row, onClose }: Props) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-panel sm:max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold">帳期明細 Period Detail</p>
            <h2 className="text-xl font-bold text-gray-900 mt-1">{row.billingPeriod}</h2>
            <p className="text-sm text-gray-500 mt-0.5">
              Total {formatMoney(row.total)}
              {row.amountReceived > 0 && row.amountReceived < row.total && (
                <span className="text-orange-600"> · Received {formatMoney(row.amountReceived)}</span>
              )}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-gray-400 hover:text-gray-700 text-xl leading-none px-1">✕</button>
        </div>

        <div className="mb-4">
          <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${periodLedgerStatusBadge(row.status)}`}>
            {periodLedgerStatusLabel(row.status)}
          </span>
          {row.receivedDate && (
            <span className="ml-3 text-sm text-gray-600">
              Received {formatDisplayDate(row.receivedDate)}
            </span>
          )}
        </div>

        <div className="border border-gray-200 rounded-xl overflow-hidden mb-4">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2.5 text-left">Charge 項目</th>
                <th className="px-4 py-2.5 text-right">Due 應付</th>
                <th className="px-4 py-2.5 text-right">Paid 已付</th>
                <th className="px-4 py-2.5 text-right">Outstanding 未付</th>
                <th className="px-4 py-2.5 text-left">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {row.charges.map((c) => (
                <tr key={c.chargeType}>
                  <td className="px-4 py-3 font-medium text-gray-900">{CHARGE_TYPE_LABELS[c.chargeType]}</td>
                  <td className="px-4 py-3 text-right text-gray-700">
                    {c.chargeType === 'rent' ? formatMoney(c.amountDue) : formatUtilityAmount(c.amountDue)}
                  </td>
                  <td className="px-4 py-3 text-right text-green-700">
                    {c.amountAllocated > 0
                      ? (c.chargeType === 'rent' ? formatMoney(c.amountAllocated) : formatUtilityAmount(c.amountAllocated))
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold text-red-700">
                    {c.outstanding > 0
                      ? (c.chargeType === 'rent' ? formatMoney(c.outstanding) : formatUtilityAmount(c.outstanding))
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-xs font-semibold text-gray-600">{CHARGE_STATUS_LABELS[c.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {row.charges.some((c) => c.allocations.length > 0) && (
          <div className="mb-4">
            <h3 className="text-xs font-semibold uppercase text-gray-500 mb-2">Payment Allocations 收款核銷</h3>
            <div className="space-y-3">
              {row.charges.map((c) => (
                c.allocations.length > 0 ? (
                  <div key={c.chargeType} className="rounded-lg border border-gray-100 bg-gray-50/60 p-3">
                    <p className="text-xs font-semibold text-gray-700 mb-2">{CHARGE_TYPE_LABELS[c.chargeType]}</p>
                    <ul className="space-y-1.5 text-sm">
                      {c.allocations.map((a, idx) => (
                        <li key={`${a.paymentId}-${idx}`} className="flex justify-between gap-2 text-gray-700">
                          <span>
                            {formatDisplayDate(a.paymentDate)}
                            {a.method && <span className="text-gray-400 ml-1">· {a.method}</span>}
                            {a.reference && <span className="text-gray-400 ml-1">· {a.reference}</span>}
                          </span>
                          <span className="font-medium text-green-700">{formatMoney(a.amount)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null
              ))}
            </div>
          </div>
        )}

        {(row.invoiceRef || row.receiptRef) && (
          <div className="flex flex-wrap gap-3 pt-2 border-t border-gray-100">
            {row.recordId && row.invoiceRef && (
              <Link href={`/rentals/records/${row.recordId}/invoice`} className="text-sm text-brand-600 hover:underline">
                View Invoice 發票
              </Link>
            )}
            {row.recordId && row.receiptRef && (
              <Link href={`/rentals/records/${row.recordId}/receipt`} className="text-sm text-brand-600 hover:underline">
                View Receipt 收據
              </Link>
            )}
          </div>
        )}

        <div className="flex justify-end mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 border rounded-lg text-sm hover:bg-gray-50">
            Close 關閉
          </button>
        </div>
      </div>
    </div>
  );
}
