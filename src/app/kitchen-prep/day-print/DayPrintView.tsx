'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import {
  PREP_FLAVOR_SHORT,
  buildDaySugarWaterSheet,
  dayMaterialsCapacityLabel,
  formatDayMaterialAmount,
  formatDayMaterialGrams,
  formatPrepDayHeading,
  formatPrepDayOrderTypes,
  formatPrepDaySlotCoverage,
  summarizeDayMaterials,
  type DayMaterialsOrderChip,
  type DayMaterialsSummary,
  type DaySugarWaterGroup,
  type PrepOrder,
  type StewFormulaMapLike,
} from '@/lib/kitchen-prep';
import { BTN, bi } from '@/lib/ui-labels';

function orderChipLabel(order: DayMaterialsOrderChip): string {
  const code = order.orderCode.trim() || (order.id ? `#${order.id}` : '—');
  return order.detail ? `${code}（${order.detail}）` : code;
}

function slotBadge(slot: DayMaterialsOrderChip['scheduleSlot']): { text: string; className: string } {
  if (slot === 'AM') return { text: 'AM', className: 'bg-[#dbeafe] text-[#1d4ed8]' };
  if (slot === 'PM') return { text: 'PM', className: 'bg-[#ffedd5] text-[#c2410c]' };
  return { text: '未設定', className: 'bg-gray-100 text-gray-700' };
}

function amount(qty: number, className: string) {
  return <td className={className}>{formatDayMaterialAmount(qty)}</td>;
}

