import type { PermissionSection } from '@/lib/permissions';

export interface NavItem {
  href: string;
  label: string;
  icon: string;
  section: PermissionSection;
}

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: '📊', section: 'dashboard' },
  { href: '/quotations', label: 'Quotations', icon: '📝', section: 'quotations' },
  { href: '/invoices', label: 'Invoices', icon: '📄', section: 'invoices' },
  { href: '/orders', label: 'Orders', icon: '📦', section: 'orders' },
  { href: '/inbound', label: 'Inbound', icon: '📥', section: 'inbound' },
  { href: '/kitchen', label: 'Kitchen', icon: '🍲', section: 'kitchen' },
  { href: '/kitchen-prep', label: 'Kitchen Prep', icon: '🥣', section: 'kitchen_prep' },
  { href: '/rentals', label: 'Rentals', icon: '🏠', section: 'rentals' },
  { href: '/rentals/templates', label: 'Templates', icon: '📋', section: 'rentals' },
  { href: '/expenses', label: 'Expenses', icon: '🧾', section: 'expenses' },
  { href: '/accounting', label: 'Accounting', icon: '📒', section: 'accounting' },
  { href: '/reconciliation', label: 'Reconciliation', icon: '🏦', section: 'reconciliation' },
  { href: '/cashflow', label: 'Cash Flow', icon: '💹', section: 'cashflow' },
  { href: '/scan-table', label: 'Scan to Table', icon: '📊', section: 'scan_table' },
  { href: '/customers', label: 'Customers', icon: '👥', section: 'customers' },
  { href: '/settings', label: 'Settings', icon: '🔧', section: 'settings' },
  { href: '/trash', label: 'Deleted Records', icon: '🗑️', section: 'trash' },
  { href: '/admin', label: 'Administration', icon: '⚙️', section: 'admin' },
];
