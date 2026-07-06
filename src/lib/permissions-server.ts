import db from './db';
import {
  ALL_SECTIONS,
  DEFAULT_ROLE_PERMISSIONS,
  type PermissionSection,
  type UserRole,
  USER_ROLES,
  canAccessSection,
} from './permissions';

export function getUserRole(userId: number): UserRole {
  const row = db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
  const role = row?.role as UserRole | undefined;
  if (role && USER_ROLES.includes(role)) return role;
  return 'operator';
}

export function getRolePermissionsFromDb(role: UserRole): Record<PermissionSection, boolean> {
  const rows = db
    .prepare('SELECT section, allowed FROM role_permissions WHERE role = ?')
    .all(role) as { section: string; allowed: number }[];

  if (rows.length === 0) return { ...DEFAULT_ROLE_PERMISSIONS[role] };

  const map = { ...DEFAULT_ROLE_PERMISSIONS[role] };
  for (const r of rows) {
    if (ALL_SECTIONS.includes(r.section as PermissionSection)) {
      map[r.section as PermissionSection] = r.allowed === 1;
    }
  }
  return map;
}

export function getPermissionsListForRole(role: UserRole): PermissionSection[] {
  if (role === 'admin') return [...ALL_SECTIONS];
  const map = getRolePermissionsFromDb(role);
  return ALL_SECTIONS.filter((s) => map[s]);
}

export function userHasSection(userId: number, section: PermissionSection): boolean {
  const role = getUserRole(userId);
  const permissions = getPermissionsListForRole(role);
  return canAccessSection(role, permissions, section);
}

export function requireAdmin(userId: number): boolean {
  return getUserRole(userId) === 'admin';
}

export function seedRolePermissionsIfEmpty(): void {
  const count = (db.prepare('SELECT COUNT(*) as c FROM role_permissions').get() as { c: number }).c;
  if (count > 0) return;

  const insert = db.prepare(
    'INSERT INTO role_permissions (role, section, allowed) VALUES (?, ?, ?)'
  );
  const seed = db.transaction(() => {
    for (const role of USER_ROLES) {
      if (role === 'admin') continue;
      const perms = DEFAULT_ROLE_PERMISSIONS[role];
      for (const section of ALL_SECTIONS) {
        insert.run(role, section, perms[section] ? 1 : 0);
      }
    }
  });
  seed();
}

export function getPermissionMatrix(): Record<UserRole, Record<PermissionSection, boolean>> {
  seedRolePermissionsIfEmpty();
  return {
    admin: { ...DEFAULT_ROLE_PERMISSIONS.admin },
    operator: getRolePermissionsFromDb('operator'),
    accountant: getRolePermissionsFromDb('accountant'),
  };
}

export function saveRolePermissions(
  role: UserRole,
  permissions: Partial<Record<PermissionSection, boolean>>
): void {
  if (role === 'admin') {
    throw new Error('Admin permissions cannot be modified');
  }
  const upsert = db.prepare(
    `INSERT INTO role_permissions (role, section, allowed) VALUES (?, ?, ?)
     ON CONFLICT(role, section) DO UPDATE SET allowed = excluded.allowed`
  );
  const work = db.transaction(() => {
    for (const section of ALL_SECTIONS) {
      if (section === 'admin') continue;
      if (permissions[section] === undefined) continue;
      upsert.run(role, section, permissions[section] ? 1 : 0);
    }
  });
  work();
}

export interface UserRow {
  id: number;
  email: string;
  name: string;
  company_name: string | null;
  role: UserRole;
  created_at: string;
}

export function listUsers(): UserRow[] {
  return db
    .prepare('SELECT id, email, name, company_name, role, created_at FROM users ORDER BY name')
    .all() as UserRow[];
}

export function getUserById(id: number): UserRow | undefined {
  return db
    .prepare('SELECT id, email, name, company_name, role, created_at FROM users WHERE id = ?')
    .get(id) as UserRow | undefined;
}
