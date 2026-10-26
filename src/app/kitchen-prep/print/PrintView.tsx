'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import PrepPrintSheet from '@/components/kitchen-prep/PrepPrintSheet';
import {
  prepSessionTitle,
  type PrepBatchView,
  type PrepCalculation,
  type PrepOrder,
  type StewFormulaMapLike,
} from '@/lib/kitchen-prep';
import { BTN, bi } from '@/lib/ui-labels';

const MAX_GROUP_PRINT = 50;

interface PrintSheet {
  order: PrepOrder;
  calc: PrepCalculation;
  batch: PrepBatchView | null;
  stewFormulas?: StewFormulaMapLike;
}

function parseIds(raw: string | null): number[] {
  if (!raw) return [];
  const seen = new Set<number>();
  const ids: number[] = [];
  for (const part of raw.split(',')) {
    const id = Number(part.trim());
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export default function KitchenPrepGroupPrint() {
  const searchParams = useSearchParams();
  const idsParam = searchParams.get('ids') || '';
  const [sheets, setSheets] = useState<PrintSheet[] | null>(null);
  const [missing, setMissing] = useState<number[]>([]);
  const [error, setError] = useState('');
  const [loggingPrint, setLoggingPrint] = useState(false);
  const [printedAt] = useState(() => new Date().toLocaleString('en-HK'));

  useEffect(() => {
    const ids = parseIds(idsParam);
    if (ids.length === 0) {
      setSheets([]);
      setError(bi('No prep orders in this print.', '這次列印沒有備料單。'));
      return;
    }
    if (ids.length > MAX_GROUP_PRINT) {
      setSheets([]);
      setError(bi(`Too many prep sheets in one print (max ${MAX_GROUP_PRINT}).`, `一次最多列印 ${MAX_GROUP_PRINT} 張備料單。`));
      return;
    }
    let cancelled = false;
    setError('');
    Promise.all(
      ids.map(async (id) => {
        const res = await fetch(`/api/kitchen-prep/${id}`);
        if (!res.ok) return { id, detail: null };
        const detail = await res.json();
        return { id, detail };
      }),
    )
      .then((rows) => {
        if (cancelled) return;
        const next: PrintSheet[] = [];
        const missed: number[] = [];
        for (const row of rows) {
          if (!row.detail?.order || !row.detail?.calculation) {
            missed.push(row.id);
            continue;
          }
          next.push({
            order: row.detail.order as PrepOrder,
            calc: row.detail.calculation as PrepCalculation,
            batch: (row.detail.batch as PrepBatchView | null) ?? null,
            stewFormulas: row.detail.stewFormulas as StewFormulaMapLike | undefined,
          });
        }
        setSheets(next);
        setMissing(missed);
      })
      .catch(() => {
        if (!cancelled) setError(bi('Failed to load prep sheets.', '讀取備料單失敗。'));
      });
    return () => {
      cancelled = true;
    };
  }, [idsParam]);

  const handlePrint = async () => {
    if (loggingPrint || !sheets?.length) return;
    setLoggingPrint(true);
    try {
      await Promise.all(
        sheets.map((sheet) =>
          fetch(`/api/kitchen-prep/${sheet.order.id}/print-log`, { method: 'POST' }).catch(() => null),
        ),
      );
    } finally {
      setLoggingPrint(false);
    }
    window.print();
  };

  const sessionLabel = sheets && sheets.length > 0
    ? prepSessionTitle(sheets[0].order.stewing_date, sheets[0].order.schedule_slot)
    : '';
  const sameSession = sheets?.every(
    (sheet) =>
      sheet.order.stewing_date === sheets[0].order.stewing_date &&
      sheet.order.schedule_slot === sheets[0].order.schedule_slot,
  );

  return (
    <div className="prep-print-root min-h-screen bg-gray-100 print:bg-white">
      <style>{`
        @media print {
          @page {
            size: A4 landscape;
            margin: 0;
          }
        }
      `}</style>
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between gap-3">
        <div>
          <Link href="/kitchen-prep" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            ← {bi('Back to schedule', '返回排程')}
          </Link>
          {sheets && sheets.length > 0 && (
            <p className="text-sm text-gray-600 mt-1">
              {sameSession ? `${sessionLabel} · ` : ''}
              {bi(`${sheets.length} prep sheet(s)`, `${sheets.length} 張備料單`)}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => { void handlePrint(); }}
          disabled={loggingPrint || !sheets?.length}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
        >
          {loggingPrint ? bi('Preparing…', '準備中…') : BTN.printPdf}
        </button>
      </div>

      {error && <div className="no-print max-w-3xl mx-auto mt-6 p-3 bg-red-50 text-red-700 text-sm rounded-lg">{error}</div>}
      {missing.length > 0 && (
        <div className="no-print max-w-3xl mx-auto mt-4 p-3 bg-amber-50 text-amber-800 text-sm rounded-lg">
          {bi(
            `Skipped ${missing.length} order(s) that could not be loaded.`,
            `略過 ${missing.length} 張無法讀取的備料單。`,
          )}
        </div>
      )}

      {sheets === null && !error && (
        <div className="min-h-[40vh] flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      )}

      {sheets?.map((sheet) => (
        <PrepPrintSheet
          key={sheet.order.id}
          order={sheet.order}
          calc={sheet.calc}
          batch={sheet.batch}
          stewFormulas={sheet.stewFormulas}
          printedAt={printedAt}
        />
      ))}
    </div>
  );
}
