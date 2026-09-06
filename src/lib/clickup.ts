import type { ClickUpSettings } from './integration-settings';

export type ClickUpCustomField = {
  id: string;
  name: string;
  type: string;
  value?: unknown;
  type_config?: {
    options?: { id: string; label: string; color?: string; orderindex?: number }[];
  };
};

export type ClickUpTask = {
  id: string;
  name: string;
  description?: string | null;
  text_content?: string | null;
  status?: { status?: string | null };
  due_date?: string | null;
  date_created?: string | null;
  date_updated?: string | null;
  url?: string | null;
  custom_fields?: ClickUpCustomField[];
};

type FetchOpts = {
  date_updated_gt?: string;
  include_closed?: boolean;
};

export async function fetchClickUpListTasks(
  creds: Pick<ClickUpSettings, 'api_token' | 'list_id'>,
  opts?: FetchOpts,
): Promise<ClickUpTask[]> {
  const token = creds.api_token.trim();
  const listId = creds.list_id.trim();
  if (!token || !listId) {
    throw new Error('ClickUp API token and List ID are required.');
  }

  const out: ClickUpTask[] = [];
  let page = 0;
  while (true) {
    const params = new URLSearchParams();
    params.set('include_closed', opts?.include_closed === false ? 'false' : 'true');
    params.set('page', String(page));
    if (opts?.date_updated_gt) params.set('date_updated_gt', opts.date_updated_gt);

    const res = await fetch(`https://api.clickup.com/api/v2/list/${encodeURIComponent(listId)}/task?${params}`, {
      headers: { Authorization: token },
    });
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`ClickUp API ${res.status}: ${text.slice(0, 200)}`);
    }
    let body: { tasks?: ClickUpTask[] };
    try {
      body = JSON.parse(text) as { tasks?: ClickUpTask[] };
    } catch {
      throw new Error('ClickUp API returned invalid JSON.');
    }
    const batch = body.tasks || [];
    out.push(...batch);
    if (batch.length < 100) break;
    page += 1;
  }
  return out;
}

/** ClickUp unix-ms → `YYYY-MM-DD HH:mm:ss` for orders.created_at. */
export function clickUpMsToCreatedAt(ms: string | null | undefined): string {
  const n = Number(ms);
  if (!Number.isFinite(n) || n <= 0) {
    const now = new Date();
    return now.toISOString().replace('T', ' ').slice(0, 19);
  }
  return new Date(n).toISOString().replace('T', ' ').slice(0, 19);
}

/** ClickUp unix-ms → `YYYY-MM-DD`. */
export function clickUpMsToDateYmd(ms: string | number | null | undefined): string | null {
  const n = typeof ms === 'number' ? ms : Number(ms);
  if (!Number.isFinite(n) || n <= 0) return null;
  return new Date(n).toISOString().slice(0, 10);
}
