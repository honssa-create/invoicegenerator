'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  RESEND_BRAND_LABELS,
  RESEND_UI_BRAND_KEYS,
  SF_EXPRESS_DEFAULT_PRINT_TEMPLATE,
  WOO_PLATFORM_KEYS,
  WOO_PLATFORM_LABELS,
  type IntegrationSettingsMasked,
  type ResendBrandKey,
  type WooPlatformKey,
} from '@/lib/integration-settings';
import { ORDER_TYPES } from '@/lib/orders';
import { CLICKUP_PAYMENT_WEBHOOK_EVENTS } from '@/lib/payment-ledger';
import { useUnsavedChangesWarning } from '@/hooks/useUnsavedChangesWarning';

const inputCls =
  'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-brand-500 outline-none';

const EMPTY_WOO_MASKED = {
  url: '',
  key_set: false,
  key_hint: '',
  secret_set: false,
  secret_hint: '',
  webhook_secret_set: false,
  webhook_secret_hint: '',
};

const EMPTY_MASKED: IntegrationSettingsMasked = {
  woocommerce: {
    nestiee: { ...EMPTY_WOO_MASKED },
    honour: { ...EMPTY_WOO_MASKED },
    honour_en: { ...EMPTY_WOO_MASKED },
    cupmoka: { ...EMPTY_WOO_MASKED },
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
  clickup: {
    list_id: '',
    api_token_set: false,
    api_token_hint: '',
    webhook_secret_set: false,
    payment_list_id: '901812202272',
    webhook_url: '',
  },
  sf_express: {
    partner_id: '',
    partner_id_set: false,
    checkword_set: false,
    checkword_hint: '',
    monthly_card: '',
    environment: 'sandbox',
    express_type_id: '1',
    pay_method: '1',
    print_template_code: SF_EXPRESS_DEFAULT_PRINT_TEMPLATE,
    sender_company: '',
    sender_contact: '',
    sender_tel: '',
    sender_address: '',
  },
  resend: {
    honour: { from_email: '', api_key_set: false, api_key_hint: '', order_types: [] },
    nestiee: { from_email: '', api_key_set: false, api_key_hint: '', order_types: [] },
    cupmoka: { from_email: '', api_key_set: false, api_key_hint: '', order_types: [] },
  },
};

type WooForm = Record<WooPlatformKey, { url: string; key: string; secret: string; webhook_secret: string }>;
type ResendForm = Record<ResendBrandKey, { api_key: string; from_email: string; order_types: string[] }>;

function emptyWooForm(): WooForm {
  return {
    nestiee: { url: '', key: '', secret: '', webhook_secret: '' },
    honour: { url: '', key: '', secret: '', webhook_secret: '' },
    honour_en: { url: '', key: '', secret: '', webhook_secret: '' },
    cupmoka: { url: '', key: '', secret: '', webhook_secret: '' },
  };
}

function randomWebhookSecret(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '');
  }
  return Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16)).join('');
}

function wooWebhookUrl(platform: WooPlatformKey): string {
  if (typeof window === 'undefined') return '';
  return `${window.location.origin}/api/webhooks/woocommerce/${platform}`;
}

