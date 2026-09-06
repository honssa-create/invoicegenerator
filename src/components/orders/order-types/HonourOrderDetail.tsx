'use client';

import MultiChoiceSelect from '@/components/MultiChoiceSelect';
import SupplierSelect from '@/components/SupplierSelect';
import {
  HONOUR_CLASP_OPTIONS,
  HONOUR_CRAFT_OPTIONS,
  HONOUR_INTERNAL_PACK_OPTIONS,
  HONOUR_PACK_REQUIRED_OPTIONS,
  HONOUR_PLATING_OPTIONS,
  joinHonourMultiValue,
  normalizeHonourInternalPack,
  parseHonourMultiValue,
} from '@/lib/honour-field-choices';
import { mergeSupplierLists } from '@/lib/expense-suppliers';
import {
  computeHonourLineTotals,
  emptyHonourLine,
  emptyHonourSupplier,
  ensureHonourSupplierCount,
  honourLinesDerivedFields,
  honourProductLineCount,
  honourSuppliersDerivedFields,
  isHonourShippingLine,
  normalizeOrderDueDate,
  parseHonourLines,
  parseHonourSuppliers,
  type HonourLineItem,
  type HonourSupplierItem,
} from '@/lib/orders';
import { bi } from '@/lib/ui-labels';
import type { HonourOrderDetailProps } from '../order-detail-types';