export default function KitchenPrepDayPrint() {
  const searchParams = useSearchParams();
  const date = searchParams.get('date') || '';
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(date);
  const [summary, setSummary] = useState<DayMaterialsSummary | null>(null);
  const [error, setError] = useState('');
  const [printedAt] = useState(() => new Date().toLocaleString('en-HK'));

  useEffect(() => {
    if (!validDate) {
      setSummary(null);
      setError(bi('Choose a stewing date to print day materials.', '請選擇燉製日期以列印全日材料。'));
      return;
    }
    let cancelled = false;
    setError('');
    setSummary(null);
    (async () => {
      const res = await fetch(`/api/kitchen-prep?dateStart=${date}&dateEnd=${date}`);
      if (!res.ok) throw new Error('load');
      const data = await res.json();
      const orders = (data.orders || []) as PrepOrder[];
      let formulas: StewFormulaMapLike | undefined;
      const firstId = orders[0]?.id;
      if (firstId) {
        const detailRes = await fetch(`/api/kitchen-prep/${firstId}`);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          formulas = detail.stewFormulas as StewFormulaMapLike | undefined;
        }
      }
      if (cancelled) return;
      setSummary(formulas ? summarizeDayMaterials(orders, formulas) : summarizeDayMaterials(orders));
    })().catch(() => {
      if (!cancelled) setError(bi('Failed to load day materials.', '讀取全日材料失敗。'));
    });
    return () => {
      cancelled = true;
    };
  }, [date, validDate]);

  const sheet = summary ? buildDaySugarWaterSheet(summary) : null;
  const hasLines = Boolean(summary?.lines.length);

  const handlePrint = () => {
    if (!hasLines) return;
    window.print();
  };

  return (
    <div className="prep-day-print-root min-h-screen bg-[#f3f4f6] text-[#1f1a14] print:bg-white">
      <style>{`
        @media print {
          @page {
            size: A4 portrait;
            margin: 0;
          }
        }
      `}</style>
      <div className="no-print border-b border-gray-200 bg-white px-6 py-3 flex items-center justify-between gap-3">
        <div>
          <Link href="/kitchen-prep" className="text-sm font-semibold text-[#0f766e] hover:text-[#115e59]">
            ← {bi('Back to schedule', '返回排程')}
          </Link>
          {validDate && (
            <p className="mt-1 text-sm text-gray-600">
              {date} · {bi('Day materials total', '全日材料合計')}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={handlePrint}
          disabled={!hasLines}
          className="rounded-lg bg-[#0f766e] px-4 py-2 text-sm font-semibold text-white hover:bg-[#115e59] disabled:opacity-50"
        >
          {BTN.printPdf}
        </button>
      </div>

      {error && (
        <div className="no-print mx-auto mt-6 max-w-3xl rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</div>
      )}

      {summary === null && !error && (
        <div className="flex min-h-[40vh] items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#0f766e]" />
        </div>
      )}

      {summary && sheet && (
        <div className="prep-day-sheet mx-auto my-6 w-full max-w-[210mm] bg-white px-6 py-7 shadow-[0_10px_30px_rgba(0,0,0,0.08)] print:my-0 print:max-w-none print:shadow-none">
          <header className="prep-day-head mb-3.5 flex items-start justify-between gap-4 border-b-4 border-[#0f766e] pb-4">
            <div>
              <h1 className="text-2xl font-bold leading-tight print:text-xl">全日材料合計</h1>
              <p className="mt-1.5 text-sm text-gray-600">糖水兩組：桂花｜紅棗＋冰糖合組 · 煮糖水／冷泡水</p>
            </div>
            <div className="text-right">
              <p className="font-mono text-xl font-extrabold text-[#0f766e] print:text-lg">{summary.stewingDate || date}</p>
              <p className="mt-1.5 text-xs text-gray-500">
                {summary.orders.length} 張 · {printedAt}
              </p>
            </div>
          </header>

          <div className="mb-3.5 grid grid-cols-2 gap-x-4 gap-y-2 text-sm leading-snug print:text-[12px]">
            <div>
              <span className="text-gray-500">燉製日期：</span>
              <strong>{formatPrepDayHeading(summary.stewingDate || date)}</strong>
            </div>
            <div>
              <span className="text-gray-500">Order Type：</span>
              <strong>{formatPrepDayOrderTypes(summary.orders.map((order) => order.orderType))}</strong>
            </div>
            <div>
              <span className="text-gray-500">涵蓋時段：</span>
              <strong>{formatPrepDaySlotCoverage(summary.orders.map((order) => order.scheduleSlot))}</strong>
            </div>
            <div>
              <span className="text-gray-500">今次要燉合計：</span>
              <strong>{summary.totals.bottles} 樽</strong>
            </div>
          </div>

          {summary.orders.length > 0 && (
            <div className="prep-day-orders mb-4 rounded-[10px] border border-[#d7e3de] bg-[#f8faf9] px-3 py-2.5 text-[13px] leading-relaxed text-slate-700 print:text-[11px]">
              <strong className="text-[#0f766e]">包入呢日：</strong>{' '}
              {summary.orders.map((order, index) => {
                const badge = slotBadge(order.scheduleSlot);
                return (
                  <span key={`${order.id}-${order.orderCode}-${index}`}>
                    {index > 0 ? ' · ' : ''}
                    <span className={`mr-1 inline-block rounded-full px-1.5 py-0.5 text-[11px] font-bold ${badge.className}`}>
                      {badge.text}
                    </span>
                    {orderChipLabel(order)}
                  </span>
                );
              })}
            </div>
          )}

          {!hasLines ? (
            <p className="text-sm text-gray-500">{bi('No prep orders on this date.', '這天沒有備料單。')}</p>
          ) : (
            <>
              {sheet.groups.map((group) => (
                <SugarGroup key={group.id} group={group} />
              ))}

              <div className="prep-day-footer mt-2 grid grid-cols-3 gap-x-3 gap-y-2.5 rounded-xl border-t-[1.5px] border-[#5a6b66] bg-[#f7f3eb] px-4 py-3.5">
                <FooterCell label="全日樽數" value={String(sheet.footer.bottles)} />
                <FooterCell label="燕餅合計 g" value={formatDayMaterialAmount(sheet.footer.birdNest)} />
                <FooterCell
                  label="① 桂花 · 要準備糖水"
                  value={formatDayMaterialGrams(sheet.footer.osmanthusBoil)}
                  valueClass="text-[#b45309]"
                />
                <FooterCell
                  label="② 紅棗＋冰糖 · 要準備糖水"
                  value={formatDayMaterialGrams(sheet.footer.comboBoil)}
                  valueClass="text-[#1d4ed8]"
                />
                <FooterCell label="全日水(煮糖) 合計" value={formatDayMaterialGrams(sheet.footer.boilSugar)} />
                <FooterCell
                  label="桂花 · 冷泡水"
                  value={formatDayMaterialGrams(sheet.footer.osmanthusColdSoak)}
                  valueClass="text-[#b45309]"
                />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function FooterCell({ label, value, valueClass }: { label: string; value: string; valueClass?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-[#6b6358]">{label}</div>
      <div className={`mt-0.5 text-lg font-extrabold tabular-nums leading-tight print:text-base ${valueClass || 'text-[#1f1a14]'}`}>
        {value}
      </div>
    </div>
  );
}

function SugarGroup({ group }: { group: DaySugarWaterGroup }) {
  const combo = group.id === 'combo';
  const nowClass =
    'prep-day-now whitespace-nowrap px-2 py-2.5 text-right text-xl font-extrabold tabular-nums leading-none text-[#8b6914] print:px-1.5 print:py-2 print:text-lg';
  const numClass =
    'whitespace-nowrap px-2 py-2.5 text-right text-[17px] font-bold tabular-nums leading-none text-[#1f1a14] print:px-1.5 print:py-2 print:text-[15px]';
  const waterClass =
    'whitespace-nowrap px-2 py-2.5 text-right text-lg font-extrabold tabular-nums leading-none text-[#0f766e] print:px-1.5 print:py-2 print:text-base';
  const labelClass = 'px-2 py-2.5 text-left print:px-1.5 print:py-2';

  return (
    <section
      className={`prep-day-group mb-4 overflow-hidden rounded-[14px] border bg-white print:overflow-visible ${combo ? 'border-[#f0c9b0]' : 'border-[#e0d0ae]'}`}
      data-sugar-group={group.id}
    >
      <div
        className="flex flex-wrap items-baseline justify-between gap-3 border-b border-[#ddd6c8] px-4 py-3.5"
        style={{
          borderLeftWidth: 6,
          borderLeftStyle: 'solid',
          borderLeftColor: combo ? '#e07a4a' : '#c4a574',
          background: combo ? '#fff5f0' : '#fbf6ec',
        }}
      >
        <h2 className="text-[17px] font-bold print:text-base">
          {group.title} <small className="ml-1.5 font-medium text-[#6b6358]">{group.subtitle}</small>
        </h2>
        <p className="text-[15px] font-bold tabular-nums text-[#6b6358] print:text-sm">
          今次要燉 <strong className="text-[#1f1a14]">{group.bottles}</strong> 樽
          {group.bottleNote ? `（${group.bottleNote}）` : ''}
        </p>
      </div>

      {group.rows.length === 0 ? (
        <p className="px-4 py-3 text-sm text-[#6b6358]">今日沒有</p>
      ) : (
        <div className="prep-day-scroll overflow-x-auto">
          <table className="w-full border-collapse text-sm print:text-[12px]">
            {combo ? (
              <ComboColGroup />
            ) : (
              <colgroup>
                <col style={{ width: '14%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '12%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '18%' }} />
                <col style={{ width: '18%' }} />
              </colgroup>
            )}
            <thead>
              {combo ? (
                <tr className="bg-[#f3f0ea] text-[11px] font-bold text-[#6b6358]">
                  <th className="px-2 py-2 text-left print:px-1.5">口味</th>
                  <th className="px-2 py-2 text-left print:px-1.5">容量</th>
                  <th className="px-2 py-2 text-right print:px-1.5">今次要燉</th>
                  <th className="px-2 py-2 text-right print:px-1.5">燕餅 g</th>
                  <th className="px-2 py-2 text-right print:px-1.5">紅棗 g</th>
                  <th className="px-2 py-2 text-right print:px-1.5">冰糖 g</th>
                  <th className="px-2 py-2 text-right print:px-1.5">水(煮糖) g</th>
                </tr>
              ) : (
                <tr className="bg-[#f3f0ea] text-[11px] font-bold text-[#6b6358]">
                  <th className="px-2 py-2 text-left print:px-1.5">容量</th>
                  <th className="px-2 py-2 text-right print:px-1.5">今次要燉</th>
                  <th className="px-2 py-2 text-right print:px-1.5">燕餅 g</th>
                  <th className="px-2 py-2 text-right print:px-1.5">桂花 g</th>
                  <th className="px-2 py-2 text-right print:px-1.5">片糖 g</th>
                  <th className="px-2 py-2 text-right print:px-1.5">水(煮糖) g</th>
                  <th className="px-2 py-2 text-right print:px-1.5">水(冷泡) g</th>
                </tr>
              )}
            </thead>
            <tbody>
              {combo
                ? group.rows.map((line) => (
                    <tr key={`${line.capacity}:${line.flavor}`} className="border-b border-[#ddd6c8]">
                      <td className={labelClass}>{PREP_FLAVOR_SHORT[line.flavor]}</td>
                      <td className={labelClass}>{dayMaterialsCapacityLabel(line.capacity)}</td>
                      <td className={nowClass}>{line.bottles}</td>
                      {amount(line.birdNest, numClass)}
                      {amount(line.redDate, numClass)}
                      {amount(line.rockSugar, numClass)}
                      {amount(line.boilSugar, waterClass)}
                    </tr>
                  ))
                : group.rows.map((line) => (
                    <tr key={`${line.capacity}:${line.flavor}`} className="border-b border-[#ddd6c8]">
                      <td className={labelClass}>{dayMaterialsCapacityLabel(line.capacity)}</td>
                      <td className={nowClass}>{line.bottles}</td>
                      {amount(line.birdNest, numClass)}
                      {amount(line.osmanthus, numClass)}
                      {amount(line.slabSugar, numClass)}
                      {amount(line.boilSugar, waterClass)}
                      {amount(line.coldSoak, waterClass)}
                    </tr>
                  ))}
              <GroupTotal group={group} nowClass={nowClass} numClass={numClass} waterClass={waterClass} labelClass={labelClass} />
            </tbody>
          </table>
        </div>
      )}

      <div
        className={`border-t border-dashed border-[#c5d9ce] bg-[#f8faf9] p-3.5 print:p-2.5 ${combo ? 'prep-day-boxes prep-day-boxes-combo' : 'prep-day-boxes'}`}
      >
        {group.boxes.map((box) => (
          <div
            key={box.key}
            className={`min-w-0 rounded-[10px] px-3 py-2.5 text-[13px] text-gray-600 print:px-2 print:py-2 print:text-[11px] ${
              combo ? 'border border-[#93c5fd] bg-[#eff6ff]' : 'border border-[#fcd34d] bg-[#fffbeb]'
            }`}
          >
            {box.label}
            <b
              className={`mt-1 block font-extrabold tabular-nums leading-none ${box.highlight ? 'text-[22px] print:text-lg' : 'text-xl print:text-base'} ${
                combo ? 'text-[#1d4ed8]' : 'text-[#b45309]'
              }`}
            >
              {formatDayMaterialGrams(box.amount)}
            </b>
          </div>
        ))}
      </div>
    </section>
  );
}

function ComboColGroup() {
  return (
    <colgroup>
      <col style={{ width: '12%' }} />
      <col style={{ width: '16%' }} />
      <col style={{ width: '12%' }} />
      <col style={{ width: '12%' }} />
      <col style={{ width: '14%' }} />
      <col style={{ width: '16%' }} />
      <col style={{ width: '18%' }} />
    </colgroup>
  );
}

function GroupTotal({
  group,
  nowClass,
  numClass,
  waterClass,
  labelClass,
}: {
  group: DaySugarWaterGroup;
  nowClass: string;
  numClass: string;
  waterClass: string;
  labelClass: string;
}) {
  const combo = group.id === 'combo';
  const rowClass = combo ? 'bg-[#ecfdf5] font-bold' : 'bg-[#faf8f5] font-bold';
  const cellStyle = combo ? { borderTop: '2px solid #0f766e' } : undefined;
  return (
    <tr className={rowClass}>
      <td className={labelClass} style={cellStyle} colSpan={combo ? 2 : 1}>
        {combo ? '紅棗＋冰糖 合計' : '桂花合計'}
      </td>
      <td className={nowClass} style={cellStyle}>
        {group.bottles}
      </td>
      {amountCell(group.birdNest, numClass, cellStyle)}
      {combo ? amountCell(group.redDate, numClass, cellStyle) : amountCell(group.osmanthus, numClass, cellStyle)}
      {combo ? amountCell(group.rockSugar, numClass, cellStyle) : amountCell(group.slabSugar, numClass, cellStyle)}
      {amountCell(group.boilSugar, waterClass, cellStyle)}
      {combo ? null : amountCell(group.coldSoak, waterClass, cellStyle)}
    </tr>
  );
}

function amountCell(qty: number, className: string, style?: { borderTop: string }) {
  return (
    <td className={className} style={style}>
      {formatDayMaterialAmount(qty)}
    </td>
  );
}
