import db from './db';
import {
  EMPTY_INTEGRATION_SETTINGS,
  type IntegrationSettings,
  type IntegrationSettingsMasked,
  type QuickBooksSettings,
  type WooPlatformKey,
  type WooStoreSettings,
  type YedpaySettings,
} from './integration-settings';

function maskSecret(value: string | undefined): { set: boolean; hint: string } {
  if (!value?.trim()) return { set: false, hint: '' };
  const v = value.trim();
  return { set: true, hint: v.length <= 4 ? '••••' : `••••${v.slice(-4)}` };
}

function parseSettings(json: string | null | undefined): IntegrationSettings {
  if (!json) return structuredClone(EMPTY_INTEGRATION_SETTINGS);
  try {
    const parsed = JSON.parse(json) as Partial<IntegrationSettings>;
    return {
      woocommerce: {
        nestiee: { ...EMPTY_INTEGRATION_SETTINGS.woocommerce.nestiee, ...parsed.woocommerce?.nestiee },
        honour: { ...EMPTY_INTEGRATION_SETTINGS.woocommerce.honour, ...parsed.woocommerce?.honour },
        cupmoka: { ...EMPTY_INTEGRATION_SETTINGS.woocommerce.cupmoka, ...parsed.woocommerce?.cupmoka },
      },
      quickbooks: { ...EMPTY_INTEGRATION_SETTINGS.quickbooks, ...parsed.quickbooks },
      yedpay: { ...EMPTY_INTEGRATION_SETTINGS.yedpay, ...parsed.yedpay },
    };
  } catch {
    return structuredClone(EMPTY_INTEGRATION_SETTINGS);
  }
}

export function getIntegrationSettings(userId: number): IntegrationSettings {
  const row = db
    .prepare('SELECT settings_json FROM integration_settings WHERE user_id = ?')
    .get(userId) as { settings_json: string } | undefined;
  const dbSettings = parseSettings(row?.settings_json);

  return mergeWithEnvDefaults(dbSettings);
}

function envWoo(platform: WooPlatformKey): WooStoreSettings {
  const envMap: Record<WooPlatformKey, string> = {
    nestiee: 'NESTIEE',
    honour: 'HONOUR',
    cupmoka: 'CUPMOKA',
  };
  const key = envMap[platform];
  return {
    url: process.env[`WOOCOMMERCE_${key}_URL`]?.trim() || '',
    key: process.env[`WOOCOMMERCE_${key}_KEY`]?.trim() || '',
    secret: process.env[`WOOCOMMERCE_${key}_SECRET`]?.trim() || '',
  };
}

function mergeWithEnvDefaults(settings: IntegrationSettings): IntegrationSettings {
  const pick = (dbVal: string, envVal: string) => dbVal.trim() || envVal.trim();
  const pickWoo = (db: WooStoreSettings, platform: WooPlatformKey): WooStoreSettings => {
    const env = envWoo(platform);
    return {
      url: pick(db.url, env.url),
      key: pick(db.key, env.key),
      secret: pick(db.secret, env.secret),
    };
  };

  return {
    woocommerce: {
      nestiee: pickWoo(settings.woocommerce.nestiee, 'nestiee'),
      honour: pickWoo(settings.woocommerce.honour, 'honour'),
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
  };
}

/** Raw DB settings only (for saving merges, without env overlay). */
function getRawIntegrationSettings(userId: number): IntegrationSettings {
  const row = db
    .prepare('SELECT settings_json FROM integration_settings WHERE user_id = ?')
    .get(userId) as { settings_json: string } | undefined;
  return parseSettings(row?.settings_json);
}

export function getIntegrationSettingsMasked(userId: number): IntegrationSettingsMasked {
  const s = getIntegrationSettings(userId);
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

  return {
    woocommerce: {
      nestiee: maskWoo(s.woocommerce.nestiee),
      honour: maskWoo(s.woocommerce.honour),
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
  };
}

export type IntegrationSettingsUpdate = {
  woocommerce?: Partial<Record<WooPlatformKey, Partial<WooStoreSettings>>>;
  quickbooks?: Partial<QuickBooksSettings>;
  yedpay?: Partial<YedpaySettings>;
};

function keepOrReplace(current: string, incoming: string | undefined | null, clearIfEmpty = false): string {
  if (incoming === undefined || incoming === null) return current;
  const trimmed = incoming.trim();
  if (!trimmed && clearIfEmpty) return '';
  if (!trimmed) return current;
  return trimmed;
}

export function saveIntegrationSettings(userId: number, update: IntegrationSettingsUpdate): IntegrationSettings {
  const current = getRawIntegrationSettings(userId);

  const next: IntegrationSettings = {
    woocommerce: { ...current.woocommerce },
    quickbooks: { ...current.quickbooks },
    yedpay: { ...current.yedpay },
  };

  if (update.woocommerce) {
    for (const platform of ['nestiee', 'honour', 'cupmoka'] as WooPlatformKey[]) {
      const patch = update.woocommerce[platform];
      if (!patch) continue;
      next.woocommerce[platform] = {
        url: keepOrReplace(current.woocommerce[platform].url, patch.url, true),
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

  db.prepare(
    `INSERT INTO integration_settings (user_id, settings_json, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET settings_json = excluded.settings_json, updated_at = datetime('now')`
  ).run(userId, JSON.stringify(next));

  return getIntegrationSettings(userId);
}

export function getQuickBooksCredentials(userId: number): QuickBooksSettings {
  return getIntegrationSettings(userId).quickbooks;
}

export function getYedpayCredentials(userId: number): YedpaySettings {
  return getIntegrationSettings(userId).yedpay;
}
