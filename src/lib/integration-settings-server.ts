import db from './db';
import {
  DEFAULT_RESEND_ORDER_TYPES,
  EMPTY_INTEGRATION_SETTINGS,
  RESEND_BRAND_KEYS,
  SF_EXPRESS_DEFAULT_PRINT_TEMPLATE,
  WOO_PLATFORM_KEYS,
  normalizeResendOrderTypes,
  type IntegrationSettings,
  type IntegrationSettingsMasked,
  type QuickBooksSettings,
  type ResendBrandKey,
  type ResendBrandSettings,
  type SfExpressSettings,
  type WooPlatformKey,
  type WooStoreSettings,
  type YedpaySettings,
  type ClickUpSettings,
} from './integration-settings';
import { normalizeWooStoreUrl } from './woo-url';

function maskSecret(value: string | undefined): { set: boolean; hint: string } {
  if (!value?.trim()) return { set: false, hint: '' };
  const v = value.trim();
  return { set: true, hint: v.length <= 4 ? '••••' : `••••${v.slice(-4)}` };
}

function parseResendBrand(
  brand: ResendBrandKey,
  raw: Partial<ResendBrandSettings> | undefined,
): ResendBrandSettings {
  const empty = EMPTY_INTEGRATION_SETTINGS.resend[brand];
  const hasOrderTypes = raw != null && Array.isArray(raw.order_types);
  return {
    api_key: typeof raw?.api_key === 'string' ? raw.api_key : empty.api_key,
    from_email: typeof raw?.from_email === 'string' ? raw.from_email : empty.from_email,
    order_types: hasOrderTypes
      ? normalizeResendOrderTypes(raw!.order_types)
      : [...DEFAULT_RESEND_ORDER_TYPES[brand]],
  };
}

function parseSettings(json: string | null | undefined): IntegrationSettings {
  if (!json) return structuredClone(EMPTY_INTEGRATION_SETTINGS);
  try {
    const parsed = JSON.parse(json) as Partial<IntegrationSettings>;
    return {
      woocommerce: {
        nestiee: { ...EMPTY_INTEGRATION_SETTINGS.woocommerce.nestiee, ...parsed.woocommerce?.nestiee },
        honour: { ...EMPTY_INTEGRATION_SETTINGS.woocommerce.honour, ...parsed.woocommerce?.honour },
        honour_en: { ...EMPTY_INTEGRATION_SETTINGS.woocommerce.honour_en, ...parsed.woocommerce?.honour_en },
        cupmoka: { ...EMPTY_INTEGRATION_SETTINGS.woocommerce.cupmoka, ...parsed.woocommerce?.cupmoka },
      },
      quickbooks: { ...EMPTY_INTEGRATION_SETTINGS.quickbooks, ...parsed.quickbooks },
      yedpay: { ...EMPTY_INTEGRATION_SETTINGS.yedpay, ...parsed.yedpay },
      clickup: { ...EMPTY_INTEGRATION_SETTINGS.clickup, ...parsed.clickup },
      sf_express: {
        ...EMPTY_INTEGRATION_SETTINGS.sf_express,
        ...parsed.sf_express,
        print_template_code:
          parsed.sf_express?.print_template_code?.trim() ||
          EMPTY_INTEGRATION_SETTINGS.sf_express.print_template_code,
      },
      resend: {
        honour: parseResendBrand('honour', parsed.resend?.honour),
        nestiee: parseResendBrand('nestiee', parsed.resend?.nestiee),
        cupmoka: parseResendBrand('cupmoka', parsed.resend?.cupmoka),
      },
    };
  } catch {
    return structuredClone(EMPTY_INTEGRATION_SETTINGS);
  }
}

export async function getIntegrationSettings(userId: number): Promise<IntegrationSettings> {
  const row = await db
    .prepare('SELECT settings_json FROM integration_settings WHERE user_id = ?')
    .get(userId) as { settings_json: string } | undefined;
  const dbSettings = parseSettings(row?.settings_json);

  return mergeWithEnvDefaults(dbSettings);
}

function envWoo(platform: WooPlatformKey): WooStoreSettings {
  const envMap: Record<WooPlatformKey, string> = {
    nestiee: 'NESTIEE',
    honour: 'HONOUR',
    honour_en: 'HONOUR_EN',
    cupmoka: 'CUPMOKA',
  };
  const key = envMap[platform];
  return {
    url: process.env[`WOOCOMMERCE_${key}_URL`]?.trim() || '',
    key: process.env[`WOOCOMMERCE_${key}_KEY`]?.trim() || '',
    secret: process.env[`WOOCOMMERCE_${key}_SECRET`]?.trim() || '',
  };
}

