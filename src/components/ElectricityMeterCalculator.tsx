'use client';

import {
  calc213aElectricityFee,
  calcStockRoomElectricityFee,
  electricityUsageUnits,
  formatMoney,
  otherUnitsUsageTotal,
  type ElectricityFormula,
} from '@/lib/rentals';

export type SharedDeductionUnitOption = { id: number; unitName: string };

interface Props {
  formula: ElectricityFormula;
  prevReading: string;
  currReading: string;
  ratePerUnit: string;
  /** For shared-meter (213a) formula: configurable other-unit usage inputs. */
  deductionUnits?: SharedDeductionUnitOption[];
  otherUnitUsages?: Record<string, string>;
  onPrevReading: (v: string) => void;
  onCurrReading: (v: string) => void;
  onRatePerUnit: (v: string) => void;
  onOtherUnitUsage?: (unitId: number, value: string) => void;
  suggestedPrevReading?: number | null;
  inpClassName?: string;
  readOnly?: boolean;
}

function numOrNull(s: string): number | null {
  return s.trim() === '' ? null : Number(s);
}

export default function ElectricityMeterCalculator({
  formula,
  prevReading,
  currReading,
  ratePerUnit,
  deductionUnits = [],
  otherUnitUsages = {},
  onPrevReading,
  onCurrReading,
  onRatePerUnit,
  onOtherUnitUsage,
  suggestedPrevReading,
  inpClassName = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm',
  readOnly = false,
}: Props) {
  const prev = numOrNull(prevReading);
  const curr = numOrNull(currReading);
  const rate = numOrNull(ratePerUnit);

  const usageMap: Record<string, number | null> = {};
  for (const u of deductionUnits) {
    usageMap[String(u.id)] = numOrNull(otherUnitUsages[String(u.id)] || '');
  }
  const meterPartial = {
    otherUnitUsages: usageMap,
    otherUnitsUsage: null as number | null,
  };
  const otherTotal = formula === '213a' ? otherUnitsUsageTotal(meterPartial) : 0;

  const usage = electricityUsageUnits(curr, prev);
  const netUsage = formula === '213a' ? Math.max(0, usage - otherTotal) : usage;
  const amount = formula === '213a'
    ? calc213aElectricityFee({
      prevReading: prev,
      currReading: curr,
      otherUnitUsages: usageMap,
      ratePerUnit: rate,
    })
    : calcStockRoomElectricityFee({ prevReading: prev, currReading: curr, ratePerUnit: rate });

  const inputCls = `${inpClassName}${readOnly ? ' bg-gray-100/80 cursor-default' : ''}`;
  const inputProps = readOnly ? { readOnly: true as const } : {};
  const showOther = formula === '213a' && deductionUnits.length > 0;

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">前次錶數 Previous reading</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputCls}
            value={prevReading}
            {...inputProps}
            onChange={(e) => onPrevReading(e.target.value)}
            placeholder={suggestedPrevReading != null ? String(suggestedPrevReading) : ''}
          />
          {suggestedPrevReading != null && !prevReading && (
            <p className="text-[10px] text-gray-400 mt-1">上次紀錄 Last: {suggestedPrevReading}</p>
          )}
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">今次錶數 Current reading</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className={inputCls}
            value={currReading}
            {...inputProps}
            onChange={(e) => onCurrReading(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">每度電費 Rate per unit (HK$)</label>
          <input
            type="number"
            min={0}
            step="0.0001"
            className={inputCls}
            value={ratePerUnit}
            {...inputProps}
            onChange={(e) => onRatePerUnit(e.target.value)}
          />
        </div>
      </div>

      {showOther && (
        <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-4">
          <p className="text-xs font-semibold text-orange-900 mb-3">
            其他單位用電度數 Other units usage
          </p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {deductionUnits.map((u) => (
              <div key={u.id}>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {u.unitName}{biSuffix(u.unitName)}
                </label>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  className={inputCls}
                  value={otherUnitUsages[String(u.id)] || ''}
                  {...inputProps}
                  onChange={(e) => onOtherUnitUsage?.(u.id, e.target.value)}
                />
              </div>
            ))}
          </div>
          <p className="text-sm text-gray-700 mt-3 pt-3 border-t border-orange-100">
            <span className="text-gray-500">其他單位用電度數 Total</span>{' '}
            <span className="font-mono font-semibold">{otherTotal.toFixed(2)}</span>
          </p>
        </div>
      )}

      <div className="rounded-lg border border-yellow-200 bg-yellow-50/60 p-3 text-sm space-y-1">
        {formula === '213a' ? (
          <>
            <p className="text-gray-700">
              <span className="text-gray-500">用電度數 Usage</span>{' '}
              <span className="font-mono font-semibold">{usage.toFixed(2)}</span>
              <span className="text-gray-400 text-xs ml-1">= 今次 − 前次</span>
            </p>
            <p className="text-gray-700">
              <span className="text-gray-500">實用電度數 Net usage</span>{' '}
              <span className="font-mono font-semibold">{netUsage.toFixed(2)}</span>
              <span className="text-gray-400 text-xs ml-1">= 用電度數 − 其他單位</span>
            </p>
            <p className="text-gray-900 font-semibold pt-1 border-t border-yellow-200/80">
              電費 = {formatMoney(amount)}
              <span className="text-gray-500 font-normal text-xs ml-2">(實用電度數 × 每度電費)</span>
            </p>
          </>
        ) : (
          <p className="text-gray-900 font-semibold">
            電費 = {formatMoney(amount)}
            <span className="text-gray-500 font-normal text-xs ml-2 block mt-1 sm:inline sm:mt-0">
              = ({curr?.toFixed(2) ?? '—'} − {prev?.toFixed(2) ?? '—'}) × {rate?.toFixed(4) ?? '—'}
            </span>
          </p>
        )}
      </div>
    </div>
  );
}

function biSuffix(unitName: string): string {
  return unitName.trim() ? '電錶度數' : '';
}
