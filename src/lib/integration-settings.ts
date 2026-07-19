/** Client-safe integration settings types. */

export type WooPlatformKey = 'nestiee' | 'honour' | 'cupmoka';

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

export interface IntegrationSettings {
  woocommerce: Record<WooPlatformKey, WooStoreSettings>;
  quickbooks: QuickBooksSettings;
  yedpay: YedpaySettings;
}

export interface IntegrationSettingsMasked {
  woocommerce: Record<WooPlatformKey, WooStoreSettingsMasked>;
  quickbooks: QuickBooksSettingsMasked;
  yedpay: YedpaySettingsMasked;
}

export const WOO_PLATFORM_LABELS: Record<WooPlatformKey, string> = {
  nestiee: 'Nestiee (nestiee.com.hk)',
  honour: 'Honour (honour.com.hk)',
  cupmoka: 'Cup Moka (cupmoka.com.hk)',
};

export const EMPTY_INTEGRATION_SETTINGS: IntegrationSettings = {
  woocommerce: {
    nestiee: { url: '', key: '', secret: '' },
    honour: { url: '', key: '', secret: '' },
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
};
