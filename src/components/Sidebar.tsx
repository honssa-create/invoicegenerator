'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';

export const NAV_ITEMS = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊' },
  { href: '/quotations', label: 'Quotations', icon: '📝' },
  { href: '/invoices', label: 'Invoices', icon: '📄' },
  { href: '/orders', label: 'Orders', icon: '📦' },
  { href: '/inbound', label: 'Inbound', icon: '📥' },
  { href: '/kitchen', label: 'Kitchen', icon: '🍲' },
  { href: '/kitchen-prep', label: 'Kitchen Prep', icon: '🥣' },
  { href: '/rentals', label: 'Rentals', icon: '🏠' },
  { href: '/expenses', label: 'Expenses', icon: '🧾' },
  { href: '/accounting', label: 'Accounting', icon: '📒' },
  { href: '/cashflow', label: 'Cash Flow', icon: '💹' },
  { href: '/scan-table', label: 'Scan to Table', icon: '📊' },
  { href: '/customers', label: 'Customers', icon: '👥' },
  { href: '/trash', label: 'Deleted Records', icon: '🗑️' },
];

interface SidebarProps {
  variant?: 'desktop' | 'mobile';
  open?: boolean;
  onNavigate?: () => void;
}

export default function Sidebar({ variant = 'desktop', open = false, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  const isMobile = variant === 'mobile';

  const asideClass = isMobile
    ? `fixed inset-y-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col border-r border-gray-200 bg-white shadow-xl transition-transform duration-200 ease-out lg:hidden ${
        open ? 'translate-x-0' : '-translate-x-full pointer-events-none'
      }`
    : 'hidden lg:flex w-64 min-h-screen flex-col border-r border-gray-200 bg-white';

  const handleNav = () => onNavigate?.();

  return (
    <aside className={asideClass} aria-hidden={isMobile ? !open : undefined}>
      <div className="border-b border-gray-200 p-4 sm:p-6">
        <Link href="/dashboard" className="flex items-center gap-2" onClick={handleNav}>
          <span className="text-2xl">💰</span>
          <div>
            <h1 className="text-lg font-bold text-gray-900">InvoiceFlow</h1>
            <p className="text-xs text-gray-500">Finance Manager</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto p-3 sm:p-4">
        {NAV_ITEMS.map((item) => {
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              onClick={handleNav}
              className={`flex min-h-[44px] items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand-50 text-brand-700'
                  : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-gray-200 p-3 sm:p-4">
        <div className="mb-2 px-4 py-2">
          <p className="truncate text-sm font-medium text-gray-900">{user?.name}</p>
          <p className="truncate text-xs text-gray-500">{user?.email}</p>
        </div>
        <button
          onClick={() => {
            handleNav();
            logout();
          }}
          className="w-full rounded-lg px-4 py-2.5 text-left text-sm text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          Sign out
        </button>
      </div>
    </aside>
  );
}
