'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import {
  calcElectricityFeeForFormula,
  calcWaterFeeFromMeter,
  calculateBasicRentPeriod,
  fromFormDate,
  meterDataFromInputs,
  resolveElectricityFormula,
  unitHasWaterMeterFormula,
  waterMeterDataFromInputs,
  hydrateOtherUnitUsagesFromLegacy,
  toFormDate,
  type RentRecord,
  type UtilityBillingMode,
} from '@/lib/rentals';
import type { RentalUnitDetailPayload, UtilitySnapshot } from '@/lib/rental-unit-detail-shared';

interface Options {
  period: string;
  dueDateDay: string;
  utilityBillingMode: UtilityBillingMode;
  unitName: string | undefined;
  currentRecord: RentRecord | null | undefined;
  readOnlyLease: boolean | undefined;
  setCurrentRecord: (record: RentRecord) => void;
  ensurePeriodRecord: () => Promise<number | null>;
  reload: () => void;
  skipPeriodRecalcRef: React.MutableRefObject<boolean>;
}

export function useRentalUnitUtilities({
  period,
  dueDateDay,
  utilityBillingMode,
  unitName,
  currentRecord,
  readOnlyLease,
  setCurrentRecord,
  ensurePeriodRecord,
  reload,
  skipPeriodRecalcRef,
}: Options) {
  const [baseRentPeriodFrom, setBaseRentPeriodFrom] = useState('');
  const [baseRentPeriodTo, setBaseRentPeriodTo] = useState('');
  const [waterFee, setWaterFee] = useState('');
  const [waterPeriodFrom, setWaterPeriodFrom] = useState('');
  const [waterPeriodTo, setWaterPeriodTo] = useState('');
  const [electricityFee, setElectricityFee] = useState('');
  const [electricityPeriodFrom, setElectricityPeriodFrom] = useState('');
  const [electricityPeriodTo, setElectricityPeriodTo] = useState('');
  const [meterPrevReading, setMeterPrevReading] = useState('');
  const [meterCurrReading, setMeterCurrReading] = useState('');
  const [otherUnitUsages, setOtherUnitUsages] = useState<Record<string, string>>({});
  const [meterRatePerUnit, setMeterRatePerUnit] = useState('');
  const [waterMeterPrev, setWaterMeterPrev] = useState('');
  const [waterMeterCurr, setWaterMeterCurr] = useState('');
  const [waterMeterRate, setWaterMeterRate] = useState('');
  const [suggestedPrevReading, setSuggestedPrevReading] = useState<number | null>(null);
  const [suggestedPrevWaterReading, setSuggestedPrevWaterReading] = useState<number | null>(null);
  const [utilityNote, setUtilityNote] = useState('');
  const [utilitySaveState, setUtilitySaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [utilityCanUndo, setUtilityCanUndo] = useState(false);

  const skipUtilityAutoSaveRef = useRef(true);
  const utilitySaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastCommittedUtilityRef = useRef<UtilitySnapshot | null>(null);
  const undoUtilitySnapshotRef = useRef<UtilitySnapshot | null>(null);
  const skipUndoCaptureRef = useRef(false);

  const billingYearMonth = useCallback(() => {
    const [year, month] = period.split('-').map(Number);
    return { year, monthIndex: month - 1 };
  }, [period]);

  const calcBasicRentPeriod = useCallback(
    (rentPaymentDay: number) => {
      const { year, monthIndex } = billingYearMonth();
      return calculateBasicRentPeriod(rentPaymentDay, year, monthIndex);
    },
    [billingYearMonth],
  );

  const showUtilityFees = utilityBillingMode !== 'tenant_pays';
  const electricityFormula =
    unitName && showUtilityFees ? resolveElectricityFormula(unitName, utilityBillingMode) : null;
  const waterMeterFormula = unitName && showUtilityFees ? unitHasWaterMeterFormula(unitName) : false;

  const prepareLoad = useCallback(() => {
    setUtilityCanUndo(false);
    skipPeriodRecalcRef.current = true;
    skipUtilityAutoSaveRef.current = true;
  }, [skipPeriodRecalcRef]);

  const finishLoad = useCallback(() => {
    skipPeriodRecalcRef.current = false;
    window.setTimeout(() => {
      skipUtilityAutoSaveRef.current = false;
    }, 200);
  }, [skipPeriodRecalcRef]);

  const hydrateFromPayload = useCallback(
    (d: RentalUnitDetailPayload) => {
      const rec = d.currentRecord;
      if (!rec) return;
      const calc = calcBasicRentPeriod(Number(d.unit.dueDateDay) || 1);
      setBaseRentPeriodFrom(rec.baseRentPeriodFrom ? toFormDate(rec.baseRentPeriodFrom) : calc.periodFrom);
      setBaseRentPeriodTo(rec.baseRentPeriodTo ? toFormDate(rec.baseRentPeriodTo) : calc.periodTo);
      setWaterFee(String(rec.waterFee || 0));
      setWaterPeriodFrom(toFormDate(rec.waterPeriodFrom));
      setWaterPeriodTo(toFormDate(rec.waterPeriodTo));
      setElectricityFee(String(rec.electricityFee || 0));
      setElectricityPeriodFrom(toFormDate(rec.electricityPeriodFrom));
      setElectricityPeriodTo(toFormDate(rec.electricityPeriodTo));
      const deductionMeta = (d.sharedMeterDeductionUnits || []) as { id: number; unitName: string }[];
      const meterRaw = rec.electricityMeter;
      const meter = meterRaw ? hydrateOtherUnitUsagesFromLegacy(meterRaw, deductionMeta) : null;
      setMeterPrevReading(meter?.prevReading != null ? String(meter.prevReading) : '');
      setMeterCurrReading(meter?.currReading != null ? String(meter.currReading) : '');
      const usageStrings: Record<string, string> = {};
      for (const u of deductionMeta) {
        const v = meter?.otherUnitUsages?.[String(u.id)];
        usageStrings[String(u.id)] = v != null && Number.isFinite(v) ? String(v) : '';
      }
      setOtherUnitUsages(usageStrings);
      setMeterRatePerUnit(meter?.ratePerUnit != null ? String(meter.ratePerUnit) : '');
      setSuggestedPrevReading(d.suggestedPrevElectricityReading ?? null);
      setSuggestedPrevWaterReading(d.suggestedPrevWaterReading ?? null);
      const waterMeter = rec.waterMeter;
      setWaterMeterPrev(waterMeter?.prevReading != null ? String(waterMeter.prevReading) : '');
      setWaterMeterCurr(waterMeter?.currReading != null ? String(waterMeter.currReading) : '');
      setWaterMeterRate(waterMeter?.ratePerUnit != null ? String(waterMeter.ratePerUnit) : '');
      if (!waterMeter?.prevReading && d.suggestedPrevWaterReading != null) {
        setWaterMeterPrev(String(d.suggestedPrevWaterReading));
      }
      if (!meter?.prevReading && d.suggestedPrevElectricityReading != null) {
        setMeterPrevReading(String(d.suggestedPrevElectricityReading));
      }
      setUtilityNote(rec.customInvoiceNote || '');
      lastCommittedUtilityRef.current = {
        baseRentPeriodFrom: rec.baseRentPeriodFrom ? toFormDate(rec.baseRentPeriodFrom) : calc.periodFrom,
        baseRentPeriodTo: rec.baseRentPeriodTo ? toFormDate(rec.baseRentPeriodTo) : calc.periodTo,
        waterFee: String(rec.waterFee || 0),
        waterPeriodFrom: toFormDate(rec.waterPeriodFrom),
        waterPeriodTo: toFormDate(rec.waterPeriodTo),
        electricityFee: String(rec.electricityFee || 0),
        electricityPeriodFrom: toFormDate(rec.electricityPeriodFrom),
        electricityPeriodTo: toFormDate(rec.electricityPeriodTo),
        meterPrevReading:
          meter?.prevReading != null
            ? String(meter.prevReading)
            : d.suggestedPrevElectricityReading != null
              ? String(d.suggestedPrevElectricityReading)
              : '',
        meterCurrReading: meter?.currReading != null ? String(meter.currReading) : '',
        otherUnitUsages: { ...usageStrings },
        meterRatePerUnit: meter?.ratePerUnit != null ? String(meter.ratePerUnit) : '',
        waterMeterPrev:
          waterMeter?.prevReading != null
            ? String(waterMeter.prevReading)
            : d.suggestedPrevWaterReading != null
              ? String(d.suggestedPrevWaterReading)
              : '',
        waterMeterCurr: waterMeter?.currReading != null ? String(waterMeter.currReading) : '',
        waterMeterRate: waterMeter?.ratePerUnit != null ? String(waterMeter.ratePerUnit) : '',
        utilityNote: rec.customInvoiceNote || '',
      };
      undoUtilitySnapshotRef.current = null;
    },
    [calcBasicRentPeriod],
  );

  useEffect(() => {
    if (skipPeriodRecalcRef.current) return;
    const calc = calcBasicRentPeriod(Number(dueDateDay) || 1);
    setBaseRentPeriodFrom(calc.periodFrom);
    setBaseRentPeriodTo(calc.periodTo);
  }, [dueDateDay, period, calcBasicRentPeriod, skipPeriodRecalcRef]);

  useEffect(() => {
    if (!waterMeterFormula) return;
    const meter = waterMeterDataFromInputs(waterMeterPrev, waterMeterCurr, waterMeterRate);
    const fee = calcWaterFeeFromMeter(meter);
    setWaterFee(fee > 0 || meter.currReading != null ? String(fee) : '');
  }, [waterMeterFormula, waterMeterPrev, waterMeterCurr, waterMeterRate]);

  useEffect(() => {
    if (!electricityFormula) return;
    const meter = meterDataFromInputs(meterPrevReading, meterCurrReading, meterRatePerUnit, {
      otherUnitUsages,
    });
    const fee = calcElectricityFeeForFormula(electricityFormula, meter);
    const hasInput = [meterPrevReading, meterCurrReading, meterRatePerUnit].some((v) => v.trim() !== '');
    setElectricityFee(hasInput ? String(fee) : '');
  }, [electricityFormula, meterPrevReading, meterCurrReading, otherUnitUsages, meterRatePerUnit]);

  const captureUtilitySnapshot = useCallback(
    (): UtilitySnapshot => ({
      baseRentPeriodFrom,
      baseRentPeriodTo,
      waterFee,
      waterPeriodFrom,
      waterPeriodTo,
      electricityFee,
      electricityPeriodFrom,
      electricityPeriodTo,
      meterPrevReading,
      meterCurrReading,
      otherUnitUsages: { ...otherUnitUsages },
      meterRatePerUnit,
      waterMeterPrev,
      waterMeterCurr,
      waterMeterRate,
      utilityNote,
    }),
    [
      baseRentPeriodFrom,
      baseRentPeriodTo,
      waterFee,
      waterPeriodFrom,
      waterPeriodTo,
      electricityFee,
      electricityPeriodFrom,
      electricityPeriodTo,
      meterPrevReading,
      meterCurrReading,
      otherUnitUsages,
      meterRatePerUnit,
      waterMeterPrev,
      waterMeterCurr,
      waterMeterRate,
      utilityNote,
    ],
  );

  const applyUtilitySnapshot = useCallback((snap: UtilitySnapshot) => {
    setBaseRentPeriodFrom(snap.baseRentPeriodFrom);
    setBaseRentPeriodTo(snap.baseRentPeriodTo);
    setWaterFee(snap.waterFee);
    setWaterPeriodFrom(snap.waterPeriodFrom);
    setWaterPeriodTo(snap.waterPeriodTo);
    setElectricityFee(snap.electricityFee);
    setElectricityPeriodFrom(snap.electricityPeriodFrom);
    setElectricityPeriodTo(snap.electricityPeriodTo);
    setMeterPrevReading(snap.meterPrevReading);
    setMeterCurrReading(snap.meterCurrReading);
    setOtherUnitUsages({ ...snap.otherUnitUsages });
    setMeterRatePerUnit(snap.meterRatePerUnit);
    setWaterMeterPrev(snap.waterMeterPrev);
    setWaterMeterCurr(snap.waterMeterCurr);
    setWaterMeterRate(snap.waterMeterRate);
    setUtilityNote(snap.utilityNote);
  }, []);

  const buildUtilityPayload = useCallback(
    (snap?: UtilitySnapshot) => {
      const s = snap ?? captureUtilitySnapshot();
      const payload: Record<string, unknown> = {
        baseRentPeriodFrom: fromFormDate(s.baseRentPeriodFrom),
        baseRentPeriodTo: fromFormDate(s.baseRentPeriodTo),
        waterFee: Number(s.waterFee),
        electricityFee: Number(s.electricityFee),
        waterPeriodFrom: fromFormDate(s.waterPeriodFrom),
        waterPeriodTo: fromFormDate(s.waterPeriodTo),
        electricityPeriodFrom: fromFormDate(s.electricityPeriodFrom),
        electricityPeriodTo: fromFormDate(s.electricityPeriodTo),
        customInvoiceNote: s.utilityNote || null,
      };
      if (electricityFormula) {
        payload.electricityMeter = meterDataFromInputs(
          s.meterPrevReading,
          s.meterCurrReading,
          s.meterRatePerUnit,
          { otherUnitUsages: s.otherUnitUsages },
        );
      }
      if (waterMeterFormula) {
        payload.waterMeter = waterMeterDataFromInputs(s.waterMeterPrev, s.waterMeterCurr, s.waterMeterRate);
      }
      return payload;
    },
    [captureUtilitySnapshot, electricityFormula, waterMeterFormula],
  );

  const saveUtilities = useCallback(
    async (opts?: { reload?: boolean; snapshot?: UtilitySnapshot; skipUndo?: boolean }) => {
      let recordId = currentRecord?.id;
      if (!recordId || recordId <= 0) {
        recordId = (await ensurePeriodRecord()) || 0;
        if (!recordId) return false;
      }
      if (!opts?.skipUndo && !skipUndoCaptureRef.current && lastCommittedUtilityRef.current) {
        undoUtilitySnapshotRef.current = lastCommittedUtilityRef.current;
        setUtilityCanUndo(true);
      }
      setUtilitySaveState('saving');
      const res = await fetch(`/api/rentals/records/${recordId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildUtilityPayload(opts?.snapshot)),
      });
      skipUndoCaptureRef.current = false;
      if (!res.ok) {
        setUtilitySaveState('error');
        return false;
      }
      const { record } = await res.json();
      setCurrentRecord(record);
      lastCommittedUtilityRef.current = opts?.snapshot ?? captureUtilitySnapshot();
      setUtilitySaveState('saved');
      if (opts?.reload) reload();
      else window.setTimeout(() => setUtilitySaveState('idle'), 2000);
      return true;
    },
    [
      buildUtilityPayload,
      captureUtilitySnapshot,
      currentRecord?.id,
      ensurePeriodRecord,
      reload,
      setCurrentRecord,
    ],
  );

  const undoUtilitySave = useCallback(async () => {
    const snap = undoUtilitySnapshotRef.current;
    if (!snap) return;
    setUtilityCanUndo(false);
    undoUtilitySnapshotRef.current = null;
    skipUndoCaptureRef.current = true;
    skipUtilityAutoSaveRef.current = true;
    applyUtilitySnapshot(snap);
    await saveUtilities({ snapshot: snap, skipUndo: true });
    window.setTimeout(() => {
      skipUtilityAutoSaveRef.current = false;
    }, 200);
  }, [applyUtilitySnapshot, saveUtilities]);

  useEffect(() => {
    if (skipUtilityAutoSaveRef.current || !currentRecord || readOnlyLease) return;
    if (utilitySaveTimerRef.current) clearTimeout(utilitySaveTimerRef.current);
    utilitySaveTimerRef.current = setTimeout(() => {
      void saveUtilities();
    }, 600);
    return () => {
      if (utilitySaveTimerRef.current) clearTimeout(utilitySaveTimerRef.current);
    };
  }, [
    currentRecord?.id,
    readOnlyLease,
    saveUtilities,
    baseRentPeriodFrom,
    baseRentPeriodTo,
    waterFee,
    waterPeriodFrom,
    waterPeriodTo,
    electricityFee,
    electricityPeriodFrom,
    electricityPeriodTo,
    meterPrevReading,
    meterCurrReading,
    otherUnitUsages,
    meterRatePerUnit,
    waterMeterPrev,
    waterMeterCurr,
    waterMeterRate,
    utilityNote,
  ]);

  const liveElectricityMeter = meterDataFromInputs(meterPrevReading, meterCurrReading, meterRatePerUnit, {
    otherUnitUsages,
  });
  const liveElectricityFee = electricityFormula
    ? calcElectricityFeeForFormula(electricityFormula, liveElectricityMeter)
    : Number(electricityFee) || currentRecord?.electricityFee || 0;
  const liveWaterFee = waterMeterFormula
    ? calcWaterFeeFromMeter(waterMeterDataFromInputs(waterMeterPrev, waterMeterCurr, waterMeterRate))
    : Number(waterFee) || currentRecord?.waterFee || 0;

  return {
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
    otherUnitUsages,
    setOtherUnitUsages,
    meterRatePerUnit,
    setMeterRatePerUnit,
    waterMeterPrev,
    setWaterMeterPrev,
    waterMeterCurr,
    setWaterMeterCurr,
    waterMeterRate,
    setWaterMeterRate,
    suggestedPrevReading,
    suggestedPrevWaterReading,
    utilityNote,
    setUtilityNote,
    utilitySaveState,
    utilityCanUndo,
    showUtilityFees,
    electricityFormula,
    waterMeterFormula,
    calcBasicRentPeriod,
    buildUtilityPayload,
    saveUtilities,
    undoUtilitySave,
    prepareLoad,
    finishLoad,
    hydrateFromPayload,
    liveElectricityFee,
    liveWaterFee,
  };
}
