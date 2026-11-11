'use client';

import { orderFileUrl } from '@/lib/image-url';
import {
  computeBirdNestActualTotal,
  mapWeddingCapacityToPackId,
  normalizeWeddingGiftBottleCapacity,
  orderThumbnailFile,
  parseOrderDueDateField,
  weddingGiftBottleCapacityOptions,
  weddingGiftFoilStickerKey,
  weddingGiftRoundTagKey,
} from '@/lib/orders';
import { addCalendarDays } from '@/lib/wedding-gift-confirmation';
import {
  WEDDING_GIFT_LABEL_OPTIONS,
  WEDDING_PACKAGING_LABELS,
  resolveWeddingConfirmationText,
  resolveWeddingGiftLabel,
  resolveWeddingPackagingLabel,
} from '@/lib/wedding-gift-confirmation';
import {
  WEDDING_CLICKUP_FIELDS,
  WEDDING_ORDER_CREATORS,
  WEDDING_STEW_PROGRESS,
  type WeddingClickUpField,
} from '@/lib/wedding-gift-clickup-fields';
import { bi } from '@/lib/ui-labels';
import type { WeddingGiftOrderDetailProps } from '../order-detail-types';
import { CLICKUP_PLAIN_INPUT, ClickUpDash, ClickUpFieldRow, ClickUpReadValue } from './clickup-field-row';

const PILL_PINK =
  'appearance-none cursor-pointer rounded bg-[#ffe4ef] px-2 py-0.5 text-xs font-semibold text-[#c73470] border-0 outline-none';
const PILL_GOLD =
  'appearance-none cursor-pointer rounded bg-[#f4e6d0] px-2 py-0.5 text-xs font-semibold text-[#8a5a1a] border-0 outline-none';
const PLAIN_SELECT =
  'appearance-none cursor-pointer bg-transparent border border-transparent rounded px-1.5 py-1 text-[13px] outline-none hover:bg-[#f8f8f9]';

const CAPACITY_PILL: Record<string, string> = {
  '25g': '即食燕窩25ml',
  '45g': '即食燕窩 (45ml)',
  '75g 薄': '即食燕窩 75ml',
  '75g 厚': '即食燕窩 75ml',
};

const EXTRA_CAPACITIES = [
  '(淨) 免浸燕餅 (0.8g) + 冰糖 + 指引卡',
  '免浸燕餅 (1.8g)',
];

function capacityPillLabel(value: string): string {
  const normalized = normalizeWeddingGiftBottleCapacity(value);
  return CAPACITY_PILL[normalized] || value;
}

