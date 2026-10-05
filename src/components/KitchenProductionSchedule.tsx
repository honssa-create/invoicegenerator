'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import DateFilterField from '@/components/DateFilterField';
import type { ProductionScheduleSummary } from '@/lib/kitchen-production-schedule';
import {
  KITCHEN_DAILY_SESSION_LIMIT,
  KITCHEN_PRODUCTION_SCHEDULE_DEFECTS_STORAGE_KEY,
  KITCHEN_PRODUCTION_SCHEDULE_DEFECT_LOG_STORAGE_KEY,
  PRODUCTION_DEFECT_REASONS,
  appendProductionDefectLogEntry,
  applyDefectsToProductionSchedule,
  defectReasonLabel,
  formatDefectLogTimestamp,
  loadProductionDefectLogFromStorage,
  sumDefectsByProductFromLog,
  type ProductionDefectReasonId,
  type ProductionScheduleDefectLogEntry,
} from '@/lib/kitchen-production-schedule';
import {
  NESTIEE_DATE_FILTER_TYPES,
  type NestieeDateFilterType,
} from '@/lib/nestiee-order-demand';
import { tapProps } from '@/lib/tap-action';
import { FILTER, bi } from '@/lib/ui-labels';

const DATE_FILTER_LABELS: Record<NestieeDateFilterType, { en: string; zh: string }> = {
  order_date: { en: 'By order date', zh: '落下單日期' },
  delivery_date: { en: 'By delivery date', zh: '按送貨日期' },
};

type KitchenProductionScheduleProps = {
  embedded?: boolean;
  loading?: boolean;
  dateStart?: string;
  dateEnd?: string;
  dateFilterType?: NestieeDateFilterType;
  schedule?: ProductionScheduleSummary | null;
  orderCount?: number;
};

