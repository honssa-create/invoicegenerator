'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { StatCard, StatusBadge, formatCurrency } from '@/components/ui';
import { formatMoney } from '@/lib/expenses';
import { formatDate } from '@/lib/utils';
import type { InvoiceWithDetails } from '@/lib/types';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

interface DashboardData {
  totalInvoices: number;
  totalRevenue: number;
  pendingAmount: number;
  overdueCount: number;
  customerCount: number;
  recentInvoices: InvoiceWithDetails[];
  expenseCount: number;
  totalExpensesHkd: number;
  totalExpensesRmb: number;
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);

  useEffect(() => {
    fetch('/api/dashboard')
      .then((res) => res.json())
      .then(setData);
  }, []);

  if (!data) {
    return (
      <AppLayout>
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout>
      <div className="page-header">
        <div>
          <h1 className="page-title">{TITLE.dashboard}</h1>
          <p className="text-gray-500 mt-1 text-sm sm:text-base">{bi('Overview of your invoicing activity', '發票業務總覽')}</p>
        </div>
        <div className="page-actions">
          <Link href="/invoices/new" className="btn bg-brand-600 text-white hover:bg-brand-700">
            + {TITLE.newInvoice}
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatCard title={bi('Total Revenue', '總收入')} value={formatCurrency(data.totalRevenue)} icon="💵" color="bg-green-50 text-green-600" />
        <StatCard title={bi('Pending', '待收款')} value={formatCurrency(data.pendingAmount)} icon="⏳" color="bg-yellow-50 text-yellow-600" />
        <StatCard title={bi('Invoices', '發票')} value={String(data.totalInvoices)} icon="📄" />
        <StatCard title={bi('Customers', '客戶')} value={String(data.customerCount)} icon="👥" color="bg-blue-50 text-blue-600" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard title={bi('Expenses (HKD)', '支出 (HKD)')} value={formatMoney(data.totalExpensesHkd, 'HKD')} icon="💰" color="bg-red-50 text-red-600" />
        <StatCard title={bi('Expenses (RMB)', '支出 (RMB)')} value={formatMoney(data.totalExpensesRmb, 'CNY')} icon="💴" color="bg-red-50 text-red-600" />
        <StatCard title={bi('Expense Records', '支出紀錄')} value={String(data.expenseCount)} icon="🧾" />
        <StatCard title={bi('Net (HKD)', '淨額 (HKD)')} value={formatCurrency(data.totalRevenue - data.totalExpensesHkd)} icon="📈" color="bg-blue-50 text-blue-600" />
      </div>

      {data.overdueCount > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          {bi('You have', '您有')} <strong>{data.overdueCount}</strong> {bi(`overdue invoice${data.overdueCount > 1 ? 's' : ''}`, `張逾期發票`)}
          <Link href="/invoices?status=overdue" className="ml-2 underline font-medium">{bi('View them', '查看')}</Link>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">{bi('Recent Invoices', '最近發票')}</h2>
          <Link href="/invoices" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            {BTN.viewAll}
          </Link>
        </div>
        {data.recentInvoices.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p>{bi('No invoices yet.', '尚無發票。')}</p>
            <Link href="/invoices/new" className="mt-2 inline-block text-brand-600 hover:text-brand-700 font-medium text-sm">
              {bi('Create your first invoice', '建立第一張發票')}
            </Link>
          </div>
        ) : (
          <div className="table-scroll">
          <table className="w-full min-w-[640px]">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">{bi('Invoice', '發票')}</th>
                <th className="px-6 py-3">{bi('Customer', '客戶')}</th>
                <th className="px-6 py-3">{bi('Date', '日期')}</th>
                <th className="px-6 py-3">{bi('Amount', '金額')}</th>
                <th className="px-6 py-3">{bi('Status', '狀態')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {data.recentInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Link href={`/invoices/${inv.id}`} className="text-brand-600 hover:text-brand-700 font-medium text-sm">
                      {inv.invoice_number}
                    </Link>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-700">{inv.customer_name}</td>
                  <td className="px-6 py-4 text-sm text-gray-500">{formatDate(inv.issue_date)}</td>
                  <td className="px-6 py-4 text-sm font-medium text-gray-900">{formatCurrency(inv.total)}</td>
                  <td className="px-6 py-4"><StatusBadge status={inv.status} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </div>
    </AppLayout>
  );
}
