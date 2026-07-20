import db from './db';
import type { HubSyncResult } from './hub';
import {
  findOrderForQuickBooksInvoice,
  getSyncState,
  setSyncState,
  upsertHubInvoice,
  upsertHubOrder,
} from './hub-server';
import { HUB_PLATFORM_PREFIX } from './hub';
import { getQuickBooksCredentials } from './integration-settings-server';
import {
  fetchWooOrders,
  getWooStoreConfigs,
  mapWooStatus,
  wooCustomerName,
  wooOrderDescription,
  wooShippingAddress,
  type WooStoreConfig,
} from './woocommerce';
import type { HubImportDateRange } from './hub-import';
import { wooOrderCreatedBounds } from './hub-import';

export async function syncWooStore(
  userId: number,
  store: WooStoreConfig,
  dateRange?: HubImportDateRange
): Promise<HubSyncResult> {
  const result: HubSyncResult = {
    platform: store.platform,
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    linked: 0,
    errors: [],
  };

  const lastSync = getSyncState(userId, 'woocommerce', store.platform);
  let orders;
  try {
    if (dateRange) {
      const bounds = wooOrderCreatedBounds(dateRange);
      orders = await fetchWooOrders(store, {
        createdAfter: bounds.after,
        createdBefore: bounds.before,
      });
    } else {
      orders = await fetchWooOrders(store, { modifiedAfter: lastSync || undefined });
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : 'fetch failed');
    return result;
  }

  result.fetched = orders.length;
  const syncedAt = new Date().toISOString();

  const run = db.transaction(() => {
    for (const order of orders) {
      try {
        const upsert = upsertHubOrder(userId, {
          source_platform: store.platform,
          original_order_id: String(order.id),
          customer_name: wooCustomerName(order),
          total_amount: Number(order.total) || 0,
          status: mapWooStatus(order.status),
          created_at: order.date_created.replace('T', ' ').slice(0, 19),
          customer_email: order.billing?.email || null,
          phone: order.billing?.phone || null,
          shipping_address: wooShippingAddress(order),
          description: wooOrderDescription(order),
          external_po_number: order.number,
          raw_payload: order as unknown as Record<string, unknown>,
        });
        if (upsert.inserted) result.inserted += 1;
        else result.updated += 1;
      } catch (err) {
        result.skipped += 1;
        result.errors.push(`Order ${order.id}: ${err instanceof Error ? err.message : 'upsert failed'}`);
      }
    }
    if (!dateRange) {
      setSyncState(userId, 'woocommerce', store.platform, syncedAt);
    }
  });
  run();

  return result;
}

export async function syncAllWooStores(userId: number, dateRange?: HubImportDateRange): Promise<HubSyncResult[]> {
  const stores = getWooStoreConfigs(userId);
  const results: HubSyncResult[] = [];
  for (const store of stores) {
    results.push(await syncWooStore(userId, store, dateRange));
  }
  return results;
}

export async function importHubPlatform(
  userId: number,
  platform: 'nestiee' | 'honour' | 'cupmoka' | 'quickbooks',
  dateRange?: HubImportDateRange
): Promise<HubSyncResult> {
  if (platform === 'quickbooks') {
    return syncQuickBooksInvoices(userId, dateRange);
  }

  const store = getWooStoreConfigs(userId).find((s) => s.platform === platform);
  if (!store) {
    return {
      platform,
      fetched: 0,
      inserted: 0,
      updated: 0,
      skipped: 0,
      linked: 0,
      errors: ['Store is not configured. Add API keys in Settings → API Integrations.'],
    };
  }

  return syncWooStore(userId, store, dateRange);
}

export interface QuickBooksTokenRow {
  user_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  realm_id: string;
}

export function quickbooksConfigured(userId: number): boolean {
  const creds = getQuickBooksCredentials(userId);
  return Boolean(creds.client_id && creds.client_secret);
}

export function quickbooksRedirectUri(userId: number, requestOrigin?: string): string {
  const fromSettings = getQuickBooksCredentials(userId).redirect_uri.trim();
  if (fromSettings) return fromSettings;
  if (process.env.QUICKBOOKS_REDIRECT_URI) return process.env.QUICKBOOKS_REDIRECT_URI;
  const base = requestOrigin || process.env.APP_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/api/integrations/quickbooks/callback`;
}

export function quickbooksApiBase(userId: number): string {
  const env = getQuickBooksCredentials(userId).environment;
  return env === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

export function getQuickBooksAuthUrl(userId: number, requestOrigin?: string): string {
  const creds = getQuickBooksCredentials(userId);
  if (!creds.client_id) throw new Error('QuickBooks Client ID is not configured');

  const redirectUri = quickbooksRedirectUri(userId, requestOrigin);
  const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
  const params = new URLSearchParams({
    client_id: creds.client_id,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'com.intuit.quickbooks.accounting',
    state,
  });
  return `https://appcenter.intuit.com/connect/oauth2?${params.toString()}`;
}