export default function HonourOrderDetail({
  orderType,
  honourLines,
  honourTotals,
  honourSuppliers,
  supplierOptions,
  setSupplierOptions,
  commitHonourLines,
  applyHonourSuppliers,
  form,
}: HonourOrderDetailProps) {
  const { softInput, fVal, fInput, labeled, readOnly, nonNeg, setFieldLocal, patch, setOrder } = form;

  return (
              <div className="space-y-8">
                {/* Line items — one compact row per item */}
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-gray-700">Items 款式明細</h3>
                    <button
                      type="button"
                      onClick={() => commitHonourLines([...honourLines, emptyHonourLine()])}
                      className="text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      + Add product
                    </button>
                  </div>
                  <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white">
                    <table className="w-full text-sm table-fixed">
                      <colgroup>
                        <col className="w-8" />
                        <col className="w-[28%]" />
                        <col className="w-[34%]" />
                        <col className="w-24" />
                        <col className="w-28" />
                        <col className="w-10" />
                      </colgroup>
                      <thead>
                        <tr className="text-[11px] uppercase tracking-wide text-gray-900 border-b border-gray-200 bg-gray-50/80">
                          <th className="text-left py-2 pl-3 pr-1 font-medium">#</th>
                          <th className="text-left py-2 pr-2 font-medium">Name 品名</th>
                          <th className="text-left py-2 pr-2 font-medium">Description 說明</th>
                          <th className="text-right py-2 pr-2 font-medium">Qty</th>
                          <th className="text-right py-2 pr-2 font-medium">Rate</th>
                          <th className="pr-2" />
                        </tr>
                      </thead>
                      <tbody>
                        {honourLines.map((line, index) => {
                          const shipping = isHonourShippingLine(line);
                          const productIndex =
                            honourLines.slice(0, index + 1).filter((l) => !isHonourShippingLine(l)).length;
                          const updateLine = (patchLine: Partial<HonourLineItem>, commit: boolean) => {
                            let nextLines: HonourLineItem[] | undefined;
                            setOrder((prev) => {
                              if (!prev) return prev;
                              const current = parseHonourLines(prev.fields);
                              nextLines = current.map((l, i) =>
                                i === index ? { ...l, ...patchLine } : l,
                              );
                              if (commit) return prev;
                              const derived = honourLinesDerivedFields(nextLines);
                              const { totalAmount } = computeHonourLineTotals(nextLines);
                              const productCount = honourProductLineCount(nextLines);
                              const currentSuppliers = parseHonourSuppliers(prev.fields, {
                                minCount: honourProductLineCount(nextLines),
                                cartonCountCore: prev.carton_count,
                                productLines: nextLines,
                              });
                              const padded = ensureHonourSupplierCount(currentSuppliers, productCount);
                              const supplierDerived =
                                padded.length !== currentSuppliers.length
                                  ? honourSuppliersDerivedFields(padded)
                                  : {};
                              return {
                                ...prev,
                                fields: { ...prev.fields, ...derived, ...supplierDerived },
                                total_amount: totalAmount > 0 ? totalAmount : prev.total_amount,
                              };
                            });
                            if (commit && nextLines) commitHonourLines(nextLines);
                          };
                          const compactInput =
                            'w-full px-2 py-1.5 border border-gray-200 rounded text-sm bg-gray-50/40 focus:bg-white focus:ring-2 focus:ring-brand-500 outline-none';
                          if (shipping) {
                            return (
                              <tr key={`ship-${index}`} className="border-b border-gray-100 align-top bg-gray-50/40">
                                <td className="py-2 pl-3 pr-1 text-gray-400">—</td>
                                <td className="py-2 pr-2" colSpan={2}>
                                  <span className="text-sm font-medium text-gray-600">Shipping 運費</span>
                                </td>
                                <td className="py-2 pr-2 text-right text-gray-400 tabular-nums pt-2.5">1</td>
                                <td className="py-2 pr-2">
                                  <div className="relative">
                                    <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                                    <input
                                      type="number"
                                      value={line.unit_price}
                                      onChange={(e) => updateLine({ unit_price: e.target.value }, false)}
                                      onBlur={(e) => updateLine({ unit_price: e.target.value, quantity: '1' }, true)}
                                      placeholder="0"
                                      className={`${compactInput} pl-5 text-right`}
                                    />
                                  </div>
                                </td>
                                <td className="py-2 pr-2">
                                  <button
                                    type="button"
                                    disabled={honourLines.length <= 1}
                                    onClick={() => commitHonourLines(honourLines.filter((_, i) => i !== index))}
                                    className="text-gray-400 hover:text-red-600 text-sm px-1 disabled:opacity-30 disabled:cursor-not-allowed"
                                    title="Remove"
                                  >
                                    ×
                                  </button>
                                </td>
                              </tr>
                            );
                          }
                          return (
                            <tr key={`product-${index}`} className="border-b border-gray-100 align-top">
                              <td className="py-2 pl-3 pr-1 text-gray-400">{productIndex}</td>
                              <td className="py-2 pr-2">
                                <input
                                  value={line.style}
                                  onChange={(e) => updateLine({ style: e.target.value }, false)}
                                  onBlur={(e) => updateLine({ style: e.target.value }, true)}
                                  placeholder="Name"
                                  className={compactInput}
                                />
                              </td>
                              <td className="py-2 pr-2">
                                <textarea
                                  value={line.description}
                                  onChange={(e) => updateLine({ description: e.target.value }, false)}
                                  onBlur={(e) => updateLine({ description: e.target.value }, true)}
                                  rows={2}
                                  placeholder="Description"
                                  className={`${compactInput} resize-y min-h-[2.75rem]`}
                                />
                              </td>
                              <td className="py-2 pr-2">
                                <input
                                  type="number"
                                  min={0}
                                  value={line.quantity}
                                  onChange={(e) => updateLine({ quantity: nonNeg(e.target.value) }, false)}
                                  onBlur={(e) => updateLine({ quantity: nonNeg(e.target.value) }, true)}
                                  placeholder="0"
                                  className={`${compactInput} text-right`}
                                />
                              </td>
                              <td className="py-2 pr-2">
                                <div className="relative">
                                  <span className="absolute left-1.5 top-1/2 -translate-y-1/2 text-gray-400 text-xs">$</span>
                                  <input
                                    type="number"
                                    value={line.unit_price}
                                    onChange={(e) => updateLine({ unit_price: e.target.value }, false)}
                                    onBlur={(e) => updateLine({ unit_price: e.target.value }, true)}
                                    placeholder="0"
                                    className={`${compactInput} pl-5 text-right`}
                                  />
                                </div>
                              </td>
                              <td className="py-2 pr-2">
                                <button
                                  type="button"
                                  disabled={honourProductLineCount(honourLines) <= 1}
                                  onClick={() => commitHonourLines(honourLines.filter((_, i) => i !== index))}
                                  className="text-gray-400 hover:text-red-600 text-sm px-1 disabled:opacity-30 disabled:cursor-not-allowed"
                                  title="Remove"
                                >
                                  ×
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  <div className="grid grid-cols-2 gap-3 mt-3 max-w-sm">
                    {readOnly('total quantity 總數量', honourTotals.totalQuantity)}
                    {readOnly(
                      'total amount 總金額',
                      `$${honourTotals.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                    )}
                  </div>
                </div>

                {/* Platform */}
                <div className="border-t border-dashed border-gray-200 pt-6 space-y-5">
                  <h3 className="text-sm font-semibold text-gray-700">Platform 下單平台</h3>
                  <div className="grid md:grid-cols-2 gap-5">
                    {labeled(
                      'platform 下單平台',
                      fInput(
                        'order_from',
                        'text',
                        orderType === 'honour en訂製' ? 'e.g. Honour EN store URL' : 'e.g. honour.com.hk',
                      ),
                    )}
                    {labeled('payment option 下單時付款選項', fInput('payment_option', 'text', 'e.g. yedpay'))}
                  </div>
                </div>

                {/* Combined supplier + craft + packaging cards */}
                <div className="border-t border-dashed border-gray-200 pt-6 space-y-5">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">
                      Supplier / Craft / Packaging 供應商・工藝・包裝
                    </h3>
                    <button
                      type="button"
                      onClick={() =>
                        applyHonourSuppliers((list) => [...list, emptyHonourSupplier()], true)
                      }
                      className="text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      + Add more
                    </button>
                  </div>
                  <div className="space-y-5">
                    {honourSuppliers.map((sup, sIndex) => {
                      const updateSup = (patchSup: Partial<HonourSupplierItem>, commit: boolean) => {
                        applyHonourSuppliers(
                          (list) => list.map((s, i) => (i === sIndex ? { ...s, ...patchSup } : s)),
                          commit,
                        );
                      };
                      const multiLocal = (key: keyof HonourSupplierItem, catalog: readonly string[]) => ({
                        onChange: (vals: string[]) =>
                          updateSup({ [key]: joinHonourMultiValue(vals, catalog) } as Partial<HonourSupplierItem>, false),
                        onCommit: (vals: string[]) =>
                          updateSup({ [key]: joinHonourMultiValue(vals, catalog) } as Partial<HonourSupplierItem>, true),
                      });
                      return (
                        <div
                          key={`supplier-${sIndex}`}
                          className="rounded-xl border border-gray-200 bg-white p-4 space-y-4 shadow-sm"
                        >
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-semibold text-gray-800">
                              Supplier-{sIndex + 1} 供應商-{sIndex + 1}
                            </h4>
                            <button
                              type="button"
                              disabled={honourSuppliers.length <= 1}
                              onClick={() =>
                                applyHonourSuppliers(
                                  (list) => list.filter((_, i) => i !== sIndex),
                                  true,
                                )
                              }
                              className="text-sm text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed"
                            >
                              Remove
                            </button>
                          </div>
                          <div className="max-w-md">
                            {labeled(
                              '供應商',
                              <SupplierSelect
                                value={sup.supplier}
                                options={mergeSupplierLists(supplierOptions, [sup.supplier])}
                                onChange={(v) => updateSup({ supplier: v }, true)}
                                onAdd={async (v) => {
                                  const res = await fetch('/api/expense-options', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify({ type: 'supplier', value: v }),
                                  });
                                  if (res.ok) {
                                    const data = await res.json();
                                    if (Array.isArray(data.options)) setSupplierOptions(data.options.map(String));
                                    else setSupplierOptions((prev) => mergeSupplierLists(prev, [v]));
                                  } else {
                                    setSupplierOptions((prev) => mergeSupplierLists(prev, [v]));
                                  }
                                }}
                                placeholder={bi('Select supplier…', '選擇供應商…')}
                              />
                            )}
                          </div>
                          <div className="grid md:grid-cols-3 gap-4">
                            {labeled(
                              '單價 ($)',
                              <input
                                value={sup.supplier_price}
                                onChange={(e) => updateSup({ supplier_price: e.target.value }, false)}
                                onBlur={(e) => updateSup({ supplier_price: e.target.value }, true)}
                                placeholder="e.g. rmb 4.2"
                                className={softInput}
                              />
                            )}
                            {labeled(
                              '模費/印刷費 ($)',
                              <input
                                value={sup.mould_print_fee}
                                onChange={(e) => updateSup({ mould_print_fee: e.target.value }, false)}
                                onBlur={(e) => updateSup({ mould_print_fee: e.target.value }, true)}
                                className={softInput}
                              />
                            )}
                            {labeled(
                              '生產數量',
                              <input
                                value={sup.supplier_qty}
                                onChange={(e) => updateSup({ supplier_qty: e.target.value }, false)}
                                onBlur={(e) => updateSup({ supplier_qty: e.target.value }, true)}
                                className={softInput}
                              />
                            )}
                          </div>
                          <div className="grid md:grid-cols-3 gap-4">
                            {labeled(
                              '交貨包裝',
                              <MultiChoiceSelect
                                values={parseHonourMultiValue(sup.supplier_pack)}
                                options={HONOUR_PACK_REQUIRED_OPTIONS}
                                {...multiLocal('supplier_pack', HONOUR_PACK_REQUIRED_OPTIONS)}
                                placeholder="選擇交貨包裝…"
                              />
                            )}
                            {labeled(
                              '寄出日期',
                              <input
                                type="date"
                                value={normalizeOrderDueDate(sup.supplier_ship_date) || ''}
                                onChange={(e) => updateSup({ supplier_ship_date: e.target.value }, false)}
                                onBlur={(e) => {
                                  const v = e.target.value;
                                  // Preserve unparseable legacy free-text until a real date is chosen.
                                  if (!v && !normalizeOrderDueDate(sup.supplier_ship_date) && sup.supplier_ship_date) {
                                    return;
                                  }
                                  updateSup({ supplier_ship_date: v }, true);
                                }}
                                className={softInput}
                              />
                            )}
                            {labeled(
                              '箱數',
                              <input
                                value={sup.carton_count}
                                onChange={(e) => updateSup({ carton_count: e.target.value }, false)}
                                onBlur={(e) => updateSup({ carton_count: e.target.value }, true)}
                                placeholder="e.g. 5"
                                className={softInput}
                              />
                            )}
                          </div>

                          <div className="border-t border-dashed border-gray-100 pt-4 space-y-4">
                            <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-900">
                              Craft 工藝
                            </h5>
                            <div className="grid md:grid-cols-2 gap-4">
                              {labeled(
                                '紙卡尺寸',
                                <input
                                  value={sup.card_size}
                                  onChange={(e) => updateSup({ card_size: e.target.value }, false)}
                                  onBlur={(e) => updateSup({ card_size: e.target.value }, true)}
                                  className={softInput}
                                />
                              )}
                              {labeled(
                                '加工工藝',
                                <MultiChoiceSelect
                                  values={parseHonourMultiValue(sup.craft)}
                                  options={HONOUR_CRAFT_OPTIONS}
                                  {...multiLocal('craft', HONOUR_CRAFT_OPTIONS)}
                                  placeholder="選擇加工工藝…"
                                />
                              )}
                              {labeled(
                                '電鍍色',
                                <MultiChoiceSelect
                                  values={parseHonourMultiValue(sup.plating_color)}
                                  options={HONOUR_PLATING_OPTIONS}
                                  {...multiLocal('plating_color', HONOUR_PLATING_OPTIONS)}
                                  placeholder="選擇電鍍色…"
                                />
                              )}
                              {labeled(
                                '背扣',
                                <MultiChoiceSelect
                                  values={parseHonourMultiValue(sup.clasp)}
                                  options={HONOUR_CLASP_OPTIONS}
                                  {...multiLocal('clasp', HONOUR_CLASP_OPTIONS)}
                                  placeholder="選擇背扣…"
                                />
                              )}
                            </div>
                            {labeled(
                              '額外動作',
                              <textarea
                                value={sup.extra_actions}
                                onChange={(e) => updateSup({ extra_actions: e.target.value }, false)}
                                onBlur={(e) => updateSup({ extra_actions: e.target.value }, true)}
                                rows={3}
                                placeholder="Extra actions / notes…"
                                className={softInput}
                              />
                            )}
                          </div>

                          <div className="border-t border-dashed border-gray-100 pt-4 space-y-4">
                            <h5 className="text-xs font-semibold uppercase tracking-wide text-gray-900">
                              Packaging 包裝
                            </h5>
                            <div className="grid md:grid-cols-2 gap-4">
                              {labeled(
                                '內部包裝處理',
                                <select
                                  value={normalizeHonourInternalPack(sup.internal_pack)}
                                  onChange={(e) => updateSup({ internal_pack: e.target.value }, true)}
                                  className={softInput}
                                >
                                  <option value="">選擇…</option>
                                  {HONOUR_INTERNAL_PACK_OPTIONS.map((o) => (
                                    <option key={o} value={o}>
                                      {o}
                                    </option>
                                  ))}
                                </select>
                              )}
                              {labeled(
                                '出貨包裝',
                                <MultiChoiceSelect
                                  values={parseHonourMultiValue(sup.pack_required)}
                                  options={HONOUR_PACK_REQUIRED_OPTIONS}
                                  {...multiLocal('pack_required', HONOUR_PACK_REQUIRED_OPTIONS)}
                                  placeholder="選擇出貨包裝…"
                                />
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
  );
}
