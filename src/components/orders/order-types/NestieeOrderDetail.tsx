'use client';

import { Fragment } from 'react';
import { getNestieeLines, nestieeGiftQtyManualKey } from '@/lib/orders';
import type { NestieeOrderDetailProps } from '../order-detail-types';

export default function NestieeOrderDetail({
  order,
  nestieeGiftBoxes,
  form,
}: NestieeOrderDetailProps) {
  const { softInput, fVal, labeled, nonNeg, setFieldLocal, patch } = form;

  return (
              <div className="space-y-8">
                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">Ordered Products 訂購產品</h3>
                  {(() => {
                    const nestieeLines = getNestieeLines(order.fields);
                    if (!nestieeLines.length) {
                      return (
                        <p className="text-sm text-gray-400">
                          No store line items yet. Import from Hub / Nestiee WooCommerce to fill products and prices.
                          {order.description ? (
                            <span className="block mt-1 text-gray-500">Description: {order.description}</span>
                          ) : null}
                        </p>
                      );
                    }
                    const fmt = (n: number) =>
                      n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 });
                    return (
                      <div className="overflow-x-auto rounded-xl border border-gray-200">
                        <table className="min-w-full text-sm">
                          <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-900">
                            <tr>
                              <th className="px-4 py-2.5 font-medium">Product</th>
                              <th className="px-4 py-2.5 font-medium text-right">Qty</th>
                              <th className="px-4 py-2.5 font-medium text-right">Unit price</th>
                              <th className="px-4 py-2.5 font-medium text-right">Line total</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-100">
                            {nestieeLines.map((line, i) => (
                              <Fragment key={`${line.name}-${i}`}>
                                <tr className="bg-white">
                                  <td className="px-4 py-3 text-gray-900">{line.name}</td>
                                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{line.quantity}</td>
                                  <td className="px-4 py-3 text-right tabular-nums text-gray-700">{fmt(line.unit_price)}</td>
                                  <td className="px-4 py-3 text-right tabular-nums font-medium text-gray-900">
                                    {fmt(line.line_total)}
                                  </td>
                                </tr>
                                {line.options?.length ? (
                                  <tr className="bg-gray-50/80">
                                    <td colSpan={4} className="px-4 py-2.5">
                                      <ul className="space-y-1 text-xs text-gray-600">
                                        {line.options.map((opt, oi) => (
                                          <li key={`${opt.label}-${oi}`} className="flex flex-wrap gap-x-2">
                                            <span className="font-medium text-gray-700">{opt.label}:</span>
                                            <span>{opt.value}</span>
                                            {opt.price > 0 ? (
                                              <span className="tabular-nums text-gray-500">(+{fmt(opt.price)})</span>
                                            ) : null}
                                          </li>
                                        ))}
                                      </ul>
                                    </td>
                                  </tr>
                                ) : null}
                              </Fragment>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })()}
                </div>

                <div>
                  <h3 className="text-sm font-semibold text-gray-700 mb-3">所需禮盒</h3>
                  <p className="text-xs text-gray-400 mb-3">Enter how many of each gift-box type are needed for this order.</p>
                  <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {nestieeGiftBoxes.map((box) => (
                      <div key={box.id}>
                        {labeled(
                          box.label,
                          <input
                            type="number"
                            min={0}
                            value={fVal(box.qtyKey)}
                            onChange={(e) => setFieldLocal(box.qtyKey, nonNeg(e.target.value))}
                            onBlur={(e) => {
                              const v = nonNeg(e.target.value);
                              const manualKey = nestieeGiftQtyManualKey(box.qtyKey);
                              setFieldLocal(box.qtyKey, v);
                              setFieldLocal(manualKey, 'true');
                              patch({ fields: { [box.qtyKey]: v, [manualKey]: 'true' } });
                            }}
                            placeholder="0"
                            className={softInput}
                          />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
  );
}
