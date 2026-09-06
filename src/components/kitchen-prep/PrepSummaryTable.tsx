import {
  PREP_CAPACITY_LABELS,
  PREP_SUMMARY_TYPO,
  BIRD_NEST_TYPE_LABELS,
  formatPrepIngredientQty,
  STEW_GLASS_BOTTLE_STOCK_NAMES,
  STEW_WATER_BOIL_SUGAR,
  STEW_WATER_COLD_SOAK,
  type PrepCalculation,
  type PrepCapacity,
} from '@/lib/kitchen-prep';

interface PrepSummaryTableProps {
  calc: PrepCalculation;
  capacity: PrepCapacity;
  variant?: 'screen' | 'print';
}

export default function PrepSummaryTable({ calc, capacity, variant = 'screen' }: PrepSummaryTableProps) {
  const activeRows = calc.rows.filter((r) => r.orderQty > 0 || r.actualQty > 0);
  const isPrint = variant === 'print';

  const theadClass = isPrint
    ? 'bg-gray-900 text-white'
    : 'text-gray-500 border-b border-gray-200';
  const thClass = isPrint
    ? 'px-2 py-2 text-[10px] font-semibold leading-tight'
    : `${PREP_SUMMARY_TYPO.th}`;
  const thColor = isPrint ? 'text-white' : '';
  const rowClass = isPrint ? 'border-b border-gray-200' : 'hover:bg-gray-50 divide-y divide-gray-100';
  const cellPad = isPrint ? 'px-2 py-2' : 'px-6 py-4';
  const tfootClass = isPrint ? 'bg-gray-100 font-bold' : 'bg-brand-50 border-t-2 border-brand-200';
  const flavorClass = isPrint ? 'text-sm font-bold leading-snug' : PREP_SUMMARY_TYPO.flavorCell;
  const qtyClass = isPrint ? 'text-sm font-semibold tabular-nums' : PREP_SUMMARY_TYPO.qtyCell;
  const actualQtyClass = isPrint ? 'text-base font-bold tabular-nums' : PREP_SUMMARY_TYPO.actualQtyCell;
  const gramClass = isPrint ? 'text-xs font-bold tabular-nums' : PREP_SUMMARY_TYPO.gramCell;
  const totalLabelClass = isPrint ? 'text-xs font-bold' : PREP_SUMMARY_TYPO.totalLabel;
  const totalQtyClass = isPrint ? 'text-sm font-bold tabular-nums' : PREP_SUMMARY_TYPO.totalQty;
  const totalGramClass = isPrint ? 'text-xs font-bold tabular-nums' : PREP_SUMMARY_TYPO.totalGram;
  const capacityClass = isPrint ? 'text-xs font-semibold' : PREP_SUMMARY_TYPO.capacityBadge;

  const ingredientCols = (() => {
    const names = new Set<string>();
    for (const r of activeRows) {
      for (const name of Object.keys(r.ingredientGrams || {})) names.add(name);
    }
    for (const name of Object.keys(calc.totals.ingredientGrams || {})) names.add(name);
    // Stable preferred order, then any extras
    const preferred = [
      '大燕餅',
      '細燕餅',
      '桂花',
      '紅棗',
      '冰糖',
      '片糖',
      STEW_WATER_BOIL_SUGAR,
      STEW_WATER_COLD_SOAK,
      ...Object.values(STEW_GLASS_BOTTLE_STOCK_NAMES),
    ];
    const rest = Array.from(names).filter((n) => !preferred.includes(n)).sort();
    return [...preferred.filter((n) => names.has(n)), ...rest];
  })();

  const colSpanEmpty = 4 + Math.max(ingredientCols.length, 1);

  return (
    <div className={isPrint ? 'prep-print-table-wrap -mx-1' : 'overflow-x-auto'}>
    <table className={`${PREP_SUMMARY_TYPO.table} ${isPrint ? 'prep-summary-table--print text-xs leading-tight' : 'min-w-[960px]'}`}>
      <thead>
        <tr className={`${isPrint ? 'text-[10px] uppercase tracking-wide' : PREP_SUMMARY_TYPO.thead} ${theadClass}`}>
          <th className={`${thClass} ${thColor} text-left`}>容量 Capacity</th>
          <th className={`${thClass} ${thColor} text-left`}>Flavor 口味</th>
          <th className={`${thClass} ${thColor} text-right`}>Order Qty</th>
          <th className={`${thClass} ${thColor} text-right`}>Actual Qty 實際生產樽數</th>
          {ingredientCols.map((name) => (
            <th key={name} className={`${thClass} ${thColor} text-right`}>
              {name}
            </th>
          ))}
        </tr>
      </thead>
      <tbody className={isPrint ? '' : 'divide-y divide-gray-100'}>
        {activeRows.map((r) => (
          <tr key={r.flavor} className={rowClass}>
            <td className={`${cellPad} ${capacityClass} text-gray-700`}>
              {PREP_CAPACITY_LABELS[capacity] || capacity}
            </td>
            <td className={`${cellPad} ${flavorClass} text-gray-900`}>
              {r.label}
              {r.birdNestType && (
                <span className="block text-[10px] font-normal text-gray-500 mt-0.5">
                  {BIRD_NEST_TYPE_LABELS[r.birdNestType]}
                </span>
              )}
            </td>
            <td className={`${cellPad} text-right ${qtyClass} text-gray-700`}>{r.orderQty}</td>
            <td className={`${cellPad} text-right`}>
              <span className={`${actualQtyClass} text-brand-700`}>{r.actualQty}</span>
              {r.extraQty > 0 && (
                <p className="text-[10px] text-gray-500 mt-0.5">{r.orderQty} + {r.extraQty}</p>
              )}
            </td>
            {ingredientCols.map((name) => {
              const qty = r.ingredientGrams?.[name] || 0;
              return (
                <td key={name} className={`${cellPad} text-right ${gramClass} text-gray-900`}>
                  {qty > 0 ? formatPrepIngredientQty(name, qty) : '—'}
                </td>
              );
            })}
          </tr>
        ))}
        {activeRows.length === 0 && (
          <tr>
            <td colSpan={colSpanEmpty} className={`${cellPad} text-center text-gray-400`}>
              Enter order quantities to see calculations.
            </td>
          </tr>
        )}
      </tbody>
      {activeRows.length > 0 && calc.formulaReady && (
        <tfoot className={tfootClass}>
          <tr>
            <td className={`${cellPad} ${totalLabelClass} text-brand-900`} colSpan={2}>
              TOTAL 合計
            </td>
            <td className={cellPad} />
            <td className={`${cellPad} text-right ${totalQtyClass} text-brand-800`}>
              {calc.totals.bottles} 樽
            </td>
            {ingredientCols.map((name) => (
              <td key={name} className={`${cellPad} text-right ${totalGramClass} text-brand-800`}>
                {formatPrepIngredientQty(name, calc.totals.ingredientGrams?.[name] || 0)}
              </td>
            ))}
          </tr>
        </tfoot>
      )}
    </table>
    </div>
  );
}
