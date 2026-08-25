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
import { getQuickBooksCredentials, getClickUpCredentials, clickupConfigured } from './integration-settings-server';
import { fetchClickUpListTasks, clickUpMsToDateYmd } from './clickup';
import { mapClickUpTaskToUpsert } from './clickup-map';
import { ensurePrepFromWeddingOrder } from './kitchen-prep-server';
import {
  fetchWooOrders,
  getWooStoreConfigs,
  isWooDraftOrder,
  mapCupmokaWooStatus,
  mapNestieeWooStatus,
  mapWooStatus,
  wooCustomerName,
  wooCompanyName,
  wooOrderDescription,
  wooBillingAddress,
  wooShippingAddress,
  type WooStoreConfig,
  type WooOrder,
} from './woocommerce';
import type { HubImportDateRange } from './hub-import';
import { orderCreatedInRange } from './hub-import';
import { wooOrderCreatedBounds } from './hub-import';
import { normalizeCustomerName } from './customer-name';

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

  const lastSync = await getSyncState(userId, 'woocommerce', store.platform);
  let orders;
  try {
    if (dateRange) {
      const bounds = wooOrderCreatedBounds(dateRange);
      orders = await fetchWooOrders(store, {
        createdAfter: bounds.after,
        createdBefore: bounds.before,
        dateRange,
      });
    } else {
      orders = await fetchWooOrders(store, { modifiedAfter: lastSync || undefined });
    }
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : 'fetch failed');
    return result;
  }

  return await ingestWooOrders(userId, store.platform, orders, dateRange);
}

