/** Client-safe integration settings types. */

import { ORDER_TYPES } from './orders';

export type WooPlatformKey = 'nestiee' | 'honour' | 'honour_en' | 'cupmoka';

export const WOO_PLATFORM_KEYS: WooPlatformKey[] = ['nestiee', 'honour', 'honour_en', 'cupmoka'];

export type ResendBrandKey = 'honour' | 'nestiee' | 'cupmoka';

export const RESEND_BRAND_KEYS: ResendBrandKey[] = ['honour', 'nestiee', 'cupmoka'];

/** Brands shown in Settings → Integrations. */
export const RESEND_UI_BRAND_KEYS: ResendBrandKey[] = ['honour', 'nestiee', 'cupmoka'];

export const RESEND_BRAND_LABELS: Record<ResendBrandKey, string> = {
  honour: 'Honour',
  nestiee: 'Nestiee',
  cupmoka: 'Cupmoka',
};

export interface ResendBrandSettings {
  api_key: string;
  from_email: string;
  order_types: string[];
}

export interface ResendBrandSettingsMasked {
  from_email: string;
  api_key_set: boolean;
  api_key_hint: string;
  order_types: string[];
}

export const DEFAULT_RESEND_ORDER_TYPES: Record<ResendBrandKey, string[]> = {
  honour: ['honour訂製', 'honour en訂製'],
  nestiee: ['Nestiee 燕窩訂單', '燕窩回禮燉製'],
  cupmoka: ['Cupmoka'],
};

export function normalizeResendOrderTypes(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const allowed = new Set<string>(ORDER_TYPES);
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== 'string') continue;
    const t = item.trim();
    if (!t || !allowed.has(t) || out.includes(t)) continue;
    out.push(t);
  }
  return out;
}

export interface WooStoreSettings {
  url: string;
  key: string;
  secret: string;
}

export interface WooStoreSettingsMasked {
  url: string;
  key_set: boolean;
  key_hint: string;
  secret_set: boolean;
  secret_hint: string;
}

export interface QuickBooksSettings {
  client_id: string;
  client_secret: string;
  redirect_uri: string;
  environment: 'sandbox' | 'production';
}

export interface QuickBooksSettingsMasked {
  client_id: string;
  client_id_set: boolean;
  client_secret_set: boolean;
  client_secret_hint: string;
  redirect_uri: string;
  environment: 'sandbox' | 'production';
}

export interface YedpaySettings {
  access_token: string;
  user_id: string;
}

export interface YedpaySettingsMasked {
  user_id: string;
  access_token_set: boolean;
  access_token_hint: string;
}

export const SF_EXPRESS_DEFAULT_PRINT_TEMPLATE = 'fm_150_hongkonglocal_HYSBOO5I2I7';

export interface SfExpressSettings {
  partner_id: string;
  checkword: string;
  monthly_card: string;
  environment: 'sandbox' | 'production';
  express_type_id: string;
  pay_method: string;
  print_template_code: string;
  sender_company: string;
  sender_contact: string;
  sender_tel: string;
  sender_address: string;
}

export interface SfExpressSettingsMasked {
  partner_id: string;
  partner_id_set: boolean;
  checkword_set: boolean;
  checkword_hint: string;
  monthly_card: string;
  environment: 'sandbox' | 'production';
  express_type_id: string;
  pay_method: string;
  print_template_code: string;
  sender_company: string;
  sender_contact: string;
  sender_tel: string;
  sender_address: string;
}

export interface IntegrationSettings {
  woocommerce: Record<WooPlatformKey, WooStoreSettings>;
  quickbooks: QuickBooksSettings;
  yedpay: YedpaySettings;
  sf_express: SfExpressSettings;
  resend: Record<ResendBrandKey, ResendBrandSettings>;
}

export interface IntegrationSettingsMasked {
  woocommerce: Record<WooPlatformKey, WooStoreSettingsMasked>;
  quickbooks: QuickBooksSettingsMasked;
  yedpay: YedpaySettingsMasked;
  sf_express: SfExpressSettingsMasked;
  resend: Record<ResendBrandKey, ResendBrandSettingsMasked>;
}

export const WOO_PLATFORM_LABELS: Record<WooPlatformKey, string> = {
  nestiee: 'Nestiee (nestiee.com.hk)',
  honour: 'Honour (honour.com.hk)',
  honour_en: 'Honour EN',
  cupmoka: 'Cup Moka (cupmoka.com.hk)',
};

export const EMPTY_INTEGRATION_SETTINGS: IntegrationSettings = {
  woocommerce: {
    nestiee: { url: '', key: '', secret: '' },
    honour: { url: '', key: '', secret: '' },
    honour_en: { url: '', key: '', secret: '' },
    cupmoka: { url: '', key: '', secret: '' },
  },
  quickbooks: {
    client_id: '',
    client_secret: '',
    redirect_uri: '',
    environment: 'sandbox',
  },
  yedpay: {
    access_token: '',
    user_id: '',
  },
  sf_express: {
    partner_id: '',
    checkword: '',
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
    honour: {
      api_key: '',
      from_email: '',
      order_types: [...DEFAULT_RESEND_ORDER_TYPES.honour],
    },
    nestiee: {
      api_key: '',
      from_email: '',
      order_types: [...DEFAULT_RESEND_ORDER_TYPES.nestiee],
    },
    cupmoka: {
      api_key: '',
      from_email: '',
      order_types: [...DEFAULT_RESEND_ORDER_TYPES.cupmoka],
    },
  },
};