function envSfExpress(): SfExpressSettings {
  const env = process.env.SF_ENVIRONMENT?.trim().toLowerCase();
  return {
    partner_id: process.env.SF_PARTNER_ID?.trim() || '',
    checkword: process.env.SF_CHECKWORD?.trim() || '',
    monthly_card: process.env.SF_MONTHLY_CARD?.trim() || '',
    environment: env === 'production' ? 'production' : 'sandbox',
    express_type_id: process.env.SF_EXPRESS_TYPE_ID?.trim() || '1',
    pay_method: process.env.SF_PAY_METHOD?.trim() || '1',
    print_template_code:
      process.env.SF_PRINT_TEMPLATE_CODE?.trim() || SF_EXPRESS_DEFAULT_PRINT_TEMPLATE,
    sender_company: process.env.SF_SENDER_COMPANY?.trim() || '',
    sender_contact: process.env.SF_SENDER_CONTACT?.trim() || '',
    sender_tel: process.env.SF_SENDER_TEL?.trim() || '',
    sender_address: process.env.SF_SENDER_ADDRESS?.trim() || '',
  };
}

function envResendBrand(brand: ResendBrandKey): Pick<ResendBrandSettings, 'api_key' | 'from_email'> {
  const envKey = brand.toUpperCase();
  return {
    api_key: process.env[`RESEND_API_KEY_${envKey}`]?.trim() || '',
    from_email: process.env[`RESEND_FROM_EMAIL_${envKey}`]?.trim() || '',
  };
}

function mergeWithEnvDefaults(settings: IntegrationSettings): IntegrationSettings {
  const pick = (dbVal: string, envVal: string) => dbVal.trim() || envVal.trim();
  const pickWoo = (db: WooStoreSettings, platform: WooPlatformKey): WooStoreSettings => {
    const env = envWoo(platform);
    const url = pick(db.url, env.url);
    const normalized = url ? normalizeWooStoreUrl(url) : { ok: false as const, error: '' };
    return {
      url: normalized.ok ? normalized.url : url,
      key: pick(db.key, env.key),
      secret: pick(db.secret, env.secret),
    };
  };

  const envSf = envSfExpress();
  const sf = settings.sf_express;

  const legacyKey = process.env.RESEND_API_KEY?.trim() || '';
  const legacyFrom = process.env.REMINDER_FROM_EMAIL?.trim() || '';

  const mergeResend = (brand: ResendBrandKey): ResendBrandSettings => {
    const db = settings.resend[brand];
    const env = envResendBrand(brand);
    let api_key = pick(db.api_key, env.api_key);
    let from_email = pick(db.from_email, env.from_email);
    // Legacy env fills honour only when still empty.
    if (brand === 'honour') {
      api_key = pick(api_key, legacyKey);
      from_email = pick(from_email, legacyFrom);
    }
    return {
      api_key,
      from_email,
      order_types: [...db.order_types],
    };
  };

  return {
    woocommerce: {
      nestiee: pickWoo(settings.woocommerce.nestiee, 'nestiee'),
      honour: pickWoo(settings.woocommerce.honour, 'honour'),
      honour_en: pickWoo(settings.woocommerce.honour_en, 'honour_en'),
      cupmoka: pickWoo(settings.woocommerce.cupmoka, 'cupmoka'),
    },
    quickbooks: {
      client_id: pick(settings.quickbooks.client_id, process.env.QUICKBOOKS_CLIENT_ID || ''),
      client_secret: pick(settings.quickbooks.client_secret, process.env.QUICKBOOKS_CLIENT_SECRET || ''),
      redirect_uri: pick(settings.quickbooks.redirect_uri, process.env.QUICKBOOKS_REDIRECT_URI || ''),
      environment:
        settings.quickbooks.environment ||
        (process.env.QUICKBOOKS_ENVIRONMENT === 'production' ? 'production' : 'sandbox'),
    },
    yedpay: {
      access_token: pick(settings.yedpay.access_token, process.env.YEDPAY_ACCESS_TOKEN || ''),
      user_id: pick(settings.yedpay.user_id, process.env.YEDPAY_USER_ID || ''),
    },
    clickup: {
      api_token: pick(settings.clickup.api_token, process.env.CLICKUP_API_TOKEN || ''),
      list_id: pick(settings.clickup.list_id, process.env.CLICKUP_LIST_ID || ''),
    },
    sf_express: {
      partner_id: pick(sf.partner_id, envSf.partner_id),
      checkword: pick(sf.checkword, envSf.checkword),
      monthly_card: pick(sf.monthly_card, envSf.monthly_card),
      environment: sf.environment || envSf.environment,
      express_type_id: pick(sf.express_type_id, envSf.express_type_id) || '1',
      pay_method: pick(sf.pay_method, envSf.pay_method) || '1',
      print_template_code:
        pick(sf.print_template_code, envSf.print_template_code) || SF_EXPRESS_DEFAULT_PRINT_TEMPLATE,
      sender_company: pick(sf.sender_company, envSf.sender_company),
      sender_contact: pick(sf.sender_contact, envSf.sender_contact),
      sender_tel: pick(sf.sender_tel, envSf.sender_tel),
      sender_address: pick(sf.sender_address, envSf.sender_address),
    },
    resend: {
      honour: mergeResend('honour'),
      nestiee: mergeResend('nestiee'),
      cupmoka: mergeResend('cupmoka'),
    },
  };
}

