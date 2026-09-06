'use client';

import { Fragment } from 'react';
import { getCupmokaLines, type CupmokaLineItem } from '@/lib/orders';
import type { CupmokaOrderDetailProps } from '../order-detail-types';

export default function CupmokaOrderDetail({
  order,
  commitCupmokaLines,
  form,
}: CupmokaOrderDetailProps) {
  const { softInput, setOrder, patch } = form;

  return (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-700">Ordered Products 訂購產品</h3>
                  <button
                    type="button"
                    onClick={() =>
                      commitCupmokaLines([
                        ...getCupmokaLines(order.fields),
                        { name: '', quantity: 1, unit_price: 0, line_total: 0 },
                      ])
                    }
                    className="text-sm font-medium text-brand-600 hover:text-brand-700"
                  >
                    + Add product
                  </button>
                </div>
                {(() => {
                  const cupmokaLines = getCupmokaLines(order.fields);
                  if (!cupmokaLines.length) {
                    return (
                      <p className="text-sm text-gray-400">
                        No store line items yet. Import from Hub / Cupmoka WooCommerce to fill products and prices.
                        {order.description ? (
                          <span className="block mt-1 text-gray-500">Description: {order.description}</span>
                        ) : null}
                      </p>
                    );
                  }
                  const updateLine = (index: number, patchLine: Partial<CupmokaLineItem>, commit = false) => {
                    let toCommit: CupmokaLineItem[] | undefined;
                    setOrder((prev) => {
                      if (!prev) return prev;
                      const current = getCupmokaLines(prev.fields);
                      const next = current.map((line, i) => {
                        if (i !== index) return line;
                        const merged = { ...line, ...patchLine };
                        const qty = Number(merged.quantity) || 0;
                        const unit = Number(merged.unit_price) || 0;
                        if (patchLine.quantity != null || patchLine.unit_price != null) {
                          merged.line_total = Math.round(qty * unit * 100) / 100;
                        }
                        return merged;
                      });
                      if (commit) toCommit = next;
                      return {
                        ...prev,
                        fields: { ...prev.fields, cupmoka_lines: JSON.stringify(next) },
                      };
                    });
                    if (toCommit) commitCupmokaLines(toCommit);
                  };
                  return (
                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                      <table className="min-w-full text-sm">
                        <thead className="bg-gray-50 text-left text-[11px] uppercase tracking-wide text-gray-900">
                          <tr>
                            <th className="px-3 py-2.5 font-medium w-14" />
                            <th className="px-4 py-2.5 font-medium">Product</th>
                            <th className="px-4 py-2.5 font-medium text-right w-24">Qty</th>
                            <th className="px-4 py-2.5 font-medium text-right w-28">Unit price</th>
                            <th className="px-4 py-2.5 font-medium text-right w-28">Line total</th>
                            <th className="px-2 py-2.5 w-10" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-100">
                          {cupmokaLines.map((line, index) => (
                            <Fragment key={`cupmoka-${index}`}>
                              <tr className="bg-white">
                                <td className="px-3 py-2">
                                  {line.image ? (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                      src={line.image}
                                      alt=""
                                      className="h-10 w-10 rounded-lg object-cover border border-gray-100"
                                    />
                                  ) : (
                                    <div className="h-10 w-10 rounded-lg bg-gray-50 border border-gray-100" />
                                  )}
                                </td>
                                <td className="px-4 py-2">
                                  <input
                                    value={line.name}
                                    onChange={(e) => updateLine(index, { name: e.target.value })}
                                    onBlur={() => updateLine(index, {}, true)}
                                    className={softInput}
                                    placeholder="Product name"
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <input
                                    type="number"
                                    min={0}
                                    value={line.quantity}
                                    onChange={(e) =>
                                      updateLine(index, { quantity: Number(e.target.value) || 0 })
                                    }
                                    onBlur={() => updateLine(index, {}, true)}
                                    className={`${softInput} text-right tabular-nums`}
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={line.unit_price}
                                    onChange={(e) =>
                                      updateLine(index, { unit_price: Number(e.target.value) || 0 })
                                    }
                                    onBlur={() => updateLine(index, {}, true)}
                                    className={`${softInput} text-right tabular-nums`}
                                  />
                                </td>
                                <td className="px-4 py-2">
                                  <input
                                    type="number"
                                    min={0}
                                    step="0.01"
                                    value={line.line_total}
                                    onChange={(e) =>
                                      updateLine(index, { line_total: Number(e.target.value) || 0 })
                                    }
                                    onBlur={() => updateLine(index, {}, true)}
                                    className={`${softInput} text-right tabular-nums font-medium`}
                                  />
                                </td>
                                <td className="px-2 py-2">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      commitCupmokaLines(cupmokaLines.filter((_, i) => i !== index))
                                    }
                                    className="text-gray-400 hover:text-red-600 text-lg leading-none px-1"
                                    aria-label="Remove line"
                                  >
                                    ×
                                  </button>
                                </td>
                              </tr>
                              {line.options?.length ? (
                                <tr className="bg-gray-50/80">
                                  <td />
                                  <td colSpan={5} className="px-4 py-2.5">
                                    <ul className="space-y-1 text-xs text-gray-600">
                                      {line.options.map((opt, oi) => (
                                        <li key={`${opt.label}-${oi}`} className="flex flex-wrap gap-x-2">
                                          <span className="font-medium text-gray-700">{opt.label}:</span>
                                          <span>{opt.value}</span>
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
  );
}
