import db from './db';
import {
  ALL_SECTIONS,
  DEFAULT_ROLE_PERMISSIONS,
  type PermissionSection,
  type UserRole,
  USER_ROLES,
  canAccessSection,
} from './permissions';

export async function getUserRole(userId: number): Promise<UserRole> {
  const row = await db.prepare('SELECT role FROM users WHERE id = ?').get(userId) as { role: string } | undefined;
  const role = row?.role as UserRole | undefined;
  if (role && USER_ROLES.includes(role)) return role;
  return 'operator';
}

export async function getRolePermissionsFromDb(role: UserRole): Promise<Record<PermissionSection, boolean>> {
  const rows = await db
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

export async function getPermissionsListForRole(role: UserRole): Promise<PermissionSection[]> {
  if (role === 'admin') return [...ALL_SECTIONS];
  const map = await getRolePermissionsFromDb(role);
  return ALL_SECTIONS.filter((s) => map[s]);
}

export async function userHasSection(userId: number, section: PermissionSection): Promise<boolean> {
  const role = await getUserRole(userId);
  const permissions = await getPermissionsListForRole(role);
  return canAccessSection(role, permissions, section);
}

export async function requireAdmin(userId: number): Promise<boolean> {
  return await getUserRole(userId) === 'admin';
}

export async function seedRolePermissionsIfEmpty(): Promise<void> {
  const count = (await db.prepare('SELECT COUNT(*) as c FROM role_permissions').get() as { c: number }).c;
  if (count > 0) return;

  const insert = db.prepare(
    'INSERT INTO role_permissions (role, section, allowed) VALUES (?, ?, ?)'
  );
  await db.transaction(async () => {
    for (const role of USER_ROLES) {
      if (role === 'admin') continue;
      const perms = DEFAULT_ROLE_PERMISSIONS[role];
      for (const section of ALL_SECTIONS) {
        await insert.run(role, section, perms[section] ? 1 : 0);
      }
    }
  });
}

export async function getPermissionMatrix(): Promise<Record<UserRole, Record<PermissionSection, boolean>>> {
  await seedRolePermissionsIfEmpty();
  return {
    admin: { ...DEFAULT_ROLE_PERMISSIONS.admin },
    operator: await getRolePermissionsFromDb('operator'),
    accountant: await getRolePermissionsFromDb('accountant'),
  };
}

export async function saveRolePermissions(
  role: UserRole,
  permissions: Partial<Record<PermissionSection, boolean>>
): Promise<void> {
  if (role === 'admin') {
    throw new Error('Admin permissions cannot be modified');
  }
  const upsert = db.prepare(
    `INSERT INTO role_permissions (role, section, allowed) VALUES (?, ?, ?)
     ON CONFLICT(role, section) DO UPDATE SET allowed = excluded.allowed`
  );
  await db.transaction(async () => {
    for (const section of ALL_SECTIONS) {
      if (section === 'admin') continue;
      if (permissions[section] === undefined) continue;
      await upsert.run(role, section, permissions[section] ? 1 : 0);
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
}

export async function listUsers(): Promise<UserRow[]> {
  return await db
    .prepare('SELECT id, email, name, company_name, role, created_at FROM users ORDER BY name')
    .all() as UserRow[];
}

export async function getUserById(id: number): Promise<UserRow | undefined> {
  return await db
    .prepare('SELECT id, email, name, company_name, role, created_at FROM users WHERE id = ?')
    .get(id) as UserRow | undefined;
}
