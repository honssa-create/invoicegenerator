'use client';

import { useEffect, useState } from 'react';
import { tapProps } from '@/lib/tap-action';
import { hkStamp, type PartTimeStaff } from '@/lib/part-time';
import SignatureModal from './SignatureModal';
import WorkingDetailModal from './WorkingDetailModal';

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
  const [detail, setDetail] = useState<PartTimeStaff | null>(null);
  const [signing, setSigning] = useState<PartTimeStaff | null>(null);
  const stamp = hkStamp(now);
  const locked = busyId !== null;

  const live = (person: PartTimeStaff | null) =>
    (person && staff.find((row) => row.id === person.id)) || person;

  const detailStaff = live(detail);
  const signingStaff = live(signing);
  const detailWorking = Boolean(detailStaff?.isClockedIn && detailStaff.currentClockInTime);

  useEffect(() => {
    if (detail && !detailWorking && !signing) setDetail(null);
  }, [detail, detailWorking, signing]);

  return (
    <div>
      <div className="mb-4 flex items-end justify-between gap-3">
        <p className="text-sm text-gray-500">撳自己個名返工；上班中可睇詳情或放工。Tap your name to clock in.</p>
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
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {staff.map((person) => {
            const working = person.isClockedIn && Boolean(person.currentClockInTime);
            const pending = busyId === person.id;
            return (
              <li key={person.id} className="min-w-0">
                <div
                  className={`flex aspect-square flex-col overflow-hidden rounded-3xl border shadow-sm ${working ? 'border-brand-400 bg-brand-50' : 'border-gray-200 bg-white'}`}
                >
                  <button
                    type="button"
                    disabled={readOnly || locked}
                    className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 px-3 text-center disabled:opacity-50"
                    {...tapProps(() => {
                      if (working) setDetail(person);
                      else onClockIn(person.id);
                    }, readOnly || locked)}
                  >
                    <span className="line-clamp-2 text-2xl font-semibold leading-tight text-gray-900 sm:text-3xl">
                      {person.name}
                    </span>
                    <span className={`text-base font-semibold ${working ? 'text-brand-800' : 'text-gray-500'}`}>
                      {pending ? '打卡中…' : working ? '上班中' : '未開工'}
                    </span>
                  </button>
                  {working && (
                    <button
                      type="button"
                      disabled={readOnly || locked}
                      className="min-h-14 shrink-0 border-t border-brand-200 bg-red-600 text-lg font-semibold text-white disabled:opacity-50"
                      {...tapProps(() => setSigning(person), readOnly || locked)}
                    >
                      放工
                    </button>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {detailStaff && detailWorking && !signingStaff && (
        <WorkingDetailModal
          key={detailStaff.id}
          staff={detailStaff}
          now={now}
          onClose={() => setDetail(null)}
          onClockOut={() => {
            setSigning(detailStaff);
            setDetail(null);
          }}
        />
      )}

      {signingStaff && (
        <SignatureModal
          key={signingStaff.id}
          staff={signingStaff}
          now={now}
          saving={busyId === signingStaff.id}
          error={error}
          onCancel={() => {
            if (busyId === signingStaff.id) return;
            setSigning(null);
          }}
          onConfirm={(signatureBase64) => {
            onClockOut(signingStaff.id, signatureBase64).then((ok) => {
              if (ok) {
                setSigning(null);
                setDetail(null);
              }
            });
          }}
        />
      )}
    </div>
  );
}
