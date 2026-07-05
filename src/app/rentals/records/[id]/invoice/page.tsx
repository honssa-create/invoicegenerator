'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { dueDateForPeriod, formatMoney, type RentRecord, type RentalUnit } from '@/lib/rentals';

interface DocumentPayload {
  unit: RentalUnit;
  record: RentRecord;
}

export default function RentInvoicePage() {
  const { id } = useParams();
  const [data, setData] = useState<DocumentPayload | null>(null);

  useEffect(() => {
    fetch(`/api/rentals/records/${id}/document`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d));
  }, [id]);

  if (!data) return <div className="min-h-screen flex items-center justify-center">Loading…</div>;
  const { unit, record } = data;

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex justify-between">
        <Link href="/rentals" className="text-sm text-brand-600 font-medium">← Back to Rentals</Link>
        <button onClick={() => window.print()} className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg">Print / Save PDF</button>
      </div>
      <main className="max-w-3xl mx-auto my-8 bg-white p-10 shadow print:shadow-none print:my-0">
        <div className="border-b-4 border-brand-600 pb-6 mb-8 flex justify-between">
          <div>
            <h1 className="text-3xl font-bold">RENT INVOICE</h1>
            <p className="text-gray-500 mt-1">租金單 · {record.billingPeriod}</p>
          </div>
          <p className="text-xl font-mono text-brand-700">#{record.id}</p>
        </div>
        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <p className="text-gray-500">Tenant 租客</p>
            <p className="font-semibold text-lg">{unit.tenantName}</p>
            <p>{unit.tenantEmail || '—'}</p>
          </div>
          <div>
            <p className="text-gray-500">Unit 單位</p>
            <p className="font-semibold text-lg">{unit.unitName}</p>
            <p>Due: {dueDateForPeriod(record.billingPeriod, unit.dueDateDay)}</p>
          </div>
        </div>
        <table className="w-full border-collapse text-sm">
          <thead className="bg-gray-900 text-white">
            <tr><th className="text-left px-4 py-3">Description</th><th className="text-right px-4 py-3">Amount</th></tr>
          </thead>
          <tbody>
            <tr className="border-b"><td className="px-4 py-5">Monthly rent {record.billingPeriod}</td><td className="px-4 py-5 text-right font-bold">{formatMoney(record.actualAmount)}</td></tr>
          </tbody>
          <tfoot>
            <tr><td className="px-4 py-5 text-right font-bold">Total Due</td><td className="px-4 py-5 text-right text-2xl font-bold">{formatMoney(record.actualAmount)}</td></tr>
          </tfoot>
        </table>
        {record.customInvoiceNote && <p className="mt-8 text-sm text-gray-600 whitespace-pre-wrap">{record.customInvoiceNote}</p>}
      </main>
    </div>
  );
}