export function saveQuickBooksTokens(
  userId: number,
  tokens: { access_token: string; refresh_token: string; expires_in: number; realmId: string }
): void {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  db.prepare(
    `INSERT INTO integration_tokens (user_id, provider, access_token, refresh_token, expires_at, realm_id, updated_at)
     VALUES (?, 'quickbooks', ?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, provider) DO UPDATE SET
       access_token = excluded.access_token,
       refresh_token = excluded.refresh_token,
       expires_at = excluded.expires_at,
       realm_id = excluded.realm_id,
       updated_at = datetime('now')`
  ).run(userId, tokens.access_token, tokens.refresh_token, expiresAt, tokens.realmId);
}

export function getQuickBooksTokens(userId: number): QuickBooksTokenRow | null {
  const row = db
    .prepare(
      `SELECT user_id, access_token, refresh_token, expires_at, realm_id
       FROM integration_tokens WHERE user_id = ? AND provider = 'quickbooks'`
    )
    .get(userId) as QuickBooksTokenRow | undefined;
  return row || null;
}

export function isQuickBooksConnected(userId: number): boolean {
  return Boolean(getQuickBooksTokens(userId)?.refresh_token);
}

export async function exchangeQuickBooksCode(
  userId: number,
  code: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const creds = getQuickBooksCredentials(userId);
  if (!creds.client_id || !creds.client_secret) throw new Error('QuickBooks credentials not configured');

  const basic = Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  });

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !json.access_token || !json.refresh_token) {
    throw new Error(json.error || `QuickBooks token exchange failed (${res.status})`);
  }
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_in: json.expires_in || 3600,
  };
}

async function refreshQuickBooksAccessToken(userId: number, row: QuickBooksTokenRow): Promise<string> {
  const creds = getQuickBooksCredentials(userId);
  if (!creds.client_id || !creds.client_secret) throw new Error('QuickBooks credentials not configured');

  const basic = Buffer.from(`${creds.client_id}:${creds.client_secret}`).toString('base64');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: row.refresh_token,
  });

  const res = await fetch('https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basic}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  const json = (await res.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    error?: string;
  };
  if (!res.ok || !json.access_token) {
    throw new Error(json.error || 'QuickBooks token refresh failed — reconnect OAuth');
  }

  saveQuickBooksTokens(userId, {
    access_token: json.access_token,
    refresh_token: json.refresh_token || row.refresh_token,
    expires_in: json.expires_in || 3600,
    realmId: row.realm_id,
  });
  return json.access_token;
}

export async function getValidQuickBooksAccessToken(userId: number): Promise<{ token: string; realmId: string }> {
  const row = getQuickBooksTokens(userId);
  if (!row) throw new Error('QuickBooks is not connected');

  const expires = new Date(row.expires_at).getTime();
  if (Date.now() < expires - 60_000) {
    return { token: row.access_token, realmId: row.realm_id };
  }
  const token = await refreshQuickBooksAccessToken(userId, row);
  return { token, realmId: row.realm_id };
}

interface QbInvoice {
  Id: string;
  DocNumber?: string;
  TxnDate?: string;
  DueDate?: string;
  TotalAmt?: number;
  Balance?: number;
  CustomerRef?: { name?: string; value?: string };
  MetaData?: { CreateTime?: string; LastUpdatedTime?: string };
  BillEmail?: { Address?: string };
}

function mapQbInvoiceStatus(balance: number, total: number): 'draft' | 'sent' | 'paid' | 'overdue' {
  if (balance <= 0 && total > 0) return 'paid';
  if (balance > 0 && balance < total) return 'sent';
  return 'sent';
}

