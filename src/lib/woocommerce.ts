import type { HubPlatform } from './hub';

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

export function getWooStoreConfigs(): WooStoreConfig[] {
  const stores: Array<{ platform: WooStoreConfig['platform']; env: string; label: string }> = [
    { platform: 'nestiee', env: 'NESTIEE', label: 'nestiee.com.hk' },
    { platform: 'honour', env: 'HONOUR', label: 'honour.com.hk' },
    { platform: 'cupmoka', env: 'CUPMOKA', label: 'cupmoka.com.hk' },
  ];

  const configs: WooStoreConfig[] = [];
  for (const s of stores) {
    const storeUrl = process.env[`WOOCOMMERCE_${s.env}_URL`]?.trim();
    const consumerKey = process.env[`WOOCOMMERCE_${s.env}_KEY`]?.trim();
    const consumerSecret = process.env[`WOOCOMMERCE_${s.env}_SECRET`]?.trim();
    if (storeUrl && consumerKey && consumerSecret) {
      configs.push({
        platform: s.platform,
        label: s.label,
        storeUrl: storeUrl.replace(/\/$/, ''),
        consumerKey,
        consumerSecret,
      });
    }
  }
  return configs;
}

export function wooStoreConfigured(platform: WooStoreConfig['platform']): boolean {
  return getWooStoreConfigs().some((c) => c.platform === platform);
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

    const url = `${store.storeUrl}/wp-json/wc/v3/orders?${params.toString()}`;
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
