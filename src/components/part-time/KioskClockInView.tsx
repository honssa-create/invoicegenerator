'use client';

import { useEffect, useState } from 'react';
import { tapProps } from '@/lib/tap-action';
import { formatElapsed, formatMoney, hkStamp, type PartTimeStaff } from '@/lib/part-time';
import SignatureModal from './SignatureModal';

type Props = {
  staff: PartTimeStaff[];
  loading: boolean;
  readOnly: boolean;
  busyId: string | null;
  error: string;
  onClockIn: (staffId: string) => void;
  onClockOut: (staffId: string, signatureBase64: string) => Promise<boolean>;
};

function useNow() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

export default function KioskClockInView({ staff, loading, readOnly, busyId, error, onClockIn, onClockOut }: Props) {
  const now = useNow();
  const [signing, setSigning] = useState<PartTimeStaff | null>(null);
  const stamp = hkStamp(now);
  const locked = busyId !== null;

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <p className="text-sm text-gray-500">選擇姓名，然後打卡。Choose a name, then clock in or out.</p>
        <p className="shrink-0 text-right text-sm font-medium tabular-nums text-gray-700">
          {stamp.date}
          <span className="ml-2 text-base">{stamp.time}</span>
        </p>
      </div>

      {readOnly && (
        <p className="mb-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-800">唯讀，未能打卡。This account can view records only.</p>
      )}
      {error && !signing && <p className="mb-4 text-sm text-red-600" role="alert">{error}</p>}

      {loading ? (
        <p className="text-sm text-gray-500">Loading…</p>
      ) : staff.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-gray-300 bg-white px-4 py-10 text-center text-gray-500">尚未有兼職員工。Add a part-time name to start.</p>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {staff.map((person) => {
            const working = person.isClockedIn && Boolean(person.currentClockInTime);
            return (
              <article
                key={person.id}
                className={`rounded-2xl border bg-white p-4 shadow-sm ${working ? 'border-brand-400 ring-2 ring-brand-100' : 'border-gray-200'}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-2xl font-semibold text-gray-900">{person.name}</h2>
                  <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-semibold ${working ? 'bg-brand-100 text-brand-800' : 'bg-gray-100 text-gray-600'}`}>
                    {working ? '返緊工 / Working' : '未開工 / Offline'}
                  </span>
                </div>
                <p className="mt-2 text-sm text-gray-500">{formatMoney(person.hourlyRate)} / hr</p>
                <p className="mt-1 min-h-6 text-sm tabular-nums text-gray-700">
                  {working && person.currentClockInTime ? `已工作 ${formatElapsed(person.currentClockInTime, now)}` : ''}
                </p>
                {working ? (
                  <button
                    type="button"
                    disabled={readOnly || locked}
                    className="mt-4 min-h-16 w-full rounded-xl bg-red-600 text-lg font-semibold text-white disabled:opacity-40"
                    {...tapProps(() => setSigning(person), readOnly || locked)}
                  >
                    收工 / Clock Out
                  </button>
                ) : (
                  <button
                    type="button"
                    disabled={readOnly || locked}
                    className="mt-4 min-h-16 w-full rounded-xl bg-brand-600 text-lg font-semibold text-white disabled:opacity-40"
                    {...tapProps(() => onClockIn(person.id), readOnly || locked)}
                  >
                    {busyId === person.id ? '打卡中…' : '返工 / Clock In'}
                  </button>
                )}
              </article>
            );
          })}
        </div>
      )}

      {signing && (
        <SignatureModal
          key={signing.id}
          staff={signing}
          now={now}
          saving={busyId === signing.id}
          error={error}
          onCancel={() => {
            if (busyId === signing.id) return;
            setSigning(null);
          }}
          onConfirm={(signatureBase64) => {
            onClockOut(signing.id, signatureBase64).then((ok) => {
              if (ok) setSigning(null);
            });
          }}
        />
      )}
    </div>
  );
}