function allocateQbSystemNo(userId: number, qbId: string): string {
  const existing = db
    .prepare(
      `SELECT system_order_no FROM invoices
       WHERE user_id = ? AND source_platform = 'quickbooks' AND original_order_id = ?`
    )
    .get(userId, qbId) as { system_order_no: string | null } | undefined;
  if (existing?.system_order_no) return existing.system_order_no;

  const row = db
    .prepare("SELECT next_serial FROM hub_order_sequences WHERE user_id = ? AND platform = 'quickbooks'")
    .get(userId) as { next_serial: number } | undefined;
  let serial = row?.next_serial ?? 1001;
  if (!row) {
    db.prepare('INSERT INTO hub_order_sequences (user_id, platform, next_serial) VALUES (?, ?, ?)').run(
      userId,
      'quickbooks',
      serial + 1
    );
  } else {
    db.prepare('UPDATE hub_order_sequences SET next_serial = ? WHERE user_id = ? AND platform = ?').run(
      serial + 1,
      userId,
      'quickbooks'
    );
  }
  return `${HUB_PLATFORM_PREFIX.quickbooks}-${serial}`;
}

export async function syncQuickBooksInvoices(userId: number, dateRange?: HubImportDateRange): Promise<HubSyncResult> {
  const result: HubSyncResult = {
    platform: 'quickbooks',
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    linked: 0,
    errors: [],
  };

  const { token, realmId } = await getValidQuickBooksAccessToken(userId);
  const lastSync = getSyncState(userId, 'quickbooks', 'invoices');
  let query: string;
  if (dateRange) {
    query = `select * from Invoice where TxnDate >= '${dateRange.dateFrom}' and TxnDate <= '${dateRange.dateTo}' MAXRESULTS 1000`;
  } else if (lastSync) {
    query = `select * from Invoice where MetaData.LastUpdatedTime > '${lastSync}' MAXRESULTS 1000`;
  } else {
    query = 'select * from Invoice MAXRESULTS 1000';
  }

  const url = `${quickbooksApiBase(userId)}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json',
    },
    cache: 'no-store',
  });

  const json = (await res.json()) as {
    QueryResponse?: { Invoice?: QbInvoice[] };
    Fault?: { Error?: { Message?: string }[] };
  };

  if (!res.ok) {
    const msg = json.Fault?.Error?.[0]?.Message || `QuickBooks API error (${res.status})`;
    result.errors.push(msg);
    return result;
  }

  const invoices = json.QueryResponse?.Invoice || [];
  result.fetched = invoices.length;
  const syncedAt = new Date().toISOString();

  const run = db.transaction(() => {
    for (const inv of invoices) {
      try {
        const total = Number(inv.TotalAmt) || 0;
        const balance = Number(inv.Balance ?? total);
        const systemNo = allocateQbSystemNo(userId, inv.Id);
        const docNumber = inv.DocNumber || null;
        const customerName = inv.CustomerRef?.name || 'QuickBooks Customer';
        const txnDate = (inv.TxnDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
        const issueDate = txnDate;
        const dueDate = (inv.DueDate || inv.TxnDate || new Date().toISOString().slice(0, 10)).slice(0, 10);

        let orderId = findOrderForQuickBooksInvoice(userId, {
          docNumber,
          customerName,
          totalAmount: total,
          txnDate,
        });
        const wasLinked = Boolean(orderId);

        if (!orderId) {
          const orderUpsert = upsertHubOrder(userId, {
            source_platform: 'quickbooks',
            original_order_id: inv.Id,
            customer_name: customerName,
            total_amount: total,
            status: mapQbInvoiceStatus(balance, total) === 'paid' ? '已寄出 SENT' : '製作中',
            created_at: (inv.MetaData?.CreateTime || `${issueDate} 00:00:00`).replace('T', ' ').slice(0, 19),
            customer_email: inv.BillEmail?.Address || null,
            description: docNumber ? `QuickBooks invoice ${docNumber}` : `QuickBooks invoice ${systemNo}`,
            external_po_number: docNumber,
            raw_payload: inv as unknown as Record<string, unknown>,
          });
          orderId = orderUpsert.id;
        }

        const upsert = upsertHubInvoice(userId, {
          source_platform: 'quickbooks',
          original_order_id: inv.Id,
          system_order_no: systemNo,
          customer_name: customerName,
          total_amount: total,
          status: mapQbInvoiceStatus(balance, total),
          issue_date: issueDate,
          due_date: dueDate,
          customer_email: inv.BillEmail?.Address || null,
          invoice_number: docNumber || systemNo,
          order_id: orderId,
          raw_payload: inv as unknown as Record<string, unknown>,
        });
        if (upsert.inserted) result.inserted += 1;
        else result.updated += 1;
        if (wasLinked) result.linked += 1;
      } catch (err) {
        result.skipped += 1;
        result.errors.push(`Invoice ${inv.Id}: ${err instanceof Error ? err.message : 'upsert failed'}`);
      }
    }
    if (!dateRange) {
      setSyncState(userId, 'quickbooks', 'invoices', syncedAt);
    }
  });
  run();

  return result;
}
