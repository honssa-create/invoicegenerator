'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import { useRentalUnitUtilities } from '@/hooks/rentals/useRentalUnitUtilities';
import {
  currentBillingPeriod,
  fromFormDate,
  normalizeUtilityBillingMode,
  toFormDate,
  type DebitNoteCompanyId,
  type RentRecord,
  type RentalLease,
  type RentalTenant,
  type UtilityBillingMode,
} from '@/lib/rentals';
import type { RentalUnitDetailPayload } from '@/lib/rental-unit-detail-shared';

interface Options {
  unitId: string;
  initialPeriod?: string;
  viewLeaseId?: string | null;
}

function hydrateProfileFromPayload(d: RentalUnitDetailPayload) {
  const profileLease = d.displayLease as RentalLease | null | undefined;
  const useLease = d.isHistoricalView && profileLease;
  return {
    tenantName: useLease ? profileLease.tenantName : d.unit.tenantName || '',
    tenantContactName: d.unit.tenantContactName || '',
    tenantCompanyName: d.unit.tenantCompanyName || '',
    tenantNotes: d.unit.tenantNotes || '',
    tenantPhone: useLease ? profileLease.tenantPhone : d.unit.tenantPhone || '',
    tenantEmail: useLease ? profileLease.tenantEmail : d.unit.tenantEmail || '',
    tenantAddress: d.unit.tenantAddress || '',
    dueDateDay: String(useLease ? profileLease.dueDateDay : d.unit.dueDateDay || 1),
    baseRent: String(useLease ? profileLease.baseRent : (d.currentRecord?.baseRent ?? d.unit.currentYearRent ?? 0)),
    utilityBillingMode: normalizeUtilityBillingMode(d.unit.utilityBillingMode),
    sharedMeterDeductionUnitIds: d.unit.sharedMeterDeductionUnitIds || [],
    billingCompany:
      d.unit.billingCompany === 'label' || d.unit.billingCompany === 'elite' ? d.unit.billingCompany : ('' as const),
    leaseStartDate: useLease
      ? toFormDate(profileLease.leaseStartDate)
      : d.unit.leaseStartDate
        ? toFormDate(d.unit.leaseStartDate)
        : '',
    leaseEndDate: useLease
      ? toFormDate(profileLease.actualEndDate || profileLease.leaseEndDate)
      : d.unit.leaseEndDate
        ? toFormDate(d.unit.leaseEndDate)
        : '',
    depositAmount:
      (useLease ? profileLease.depositAmount : d.currentLease?.depositAmount) != null
        ? String(useLease ? profileLease.depositAmount : d.currentLease!.depositAmount)
        : '',
    unitAddress: d.unit.address || '',
  };
}

function profileSnapshotFromFields(fields: ReturnType<typeof hydrateProfileFromPayload>) {
  return JSON.stringify({
    ...fields,
    sharedMeterDeductionUnitIds: [...fields.sharedMeterDeductionUnitIds].sort((a, b) => a - b),
  });
}

