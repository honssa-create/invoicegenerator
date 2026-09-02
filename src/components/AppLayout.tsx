'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import { tapProps } from '@/lib/tap-action';
import { APP } from '@/lib/ui-labels';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [menuOpen]);

  // Middleware already gates routes; render shell + children immediately so
  // page data fetches run in parallel with /api/auth/me (not behind it).
  return (
    <div className="flex min-h-screen bg-gray-50">
      <Sidebar />
      <Sidebar variant="mobile" open={menuOpen} onNavigate={() => setMenuOpen(false)} />

      {menuOpen && (
        <button
          type="button"
          aria-label={APP.closeMenu}
          className="fixed inset-0 z-40 bg-black/40 lg:hidden"
          {...tapProps(() => setMenuOpen(false))}
        />
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-gray-200 bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            aria-label={APP.openMenu}
            className="inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gray-200 text-xl text-gray-700 hover:bg-gray-50"
            {...tapProps(() => setMenuOpen(true))}
          >
            ☰
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-gray-900">InvoiceFlow</p>
            <p className="truncate text-xs text-gray-500">{APP.financeManager}</p>
          </div>
        </header>

        <main className="min-w-0 flex-1 overflow-x-hidden overflow-y-auto">
          <div className="p-4 sm:p-6 lg:p-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