export default function KitchenProductionSchedule(props: KitchenProductionScheduleProps = {}) {
  const embedded = Boolean(props.embedded);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [dateFilterType, setDateFilterType] = useState<NestieeDateFilterType>('delivery_date');
  const [schedule, setSchedule] = useState<ProductionScheduleSummary | null>(null);
  const [orderCount, setOrderCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [defectLog, setDefectLog] = useState<ProductionScheduleDefectLogEntry[]>([]);
  const [defectsHydrated, setDefectsHydrated] = useState(false);
  const [defectModalProduct, setDefectModalProduct] = useState<string | null>(null);
  const [defectDraftQty, setDefectDraftQty] = useState('1');
  const [defectReason, setDefectReason] = useState<ProductionDefectReasonId>('cap_damaged');
  const [defectRemarks, setDefectRemarks] = useState('');

  const defects = useMemo(() => sumDefectsByProductFromLog(defectLog), [defectLog]);

  const defectLogForModal = useMemo(() => {
    if (!defectModalProduct) return [];
    return defectLog
      .filter((e) => e.product === defectModalProduct)
      .slice()
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }, [defectLog, defectModalProduct]);

  const effectiveDateStart = embedded ? props.dateStart ?? '' : dateStart;
  const effectiveDateEnd = embedded ? props.dateEnd ?? '' : dateEnd;
  const effectiveDateFilterType = embedded
    ? props.dateFilterType ?? 'delivery_date'
    : dateFilterType;
  const effectiveSchedule = embedded ? props.schedule ?? null : schedule;
  const effectiveOrderCount = embedded ? props.orderCount ?? 0 : orderCount;
  const effectiveLoading = embedded ? Boolean(props.loading) : loading;

  const hasDateFilter = Boolean(effectiveDateStart || effectiveDateEnd);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    setDefectLog(
      loadProductionDefectLogFromStorage(
        localStorage.getItem(KITCHEN_PRODUCTION_SCHEDULE_DEFECT_LOG_STORAGE_KEY),
        localStorage.getItem(KITCHEN_PRODUCTION_SCHEDULE_DEFECTS_STORAGE_KEY),
      ),
    );
    setDefectsHydrated(true);
  }, []);

  useEffect(() => {
    if (!defectsHydrated) return;
    try {
      localStorage.setItem(KITCHEN_PRODUCTION_SCHEDULE_DEFECT_LOG_STORAGE_KEY, JSON.stringify(defectLog));
    } catch {
      /* quota / private mode */
    }
  }, [defectLog, defectsHydrated]);

  const load = useCallback(() => {
    if (embedded) return;
    setLoading(true);
    const params = new URLSearchParams();
    if (dateStart) params.set('dateStart', dateStart);
    if (dateEnd) params.set('dateEnd', dateEnd);
    params.set('dateFilterType', dateFilterType);
    fetch(`/api/kitchen/production-schedule?${params}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.schedule) setSchedule(d.schedule);
        if (typeof d?.orderCount === 'number') setOrderCount(d.orderCount);
      })
      .catch(() => {
        /* keep previous */
      })
      .finally(() => setLoading(false));
  }, [dateStart, dateEnd, dateFilterType, embedded]);

  useEffect(() => {
    load();
  }, [load]);

  const displaySchedule = useMemo(() => {
    if (!effectiveSchedule) return null;
    return applyDefectsToProductionSchedule(effectiveSchedule, defects);
  }, [effectiveSchedule, defects]);

  const totalSessions = displaySchedule?.totalSessions ?? 0;
  const totalDays = displaySchedule?.totalDaysNeeded ?? 0;
  const estDate = displaySchedule?.estimatedCompletionDate ?? '—';

  const openDefectModal = (product: string) => {
    setDefectModalProduct(product);
    setDefectDraftQty('1');
    setDefectReason('cap_damaged');
    setDefectRemarks('');
  };

  const closeDefectModal = () => {
    setDefectModalProduct(null);
    setDefectDraftQty('1');
    setDefectRemarks('');
  };

  const saveDefectEntry = () => {
    if (!defectModalProduct) return;
    const qty = Math.max(0, Math.floor(Number(defectDraftQty) || 0));
    if (qty <= 0) return;
    setDefectLog((prev) =>
      appendProductionDefectLogEntry(prev, {
        product: defectModalProduct,
        qty,
        reason: defectReason,
        remarks: defectRemarks,
      }),
    );
    setDefectDraftQty('1');
    setDefectRemarks('');
  };

  return (
    <div className="h-full rounded-xl border border-gray-200 bg-white p-5 flex flex-col">
      <div className="mb-4">
        <h2 className="font-semibold text-gray-900">燕窩生產排程</h2>
        <p className="text-sm text-gray-500 mt-1">
          {effectiveLoading
            ? bi('Loading…', '載入中…')
            : hasDateFilter
              ? bi(
                  `${effectiveOrderCount} unshipped processing order(s) in range`,
                  `日期範圍內 ${effectiveOrderCount} 張未出貨處理中訂單`,
                )
              : bi(
                  `${effectiveOrderCount} unshipped processing order(s)`,
                  `${effectiveOrderCount} 張未出貨處理中訂單`,
                )}
        </p>
      </div>

      {!embedded ? (
      <div className="flex flex-col sm:flex-row sm:flex-wrap items-stretch sm:items-end gap-3 mb-4">
        <div className="grid grid-cols-2 gap-3 sm:contents">
          <DateFilterField label={FILTER.startDate} value={dateStart} onChange={setDateStart} />
          <DateFilterField label={FILTER.endDate} value={dateEnd} onChange={setDateEnd} />
        </div>
        <div
          className="inline-flex rounded-lg border border-gray-200 bg-gray-50 p-0.5 text-sm self-start"
          role="group"
          aria-label={bi('Date filter basis', '日期篩選基準')}
        >
          {NESTIEE_DATE_FILTER_TYPES.map((option) => {
            const active = dateFilterType === option;
            const label = DATE_FILTER_LABELS[option];
            return (
              <button
                key={option}
                type="button"
                className={`min-h-[44px] px-3 py-2 rounded-md transition-colors font-medium ${
                  active
                    ? 'bg-white text-gray-900 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
                {...tapProps(() => setDateFilterType(option))}
              >
                {bi(label.en, label.zh)}
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="min-h-[44px] px-3 py-2 text-sm border border-gray-300 rounded-lg text-gray-600 hover:bg-gray-50"
          {...tapProps(() => {
            setDateStart('');
            setDateEnd('');
          })}
        >
          {bi('Clear dates', '清除日期')}
        </button>
      </div>
      ) : null}

      <div className="overflow-x-auto flex-1">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-gray-500 border-b">
              <th className="py-2 pr-2">{bi('Product', '產品')}</th>
              <th className="py-2 pr-2 text-right">
                <span
                  className="inline-flex items-center justify-end gap-1 cursor-help"
                  title={bi(
                    'Loose bottle stock by capacity & flavor (gift-box bottles excluded)',
                    '單樽現貨庫存（按容量口味；禮盒內樽數不計入此欄）',
                  )}
                >
                  {bi('Stock', '庫存')}
                  <span className="text-gray-400 text-xs leading-none" aria-hidden="true">ⓘ</span>
                </span>
              </th>
              <th className="py-2 pr-2 text-right">
                <span
                  className="inline-flex items-center justify-end gap-1 cursor-help"
                  title={bi(
                    'Order bottle need minus bottles in gift-box inventory (same capacity & flavor)',
                    '訂單樽需求，已扣除禮盒庫存內同容量口味樽數',
                  )}
                >
                  {bi('Demand', '需求')}
                  <span className="text-gray-400 text-xs leading-none" aria-hidden="true">ⓘ</span>
                </span>
              </th>
              <th className="py-2 pr-2 text-right">
                <span
                  className="inline-flex items-center justify-end gap-1 cursor-help"
                  title={bi(
                    'Defective bottles — not counted as usable stock for shortfall',
                    '次貨樽數，不計入可用庫存',
                  )}
                >
                  {bi('Defective', '次貨')}
                  <span className="text-gray-400 text-xs leading-none" aria-hidden="true">ⓘ</span>
                </span>
              </th>
              <th className="py-2 pr-2 text-right">{bi('Shortfall', '尚欠')}</th>
              <th className="py-2 pr-2 text-right">{bi('Sessions', '所需轉數')}</th>
              <th className="py-2 text-right">{bi('Action', '操作')}</th>
            </tr>
          </thead>
          <tbody>
            {(displaySchedule?.rows ?? schedule?.rows ?? []).map((row) => {
              const defectQty = defects[row.product] ?? 0;
              return (
                <tr key={row.slotId} className="border-b border-gray-50">
                  <td className="py-2 pr-2 font-medium text-gray-900">{row.product}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{effectiveLoading ? '—' : row.stock}</td>
                  <td className="py-2 pr-2 text-right tabular-nums">{effectiveLoading ? '—' : row.demand}</td>
                  <td className="py-2 pr-2 text-right tabular-nums text-amber-800">
                    {effectiveLoading ? '—' : defectQty}
                  </td>
                  <td className="py-2 pr-2 text-right tabular-nums">{effectiveLoading ? '—' : row.shortfall}</td>
                  <td className="py-2 pr-2 text-right tabular-nums font-medium">
                    {effectiveLoading ? '—' : row.sessions == null ? '—' : row.sessions}
                  </td>
                  <td className="py-2 text-right">
                    <button
                      type="button"
                      className="min-h-[36px] px-2.5 py-1 text-xs font-medium border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 whitespace-nowrap"
                      disabled={effectiveLoading}
                      {...tapProps(() => openDefectModal(row.product))}
                    >
                      {bi('Add defect', '加入次貨')}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {defectModalProduct && (
        <div
          className="fixed inset-0 bg-black/40 z-[60] flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="defect-modal-title"
          onClick={closeDefectModal}
        >
          <div
            className="bg-white rounded-xl shadow-lg w-full max-w-md max-h-[90vh] overflow-y-auto p-5"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 id="defect-modal-title" className="font-semibold text-gray-900">
              {bi('Add defective bottles', '加入次貨')}
            </h3>
            <p className="text-sm text-gray-500 mt-1">{defectModalProduct}</p>
            <p className="text-xs text-amber-800 mt-2">
              {bi(
                `Current total: ${defects[defectModalProduct] ?? 0} (not usable as stock)`,
                `目前次貨合計：${defects[defectModalProduct] ?? 0} 樽（不計入可用庫存）`,
              )}
            </p>

            <label className="block mt-4 text-sm font-medium text-gray-700">
              {bi('Quantity to add', '本次次貨數量')}
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                className="mt-1 w-full min-h-[44px] px-3 py-2 border border-gray-300 rounded-lg text-sm"
                value={defectDraftQty}
                onChange={(e) => setDefectDraftQty(e.target.value)}
                autoFocus
              />
            </label>

            <fieldset className="mt-4">
              <legend className="text-sm font-medium text-gray-700">
                {bi('Reason', '原因')}
              </legend>
              <div className="mt-2 space-y-2">
                {PRODUCTION_DEFECT_REASONS.map((r) => (
                  <label
                    key={r.id}
                    className="flex items-center gap-2 min-h-[44px] text-sm text-gray-800 cursor-pointer"
                  >
                    <input
                      type="radio"
                      name="defect-reason"
                      className="h-4 w-4"
                      checked={defectReason === r.id}
                      onChange={() => setDefectReason(r.id)}
                    />
                    {bi(r.en, r.zh)}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block mt-4 text-sm font-medium text-gray-700">
              {bi('Remarks (optional)', '備註（選填）')}
              <textarea
                rows={2}
                className="mt-1 w-full px-3 py-2 border border-gray-300 rounded-lg text-sm resize-y"
                value={defectRemarks}
                onChange={(e) => setDefectRemarks(e.target.value)}
                placeholder={bi('e.g. batch / line note', '例如：批次、線位')}
              />
            </label>

            <div className="flex gap-2 mt-5 justify-end flex-wrap">
              <button
                type="button"
                className="min-h-[44px] px-4 py-2 text-sm border border-gray-300 rounded-lg text-gray-600"
                {...tapProps(closeDefectModal)}
              >
                {bi('Close', '關閉')}
              </button>
              <button
                type="button"
                className="min-h-[44px] px-4 py-2 text-sm rounded-lg bg-gray-900 text-white font-medium"
                {...tapProps(saveDefectEntry)}
              >
                {bi('Add entry', '加入紀錄')}
              </button>
            </div>

            <div className="mt-6 border-t border-gray-100 pt-4">
              <h4 className="text-sm font-semibold text-gray-900">
                {bi('Defect activity log', '次貨活動紀錄')}
              </h4>
              {defectLogForModal.length === 0 ? (
                <p className="text-sm text-gray-500 mt-2">{bi('No entries yet.', '尚無紀錄。')}</p>
              ) : (
                <ul className="mt-2 space-y-2 max-h-48 overflow-y-auto">
                  {defectLogForModal.map((entry) => (
                    <li
                      key={entry.id}
                      className="text-sm rounded-lg border border-gray-100 bg-gray-50 px-3 py-2"
                    >
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <span className="font-medium text-gray-900 tabular-nums">
                          +{entry.qty} {bi('btl', '樽')}
                        </span>
                        <time className="text-xs text-gray-500" dateTime={entry.createdAt}>
                          {formatDefectLogTimestamp(entry.createdAt)}
                        </time>
                      </div>
                      <p className="text-gray-700 mt-0.5">
                        {bi(
                          defectReasonLabel(entry.reason, 'en'),
                          defectReasonLabel(entry.reason, 'zh'),
                        )}
                      </p>
                      {entry.remarks ? (
                        <p className="text-gray-600 text-xs mt-1 whitespace-pre-wrap">{entry.remarks}</p>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="mt-5 rounded-lg bg-[#F7F2E8] border border-[#E8DCC8] px-4 py-4 space-y-2">
        <p className="text-base font-semibold text-gray-900">
          {effectiveLoading
            ? '—'
            : bi(
                `Total: ${totalSessions} session(s) (≈ ${totalDays} working day(s))`,
                `總共需要: ${totalSessions} 轉 (約 ${totalDays} 個工作日)`,
              )}
        </p>
        <p className="text-base font-semibold text-gray-900">
          {effectiveLoading
            ? '—'
            : bi(
                `Est. ready date: ${estDate} (Sundays excluded)`,
                `預計全部起貨日: ${estDate} (已略過星期日)`,
              )}
        </p>
      </div>

      <p className="text-xs text-gray-500 mt-3">
        *{bi(
          `Kitchen daily capacity is ${KITCHEN_DAILY_SESSION_LIMIT} sessions. Closed on Sundays. Defect entries are append-only, saved on this device, and excluded from usable stock.`,
          `廚房每日總產能為 ${KITCHEN_DAILY_SESSION_LIMIT} 轉。星期日休息。次貨以追加紀錄方式儲存於本機，不計入可用庫存。`,
        )}
      </p>
    </div>
  );
}
