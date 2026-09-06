'use client';

import ElectricityMeterCalculator from '@/components/ElectricityMeterCalculator';
import WaterMeterCalculator from '@/components/WaterMeterCalculator';
import { MSG, bi } from '@/lib/ui-labels';
import {
  formatDueDayLabel,
  formatMoney,
  formatUtilityAmount,
  RENTAL_STATUS_BADGE,
  RENTAL_STATUS_LABELS,
  type ElectricityFormula,
  type RentRecord,
  type RentalDisplayStatus,
} from '@/lib/rentals';
import { periodDateInputProps } from '@/lib/rental-unit-detail-shared';

interface Props {
  period: string;
  readOnly: boolean;
  rec: RentRecord | null;
  baseRent: string;
  dueDateDay: string;
  showUtilityFees: boolean;
  electricityFormula: ElectricityFormula | null;
  waterMeterFormula: boolean;
  fieldCls: string;
  inp: string;
  autoRentPeriod: { formattedRange: string };
  baseRentPeriodFrom: string;
  setBaseRentPeriodFrom: (v: string) => void;
  baseRentPeriodTo: string;
  setBaseRentPeriodTo: (v: string) => void;
  waterFee: string;
  setWaterFee: (v: string) => void;
  waterPeriodFrom: string;
  setWaterPeriodFrom: (v: string) => void;
  waterPeriodTo: string;
  setWaterPeriodTo: (v: string) => void;
  electricityFee: string;
  setElectricityFee: (v: string) => void;
  electricityPeriodFrom: string;
  setElectricityPeriodFrom: (v: string) => void;
  electricityPeriodTo: string;
  setElectricityPeriodTo: (v: string) => void;
  meterPrevReading: string;
  setMeterPrevReading: (v: string) => void;
  meterCurrReading: string;
  setMeterCurrReading: (v: string) => void;
  meterRatePerUnit: string;
  setMeterRatePerUnit: (v: string) => void;
  otherUnitUsages: Record<string, string>;
  setOtherUnitUsages: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  waterMeterPrev: string;
  setWaterMeterPrev: (v: string) => void;
  waterMeterCurr: string;
  setWaterMeterCurr: (v: string) => void;
  waterMeterRate: string;
  setWaterMeterRate: (v: string) => void;
  suggestedPrevReading: number | null;
  suggestedPrevWaterReading: number | null;
  sharedMeterDeductionUnits: { id: number; unitName: string }[];
  utilityNote: string;
  setUtilityNote: (v: string) => void;
  utilitySaveState: 'idle' | 'saving' | 'saved' | 'error';
  utilityCanUndo: boolean;
  undoUtilitySave: () => void;
  liveElectricityFee: number;
  liveWaterFee: number;
  liveMonthTotal: number;
  recStatus: RentalDisplayStatus;
  balance: number;
}

