import type { CSSProperties } from 'react';
import {
  buildPrepMaterialsTable,
  capacityScheduleTag,
  formatPrepMaterialAmount,
  type PrepBatchView,
  type PrepCapacityLine,
  type PrepLineSource,
  type PrepMaterialAmounts,
  type PrepMaterialsTone,
  type StewFormulaMapLike,
} from '@/lib/kitchen-prep';

type MaterialsOrder = PrepLineSource;

interface PrepSummaryTableProps {
  order: MaterialsOrder;
  priorLines?: PrepCapacityLine[];
  batchLabel?: string | null;
  formulas?: StewFormulaMapLike;
  variant?: 'screen' | 'print';
}

const TONE: Record<PrepMaterialsTone, { box: string; head: string }> = {
  warm: {
    box: 'border-[#e0d0ae]',
    head: 'bg-[#fbf6ec] border-l-[5px] border-l-[#c4a574]',
  },
  cool: {
    box: 'border-[#c5d9ce]',
    head: 'bg-[#f3f7f5] border-l-[5px] border-l-[#7a9a88]',
  },
  slate: {
    box: 'border-[#c9d3df]',
    head: 'bg-[#f4f7fb] border-l-[5px] border-l-[#7d92ab]',
  },
};

function MaterialsCols() {
  return (
    <colgroup>
      <col style={{ width: '18%' }} />
      <col style={{ width: '12%' }} />
      <col style={{ width: '12%' }} />
      <col style={{ width: '9.5%' }} />
      <col style={{ width: '9.5%' }} />
      <col style={{ width: '9.5%' }} />
      <col style={{ width: '9.5%' }} />
      <col style={{ width: '10%' }} />
    </colgroup>
  );
}

function amountCell(qty: number, className: string) {
  return <td className={className}>{formatPrepMaterialAmount(qty)}</td>;
}

function materialCells(materials: PrepMaterialAmounts, className: string) {
  return (
    <>
      {amountCell(materials.birdNest, className)}
      {amountCell(materials.osmanthus, className)}
      {amountCell(materials.rockSugar, className)}
      {amountCell(materials.slabSugar, className)}
      {amountCell(materials.bottles, className)}
    </>
  );
}

export default function PrepSummaryTable({
  order,
  priorLines,
  batchLabel,
  formulas,
  variant = 'screen',
}: PrepSummaryTableProps) {
  const table = buildPrepMaterialsTable(order, priorLines, { batchLabel, formulas });
  const isPrint = variant === 'print';
  const text = isPrint ? 'text-sm' : 'text-sm';
  const pad = isPrint ? 'px-2 py-2' : 'px-2.5 py-3';
  const headPad = isPrint ? 'px-2 py-1.5' : 'px-2.5 py-2';
  const numberSize = isPrint ? 'text-lg' : 'text-xl';
  const nowSize = isPrint ? 'text-xl' : 'text-2xl';
  const nowClass = `prep-materials-now text-right font-bold tabular-nums leading-none text-[#8b6914] ${nowSize}`;
  const numClass = `prep-materials-num ${pad} text-right font-semibold tabular-nums leading-none text-[#1f1a14] ${numberSize}`;
  const prevClass = `prep-materials-num ${pad} text-right font-semibold tabular-nums leading-none text-[#6b6358] ${numberSize}`;
  const subtotalNumClass = `prep-materials-num ${pad} text-right font-bold tabular-nums leading-none text-[#1f1a14] ${numberSize}`;
  const footerStyle: CSSProperties = {
    background: '#f7f3eb',
    borderTop: '1.5px solid #5a6b66',
    borderBottom: '1px dotted #c8c2b6',
  };

  if (!table.boxes.length) {
    return <p className="px-4 py-6 text-center text-sm text-gray-400">Enter order quantities to see calculations.</p>;
  }

  return (
    <div className={isPrint ? 'prep-materials-table text-[#1f1a14]' : 'prep-materials-table px-2 py-3 text-[#1f1a14]'}>
      {table.batchLabel ? (
        <p className={`mb-3 font-mono font-semibold ${isPrint ? 'text-sm' : 'text-[15px]'}`}>{table.batchLabel}</p>
      ) : null}
      {table.boxes.map((box) => {
        const tone = TONE[box.tone];
        return (
          <section key={box.capacity} className={`mb-4 overflow-hidden rounded-xl border bg-white ${tone.box}`}>
            <div className={`flex items-baseline justify-between gap-3 border-b border-[#ddd6c8] px-3.5 py-3 ${tone.head}`}>
              <h3 className={`font-bold ${isPrint ? 'text-sm' : 'text-[15px]'}`}>
                {capacityScheduleTag(box.capacity)}
                <span className="font-medium text-[#6b6358]"> · {box.flavorLabel}</span>
              </h3>
              <p className={`font-semibold tabular-nums text-[#6b6358] whitespace-nowrap ${isPrint ? 'text-base' : 'text-lg'}`}>{box.headerAside}</p>
            </div>
            <div className="overflow-x-auto">
              <table className={`${text} w-full border-collapse`} style={{ tableLayout: 'fixed', minWidth: 720 }}>
                <MaterialsCols />
                <thead>
                  <tr className="bg-[#f3f0ea] text-[11px] font-semibold text-[#6b6358]">
                    <th className={`${headPad} text-left`}>口味</th>
                    <th className={`${headPad} text-right`}>上單已燉</th>
                    <th className={`${headPad} text-right`}>今次要燉</th>
                    <th className={`${headPad} text-right`}>燕餅 g</th>
                    <th className={`${headPad} text-right`}>桂花 g</th>
                    <th className={`${headPad} text-right`}>冰糖 g</th>
                    <th className={`${headPad} text-right`}>片糖 g</th>
                    <th className={`${headPad} text-right`}>玻璃瓶</th>
                  </tr>
                </thead>
                <tbody>
                  {box.rows.map((row) => (
                    <tr key={row.flavor} className="border-b border-[#ddd6c8]">
                      <td className={`${pad} text-left`}>{row.label}</td>
                      <td className={prevClass}>{row.prior}</td>
                      <td className={`${pad} ${nowClass}`}>{row.now}</td>
                      {materialCells(row.materials, numClass)}
                    </tr>
                  ))}
                  <tr className="bg-[#faf8f5] font-semibold">
                    <td className={`${pad} text-left whitespace-nowrap`}>{capacityScheduleTag(box.capacity)} 合計（今次）</td>
                    <td className={prevClass}>{box.prior}</td>
                    <td className={`${pad} ${nowClass}`}>{box.now}</td>
                    {materialCells(box.materials, subtotalNumClass)}
                  </tr>
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
      <div className="overflow-x-auto">
        <table className={`${text} w-full border-collapse`} style={{ tableLayout: 'fixed', minWidth: 720 }}>
          <MaterialsCols />
          <tbody>
            <tr>
              <td className={`${pad} text-left font-bold`} style={footerStyle}>
                各容量合計
              </td>
              <td className={prevClass} style={footerStyle}>
                {table.prior}
              </td>
              <td className={`${pad} ${nowClass}`} style={footerStyle}>
                {table.now}
              </td>
              {(['birdNest', 'osmanthus', 'rockSugar', 'slabSugar', 'bottles'] as const).map((key) => (
                <td key={key} className={subtotalNumClass} style={footerStyle}>
                  {formatPrepMaterialAmount(table.materials[key])}
                </td>
              ))}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}
