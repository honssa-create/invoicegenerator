'use client';

import { useEffect, useState } from 'react';
import { tapProps } from '@/lib/tap-action';
import { formatDurationFromMinutes, formatMoney, paidMinutesOf, splitScheduledMinutes, type CreateStaffInput, type PartTimeStaff, type UpdateStaffInput } from '@/lib/part-time';

type Props = {
  staff: PartTimeStaff[];
  loading: boolean;
  readOnly: boolean;
  busy: boolean;
  error: string;
  onClose: () => void;
  onCreate: (input: CreateStaffInput) => Promise<PartTimeStaff | null>;
  onUpdate: (id: string, patch: UpdateStaffInput) => Promise<PartTimeStaff | null>;
};

const inputCls = 'w-full rounded-lg border border-gray-300 px-3 py-3 text-base outline-none focus:ring-2 focus:ring-brand-500';

export default function StaffManagerModal({ staff, loading, readOnly, busy, error, onClose, onCreate, onUpdate }: Props) {
  const [name, setName] = useState('');
  const [hours, setHours] = useState('');
  const [minutes, setMinutes] = useState('');
  const [rate, setRate] = useState('70');
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const resetForm = () => {
    setEditingId(null);
    setName('');
    setHours('');
    setMinutes('');
    setRate('70');
  };

  const submit = () => {
    if (readOnly || busy) return;
    const hourlyRate = Number(rate);
    const scheduledHours = hours.trim() === '' ? 0 : Number(hours);
    const scheduledMinutes = minutes.trim() === '' ? 0 : Number(minutes);
    const input = { name, hourlyRate, scheduledHours, scheduledMinutes };
    if (editingId) {
      onUpdate(editingId, input).then((updated) => {
        if (updated) resetForm();
      });
      return;
    }
    onCreate(input).then((created) => {
      if (created) resetForm();
    });
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="staff-manager-title">
      <button type="button" className="absolute inset-0 bg-black/45" aria-label="Close" {...tapProps(onClose, busy)} />
      <div className="relative z-10 flex max-h-[100dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white shadow-xl sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-4">
          <h2 id="staff-manager-title" className="text-lg font-semibold text-gray-900">兼職員工 / Part-time staff</h2>
          <button type="button" className="min-h-10 rounded-lg px-3 text-sm text-gray-600" {...tapProps(onClose, busy)}>關閉 / Close</button>
        </div>

        <div className="overflow-y-auto px-4 py-4">
          <p className="mb-3 text-sm text-gray-500">預定工時同埋時薪要預先設定。打卡時會顯示今日工時，確認返工後先開始計時。薪金 = 今日工時 × 時薪。返工同放工時間只作紀錄，改動唔會改已完成的更次。</p>

          {!readOnly && (
            <form
              className="mb-4 space-y-3"
              onSubmit={(event) => {
                event.preventDefault();
                submit();
              }}
            >
              <input
                className={inputCls}
                value={name}
                placeholder="姓名 / Name"
                maxLength={40}
                autoComplete="off"
                onChange={(event) => setName(event.target.value)}
              />
              <div>
                <span className="mb-1 block text-xs font-medium text-gray-500">預定工時</span>
                <div className="grid grid-cols-2 gap-3">
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-500">小時</span>
                    <input
                      className={inputCls}
                      value={hours}
                      inputMode="numeric"
                      type="number"
                      min="0"
                      max="24"
                      step="1"
                      placeholder="4"
                      aria-label="小時"
                      onChange={(event) => setHours(event.target.value)}
                    />
                  </label>
                  <label className="block">
                    <span className="mb-1 block text-xs font-medium text-gray-500">分鐘</span>
                    <input
                      className={inputCls}
                      value={minutes}
                      inputMode="numeric"
                      type="number"
                      min="0"
                      max="59"
                      step="1"
                      placeholder="0"
                      aria-label="分鐘"
                      onChange={(event) => setMinutes(event.target.value)}
                    />
                  </label>
                </div>
              </div>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-gray-500">時薪 / Rate</span>
                <input
                  className={inputCls}
                  value={rate}
                  inputMode="decimal"
                  type="number"
                  min="0.5"
                  step="0.5"
                  aria-label="Hourly rate"
                  onChange={(event) => setRate(event.target.value)}
                />
              </label>
              <button type="submit" disabled={busy} className="min-h-12 w-full rounded-xl bg-brand-600 px-4 font-semibold text-white disabled:opacity-40">
                {busy ? '儲存中…' : editingId ? '更新 / Update' : '新增 / Add'}
              </button>
              {editingId && (
                <button type="button" className="min-h-12 text-sm text-gray-500" {...tapProps(resetForm, busy)}>
                  取消編輯 / Cancel edit
                </button>
              )}
            </form>
          )}

          {error && <p className="mb-3 text-sm text-red-600" role="alert">{error}</p>}
          {loading && staff.length === 0 ? (
            <p className="text-sm text-gray-500">Loading…</p>
          ) : (
            <ul className="divide-y divide-gray-100 rounded-xl border border-gray-200">
              {staff.map((person) => {
                const scheduled = paidMinutesOf(person, false);
                return (
                  <li key={person.id} className="flex items-center gap-3 px-3 py-3">
                    <div className="min-w-0 flex-1">
                      <p className={`truncate font-medium ${person.active ? 'text-gray-900' : 'text-gray-400'}`}>{person.name}</p>
                      <p className="text-sm text-gray-500">
                        {scheduled > 0 ? formatDurationFromMinutes(scheduled) : '未設定工時'}
                        {' · '}
                        {formatMoney(person.hourlyRate)} / hr
                        {person.isClockedIn ? ' · 返緊工 / Working' : ''}
                        {!person.active ? ' · 已停用' : ''}
                      </p>
                    </div>
                    {!readOnly && (
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          className="min-h-10 rounded-lg px-2 text-sm font-medium text-gray-700"
                          {...tapProps(() => {
                            const parts = splitScheduledMinutes(scheduled);
                            setEditingId(person.id);
                            setName(person.name);
                            setHours(scheduled > 0 ? String(parts.hours) : '');
                            setMinutes(scheduled > 0 ? String(parts.minutes) : '');
                            setRate(String(person.hourlyRate));
                          }, busy)}
                        >
                          編輯
                        </button>
                        <button
                          type="button"
                          disabled={busy || (person.active && person.isClockedIn)}
                          className="min-h-10 rounded-lg px-2 text-sm font-medium text-gray-700 disabled:opacity-40"
                          {...tapProps(() => {
                            onUpdate(person.id, { active: !person.active });
                          }, busy || (person.active && person.isClockedIn))}
                        >
                          {person.active ? '停用' : '啟用'}
                        </button>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
