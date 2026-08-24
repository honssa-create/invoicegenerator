'use client';

import { useEffect, useState } from 'react';
import {
  type KitchenCatalog,
  type KitchenFormulas,
  type KitchenState,
  type BomLine,
  giftBoxQtyKey,
  uniqueCatalogId,
  finishedSkusFromCatalog,
  giftBoxBomRawSelectOptions,
  stewFormulaRawSelectOptions,
  BIRD_NEST_FORMULA_PLACEHOLDER,
  isReserveRawMaterial,
  isUntrackedStewIngredient,
  type CatalogRawMaterial,
} from '@/lib/kitchen';
import { FINISHED_FLAVORS } from '@/lib/kitchen-bom';
import type { FlavorFormulaPerBottle, PrepFlavor, StewIngredientLine } from '@/lib/kitchen-prep';
import {
  PREP_FLAVOR_LABELS,
  formulaFromLines,
  getFormulaLines,
  defaultGiftBoxGlassBottleStockName,
} from '@/lib/kitchen-prep';
import { useModalUnsavedWarning } from '@/hooks/useUnsavedChangesWarning';
import { bi } from '@/lib/ui-labels';

type Tab = 'raw' | 'products' | 'bom' | 'stew';

/** Shared compact control styles for admin forms */
const inp = 'border border-gray-200 rounded px-1.5 py-0.5 text-xs bg-white';
const sel = `${inp} max-w-full`;
const btnLink = 'text-[11px] text-brand-600 hover:underline shrink-0';
const btnDel = 'text-[11px] text-red-600 hover:underline shrink-0';
const sectionTitle = 'text-xs font-semibold text-gray-600 mb-1.5';

interface Props {
  state: KitchenState;
  busy: boolean;
  onSaved: (state: KitchenState) => void;
  onError: (msg: string) => void;
  onBusy: (v: boolean) => void;
  onSuccess: (msg: string) => void;
}

