'use client';

import {
  WEDDING_GIFT_ACTUAL_FLAVORS,
  WEDDING_GIFT_BOTTLE_CAPACITIES,
  WEDDING_GIFT_CLIENT_FLAVORS,
  WEDDING_GIFT_MATERIAL_FIELDS,
  WEDDING_GIFT_PACK_BAG_FIELDS,
  WEDDING_GIFT_PACK_BOW_FIELDS,
  WEDDING_GIFT_PACK_CAPACITIES,
  WEDDING_GIFT_PACK_CARTON_FIELDS,
  WEDDING_GIFT_PACK_FLAVORS,
  computeBirdNestActualTotal,
  normalizeWeddingGiftBottleCapacity,
  weddingGiftFoilStickerKey,
  weddingGiftRoundTagKey,
} from '@/lib/orders';
import { addCalendarDays } from '@/lib/wedding-gift-confirmation';
import { bi } from '@/lib/ui-labels';
import type { WeddingGiftOrderDetailProps } from '../order-detail-types';

export default function WeddingGiftOrderDetail({
  order,
  weddingGiftTotal,
  birdNestTotals: bn,
  bigDayPersistedRef,
  bigDaySavedOnChangeRef,
  onOpenConfirmPaste,
  syncWeddingGiftDerived,
  syncWeddingGiftTotalAmount,
  form,
}: WeddingGiftOrderDetailProps) {
  const { softInput, fVal, fInput, labeled, readOnly, nonNeg, setFieldLocal, patch } = form;

  const weddingGiftQtyInput = (key: string) => (
    <input
      type="number"
      min={0}
      value={fVal(key)}
      onChange={(e) => setFieldLocal(key, nonNeg(e.target.value))}
      onBlur={(e) => {
        const v = nonNeg(e.target.value);
        setFieldLocal(key, v);
        syncWeddingGiftDerived({ [key]: v });
      }}
      placeholder="0"
      className={softInput}
    />
  );

  const packQtyMatrix = (
    title: string,
    keyFor: (capacityId: string, flavorId: string) => string,
  ) => (
    <div className="overflow-x-auto rounded-xl border border-gray-200">
      <table className="w-full min-w-[420px] text-sm">
        <thead>
          <tr className="bg-gray-50/80 border-b border-gray-200">
            <th className="text-left font-semibold text-gray-700 px-3 py-2.5 whitespace-nowrap">{title}</th>
            {WEDDING_GIFT_PACK_CAPACITIES.map((c) => (
              <th key={c.id} className="font-medium text-gray-900 px-2 py-2.5 text-center">{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {WEDDING_GIFT_PACK_FLAVORS.map((flavor) => (
            <tr key={flavor.id} className="border-b border-gray-100 last:border-0">
              <td className="px-3 py-2 text-gray-600 whitespace-nowrap">{flavor.label}</td>
              {WEDDING_GIFT_PACK_CAPACITIES.map((cap) => {
                const key = keyFor(cap.id, flavor.id);
                return (
                  <td key={cap.id} className="px-2 py-1.5">
                    <input
                      type="number"
                      min={0}
                      value={fVal(key)}
                      onChange={(e) => setFieldLocal(key, nonNeg(e.target.value))}
                      onBlur={(e) => {
                        const v = nonNeg(e.target.value);
                        setFieldLocal(key, v);
                        patch({ fields: { [key]: v } });
                      }}
                      placeholder="0"
                      className={`${softInput} text-center`}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
              <div className="space-y-8">
                {/* Section 1 — 客人訂購數量 */}
                <div className="space-y-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-sm text-gray-500">
                      {bi('Paste a confirmation message to autofill fields', '貼上確認訊息以自動填入欄位')}
                    </p>
                    <button
                      type="button"
                      onClick={onOpenConfirmPaste}
                      className="btn bg-brand-600 text-white hover:bg-brand-700 w-full sm:w-auto shrink-0"
                    >
                      {bi('Paste confirmation', '貼上確認訊息')}
                    </button>
                  </div>
                  <div className="grid md:grid-cols-3 gap-5">
                    {labeled(
                      'Big Day',
                      <input
                        type="date"
                        value={fVal('big_day')}
                        onChange={(e) => {
                          const v = e.target.value;
                          const prev = fVal('big_day');
                          setFieldLocal('big_day', v);
                          if (v && v !== prev) {
                            const expiryIso = addCalendarDays(v, 28);
                            const productionIso = addCalendarDays(v, -10);
                            setFieldLocal('expiry_date', expiryIso);
                            setFieldLocal('production_date', productionIso);
                            // Persist all three immediately — a later blur that only sends
                            // big_day would overwrite these via setOrder(server).
                            bigDaySavedOnChangeRef.current = v;
                            bigDayPersistedRef.current = v;
                            void patch({
                              fields: {
                                big_day: v,
                                expiry_date: expiryIso,
                                production_date: productionIso,
                              },
                            });
                          }
                        }}
                        onBlur={(e) => {
                          const v = e.target.value;
                          // onChange already saved this value with derived dates.
                          if (bigDaySavedOnChangeRef.current === v) {
                            bigDaySavedOnChangeRef.current = null;
                            return;
                          }
                          const upd: Record<string, string> = { big_day: v };
                          if (v && v !== bigDayPersistedRef.current) {
                            const expiryIso = addCalendarDays(v, 28);
                            const productionIso = addCalendarDays(v, -10);
                            upd.expiry_date = expiryIso;
                            upd.production_date = productionIso;
                            setFieldLocal('expiry_date', expiryIso);
                            setFieldLocal('production_date', productionIso);
                            bigDayPersistedRef.current = v;
                          }
                          void patch({ fields: upd });
                        }}
                        className={softInput}
                      />
                    )}
                    {labeled('到期日', fInput('expiry_date', 'date'), 'Big Day後4星期')}
                    {labeled('生產日期', fInput('production_date', 'date'), 'Big Day前10天')}
                  </div>

                  <h3 className="text-sm font-semibold text-gray-700">客人訂購數量</h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 items-end">
                    {WEDDING_GIFT_CLIENT_FLAVORS.map((f) => (
                      <div key={f.key}>{labeled(f.label, weddingGiftQtyInput(f.key))}</div>
                    ))}
                    {readOnly('客人訂購總數', bn.totalOrdered)}
                  </div>

                  <div className="grid md:grid-cols-3 gap-5 items-end">
                    {labeled(
                      '單樽容量',
                      <select
                        value={normalizeWeddingGiftBottleCapacity(fVal('bottle_capacity'))}
                        onChange={(e) => {
                          setFieldLocal('bottle_capacity', e.target.value);
                          syncWeddingGiftDerived({ bottle_capacity: e.target.value });
                        }}
                        className={softInput}
                      >
                        <option value="">—</option>
                        {WEDDING_GIFT_BOTTLE_CAPACITIES.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                      </select>
                    )}
                    {labeled(
                      '單樽價格',
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm">$</span>
                        <input
                          type="number"
                          step="0.01"
                          value={fVal('unit_bottle_price')}
                          onChange={(e) => setFieldLocal('unit_bottle_price', e.target.value)}
                          onBlur={(e) => syncWeddingGiftTotalAmount({ unit_bottle_price: e.target.value })}
                          placeholder="0.00"
                          className={`${softInput} pl-7`}
                        />
                      </div>
                    )}
                    {readOnly(
                      '總金額',
                      `$${weddingGiftTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    )}
                  </div>
                </div>

                {/* Section 2 — 實際生產 / 材料 / 包裝 */}
                <div className="border-t border-dashed border-gray-200 pt-6 space-y-5">
                  <h3 className="text-sm font-semibold text-gray-700">實際生產樽數</h3>
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5 items-end">
                    {WEDDING_GIFT_ACTUAL_FLAVORS.map((f) => {
                      const raw = fVal(f.key);
                      const display = raw !== '' ? raw : fVal(f.clientKey);
                      return (
                        <div key={f.key}>
                          {labeled(
                            f.label,
                            <input
                              type="number"
                              min={0}
                              value={display}
                              onChange={(e) => setFieldLocal(f.key, nonNeg(e.target.value))}
                              onBlur={(e) => {
                                const v = nonNeg(e.target.value);
                                setFieldLocal(f.key, v);
                                syncWeddingGiftDerived({ [f.key]: v });
                              }}
                              placeholder="0"
                              className={softInput}
                            />
                          )}
                        </div>
                      );
                    })}
                    {readOnly('實際生產總數量', computeBirdNestActualTotal(order.fields))}
                  </div>

                  <h3 className="text-sm font-semibold text-gray-700">材料</h3>
                  <div className="grid md:grid-cols-3 gap-5">
                    {WEDDING_GIFT_MATERIAL_FIELDS.slice(0, 3).map((f) => (
                      <div key={f.key}>{labeled(f.label, fInput(f.key, 'number', '0'))}</div>
                    ))}
                  </div>
                  <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-5">
                    {WEDDING_GIFT_MATERIAL_FIELDS.slice(3).map((f) => (
                      <div key={f.key}>
                        {labeled(
                          f.label,
                          <input
                            type="number"
                            min={0}
                            step={f.step || '1'}
                            value={fVal(f.key)}
                            onChange={(e) => setFieldLocal(f.key, nonNeg(e.target.value))}
                            onBlur={(e) => {
                              const v = nonNeg(e.target.value);
                              setFieldLocal(f.key, v);
                              patch({ fields: { [f.key]: v } });
                            }}
                            placeholder="0"
                            className={softInput}
                          />
                        )}
                      </div>
                    ))}
                  </div>

                  <h3 className="text-sm font-semibold text-gray-700">包裝(蝴蝶結紗袋)</h3>
                  <div className="grid md:grid-cols-2 gap-5">
                    {WEDDING_GIFT_PACK_BOW_FIELDS.map((f) => (
                      <div key={f.key}>{labeled(f.label, fInput(f.key, 'number', '0'))}</div>
                    ))}
                  </div>
                  {packQtyMatrix('圓形tag', weddingGiftRoundTagKey)}
                  {packQtyMatrix('長方形燙金貼紙', weddingGiftFoilStickerKey)}
                  <div className="grid md:grid-cols-3 gap-5">
                    {WEDDING_GIFT_PACK_BAG_FIELDS.map((f) => (
                      <div key={f.key}>{labeled(f.label, fInput(f.key, 'number', '0'))}</div>
                    ))}
                  </div>
                  <div className="grid md:grid-cols-2 gap-5">
                    {WEDDING_GIFT_PACK_CARTON_FIELDS.map((f) => (
                      <div key={f.key}>{labeled(f.label, fInput(f.key, 'number', '0'))}</div>
                    ))}
                  </div>
                </div>
              </div>
  );
}
