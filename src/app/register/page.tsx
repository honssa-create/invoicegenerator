'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/components/AuthProvider';
import { BTN, MSG, TITLE, bi } from '@/lib/ui-labels';

export default function RegisterPage() {
  const { register } = useAuth();
  const [form, setForm] = useState({ name: '', email: '', password: '', company_name: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [registrationOpen, setRegistrationOpen] = useState<boolean | null>(null);

  useEffect(() => {
    fetch('/api/auth/setup-status')
      .then((r) => r.json())
      .then((d) => setRegistrationOpen(d.registration_open === true))
      .catch(() => setRegistrationOpen(false));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(form);
    } catch (err) {
      setError(err instanceof Error ? err.message : MSG.registrationFailed);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <Link href="/" className="inline-flex items-center gap-2">
            <span className="text-3xl">💰</span>
            <span className="font-bold text-xl">InvoiceFlow</span>
          </Link>
          <h1 className="mt-6 text-2xl font-bold text-gray-900">
            {registrationOpen === false ? bi('Registration closed', '註冊已關閉') : TITLE.createAccount}
          </h1>
          <p className="mt-2 text-gray-600">
            {registrationOpen === false
              ? bi('Ask an administrator to create your account.', '請聯絡管理員為您建立帳戶。')
              : registrationOpen
                ? bi('First setup — this account becomes the system administrator.', '首次設定 — 此帳戶將成為系統管理員。')
                : BTN.loading}
          </p>
        </div>

        {registrationOpen === false ? (
          <div className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 shadow-sm text-center">
            <p className="text-gray-600 text-sm mb-4">{bi('New users are created by an admin under Administration → Users.', '新用戶由管理員在「系統管理 → 用戶」中建立。')}</p>
            <Link href="/login" className="text-brand-600 hover:text-brand-700 font-medium text-sm">
              {bi('Back to sign in', '返回登入')}
            </Link>
          </div>
        ) : registrationOpen ? (
        <form onSubmit={handleSubmit} className="bg-white rounded-xl border border-gray-200 p-6 sm:p-8 shadow-sm">
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg">
              {error}
            </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{bi('Full name', '全名')}</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                placeholder="John Smith"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{bi('Company name', '公司名稱')}</label>
              <input
                type="text"
                value={form.company_name}
                onChange={(e) => setForm({ ...form, company_name: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                placeholder="Acme Inc. (optional)"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{bi('Email', '電郵')}</label>
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                required
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                placeholder="you@company.com"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">{bi('Password', '密碼')}</label>
              <input
                type="password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                required
                minLength={6}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                placeholder="At least 6 characters"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-6 w-full py-2.5 bg-brand-600 text-white font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 transition-colors"
          >
            {loading ? bi('Creating account…', '建立帳戶中…') : bi('Create account', '建立帳戶')}
          </button>

          <p className="mt-4 text-center text-sm text-gray-600">
            {bi('Already have an account?', '已有帳戶？')}{' '}
            <Link href="/login" className="text-brand-600 hover:text-brand-700 font-medium">
              {BTN.signIn}
            </Link>
          </p>
        </form>
        ) : (
          <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm text-center text-gray-500">
            {BTN.loading}
          </div>
        )}
      </div>
    </div>
  );
}
