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
}

export interface IntegrationSettingsMasked {
  woocommerce: Record<WooPlatformKey, WooStoreSettingsMasked>;
  quickbooks: QuickBooksSettingsMasked;
  yedpay: YedpaySettingsMasked;
  sf_express: SfExpressSettingsMasked;
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
};