export default function IntegrationsSettingsPanel({
  onToast,
}: {
  onToast: (msg: string, kind: 'success' | 'error') => void;
}) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [masked, setMasked] = useState<IntegrationSettingsMasked>(EMPTY_MASKED);
  const [woo, setWoo] = useState<WooForm>(emptyWooForm());
  const [qb, setQb] = useState({
    client_id: '',
    client_secret: '',
    redirect_uri: '',
    environment: 'sandbox' as 'sandbox' | 'production',
  });
  const [yedpay, setYedpay] = useState({ user_id: '', access_token: '' });
  const [clickup, setClickup] = useState({ list_id: '', api_token: '' });
  const [sf, setSf] = useState({
    partner_id: '',
    checkword: '',
    monthly_card: '',
    environment: 'sandbox' as 'sandbox' | 'production',
    express_type_id: '1',
    pay_method: '1',
    print_template_code: SF_EXPRESS_DEFAULT_PRINT_TEMPLATE,
    sender_company: '',
    sender_contact: '',
    sender_tel: '',
    sender_address: '',
  });
  const [resend, setResend] = useState<ResendForm>({
    honour: { api_key: '', from_email: '', order_types: [] },
    nestiee: { api_key: '', from_email: '', order_types: [] },
    cupmoka: { api_key: '', from_email: '', order_types: [] },
  });
  const [copiedWebhook, setCopiedWebhook] = useState<WooPlatformKey | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState<string | null>(null);
  const [copied, setCopied] = useState('');

  useEffect(() => {
    if (loading) return;
    if (window.location.hash !== '#clickup') return;
    document.getElementById('clickup')?.scrollIntoView({ block: 'start' });
  }, [loading]);

  const copyValue = async (value: string, key: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied((current) => (current === key ? '' : current)), 2000);
    } catch {
      onToast('Could not copy', 'error');
    }
  };

  const currentSnapshot = useMemo(
    () => JSON.stringify({ woo, qb, yedpay, clickup, sf, resend }),
    [woo, qb, yedpay, clickup, sf, resend],
  );
  useUnsavedChangesWarning(savedSnapshot !== null && savedSnapshot !== currentSnapshot);

  const applyMasked = (s: IntegrationSettingsMasked) => {
    setMasked(s);
    setWoo({
      nestiee: { url: s.woocommerce.nestiee.url, key: '', secret: '', webhook_secret: '' },
      honour: { url: s.woocommerce.honour.url, key: '', secret: '', webhook_secret: '' },
      honour_en: { url: s.woocommerce.honour_en.url, key: '', secret: '', webhook_secret: '' },
      cupmoka: { url: s.woocommerce.cupmoka.url, key: '', secret: '', webhook_secret: '' },
    });
    setQb({
      client_id: s.quickbooks.client_id,
      client_secret: '',
      redirect_uri: s.quickbooks.redirect_uri,
      environment: s.quickbooks.environment,
    });
    setYedpay({ user_id: s.yedpay.user_id, access_token: '' });
    setClickup({ list_id: s.clickup.list_id, api_token: '' });
    setSf({
      partner_id: s.sf_express.partner_id,
      checkword: '',
      monthly_card: s.sf_express.monthly_card,
      environment: s.sf_express.environment,
      express_type_id: s.sf_express.express_type_id || '1',
      pay_method: s.sf_express.pay_method || '1',
      print_template_code: s.sf_express.print_template_code || SF_EXPRESS_DEFAULT_PRINT_TEMPLATE,
      sender_company: s.sf_express.sender_company,
      sender_contact: s.sf_express.sender_contact,
      sender_tel: s.sf_express.sender_tel,
      sender_address: s.sf_express.sender_address,
    });
    setResend({
      honour: { api_key: '', from_email: s.resend.honour.from_email, order_types: [...s.resend.honour.order_types] },
      nestiee: { api_key: '', from_email: s.resend.nestiee.from_email, order_types: [...s.resend.nestiee.order_types] },
      cupmoka: { api_key: '', from_email: s.resend.cupmoka.from_email, order_types: [...s.resend.cupmoka.order_types] },
    });
    setSavedSnapshot(
      JSON.stringify({
        woo: {
          nestiee: { url: s.woocommerce.nestiee.url, key: '', secret: '', webhook_secret: '' },
          honour: { url: s.woocommerce.honour.url, key: '', secret: '', webhook_secret: '' },
          honour_en: { url: s.woocommerce.honour_en.url, key: '', secret: '', webhook_secret: '' },
          cupmoka: { url: s.woocommerce.cupmoka.url, key: '', secret: '', webhook_secret: '' },
        },
        qb: {
          client_id: s.quickbooks.client_id,
          client_secret: '',
          redirect_uri: s.quickbooks.redirect_uri,
          environment: s.quickbooks.environment,
        },
        yedpay: { user_id: s.yedpay.user_id, access_token: '' },
        clickup: { list_id: s.clickup.list_id, api_token: '' },
        sf: {
          partner_id: s.sf_express.partner_id,
          checkword: '',
          monthly_card: s.sf_express.monthly_card,
          environment: s.sf_express.environment,
          express_type_id: s.sf_express.express_type_id || '1',
          pay_method: s.sf_express.pay_method || '1',
          print_template_code: s.sf_express.print_template_code || SF_EXPRESS_DEFAULT_PRINT_TEMPLATE,
          sender_company: s.sf_express.sender_company,
          sender_contact: s.sf_express.sender_contact,
          sender_tel: s.sf_express.sender_tel,
          sender_address: s.sf_express.sender_address,
        },
        resend: {
          honour: { api_key: '', from_email: s.resend.honour.from_email, order_types: [...s.resend.honour.order_types] },
          nestiee: { api_key: '', from_email: s.resend.nestiee.from_email, order_types: [...s.resend.nestiee.order_types] },
          cupmoka: { api_key: '', from_email: s.resend.cupmoka.from_email, order_types: [...s.resend.cupmoka.order_types] },
        },
      }),
    );
  };

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings/integrations');
      const data = await res.json();
      if (!res.ok) {
        onToast(data.error || 'Failed to load integration settings', 'error');
        return;
      }
      applyMasked(data.settings as IntegrationSettingsMasked);
    } catch {
      onToast('Failed to load integration settings', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const toggleResendOrderType = (brand: ResendBrandKey, orderType: string, checked: boolean) => {
    setResend((prev) => {
      const next: ResendForm = {
        honour: { ...prev.honour, order_types: [...prev.honour.order_types] },
        nestiee: { ...prev.nestiee, order_types: [...prev.nestiee.order_types] },
        cupmoka: { ...prev.cupmoka, order_types: [...prev.cupmoka.order_types] },
      };
      if (checked) {
        for (const b of Object.keys(next) as ResendBrandKey[]) {
          next[b].order_types = next[b].order_types.filter((t) => t !== orderType);
        }
        next[brand].order_types = [...next[brand].order_types, orderType];
      } else {
        next[brand].order_types = next[brand].order_types.filter((t) => t !== orderType);
      }
      return next;
    });
  };

  const copyWebhookUrl = async (platform: WooPlatformKey) => {
    const url = wooWebhookUrl(platform);
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedWebhook(platform);
      window.setTimeout(() => setCopiedWebhook(null), 2000);
      onToast('Webhook URL copied', 'success');
    } catch {
      onToast('Could not copy URL', 'error');
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        woocommerce: {
          nestiee: {
            url: woo.nestiee.url,
            ...(woo.nestiee.key ? { key: woo.nestiee.key } : {}),
            ...(woo.nestiee.secret ? { secret: woo.nestiee.secret } : {}),
            ...(woo.nestiee.webhook_secret ? { webhook_secret: woo.nestiee.webhook_secret } : {}),
          },
          honour: {
            url: woo.honour.url,
            ...(woo.honour.key ? { key: woo.honour.key } : {}),
            ...(woo.honour.secret ? { secret: woo.honour.secret } : {}),
            ...(woo.honour.webhook_secret ? { webhook_secret: woo.honour.webhook_secret } : {}),
          },
          honour_en: {
            url: woo.honour_en.url,
            ...(woo.honour_en.key ? { key: woo.honour_en.key } : {}),
            ...(woo.honour_en.secret ? { secret: woo.honour_en.secret } : {}),
            ...(woo.honour_en.webhook_secret ? { webhook_secret: woo.honour_en.webhook_secret } : {}),
          },
          cupmoka: {
            url: woo.cupmoka.url,
            ...(woo.cupmoka.key ? { key: woo.cupmoka.key } : {}),
            ...(woo.cupmoka.secret ? { secret: woo.cupmoka.secret } : {}),
            ...(woo.cupmoka.webhook_secret ? { webhook_secret: woo.cupmoka.webhook_secret } : {}),
          },
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
        clickup: {
          list_id: clickup.list_id,
          ...(clickup.api_token ? { api_token: clickup.api_token } : {}),
        },
        sf_express: {
          partner_id: sf.partner_id,
          monthly_card: sf.monthly_card,
          environment: sf.environment,
          express_type_id: sf.express_type_id,
          pay_method: sf.pay_method,
          print_template_code: sf.print_template_code,
          sender_company: sf.sender_company,
          sender_contact: sf.sender_contact,
          sender_tel: sf.sender_tel,
          sender_address: sf.sender_address,
          ...(sf.checkword ? { checkword: sf.checkword } : {}),
        },
        resend: {
          honour: {
            from_email: resend.honour.from_email,
            order_types: resend.honour.order_types,
            ...(resend.honour.api_key ? { api_key: resend.honour.api_key } : {}),
          },
          nestiee: {
            from_email: resend.nestiee.from_email,
            order_types: resend.nestiee.order_types,
            ...(resend.nestiee.api_key ? { api_key: resend.nestiee.api_key } : {}),
          },
          cupmoka: {
            from_email: resend.cupmoka.from_email,
            order_types: resend.cupmoka.order_types,
            ...(resend.cupmoka.api_key ? { api_key: resend.cupmoka.api_key } : {}),
          },
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
      applyMasked(data.settings);
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
          <h2 className="text-lg font-semibold text-gray-900">
            WooCommerce ({WOO_PLATFORM_KEYS.length} stores)
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            WooCommerce → Settings → Advanced → REST API → Add key (Read permission). For instant order sync, also add webhooks below.
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {WOO_PLATFORM_KEYS.map((platform) => (
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
                  <p className="text-xs text-gray-400 mt-1">
                    Store root — e.g. <code className="text-gray-500">https://nestiee.com.hk</code> or{' '}
                    <code className="text-gray-500">https://honour.com.hk/en</code> for a subdirectory site (not an email).
                  </p>
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
                <div className="md:col-span-2 border-t border-gray-100 pt-3 mt-1">
                  <p className="text-xs font-semibold text-gray-700 mb-2">Instant sync webhook 即時同步</p>
                  <p className="text-xs text-gray-500 mb-3 leading-relaxed">
                    In WooCommerce → Settings → Advanced → Webhooks, create <strong>two</strong> webhooks (Order created + Order updated).
                    Paste the delivery URL and secret below — they must match exactly.
                  </p>
                  <label className="text-xs font-medium text-gray-500">Webhook delivery URL</label>
                  <div className="mt-1 flex gap-2">
                    <input
                      type="text"
                      readOnly
                      value={wooWebhookUrl(platform)}
                      className={`${inputCls} font-mono text-xs bg-gray-50`}
                    />
                    <button
                      type="button"
                      onClick={() => copyWebhookUrl(platform)}
                      className="shrink-0 px-3 py-2 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
                    >
                      {copiedWebhook === platform ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  <div className="mt-3">
                    <label className="text-xs font-medium text-gray-500">Webhook Secret</label>
                    <div className="mt-1 flex gap-2">
                      <input
                        type="password"
                        value={woo[platform].webhook_secret}
                        onChange={(e) =>
                          setWoo({ ...woo, [platform]: { ...woo[platform], webhook_secret: e.target.value } })
                        }
                        placeholder={
                          masked.woocommerce[platform].webhook_secret_set
                            ? masked.woocommerce[platform].webhook_secret_hint
                            : 'Same secret in Woo webhook settings'
                        }
                        className={`${inputCls} flex-1`}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setWoo({
                            ...woo,
                            [platform]: { ...woo[platform], webhook_secret: randomWebhookSecret() },
                          })
                        }
                        className="shrink-0 px-3 py-2 text-xs font-medium border border-gray-300 rounded-lg hover:bg-gray-50"
                      >
                        Generate
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 mt-1">
                      Woo topics: <span className="font-mono">Order created</span> +{' '}
                      <span className="font-mono">Order updated</span>. Save here, then paste the same secret into both Woo webhooks.
                    </p>
                  </div>
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
            {qb.environment === 'sandbox' ? (
              <p className="text-xs text-amber-700 mt-1">
                Sandbox imports Intuit&apos;s demo company with sample invoices — switch to Production for your real QuickBooks data, then reconnect OAuth.
              </p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">
                Use Production keys from the Intuit Developer portal and reconnect QuickBooks after switching.
              </p>
            )}
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

      {/* ClickUp */}
      <ClickUpIntegrationSection
        clickup={clickup}
        setClickup={setClickup}
        masked={masked}
        copied={copied}
        onCopy={copyValue}
        inputCls={inputCls}
      />

      {/* SF Express */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">SF Express 順豐</h2>
          <p className="text-sm text-gray-500 mt-1">
            From{' '}
            <a href="https://qiao.sf-express.com" target="_blank" rel="noopener noreferrer" className="text-brand-600 hover:underline">
              豐橋 / SF Open Platform
            </a>{' '}
            — partner ID, checkword, monthly card, and sender printed on HK local labels.
          </p>
        </div>
        <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="text-xs font-medium text-gray-500">Partner ID 顧客編碼</label>
            <input
              type="text"
              value={sf.partner_id}
              onChange={(e) => setSf({ ...sf, partner_id: e.target.value })}
              className={`${inputCls} mt-1`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Checkword 校驗碼</label>
            <input
              type="password"
              value={sf.checkword}
              onChange={(e) => setSf({ ...sf, checkword: e.target.value })}
              placeholder={masked.sf_express.checkword_set ? masked.sf_express.checkword_hint : 'Sandbox or prod checkword'}
              className={`${inputCls} mt-1`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Monthly Card 月結卡號</label>
            <input
              type="text"
              value={sf.monthly_card}
              onChange={(e) => setSf({ ...sf, monthly_card: e.target.value })}
              className={`${inputCls} mt-1`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Environment</label>
            <select
              value={sf.environment}
              onChange={(e) => setSf({ ...sf, environment: e.target.value as 'sandbox' | 'production' })}
              className={`${inputCls} mt-1`}
            >
              <option value="sandbox">Sandbox (testing)</option>
              <option value="production">Production (live)</option>
            </select>
            {sf.environment === 'sandbox' ? (
              <p className="text-xs text-amber-700 mt-1">Uses sandbox API — no real courier pickup. Match sandbox checkword.</p>
            ) : (
              <p className="text-xs text-gray-400 mt-1">Live shipments — use production checkword and monthly card.</p>
            )}
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Express Type ID (1 順豐特快 / 2 順豐標快 / 6 順豐即日)</label>
            <input
              type="text"
              value={sf.express_type_id}
              onChange={(e) => setSf({ ...sf, express_type_id: e.target.value })}
              placeholder="1"
              className={`${inputCls} mt-1`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Pay Method (1 寄方付 / 2 收方付 / 3 第三方)</label>
            <input
              type="text"
              value={sf.pay_method}
              onChange={(e) => setSf({ ...sf, pay_method: e.target.value })}
              placeholder="1"
              className={`${inputCls} mt-1`}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-500">Cloud Print Template Code</label>
            <input
              type="text"
              value={sf.print_template_code}
              onChange={(e) => setSf({ ...sf, print_template_code: e.target.value })}
              placeholder={SF_EXPRESS_DEFAULT_PRINT_TEMPLATE}
              className={`${inputCls} mt-1`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Sender Company</label>
            <input
              type="text"
              value={sf.sender_company}
              onChange={(e) => setSf({ ...sf, sender_company: e.target.value })}
              className={`${inputCls} mt-1`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Sender Contact</label>
            <input
              type="text"
              value={sf.sender_contact}
              onChange={(e) => setSf({ ...sf, sender_contact: e.target.value })}
              className={`${inputCls} mt-1`}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-gray-500">Sender Phone</label>
            <input
              type="text"
              value={sf.sender_tel}
              onChange={(e) => setSf({ ...sf, sender_tel: e.target.value })}
              className={`${inputCls} mt-1`}
            />
          </div>
          <div className="md:col-span-2">
            <label className="text-xs font-medium text-gray-500">Sender Address</label>
            <textarea
              value={sf.sender_address}
              onChange={(e) => setSf({ ...sf, sender_address: e.target.value })}
              rows={2}
              className={`${inputCls} mt-1`}
            />
          </div>
        </div>
      </section>

      {/* Resend */}
      <section className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
          <h2 className="text-lg font-semibold text-gray-900">Resend (email)</h2>
          <p className="text-sm text-gray-500 mt-1">
            One Resend account per brand. Assign which order types send from each account. Order types with no
            account or API key will not send email.
          </p>
        </div>
        <div className="divide-y divide-gray-100">
          {RESEND_UI_BRAND_KEYS.map((brand) => (
            <div key={brand} className="px-5 py-4">
              <h3 className="text-sm font-semibold text-gray-800 mb-3">{RESEND_BRAND_LABELS[brand]}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-500">API Key</label>
                  <input
                    type="password"
                    value={resend[brand].api_key}
                    onChange={(e) =>
                      setResend({ ...resend, [brand]: { ...resend[brand], api_key: e.target.value } })
                    }
                    placeholder={
                      masked.resend[brand].api_key_set ? masked.resend[brand].api_key_hint : 're_…'
                    }
                    className={`${inputCls} mt-1`}
                    autoComplete="off"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-500">From email</label>
                  <input
                    type="text"
                    value={resend[brand].from_email}
                    onChange={(e) =>
                      setResend({ ...resend, [brand]: { ...resend[brand], from_email: e.target.value } })
                    }
                    placeholder={`${RESEND_BRAND_LABELS[brand]} <billing@example.com>`}
                    className={`${inputCls} mt-1`}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="text-xs font-medium text-gray-500">Order types using this account</label>
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-2">
                    {ORDER_TYPES.map((ot) => {
                      const checked = resend[brand].order_types.includes(ot);
                      return (
                        <label key={ot} className="inline-flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => toggleResendOrderType(brand, ot, e.target.checked)}
                            className="rounded border-gray-300 text-brand-600 focus:ring-brand-500"
                          />
                          {ot}
                        </label>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
        <div className="px-5 py-3 bg-gray-50 border-t border-gray-100 text-xs text-gray-500">
          Until an order type is assigned here and has an API key, related reminder emails are skipped.
        </div>
      </section>
    </div>
  );
}

function StatusPill({ ok, children }: { ok: boolean; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
        ok ? 'bg-green-100 text-green-800' : 'bg-amber-100 text-amber-900'
      }`}
    >
      {children}
    </span>
  );
}

function ClickUpIntegrationSection({
  clickup,
  setClickup,
  masked,
  copied,
  onCopy,
  inputCls,
}: {
  clickup: { list_id: string; api_token: string };
  setClickup: (next: { list_id: string; api_token: string }) => void;
  masked: IntegrationSettingsMasked;
  copied: string;
  onCopy: (value: string, key: string) => void;
  inputCls: string;
}) {
  const paymentListId = masked.clickup.payment_list_id || '901812202272';
  const webhookUrl = masked.clickup.webhook_url || '/api/webhooks/clickup';
  const createBody = JSON.stringify(
    {
      endpoint: webhookUrl,
      events: [...CLICKUP_PAYMENT_WEBHOOK_EVENTS],
      list_id: Number(paymentListId) || paymentListId,
    },
    null,
    2,
  );
  const curl = `curl -X POST "https://api.clickup.com/api/v2/team/TEAM_ID/webhook" \\\n  -H "Authorization: YOUR_CLICKUP_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  -d '${createBody}'`;

  return (
    <section id="clickup" className="bg-white border border-gray-200 rounded-xl overflow-hidden scroll-mt-24">
      <div className="px-5 py-4 border-b border-gray-100 bg-gray-50">
        <h2 className="text-lg font-semibold text-gray-900">ClickUp</h2>
        <p className="text-sm text-gray-500 mt-1">
          One personal API token feeds Order Hub task import and 入帳紀錄. The payment webhook is registered with the
          ClickUp API. ClickUp has an Apps screen for the token, and no product screen for this webhook.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <StatusPill ok={masked.clickup.api_token_set}>
            API token {masked.clickup.api_token_set ? `set ${masked.clickup.api_token_hint}` : 'not set'}
          </StatusPill>
          <StatusPill ok={masked.clickup.webhook_secret_set}>
            CLICKUP_WEBHOOK_SECRET {masked.clickup.webhook_secret_set ? 'set' : 'not set'}
          </StatusPill>
          <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
            入帳紀錄 list {paymentListId}
            {paymentListId === '901812202272' ? ' · Nestiee 婚宴回禮' : ''}
          </span>
        </div>
      </div>
      <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        <div>
          <label className="text-xs font-medium text-gray-500">Order Hub list ID</label>
          <input
            type="text"
            value={clickup.list_id}
            onChange={(e) => setClickup({ ...clickup, list_id: e.target.value })}
            placeholder="List imported by Hub"
            className={`${inputCls} mt-1`}
          />
          <p className="text-xs text-gray-500 mt-1">
            Number after <code className="text-xs bg-gray-100 px-1 rounded">/li/</code> in the Hub list link. This is
            the Order Hub import list. 入帳紀錄 uses {paymentListId} (override with{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">CLICKUP_PAYMENT_LIST_ID</code>).
          </p>
        </div>
        <div>
          <label className="text-xs font-medium text-gray-500">API Token</label>
          <input
            type="password"
            value={clickup.api_token}
            onChange={(e) => setClickup({ ...clickup, api_token: e.target.value })}
            placeholder={masked.clickup.api_token_set ? masked.clickup.api_token_hint : 'pk_…'}
            className={`${inputCls} mt-1`}
          />
          <p className="text-xs text-gray-500 mt-1">
            ClickUp → avatar → Settings → Apps → API Token. Leave blank when saving to keep the current token. Env
            fallback: <code className="text-xs bg-gray-100 px-1 rounded">CLICKUP_API_TOKEN</code>.
          </p>
        </div>
      </div>
      <div className="px-5 pb-4 space-y-3">
        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-gray-500">Payment ledger webhook URL</label>
            <button
              type="button"
              onClick={() => onCopy(webhookUrl, 'url')}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              {copied === 'url' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <code className="mt-1 block break-all rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800">
            {webhookUrl}
          </code>
          <p className="text-xs text-gray-500 mt-1">
            Uses <code className="text-xs bg-gray-100 px-1 rounded">APP_URL</code> when that env var is set, so
            production shows the public Railway origin.
          </p>
        </div>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-gray-700">
          <li>
            Create or copy the API token in ClickUp (Apps → API Token) and save it here. Order Hub and the 入帳紀錄
            cron both use it. Hub import still does not read comments.
          </li>
          <li>
            Workspace id: <code className="text-xs bg-gray-100 px-1 rounded">GET https://api.clickup.com/api/v2/team</code>{' '}
            with header <code className="text-xs bg-gray-100 px-1 rounded">Authorization: &lt;token&gt;</code>. Use{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">teams[0].id</code> as <code className="text-xs bg-gray-100 px-1 rounded">TEAM_ID</code>.
          </li>
          <li>
            Create the webhook with the API. Scope it to list <strong>{paymentListId}</strong>. Events:{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">taskCommentPosted</code>,{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">taskCommentUpdated</code>,{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">taskUpdated</code>.
          </li>
          <li>
            Copy <code className="text-xs bg-gray-100 px-1 rounded">webhook.secret</code> from the create response into
            the app env var <code className="text-xs bg-gray-100 px-1 rounded">CLICKUP_WEBHOOK_SECRET</code>, then
            redeploy. The value stays out of this screen and out of git. Until it is set,{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">POST /api/webhooks/clickup</code> returns 503 and ClickUp
            marks the webhook unhealthy.
          </li>
          <li>
            A comment or a payment custom field edit (第一次／第二次 Payment date and amount, Payment, Order #) on that
            list refetches the task and upserts 入帳紀錄. Other field edits are acknowledged and skipped. The 15-minute
            cron still backfills anything the webhook misses.
          </li>
        </ol>
        <div>
          <div className="flex items-center justify-between gap-2">
            <label className="text-xs font-medium text-gray-500">Create Webhook request</label>
            <button
              type="button"
              onClick={() => onCopy(curl, 'curl')}
              className="text-xs font-medium text-brand-700 hover:underline"
            >
              {copied === 'curl' ? 'Copied' : 'Copy'}
            </button>
          </div>
          <pre className="mt-1 overflow-x-auto rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-800 whitespace-pre-wrap">
            {curl}
          </pre>
          <p className="text-xs text-gray-500 mt-1">
            Replace <code className="text-xs bg-gray-100 px-1 rounded">TEAM_ID</code> and{' '}
            <code className="text-xs bg-gray-100 px-1 rounded">YOUR_CLICKUP_TOKEN</code>. ClickUp Automations → Call
            webhook sends a different body, so this endpoint rejects it. Use the Create Webhook API above.
          </p>
        </div>
      </div>
    </section>
  );
}
