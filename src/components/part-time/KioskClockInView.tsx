'use client';

import { useEffect, useState } from 'react';
import { tapProps } from '@/lib/tap-action';
import { formatElapsed, hkStamp, type PartTimeStaff } from '@/lib/part-time';
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
        <p className="text-sm text-gray-500">撳自己個名打卡。Tap your name to clock in or out.</p>
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
        <ul className="mx-auto flex w-full max-w-xl flex-col gap-3">
          {staff.map((person) => {
            const working = person.isClockedIn && Boolean(person.currentClockInTime);
            const pending = busyId === person.id;
            return (
              <li key={person.id}>
                <button
                  type="button"
                  disabled={readOnly || locked}
                  className={`flex min-h-20 w-full items-center justify-between gap-4 rounded-2xl border px-5 text-left shadow-sm disabled:opacity-50 ${working ? 'border-brand-400 bg-brand-50' : 'border-gray-200 bg-white'}`}
                  {...tapProps(() => {
                    if (working) setSigning(person);
                    else onClockIn(person.id);
                  }, readOnly || locked)}
                >
                  <span className="text-2xl font-semibold text-gray-900">{person.name}</span>
                  <span className={`shrink-0 text-right text-sm font-semibold ${working ? 'text-brand-800' : 'text-gray-500'}`}>
                    {pending
                      ? '打卡中…'
                      : working && person.currentClockInTime
                        ? `返緊工 ${formatElapsed(person.currentClockInTime, now)}`
                        : '未開工'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
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
