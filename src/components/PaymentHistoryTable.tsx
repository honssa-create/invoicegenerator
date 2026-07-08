'use client';

import { Fragment, useState } from 'react';
import {
  CHARGE_TYPE_LABELS,
  formatDisplayDate,
  formatMoney,
  paymentMethodLabel,
  type RentalPaymentWithAllocations,
} from '@/lib/rentals';

interface Props {
  payments: RentalPaymentWithAllocations[];
  readOnly?: boolean;
  onAllocate?: (paymentId: number) => void;
}

export default function PaymentHistoryTable({ payments, readOnly, onAllocate }: Props) {
  const [expanded, setExpanded] = useState<number | null>(null);

  if (!payments.length) {
    return <p className="p-8 text-center text-gray-400 text-sm">No payments recorded yet</p>;
  }

  return (
    <table className="w-full text-sm">
      <thead className="bg-gray-50 text-xs uppercase text-gray-500">
        <tr>
          <th className="px-4 py-3 text-left w-8" />
          <th className="px-4 py-3 text-left">Paid Date 交租日</th>
          <th className="px-4 py-3 text-left">Method / Ref</th>
          <th className="px-4 py-3 text-right">Total 總額</th>
          <th className="px-4 py-3 text-right">Allocated</th>
          <th className="px-4 py-3 text-right">Unallocated</th>
          {!readOnly && <th className="px-4 py-3 text-right">Action</th>}
        </tr>
      </thead>
      <tbody className="divide-y divide-gray-100">
        {payments.map((p) => {
          const isOpen = expanded === p.id;
          const hasBreakdown = p.allocations.length > 0 || Boolean(p.notes?.trim());
          return (
            <Fragment key={p.id}>
              <tr className="hover:bg-gray-50/80">
                <td className="px-4 py-3">
                  {hasBreakdown && (
                    <button
                      type="button"
                      onClick={() => setExpanded(isOpen ? null : p.id)}
                      className="text-gray-400 hover:text-gray-700 w-6 h-6"
                      aria-label="Toggle allocation breakdown"
                    >
                      {isOpen ? '▼' : '▶'}
                    </button>
                  )}
                </td>
                <td className="px-4 py-3 font-medium">{formatDisplayDate(p.paymentDate)}</td>
                <td className="px-4 py-3 text-gray-600">
                  {paymentMethodLabel(p.method)}
                  {p.reference && <span className="block text-xs text-gray-400">{p.reference}</span>}
                </td>
                <td className="px-4 py-3 text-right font-semibold">{formatMoney(p.amount)}</td>
                <td className="px-4 py-3 text-right text-green-700">{formatMoney(p.amountAllocated)}</td>
                <td className="px-4 py-3 text-right text-orange-600">{formatMoney(p.amountUnallocated)}</td>
                {!readOnly && (
                  <td className="px-4 py-3 text-right">
                    {p.amountUnallocated > 0 && onAllocate && (
                      <button onClick={() => onAllocate(p.id)} className="text-brand-600 text-xs font-medium hover:underline">
                        Allocate
                      </button>
                    )}
                  </td>
                )}
              </tr>
              {isOpen && hasBreakdown && (
                <tr className="bg-brand-50/30">
                  <td colSpan={readOnly ? 6 : 7} className="px-6 py-3">
                    <p className="text-xs font-semibold text-gray-600 uppercase mb-2">Itemized Allocation 分拆明細</p>
                    {p.notes?.trim() && (
                      <p className="text-sm text-gray-700 mb-2 whitespace-pre-wrap">
                        <span className="text-xs font-semibold text-gray-500 uppercase">Note 備註：</span>
                        {p.notes.trim()}
                      </p>
                    )}
                    {p.allocations.length > 0 && (
                      <ul className="space-y-1">
                        {p.allocations.map((a) => (
                          <li key={a.id} className="flex flex-wrap items-center gap-x-3 text-sm">
                            <span className="font-medium">{a.unitName}</span>
                            <span className="text-gray-500">{a.billingPeriod}</span>
                            <span className="text-gray-600">{CHARGE_TYPE_LABELS[a.chargeType]}</span>
                            <span className="font-semibold text-green-700 ml-auto">{formatMoney(a.amount)}</span>
                          </li>
                        ))}
                      </ul>
                    )}
                  </td>
                </tr>
              )}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}
