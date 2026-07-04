'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/quotations', label: 'Quotations', icon: '📝' },
  { href: '/invoices', label: 'Invoices', icon: '📄' },
  { href: '/orders', label: 'Orders', icon: '📦' },
  { href: '/inbound', label: 'Inbound', icon: '📥' },
  { href: '/kitchen', label: 'Kitchen', icon: '🍲' },
  { href: '/kitchen-prep', label: 'Kitchen Prep', icon: '🥣' },
  { href: '/expenses', label: 'Expenses', icon: '🧾' },
  { href: '/accounting', label: 'Accounting', icon: '📒' },
  { href: '/cashflow', label: 'Cash Flow', icon: '💹' },
  { href: '/scan-table', label: 'Scan to Table', icon: '📊' },
  { href: '/customers', label: 'Customers', icon: '👥' },
];

export default function Sidebar() {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <aside className="w-64 bg-white border-r border-gray-200 flex flex-col min-h-screen">
      <div className="p-6 border-b border-gray-200">
        <Link href="/dashboard" className="flex items-center gap-2">
          <span className="text-2xl">💰</span>
          <div>
            <h1 className="font-bold text-lg text-gray-900">InvoiceFlow</h1>
            <p className="text-xs text-gray-500">Finance Manager</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span>{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="p-4 border-t border-gray-200">
        <div className="px-4 py-2 mb-2">
          <p className="text-sm font-medium text-gray-900 truncate">{user?.name}</p>
          <p className="text-xs text-gray-500 truncate">{user?.email}</p>
        </div>
        <button
          onClick={logout}
          className="w-full text-left px-4 py-2 text-sm text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
