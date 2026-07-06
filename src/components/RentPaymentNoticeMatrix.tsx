'use client';

import { CHARGE_TYPE_LABELS, formatMoney, type RentPaymentNoticeMatrix } from '@/lib/rentals';

interface Props {
  matrix: RentPaymentNoticeMatrix;
  compact?: boolean;
}

function cellDisplay(outstanding: number, amountDue: number) {
  if (amountDue <= 0) return '/';
  if (outstanding <= 0) return '—';
  return formatMoney(outstanding);
}

export default function RentPaymentNoticeMatrix({ matrix, compact }: Props) {
  const { columns, rows, units } = matrix;
  const unitGroups = units.map((unit) => ({
    unit,
    cols: columns.filter((c) => c.unitId === unit.id),
  }));

  if (!columns.length) {
    return <p className="text-sm text-gray-500 py-6 text-center">No charge items for this tenant yet.</p>;
  }

  return (
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
            {unitGroups.flatMap(({ unit, cols }) =>
              cols.map((col) => (
                <th key={`${unit.id}-${col.chargeType}`} className="px-2 py-1.5 border border-gray-700 text-center whitespace-nowrap">
                  {CHARGE_TYPE_LABELS[col.chargeType].split(' ')[0]}
                </th>
              ))
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.period} className="border-b border-gray-100 hover:bg-gray-50/50">
              <td className="px-3 py-2 font-medium text-gray-800 border-r border-gray-200 sticky left-0 bg-white z-10">
                {row.period}
              </td>
              {row.cells.map((cell, idx) => (
                <td
                  key={idx}
                  className={`px-2 py-2 text-right border-r border-gray-100 ${
                    cell.outstanding > 0 ? 'font-semibold text-red-700' : 'text-gray-500'
                  }`}
                >
                  {cellDisplay(cell.outstanding, cell.amountDue)}
                </td>
              ))}
              <td className="px-3 py-2 text-right font-semibold text-gray-900">
                {row.rowTotal > 0 ? formatMoney(row.rowTotal) : '—'}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="bg-brand-50 font-bold">
            <td className="px-3 py-3 border-t-2 border-brand-200 sticky left-0 bg-brand-50">總計 Total Due</td>
            {columns.map((col, idx) => {
              const colTotal = rows.reduce((s, r) => s + (r.cells[idx]?.outstanding || 0), 0);
              return (
                <td key={`${col.unitId}-${col.chargeType}`} className="px-2 py-3 text-right border-t-2 border-brand-200 text-brand-800">
                  {colTotal > 0 ? formatMoney(colTotal) : '—'}
                </td>
              );
            })}
            <td className="px-3 py-3 text-right text-lg text-brand-700 border-t-2 border-brand-200">
              {formatMoney(matrix.grandTotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
