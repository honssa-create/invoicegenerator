import type { HubPlatform } from './hub';
import { getIntegrationSettings } from './integration-settings-server';
import { normalizeWooStoreUrl } from './woo-url';
import { appendWooQueryAuth, parseWooApiJson, wooApiErrorMessage, wooRequestHeaders } from './woo-api';
import type { HubImportDateRange } from './hub-import';
import { orderCreatedInRange } from './hub-import';
import { formatWooAddress } from './orders';

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
  customer_note?: string;
  payment_method?: string;
  payment_method_title?: string;
  shipping_total?: string;
  shipping_lines?: {
    method_title?: string;
    method_id?: string;
    total?: string;
  }[];
  billing?: {
    first_name?: string;
    last_name?: string;
    company?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    email?: string;
    phone?: string;
  };
  shipping?: {
    first_name?: string;
    last_name?: string;
    company?: string;
    address_1?: string;
    address_2?: string;
    city?: string;
    state?: string;
    postcode?: string;
    country?: string;
    phone?: string;
  };
  meta_data?: { key?: string; value?: unknown }[];
  line_items?: {
    name: string;
    quantity: number;
    price?: number | string;
    total?: number | string;
    meta_data?: { key?: string; value?: unknown }[];
  }[];
}

const STORE_META: Array<{
  platform: Exclude<HubPlatform, 'manual' | 'quickbooks'>;
  label: string;
}> = [
  { platform: 'nestiee', label: 'nestiee.com.hk' },
  { platform: 'honour', label: 'honour.com.hk' },
  { platform: 'honour_en', label: 'Honour EN' },
  { platform: 'cupmoka', label: 'cupmoka.com.hk' },
];

async function wooApiGet(
  store: WooStoreConfig,
  storeUrl: string,
  query: URLSearchParams
): Promise<{ ok: boolean; status: number; body: string }> {
  // Query-string auth: SiteGround WAF returns HTML 403 for Basic Auth on /wp-json.
  appendWooQueryAuth(query, store.consumerKey, store.consumerSecret);
  const url = `${storeUrl}/wp-json/wc/v3/orders?${query.toString()}`;
  const res = await fetch(url, {
    headers: wooRequestHeaders(),
    cache: 'no-store',
    redirect: 'follow',
  });
  const body = await res.text();
  return { ok: res.ok, status: res.status, body };
}

function parseWooOrderBatch(body: string, platform: string): WooOrder[] {
  const batch = parseWooApiJson<WooOrder[]>(body, platform);
  if (!Array.isArray(batch)) {
    throw new Error(`${platform}: unexpected WooCommerce API response format`);
  }
  return batch;
}

/** Quick connectivity check — useful before full order import. */
export async function testWooStoreConnection(
  store: WooStoreConfig
): Promise<{ ok: true } | { ok: false; error: string }> {
  const normalized = normalizeWooStoreUrl(store.storeUrl);
  if (!normalized.ok) return { ok: false, error: normalized.error };

  const params = new URLSearchParams();
  params.set('per_page', '1');

  try {
    const res = await wooApiGet(store, normalized.url, params);
    if (!res.ok) return { ok: false, error: wooApiErrorMessage(res.status, res.body, store.platform) };
    parseWooApiJson(res.body, store.platform);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Connection test failed' };
  }
}

export async function getWooStoreConfigs(userId: number): Promise<WooStoreConfig[]> {
  const settings = (await getIntegrationSettings(userId)).woocommerce;
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

export async function wooStoreConfigured(platform: WooStoreConfig['platform'], userId: number): Promise<boolean> {
  return (await getWooStoreConfigs(userId)).some((c) => c.platform === platform);
}

export async function getWooStoreSetupIssue(
  userId: number,
  platform: WooStoreConfig['platform']
): Promise<string | null> {
  const store = (await getIntegrationSettings(userId)).woocommerce[platform];
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
      return 'IN PROGRESS 安排中';
    case 'pending':
      return 'OPEN';
    case 'cancelled':
    case 'refunded':
    case 'failed':
      return 'OPEN';
    default:
      return 'IN PROGRESS 安排中';
  }
}

/** Nestiee / ecommerce Woo statuses → InvoiceFlow ecommerce status set. */
export function mapNestieeWooStatus(status: string): string {
  const normalized = String(status || '').trim().toLowerCase();
  switch (normalized) {
    case 'checkout-draft':
    case 'draft':
    case 'wc-draft':
      return 'checkout-draft';
    case 'pending':
    case 'failed':
    case 'cancelled':
    case 'refunded':
      return 'pending payment';
    case 'processing':
    case 'on-hold':
      return 'processing';
    case 'shipped':
    case 'wc-shipped':
      return 'shipped';
    case 'completed':
      return 'completed';
    default:
      return 'processing';
  }
}

/** Cupmoka Woo statuses → Cupmoka Hub status labels. */
export function mapCupmokaWooStatus(status: string): string {
  const normalized = String(status || '').trim().toLowerCase();
  switch (normalized) {
    case 'pending':
    case 'failed':
      return '等待付款中';
    case 'processing':
      return '處理中';
    case 'on-hold':
      return '保留';
    case 'shipped':
    case 'wc-shipped':
      return 'Shipped';
    case 'delivered':
    case 'wc-delivered':
    case 'completed':
      return 'Delivered';
    case 'cancelled':
      return '取消';
    case 'refunded':
      return '已退費';
    default:
      return '處理中';
  }
}

