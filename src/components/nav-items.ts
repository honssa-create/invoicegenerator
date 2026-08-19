import type { PermissionSection } from '@/lib/permissions';
import { NAV } from '@/lib/ui-labels';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  section: PermissionSection;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: NAV.dashboard, icon: '📊', section: 'dashboard' },
  { href: '/quotations', label: NAV.quotations, icon: '📝', section: 'quotations' },
  { href: '/invoices', label: NAV.invoices, icon: '📄', section: 'invoices' },
  { href: '/orders', label: NAV.orders, icon: '📦', section: 'orders' },
  { href: '/hub', label: NAV.orderHub, icon: '🛰️', section: 'order_hub' },
  { href: '/inbound', label: NAV.inbound, icon: '📥', section: 'inbound' },
  { href: '/kitchen', label: NAV.kitchen, icon: '🍲', section: 'kitchen' },
  { href: '/kitchen-prep', label: NAV.kitchenPrep, icon: '🥣', section: 'kitchen_prep' },
  { href: '/stocks', label: NAV.stocks, icon: '🗃️', section: 'stocks' },
  { href: '/rentals', label: NAV.rentals, icon: '🏠', section: 'rentals' },
  { href: '/rentals/meters', label: NAV.meterReadings, icon: '🔌', section: 'rentals' },
  { href: '/rentals/templates', label: NAV.templates, icon: '📋', section: 'rentals' },
  { href: '/expenses', label: NAV.expenses, icon: '🧾', section: 'expenses' },
  { href: '/accounting', label: NAV.accounting, icon: '📒', section: 'accounting' },
  { href: '/reconciliation', label: NAV.reconciliation, icon: '🏦', section: 'reconciliation' },
  { href: '/cashflow', label: NAV.cashflow, icon: '💹', section: 'cashflow' },
  { href: '/scan-table', label: NAV.scanTable, icon: '📊', section: 'scan_table' },
  { href: '/customers', label: NAV.customers, icon: '👥', section: 'customers' },
  { href: '/settings', label: NAV.settings, icon: '🔧', section: 'settings' },
  { href: '/trash', label: NAV.trash, icon: '🗑️', section: 'trash' },
  { href: '/admin', label: NAV.admin, icon: '⚙️', section: 'admin' },
];
