'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import LeaseStatusBadge from '@/components/LeaseStatusBadge';
import { useAuth } from '@/components/AuthProvider';
import { isSectionReadOnly } from '@/lib/permissions';
import {
  RENTAL_STATUS_BADGE,
  RENTAL_STATUS_LABELS,
  computeLeaseDisplayStatus,
  currentBillingPeriod,
  daysRemaining,
  displayRentalStatus,
  formatDisplayDate,
  formatDueDayLabel,
  formatMoney,
  toFormDate,
  type LeaseDisplayStatus,
  type PreviousYearRent,
  type RentalDashboardAlert,
  type RentalTenant,
  type RentalUnit,
  type RentalUnitWithRecord,
} from '@/lib/rentals';

interface DashboardData {
  units: RentalUnitWithRecord[];
  metrics: { totalRevenue: number; outstanding: number; paidCount: number; totalUnits: number };
  period: string;
  alerts?: RentalDashboardAlert[];
}

const blankUnit: Partial<RentalUnit> = {
  unitName: '', tenantName: '', tenantPhone: '', tenantEmail: '',
  currentYearRent: 0, previousYearsRent: [], leaseStartDate: '', leaseEndDate: '',
  dueDateDay: 1, autoSendReceiptEmail: false, automationEnabled: true,
};

