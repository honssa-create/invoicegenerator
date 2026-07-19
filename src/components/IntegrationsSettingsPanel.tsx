'use client';

import { useEffect, useState } from 'react';
import {
  WOO_PLATFORM_LABELS,
  type IntegrationSettingsMasked,
  type WooPlatformKey,
} from '@/lib/integration-settings';

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

const EMPTY_MASKED: IntegrationSettingsMasked = {
  woocommerce: {
    nestiee: { url: '', key_set: false, key_hint: '', secret_set: false, secret_hint: '' },
    honour: { url: '', key_set: false, key_hint: '', secret_set: false, secret_hint: '' },
    cupmoka: { url: '', key_set: false, key_hint: '', secret_set: false, secret_hint: '' },
  },
  quickbooks: {
    client_id: '',
    client_id_set: false,
    client_secret_set: false,
    client_secret_hint: '',
    redirect_uri: '',
    environment: 'sandbox',
  },
  yedpay: { user_id: '', access_token_set: false, access_token_hint: '' },
};

type WooForm = Record<WooPlatformKey, { url: string; key: string; secret: string }>;

export default function IntegrationsSettingsPanel({
  onToast,
}: {
  onToast: (msg: string, kind: 'success' | 'error') => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [masked, setMasked] = useState<IntegrationSettingsMasked>(EMPTY_MASKED);
  const [woo, setWoo] = useState<WooForm>({
    nestiee: { url: '', key: '', secret: '' },
    honour: { url: '', key: '', secret: '' },
    cupmoka: { url: '', key: '', secret: '' },
  });
  const [qb, setQb] = useState({
    client_id: '',
    client_secret: '',
    redirect_uri: '',
    environment: 'sandbox' as 'sandbox' | 'production',
  });
  const [yedpay, setYedpay] = useState({ user_id: '', access_token: '' });

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/integrations');
      const data = await res.json();
      if (!res.ok) {
        onToast(data.error || 'Failed to load integration settings', 'error');
        return;
      }
      const s = data.settings as IntegrationSettingsMasked;
      setMasked(s);
      setWoo({
        nestiee: { url: s.woocommerce.nestiee.url, key: '', secret: '' },
        honour: { url: s.woocommerce.honour.url, key: '', secret: '' },
        cupmoka: { url: s.woocommerce.cupmoka.url, key: '', secret: '' },
      });
      setQb({
        client_id: s.quickbooks.client_id,
        client_secret: '',
        redirect_uri: s.quickbooks.redirect_uri,
        environment: s.quickbooks.environment,
      });
      setYedpay({ user_id: s.yedpay.user_id, access_token: '' });
    } catch {
      onToast('Failed to load integration settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        woocommerce: {
          nestiee: { url: woo.nestiee.url, ...(woo.nestiee.key ? { key: woo.nestiee.key } : {}), ...(woo.nestiee.secret ? { secret: woo.nestiee.secret } : {}) },
          honour: { url: woo.honour.url, ...(woo.honour.key ? { key: woo.honour.key } : {}), ...(woo.honour.secret ? { secret: woo.honour.secret } : {}) },
          cupmoka: { url: woo.cupmoka.url, ...(woo.cupmoka.key ? { key: woo.cupmoka.key } : {}), ...(woo.cupmoka.secret ? { secret: woo.cupmoka.secret } : {}) },
        },
        quickbooks: {
          client_id: qb.client_id,
          redirect_uri: qb.redirect_uri,
          environment: qb.environment,
          ...(qb.client_secret ? { client_secret: qb.client_secret } : {}),
        },
        yedpay: {
          user_id: yedpay.user_id,
          ...(yedpay.access_token ? { access_token: yedpay.access_token } : {}),
        },
      };

      const res = await fetch('/api/settings/integrations', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        onToast(data.error || 'Failed to save', 'error');
        return;
      }
      setMasked(data.settings);
      setWoo({
        nestiee: { url: data.settings.woocommerce.nestiee.url, key: '', secret: '' },
        honour: { url: data.settings.woocommerce.honour.url, key: '', secret: '' },
        cupmoka: { url: data.settings.woocommerce.cupmoka.url, key: '', secret: '' },
      });
      setQb((prev) => ({ ...prev, client_secret: '' }));
      setYedpay((prev) => ({ ...prev, access_token: '' }));
      onToast('Integration settings saved', 'success');
    } catch {
      onToast('Failed to save integration settings', 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="p-12 flex justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <p className="text-sm text-gray-500">
          Store API credentials here instead of environment variables. Secrets are masked after saving — leave blank to keep the current value.
        </p>
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="px-4 py-2 bg-brand-600 text-white text-sm font-medium rounded-lg hover:bg-brand-700 disabled:opacity-50 shrink-0"
        >
          {saving ? 'Saving…' : 'Save All Integrations'}
        </button>
      </div>

      {/* WooCommerce */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">WooCommerce (3 stores)</h2>
          <p className="text-sm text-gray-500 mt-1">WooCommerce → Settings → Advanced → REST API → Add key (Read permission)</p>
        </div>
        <div className="divide-y divide-gray-100">
          {(['nestiee', 'honour', 'cupmoka'] as WooPlatformKey[]).map((platform) => (
            <div key={platform} className="px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">{WOO_PLATFORM_LABELS[platform]}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-500">Store URL</label>
                  <input
                    type="url"
                    value={woo[platform].url}
                    onChange={(e) => setWoo({ ...woo, [platform]: { ...woo[platform], url: e.target.value } })}
                    placeholder="https://nestiee.com.hk"
                    className={`${inputCls} mt-1`}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Consumer Key</label>
                  <input
                    type="password"
                    value={woo[platform].key}
                    onChange={(e) => setWoo({ ...woo, [platform]: { ...woo[platform], key: e.target.value } })}
                    placeholder={masked.woocommerce[platform].key_set ? masked.woocommerce[platform].key_hint : 'ck_…'}
                    className={`${inputCls} mt-1`}
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">Consumer Secret</label>
                  <input
                    type="password"
                    value={woo[platform].secret}
                    onChange={(e) => setWoo({ ...woo, [platform]: { ...woo[platform], secret: e.target.value } })}
                    placeholder={masked.woocommerce[platform].secret_set ? masked.woocommerce[platform].secret_hint : 'cs_…'}
                    className={`${inputCls} mt-1`}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* QuickBooks */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">QuickBooks Online</h2>
          <p className="text-sm text-gray-500 mt-1">
            From{' '}
            <a href="https://developer.intuit.com" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
              developer.intuit.com
            </a>{' '}
            → your app → Keys &amp; credentials. After saving, use <strong>Connect QuickBooks</strong> on the Order Hub page.
          </p>
        </div>
        <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Client ID</label>
            <input
              type="text"
              value={qb.client_id}
              onChange={(e) => setQb({ ...qb, client_id: e.target.value })}
              className={`${inputCls} mt-1`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Client Secret</label>
            <input
              type="password"
              value={qb.client_secret}
              onChange={(e) => setQb({ ...qb, client_secret: e.target.value })}
              placeholder={masked.quickbooks.client_secret_set ? masked.quickbooks.client_secret_hint : 'Enter client secret'}
              className={`${inputCls} mt-1`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Redirect URI</label>
            <input
              type="url"
              value={qb.redirect_uri}
              onChange={(e) => setQb({ ...qb, redirect_uri: e.target.value })}
              placeholder="https://yourdomain.com/api/integrations/quickbooks/callback"
              className={`${inputCls} mt-1`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Environment</label>
            <select
              value={qb.environment}
              onChange={(e) => setQb({ ...qb, environment: e.target.value as 'sandbox' | 'production' })}
              className={`${inputCls} mt-1`}
            >
              <option value="sandbox">Sandbox (testing)</option>
              <option value="production">Production (live)</option>
            </select>
          </div>
        </div>
      </section>

      {/* Yedpay */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Yedpay</h2>
          <p className="text-sm text-gray-500 mt-1">From Yedpay dashboard → API → Access Token and User ID</p>
        </div>
        <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500">User ID</label>
            <input
              type="text"
              value={yedpay.user_id}
              onChange={(e) => setYedpay({ ...yedpay, user_id: e.target.value })}
              className={`${inputCls} mt-1`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Access Token</label>
            <input
              type="password"
              value={yedpay.access_token}
              onChange={(e) => setYedpay({ ...yedpay, access_token: e.target.value })}
              placeholder={masked.yedpay.access_token_set ? masked.yedpay.access_token_hint : 'Bearer token'}
              className={`${inputCls} mt-1`}
            />
          </div>
        </div>
      </section>
    </div>
  );
}
