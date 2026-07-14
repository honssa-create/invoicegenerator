'use client';

import {
  calcWaterFeeFromMeter,
  formatMoney,
  waterUsageUnits,
} from '@/lib/rentals';

interface Props {
  prevReading: string;
  currReading: string;
  ratePerUnit: string;
  onPrevReading: (v: string) => void;
  onCurrReading: (v: string) => void;
  onRatePerUnit: (v: string) => void;
  suggestedPrevReading?: number | null;
  inpClassName?: string;
  readOnly?: boolean;
}

function numOrNull(s: string): number | null {
  return s.trim() === '' ? null : Number(s);
}

export default function WaterMeterCalculator({
  prevReading,
  currReading,
  ratePerUnit,
  onPrevReading,
  onCurrReading,
  onRatePerUnit,
  suggestedPrevReading,
  inpClassName = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm',
  readOnly = false,
}: Props) {
  const prev = numOrNull(prevReading);
  const curr = numOrNull(currReading);
  const rate = numOrNull(ratePerUnit);
  const usage = waterUsageUnits(curr, prev);
  const amount = calcWaterFeeFromMeter({ prevReading: prev, currReading: curr, ratePerUnit: rate });

  return (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">前次錶數 Previous reading</label>
          <input
            type="number"
            min={0}
            step="0.01"
            className={`${inpClassName}${readOnly ? ' bg-gray-100/80 cursor-default' : ''}`}
            value={prevReading}
            readOnly={readOnly}
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
            className={`${inpClassName}${readOnly ? ' bg-gray-100/80 cursor-default' : ''}`}
            value={currReading}
            readOnly={readOnly}
            onChange={(e) => onCurrReading(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">每度水費 Rate per unit (HK$)</label>
          <input
            type="number"
            min={0}
            step="0.0001"
            className={`${inpClassName}${readOnly ? ' bg-gray-100/80 cursor-default' : ''}`}
            value={ratePerUnit}
            readOnly={readOnly}
            onChange={(e) => onRatePerUnit(e.target.value)}
          />
        </div>
      </div>

      <div className="rounded-lg border border-blue-200 bg-blue-50/60 p-3 text-sm space-y-1">
        <p className="text-gray-700">
          <span className="text-gray-500">用水度數 Usage</span>{' '}
          <span className="font-mono font-semibold">{usage.toFixed(2)}</span>
          <span className="text-gray-400 text-xs ml-1">= 今次 − 前次</span>
        </p>
        <p className="text-gray-900 font-semibold pt-1 border-t border-blue-200/80">
          AMOUNT 水費 = {formatMoney(amount)}
          <span className="text-gray-500 font-normal text-xs ml-2">(用水度數 × 每度水費)</span>
        </p>
      </div>
    </div>
  );
}
