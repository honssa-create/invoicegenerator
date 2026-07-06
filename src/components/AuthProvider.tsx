'use client';

import { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import {
  canAccessSection,
  sectionForPagePath,
  type PermissionSection,
  type UserRole,
} from '@/lib/permissions';

interface User {
  id: number;
  email: string;
  name: string;
  company_name: string | null;
  role: UserRole;
  role_label?: string;
  permissions: PermissionSection[];
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (data: { email: string; password: string; name: string; company_name?: string }) => Promise<void>;
  logout: () => Promise<void>;
  canAccess: (section: PermissionSection) => boolean;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | null>(null);

const PUBLIC_PATHS = ['/', '/login', '/register'];

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname();

  const refreshUser = useCallback(async () => {
    const res = await fetch('/api/auth/me');
    if (res.ok) {
      const data = await res.json();
      if (data?.user) setUser(data.user);
      return;
    }
    setUser(null);
  }, []);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (data?.user) {
          setUser(data.user);
          if (!PUBLIC_PATHS.includes(pathname)) {
            const section = sectionForPagePath(pathname);
            if (
              section &&
              !canAccessSection(data.user.role, data.user.permissions, section)
            ) {
              router.push('/dashboard');
            }
          }
        } else if (!PUBLIC_PATHS.includes(pathname)) {
          router.push('/login');
        }
      })
      .finally(() => setLoading(false));
  }, [pathname, router]);

  const canAccess = (section: PermissionSection) => {
    if (!user) return false;
    return canAccessSection(user.role, user.permissions, section);
  };

  const login = async (email: string, password: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Login failed');
    setUser(data.user);
    router.push('/dashboard');
  };

  const register = async (formData: { email: string; password: string; name: string; company_name?: string }) => {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(formData),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Registration failed');
    setUser(data.user);
    router.push('/dashboard');
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
    router.push('/login');
  };

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, canAccess, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