export async function ingestWooOrders(
  userId: number,
  platform: WooStoreConfig['platform'],
  orders: WooOrder[],
  dateRange?: HubImportDateRange
): Promise<HubSyncResult> {
  const result: HubSyncResult = {
    platform,
    fetched: orders.length,
    inserted: 0,
    updated: 0,
    skipped: 0,
    linked: 0,
    errors: [],
  };

  const dateRows = dateRange
    ? orders.filter((o) => {
        const day = o.date_created.slice(0, 10);
        return day >= dateRange.dateFrom && day <= dateRange.dateTo;
      })
    : orders;
  // Nestiee and cupmoka skip Woo checkout drafts; honour stores already did too.
  const rows = dateRows.filter((order) => !isWooDraftOrder(order.status));
  result.fetched = dateRows.length;
  result.skipped += dateRows.length - rows.length;
  const syncedAt = new Date().toISOString();

  await db.transaction(async () => {
    for (const order of rows) {
      try {
        const upsert = await upsertHubOrder(userId, {
          source_platform: platform,
          original_order_id: String(order.id),
          customer_name: wooCustomerName(order),
          total_amount: Number(order.total) || 0,
          status:
            platform === 'nestiee'
              ? mapNestieeWooStatus(order.status)
              : platform === 'cupmoka'
                ? mapCupmokaWooStatus(order.status)
                : mapWooStatus(order.status),
          created_at: order.date_created.replace('T', ' ').slice(0, 19),
          customer_email: order.billing?.email || null,
          phone: order.billing?.phone || null,
          shipping_address: wooShippingAddress(order),
          billing_address: wooBillingAddress(order),
          company_name: wooCompanyName(order),
          description: wooOrderDescription(order),
          notes: order.customer_note?.trim() || null,
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
      await setSyncState(userId, 'woocommerce', platform, syncedAt);
    }
  });
  return result;
}

export async function syncAllWooStores(userId: number, dateRange?: HubImportDateRange): Promise<HubSyncResult[]> {
  const stores = await getWooStoreConfigs(userId);
  const results: HubSyncResult[] = [];
  for (const store of stores) {
    results.push(await syncWooStore(userId, store, dateRange));
  }
  return results;
}

export async function syncClickUpTasks(
  userId: number,
  dateRange?: HubImportDateRange,
): Promise<HubSyncResult> {
  const result: HubSyncResult = {
    platform: 'clickup',
    fetched: 0,
    inserted: 0,
    updated: 0,
    skipped: 0,
    linked: 0,
    errors: [],
  };

  if (!(await clickupConfigured(userId))) {
    result.errors.push('ClickUp is not configured. Add API token and List ID in Settings → Integrations.');
    return result;
  }

  const creds = await getClickUpCredentials(userId);
  const lastSync = await getSyncState(userId, 'clickup', 'tasks');
  const dateUpdatedGt = lastSync
    ? String(
        Date.parse(lastSync.includes('T') ? lastSync : `${lastSync.replace(' ', 'T')}Z`) || '',
      ) || undefined
    : undefined;

  let tasks;
  try {
    tasks = await fetchClickUpListTasks(creds, {
      include_closed: true,
      date_updated_gt: dateRange ? undefined : dateUpdatedGt,
    });
  } catch (err) {
    result.errors.push(err instanceof Error ? err.message : 'ClickUp fetch failed');
    return result;
  }

  if (dateRange) {
    tasks = tasks.filter((t) => {
      const created = clickUpMsToDateYmd(t.date_created);
      if (!created) return true;
      return orderCreatedInRange(created, dateRange);
    });
  }

  result.fetched = tasks.length;
  const syncedAt = new Date().toISOString();

  for (const task of tasks) {
    try {
      const upsertInput = mapClickUpTaskToUpsert(task);
      const upsert = await upsertHubOrder(userId, upsertInput);
      if (upsert.inserted) result.inserted += 1;
      else result.updated += 1;
      try {
        await ensurePrepFromWeddingOrder(userId, upsert.id);
      } catch {
        // Prep can be caught up later.
      }
    } catch (err) {
      result.skipped += 1;
      result.errors.push(`Task ${task.id}: ${err instanceof Error ? err.message : 'upsert failed'}`);
    }
  }

  if (!dateRange) {
    await setSyncState(userId, 'clickup', 'tasks', syncedAt);
  }

  return result;
}

export async function importHubPlatform(
  userId: number,
  platform: 'nestiee' | 'honour' | 'honour_en' | 'cupmoka' | 'quickbooks' | 'clickup',
  dateRange?: HubImportDateRange
): Promise<HubSyncResult> {
  if (platform === 'clickup') {
    return await syncClickUpTasks(userId, dateRange);
  }
  if (platform === 'quickbooks') {
    return await syncQuickBooksInvoices(userId, dateRange);
  }

  const store = (await getWooStoreConfigs(userId)).find((s) => s.platform === platform);
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

  return await syncWooStore(userId, store, dateRange);
}

export interface QuickBooksTokenRow {
  user_id: number;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  realm_id: string;
}

export async function quickbooksConfigured(userId: number): Promise<boolean> {
  const creds = await getQuickBooksCredentials(userId);
  return Boolean(creds.client_id && creds.client_secret);
}

export async function quickbooksRedirectUri(userId: number, requestOrigin?: string): Promise<string> {
  const fromSettings = (await getQuickBooksCredentials(userId)).redirect_uri.trim();
  if (fromSettings) return fromSettings;
  if (process.env.QUICKBOOKS_REDIRECT_URI) return process.env.QUICKBOOKS_REDIRECT_URI;
  const base = requestOrigin || process.env.APP_URL || 'http://localhost:3000';
  return `${base.replace(/\/$/, '')}/api/integrations/quickbooks/callback`;
}

export async function quickbooksApiBase(userId: number): Promise<string> {
  const env = (await getQuickBooksCredentials(userId)).environment;
  return env === 'production'
    ? 'https://quickbooks.api.intuit.com'
    : 'https://sandbox-quickbooks.api.intuit.com';
}

export async function getQuickBooksAuthUrl(userId: number, requestOrigin?: string): Promise<string> {
  const creds = await getQuickBooksCredentials(userId);
  if (!creds.client_id) throw new Error('QuickBooks Client ID is not configured');

  const redirectUri = await quickbooksRedirectUri(userId, requestOrigin);
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

export async function saveQuickBooksTokens(
  userId: number,
  tokens: { access_token: string; refresh_token: string; expires_in: number; realmId: string }
): Promise<void> {
  const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
  await db.prepare(
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

export async function getQuickBooksTokens(userId: number): Promise<QuickBooksTokenRow | null> {
  const row = await db
    .prepare(
      `SELECT user_id, access_token, refresh_token, expires_at, realm_id
       FROM integration_tokens WHERE user_id = ? AND provider = 'quickbooks'`
    )
    .get(userId) as QuickBooksTokenRow | undefined;
  return row || null;
}

export async function isQuickBooksConnected(userId: number): Promise<boolean> {
  return Boolean((await getQuickBooksTokens(userId))?.refresh_token);
}

export async function exchangeQuickBooksCode(
  userId: number,
  code: string,
  redirectUri: string
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const creds = await getQuickBooksCredentials(userId);
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
  const creds = await getQuickBooksCredentials(userId);
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

  await saveQuickBooksTokens(userId, {
    access_token: json.access_token,
    refresh_token: json.refresh_token || row.refresh_token,
    expires_in: json.expires_in || 3600,
    realmId: row.realm_id,
  });
  return json.access_token;
}

export async function getValidQuickBooksAccessToken(userId: number): Promise<{ token: string; realmId: string }> {
  const row = await getQuickBooksTokens(userId);
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

async function allocateQbSystemNo(userId: number, qbId: string): Promise<string> {
  const existing = await db
    .prepare(
      `SELECT system_order_no FROM invoices
       WHERE user_id = ? AND source_platform = 'quickbooks' AND original_order_id = ?`
    )
    .get(userId, qbId) as { system_order_no: string | null } | undefined;
  if (existing?.system_order_no) return existing.system_order_no;

  const row = await db
    .prepare("SELECT next_serial FROM hub_order_sequences WHERE user_id = ? AND platform = 'quickbooks'")
    .get(userId) as { next_serial: number } | undefined;
  let serial = row?.next_serial ?? 1001;
  if (!row) {
    await db.prepare('INSERT INTO hub_order_sequences (user_id, platform, next_serial) VALUES (?, ?, ?)').run(
      userId,
      'quickbooks',
      serial + 1
    );
  } else {
    await db.prepare('UPDATE hub_order_sequences SET next_serial = ? WHERE user_id = ? AND platform = ?').run(
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
  const lastSync = await getSyncState(userId, 'quickbooks', 'invoices');
  let query: string;
  if (dateRange) {
    query = `select * from Invoice where TxnDate >= '${dateRange.dateFrom}' and TxnDate <= '${dateRange.dateTo}' MAXRESULTS 1000`;
  } else if (lastSync) {
    query = `select * from Invoice where MetaData.LastUpdatedTime > '${lastSync}' MAXRESULTS 1000`;
  } else {
    query = 'select * from Invoice MAXRESULTS 1000';
  }

  const url = `${await quickbooksApiBase(userId)}/v3/company/${realmId}/query?query=${encodeURIComponent(query)}`;
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

  await db.transaction(async () => {
    for (const inv of invoices) {
      try {
        const total = Number(inv.TotalAmt) || 0;
        const balance = Number(inv.Balance ?? total);
        const systemNo = await allocateQbSystemNo(userId, inv.Id);
        const docNumber = inv.DocNumber || null;
        const customerName =
          normalizeCustomerName(inv.CustomerRef?.name || '') || 'QuickBooks Customer';
        const txnDate = (inv.TxnDate || new Date().toISOString().slice(0, 10)).slice(0, 10);
        const issueDate = txnDate;
        const dueDate = (inv.DueDate || inv.TxnDate || new Date().toISOString().slice(0, 10)).slice(0, 10);

        let orderId = await findOrderForQuickBooksInvoice(userId, {
          docNumber,
          customerName,
          totalAmount: total,
          txnDate,
        });
        const wasLinked = Boolean(orderId);

        if (!orderId) {
          const orderUpsert = await upsertHubOrder(userId, {
            source_platform: 'quickbooks',
            original_order_id: inv.Id,
            customer_name: customerName,
            total_amount: total,
            status: mapQbInvoiceStatus(balance, total) === 'paid' ? '已寄出 SENT' : 'IN PROGRESS 安排中',
            created_at: (inv.MetaData?.CreateTime || `${issueDate} 00:00:00`).replace('T', ' ').slice(0, 19),
            customer_email: inv.BillEmail?.Address || null,
            description: docNumber ? `QuickBooks invoice ${docNumber}` : `QuickBooks invoice ${systemNo}`,
            external_po_number: docNumber,
            raw_payload: inv as unknown as Record<string, unknown>,
          });
          orderId = orderUpsert.id;
        }

        const upsert = await upsertHubInvoice(userId, {
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
      await setSyncState(userId, 'quickbooks', 'invoices', syncedAt);
    }
  });
  return result;
}