/** Raw DB settings only (for saving merges, without env overlay). */
async function getRawIntegrationSettings(userId: number): Promise<IntegrationSettings> {
  const row = await db
    .prepare('SELECT settings_json FROM integration_settings WHERE user_id = ?')
    .get(userId) as { settings_json: string } | undefined;
  return parseSettings(row?.settings_json);
}

export async function getIntegrationSettingsMasked(userId: number): Promise<IntegrationSettingsMasked> {
  const s = await getIntegrationSettings(userId);
  const maskWoo = (store: WooStoreSettings) => {
    const key = maskSecret(store.key);
    const secret = maskSecret(store.secret);
    return {
      url: store.url,
      key_set: key.set,
      key_hint: key.hint,
      secret_set: secret.set,
      secret_hint: secret.hint,
    };
  };

  const qbSecret = maskSecret(s.quickbooks.client_secret);
  const yedToken = maskSecret(s.yedpay.access_token);
  const clickupToken = maskSecret(s.clickup.api_token);
  const sfCheck = maskSecret(s.sf_express.checkword);

  const maskResend = (brand: ResendBrandKey) => {
    const r = s.resend[brand];
    const key = maskSecret(r.api_key);
    return {
      from_email: r.from_email,
      api_key_set: key.set,
      api_key_hint: key.hint,
      order_types: r.order_types,
    };
  };

  return {
    woocommerce: {
      nestiee: maskWoo(s.woocommerce.nestiee),
      honour: maskWoo(s.woocommerce.honour),
      honour_en: maskWoo(s.woocommerce.honour_en),
      cupmoka: maskWoo(s.woocommerce.cupmoka),
    },
    quickbooks: {
      client_id: s.quickbooks.client_id,
      client_id_set: Boolean(s.quickbooks.client_id.trim()),
      client_secret_set: qbSecret.set,
      client_secret_hint: qbSecret.hint,
      redirect_uri: s.quickbooks.redirect_uri,
      environment: s.quickbooks.environment,
    },
    yedpay: {
      user_id: s.yedpay.user_id,
      access_token_set: yedToken.set,
      access_token_hint: yedToken.hint,
    },
    clickup: {
      list_id: s.clickup.list_id,
      api_token_set: clickupToken.set,
      api_token_hint: clickupToken.hint,
    },
    sf_express: {
      partner_id: s.sf_express.partner_id,
      partner_id_set: Boolean(s.sf_express.partner_id.trim()),
      checkword_set: sfCheck.set,
      checkword_hint: sfCheck.hint,
      monthly_card: s.sf_express.monthly_card,
      environment: s.sf_express.environment,
      express_type_id: s.sf_express.express_type_id,
      pay_method: s.sf_express.pay_method,
      print_template_code: s.sf_express.print_template_code || SF_EXPRESS_DEFAULT_PRINT_TEMPLATE,
      sender_company: s.sf_express.sender_company,
      sender_contact: s.sf_express.sender_contact,
      sender_tel: s.sf_express.sender_tel,
      sender_address: s.sf_express.sender_address,
    },
    resend: {
      honour: maskResend('honour'),
      nestiee: maskResend('nestiee'),
      cupmoka: maskResend('cupmoka'),
    },
  };
}

