'use client';

import {
  calc213aElectricityFee,
  calcStockRoomElectricityFee,
  electricityUsageUnits,
  formatMoney,
  type ElectricityFormula,
} from '@/lib/rentals';

interface Props {
  formula: ElectricityFormula;
  prevReading: string;
  currReading: string;
  otherUnitsUsage: string;
  ratePerUnit: string;
  onPrevReading: (v: string) => void;
  onCurrReading: (v: string) => void;
  onOtherUnitsUsage: (v: string) => void;
  onRatePerUnit: (v: string) => void;
  suggestedPrevReading?: number | null;
  inpClassName?: string;
}

export default function ElectricityMeterCalculator({
  formula,
  prevReading,
  currReading,
  otherUnitsUsage,
  ratePerUnit,
  onPrevReading,
  onCurrReading,
  onOtherUnitsUsage,
  onRatePerUnit,
  suggestedPrevReading,
  inpClassName = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm',
}: Props) {
  const prev = prevReading.trim() === '' ? null : Number(prevReading);
  const curr = currReading.trim() === '' ? null : Number(currReading);
  const other = otherUnitsUsage.trim() === '' ? null : Number(otherUnitsUsage);
  const rate = ratePerUnit.trim() === '' ? null : Number(ratePerUnit);

  const usage = electricityUsageUnits(curr, prev);
  const netUsage = formula === '213a' ? Math.max(0, usage - (other ?? 0)) : usage;
  const amount = formula === '213a'
    ? calc213aElectricityFee({ prevReading: prev, currReading: curr, otherUnitsUsage: other, ratePerUnit: rate })
    : calcStockRoomElectricityFee({ prevReading: prev, currReading: curr, ratePerUnit: rate });

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">前次錶數 Previous reading</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className={inpClassName}
            value={prevReading}
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
            className={inpClassName}
            value={currReading}
            onChange={(e) => onCurrReading(e.target.value)}
          />
        </div>
        {formula === '213a' && (
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">其他單位用電度數 Other units usage</label>
            <input
              type="number"
              min={0}
              step="0.01"
              className={inpClassName}
              value={otherUnitsUsage}
              onChange={(e) => onOtherUnitsUsage(e.target.value)}
            />
          </div>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">每度電費 Rate per unit (HK$)</label>
          <input
            type="number"
            min={0}
            step="0.0001"
            className={inpClassName}
            value={ratePerUnit}
            onChange={(e) => onRatePerUnit(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border border-yellow-200 bg-yellow-50/60 p-3 text-sm space-y-1">
        <p className="text-gray-700">
          <span className="text-gray-500">用電度數 Usage</span>{' '}
          <span className="font-mono font-semibold">{usage.toFixed(2)}</span>
          <span className="text-gray-400 text-xs ml-1">= 今次 − 前次</span>
        </p>
        {formula === '213a' && (
          <p className="text-gray-700">
            <span className="text-gray-500">實用電度數 Net usage</span>{' '}
            <span className="font-mono font-semibold">{netUsage.toFixed(2)}</span>
            <span className="text-gray-400 text-xs ml-1">= 用電度數 − 其他單位</span>
          </p>
        )}
        <p className="text-gray-900 font-semibold pt-1 border-t border-yellow-200/80">
          AMOUNT 電費 = {formatMoney(amount)}
          <span className="text-gray-500 font-normal text-xs ml-2">
            ({formula === '213a' ? '實用電度數' : '用電度數'} × 每度電費)
          </span>
        </p>
      </div>
    </div>
  );
}
