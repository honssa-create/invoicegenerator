'use client';

import AppLayout from '@/components/AppLayout';
import AccountingTable from '@/components/AccountingTable';
import { TITLE, bi } from '@/lib/ui-labels';

export default function AccountingPage() {
  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{TITLE.accounting}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">{bi('One unified view of every order payment — tick each against your bank statement', '統一檢視所有訂單付款 — 與銀行對帳單逐筆核對')}</p>
        </div>
      </div>
      <AccountingTable />
    </AppLayout>
  );
}