export type IntegrationSettingsUpdate = {
  woocommerce?: Partial<Record<WooPlatformKey, Partial<WooStoreSettings>>>;
  quickbooks?: Partial<QuickBooksSettings>;
  yedpay?: Partial<YedpaySettings>;
  clickup?: Partial<ClickUpSettings>;
  sf_express?: Partial<SfExpressSettings>;
  resend?: Partial<Record<ResendBrandKey, Partial<ResendBrandSettings>>>;
};

function keepOrReplace(current: string, incoming: string | undefined | null, clearIfEmpty = false): string {
  if (incoming === undefined || incoming === null) return current;
  const trimmed = incoming.trim();
  if (!trimmed && clearIfEmpty) return '';
  if (!trimmed) return current;
  return trimmed;
}

/**
 * After patching brands, strip order types claimed by a patched brand from other brands
 * so each order type maps to at most one Resend account.
 */
function dedupeResendOrderTypes(
  resend: Record<ResendBrandKey, ResendBrandSettings>,
  patchedBrands: ResendBrandKey[],
): void {
  const claimed = new Set<string>();
  for (const brand of patchedBrands) {
    for (const t of resend[brand].order_types) claimed.add(t);
  }
  for (const brand of RESEND_BRAND_KEYS) {
    if (patchedBrands.includes(brand)) continue;
    resend[brand] = {
      ...resend[brand],
      order_types: resend[brand].order_types.filter((t) => !claimed.has(t)),
    };
  }
  // Also dedupe among patched brands: later brands in RESEND_BRAND_KEYS lose overlaps
  // except the patching order — prefer first occurrence in honour → nestiee → cupmoka
  // after applying patches (patched lists already set). Walk reverse and strip earlier claims.
  const seen = new Set<string>();
  for (const brand of RESEND_BRAND_KEYS) {
    const kept: string[] = [];
    for (const t of resend[brand].order_types) {
      if (seen.has(t)) continue;
      seen.add(t);
      kept.push(t);
    }
    resend[brand] = { ...resend[brand], order_types: kept };
  }
}

