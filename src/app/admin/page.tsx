'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import {
  PERMISSION_SECTIONS,
  ROLE_LABELS,
  USER_ROLES,
  type PermissionSection,
  type UserRole,
} from '@/lib/permissions';
import { BTN, TITLE, bi } from '@/lib/ui-labels';

interface AdminUser {
  id: number;
  email: string;
  name: string;
  company_name: string | null;
  role: UserRole;
  created_at: string;
}

type Tab = 'users' | 'permissions';

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [matrix, setMatrix] = useState<Record<UserRole, Record<PermissionSection, boolean>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' } | null>(null);
  const [busy, setBusy] = useState(false);

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    email: '',
    password: '',
    name: '',
    company_name: '',
    role: 'operator' as UserRole,
  });

  const [resetUserId, setResetUserId] = useState<number | null>(null);
  const [resetPassword, setResetPassword] = useState('');

  const loadUsers = () =>
    fetch('/api/admin/users')
      .then((r) => r.json())
      .then((d) => setUsers(d.users || []));

  const loadPermissions = () =>
    fetch('/api/admin/permissions')
      .then((r) => r.json())
      .then((d) => setMatrix(d.matrix || null));

  const load = async () => {
    setLoading(true);
    await Promise.all([loadUsers(), loadPermissions()]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(t);
  }, [toast]);

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(createForm),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setToast({ msg: data.error || 'Failed to create user', kind: 'error' });
      return;
    }
    setToast({ msg: `Created user ${data.user.email}`, kind: 'success' });
    setShowCreate(false);
    setCreateForm({ email: '', password: '', name: '', company_name: '', role: 'operator' });
    loadUsers();
  };

  const updateRole = async (userId: number, role: UserRole) => {
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role }),
    });
    const data = await res.json();
    if (!res.ok) {
      setToast({ msg: data.error || 'Failed to update role', kind: 'error' });
      return;
    }
    setToast({ msg: 'Role updated', kind: 'success' });
    loadUsers();
  };

  const submitResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resetUserId) return;
    setBusy(true);
    const res = await fetch(`/api/admin/users/${resetUserId}/reset-password`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ password: resetPassword }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setToast({ msg: data.error || 'Failed to reset password', kind: 'error' });
      return;
    }
    setToast({ msg: 'Password reset successfully', kind: 'success' });
    setResetUserId(null);
    setResetPassword('');
  };

  const togglePermission = (role: UserRole, section: PermissionSection, allowed: boolean) => {
    if (!matrix) return;
    setMatrix({
      ...matrix,
      [role]: { ...matrix[role], [section]: allowed },
    });
  };

  const savePermissions = async (role: UserRole) => {
    if (!matrix) return;
    setBusy(true);
    const res = await fetch('/api/admin/permissions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, permissions: matrix[role] }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setToast({ msg: data.error || 'Failed to save permissions', kind: 'error' });
      return;
    }
    setMatrix(data.matrix);
    setToast({ msg: `Saved ${ROLE_LABELS[role]} permissions`, kind: 'success' });
  };

  const inp =
    'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

  return (
    <AppLayout>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{TITLE.admin}</h1>
        <p className="text-gray-500 mt-1 text-sm sm:text-base">
          {bi('Manage users, roles, and section permissions for Operator and Accountant accounts.', '管理操作員及會計帳戶的用戶、角色及模組權限。')}
        </p>
      </div>

      {toast && (
        <div
          className={`mb-4 p-3 rounded-lg text-sm ${
            toast.kind === 'success' ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'
          }`}
        >
          {toast.msg}
        </div>
      )}

      <div className="flex gap-2 mb-6 border-b border-gray-200">
        {(['users', 'permissions'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              tab === t
                ? 'border-brand-600 text-brand-700'
                : 'border-transparent text-gray-500 hover:text-gray-800'
            }`}
          >
            {t === 'users' ? `👥 ${bi('Users', '用戶')}` : `🔐 ${bi('Role Permissions', '角色權限')}`}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="p-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
        </div>
      ) : tab === 'users' ? (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button
              onClick={() => setShowCreate(true)}
              className="px-4 py-2.5 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700"
            >
              + {bi('Create User', '建立用戶')}
            </button>
          </div>

          <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Created</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.name}</td>
                    <td className="px-4 py-3 text-gray-600">{u.email}</td>
                    <td className="px-4 py-3">
                      <select
                        value={u.role}
                        onChange={(e) => updateRole(u.id, e.target.value as UserRole)}
                        className="px-2 py-1 border border-gray-300 rounded-lg text-sm"
                      >
                        {USER_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{u.created_at?.slice(0, 10)}</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => {
                          setResetUserId(u.id);
                          setResetPassword('');
                        }}
                        className="text-brand-600 hover:text-brand-700 font-medium"
                      >
                        {bi('Reset password', '重設密碼')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <div className="space-y-8">
          <p className="text-sm text-gray-600">
            Admin role always has full access. Configure which sections Operator and Accountant roles can use.
            Users must sign in again (or refresh) to pick up permission changes.
          </p>
          {(['operator', 'accountant'] as UserRole[]).map((role) => (
            <div key={role} className="bg-white rounded-xl border border-gray-200 p-5">
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h2 className="font-semibold text-gray-900">{ROLE_LABELS[role]}</h2>
                <button
                  onClick={() => savePermissions(role)}
                  disabled={busy}
                  className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50"
                >
                  {bi('Save', '儲存')} {ROLE_LABELS[role]} {bi('permissions', '權限')}
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {PERMISSION_SECTIONS.filter((s) => s.key !== 'admin').map((s) => (
                  <label
                    key={s.key}
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-100 hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={matrix?.[role]?.[s.key] ?? false}
                      onChange={(e) => togglePermission(role, s.key, e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                    />
                    <span className="text-sm text-gray-700">{s.label}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {showCreate && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-lg rounded-t-2xl sm:rounded-2xl p-6 shadow-xl max-h-[92vh] overflow-y-auto">
            <h2 className="text-lg font-semibold mb-4">{bi('Create User', '建立用戶')}</h2>
            <form onSubmit={createUser} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Name *</label>
                <input required value={createForm.name} onChange={(e) => setCreateForm({ ...createForm, name: e.target.value })} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Email *</label>
                <input required type="email" value={createForm.email} onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Password *</label>
                <input required type="password" minLength={6} value={createForm.password} onChange={(e) => setCreateForm({ ...createForm, password: e.target.value })} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Company</label>
                <input value={createForm.company_name} onChange={(e) => setCreateForm({ ...createForm, company_name: e.target.value })} className={inp} />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Role</label>
                <select value={createForm.role} onChange={(e) => setCreateForm({ ...createForm, role: e.target.value as UserRole })} className={inp}>
                  {USER_ROLES.map((r) => (
                    <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-2">
                <button type="submit" disabled={busy} className="flex-1 py-2.5 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50">
                  {busy ? BTN.creating : BTN.create}
                </button>
                <button type="button" onClick={() => setShowCreate(false)} className="px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50">
                  {BTN.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {resetUserId && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-4">{bi('Reset Password', '重設密碼')}</h2>
            <p className="text-sm text-gray-600 mb-4">
              Set a new password for {users.find((u) => u.id === resetUserId)?.email}
            </p>
            <form onSubmit={submitResetPassword} className="space-y-3">
              <input
                required
                type="password"
                minLength={6}
                placeholder="New password (min 6 chars)"
                value={resetPassword}
                onChange={(e) => setResetPassword(e.target.value)}
                className={inp}
              />
              <div className="flex gap-2">
                <button type="submit" disabled={busy} className="flex-1 py-2.5 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50">
                  {busy ? BTN.saving : bi('Reset password', '重設密碼')}
                </button>
                <button type="button" onClick={() => setResetUserId(null)} className="px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700">
                  {BTN.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
