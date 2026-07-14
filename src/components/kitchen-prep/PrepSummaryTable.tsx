import {
  PREP_CAPACITY_LABELS,
  PREP_SUMMARY_TYPO,
  formatGrams,
  type PrepCalculation,
  type PrepCapacity,
} from '@/lib/kitchen-prep';

interface PrepSummaryTableProps {
  calc: PrepCalculation;
  capacity: PrepCapacity;
  variant?: 'screen' | 'print';
}

export default function PrepSummaryTable({ calc, capacity, variant = 'screen' }: PrepSummaryTableProps) {
  const activeRows = calc.rows.filter((r) => r.orderQty > 0);
  const isPrint = variant === 'print';

  const theadClass = isPrint
    ? 'bg-gray-900 text-white'
    : 'text-gray-500 border-b border-gray-200';
  const thClass = `${PREP_SUMMARY_TYPO.th} ${isPrint ? 'text-white' : ''}`;
  const rowClass = isPrint ? 'border-b border-gray-200' : 'hover:bg-gray-50 divide-y divide-gray-100';
  const cellPad = isPrint ? 'px-4 py-4' : 'px-6 py-4';
  const tfootClass = isPrint ? 'bg-gray-100 font-bold' : 'bg-brand-50 border-t-2 border-brand-200';

  return (
    <table className={`${PREP_SUMMARY_TYPO.table} ${isPrint ? '' : 'min-w-[880px]'}`}>
      <thead>
        <tr className={`${PREP_SUMMARY_TYPO.thead} ${theadClass}`}>
          <th className={`${thClass} text-left`}>容量 Capacity</th>
          <th className={`${thClass} text-left`}>Flavor 口味</th>
          <th className={`${thClass} text-right`}>Order Qty</th>
          <th className={`${thClass} text-right`}>Actual Qty 實際生產樽數</th>
          <th className={`${thClass} text-right`}>燕餅 Bird&apos;s Nest</th>
          <th className={`${thClass} text-right`}>Flavor Ingredient</th>
          <th className={`${thClass} text-right`}>冰糖 Rock Sugar</th>
          <th className={`${thClass} text-right`}>片糖 Slab Sugar</th>
        </tr>
      </thead>
      <tbody className={isPrint ? '' : 'divide-y divide-gray-100'}>
        {activeRows.map((r) => (
          <tr key={r.flavor} className={rowClass}>
            <td className={`${cellPad} ${PREP_SUMMARY_TYPO.capacityBadge} text-gray-700`}>
              {PREP_CAPACITY_LABELS[capacity]}
            </td>
            <td className={`${cellPad} ${PREP_SUMMARY_TYPO.flavorCell} text-gray-900`}>{r.label}</td>
            <td className={`${cellPad} text-right ${PREP_SUMMARY_TYPO.qtyCell} text-gray-700`}>{r.orderQty}</td>
            <td className={`${cellPad} text-right`}>
              <span className={`${PREP_SUMMARY_TYPO.actualQtyCell} text-brand-700`}>{r.actualQty}</span>
              {r.weddingBuffer > 0 && (
                <p className="text-xs text-gray-500 mt-1">{r.orderQty} + {r.weddingBuffer} buffer</p>
              )}
            </td>
            <td className={`${cellPad} text-right ${PREP_SUMMARY_TYPO.gramCell} text-gray-900`}>
              {formatGrams(r.birdNestGrams)}
            </td>
            <td className={`${cellPad} text-right ${PREP_SUMMARY_TYPO.gramCell} text-gray-900`}>
              {formatGrams(r.flavorGrams)}
            </td>
            <td className={`${cellPad} text-right ${PREP_SUMMARY_TYPO.gramCell} text-gray-700`}>
              {r.flavor === 'osmanthus' ? '—' : formatGrams(r.rockSugarGrams)}
            </td>
            <td className={`${cellPad} text-right ${PREP_SUMMARY_TYPO.gramCell} text-gray-700`}>
              {r.flavor === 'osmanthus' ? formatGrams(r.slabSugarGrams) : '—'}
            </td>
          </tr>
        ))}
        {activeRows.length === 0 && (
          <tr>
            <td colSpan={8} className={`${cellPad} text-center text-gray-400`}>
              Enter order quantities to see calculations.
            </td>
          </tr>
        )}
      </tbody>
      {activeRows.length > 0 && calc.formulaReady && (
        <tfoot className={tfootClass}>
          <tr>
            <td className={`${cellPad} ${PREP_SUMMARY_TYPO.totalLabel} text-brand-900`} colSpan={2}>
              TOTAL 合計
            </td>
            <td className={cellPad} />
            <td className={`${cellPad} text-right ${PREP_SUMMARY_TYPO.totalQty} text-brand-800`}>
              {calc.totals.bottles} 樽
            </td>
            <td className={`${cellPad} text-right ${PREP_SUMMARY_TYPO.totalGram} text-brand-800`}>
              {formatGrams(calc.totals.birdNestGrams)}
            </td>
            <td className={`${cellPad} text-right ${PREP_SUMMARY_TYPO.totalGram} text-brand-800`}>
              {formatGrams(calc.totals.flavorGrams)}
            </td>
            <td className={`${cellPad} text-right ${PREP_SUMMARY_TYPO.totalGram} text-brand-800`}>
              {formatGrams(calc.totals.rockSugarGrams)}
            </td>
            <td className={`${cellPad} text-right ${PREP_SUMMARY_TYPO.totalGram} text-brand-800`}>
              {formatGrams(calc.totals.slabSugarGrams)}
            </td>
          </tr>
        </tfoot>
      )}
    </table>
  );
}