export async function saveIntegrationSettings(userId: number, update: IntegrationSettingsUpdate): Promise<IntegrationSettings> {
  const current = await getRawIntegrationSettings(userId);

  const next: IntegrationSettings = {
    woocommerce: { ...current.woocommerce },
    quickbooks: { ...current.quickbooks },
    yedpay: { ...current.yedpay },
    clickup: { ...current.clickup },
    sf_express: { ...current.sf_express },
    resend: {
      honour: { ...current.resend.honour, order_types: [...current.resend.honour.order_types] },
      nestiee: { ...current.resend.nestiee, order_types: [...current.resend.nestiee.order_types] },
      cupmoka: { ...current.resend.cupmoka, order_types: [...current.resend.cupmoka.order_types] },
    },
  };

  if (update.woocommerce) {
    for (const platform of WOO_PLATFORM_KEYS) {
      const patch = update.woocommerce[platform];
      if (!patch) continue;
      let url = keepOrReplace(current.woocommerce[platform].url, patch.url, true);
      if (url) {
        const normalized = normalizeWooStoreUrl(url);
        if (!normalized.ok) {
          throw new Error(`${platform}: ${normalized.error}`);
        }
        url = normalized.url;
      }
      next.woocommerce[platform] = {
        url,
        key: keepOrReplace(current.woocommerce[platform].key, patch.key),
        secret: keepOrReplace(current.woocommerce[platform].secret, patch.secret),
      };
    }
  }

  if (update.quickbooks) {
    next.quickbooks = {
      client_id: keepOrReplace(current.quickbooks.client_id, update.quickbooks.client_id, true),
      client_secret: keepOrReplace(current.quickbooks.client_secret, update.quickbooks.client_secret),
      redirect_uri: keepOrReplace(current.quickbooks.redirect_uri, update.quickbooks.redirect_uri, true),
      environment: update.quickbooks.environment || current.quickbooks.environment || 'sandbox',
    };
  }

  if (update.yedpay) {
    next.yedpay = {
      user_id: keepOrReplace(current.yedpay.user_id, update.yedpay.user_id, true),
      access_token: keepOrReplace(current.yedpay.access_token, update.yedpay.access_token),
    };
  }

  if (update.clickup) {
    next.clickup = {
      list_id: keepOrReplace(current.clickup.list_id, update.clickup.list_id, true),
      api_token: keepOrReplace(current.clickup.api_token, update.clickup.api_token),
    };
  }

  if (update.sf_express) {
    const patch = update.sf_express;
    const env =
      patch.environment === 'production' || patch.environment === 'sandbox'
        ? patch.environment
        : current.sf_express.environment || 'sandbox';
    next.sf_express = {
      partner_id: keepOrReplace(current.sf_express.partner_id, patch.partner_id, true),
      checkword: keepOrReplace(current.sf_express.checkword, patch.checkword),
      monthly_card: keepOrReplace(current.sf_express.monthly_card, patch.monthly_card, true),
      environment: env,
      express_type_id:
        keepOrReplace(current.sf_express.express_type_id, patch.express_type_id, true) || '1',
      pay_method: keepOrReplace(current.sf_express.pay_method, patch.pay_method, true) || '1',
      print_template_code:
        keepOrReplace(current.sf_express.print_template_code, patch.print_template_code, true) ||
        SF_EXPRESS_DEFAULT_PRINT_TEMPLATE,
      sender_company: keepOrReplace(current.sf_express.sender_company, patch.sender_company, true),
      sender_contact: keepOrReplace(current.sf_express.sender_contact, patch.sender_contact, true),
      sender_tel: keepOrReplace(current.sf_express.sender_tel, patch.sender_tel, true),
      sender_address: keepOrReplace(current.sf_express.sender_address, patch.sender_address, true),
    };
  }

  if (update.resend) {
    const patchedBrands: ResendBrandKey[] = [];
    for (const brand of RESEND_BRAND_KEYS) {
      const patch = update.resend[brand];
      if (!patch) continue;
      patchedBrands.push(brand);
      next.resend[brand] = {
        api_key: keepOrReplace(current.resend[brand].api_key, patch.api_key),
        from_email: keepOrReplace(current.resend[brand].from_email, patch.from_email, true),
        order_types:
          patch.order_types !== undefined
            ? normalizeResendOrderTypes(patch.order_types)
            : [...current.resend[brand].order_types],
      };
    }
    if (patchedBrands.length) {
      dedupeResendOrderTypes(next.resend, patchedBrands);
    }
  }

  await db.prepare(
    `INSERT INTO integration_settings (user_id, settings_json, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = datetime('now')`
  ).run(userId, JSON.stringify(next));

  return await getIntegrationSettings(userId);
}

export async function getQuickBooksCredentials(userId: number): Promise<QuickBooksSettings> {
  return (await getIntegrationSettings(userId)).quickbooks;
}

export async function getYedpayCredentials(userId: number): Promise<YedpaySettings> {
  return (await getIntegrationSettings(userId)).yedpay;
}

export async function getClickUpCredentials(userId: number): Promise<ClickUpSettings> {
  return (await getIntegrationSettings(userId)).clickup;
}

export async function clickupConfigured(userId: number): Promise<boolean> {
  const c = await getClickUpCredentials(userId);
  return Boolean(c.api_token.trim() && c.list_id.trim());
}

export async function getSfExpressCredentials(userId: number): Promise<SfExpressSettings> {
  return (await getIntegrationSettings(userId)).sf_express;
}

export async function getResendCredentials(userId: number, brand: ResendBrandKey): Promise<ResendBrandSettings> {
  return (await getIntegrationSettings(userId)).resend[brand];
}

/** Find which Resend brand claims this order type (first match in honour → nestiee → cupmoka). */
export async function resolveResendBrandForOrderType(
  userId: number,
  orderType: string | null | undefined,
): Promise<ResendBrandKey | null> {
  const t = (orderType || '').trim();
  if (!t) return null;
  const settings = await getIntegrationSettings(userId);
  for (const brand of RESEND_BRAND_KEYS) {
    if (settings.resend[brand].order_types.includes(t)) return brand;
  }
  return null;
}

export function sfExpressConfigured(s: SfExpressSettings): boolean {
  return Boolean(
    s.partner_id.trim() &&
      s.checkword.trim() &&
      s.monthly_card.trim() &&
      s.sender_company.trim() &&
      s.sender_contact.trim() &&
      s.sender_tel.trim() &&
      s.sender_address.trim()
  );
}