export default function RentalsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const readOnly = user ? isSectionReadOnly(user.role, 'rentals') : false;
  const [period, setPeriod] = useState(currentBillingPeriod());
  const [data, setData] = useState<DashboardData | null>(null);
  const [tenants, setTenants] = useState<RentalTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [unitModal, setUnitModal] = useState<Partial<RentalUnit> | null>(null);
  const [previousYearsText, setPreviousYearsText] = useState('');
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [selectedUnitIds, setSelectedUnitIds] = useState<number[]>([]);
  const [leaseFilter, setLeaseFilter] = useState<LeaseDisplayStatus | 'all'>('all');

  const load = () => {
    setLoading(true);
    Promise.all([
      fetch(`/api/rentals?period=${period}`).then((r) => r.json()),
      fetch('/api/rentals/tenants').then((r) => r.json()),
    ])
      .then(([d, t]) => {
        setData(d);
        setTenants(t.tenants || []);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [period]);

  const units = data?.units || [];
  const alerts = data?.alerts || [];
  const metrics = data?.metrics || { totalRevenue: 0, outstanding: 0, paidCount: 0, totalUnits: 0 };

  const filteredUnits = leaseFilter === 'all'
    ? units
    : units.filter((u) => (u.leaseStatus || computeLeaseDisplayStatus(u.currentLease || { leaseEndDate: u.leaseEndDate, actualEndDate: null, status: 'vacant', isCurrent: false })) === leaseFilter);

  const tenantGroupKey = (u: Pick<RentalUnit, 'tenantId' | 'tenantName'>) => {
    if (u.tenantId) return `id:${u.tenantId}`;
    const name = u.tenantName?.trim();
    return name ? `name:${name.toLowerCase()}` : '';
  };

  const selectedUnits = units.filter((u) => selectedUnitIds.includes(u.id));
  const activeGroupKey = selectedUnits.length
    ? tenantGroupKey(selectedUnits[0])
    : null;

  const canSelectUnit = (u: RentalUnitWithRecord) => {
    const key = tenantGroupKey(u);
    if (!key) return false;
    if (!activeGroupKey) return true;
    return key === activeGroupKey;
  };

  const toggleUnitSelection = (u: RentalUnitWithRecord) => {
    if (!canSelectUnit(u) && !selectedUnitIds.includes(u.id)) return;
    setSelectedUnitIds((prev) =>
      prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id],
    );
  };

  const resolveTenantIdForSelection = (): number | null => {
    if (!selectedUnits.length) return null;
    const withId = selectedUnits.find((u) => u.tenantId);
    if (withId?.tenantId) return withId.tenantId;
    const name = selectedUnits[0].tenantName?.trim();
    if (!name) return null;
    const tenant = tenants.find((t) => t.name.toLowerCase() === name.toLowerCase());
    return tenant?.id ?? null;
  };

  const groupedDebitNoteHref = () => {
    const tenantId = resolveTenantIdForSelection();
    if (!tenantId || !selectedUnitIds.length) return null;
    const qs = new URLSearchParams({
      tenantId: String(tenantId),
      targetPeriod: period,
      mode: 'grouped',
      unitIds: selectedUnitIds.join(','),
    });
    return `/billing/debit-note?${qs}`;
  };

  const debitNoteHref = groupedDebitNoteHref();
  const groupedTenantLabel = selectedUnits[0]?.tenantName || '';

  const openUnitModal = (unit: Partial<RentalUnit>) => {
    setPreviousYearsText((unit.previousYearsRent || []).map((r) => `${r.year}, ${r.rent}`).join('\n'));
    setUnitModal({
      ...unit,
      leaseStartDate: unit.leaseStartDate ? toFormDate(unit.leaseStartDate) : '',
      leaseEndDate: unit.leaseEndDate ? toFormDate(unit.leaseEndDate) : '',
    });
  };

  const saveUnit = async () => {
    setBusy(true);
    const isEdit = Boolean(unitModal?.id);
    const payload = { ...unitModal, previousYearsRent: parsePreviousYears(previousYearsText) };
    const res = await fetch(isEdit ? `/api/rentals/units/${unitModal?.id}` : '/api/rentals', {
      method: isEdit ? 'PATCH' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    setBusy(false);
    if (!res.ok) { setToast('Failed to save lease'); return; }
    setUnitModal(null);
    setToast(isEdit ? 'Lease updated' : 'New unit added');
    load();
  };

  const runScheduler = async () => {
    setBusy(true);
    const res = await fetch(`/api/cron/rental-invoices?period=${period}`, { method: 'POST' });
    const d = await res.json();
    setBusy(false);
    if (!res.ok) {
      setToast(d.error || 'Scheduler failed');
      return;
    }
    const skipMsg = d.skipped ? ` · ${d.skipped} skipped (after lease end / inactive)` : '';
    setToast(`Dispatched ${d.processed} rental invoices${skipMsg}`);
    load();
  };

  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm bg-gray-50/40 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none';

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">Rental Income 租金管理</h1>
          <p className="text-gray-500 mt-0.5 text-sm">
            Row overview · click a unit to manage
            {readOnly && <span className="text-amber-600 ml-2">(Read-only)</span>}
          </p>
        </div>
        <div className="page-actions">
          <input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className={`${inp} w-full sm:w-auto`} />
          <button onClick={runScheduler} disabled={busy || readOnly} className="btn border border-gray-300 text-gray-700 hover:bg-gray-50 disabled:opacity-50">Run Billing</button>
          {!readOnly && (
            <button onClick={() => openUnitModal(blankUnit)} className="btn bg-brand-600 text-white hover:bg-brand-700">+ Add Unit</button>
          )}
        </div>
      </div>

      {toast && <div onClick={() => setToast('')} className="mb-4 p-3 rounded-lg bg-brand-50 text-brand-700 text-sm cursor-pointer">{toast} ✕</div>}

      {alerts.length > 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 rounded-2xl p-4">
          <p className="text-sm font-semibold text-amber-900 mb-2">Contract Alerts 合約提醒 ({alerts.length})</p>
          <ul className="space-y-1.5 text-sm text-amber-800">
            {alerts.slice(0, 8).map((a, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="flex-1 min-w-0">{a.message}</span>
                <Link href={`/rentals/${a.unitId}?period=${period}`} className="text-xs font-medium text-brand-700 hover:underline shrink-0">View →</Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tenants — multi-unit rent payment notice */}
      {tenants.length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden mb-6">
          <div className="px-6 py-4 border-b border-gray-200">
            <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold">Tenants 租客</p>
            <p className="text-sm text-gray-500 mt-0.5">Multi-unit tenants · 繳付租金通知單 Rent Payment Notice</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs uppercase tracking-wider text-gray-500 bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left">Tenant 租客</th>
                  <th className="px-4 py-3 text-left">Contact</th>
                  <th className="px-4 py-3 text-right">Units</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {tenants.map((t) => (
                  <tr key={t.id} className="hover:bg-brand-50/40 cursor-pointer" onClick={() => router.push(`/rentals/tenants/${t.id}`)}>
                    <td className="px-4 py-3 font-semibold">{t.name}</td>
                    <td className="px-4 py-3 text-gray-500 text-xs">{t.phone || t.email || '—'}</td>
                    <td className="px-4 py-3 text-right">{t.unitCount ?? 0}</td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex flex-col items-end gap-1">
                        <Link href={`/rentals/tenants/${t.id}/rent-payment-notice?period=${period}`} className="text-brand-600 text-xs font-medium hover:underline">
                          通知單 Notice
                        </Link>
                        {(t.unitCount ?? 0) > 1 && (
                          <Link
                            href={`/billing/debit-note?tenantId=${t.id}&targetPeriod=${period}&mode=grouped`}
                            className="text-brand-600 text-xs font-medium hover:underline"
                          >
                            綜合繳費通知單 Debit Note
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Metrics strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Revenue', value: formatMoney(metrics.totalRevenue), cls: 'text-green-700 bg-green-50' },
          { label: 'Outstanding', value: formatMoney(metrics.outstanding), cls: 'text-red-700 bg-red-50' },
          { label: 'Paid Ratio', value: `${metrics.paidCount} / ${metrics.totalUnits} paid`, cls: 'text-brand-700 bg-brand-50' },
        ].map(({ label, value, cls }) => (
          <div key={label} className="bg-white border border-gray-200 rounded-xl p-4">
            <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
            <p className={`mt-1 text-xl font-bold rounded-lg px-2 py-0.5 inline-block ${cls}`}>{value}</p>
          </div>
        ))}
      </div>

      {/* Row-based master panel */}
      <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-widest text-brand-600 font-semibold">Lease Overview Master Panel 租約主控面板</p>
            <p className="text-sm text-gray-500 mt-0.5">
              Period: {period} · Tick units with the same tenant for grouped debit note
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select
              value={leaseFilter}
              onChange={(e) => setLeaseFilter(e.target.value as LeaseDisplayStatus | 'all')}
              className={`${inp} w-auto text-sm`}
            >
              <option value="all">All contract status</option>
              <option value="active">生效中 Active</option>
              <option value="ending_soon">即將到期 Ending soon</option>
              <option value="ended">合約完結 Ended</option>
              <option value="terminated">提早終止 Terminated</option>
              <option value="vacant">空置 Vacant</option>
            </select>
          {selectedUnitIds.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-gray-600">
                {selectedUnitIds.length} unit(s) · <span className="font-medium">{groupedTenantLabel}</span>
              </span>
              {debitNoteHref ? (
                <Link
                  href={debitNoteHref}
                  className="px-3 py-1.5 bg-brand-600 text-white rounded-lg text-xs font-semibold hover:bg-brand-700"
                >
                  繳費通知單 Grouped Debit Note
                </Link>
              ) : (
                <span className="text-xs text-amber-600">Save tenant on unit lease to enable grouped notice</span>
              )}
              <button
                type="button"
                onClick={() => setSelectedUnitIds([])}
                className="text-xs text-gray-500 hover:text-gray-800 underline"
              >
                Clear
              </button>
            </div>
          )}
          </div>
        </div>
        <div className="overflow-x-auto">
          {loading ? (
            <div className="p-12 text-center"><div className="animate-spin rounded-full h-6 w-6 border-b-2 border-brand-600 mx-auto" /></div>
          ) : units.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">No rental units yet — add the first one.</div>
          ) : filteredUnits.length === 0 ? (
            <div className="p-12 text-center text-gray-400 text-sm">No units match this contract filter.</div>
          ) : (
            <table className="w-full min-w-[900px] text-sm">
              <thead className="text-xs uppercase tracking-wider text-gray-500 bg-gray-50 border-b border-gray-200">
                <tr>
                  <th className="px-3 py-3 text-left w-10" title="Select units with same tenant for grouped debit note">☑</th>
                  <th className="px-4 py-3 text-left">單位 Unit</th>
                  <th className="px-4 py-3 text-left">租單位人士 Tenant</th>
                  <th className="px-4 py-3 text-left">Contract 合約</th>
                  <th className="px-4 py-3 text-right">Base Rent</th>
                  <th className="px-4 py-3 text-left">起租日</th>
                  <th className="px-4 py-3 text-left">完租日</th>
                  <th className="px-4 py-3 text-right">Days Left</th>
                  <th className="px-4 py-3 text-left">交租日</th>
                  <th className="px-4 py-3 text-left">本月狀況</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredUnits.map((u) => {
                  const remaining = daysRemaining(u.leaseEndDate);
                  const rec = u.currentRecord;
                  const recStatus = displayRentalStatus(rec);
                  const leaseStatus = u.leaseStatus || (u.currentLease
                    ? computeLeaseDisplayStatus(u.currentLease)
                    : 'vacant');
                  const selectable = canSelectUnit(u);
                  const groupKey = tenantGroupKey(u);
                  const sameTenantCount = groupKey
                    ? units.filter((x) => tenantGroupKey(x) === groupKey).length
                    : 0;
                  return (
                    <tr
                      key={u.id}
                      onClick={() => router.push(`/rentals/${u.id}?period=${period}`)}
                      className={`hover:bg-brand-50/40 cursor-pointer transition-colors ${selectedUnitIds.includes(u.id) ? 'bg-brand-50/60' : ''}`}
                    >
                      <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                        {groupKey && sameTenantCount > 0 ? (
                          <input
                            type="checkbox"
                            checked={selectedUnitIds.includes(u.id)}
                            disabled={!selectable && !selectedUnitIds.includes(u.id)}
                            onChange={() => toggleUnitSelection(u)}
                            title={
                              !groupKey
                                ? 'Set tenant name first'
                                : !selectable
                                  ? `Only units for ${groupedTenantLabel || 'the same tenant'} can be selected together`
                                  : sameTenantCount > 1
                                    ? 'Include in grouped debit note'
                                    : 'Single unit — grouped notice still available'
                            }
                            className="h-4 w-4 rounded border-gray-300 disabled:opacity-40"
                          />
                        ) : (
                          <span className="text-gray-300 text-xs">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 font-semibold text-gray-900">{u.unitName}</td>
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-gray-900">{u.tenantName}</p>
                        {u.tenantPhone && <p className="text-xs text-gray-400">{u.tenantPhone}</p>}
                      </td>
                      <td className="px-4 py-3.5">
                        <LeaseStatusBadge status={leaseStatus} />
                        {remaining !== null && leaseStatus === 'ending_soon' && (
                          <p className="text-[10px] text-amber-700 mt-1">{remaining} days left</p>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right font-semibold">{formatMoney(u.currentYearRent)}</td>
                      <td className="px-4 py-3.5 text-gray-600">{formatDisplayDate(u.leaseStartDate)}</td>
                      <td className="px-4 py-3.5 text-gray-600">{formatDisplayDate(u.leaseEndDate)}</td>
                      <td className={`px-4 py-3.5 text-right font-semibold ${remaining !== null && remaining < 60 ? 'text-red-600' : 'text-gray-700'}`}>
                        {remaining ?? '—'}
                      </td>
                      <td className="px-4 py-3.5 text-gray-600">{formatDueDayLabel(u.dueDateDay)}</td>
                      <td className="px-4 py-3.5">
                        <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-semibold ${RENTAL_STATUS_BADGE[recStatus]}`}>
                          {RENTAL_STATUS_LABELS[recStatus]}
                        </span>
                        {rec.amountPaid > 0 && rec.amountPaid < rec.actualAmount && (
                          <p className="text-[10px] text-orange-600 mt-0.5">{formatMoney(rec.amountPaid)} paid</p>
                        )}
                        {(rec.waterFee > 0 || rec.electricityFee > 0 || rec.actualAmount > u.currentYearRent) ? (
                          <p className="text-[10px] text-gray-400 mt-0.5">+Utilities</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex flex-col items-end gap-1">
                          {u.tenantId ? (
                            <Link
                              href={`/rentals/units/${u.id}/rent-payment-notice?period=${period}`}
                              className="text-brand-600 hover:text-brand-700 text-xs font-medium hover:underline"
                            >
                              通知單 Notice
                            </Link>
                          ) : null}
                          {!readOnly && (
                            <button
                              onClick={() => openUnitModal(u)}
                              className="text-brand-600 hover:text-brand-700 text-xs font-medium px-2 py-1 rounded hover:bg-brand-50"
                            >
                              Edit Lease
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {unitModal && (
        <div className="modal-overlay">
          <div className="modal-panel sm:max-w-2xl max-h-[92vh]">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-bold">{unitModal.id ? 'Edit Lease 編輯租約' : 'New Rental Unit 新增單位'}</h2>
              <button onClick={() => setUnitModal(null)} className="text-gray-400 hover:text-gray-700 text-xl">✕</button>
            </div>
            <div className="grid md:grid-cols-2 gap-4">
              {[
                ['Unit Name', 'unitName', 'text', 'e.g. Room A'],
                ['Tenant Name 租單位人士', 'tenantName', 'text', ''],
                ['Phone 電話', 'tenantPhone', 'tel', '+852…'],
                ['Email', 'tenantEmail', 'email', ''],
              ].map(([label, field, type, placeholder]) => (
                <div key={field}>
                  <label className="block text-xs font-medium text-gray-500 mb-1">{label}</label>
                  <input type={type} className={inp} placeholder={placeholder}
                    value={(unitModal as Record<string, unknown>)[field] as string || ''}
                    onChange={(e) => setUnitModal({ ...unitModal, [field]: e.target.value })} />
                </div>
              ))}
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">今年租金 Base Rent/mo</label>
                <input type="number" className={inp} value={unitModal.currentYearRent || 0}
                  onChange={(e) => setUnitModal({ ...unitModal, currentYearRent: Number(e.target.value) })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">每月交租日 Due Day (1–31)</label>
                <div className="flex items-center gap-2">
                  <span className="text-sm text-gray-500">每月</span>
                  <input type="number" min={1} max={31} className={`${inp} w-20 text-center`} value={unitModal.dueDateDay || 1}
                    onChange={(e) => setUnitModal({ ...unitModal, dueDateDay: Number(e.target.value) })} />
                  <span className="text-sm text-gray-500">日</span>
                  <span className="text-sm font-medium text-brand-700">{formatDueDayLabel(unitModal.dueDateDay || 1)}</span>
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">起租日 Lease Start</label>
                <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" className={inp} value={unitModal.leaseStartDate || ''}
                  onChange={(e) => setUnitModal({ ...unitModal, leaseStartDate: e.target.value })} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 mb-1">完租日 Lease End</label>
                <input type="text" inputMode="numeric" placeholder="DD/MM/YYYY" className={inp} value={unitModal.leaseEndDate || ''}
                  onChange={(e) => setUnitModal({ ...unitModal, leaseEndDate: e.target.value })} />
              </div>
              <div className="md:col-span-2">
                <label className="block text-xs font-medium text-gray-500 mb-1">往年租金 (one per line: YYYY, amount)</label>
                <textarea className={inp} rows={3} value={previousYearsText}
                  onChange={(e) => setPreviousYearsText(e.target.value)}
                  placeholder="2025, 8000&#10;2024, 7500" />
              </div>
            </div>
            <div className="flex gap-4 mt-4 flex-wrap">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={Boolean(unitModal.autoSendReceiptEmail)}
                  onChange={(e) => setUnitModal({ ...unitModal, autoSendReceiptEmail: e.target.checked })} />
                付款後自動發送收據 Email
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={unitModal.automationEnabled !== false}
                  onChange={(e) => setUnitModal({ ...unitModal, automationEnabled: e.target.checked })} />
                Monthly invoice automation
              </label>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button onClick={() => setUnitModal(null)} className="px-4 py-2 border border-gray-300 rounded-lg text-sm">Cancel</button>
              <button onClick={saveUnit} disabled={busy} className="px-4 py-2 bg-brand-600 text-white rounded-lg text-sm font-medium disabled:opacity-50">
                {busy ? 'Saving…' : 'Save Lease'}
              </button>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}

function parsePreviousYears(raw: string): PreviousYearRent[] {
  return raw.split('\n').map((line) => {
    const [year, rent] = line.split(',').map((v) => v.trim());
    return { year: Number(year), rent: Number(rent) };
  }).filter((r) => Number.isFinite(r.year) && Number.isFinite(r.rent) && r.year > 0);
}
