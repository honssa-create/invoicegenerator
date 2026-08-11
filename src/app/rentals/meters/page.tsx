'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/components/AuthProvider';
import { compressImage } from '@/lib/imageCompression';
import { isSectionReadOnly } from '@/lib/permissions';
import {
  UTILITY_METER_DEFINITIONS,
  periodFromReadingDate,
  type UtilityMeterKey,
  type UtilityMeterRound,
  type UtilityMeterRoundItem,
} from '@/lib/rentals';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

type DraftItem = {
  meter_key: UtilityMeterKey;
  reading_value: string;
  photo_path: string | null;
  ocr_text: string | null;
  previewUrl: string | null;
  itemId: number;
  synced_record_id: number | null;
  scanning: boolean;
};

const METER_LABEL: Record<UtilityMeterKey, string> = Object.fromEntries(
  UTILITY_METER_DEFINITIONS.map((d) => [d.key, d.label]),
) as Record<UtilityMeterKey, string>;

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyDrafts(): DraftItem[] {
  return UTILITY_METER_DEFINITIONS.map((d) => ({
    meter_key: d.key,
    reading_value: '',
    photo_path: null,
    ocr_text: null,
    previewUrl: null,
    itemId: 0,
    synced_record_id: null,
    scanning: false,
  }));
}

function draftsFromRound(round: UtilityMeterRound): DraftItem[] {
  const byKey = new Map(round.items.map((i) => [i.meter_key, i]));
  return UTILITY_METER_DEFINITIONS.map((d) => {
    const item = byKey.get(d.key);
    return {
      meter_key: d.key,
      reading_value: item?.reading_value != null ? String(item.reading_value) : '',
      photo_path: item?.photo_path || null,
      ocr_text: item?.ocr_text || null,
      previewUrl: item?.id ? `/api/rentals/meters/files/${item.id}` : null,
      itemId: item?.id || 0,
      synced_record_id: item?.synced_record_id ?? null,
      scanning: false,
    };
  });
}

function itemForKey(round: UtilityMeterRound, key: UtilityMeterKey): UtilityMeterRoundItem | undefined {
  return round.items.find((i) => i.meter_key === key && i.id > 0);
}

