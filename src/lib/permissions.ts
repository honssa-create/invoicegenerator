/** Client-safe permission constants and path mapping. */

export const USER_ROLES = ['admin', 'operator', 'accountant'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const ROLE_LABELS: Record<UserRole, string> = {
  admin: 'Admin 管理員',
  operator: 'Operator 營運',
  accountant: 'Accountant 會計',
};

export const PERMISSION_SECTIONS = [
  { key: 'dashboard', label: 'Dashboard 儀表板', navHref: '/dashboard' },
  { key: 'quotations', label: 'Quotations 報價單', navHref: '/quotations' },
  { key: 'invoices', label: 'Invoices 發票', navHref: '/invoices' },
  { key: 'orders', label: 'Orders 訂單', navHref: '/orders' },
  { key: 'order_hub', label: 'Order Hub 訂單中心', navHref: '/hub' },
  { key: 'inbound', label: 'Inbound 到件', navHref: '/inbound' },
  { key: 'kitchen', label: 'Kitchen 廚房', navHref: '/kitchen' },
  { key: 'kitchen_prep', label: 'Kitchen Prep 備料', navHref: '/kitchen-prep' },
  { key: 'rentals', label: 'Rentals 租金', navHref: '/rentals' },
  { key: 'expenses', label: 'Expenses 支出', navHref: '/expenses' },
  { key: 'accounting', label: 'Accounting 會計', navHref: '/accounting' },
  { key: 'reconciliation', label: 'Reconciliation 對帳', navHref: '/reconciliation' },
  { key: 'cashflow', label: 'Cash Flow 現金流', navHref: '/cashflow' },
  { key: 'scan_table', label: 'Scan to Table 掃描表格', navHref: '/scan-table' },
  { key: 'customers', label: 'Customers 客戶', navHref: '/customers' },
  { key: 'settings', label: 'Settings 設定', navHref: '/settings' },
  { key: 'trash', label: 'Deleted Records 已刪除', navHref: '/trash' },
  { key: 'admin', label: 'Administration 系統管理', navHref: '/admin' },
] as const;

export type PermissionSection = (typeof PERMISSION_SECTIONS)[number]['key'];

export const ALL_SECTIONS: PermissionSection[] = PERMISSION_SECTIONS.map((s) => s.key);

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Record<PermissionSection, boolean>> = {
  admin: Object.fromEntries(ALL_SECTIONS.map((k) => [k, true])) as Record<PermissionSection, boolean>,
  operator: {
    dashboard: true,
    quotations: true,
    invoices: true,
    orders: true,
    order_hub: true,
    inbound: true,
    kitchen: true,
    kitchen_prep: true,
    rentals: true,
    expenses: true,
    accounting: false,
    cashflow: false,
    reconciliation: false,
    scan_table: true,
    customers: true,
    settings: true,
    trash: false,
    admin: false,
  },
  accountant: {
    dashboard: true,
    quotations: true,
    invoices: true,
    orders: false,
    order_hub: true,
    inbound: false,
    kitchen: false,
    kitchen_prep: false,
    rentals: true,
    expenses: true,
    accounting: true,
    cashflow: true,
    reconciliation: true,
    scan_table: true,
    customers: true,
    settings: true,
    trash: true,
    admin: false,
  },
};

const NAV_HREF_SECTION: Record<string, PermissionSection> = Object.fromEntries(
  PERMISSION_SECTIONS.map((s) => [s.navHref, s.key])
) as Record<string, PermissionSection>;

/** Longest-prefix match for nested paths e.g. /invoices/123 → invoices */
export function sectionForPagePath(pathname: string): PermissionSection | null {
  if (pathname === '/admin') return 'admin';
  const sorted = [...PERMISSION_SECTIONS].sort((a, b) => b.navHref.length - a.navHref.length);
  for (const s of sorted) {
    if (pathname === s.navHref || pathname.startsWith(`${s.navHref}/`)) return s.key;
  }
  return null;
}

const API_PREFIXES: [string, PermissionSection][] = [
  ['/api/admin', 'admin'],
  ['/api/trash', 'trash'],
  ['/api/quotations', 'quotations'],
  ['/api/invoices', 'invoices'],
  ['/api/orders', 'orders'],
  ['/api/hub', 'order_hub'],
  ['/api/integrations', 'order_hub'],
  ['/api/order-files', 'orders'],
  ['/api/payments', 'orders'],
  ['/api/inbound', 'inbound'],
  ['/api/kitchen-prep', 'kitchen_prep'],
  ['/api/kitchen', 'kitchen'],
  ['/api/rentals', 'rentals'],
  ['/api/rental-templates', 'rentals'],
  ['/api/expenses', 'expenses'],
  ['/api/expense-options/manage', 'settings'],
  ['/api/settings/integrations', 'settings'],
  ['/api/expense-options', 'expenses'],
  ['/api/receipts', 'expenses'],
  ['/api/accounting', 'accounting'],
  ['/api/reconciliation', 'reconciliation'],
  ['/api/cashflow', 'cashflow'],
  ['/api/other-income', 'cashflow'],
  ['/api/scan-table', 'scan_table'],
  ['/api/customers', 'customers'],
  ['/api/dashboard', 'dashboard'],
];

export function sectionForApiPath(pathname: string): PermissionSection | null {
  for (const [prefix, section] of API_PREFIXES) {
    if (pathname === prefix || pathname.startsWith(`${prefix}/`)) return section;
  }
  return null;
}

export function canAccessSection(
  role: UserRole,
  permissions: PermissionSection[],
  section: PermissionSection
): boolean {
  if (role === 'admin') return true;
  return permissions.includes(section);
}

export function navHrefToSection(href: string): PermissionSection | undefined {
  return NAV_HREF_SECTION[href];
}

/** Operators may view invoices & quotations but cannot create or edit them. */
export const OPERATOR_READ_ONLY_SECTIONS: PermissionSection[] = ['invoices', 'quotations', 'rentals'];

export function isSectionReadOnly(role: UserRole, section: PermissionSection): boolean {
  return role === 'operator' && OPERATOR_READ_ONLY_SECTIONS.includes(section);
}
