'use client';

import { formatMoney, type RentPaymentNoticeMatrix } from '@/lib/rentals';

interface Props {
  matrix: RentPaymentNoticeMatrix;
  compact?: boolean;
}

function cellDisplay(cell: { outstanding: number; amountDue: number; status: string }) {
  if (cell.status === 'empty' || cell.amountDue <= 0) return '/';
  if (cell.status === 'paid') return '已付';
  if (cell.status === 'partial') return `${formatMoney(cell.outstanding)}*`;
  return formatMoney(cell.outstanding);
}

export default function RentPaymentNoticeMatrix({ matrix, compact }: Props) {
  const { columns, rows, units, summary } = matrix;
  const unitGroups = units.map((unit) => ({
    unit,
    cols: columns.filter((c) => c.unitId === unit.id),
  }));

  if (!columns.length) {
    return <p className="text-sm text-gray-500 py-6 text-center">No charge items for this tenant yet.</p>;
  }

  const colCount = columns.length;

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className={`w-full border-collapse text-sm ${compact ? 'text-xs' : ''}`}>
          <thead>
            <tr className="bg-gray-900 text-white">
              <th rowSpan={2} className="text-left px-3 py-2 border border-gray-700 whitespace-nowrap sticky left-0 bg-gray-900 z-10">
                月份 Month
              </th>
              {unitGroups.map(({ unit, cols }) => (
                <th key={unit.id} colSpan={cols.length} className="text-center px-2 py-2 border border-gray-700">
                  {unit.unitName}
                </th>
              ))}
              <th rowSpan={2} className="text-right px-3 py-2 border border-gray-700 whitespace-nowrap">小計 Subtotal</th>
            </tr>
            <tr className="bg-gray-800 text-white text-[11px]">
              {columns.map((col) => (
                <th key={`${col.unitId}-${col.chargeType}`} className="px-2 py-1.5 border border-gray-700 text-center whitespace-nowrap">
                  {col.chargeType === 'rent' ? '租金' : col.chargeType === 'water' ? '水費' : '電費'}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.period}
                className={`border-b border-gray-100 ${row.isFullyPaid ? 'bg-green-50/40' : row.rowTotal > 0 ? 'hover:bg-red-50/30' : 'hover:bg-gray-50/50'}`}
              >
                <td className="px-3 py-2 font-medium text-gray-800 border-r border-gray-200 sticky left-0 bg-inherit z-10">
                  {row.periodLabel}
                </td>
                {row.cells.map((cell, idx) => (
                  <td
                    key={idx}
                    className={`px-2 py-2 text-right border-r border-gray-100 ${
                      cell.status === 'paid' ? 'text-green-700 font-medium' :
                      cell.status === 'unpaid' ? 'font-semibold text-red-700' :
                      cell.status === 'partial' ? 'font-semibold text-orange-600' :
                      'text-gray-400'
                    }`}
                  >
                    {cellDisplay(cell)}
                  </td>
                ))}
                <td className={`px-3 py-2 text-right font-semibold ${row.rowTotal > 0 ? 'text-red-700' : 'text-green-700'}`}>
                  {row.rowTotal > 0 ? formatMoney(row.rowTotal) : row.isFullyPaid ? '已付' : '—'}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            {summary.priorArrearsTotal > 0 && (
              <tr className="bg-red-50 font-bold border-t-2 border-red-200">
                <td className="px-3 py-3 sticky left-0 bg-red-50 text-red-800">前期欠款 Prior Arrears</td>
                {Array.from({ length: colCount }).map((_, idx) => (
                  <td key={idx} className="px-2 py-3 text-right text-red-700">—</td>
                ))}
                <td className="px-3 py-3 text-right text-lg text-red-800">{formatMoney(summary.priorArrearsTotal)}</td>
              </tr>
            )}
            {summary.priorPaidPeriods.length > 0 && (
              <tr className="bg-green-50 font-semibold">
                <td className="px-3 py-3 sticky left-0 bg-green-50 text-green-800">前期已付 Prior Paid</td>
                {Array.from({ length: colCount }).map((_, idx) => (
                  <td key={idx} className="px-2 py-3 text-center text-green-700 text-xs">已繳付</td>
                ))}
                <td className="px-3 py-3 text-right text-green-800">{formatMoney(summary.priorPaidTotal)}</td>
              </tr>
            )}
            <tr className="bg-blue-50 font-semibold">
              <td className="px-3 py-3 sticky left-0 bg-blue-50 text-blue-900">本期費用 Current ({matrix.period})</td>
              {Array.from({ length: colCount }).map((_, idx) => (
                <td key={idx} className="px-2 py-3 text-right text-blue-800">—</td>
              ))}
              <td className="px-3 py-3 text-right text-blue-900">
                {summary.currentPeriodOutstanding > 0
                  ? formatMoney(summary.currentPeriodOutstanding)
                  : summary.currentPeriodDue > 0 ? '已付' : '—'}
              </td>
            </tr>
            <tr className="bg-brand-50 font-bold">
              <td className="px-3 py-3 border-t-2 border-brand-200 sticky left-0 bg-brand-50">應繳總計 Total Due</td>
              {columns.map((col, idx) => {
                const colTotal = rows.reduce((s, r) => s + (r.cells[idx]?.outstanding || 0), 0);
                return (
                  <td key={`${col.unitId}-${col.chargeType}`} className="px-2 py-3 text-right border-t-2 border-brand-200 text-brand-800">
                    {colTotal > 0 ? formatMoney(colTotal) : '—'}
                  </td>
                );
              })}
              <td className="px-3 py-3 text-right text-xl text-brand-700 border-t-2 border-brand-200">
                {formatMoney(matrix.grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      {summary.reminderText && (
        <div className="rounded-lg border-2 border-brand-200 bg-brand-50 px-4 py-3 print:border-brand-400">
          <p className="text-xs uppercase tracking-wider text-brand-600 font-semibold mb-1">繳費提醒 Payment Reminder</p>
          <p className="text-sm font-medium text-gray-900 leading-relaxed">{summary.reminderText}</p>
          <p className="text-xs text-gray-500 mt-1">到期日 Due: {summary.dueDateDisplay}</p>
        </div>
      )}

      <p className="text-xs text-gray-400">「/」= 無此費用 · 「已付」= 已付清 · 「*」= 部分付款</p>
    </div>
  );
}
