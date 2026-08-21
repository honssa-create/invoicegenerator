import db from './db';
import {
  ALL_SECTIONS,
  type PermissionSection,
  type SectionAccessLevel,
  type UserRole,
  USER_ROLES,
  sectionAccessAllowsView,
} from './permissions';

/** Bootstrap defaults when a role/section row is first created — not used at runtime after insert. */
const SEED_ROLE_ACCESS: Record<Exclude<UserRole, 'admin'>, Record<PermissionSection, SectionAccessLevel>> = {
  operator: {
    dashboard: 'write',
    quotations: 'read',
    invoices: 'read',
    orders: 'write',
    order_hub: 'write',
    inbound: 'write',
    kitchen: 'write',
    kitchen_prep: 'write',
    stocks: 'write',
    rentals: 'write',
    rental_meters: 'write',
    expenses: 'write',
    accounting: 'none',
    cashflow: 'none',
    reconciliation: 'none',
    scan_table: 'write',
    customers: 'write',
    settings: 'write',
    trash: 'none',
    admin: 'none',
  },
  accountant: {
    dashboard: 'write',
    quotations: 'write',
    invoices: 'write',
    orders: 'none',
    order_hub: 'write',
    inbound: 'none',
    kitchen: 'none',
    kitchen_prep: 'none',
    stocks: 'none',
    rentals: 'write',
    rental_meters: 'write',
    expenses: 'write',
    accounting: 'write',
    cashflow: 'write',
    reconciliation: 'write',
    scan_table: 'write',
    customers: 'write',
    settings: 'write',
    trash: 'write',
    admin: 'none',
  },
};

function parseAccessLevel(value: string | null | undefined): SectionAccessLevel | null {
  if (value === 'none' || value === 'read' || value === 'write') return value;
  return null;
}

function allowedFromAccess(level: SectionAccessLevel): number {
  return sectionAccessAllowsView(level) ? 1 : 0;
}

function emptyAccessMap(): Record<PermissionSection, SectionAccessLevel> {
  return Object.fromEntries(ALL_SECTIONS.map((s) => [s, 'none'])) as Record<
    PermissionSection,
    SectionAccessLevel
  >;
}

function adminAccessMap(): Record<PermissionSection, SectionAccessLevel> {
  return Object.fromEntries(ALL_SECTIONS.map((s) => [s, 'write'])) as Record<
    PermissionSection,
    SectionAccessLevel
  >;
}

/** Insert missing role/section rows from seed defaults; never overwrites admin-configured rows. */
export async function ensureRolePermissionRows(): Promise<void> {
  const insert = db.prepare(
    `INSERT INTO role_permissions (role, section, allowed, access_level) VALUES (?, ?, ?, ?)
     ON CONFLICT(role, section) DO NOTHING`,
  );
  await db.transaction(async () => {
    for (const role of ['operator', 'accountant'] as const) {
      for (const section of ALL_SECTIONS) {
        if (section === 'admin') continue;
        const level = SEED_ROLE_ACCESS[role][section];
        await insert.run(role, section, allowedFromAccess(level), level);
      }
    }
  });
}

export async function getUserRole(userId: number): Promise<UserRole> {
  const row = await db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
  const role = row?.role as UserRole | undefined;
  if (role && USER_ROLES.includes(role)) return role;
  return 'operator';
}

export async function getRoleAccessFromDb(
  role: UserRole,
): Promise<Record<PermissionSection, SectionAccessLevel>> {
  if (role === 'admin') return adminAccessMap();

  await ensureRolePermissionRows();

  const rows = await db
    .prepare('SELECT section, allowed, access_level FROM role_permissions WHERE role = ?')
    .all(role) as { section: string; allowed: number; access_level: string | null }[];

  const map = emptyAccessMap();
  for (const r of rows) {
    if (!ALL_SECTIONS.includes(r.section as PermissionSection)) continue;
    const section = r.section as PermissionSection;
    const parsed = parseAccessLevel(r.access_level);
    if (parsed) {
      map[section] = parsed;
    } else {
      map[section] = r.allowed === 1 ? 'write' : 'none';
    }
  }
  return map;
}

/** @deprecated Prefer getRoleAccessFromDb */
export async function getRolePermissionsFromDb(role: UserRole): Promise<Record<PermissionSection, boolean>> {
  const access = await getRoleAccessFromDb(role);
  return Object.fromEntries(
    ALL_SECTIONS.map((s) => [s, sectionAccessAllowsView(access[s])]),
  ) as Record<PermissionSection, boolean>;
}

