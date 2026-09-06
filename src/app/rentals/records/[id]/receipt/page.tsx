'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { formatDisplayDate, formatMoney, formatUtilityAmount, outstandingBalance, type RentRecord, type RentalUnit } from '@/lib/rentals';
import { BTN, bi } from '@/lib/ui-labels';

interface DocumentPayload { unit: RentalUnit; record: RentRecord; dueDate: string; }

export default function RentReceiptPage() {
  const { id } = useParams();
  const [data, setData] = useState<DocumentPayload | null>(null);

  useEffect(() => {
    fetch(`/api/rentals/records/${id}/document`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => d && setData(d));
  }, [id]);

  if (!data) return <div className="min-h-screen flex items-center justify-center">{BTN.loading}</div>;
  const { unit, record } = data;

  return (
    <div className="min-h-screen bg-gray-100 print:bg-white">
      <div className="no-print bg-white border-b border-gray-200 px-6 py-3 flex justify-between">
        <Link href={`/rentals/${record.unitId}`} className="text-sm text-brand-600 font-medium">← {bi('Back to Unit', '返回單位')}</Link>
        <button onClick={() => window.print()} className="px-4 py-2 bg-brand-600 text-white text-sm rounded-lg">{BTN.printSavePdf}</button>
      </div>
      <main className="max-w-3xl mx-auto my-8 bg-white p-10 shadow print:shadow-none print:my-0">
        <div className="border-b-4 border-green-600 pb-6 mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-bold">RENT RECEIPT 租金收據</h1>
            <p className="text-gray-500 mt-1">{record.billingPeriod}</p>
          </div>
          <p className="text-xl font-mono text-green-700">#{record.id}</p>
        </div>
        <div className="grid grid-cols-2 gap-6 mb-8 text-sm">
          <div>
            <p className="text-gray-400 uppercase text-xs">Tenant 租客</p>
            <p className="font-semibold text-lg mt-1">{unit.tenantName}</p>
            {unit.tenantPhone && <p className="text-gray-600">{unit.tenantPhone}</p>}
            <p className="text-gray-600">{unit.tenantEmail || '—'}</p>
          </div>
          <div>
            <p className="text-gray-400 uppercase text-xs">Unit 單位</p>
            <p className="font-semibold text-lg mt-1">{unit.unitName}</p>
            <p className="text-gray-600">Paid: {formatDisplayDate(record.paidDate || record.paidAt?.slice(0, 10))}</p>
          </div>
        </div>

        <div className="rounded-xl border border-green-200 bg-green-50 p-6 mb-6">
          <p className="text-sm text-green-700">Payment Received 已收款</p>
          <p className="text-4xl font-bold text-green-800 mt-1">{formatMoney(record.amountPaid || record.actualAmount)}</p>
          <p className="text-sm text-green-600 mt-2">
            Rent {formatMoney(record.baseRent)} + Water {formatUtilityAmount(record.waterFee)} + Elec {formatUtilityAmount(record.electricityFee)}
          </p>
          {outstandingBalance(record) > 0 && (
            <p className="text-sm text-orange-700 mt-2 font-semibold">
              Outstanding 尚欠: {formatMoney(outstandingBalance(record))}
            </p>
          )}
        </div>

        {record.customReceiptNote && (
          <p className="text-sm text-gray-600 whitespace-pre-wrap border-t border-gray-100 pt-4">{record.customReceiptNote}</p>
        )}
      </main>
    </div>
  );
}
