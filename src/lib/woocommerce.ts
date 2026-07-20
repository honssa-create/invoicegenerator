import type { HubPlatform } from './hub';
import { getIntegrationSettings } from './integration-settings-server';
import { normalizeWooStoreUrl } from './woo-url';

export interface WooStoreConfig {
  platform: Exclude<HubPlatform, 'manual' | 'quickbooks'>;
  label: string;
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

export interface WooOrder {
  id: number;
  number: string;
  status: string;
  total: string;
  date_created: string;
  date_modified: string;
  billing?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
  shipping?: {
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
  };
  line_items?: { name: string; quantity: number }[];
}

function authHeader(key: string, secret: string): string {
  const token = Buffer.from(`${key}:${secret}`).toString('base64');
  return `Basic ${token}`;
}

const STORE_META: Array<{
  platform: Exclude<HubPlatform, 'manual' | 'quickbooks'>;
  label: string;
}> = [
  { platform: 'nestiee', label: 'nestiee.com.hk' },
  { platform: 'honour', label: 'honour.com.hk' },
  { platform: 'cupmoka', label: 'cupmoka.com.hk' },
];

export function getWooStoreConfigs(userId: number): WooStoreConfig[] {
  const settings = getIntegrationSettings(userId).woocommerce;
  const configs: WooStoreConfig[] = [];

  for (const s of STORE_META) {
    const store = settings[s.platform];
    if (store.url && store.key && store.secret) {
      const normalized = normalizeWooStoreUrl(store.url);
      if (!normalized.ok) continue;
      configs.push({
        platform: s.platform,
        label: s.label,
        storeUrl: normalized.url,
        consumerKey: store.key,
        consumerSecret: store.secret,
      });
    }
  }
  return configs;
}

export function wooStoreConfigured(platform: WooStoreConfig['platform'], userId: number): boolean {
  return getWooStoreConfigs(userId).some((c) => c.platform === platform);
}

export function getWooStoreSetupIssue(
  userId: number,
  platform: WooStoreConfig['platform']
): string | null {
  const store = getIntegrationSettings(userId).woocommerce[platform];
  if (!store.url?.trim() && !store.key?.trim() && !store.secret?.trim()) {
    return 'not_configured';
  }
  if (!store.url?.trim() || !store.key?.trim() || !store.secret?.trim()) {
    return 'Add store URL, consumer key, and consumer secret in Settings → API Integrations.';
  }
  const normalized = normalizeWooStoreUrl(store.url);
  if (!normalized.ok) return normalized.error;
  return null;
}

export function mapWooStatus(status: string): string {
  switch (status) {
    case 'completed':
      return '已寄出 SENT';
    case 'processing':
    case 'on-hold':
      return '製作中';
    case 'pending':
      return '草稿';
    case 'cancelled':
    case 'refunded':
    case 'failed':
      return '草稿';
    default:
      return '製作中';
  }
}

export function wooCustomerName(order: WooOrder): string {
  const b = order.billing;
  const name = [b?.first_name, b?.last_name].filter(Boolean).join(' ').trim();
  return name || `WooCommerce #${order.number}`;
}

export function wooShippingAddress(order: WooOrder): string | null {
  const s = order.shipping;
  if (!s) return null;
  return [s.address_1, s.address_2, s.city, s.state, s.postcode, s.country].filter(Boolean).join(', ') || null;
}

export function wooOrderDescription(order: WooOrder): string {
  const items = (order.line_items || [])
    .map((li) => `${li.name} x${li.quantity}`)
    .join('; ');
  return items || `WooCommerce order #${order.number}`;
}

export async function fetchWooOrders(
  store: WooStoreConfig,
  options?: { modifiedAfter?: string; perPage?: number }
): Promise<WooOrder[]> {
  const normalized = normalizeWooStoreUrl(store.storeUrl);
  if (!normalized.ok) {
    throw new Error(`${store.platform}: ${normalized.error}`);
  }

  const perPage = options?.perPage ?? 100;
  const all: WooOrder[] = [];
  let page = 1;

  while (true) {
    const params = new URLSearchParams();
    params.set('per_page', String(perPage));
    params.set('page', String(page));
    params.set('orderby', 'modified');
    params.set('order', 'asc');
    if (options?.modifiedAfter) {
      params.set('modified_after', options.modifiedAfter);
    }

    const url = `${normalized.url}/wp-json/wc/v3/orders?${params.toString()}`;
    const res = await fetch(url, {
      headers: {
        Authorization: authHeader(store.consumerKey, store.consumerSecret),
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`WooCommerce ${store.platform} API error (${res.status}): ${text.slice(0, 200)}`);
    }

    const batch = (await res.json()) as WooOrder[];
    all.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }

  return all;
}
