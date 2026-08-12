'use client';

import { useEffect, useState } from 'react';
import {
  RESEND_BRAND_LABELS,
  RESEND_UI_BRAND_KEYS,
  SF_EXPRESS_DEFAULT_PRINT_TEMPLATE,
  WOO_PLATFORM_LABELS,
  type IntegrationSettingsMasked,
  type ResendBrandKey,
  type WooPlatformKey,
} from '@/lib/integration-settings';
import { ORDER_TYPES } from '@/lib/orders';

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

type WooForm = Record<WooPlatformKey, { url: string; key: string; secret: string }>;
type ResendForm = Record<ResendBrandKey, { api_key: string; from_email: string; order_types: string[] }>;

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

  const applyMasked = (s: IntegrationSettingsMasked) => {
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
      setQb((prev) => ({ ...prev, client_secret: '' }));
      setYedpay((prev) => ({ ...prev, access_token: '' }));
      setSf((prev) => ({ ...prev, checkword: '' }));
      setResend((prev) => ({
        honour: { ...prev.honour, api_key: '' },
        nestiee: { ...prev.nestiee, api_key: '' },
        cupmoka: { ...prev.cupmoka, api_key: '' },
      }));
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
                  <p className="text-xs text-gray-400 mt-1">
                    Website address only — e.g. <code className="text-gray-500">https://nestiee.com.hk</code> (not an email).
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