export default function KitchenAdminPanel({
  state,
  busy,
  onSaved,
  onError,
  onBusy,
  onSuccess,
}: Props) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>('raw');
  const [catalog, setCatalog] = useState<KitchenCatalog>(state.catalog);
  const [formulas, setFormulas] = useState<KitchenFormulas>(state.formulas);

  useEffect(() => {
    setCatalog(state.catalog);
    setFormulas(state.formulas);
  }, [state.catalog, state.formulas]);

  useModalUnsavedWarning(open, { catalog, formulas });

  const saveWithFlash = async () => {
    onBusy(true);
    try {
      const res = await fetch('/api/kitchen/catalog', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ catalog, formulas }),
      });
      const data = await res.json();
      if (!res.ok) {
        onError(data.error || 'Save failed');
        return;
      }
      if (data.state) onSaved(data.state);
      onSuccess(bi('Catalog saved', '設定已儲存'));
    } finally {
      onBusy(false);
    }
  };

  const skus = finishedSkusFromCatalog(catalog);
  const rawNames = catalog.rawMaterials.map((m) => m.name);
  const giftBoxRawOptions = (currentName: string) => giftBoxBomRawSelectOptions(catalog, currentName);
  const stewRawOptions = (currentName: string) => stewFormulaRawSelectOptions(catalog, currentName);
  const rawMaterialRows = catalog.rawMaterials.map((material, index) => ({ material, index }));
  const regularRawRows = rawMaterialRows.filter(
    ({ material }) => !isReserveRawMaterial(material.name) && !isUntrackedStewIngredient(material.name)
  );
  const reserveRawRows = rawMaterialRows.filter(({ material }) => isReserveRawMaterial(material.name));

  const updateRawMaterial = (index: number, patch: Partial<CatalogRawMaterial>) => {
    const next = [...catalog.rawMaterials];
    next[index] = { ...next[index], ...patch };
    setCatalog({ ...catalog, rawMaterials: next });
  };

  const removeRawMaterial = (index: number) => {
    setCatalog({
      ...catalog,
      rawMaterials: catalog.rawMaterials.filter((_, j) => j !== index),
    });
  };

  const rawTableHead = (
    <thead>
      <tr className="text-left text-[10px] text-gray-400 uppercase">
        <th className="pb-1 pr-1 font-medium">名稱</th>
        <th className="pb-1 pr-1 font-medium w-14">單位</th>
        <th className="pb-1 w-8" />
      </tr>
    </thead>
  );

  const renderRawMaterialRow = ({ material: m, index: i }: { material: CatalogRawMaterial; index: number }) => (
    <tr key={i}>
      <td className="pr-1 py-0.5">
        <input
          className={`${inp} w-full min-w-[5rem] max-w-[8rem]`}
          value={m.name}
          onChange={(e) => updateRawMaterial(i, { name: e.target.value })}
          placeholder="名稱"
        />
      </td>
      <td className="pr-1 py-0.5">
        <input
          className={`${inp} w-12`}
          value={m.unit}
          onChange={(e) => updateRawMaterial(i, { unit: e.target.value })}
        />
      </td>
      <td className="py-0.5">
        <button type="button" className={btnDel} onClick={() => removeRawMaterial(i)}>
          ×
        </button>
      </td>
    </tr>
  );

  return (
    <div className="mb-4 rounded-lg border border-gray-200 bg-white text-xs">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2 text-left"
      >
        <span className="font-semibold text-gray-900 text-sm">
          {bi('Admin — stock catalogs & formulas', 'Admin 管理 — 原料／產品／配方')}
        </span>
        <span className="text-gray-400">{open ? '▲' : '▼'}</span>
      </button>

      {open && (
        <div className="border-t border-gray-100 px-3 py-2 space-y-2">
          <div className="flex flex-wrap gap-1">
            {(
              [
                ['raw', bi('Ingredients', '原料')],
                ['products', bi('Products', '產品')],
                ['bom', bi('Gift-box BOM', '禮盒配方')],
                ['stew', bi('Stew formulas', '燉製配方')],
              ] as [Tab, string][]
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                  tab === id ? 'bg-brand-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'raw' && (
            <div className="space-y-4 max-w-xl">
              <div>
                <h3 className={sectionTitle}>{bi('Ingredients', '原料')}</h3>
                <table className="w-full border-collapse">
                  {rawTableHead}
                  <tbody>{regularRawRows.map(renderRawMaterialRow)}</tbody>
                </table>
                <button
                  type="button"
                  className={`${btnLink} mt-1`}
                  onClick={() => {
                    const regular = catalog.rawMaterials.filter((m) => !isReserveRawMaterial(m.name));
                    const reserve = catalog.rawMaterials.filter((m) => isReserveRawMaterial(m.name));
                    setCatalog({
                      ...catalog,
                      rawMaterials: [
                        ...regular,
                        { name: '', unit: 'g', sortOrder: regular.length },
                        ...reserve,
                      ],
                    });
                  }}
                >
                  + 新增原料
                </button>
              </div>

              <div>
                <div className="border-t-2 border-black mb-2" aria-hidden />
                <h3 className={sectionTitle}>{bi('Reserve stock', '備用')}</h3>
                <table className="w-full border-collapse">
                  {rawTableHead}
                  <tbody>{reserveRawRows.map(renderRawMaterialRow)}</tbody>
                </table>
                <button
                  type="button"
                  className={`${btnLink} mt-1`}
                  onClick={() => {
                    const regular = catalog.rawMaterials.filter((m) => !isReserveRawMaterial(m.name));
                    const reserve = catalog.rawMaterials.filter((m) => isReserveRawMaterial(m.name));
                    const nextSort = reserve.reduce((max, m) => Math.max(max, m.sortOrder ?? 0), 99) + 1;
                    setCatalog({
                      ...catalog,
                      rawMaterials: [
                        ...regular,
                        ...reserve,
                        { name: '備用', unit: 'g', sortOrder: nextSort },
                      ],
                    });
                  }}
                >
                  + 新增原料
                </button>
              </div>
            </div>
          )}

          {tab === 'products' && (
            <div className="grid md:grid-cols-2 gap-3">
              <div>
                <h3 className={sectionTitle}>禮盒類型</h3>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left text-[10px] text-gray-400">
                      <th className="pb-0.5 pr-1">標籤</th>
                      <th className="pb-0.5 w-8">啟</th>
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.giftBoxTypes.map((g, i) => (
                      <tr key={g.id || i}>
                        <td className="pr-1 py-0.5">
                          <input
                            className={`${inp} w-full min-w-[4rem] max-w-[14rem]`}
                            value={g.label}
                            onChange={(e) => {
                              const next = [...catalog.giftBoxTypes];
                              next[i] = { ...g, label: e.target.value };
                              setCatalog({ ...catalog, giftBoxTypes: next });
                            }}
                          />
                        </td>
                        <td className="py-0.5 text-center">
                          <input
                            type="checkbox"
                            className="scale-90"
                            checked={g.active}
                            onChange={(e) => {
                              const next = [...catalog.giftBoxTypes];
                              next[i] = { ...g, active: e.target.checked };
                              setCatalog({ ...catalog, giftBoxTypes: next });
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  className={`${btnLink} mt-1`}
                  onClick={() => {
                    const id = uniqueCatalogId(
                      'box',
                      catalog.giftBoxTypes.map((x) => x.id)
                    );
                    setCatalog({
                      ...catalog,
                      giftBoxTypes: [
                        ...catalog.giftBoxTypes,
                        {
                          id,
                          label: '',
                          qtyKey: giftBoxQtyKey(id),
                          sortOrder: catalog.giftBoxTypes.length,
                          active: true,
                        },
                      ],
                    });
                  }}
                >
                  + 新增禮盒
                </button>
              </div>
              <div>
                <h3 className={sectionTitle}>成品容量</h3>
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="text-left text-[10px] text-gray-400">
                      <th className="pb-0.5 pr-1">標籤</th>
                      <th className="pb-0.5 w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {catalog.capacities.map((c, i) => (
                      <tr key={c.id || i}>
                        <td className="pr-1 py-0.5">
                          <input
                            className={`${inp} w-full min-w-[4rem] max-w-[14rem]`}
                            value={c.label}
                            onChange={(e) => {
                              const next = [...catalog.capacities];
                              next[i] = { ...c, label: e.target.value };
                              setCatalog({ ...catalog, capacities: next });
                            }}
                          />
                        </td>
                        <td className="py-0.5">
                          <button
                            type="button"
                            className={btnDel}
                            onClick={() =>
                              setCatalog({
                                ...catalog,
                                capacities: catalog.capacities.filter((_, j) => j !== i),
                              })
                            }
                          >
                            ×
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <button
                  type="button"
                  className={`${btnLink} mt-1`}
                  onClick={() => {
                    const id = uniqueCatalogId(
                      'cap',
                      catalog.capacities.map((x) => x.id)
                    );
                    setCatalog({
                      ...catalog,
                      capacities: [
                        ...catalog.capacities,
                        { id, label: '', sortOrder: catalog.capacities.length },
                      ],
                    });
                  }}
                >
                  + 新增容量
                </button>
                <p className="text-[10px] text-gray-400 mt-1 leading-tight">
                  口味：桂花／紅棗／冰糖
                </p>
              </div>
            </div>
          )}

          {tab === 'bom' && (
            <div className="space-y-2 max-h-[min(28rem,60vh)] overflow-y-auto">
              {catalog.giftBoxTypes.map((g) => {
                const lines = formulas.giftBoxBoms[g.id] || [];
                const isSuiXin = g.id.startsWith('sui_xin_');
                return (
                  <div key={g.id} className="border border-gray-100 rounded p-1.5">
                    <div className="font-medium text-[11px] text-gray-700 mb-1 truncate">
                      {g.label || g.id}
                    </div>
                    {isSuiXin && (
                      <p className="text-[10px] text-gray-500 mb-1">
                        {bi(
                          '「原」玻璃燉瓶行可選容量；製作禮盒時會扣減所選瓶型庫存。',
                          'Raw glass-jar line sets which bottle size is consumed when making this box.'
                        )}
                      </p>
                    )}
                    <table className="w-full border-collapse">
                      <thead>
                        <tr className="text-[10px] text-gray-400">
                          <th className="pb-0.5 pr-1 text-left w-12">類</th>
                          <th className="pb-0.5 pr-1 text-left">項目</th>
                          <th className="pb-0.5 pr-1 text-right w-14">數量</th>
                          <th className="pb-0.5 w-6" />
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, li) => (
                          <tr key={li}>
                            <td className="pr-1 py-0.5">
                              <select
                                className={`${sel} w-12`}
                                value={line.kind}
                                onChange={(e) => {
                                  const kind = e.target.value as 'finished' | 'raw';
                                  const nextLines = [...lines];
                                  nextLines[li] =
                                    kind === 'finished'
                                      ? { kind: 'finished', sku: skus[0] || '', qty: line.qty }
                                      : { kind: 'raw', name: rawNames[0] || '', qty: line.qty };
                                  setFormulas({
                                    ...formulas,
                                    giftBoxBoms: { ...formulas.giftBoxBoms, [g.id]: nextLines },
                                  });
                                }}
                              >
                                <option value="finished">成</option>
                                <option value="raw">原</option>
                              </select>
                            </td>
                            <td className="pr-1 py-0.5">
                              {line.kind === 'finished' ? (
                                <select
                                  className={`${sel} w-full max-w-[12rem]`}
                                  value={line.sku}
                                  onChange={(e) => {
                                    const nextLines = [...lines];
                                    nextLines[li] = {
                                      kind: 'finished',
                                      sku: e.target.value,
                                      qty: line.qty,
                                    };
                                    setFormulas({
                                      ...formulas,
                                      giftBoxBoms: { ...formulas.giftBoxBoms, [g.id]: nextLines },
                                    });
                                  }}
                                >
                                  {skus.map((sku) => (
                                    <option key={sku} value={sku}>
                                      {catalog.finishedLabels[sku] || sku}
                                    </option>
                                  ))}
                                </select>
                              ) : (
                                <select
                                  className={`${sel} w-full max-w-[14rem]`}
                                  value={line.name}
                                  onChange={(e) => {
                                    const nextLines = [...lines];
                                    nextLines[li] = { kind: 'raw', name: e.target.value, qty: line.qty };
                                    setFormulas({
                                      ...formulas,
                                      giftBoxBoms: { ...formulas.giftBoxBoms, [g.id]: nextLines },
                                    });
                                  }}
                                >
                                  {giftBoxRawOptions(line.name).map((n) => (
                                    <option key={n} value={n}>
                                      {n}
                                    </option>
                                  ))}
                                </select>
                              )}
                            </td>
                            <td className="pr-1 py-0.5">
                              <input
                                type="number"
                                min={0}
                                step="any"
                                className={`${inp} w-14 text-right`}
                                value={line.qty}
                                onChange={(e) => {
                                  const nextLines = [...lines];
                                  const qty = Number(e.target.value) || 0;
                                  nextLines[li] =
                                    line.kind === 'finished'
                                      ? { kind: 'finished', sku: line.sku, qty }
                                      : { kind: 'raw', name: line.name, qty };
                                  setFormulas({
                                    ...formulas,
                                    giftBoxBoms: { ...formulas.giftBoxBoms, [g.id]: nextLines },
                                  });
                                }}
                              />
                            </td>
                            <td className="py-0.5">
                              <button
                                type="button"
                                className={btnDel}
                                onClick={() => {
                                  const nextLines = lines.filter((_, j) => j !== li);
                                  setFormulas({
                                    ...formulas,
                                    giftBoxBoms: { ...formulas.giftBoxBoms, [g.id]: nextLines },
                                  });
                                }}
                              >
                                ×
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <button
                      type="button"
                      className={btnLink}
                      onClick={() => {
                        const add: BomLine = isSuiXin
                          ? { kind: 'raw', name: defaultGiftBoxGlassBottleStockName(), qty: 1 }
                          : skus.length > 0
                            ? { kind: 'finished', sku: skus[0], qty: 1 }
                            : { kind: 'raw', name: giftBoxRawOptions('')[0] || '', qty: 1 };
                        setFormulas({
                          ...formulas,
                          giftBoxBoms: {
                            ...formulas.giftBoxBoms,
                            [g.id]: [...lines, add],
                          },
                        });
                      }}
                    >
                      + 行
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'stew' && (
            <div className="space-y-2 max-h-[min(32rem,65vh)] overflow-y-auto">
              {catalog.capacities.map((cap) => (
                <div key={cap.id} className="border border-gray-100 rounded p-1.5">
                  <div className="font-medium text-[11px] text-gray-700 mb-1">
                    {cap.label || cap.id}
                  </div>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
                    {(FINISHED_FLAVORS as PrepFlavor[]).map((flavor) => {
                      const cell = formulas.stewFormulas[cap.id]?.[flavor];
                      const enabled = cell != null;
                      const editLines: StewIngredientLine[] =
                        enabled && Array.isArray(cell?.lines)
                          ? cell!.lines!.map((l) => ({
                              name: String(l.name || '').trim() || BIRD_NEST_FORMULA_PLACEHOLDER,
                              qty: Math.max(0, Number(l.qty) || 0),
                            }))
                          : enabled
                            ? getFormulaLines(cell, flavor).length
                              ? getFormulaLines(cell, flavor)
                              : []
                            : [];

                      const setCell = (next: FlavorFormulaPerBottle | null) => {
                        const block = { ...(formulas.stewFormulas[cap.id] || {}) };
                        block[flavor] = next;
                        setFormulas({
                          ...formulas,
                          stewFormulas: { ...formulas.stewFormulas, [cap.id]: block },
                        });
                      };
                      const setLines = (nextLines: StewIngredientLine[]) => {
                        setCell(formulaFromLines(nextLines));
                      };

                      return (
                        <div
                          key={flavor}
                          className="rounded border border-gray-100 bg-gray-50/80 p-1.5 min-w-0"
                        >
                          <label className="flex items-center gap-1 mb-1 cursor-pointer">
                            <input
                              type="checkbox"
                              className="scale-90"
                              checked={enabled}
                              onChange={(e) =>
                                setCell(
                                  e.target.checked
                                    ? formulaFromLines([{ name: BIRD_NEST_FORMULA_PLACEHOLDER, qty: 0 }])
                                    : null
                                )
                              }
                            />
                            <span className="text-[11px] font-medium text-gray-800 truncate">
                              {PREP_FLAVOR_LABELS[flavor].split(' ')[0]}
                            </span>
                          </label>
                          {enabled && (
                            <div className="flex flex-wrap gap-1">
                              {editLines.map((line, li) => (
                                <div
                                  key={li}
                                  className="inline-flex items-center gap-0.5 bg-white border border-gray-200 rounded px-1 py-0.5"
                                >
                                  <select
                                    className={`${sel} w-[4.5rem] border-0 p-0`}
                                    value={line.name}
                                    onChange={(e) => {
                                      const next = [...editLines];
                                      next[li] = { ...line, name: e.target.value };
                                      setLines(next);
                                    }}
                                  >
                                    {stewRawOptions(line.name).map((n) => (
                                      <option key={n} value={n}>
                                        {n}
                                      </option>
                                    ))}
                                    {line.name && !stewRawOptions(line.name).includes(line.name) ? (
                                      <option value={line.name}>{line.name}</option>
                                    ) : null}
                                  </select>
                                  <input
                                    type="number"
                                    min={0}
                                    step="any"
                                    className="w-11 border-0 border-l border-gray-100 px-0.5 py-0 text-[11px] text-right"
                                    value={line.qty}
                                    onChange={(e) => {
                                      const next = [...editLines];
                                      next[li] = {
                                        ...line,
                                        qty: Number(e.target.value) || 0,
                                      };
                                      setLines(next);
                                    }}
                                    title="g/bottle"
                                  />
                                  <button
                                    type="button"
                                    className="text-red-500 hover:text-red-700 px-0.5 leading-none"
                                    onClick={() => setLines(editLines.filter((_, j) => j !== li))}
                                  >
                                    ×
                                  </button>
                                </div>
                              ))}
                              <button
                                type="button"
                                className={`${btnLink} self-center`}
                                onClick={() =>
                                  setLines([...editLines, { name: BIRD_NEST_FORMULA_PLACEHOLDER, qty: 0 }])
                                }
                              >
                                +
                              </button>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          )}

          <div className="flex justify-end gap-1.5 pt-1.5 border-t border-gray-100">
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setCatalog(state.catalog);
                setFormulas(state.formulas);
              }}
              className="px-2 py-1 text-[11px] rounded border border-gray-200 text-gray-600"
            >
              重置
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={saveWithFlash}
              className="px-2.5 py-1 text-[11px] rounded bg-brand-600 text-white disabled:opacity-40"
            >
              {bi('Save catalog', '儲存設定')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