export default function WeddingGiftOrderDetail({
  order,
  birdNestTotals: bn,
  bigDayPersistedRef,
  bigDaySavedOnChangeRef,
  onOpenConfirmPaste,
  onPreviewImage,
  syncWeddingGiftDerived,
  setCoreLocal,
  setLinkedDeliveryDatesLocal,
  commitLinkedDeliveryDates,
  form,
}: WeddingGiftOrderDetailProps) {
  const { fVal, nonNeg, setFieldLocal, patch } = form;
  const confirmation = resolveWeddingConfirmationText({
    confirmationText: fVal('confirmation_text'),
    description: order.description,
    notes: order.notes,
  });
  const packagingLabel = resolveWeddingPackagingLabel({
    packagingLabel: fVal('packaging_label'),
    confirmationText: confirmation,
    notes: order.notes,
  });
  const giftLabel = resolveWeddingGiftLabel({
    giftLabel: fVal('gift_label'),
    confirmationText: confirmation,
    notes: order.notes,
  });

  const plainNumber = (opts: {
    label: string;
    value: string;
    step?: string;
    onChange: (value: string) => void;
    onBlur: (value: string) => void;
  }) => (
    <input
      type="number"
      min={0}
      step={opts.step || '1'}
      aria-label={opts.label}
      value={opts.value}
      placeholder="—"
      onChange={(e) => opts.onChange(nonNeg(e.target.value))}
      onBlur={(e) => opts.onBlur(nonNeg(e.target.value))}
      className={CLICKUP_PLAIN_INPUT}
    />
  );

  const saveField = (key: string, value: string) => {
    setFieldLocal(key, value);
    patch({ fields: { [key]: value } });
  };

  const tagBinding = (tag: 'round' | 'foil', flavor: string) => {
    const keyFor = tag === 'round' ? weddingGiftRoundTagKey : weddingGiftFoilStickerKey;
    const packId = mapWeddingCapacityToPackId(fVal('bottle_capacity'));
    if (packId) {
      const key = keyFor(packId, flavor);
      return { key, value: fVal(key) };
    }
    for (const cap of ['25', '45', '75']) {
      const key = keyFor(cap, flavor);
      const value = fVal(key);
      if (value) return { key, value };
    }
    return { key: '', value: '' };
  };

  const renderField = (field: WeddingClickUpField) => {
    switch (field.kind) {
      case 'po':
        return (
          <input
            aria-label={field.label}
            value={order.po_number}
            placeholder="—"
            onChange={(e) => setCoreLocal('po_number', e.target.value)}
            onBlur={(e) => patch({ core: { po_number: e.target.value } })}
            className={CLICKUP_PLAIN_INPUT}
          />
        );
      case 'image': {
        const thumb = orderThumbnailFile(order.files, order.fields);
        const url = thumb ? orderFileUrl(thumb) : '';
        if (!url) {
          return (
            <button
              type="button"
              className="text-[#87909e] hover:text-[#292d34]"
              onClick={() => document.getElementById('order-attachments')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
            >
              —
            </button>
          );
        }
        return (
          <button type="button" onClick={() => onPreviewImage(url)} className="inline-flex" aria-label={field.label}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt="" className="h-10 w-10 rounded object-cover border border-[#eceef1] bg-white" />
          </button>
        );
      }
      case 'delivery_date':
        return (
          <input
            type="date"
            aria-label={field.label}
            value={parseOrderDueDateField(order.fields)}
            onChange={(e) => setLinkedDeliveryDatesLocal(e.target.value)}
            onBlur={(e) => commitLinkedDeliveryDates(e.target.value)}
            className={CLICKUP_PLAIN_INPUT}
          />
        );
      case 'contact': {
        const shown = fVal('contact_method') || order.phone || '';
        return (
          <input
            aria-label={field.label}
            value={shown}
            placeholder="—"
            onChange={(e) => setFieldLocal('contact_method', e.target.value)}
            onBlur={(e) => {
              const v = e.target.value;
              setFieldLocal('contact_method', v);
              const core: Record<string, string> = {};
              // 聯絡方式 is the phone on ClickUp wedding tasks. Keep the core phone in
              // step when this value is a number, so shipment tools still see it.
              if (/^[\d\s+]{6,}$/.test(v.trim()) && order.phone.trim() !== v.trim()) {
                core.phone = v.trim();
                setCoreLocal('phone', v.trim());
              }
              patch({
                fields: { contact_method: v },
                ...(Object.keys(core).length ? { core } : {}),
              });
            }}
            className={CLICKUP_PLAIN_INPUT}
          />
        );
      }
      case 'address':
        return (
          <textarea
            aria-label={field.label}
            value={order.shipping_address}
            placeholder="—"
            rows={Math.min(4, Math.max(1, order.shipping_address.split('\n').length))}
            onChange={(e) => setCoreLocal('shipping_address', e.target.value)}
            onBlur={(e) => patch({ core: { shipping_address: e.target.value } })}
            className={`${CLICKUP_PLAIN_INPUT} resize-y`}
          />
        );
      case 'date':
        return (
          <input
            type="date"
            aria-label={field.label}
            value={fVal(field.key)}
            onChange={(e) => setFieldLocal(field.key, e.target.value)}
            onBlur={(e) => saveField(field.key, e.target.value)}
            className={CLICKUP_PLAIN_INPUT}
          />
        );
      case 'text':
        return (
          <input
            aria-label={field.label}
            value={fVal(field.key)}
            placeholder="—"
            onChange={(e) => setFieldLocal(field.key, e.target.value)}
            onBlur={(e) => saveField(field.key, e.target.value)}
            className={CLICKUP_PLAIN_INPUT}
          />
        );
      case 'capacity': {
        const current = fVal('bottle_capacity');
        const options = weddingGiftBottleCapacityOptions(current);
        for (const extra of EXTRA_CAPACITIES) {
          if (!options.includes(extra)) options.push(extra);
        }
        return (
          <select
            aria-label={field.label}
            value={current}
            onChange={(e) => {
              setFieldLocal('bottle_capacity', e.target.value);
              syncWeddingGiftDerived({ bottle_capacity: e.target.value });
            }}
            className={current ? PILL_PINK : PLAIN_SELECT}
          >
            <option value="">—</option>
            {options.map((c) => (
              <option key={c} value={c}>{capacityPillLabel(c)}</option>
            ))}
          </select>
        );
      }
      case 'client_qty':
        return plainNumber({
          label: field.label,
          value: fVal(field.key),
          onChange: (v) => setFieldLocal(field.key, v),
          onBlur: (v) => {
            setFieldLocal(field.key, v);
            syncWeddingGiftDerived({ [field.key]: v });
          },
        });
      case 'ordered_total':
        return <ClickUpReadValue value={bn.totalOrdered} />;
      case 'gift':
        return (
          <select
            aria-label={field.label}
            value={giftLabel}
            onChange={(e) => saveField('gift_label', e.target.value)}
            className={giftLabel ? PLAIN_SELECT : `${PLAIN_SELECT} text-[#87909e]`}
          >
            <option value="">—</option>
            {WEDDING_GIFT_LABEL_OPTIONS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      case 'packaging':
        return (
          <select
            aria-label={field.label}
            value={packagingLabel}
            onChange={(e) => saveField('packaging_label', e.target.value)}
            className={packagingLabel ? PILL_GOLD : PLAIN_SELECT}
          >
            <option value="">—</option>
            {WEDDING_PACKAGING_LABELS.map((opt) => (
              <option key={opt} value={opt}>{opt}</option>
            ))}
          </select>
        );
      case 'actual_qty': {
        const raw = fVal(field.key);
        const display = raw !== '' ? raw : fVal(field.clientKey);
        return plainNumber({
          label: field.label,
          value: display,
          onChange: (v) => setFieldLocal(field.key, v),
          onBlur: (v) => {
            setFieldLocal(field.key, v);
            syncWeddingGiftDerived({ [field.key]: v });
          },
        });
      }
      case 'material':
        return plainNumber({
          label: field.label,
          value: fVal(field.key),
          step: field.step,
          onChange: (v) => setFieldLocal(field.key, v),
          onBlur: (v) => saveField(field.key, v),
        });
      case 'tag': {
        const binding = tagBinding(field.tag, field.flavor);
        return plainNumber({
          label: field.label,
          value: binding.value,
          onChange: (v) => {
            if (binding.key) setFieldLocal(binding.key, v);
          },
          onBlur: (v) => {
            if (binding.key) saveField(binding.key, v);
          },
        });
      }
      case 'pack': {
        const primary = fVal(field.key);
        const value = primary !== '' ? primary : (field.fallbackKey ? fVal(field.fallbackKey) : '');
        return plainNumber({
          label: field.label,
          value,
          step: field.step,
          onChange: (v) => setFieldLocal(field.key, v),
          onBlur: (v) => saveField(field.key, v),
        });
      }
      case 'big_day':
        return (
          <input
            type="date"
            aria-label={field.label}
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
            className={CLICKUP_PLAIN_INPUT}
          />
        );
      case 'production_total':
        return <ClickUpReadValue value={computeBirdNestActualTotal(order.fields)} />;
      case 'creator':
        return (
          <select
            aria-label={field.label}
            value={fVal('order_creator')}
            onChange={(e) => saveField('order_creator', e.target.value)}
            className={fVal('order_creator') ? PLAIN_SELECT : `${PLAIN_SELECT} text-[#87909e]`}
          >
            <option value="">—</option>
            {WEDDING_ORDER_CREATORS.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        );
      case 'stew':
        return (
          <select
            aria-label={field.label}
            value={fVal('stew_progress')}
            onChange={(e) => saveField('stew_progress', e.target.value)}
            className={fVal('stew_progress') ? PLAIN_SELECT : `${PLAIN_SELECT} text-[#87909e]`}
          >
            <option value="">—</option>
            {WEDDING_STEW_PROGRESS.map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>
        );
      case 'source': {
        const shown = fVal('order_from') || (order.source_platform && order.source_platform !== 'manual' ? order.source_platform : '');
        return (
          <input
            aria-label={field.label}
            value={shown}
            placeholder="—"
            onChange={(e) => setFieldLocal('order_from', e.target.value)}
            onBlur={(e) => saveField('order_from', e.target.value)}
            className={CLICKUP_PLAIN_INPUT}
          />
        );
      }
      default:
        return <ClickUpDash />;
    }
  };

  return (
    <div>
      <div className="mb-4 max-w-[640px]">
        <div className="mb-2 flex items-center justify-between gap-3">
          <p className="text-[13px] text-[#7c828d]">
            {confirmation
              ? bi('Confirmation', '確認訊息')
              : bi('Paste a confirmation message to autofill fields', '貼上確認訊息以自動填入欄位')}
          </p>
          <button
            type="button"
            onClick={onOpenConfirmPaste}
            className="shrink-0 text-[13px] font-semibold text-brand-700 hover:underline"
          >
            {bi('Paste confirmation', '貼上確認訊息')}
          </button>
        </div>
        {confirmation ? (
          <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#292d34]">{confirmation}</div>
        ) : null}
      </div>

      <div className="mb-1 mt-2 flex items-center gap-1.5 text-[13px] font-semibold text-[#292d34]">
        <span className="text-[10px] text-[#7c828d]" aria-hidden>▾</span>
        Fields
      </div>
      <div className="max-w-[720px]">
        {WEDDING_CLICKUP_FIELDS.map((field) => (
          <ClickUpFieldRow key={field.label} icon={field.icon} label={field.label}>
            {renderField(field)}
          </ClickUpFieldRow>
        ))}
      </div>
    </div>
  );
}