/** Manufacturing Woo drafts (honour/cupmoka) must not enter the Order Hub. Nestiee imports drafts. */
export function isWooDraftOrder(status: string | null | undefined): boolean {
  const normalized = String(status || '').trim().toLowerCase();
  return normalized === 'draft' || normalized === 'wc-draft' || normalized === 'checkout-draft';
}

export function wooCustomerName(order: WooOrder): string {
  const b = order.billing;
  const name = [b?.first_name, b?.last_name].filter(Boolean).join(' ').trim();
  return name || `WooCommerce #${order.number}`;
}

export function wooCompanyName(order: WooOrder): string | null {
  const billing = order.billing?.company?.trim();
  if (billing) return billing;
  const shipping = order.shipping?.company?.trim();
  return shipping || null;
}

export function wooShippingAddress(order: WooOrder): string | null {
  const formatted = formatWooAddress(order.shipping);
  return formatted || null;
}

export function wooBillingAddress(order: WooOrder): string | null {
  const formatted = formatWooAddress(order.billing);
  return formatted || null;
}

export function wooOrderDescription(order: WooOrder): string {
  const items = (order.line_items || [])
    .map((li) => `${li.name} x${li.quantity}`)
    .join('; ');
  return items || `WooCommerce order #${order.number}`;
}

async function fetchWooOrdersPaginated(
  store: WooStoreConfig,
  storeUrl: string,
  options?: {
    modifiedAfter?: string;
    createdAfter?: string;
    createdBefore?: string;
    perPage?: number;
    maxPages?: number;
  }
): Promise<WooOrder[]> {
  const perPage = options?.perPage ?? 100;
  const maxPages = options?.maxPages ?? 50;
  const all: WooOrder[] = [];
  let page = 1;

  while (page <= maxPages) {
    const params = new URLSearchParams();
    params.set('per_page', String(perPage));
    params.set('page', String(page));
    params.set('orderby', 'date');
    params.set('order', 'asc');
    if (options?.createdAfter) params.set('after', options.createdAfter);
    if (options?.createdBefore) params.set('before', options.createdBefore);
    if (options?.modifiedAfter) {
      const iso = options.modifiedAfter.includes('T')
        ? options.modifiedAfter
        : `${options.modifiedAfter.replace(' ', 'T')}Z`;
      params.set('modified_after', iso);
    }

    const res = await wooApiGet(store, storeUrl, params);
    if (!res.ok) {
      throw new Error(wooApiErrorMessage(res.status, res.body, store.platform));
    }

    const batch = parseWooOrderBatch(res.body, store.platform);
    all.push(...batch);
    if (batch.length < perPage) break;
    page += 1;
  }

  return all;
}

async function fetchWooOrdersByLocalDateFilter(
  store: WooStoreConfig,
  storeUrl: string,
  range: HubImportDateRange
): Promise<WooOrder[]> {
  const perPage = 100;
  const maxPages = 50;
  const matched: WooOrder[] = [];
  let page = 1;

  while (page <= maxPages) {
    const params = new URLSearchParams();
    params.set('per_page', String(perPage));
    params.set('page', String(page));
    params.set('orderby', 'date');
    params.set('order', 'desc');

    const res = await wooApiGet(store, storeUrl, params);
    if (!res.ok) {
      throw new Error(wooApiErrorMessage(res.status, res.body, store.platform));
    }

    const batch = parseWooOrderBatch(res.body, store.platform);
    if (!batch.length) break;

    let reachedOlder = false;
    for (const order of batch) {
      if (orderCreatedInRange(order.date_created, range)) {
        matched.push(order);
      } else if (order.date_created.slice(0, 10) < range.dateFrom) {
        reachedOlder = true;
      }
    }

    if (reachedOlder || batch.length < perPage) break;
    page += 1;
  }

  return matched;
}

export async function fetchWooOrders(
  store: WooStoreConfig,
  options?: {
    modifiedAfter?: string;
    createdAfter?: string;
    createdBefore?: string;
    dateRange?: HubImportDateRange;
    perPage?: number;
  }
): Promise<WooOrder[]> {
  const normalized = normalizeWooStoreUrl(store.storeUrl);
  if (!normalized.ok) {
    throw new Error(`${store.platform}: ${normalized.error}`);
  }

  if (options?.dateRange) {
    try {
      return await fetchWooOrdersPaginated(store, normalized.url, {
        createdAfter: options.createdAfter,
        createdBefore: options.createdBefore,
        perPage: options.perPage,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : '';
      const shouldFallback =
        message.includes('web page instead of API data') ||
        message.includes('returned HTML') ||
        message.includes('invalid API response');

      if (!shouldFallback) throw err;
      return fetchWooOrdersByLocalDateFilter(store, normalized.url, options.dateRange);
    }
  }

  return fetchWooOrdersPaginated(store, normalized.url, {
    modifiedAfter: options?.modifiedAfter,
    createdAfter: options?.createdAfter,
    createdBefore: options?.createdBefore,
    perPage: options?.perPage,
  });
}