export async function getPermissionsListForRole(role: UserRole): Promise<PermissionSection[]> {
  if (role === 'admin') return [...ALL_SECTIONS];
  const map = await getRoleAccessFromDb(role);
  return ALL_SECTIONS.filter((s) => sectionAccessAllowsView(map[s]));
}

export async function getReadOnlySectionsForRole(role: UserRole): Promise<PermissionSection[]> {
  if (role === 'admin') return [];
  const map = await getRoleAccessFromDb(role);
  return ALL_SECTIONS.filter((s) => map[s] === 'read');
}

export async function userHasSection(userId: number, section: PermissionSection): Promise<boolean> {
  const role = await getUserRole(userId);
  const permissions = await getPermissionsListForRole(role);
  return permissions.includes(section);
}

export async function requireAdmin(userId: number): Promise<boolean> {
  return (await getUserRole(userId)) === 'admin';
}

export async function countAdmins(): Promise<number> {
  const row = (await db.prepare("SELECT COUNT(*) as c FROM users WHERE role = 'admin'").get()) as {
    c: number;
  };
  return Number(row?.c ?? 0);
}

export async function countChildUsers(ownerUserId: number): Promise<number> {
  const row = (await db
    .prepare('SELECT COUNT(*) as c FROM users WHERE owner_user_id = ?')
    .get(ownerUserId)) as { c: number };
  return Number(row?.c ?? 0);
}

/** @deprecated Use ensureRolePermissionRows */
export async function seedRolePermissionsIfEmpty(): Promise<void> {
  await ensureRolePermissionRows();
}

export type RoleAccessMatrix = Record<UserRole, Record<PermissionSection, SectionAccessLevel>>;

export async function getPermissionMatrix(): Promise<RoleAccessMatrix> {
  await ensureRolePermissionRows();
  return {
    admin: adminAccessMap(),
    operator: await getRoleAccessFromDb('operator'),
    accountant: await getRoleAccessFromDb('accountant'),
  };
}

export async function saveRolePermissions(
  role: UserRole,
  permissions: Partial<Record<PermissionSection, SectionAccessLevel>>,
): Promise<void> {
  if (role === 'admin') {
    throw new Error('Admin permissions cannot be modified');
  }
  const upsert = db.prepare(
    `INSERT INTO role_permissions (role, section, allowed, access_level) VALUES (?, ?, ?, ?)
     ON CONFLICT(role, section) DO UPDATE SET
       allowed = excluded.allowed,
       access_level = excluded.access_level`,
  );
  await db.transaction(async () => {
    for (const section of ALL_SECTIONS) {
      if (section === 'admin') continue;
      if (permissions[section] === undefined) continue;
      const level = permissions[section]!;
      if (!parseAccessLevel(level)) {
        throw new Error(`Invalid access level for ${section}`);
      }
      await upsert.run(role, section, allowedFromAccess(level), level);
    }
  });
}

export interface UserRow {
  id: number;
  email: string;
  name: string;
  company_name: string | null;
  role: UserRole;
  created_at: string;
  child_user_count: number;
}

export async function listUsers(): Promise<UserRow[]> {
  const rows = (await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.company_name, u.role, u.created_at,
              (SELECT COUNT(*) FROM users c WHERE c.owner_user_id = u.id) AS child_user_count
       FROM users u
       ORDER BY u.name`,
    )
    .all()) as Array<Omit<UserRow, 'child_user_count'> & { child_user_count: number | string }>;
  return rows.map((r) => ({
    ...r,
    child_user_count: Number(r.child_user_count ?? 0),
  }));
}

export async function getUserById(id: number): Promise<UserRow | undefined> {
  const row = (await db
    .prepare(
      `SELECT u.id, u.email, u.name, u.company_name, u.role, u.created_at,
              (SELECT COUNT(*) FROM users c WHERE c.owner_user_id = u.id) AS child_user_count
       FROM users u
       WHERE u.id = ?`,
    )
    .get(id)) as
    | (Omit<UserRow, 'child_user_count'> & { child_user_count: number | string })
    | undefined;
  if (!row) return undefined;
  return { ...row, child_user_count: Number(row.child_user_count ?? 0) };
}
