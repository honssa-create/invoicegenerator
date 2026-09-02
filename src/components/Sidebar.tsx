'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from './AuthProvider';
import { NAV_ITEMS } from './nav-items';
import { ORDER_NAV_TYPE_FILTERS } from '@/lib/orders';
import { APP, BTN } from '@/lib/ui-labels';

interface SidebarProps {
  variant?: 'desktop' | 'mobile';
  open?: boolean;
  onNavigate?: () => void;
}

export default function Sidebar({ variant = 'desktop', open = false, onNavigate }: SidebarProps) {
  const pathname = usePathname();
  const { user, logout, canAccess } = useAuth();
  const [ordersMenuOpen, setOrdersMenuOpen] = useState(false);

  const isMobile = variant === 'mobile';

  // iOS 15.8 still hit-tests off-screen `position:fixed` drawers. Unmount the
  // box from the layer tree with `display:none` when closed.
  const asideClass = isMobile
    ? open
      ? 'fixed top-0 bottom-0 left-0 z-50 flex w-[min(18rem,88vw)] flex-col border-r border-gray-200 bg-white shadow-xl lg:hidden'
      : 'hidden'
    : 'hidden lg:flex relative z-40 w-64 min-h-screen flex-col border-r border-gray-200 bg-white';

  const handleNav = () => {
    setOrdersMenuOpen(false);
    onNavigate?.();
  };

  const visibleItems = NAV_ITEMS.filter((item) => canAccess(item.section));
  const ordersActive = pathname === '/orders' || pathname.startsWith('/orders/');

  return (
    <aside
      className={asideClass}
      aria-hidden={isMobile ? !open : undefined}
    >
      <div className="border-b border-gray-200 p-4 sm:p-6">
        <Link href="/dashboard" className="flex items-center gap-2" onClick={handleNav}>
          <span className="text-2xl">💰</span>
          <div>
            <h1 className="text-lg font-bold text-gray-900">InvoiceFlow</h1>
            <p className="text-xs text-gray-500">{APP.financeManager}</p>
          </div>
        </Link>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto overflow-x-visible p-3 sm:p-4">
        {visibleItems.map((item) => {
          const active =
            item.href === '/orders'
              ? ordersActive
              : pathname === item.href || pathname.startsWith(`${item.href}/`);

          if (item.href === '/orders') {
            return (
              <div
                key={item.href}
                className="relative group"
                onMouseEnter={() => {
                  if (!isMobile) setOrdersMenuOpen(true);
                }}
                onMouseLeave={() => {
                  if (!isMobile) setOrdersMenuOpen(false);
                }}
              >
                <div
                  className={`flex min-h-[44px] items-center rounded-lg transition-colors ${
                    active
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                >
                  <Link
                    href="/orders"
                    onClick={handleNav}
                    className="flex min-h-[44px] min-w-0 flex-1 items-center gap-3 px-4 py-2.5 text-sm font-medium"
                  >
                    <span className="text-lg">{item.icon}</span>
                    {item.label}
                  </Link>
                  {isMobile ? (
                    <button
                      type="button"
                      aria-label="Order type filters"
                      aria-expanded={ordersMenuOpen}
                      onClick={() => setOrdersMenuOpen((v) => !v)}
                      className="shrink-0 px-3 py-2 text-xs text-gray-500 hover:text-gray-800"
                    >
                      {ordersMenuOpen ? '▲' : '▼'}
                    </button>
                  ) : (
                    <span className="shrink-0 px-3 py-2 text-xs text-gray-400" aria-hidden>
                      ▾
                    </span>
                  )}
                </div>

                {/*
                  Submenu expands under Orders (not a right flyout) so it is not clipped by
                  nav overflow or covered by the main content pane.
                */}
                <div
                  className={`ml-3 mt-0.5 space-y-0.5 border-l border-gray-200 pl-2 ${
                    isMobile
                      ? ordersMenuOpen
                        ? 'block'
                        : 'hidden'
                      : 'hidden group-hover:block'
                  }`}
                >
                  {ORDER_NAV_TYPE_FILTERS.map((f) => {
                    const params = new URLSearchParams();
                    params.set('type', f.param);
                    if ('status' in f && f.status) params.set('status', f.status);
                    return (
                      <Link
                        key={f.param}
                        href={`/orders?${params.toString()}`}
                        onClick={handleNav}
                        className="block rounded-md px-3 py-2 text-sm text-gray-600 hover:bg-brand-50 hover:text-brand-700"
                      >
                        {f.label}
                      </Link>
                    );
                  })}
                </div>
              </div>
            );
          }

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
          {user?.role_label && (
            <p className="truncate text-xs text-brand-600 mt-0.5">{user.role_label}</p>
          )}
        </div>
        <button
          onClick={() => {
            handleNav();
            logout();
          }}
          className="w-full rounded-lg px-4 py-2.5 text-left text-sm text-gray-600 transition-colors hover:bg-red-50 hover:text-red-600"
        >
          {BTN.signOut}
        </button>
      </div>
    </aside>
  );
}
