'use client';

import {
  calc213aElectricityFee,
  calcStockRoomElectricityFee,
  electricityUsageUnits,
  formatMoney,
  otherUnitsUsageTotal,
  type ElectricityFormula,
} from '@/lib/rentals';

interface Props {
  formula: ElectricityFormula;
  prevReading: string;
  currReading: string;
  meter213B: string;
  meterStockRoom1: string;
  meterStockRoom2: string;
  ratePerUnit: string;
  onPrevReading: (v: string) => void;
  onCurrReading: (v: string) => void;
  onMeter213B: (v: string) => void;
  onMeterStockRoom1: (v: string) => void;
  onMeterStockRoom2: (v: string) => void;
  onRatePerUnit: (v: string) => void;
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
  meter213B,
  meterStockRoom1,
  meterStockRoom2,
  ratePerUnit,
  onPrevReading,
  onCurrReading,
  onMeter213B,
  onMeterStockRoom1,
  onMeterStockRoom2,
  onRatePerUnit,
  suggestedPrevReading,
  inpClassName = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm',
  readOnly = false,
}: Props) {
  const prev = numOrNull(prevReading);
  const curr = numOrNull(currReading);
  const rate = numOrNull(ratePerUnit);

  const meterPartial = {
    meter213B: numOrNull(meter213B),
    meterStockRoom1: numOrNull(meterStockRoom1),
    meterStockRoom2: numOrNull(meterStockRoom2),
    otherUnitsUsage: null as number | null,
  };
  const otherTotal = formula === '213a' ? otherUnitsUsageTotal(meterPartial) : 0;

  const usage = electricityUsageUnits(curr, prev);
  const netUsage = formula === '213a' ? Math.max(0, usage - otherTotal) : usage;
  const amount = formula === '213a'
    ? calc213aElectricityFee({
      prevReading: prev,
      currReading: curr,
      meter213B: meterPartial.meter213B,
      meterStockRoom1: meterPartial.meterStockRoom1,
      meterStockRoom2: meterPartial.meterStockRoom2,
      ratePerUnit: rate,
    })
    : calcStockRoomElectricityFee({ prevReading: prev, currReading: curr, ratePerUnit: rate });

  const inputCls = `${inpClassName}${readOnly ? ' bg-gray-100/80 cursor-default' : ''}`;
  const inputProps = readOnly ? { readOnly: true as const } : {};

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

      {formula === '213a' && (
        <div className="rounded-xl border border-orange-100 bg-orange-50/50 p-4">
          <p className="text-xs font-semibold text-orange-900 mb-3">
            其他單位用電度數 Other units usage
            <span className="font-normal text-orange-700/80 ml-1">= 213B + Stock Room 1 + Stock Room 2</span>
          </p>
          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">213B電錶度數</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputCls}
                value={meter213B}
                {...inputProps}
                onChange={(e) => onMeter213B(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Stock Room 1電錶度數</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputCls}
                value={meterStockRoom1}
                {...inputProps}
                onChange={(e) => onMeterStockRoom1(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-600 mb-1">Stock Room 2電錶度數</label>
              <input
                type="number"
                min={0}
                step="0.01"
                className={inputCls}
                value={meterStockRoom2}
                {...inputProps}
                onChange={(e) => onMeterStockRoom2(e.target.value)}
              />
            </div>
          </div>
          <p className="text-sm text-gray-700 mt-3 pt-3 border-t border-orange-100">
            <span className="text-gray-500">其他單位用電度數 Total</span>{' '}
            <span className="font-mono font-semibold">{otherTotal.toFixed(2)}</span>
          </p>
        </div>
      )}

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
