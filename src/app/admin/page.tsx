'use client';

import { useEffect, useState } from 'react';
import AppLayout from '@/components/AppLayout';
import { useAuth } from '@/components/AuthProvider';
import { useModalUnsavedWarning, useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';
import {
  PERMISSION_SECTIONS,
  ROLE_LABELS,
  SECTION_ACCESS_LABELS,
  USER_ROLES,
  type PermissionSection,
  type SectionAccessLevel,
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
  child_user_count: number;
}

type Tab = 'users' | 'permissions';

export default function AdminPage() {
  const { user: currentUser, logout, refreshUser } = useAuth();
  const [tab, setTab] = useState<Tab>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [matrix, setMatrix] = useState<Record<UserRole, Record<PermissionSection, SectionAccessLevel>> | null>(null);
  const [usersLoading, setUsersLoading] = useState(true);
  const [permissionsLoading, setPermissionsLoading] = useState(false);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
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

  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editForm, setEditForm] = useState({ name: '', email: '' });

  const [deleteUser, setDeleteUser] = useState<AdminUser | null>(null);
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('');

  const [savedPermissionsSnapshot, setSavedPermissionsSnapshot] = useState<string | null>(null);

  useModalUnsavedWarning(showCreate, createForm);
  useModalUnsavedWarning(Boolean(editUser), editForm);
  useModalUnsavedWarning(Boolean(resetUserId), { password: resetPassword });
  useModalUnsavedWarning(Boolean(deleteUser), { email: deleteConfirmEmail });

  const permissionsDirty =
    tab === 'permissions' &&
    matrix !== null &&
    savedPermissionsSnapshot !== null &&
    JSON.stringify(matrix) !== savedPermissionsSnapshot;
  useUnsavedChangesWarning(permissionsDirty);

  const adminCount = users.filter((u) => u.role === 'admin').length;

  const loadUsers = async () => {
    const res = await fetch('/api/admin/users');
    const d = await res.json();
    setUsers(d.users || []);
  };

  const loadPermissions = async () => {
    const res = await fetch('/api/admin/permissions');
    const d = await res.json();
    setMatrix(d.matrix || null);
    setSavedPermissionsSnapshot(JSON.stringify(d.matrix || null));
    setPermissionsLoaded(true);
  };

  useEffect(() => {
    loadUsers().finally(() => setUsersLoading(false));
  }, []);

  useEffect(() => {
    if (tab !== 'permissions' || permissionsLoaded) return;
    setPermissionsLoading(true);
    loadPermissions().finally(() => setPermissionsLoading(false));
  }, [tab, permissionsLoaded]);

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

  const submitEditUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editUser) return;
    setBusy(true);
    const res = await fetch(`/api/admin/users/${editUser.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: editForm.name, email: editForm.email }),
    });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setToast({ msg: data.error || bi('Failed to update user', '更新用戶失敗'), kind: 'error' });
      return;
    }
    setToast({ msg: bi('User updated', '用戶已更新'), kind: 'success' });
    setEditUser(null);
    await loadUsers();
    if (currentUser?.id === editUser.id) {
      await refreshUser();
    }
  };

  const submitDeleteUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deleteUser) return;
    if ((deleteUser.child_user_count ?? 0) > 0) return;
    if (deleteConfirmEmail.trim().toLowerCase() !== deleteUser.email.toLowerCase()) {
      setToast({ msg: bi('Email does not match', '電郵不符'), kind: 'error' });
      return;
    }
    setBusy(true);
    const res = await fetch(`/api/admin/users/${deleteUser.id}`, { method: 'DELETE' });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setToast({ msg: data.error || bi('Failed to delete user', '刪除用戶失敗'), kind: 'error' });
      return;
    }
    const deletedSelf = currentUser?.id === deleteUser.id;
    setDeleteUser(null);
    setDeleteConfirmEmail('');
    if (deletedSelf) {
      await logout();
      return;
    }
    setToast({ msg: bi('User deleted', '用戶已刪除'), kind: 'success' });
    loadUsers();
  };

  const setPermissionLevel = (role: UserRole, section: PermissionSection, level: SectionAccessLevel) => {
    if (!matrix) return;
    setMatrix({
      ...matrix,
      [role]: { ...matrix[role], [section]: level },
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
    setSavedPermissionsSnapshot(JSON.stringify(data.matrix));
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

      {tab === 'users' && usersLoading ? (
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
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          onClick={() => {
                            setEditUser(u);
                            setEditForm({ name: u.name, email: u.email });
                          }}
                          className="text-brand-600 hover:text-brand-700 font-medium"
                        >
                          {bi('Edit', '編輯')}
                        </button>
                        <button
                          onClick={() => {
                            setResetUserId(u.id);
                            setResetPassword('');
                          }}
                          className="text-brand-600 hover:text-brand-700 font-medium"
                        >
                          {bi('Reset password', '重設密碼')}
                        </button>
                        <button
                          type="button"
                          disabled={u.role === 'admin' && adminCount <= 1}
                          title={
                            u.role === 'admin' && adminCount <= 1
                              ? bi('Cannot delete the last admin', '不可刪除最後一位管理員')
                              : undefined
                          }
                          onClick={() => {
                            setDeleteUser(u);
                            setDeleteConfirmEmail('');
                          }}
                          className="text-red-600 hover:text-red-700 font-medium disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {bi('Delete', '刪除')}
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : permissionsLoading || !matrix ? (
        <div className="p-12 text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600 mx-auto" />
        </div>
      ) : (
        <div className="space-y-8">
          <p className="text-sm text-gray-600">
          {bi(
              'Admin always has full access. For each module, choose Hidden, Read only, or Read & write. Changes apply on the next page load.',
              '管理員永遠擁有全部權限。每個模組可設為隱藏、唯讀或讀寫。變更會在下次載入頁面時生效。',
            )}
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
              <div className="table-scroll">
                <table className="w-full min-w-[520px] text-sm">
                  <thead>
                    <tr className="text-left text-xs text-gray-500 uppercase tracking-wider border-b border-gray-200">
                      <th className="px-3 py-2 font-medium">{bi('Module', '模組')}</th>
                      <th className="px-3 py-2 font-medium w-48">{bi('Access', '權限')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100">
                    {PERMISSION_SECTIONS.filter((s) => s.key !== 'admin').map((s) => (
                      <tr key={s.key} className="hover:bg-gray-50">
                        <td className="px-3 py-2.5 text-gray-800">{s.label}</td>
                        <td className="px-3 py-2.5">
                          <select
                            value={matrix?.[role]?.[s.key] ?? 'none'}
                            onChange={(e) =>
                              setPermissionLevel(role, s.key, e.target.value as SectionAccessLevel)
                            }
                            className="w-full px-2 py-1.5 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-brand-500 outline-none"
                          >
                            {(['none', 'read', 'write'] as SectionAccessLevel[]).map((level) => (
                              <option key={level} value={level}>
                                {SECTION_ACCESS_LABELS[level]}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
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

      {editUser && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-4">{bi('Edit User', '編輯用戶')}</h2>
            <form onSubmit={submitEditUser} className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {bi('Name', '名稱')} *
                </label>
                <input
                  required
                  value={editForm.name}
                  onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                  className={inp}
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">
                  {bi('Email', '電郵')} *
                </label>
                <input
                  required
                  type="email"
                  value={editForm.email}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  className={inp}
                />
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  type="submit"
                  disabled={busy}
                  className="flex-1 py-2.5 bg-brand-600 text-white rounded-lg font-medium hover:bg-brand-700 disabled:opacity-50"
                >
                  {busy ? BTN.saving : BTN.save}
                </button>
                <button
                  type="button"
                  onClick={() => setEditUser(null)}
                  className="px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700"
                >
                  {BTN.cancel}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {deleteUser && (
        <div className="fixed inset-0 bg-black/40 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4">
          <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-6 shadow-xl">
            <h2 className="text-lg font-semibold mb-2 text-red-700">{bi('Delete User', '刪除用戶')}</h2>
            {(deleteUser.child_user_count ?? 0) > 0 ? (
              <>
                <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                  {bi(
                    'Cannot delete while other users belong to this account. Remove or reassign those users first.',
                    '仍有其他用戶隸屬此帳戶，無法刪除。請先刪除或重新指派那些用戶。'
                  )}
                  <span className="mt-1 block text-amber-800">
                    {bi('Linked users', '隸屬用戶')}: {deleteUser.child_user_count}
                  </span>
                </div>
                <p className="text-sm text-gray-600 mb-4">
                  {bi('User', '用戶')}: <span className="font-medium text-gray-900">{deleteUser.name}</span>
                  {' · '}
                  <span className="font-mono text-gray-800">{deleteUser.email}</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setDeleteUser(null);
                    setDeleteConfirmEmail('');
                  }}
                  className="w-full py-2.5 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
                >
                  {BTN.cancel}
                </button>
              </>
            ) : (
              <>
                <p className="text-sm text-gray-700 mb-2">
                  {bi(
                    'This permanently deletes the account and cannot be undone.',
                    '此操作會永久刪除帳戶，無法還原。'
                  )}
                </p>
                <p className="text-sm text-gray-600 mb-4">
                  {bi('User', '用戶')}: <span className="font-medium text-gray-900">{deleteUser.name}</span>
                  {' · '}
                  <span className="font-mono text-gray-800">{deleteUser.email}</span>
                  {currentUser?.id === deleteUser.id && (
                    <span className="block mt-2 text-amber-700">
                      {bi(
                        'You are deleting your own account. You will be signed out afterwards.',
                        '您正在刪除自己的帳戶，完成後將會登出。'
                      )}
                    </span>
                  )}
                </p>
                <form onSubmit={submitDeleteUser} className="space-y-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">
                      {bi('Type the email to confirm', '輸入電郵以確認')}
                    </label>
                    <input
                      required
                      type="email"
                      autoComplete="off"
                      placeholder={deleteUser.email}
                      value={deleteConfirmEmail}
                      onChange={(e) => setDeleteConfirmEmail(e.target.value)}
                      className={inp}
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={
                        busy ||
                        deleteConfirmEmail.trim().toLowerCase() !== deleteUser.email.toLowerCase()
                      }
                      className="flex-1 py-2.5 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700 disabled:opacity-50"
                    >
                      {busy ? BTN.saving : bi('Delete permanently', '永久刪除')}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setDeleteUser(null);
                        setDeleteConfirmEmail('');
                      }}
                      className="px-4 py-2.5 border border-gray-300 rounded-lg text-gray-700"
                    >
                      {BTN.cancel}
                    </button>
                  </div>
                </form>
              </>
            )}
          </div>
        </div>
      )}
    </AppLayout>
  );
}