export default function UtilityMeterReadingsPage() {
  const { user } = useAuth();
  const readOnly = user ? isSectionReadOnly(user.role, 'rentals') : false;
  const [rounds, setRounds] = useState<UtilityMeterRound[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [readingDate, setReadingDate] = useState(todayISO());
  const [period, setPeriod] = useState(periodFromReadingDate(todayISO()));
  const [notes, setNotes] = useState('');
  const [drafts, setDrafts] = useState<DraftItem[]>(emptyDrafts);
  const [saving, setSaving] = useState(false);
  const [lightbox, setLightbox] = useState<string | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/rentals/meters')
      .then((r) => r.json())
      .then((d) => setRounds(d.rounds || []))
      .catch(() => setError(bi('Failed to load meter readings', '無法載入水電錶紀錄')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    const d = todayISO();
    setEditingId(null);
    setReadingDate(d);
    setPeriod(periodFromReadingDate(d));
    setNotes('');
    setDrafts(emptyDrafts());
    setError('');
    setEditorOpen(true);
  };

  const openEdit = (round: UtilityMeterRound) => {
    setEditingId(round.id);
    setReadingDate(round.reading_date);
    setPeriod(round.period);
    setNotes(round.notes || '');
    setDrafts(draftsFromRound(round));
    setError('');
    setEditorOpen(true);
  };

  const onDateChange = (v: string) => {
    setReadingDate(v);
    setPeriod(periodFromReadingDate(v));
  };

  const updateDraft = (key: UtilityMeterKey, patch: Partial<DraftItem>) => {
    setDrafts((list) => list.map((d) => (d.meter_key === key ? { ...d, ...patch } : d)));
  };

  const onPhoto = async (key: UtilityMeterKey, file: File | null) => {
    if (!file || readOnly) return;
    updateDraft(key, { scanning: true });
    try {
      const compressed = await compressImage(file, { maxDim: 1600, quality: 0.65, targetBytes: 300 * 1024 });
      const previewUrl = URL.createObjectURL(compressed.file);
      const kind = UTILITY_METER_DEFINITIONS.find((d) => d.key === key)?.kind || 'electricity';
      const fd = new FormData();
      fd.append('photo', compressed.file);
      fd.append('kind', kind);
      const res = await fetch('/api/rentals/meters/ocr', { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || bi('OCR failed', '辨識失敗'));
        updateDraft(key, { scanning: false, previewUrl });
        return;
      }
      updateDraft(key, {
        scanning: false,
        previewUrl,
        photo_path: data.photo_path || null,
        ocr_text: data.ocr_text || null,
        reading_value:
          data.reading != null && Number.isFinite(Number(data.reading))
            ? String(data.reading)
            : '',
      });
    } catch {
      setError(bi('OCR failed', '辨識失敗'));
      updateDraft(key, { scanning: false });
    }
  };

  const save = async () => {
    if (saving || readOnly) return;
    setSaving(true);
    setError('');
    const items = drafts
      .map((d) => ({
        meter_key: d.meter_key,
        reading_value: d.reading_value.trim() === '' ? null : Number(d.reading_value),
        photo_path: d.photo_path,
        ocr_text: d.ocr_text,
      }))
      .filter(
        (i) =>
          i.photo_path ||
          i.ocr_text ||
          (i.reading_value != null && Number.isFinite(i.reading_value)),
      );

    try {
      const body = { reading_date: readingDate, period, notes, items };
      const res = await fetch(
        editingId ? `/api/rentals/meters/${editingId}` : '/api/rentals/meters',
        {
          method: editingId ? 'PATCH' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        },
      );
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || bi('Failed to save', '儲存失敗'));
        return;
      }
      setEditorOpen(false);
      load();
    } catch {
      setError(bi('Failed to save', '儲存失敗'));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (id: number) => {
    if (readOnly) return;
    if (!confirm(bi('Delete this meter reading round?', '刪除此水電錶抄錶紀錄？'))) return;
    const res = await fetch(`/api/rentals/meters/${id}`, { method: 'DELETE' });
    if (res.ok) load();
    else setError(bi('Failed to delete', '刪除失敗'));
  };

  const inp = 'w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <Link href="/rentals" className="text-sm text-brand-600 font-medium">
            ← {bi('Back to Rentals', '返回租金管理')}
          </Link>
          <h1 className="page-title mt-1">{TITLE.meterReadings}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">
            {bi(
              'Record water & electricity meter photos and readings; sync into rental billing when possible.',
              '記錄水電錶照片與讀數；可行時同步至租金帳單。',
            )}
          </p>
        </div>
        <div className="page-actions">
          {!readOnly && (
            <button type="button" onClick={openCreate} className="btn bg-brand-600 text-white hover:bg-brand-700">
              + {bi('New reading', '新增抄錶')}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
          </div>
        ) : rounds.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            {bi('No meter readings yet.', '尚無水電錶紀錄。')}
          </div>
        ) : (
          <div className="table-scroll">
            <table className="w-full min-w-[1100px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200 bg-gray-50">
                  <th className="px-4 py-3 whitespace-nowrap">{bi('Date', '日期')}</th>
                  <th className="px-4 py-3 whitespace-nowrap">{bi('Period', '帳期')}</th>
                  {UTILITY_METER_DEFINITIONS.map((d) => (
                    <th key={d.key} className="px-3 py-3 min-w-[140px] font-medium normal-case text-[11px] leading-snug">
                      {d.label}
                    </th>
                  ))}
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {rounds.map((round) => (
                  <tr key={round.id} className="hover:bg-gray-50 align-top">
                    <td className="px-4 py-3 text-sm font-medium text-gray-900 whitespace-nowrap">
                      {round.reading_date}
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-600 whitespace-nowrap">{round.period}</td>
                    {UTILITY_METER_DEFINITIONS.map((d) => {
                      const item = itemForKey(round, d.key);
                      return (
                        <td key={d.key} className="px-3 py-3">
                          {item?.photo_path && item.id > 0 ? (
                            <button
                              type="button"
                              onClick={() => setLightbox(`/api/rentals/meters/files/${item.id}`)}
                              className="block mb-1 rounded border border-gray-200 overflow-hidden cursor-zoom-in hover:ring-2 hover:ring-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                              title={bi('Click to enlarge', '點擊放大')}
                            >
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={`/api/rentals/meters/files/${item.id}`}
                                alt=""
                                className="w-20 h-14 object-cover"
                              />
                            </button>
                          ) : (
                            <div className="w-20 h-14 rounded border border-dashed border-gray-200 bg-gray-50 mb-1" />
                          )}
                          <div className="text-sm font-medium text-gray-800">
                            {item?.reading_value != null ? item.reading_value : '—'}
                          </div>
                          {item?.synced_record_id ? (
                            <div className="text-[10px] text-emerald-600 mt-0.5">
                              {bi('Synced', '已同步')}
                            </div>
                          ) : null}
                        </td>
                      );
                    })}
                    <td className="px-4 py-3 whitespace-nowrap text-right">
                      <button
                        type="button"
                        onClick={() => openEdit(round)}
                        className="text-sm text-brand-600 hover:text-brand-700 font-medium mr-3"
                      >
                        {BTN.edit}
                      </button>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => void remove(round.id)}
                          className="text-sm text-red-600 hover:text-red-700"
                        >
                          {BTN.delete}
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editorOpen && (
        <div className="fixed inset-0 z-40 flex items-start justify-center bg-black/40 p-4 overflow-y-auto">
          <div className="w-full max-w-3xl bg-white rounded-xl shadow-xl border border-gray-200 my-8">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <h2 className="text-lg font-semibold text-gray-900">
                {editingId
                  ? bi('Edit meter reading', '編輯抄錶')
                  : bi('New meter reading', '新增抄錶')}
              </h2>
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none px-2"
              >
                ×
              </button>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="text-[11px] font-medium text-gray-500 mb-1 block">
                    {bi('Reading date', '抄錶日期')}
                  </label>
                  <input
                    type="date"
                    value={readingDate}
                    onChange={(e) => onDateChange(e.target.value)}
                    className={inp}
                    disabled={readOnly}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-500 mb-1 block">
                    {bi('Billing period', '帳期')}
                  </label>
                  <input
                    type="month"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                    className={inp}
                    disabled={readOnly}
                  />
                </div>
                <div>
                  <label className="text-[11px] font-medium text-gray-500 mb-1 block">
                    {bi('Notes', '備註')}
                  </label>
                  <input
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    className={inp}
                    disabled={readOnly}
                  />
                </div>
              </div>

              <div className="space-y-3">
                {drafts.map((d) => (
                  <div
                    key={d.meter_key}
                    className="rounded-xl border border-gray-200 p-3 sm:p-4 bg-gray-50/60"
                  >
                    <div className="flex flex-col sm:flex-row gap-3">
                      <div className="shrink-0">
                        {d.previewUrl ? (
                          <button
                            type="button"
                            onClick={() => setLightbox(d.previewUrl)}
                            className="block rounded-lg border border-gray-200 overflow-hidden cursor-zoom-in hover:ring-2 hover:ring-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-500"
                            title={bi('Click to enlarge', '點擊放大')}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={d.previewUrl}
                              alt=""
                              className="w-28 h-20 object-cover"
                            />
                          </button>
                        ) : (
                          <div className="w-28 h-20 rounded-lg border border-dashed border-gray-300 bg-white flex items-center justify-center text-xs text-gray-400">
                            {bi('No photo', '無照片')}
                          </div>
                        )}
                        {!readOnly && (
                          <label className="mt-2 block">
                            <span className="sr-only">{bi('Upload photo', '上傳照片')}</span>
                            <input
                              type="file"
                              accept="image/png,image/jpeg,image/webp"
                              className="block w-full text-xs text-gray-500"
                              disabled={d.scanning}
                              onChange={(e) => {
                                const f = e.target.files?.[0] || null;
                                void onPhoto(d.meter_key, f);
                                e.target.value = '';
                              }}
                            />
                          </label>
                        )}
                        {d.scanning && (
                          <p className="text-[11px] text-brand-600 mt-1">{bi('Scanning…', '辨識中…')}</p>
                        )}
                      </div>
                      <div className="flex-1 min-w-0 space-y-2">
                        <div className="text-sm font-medium text-gray-900">{METER_LABEL[d.meter_key]}</div>
                        <div>
                          <label className="text-[11px] font-medium text-gray-500 mb-1 block">
                            {bi('Reading', '讀數')}
                          </label>
                          <input
                            type="number"
                            step="any"
                            value={d.reading_value}
                            onChange={(e) => updateDraft(d.meter_key, { reading_value: e.target.value })}
                            className={inp}
                            disabled={readOnly}
                            placeholder="0"
                          />
                        </div>
                        {d.ocr_text && (
                          <p className="text-[11px] text-gray-400 line-clamp-2">OCR: {d.ocr_text}</p>
                        )}
                        {d.synced_record_id ? (
                          <p className="text-[11px] text-emerald-600">{bi('Synced to billing', '已同步帳單')}</p>
                        ) : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2 px-5 py-4 border-t border-gray-100">
              <button
                type="button"
                onClick={() => setEditorOpen(false)}
                className="btn border border-gray-300 text-gray-700 hover:bg-gray-50"
              >
                {BTN.cancel}
              </button>
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={saving}
                  className="btn bg-brand-600 text-white hover:bg-brand-700 disabled:opacity-50"
                >
                  {saving ? BTN.saving : BTN.save}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {lightbox && (
        <div
          onClick={() => setLightbox(null)}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-[70] p-4 cursor-zoom-out"
          role="dialog"
          aria-modal="true"
          aria-label={bi('Photo preview', '照片預覽')}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt={bi('Meter dial photo', '水電錶照片')}
            className="max-h-[92vh] max-w-[92vw] object-contain rounded-lg shadow-2xl bg-white"
          />
        </div>
      )}
    </AppLayout>
  );
}
