import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import {
  canAccessSection,
  sectionForApiPath,
  sectionForPagePath,
  type PermissionSection,
  type UserRole,
} from '@/lib/permissions';

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || 'invoice-generator-dev-secret-change-in-production'
);
const COOKIE_NAME = 'invoice_session';

const PUBLIC_PATHS = ['/', '/login', '/register'];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (pathname.startsWith('/_next') || /\.[a-z0-9]+$/i.test(pathname)) {
    return NextResponse.next();
  }
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (pathname.startsWith('/api/auth/')) return NextResponse.next();
  if (pathname.startsWith('/api/cron/')) return NextResponse.next();

  const token = request.cookies.get(COOKIE_NAME)?.value;
  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const login = new URL('/login', request.url);
    login.searchParams.set('from', pathname);
    return NextResponse.redirect(login);
  }

  let role: UserRole = 'operator';
  let permissions: PermissionSection[] = [];
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    role = (payload.role as UserRole) || 'operator';
    permissions = (payload.permissions as PermissionSection[]) || [];
  } catch {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const section = pathname.startsWith('/api/')
    ? sectionForApiPath(pathname)
    : sectionForPagePath(pathname);

  if (section && !canAccessSection(role, permissions, section)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Forbidden — insufficient permissions' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
