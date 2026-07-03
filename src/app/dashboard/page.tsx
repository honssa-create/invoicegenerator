'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AppLayout from '@/components/AppLayout';
import { StatCard, StatusBadge, formatCurrency } from '@/components/ui';
import { formatMoney } from '@/lib/expenses';
import { formatDate } from '@/lib/utils';
import type { InvoiceWithDetails } from '@/lib/types';

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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
          <p className="text-gray-500 mt-1">Overview of your invoicing activity</p>
        </div>
        <Link
          href="/invoices/new"
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 transition-colors"
        >
          + New Invoice
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-6">
        <StatCard title="Total Revenue" value={formatCurrency(data.totalRevenue)} icon="💵" color="bg-green-50 text-green-600" />
        <StatCard title="Pending" value={formatCurrency(data.pendingAmount)} icon="⏳" color="bg-yellow-50 text-yellow-600" />
        <StatCard title="Invoices" value={String(data.totalInvoices)} icon="📄" />
        <StatCard title="Customers" value={String(data.customerCount)} icon="👥" color="bg-blue-50 text-blue-600" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard title="Expenses (HKD)" value={formatMoney(data.totalExpensesHkd, 'HKD')} icon="💰" color="bg-red-50 text-red-600" />
        <StatCard title="Expenses (RMB)" value={formatMoney(data.totalExpensesRmb, 'CNY')} icon="💴" color="bg-red-50 text-red-600" />
        <StatCard title="Expense Records" value={String(data.expenseCount)} icon="🧾" />
        <StatCard title="Net (HKD)" value={formatCurrency(data.totalRevenue - data.totalExpensesHkd)} icon="📈" color="bg-blue-50 text-blue-600" />
      </div>

      {data.overdueCount > 0 && (
        <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-sm">
          You have <strong>{data.overdueCount}</strong> overdue invoice{data.overdueCount > 1 ? 's' : ''}.
          <Link href="/invoices?status=overdue" className="ml-2 underline font-medium">View them</Link>
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <h2 className="font-semibold text-gray-900">Recent Invoices</h2>
          <Link href="/invoices" className="text-sm text-brand-600 hover:text-brand-700 font-medium">
            View all
          </Link>
        </div>
        {data.recentInvoices.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <p>No invoices yet.</p>
            <Link href="/invoices/new" className="mt-2 inline-block text-brand-600 hover:text-brand-700 font-medium text-sm">
              Create your first invoice
            </Link>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="text-left text-xs text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-3">Invoice</th>
                <th className="px-6 py-3">Customer</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Status</th>
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
        )}
      </div>
    </AppLayout>
  );
}