export function useRentalUnitDetail({ unitId, initialPeriod, viewLeaseId }: Options) {
  const [period, setPeriod] = useState(initialPeriod || currentBillingPeriod());
  const [data, setData] = useState<RentalUnitDetailPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const [tenantName, setTenantName] = useState('');
  const [tenantContactName, setTenantContactName] = useState('');
  const [tenantCompanyName, setTenantCompanyName] = useState('');
  const [tenantNotes, setTenantNotes] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantEmail, setTenantEmail] = useState('');
  const [dueDateDay, setDueDateDay] = useState('1');
  const [baseRent, setBaseRent] = useState('');
  const [utilityBillingMode, setUtilityBillingMode] = useState<UtilityBillingMode>('company_shared_meter');
  const [sharedMeterDeductionUnitIds, setSharedMeterDeductionUnitIds] = useState<number[]>([]);
  const [billingCompany, setBillingCompany] = useState<DebitNoteCompanyId | ''>('');
  const [leaseStartDate, setLeaseStartDate] = useState('');
  const [leaseEndDate, setLeaseEndDate] = useState('');
  const [depositAmount, setDepositAmount] = useState('');
  const [unitAddress, setUnitAddress] = useState('');
  const [tenantAddress, setTenantAddress] = useState('');
  const [profileSaving, setProfileSaving] = useState(false);
  const [savedProfileSnapshot, setSavedProfileSnapshot] = useState<string | null>(null);

  const skipPeriodRecalcRef = useRef(true);

  const setCurrentRecord = useCallback((record: RentRecord) => {
    setData((prev) => (prev ? { ...prev, currentRecord: record } : prev));
  }, []);

  const ensurePeriodRecord = useCallback(async (): Promise<number | null> => {
    const existing = data?.currentRecord?.id;
    if (existing && existing > 0) return existing;
    const res = await fetch(
      `/api/rentals/units/${unitId}/ensure-period?period=${encodeURIComponent(period)}`,
      { method: 'POST' },
    );
    if (!res.ok) return null;
    const body = await res.json();
    const record = body.record as RentRecord | undefined;
    if (!record?.id) return null;
    setCurrentRecord(record);
    return record.id;
  }, [data?.currentRecord?.id, period, setCurrentRecord, unitId]);

  const loadRef = useRef<() => void>(() => {});

  const utilities = useRentalUnitUtilities({
    period,
    dueDateDay,
    utilityBillingMode,
    unitName: data?.unit.unitName,
    currentRecord: data?.currentRecord,
    readOnlyLease: data?.readOnlyLease,
    setCurrentRecord,
    ensurePeriodRecord,
    reload: () => loadRef.current(),
    skipPeriodRecalcRef,
  });

  const { prepareLoad, finishLoad, hydrateFromPayload, ...utilityFields } = utilities;

  const applyProfileFields = useCallback((fields: ReturnType<typeof hydrateProfileFromPayload>) => {
    setTenantName(fields.tenantName);
    setTenantContactName(fields.tenantContactName);
    setTenantCompanyName(fields.tenantCompanyName);
    setTenantNotes(fields.tenantNotes);
    setTenantPhone(fields.tenantPhone);
    setTenantEmail(fields.tenantEmail);
    setTenantAddress(fields.tenantAddress);
    setDueDateDay(fields.dueDateDay);
    setBaseRent(fields.baseRent);
    setUtilityBillingMode(fields.utilityBillingMode);
    setSharedMeterDeductionUnitIds(fields.sharedMeterDeductionUnitIds);
    setBillingCompany(fields.billingCompany);
    setLeaseStartDate(fields.leaseStartDate);
    setLeaseEndDate(fields.leaseEndDate);
    setDepositAmount(fields.depositAmount);
    setUnitAddress(fields.unitAddress);
    setSavedProfileSnapshot(profileSnapshotFromFields(fields));
  }, []);

  const load = useCallback(() => {
    setLoading(true);
    prepareLoad();
    fetch(`/api/rentals/units/${unitId}?period=${period}${viewLeaseId ? `&leaseId=${viewLeaseId}` : ''}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: RentalUnitDetailPayload | null) => {
        if (d) {
          setData(d);
          applyProfileFields(hydrateProfileFromPayload(d));
          hydrateFromPayload(d);
        }
      })
      .finally(() => {
        finishLoad();
        setLoading(false);
      });
  }, [applyProfileFields, finishLoad, hydrateFromPayload, period, prepareLoad, unitId, viewLeaseId]);

  loadRef.current = load;

  useEffect(() => {
    load();
  }, [load]);

  const currentProfileSnapshot = useMemo(
    () =>
      profileSnapshotFromFields({
        tenantName,
        tenantContactName,
        tenantCompanyName,
        tenantNotes,
        tenantPhone,
        tenantEmail,
        tenantAddress,
        dueDateDay,
        baseRent,
        utilityBillingMode,
        sharedMeterDeductionUnitIds,
        billingCompany,
        leaseStartDate,
        leaseEndDate,
        depositAmount,
        unitAddress,
      }),
    [
      tenantName,
      tenantContactName,
      tenantCompanyName,
      tenantNotes,
      tenantPhone,
      tenantEmail,
      tenantAddress,
      dueDateDay,
      baseRent,
      utilityBillingMode,
      sharedMeterDeductionUnitIds,
      billingCompany,
      leaseStartDate,
      leaseEndDate,
      depositAmount,
      unitAddress,
    ],
  );

  const isProfileDirty =
    !data?.readOnlyLease && savedProfileSnapshot !== null && savedProfileSnapshot !== currentProfileSnapshot;
  useUnsavedChangesWarning(isProfileDirty);

  const applyTenantFromList = useCallback((t: RentalTenant) => {
    setTenantName(t.name);
    setTenantContactName(t.contact_name || '');
    setTenantCompanyName(t.company_name || '');
    setTenantNotes(t.notes || '');
    setTenantPhone(t.phone || '');
    setTenantEmail(t.email || '');
    setTenantAddress(t.address || '');
  }, []);

  const addNewTenantName = useCallback((name: string) => {
    setTenantName(name);
  }, []);

  const saveProfile = useCallback(async () => {
    if (data?.readOnlyLease) return false;
    setProfileSaving(true);
    const res = await fetch(`/api/rentals/units/${unitId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantName: tenantName.trim(),
        tenantContactName: tenantContactName.trim(),
        tenantCompanyName: tenantCompanyName.trim(),
        tenantNotes: tenantNotes.trim(),
        tenantPhone: tenantPhone.trim(),
        tenantEmail: tenantEmail.trim(),
        tenantAddress: tenantAddress.trim(),
        dueDateDay: Number(dueDateDay) || 1,
        currentYearRent: Number(baseRent) || 0,
        utilityBillingMode,
        sharedMeterDeductionUnitIds:
          utilityBillingMode === 'company_shared_meter' ? sharedMeterDeductionUnitIds : [],
        billingCompany: billingCompany || null,
        leaseStartDate: fromFormDate(leaseStartDate),
        leaseEndDate: fromFormDate(leaseEndDate),
        depositAmount: Number(depositAmount) || 0,
        address: unitAddress.trim(),
      }),
    });
    setProfileSaving(false);
    if (!res.ok) return false;
    setSavedProfileSnapshot(currentProfileSnapshot);
    load();
    return true;
  }, [
    baseRent,
    billingCompany,
    currentProfileSnapshot,
    data?.readOnlyLease,
    depositAmount,
    dueDateDay,
    leaseEndDate,
    leaseStartDate,
    load,
    sharedMeterDeductionUnitIds,
    tenantAddress,
    tenantCompanyName,
    tenantContactName,
    tenantEmail,
    tenantName,
    tenantNotes,
    tenantPhone,
    unitAddress,
    unitId,
    utilityBillingMode,
  ]);

  return {
    period,
    setPeriod,
    data,
    loading,
    load,
    ensurePeriodRecord,
    tenantName,
    setTenantName,
    tenantContactName,
    setTenantContactName,
    tenantCompanyName,
    setTenantCompanyName,
    tenantNotes,
    setTenantNotes,
    tenantPhone,
    setTenantPhone,
    tenantEmail,
    setTenantEmail,
    dueDateDay,
    setDueDateDay,
    baseRent,
    setBaseRent,
    utilityBillingMode,
    setUtilityBillingMode,
    sharedMeterDeductionUnitIds,
    setSharedMeterDeductionUnitIds,
    billingCompany,
    setBillingCompany,
    leaseStartDate,
    setLeaseStartDate,
    leaseEndDate,
    setLeaseEndDate,
    depositAmount,
    setDepositAmount,
    unitAddress,
    setUnitAddress,
    tenantAddress,
    setTenantAddress,
    profileSaving,
    isProfileDirty,
    applyTenantFromList,
    addNewTenantName,
    saveProfile,
    ...utilityFields,
  };
}