export default function RentalUtilitiesBillingSection({
  period,
  readOnly,
  rec,
  baseRent,
  dueDateDay,
  showUtilityFees,
  electricityFormula,
  waterMeterFormula,
  fieldCls,
  inp,
  autoRentPeriod,
  baseRentPeriodFrom,
  setBaseRentPeriodFrom,
  baseRentPeriodTo,
  setBaseRentPeriodTo,
  waterFee,
  setWaterFee,
  waterPeriodFrom,
  setWaterPeriodFrom,
  waterPeriodTo,
  setWaterPeriodTo,
  electricityFee,
  setElectricityFee,
  electricityPeriodFrom,
  setElectricityPeriodFrom,
  electricityPeriodTo,
  setElectricityPeriodTo,
  meterPrevReading,
  setMeterPrevReading,
  meterCurrReading,
  setMeterCurrReading,
  meterRatePerUnit,
  setMeterRatePerUnit,
  otherUnitUsages,
  setOtherUnitUsages,
  waterMeterPrev,
  setWaterMeterPrev,
  waterMeterCurr,
  setWaterMeterCurr,
  waterMeterRate,
  setWaterMeterRate,
  suggestedPrevReading,
  suggestedPrevWaterReading,
  sharedMeterDeductionUnits,
  utilityNote,
  setUtilityNote,
  utilitySaveState,
  utilityCanUndo,
  undoUtilitySave,
  liveElectricityFee,
  liveWaterFee,
  liveMonthTotal,
  recStatus,
  balance,
}: Props) {
  return (
    <div className={`bg-white rounded-2xl border border-gray-200 p-6 ${readOnly ? 'opacity-90' : ''}`}>
      <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
        <div>
          <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold">水電費紀錄與帳單</p>
          <h2 className="text-lg font-semibold text-gray-900">Utilities & Billing — {period}</h2>
        </div>
      </div>
      <p className="text-xs text-gray-500 mb-4">
        {readOnly
          ? 'Contract ended — billing locked 合約已完結，不可編輯'
          : 'Changes auto-save as you type. Use Undo 復原 if you made a mistake.'}
      </p>
      {rec ? (
        <>
          <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4 mb-4">
            <p className="text-sm font-semibold text-brand-800 mb-3">基本租金 Base Rent</p>
            <div className="grid md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Amount 金額</label>
                <div className="px-3 py-2.5 rounded-lg bg-white border border-gray-200 text-sm font-semibold">
                  {formatMoney(Number(baseRent) || rec.baseRent)}
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Period From 計費起始</label>
                <input {...periodDateInputProps(baseRentPeriodFrom, setBaseRentPeriodFrom, fieldCls, readOnly)} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                <input {...periodDateInputProps(baseRentPeriodTo, setBaseRentPeriodTo, fieldCls, readOnly)} />
              </div>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Amount locked to lease base rent · Auto ({formatDueDayLabel(Number(dueDateDay) || 1)}):{' '}
              {autoRentPeriod.formattedRange}
            </p>
          </div>

          {showUtilityFees && (
            <div className="rounded-xl border border-yellow-100 bg-yellow-50/40 p-4 mb-4">
              <p className="text-sm font-semibold text-yellow-800 mb-3">電費 Electricity Fee</p>
              {electricityFormula ? (
                <>
                  <p className="text-xs text-yellow-700/80 mb-3">
                    {electricityFormula === '213a'
                      ? '大分錶分拆: 實用電度數 = (今次 − 前次) − 其他單位；電費 = 實用電度數 × 每度電費'
                      : '獨立分錶: 電費 = (今次 − 前次) × 每度電費'}
                  </p>
                  <div className="grid md:grid-cols-3 gap-3 mb-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Amount 金額</label>
                      <div className="px-3 py-2.5 rounded-lg bg-white border border-yellow-200 text-sm font-semibold text-yellow-900">
                        {formatMoney(liveElectricityFee)}
                      </div>
                    </div>
                  </div>
                  <ElectricityMeterCalculator
                    formula={electricityFormula}
                    prevReading={meterPrevReading}
                    currReading={meterCurrReading}
                    ratePerUnit={meterRatePerUnit}
                    deductionUnits={sharedMeterDeductionUnits}
                    otherUnitUsages={otherUnitUsages}
                    onPrevReading={setMeterPrevReading}
                    onCurrReading={setMeterCurrReading}
                    onRatePerUnit={setMeterRatePerUnit}
                    onOtherUnitUsage={(unitId, value) => {
                      setOtherUnitUsages((prev) => ({ ...prev, [String(unitId)]: value }));
                    }}
                    suggestedPrevReading={suggestedPrevReading}
                    inpClassName={fieldCls}
                    readOnly={readOnly}
                  />
                  <div className="grid md:grid-cols-2 gap-3 mt-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Period From 計費起始</label>
                      <input {...periodDateInputProps(electricityPeriodFrom, setElectricityPeriodFrom, inp, readOnly)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                      <input {...periodDateInputProps(electricityPeriodTo, setElectricityPeriodTo, inp, readOnly)} />
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Amount 金額</label>
                    <input
                      type="number"
                      min={0}
                      value={electricityFee}
                      onChange={(e) => setElectricityFee(e.target.value)}
                      className={inp}
                      placeholder="0 → shows /"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Period From 計費起始</label>
                    <input {...periodDateInputProps(electricityPeriodFrom, setElectricityPeriodFrom, inp, readOnly)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                    <input {...periodDateInputProps(electricityPeriodTo, setElectricityPeriodTo, inp, readOnly)} />
                  </div>
                </div>
              )}
            </div>
          )}

          {showUtilityFees && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/40 p-4 mb-4">
              <p className="text-sm font-semibold text-blue-800 mb-3">水費 Water Fee</p>
              {waterMeterFormula ? (
                <>
                  <p className="text-xs text-blue-700/80 mb-3">213A formula: 用水度數 = 今次錶數 − 前次錶數</p>
                  <WaterMeterCalculator
                    prevReading={waterMeterPrev}
                    currReading={waterMeterCurr}
                    ratePerUnit={waterMeterRate}
                    onPrevReading={setWaterMeterPrev}
                    onCurrReading={setWaterMeterCurr}
                    onRatePerUnit={setWaterMeterRate}
                    suggestedPrevReading={suggestedPrevWaterReading}
                    inpClassName={fieldCls}
                    readOnly={readOnly}
                  />
                  <div className="grid md:grid-cols-2 gap-3 mt-4">
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Period From 計費起始</label>
                      <input {...periodDateInputProps(waterPeriodFrom, setWaterPeriodFrom, inp, readOnly)} />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                      <input {...periodDateInputProps(waterPeriodTo, setWaterPeriodTo, inp, readOnly)} />
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Amount 金額</label>
                    <input
                      type="number"
                      min={0}
                      value={waterFee}
                      onChange={(e) => setWaterFee(e.target.value)}
                      className={inp}
                      placeholder="0 → shows /"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Period From 計費起始</label>
                    <input {...periodDateInputProps(waterPeriodFrom, setWaterPeriodFrom, inp, readOnly)} />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-500 mb-1">Period To 計費結束</label>
                    <input {...periodDateInputProps(waterPeriodTo, setWaterPeriodTo, inp, readOnly)} />
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="flex items-end gap-4">
            <div className="flex-1">
              <label className="block text-xs font-medium text-gray-500 mb-1">
                {bi('Invoice note (optional)', '發票備註（選填）')}
              </label>
              <input
                className={inp}
                value={utilityNote}
                onChange={(e) => setUtilityNote(e.target.value)}
                placeholder="e.g. Water meter 1234"
              />
            </div>
            <div className="flex flex-col items-end gap-1 pb-2.5 min-w-[5.5rem]">
              <p className="text-xs text-gray-500 whitespace-nowrap text-right">
                {utilitySaveState === 'saving' && 'Saving… 儲存中'}
                {utilitySaveState === 'saved' && <span className="text-green-600">Saved ✓ 已儲存</span>}
                {utilitySaveState === 'error' && <span className="text-red-600">{MSG.saveFailed}</span>}
              </p>
              {utilityCanUndo && (
                <button
                  type="button"
                  onClick={() => void undoUtilitySave()}
                  className="text-xs text-brand-600 font-medium hover:underline"
                >
                  Undo 復原
                </button>
              )}
            </div>
          </div>

          <div className="mt-4 rounded-xl border-2 border-brand-100 bg-brand-50 p-4 flex items-center justify-between flex-wrap gap-3">
            <div>
              <p className="text-xs text-gray-500">Total this month</p>
              <p className="text-3xl font-bold text-brand-700">{formatMoney(liveMonthTotal)}</p>
              <p className="text-xs text-gray-500 mt-1">
                Rent {formatMoney(Number(baseRent) || rec.baseRent)} + Water {formatUtilityAmount(liveWaterFee)} + Elec{' '}
                {formatUtilityAmount(liveElectricityFee)}
              </p>
              {rec.amountPaid > 0 && (
                <p className="text-sm text-green-700 mt-2 font-medium">
                  Paid {formatMoney(rec.amountPaid)}
                  {balance > 0 && <span className="text-orange-700"> · Outstanding {formatMoney(balance)}</span>}
                </p>
              )}
            </div>
            <span className={`px-3 py-1.5 rounded-full text-sm font-semibold ${RENTAL_STATUS_BADGE[recStatus]}`}>
              {RENTAL_STATUS_LABELS[recStatus]}
            </span>
          </div>
        </>
      ) : (
        <p className="text-sm text-gray-400">{MSG.noRecordForPeriod}</p>
      )}
    </div>
  );
}
