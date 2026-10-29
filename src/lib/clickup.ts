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
  list?: { id?: string | number | null; name?: string | null } | null;
  custom_fields?: ClickUpCustomField[];
};

export class ClickUpApiError extends Error {
  status: number;
  constructor(status: number, detail: string) {
    super(detail);
    this.name = 'ClickUpApiError';
    this.status = status;
  }
}

export type FetchOpts = {
  date_updated_gt?: string;
  include_closed?: boolean;
};

export type ClickUpComment = {
  id: string;
  comment_text?: string | null;
  date?: string | number | null;
  /** Rich comment blocks. Images and files carry `image` / `attachment` objects. */
  comment?: unknown;
  user?: { id?: number; username?: string | null } | null;
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
    const { tasks, hasMore } = await fetchClickUpListTaskPage(creds, page, opts);
    out.push(...tasks);
    if (!hasMore) break;
    page += 1;
  }
  return out;
}

/** One page of list tasks (ClickUp returns up to 100 per page). */
export async function fetchClickUpListTaskPage(
  creds: Pick<ClickUpSettings, 'api_token' | 'list_id'>,
  page: number,
  opts?: FetchOpts,
): Promise<{ tasks: ClickUpTask[]; hasMore: boolean }> {
  const token = creds.api_token.trim();
  const listId = creds.list_id.trim();
  if (!token || !listId) {
    throw new Error('ClickUp API token and List ID are required.');
  }
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
  const tasks = body.tasks || [];
  return { tasks, hasMore: tasks.length >= 100 };
}

/** One task, including custom fields and `list.id`. Webhook delivery uses this to confirm the payment list. */
export async function fetchClickUpTask(token: string, taskId: string): Promise<ClickUpTask> {
  const trimmed = token.trim();
  const id = taskId.trim();
  if (!trimmed) throw new ClickUpApiError(401, 'ClickUp API token is required.');
  if (!id) throw new ClickUpApiError(400, 'ClickUp task id is required.');
  const res = await fetch(`https://api.clickup.com/api/v2/task/${encodeURIComponent(id)}`, {
    headers: { Authorization: trimmed },
  });
  const text = await res.text();
  if (!res.ok) {
    throw new ClickUpApiError(res.status, `ClickUp task ${res.status}: ${text.slice(0, 200)}`);
  }
  try {
    return JSON.parse(text) as ClickUpTask;
  } catch {
    throw new ClickUpApiError(502, 'ClickUp task returned invalid JSON.');
  }
}

/** Task comments, oldest pages followed via `start` / `start_id`. Capped so one task cannot stall a sync. */
export async function fetchClickUpTaskComments(token: string, taskId: string): Promise<ClickUpComment[]> {
  const trimmed = token.trim();
  if (!trimmed) throw new Error('ClickUp API token is required.');
  const out: ClickUpComment[] = [];
  const seen = new Set<string>();
  let start: string | undefined;
  let startId: string | undefined;

  for (let page = 0; page < 8; page += 1) {
    const params = new URLSearchParams();
    if (start && startId) {
      params.set('start', start);
      params.set('start_id', startId);
    }
    const qs = params.toString();
    const res = await fetch(
      `https://api.clickup.com/api/v2/task/${encodeURIComponent(taskId)}/comment${qs ? `?${qs}` : ''}`,
      { headers: { Authorization: trimmed } },
    );
    const text = await res.text();
    if (!res.ok) {
      throw new Error(`ClickUp comments ${res.status}: ${text.slice(0, 200)}`);
    }
    let body: { comments?: ClickUpComment[] };
    try {
      body = JSON.parse(text) as { comments?: ClickUpComment[] };
    } catch {
      throw new Error('ClickUp comments returned invalid JSON.');
    }
    const batch = body.comments || [];
    if (!batch.length) break;
    let added = 0;
    for (const comment of batch) {
      const id = String(comment.id || '');
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(comment);
      added += 1;
    }
    if (batch.length < 25 || added === 0) break;
    const last = batch[batch.length - 1];
    const nextId = String(last?.id || '');
    const nextStart = last?.date != null ? String(last.date) : '';
    if (!nextId || !nextStart || (nextId === startId && nextStart === start)) break;
    start = nextStart;
    startId = nextId;
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
