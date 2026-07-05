import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import bcrypt from 'bcryptjs';
import db from './db';
import type { PermissionSection, UserRole } from './permissions';
import { getPermissionsListForRole, getUserRole } from './permissions-server';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'invoice-generator-dev-secret-change-in-production'
);

const COOKIE_NAME = 'invoice_session';
const EXPIRY = '7d';

export interface SessionPayload {
  userId: number;
  email: string;
  name: string;
  role: UserRole;
  permissions: PermissionSection[];
}

export interface AuthUser {
  id: number;
  email: string;
  name: string;
  company_name: string | null;
  role: UserRole;
  permissions: PermissionSection[];
}

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 12);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

export async function buildSessionPayload(userId: number): Promise<SessionPayload | null> {
  const row = db
    .prepare('SELECT id, email, name FROM users WHERE id = ?')
    .get(userId) as { id: number; email: string; name: string } | undefined;
  if (!row) return null;
  const role = getUserRole(userId);
  const permissions = getPermissionsListForRole(role);
  return { userId: row.id, email: row.email, name: row.name, role, permissions };
}

export async function createToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(EXPIRY)
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const role = (payload.role as UserRole) || 'operator';
    const permissions = (payload.permissions as PermissionSection[]) || [];
    return {
      userId: payload.userId as number,
      email: payload.email as string,
      name: payload.name as string,
      role,
      permissions,
    };
  } catch {
    return null;
  }
}

export async function createSessionForUserId(userId: number): Promise<{ token: string; user: AuthUser } | null> {
  const session = await buildSessionPayload(userId);
  if (!session) return null;
  const row = db
    .prepare('SELECT id, email, name, company_name, role FROM users WHERE id = ?')
    .get(userId) as {
    id: number;
    email: string;
    name: string;
    company_name: string | null;
    role: string;
  };
  const token = await createToken(session);
  return {
    token,
    user: {
      id: row.id,
      email: row.email,
      name: row.name,
      company_name: row.company_name,
      role: getUserRole(userId),
      permissions: session.permissions,
    },
  };
}

export async function setSessionCookie(token: string) {
  cookies().set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
}

export async function clearSessionCookie() {
  cookies().delete(COOKIE_NAME);
}

export async function getSession(): Promise<SessionPayload | null> {
  const token = cookies().get(COOKIE_NAME)?.value;
  if (!token) return null;
  return verifyToken(token);
}

export function getTokenFromRequest(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;
  const match = cookieHeader.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? match[1] : null;
}

export async function getSessionFromRequest(request: Request): Promise<SessionPayload | null> {
  const token = getTokenFromRequest(request);
  if (!token) return null;
  return verifyToken(token);
}

export async function refreshSessionCookie(userId: number): Promise<void> {
  const session = await createSessionForUserId(userId);
  if (session) await setSessionCookie(session.token);
}
