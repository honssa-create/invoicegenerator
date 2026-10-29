import type { ClickUpComment, ClickUpTask } from './clickup';
import { fetchClickUpListTaskPage, fetchClickUpTaskComments } from './clickup';
import db from './db';
import { getSyncState, setSyncState } from './hub-server';
import { getClickUpCredentials } from './integration-settings-server';
import {
  clickUpPaymentListId,
  extractPaymentLedgerRows,
  type PaymentLedgerAttachment,
  type PaymentLedgerDraft,
} from './payment-ledger';

const PROVIDER = 'clickup';
const COMMENT_BUDGET = 40;
const COMMENT_STALE_MS = 24 * 60 * 60 * 1000;
const MAX_LIST_PAGES_PER_WALK = 20;
const KEY = {
  scanPage: 'payment_ledger_scan_page',
  scanOffset: 'payment_ledger_scan_offset',
  watermark: 'payment_ledger_watermark',
  incSince: 'payment_ledger_inc_since',
  incNext: 'payment_ledger_inc_next',
  incPage: 'payment_ledger_inc_page',
  incOffset: 'payment_ledger_inc_offset',
  last: 'payment_ledger_last',
} as const;

export type PaymentLedgerEntry = {
  id: number;
  paid_date: string | null;
  amount: number | null;
  order_no: string | null;
  notes: string | null;
  link: string | null;
  attachments: PaymentLedgerAttachment[];
  source: string;
  clickup_task_id: string | null;
  updated_at: string | null;
};

export type PaymentLedgerSyncResult = {
  user_id: number;
  list_id: string;
  tasks_seen: number;
  comment_fetches: number;
  upserted: number;
  removed: number;
  cycle_complete: boolean;
  errors: string[];
  skipped?: string;
};

export type PaymentLedgerClickUpClient = {
  listPage: (
    page: number,
    opts?: { date_updated_gt?: string },
  ) => Promise<{ tasks: ClickUpTask[]; hasMore: boolean }>;
  comments: (taskId: string) => Promise<ClickUpComment[]>;
};

type TaskCursor = { date_updated: string | null; comments_checked_at: string | null };

function numState(value: string | null): number {
  const n = Number(value || '0');
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function emptyResult(userId: number, listId: string): PaymentLedgerSyncResult {
  return {
    user_id: userId,
    list_id: listId,
    tasks_seen: 0,
    comment_fetches: 0,
    upserted: 0,
    removed: 0,
    cycle_complete: false,
    errors: [],
  };
}

function pushError(result: PaymentLedgerSyncResult, message: string) {
  if (result.errors.length >= 15) return;
  result.errors.push(message);
}

async function readState(userId: number, key: string): Promise<string | null> {
  return getSyncState(userId, PROVIDER, key);
}

async function writeState(userId: number, key: string, value: string): Promise<void> {
  await setSyncState(userId, PROVIDER, key, value);
}

async function clearState(userId: number, key: string): Promise<void> {
  await db
    .prepare(`DELETE FROM integration_sync_state WHERE user_id = ? AND provider = ? AND store_key = ?`)
    .run(userId, PROVIDER, key);
}

function parseAttachments(raw: unknown): PaymentLedgerAttachment[] {
  if (Array.isArray(raw)) return raw as PaymentLedgerAttachment[];
  if (typeof raw !== 'string' || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as PaymentLedgerAttachment[]) : [];
  } catch {
    return [];
  }
}

export async function listPaymentLedger(userId: number): Promise<PaymentLedgerEntry[]> {
  const rows = await db
    .prepare(
      `SELECT id, paid_date, amount, order_no, notes, link, attachments_json, source, clickup_task_id, updated_at
       FROM payment_ledger
       WHERE user_id = ?
       ORDER BY paid_date DESC NULLS LAST, id DESC
       LIMIT 2000`,
    )
    .all(userId);
  return rows.map((row) => ({
    id: Number(row.id),
    paid_date: (row.paid_date as string) || null,
    amount: row.amount == null ? null : Number(row.amount),
    order_no: (row.order_no as string) || null,
    notes: (row.notes as string) || null,
    link: (row.link as string) || null,
    attachments: parseAttachments(row.attachments_json),
    source: String(row.source || ''),
    clickup_task_id: (row.clickup_task_id as string) || null,
    updated_at: (row.updated_at as string) || null,
  }));
}

export async function paymentLedgerSyncStatus(userId: number): Promise<{
  configured: boolean;
  list_id: string;
  scan_page: number;
  watermark: string | null;
  last: PaymentLedgerSyncResult | null;
}> {
  const creds = await getClickUpCredentials(userId);
  const lastRaw = await readState(userId, KEY.last);
  let last: PaymentLedgerSyncResult | null = null;
  if (lastRaw) {
    try {
      last = JSON.parse(lastRaw) as PaymentLedgerSyncResult;
    } catch {
      last = null;
    }
  }
  return {
    configured: Boolean(creds.api_token.trim()),
    list_id: clickUpPaymentListId(),
    scan_page: numState(await readState(userId, KEY.scanPage)),
    watermark: await readState(userId, KEY.watermark),
    last,
  };
}

async function taskCursor(userId: number, taskId: string): Promise<TaskCursor | null> {
  const row = await db
    .prepare(
      `SELECT date_updated, comments_checked_at FROM payment_ledger_tasks WHERE user_id = ? AND task_id = ?`,
    )
    .get(userId, taskId) as TaskCursor | undefined;
  return row || null;
}

function needsCommentFetch(prev: TaskCursor | null, task: ClickUpTask, now: number): boolean {
  if (!prev?.comments_checked_at) return true;
  if ((prev.date_updated || '') !== (task.date_updated || '')) return true;
  const checked = Date.parse(prev.comments_checked_at);
  if (!Number.isFinite(checked)) return true;
  return now - checked > COMMENT_STALE_MS;
}

async function deleteSourceExcept(
  userId: number,
  taskId: string,
  source: PaymentLedgerDraft['source'],
  keys: string[],
): Promise<number> {
  if (!keys.length) {
    const result = await db
      .prepare(`DELETE FROM payment_ledger WHERE user_id = ? AND clickup_task_id = ? AND source = ?`)
      .run(userId, taskId, source);
    return result.changes;
  }
  const placeholders = keys.map(() => '?').join(', ');
  const result = await db
    .prepare(
      `DELETE FROM payment_ledger
       WHERE user_id = ? AND clickup_task_id = ? AND source = ? AND dedupe_key NOT IN (${placeholders})`,
    )
    .run(userId, taskId, source, ...keys);
  return result.changes;
}

async function upsertRow(userId: number, row: PaymentLedgerDraft): Promise<void> {
  await db
    .prepare(
      `INSERT INTO payment_ledger (
         user_id, dedupe_key, paid_date, amount, order_no, notes, link, attachments_json,
         clickup_task_id, source, updated_at
       ) VALUES (
         ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
         to_char(NOW() AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD HH24:MI:SS')
       )
       ON CONFLICT (user_id, dedupe_key) DO UPDATE SET
         paid_date = EXCLUDED.paid_date,
         amount = EXCLUDED.amount,
         order_no = EXCLUDED.order_no,
         notes = EXCLUDED.notes,
         link = EXCLUDED.link,
         attachments_json = EXCLUDED.attachments_json,
         clickup_task_id = EXCLUDED.clickup_task_id,
         source = EXCLUDED.source,
         updated_at = to_char(NOW() AT TIME ZONE 'Asia/Hong_Kong', 'YYYY-MM-DD HH24:MI:SS')`,
    )
    .run(
      userId,
      row.dedupe_key,
      row.paid_date,
      row.amount,
      row.order_no || null,
      row.notes || null,
      row.link || null,
      JSON.stringify(row.attachments || []),
      row.clickup_task_id,
      row.source,
    );
}

/** Replace installment rows for a task. Comment rows are replaced only when comments were fetched. */
export async function saveTaskPaymentRows(
  userId: number,
  taskId: string,
  rows: PaymentLedgerDraft[],
  opts: { replaceComments: boolean },
): Promise<{ upserted: number; removed: number }> {
  const installments = rows.filter((row) => row.source === 'installment');
  const comments = rows.filter((row) => row.source === 'comment');
  let removed = 0;
  let upserted = 0;
  await db.transaction(async () => {
    removed += await deleteSourceExcept(
      userId,
      taskId,
      'installment',
      installments.map((row) => row.dedupe_key),
    );
    if (opts.replaceComments) {
      removed += await deleteSourceExcept(
        userId,
        taskId,
        'comment',
        comments.map((row) => row.dedupe_key),
      );
    }
    const toWrite = opts.replaceComments ? rows : installments;
    for (const row of toWrite) {
      await upsertRow(userId, row);
      upserted += 1;
    }
  });
  return { upserted, removed };
}

async function rememberTask(
  userId: number,
  task: ClickUpTask,
  commentsCheckedAt: string | null,
): Promise<void> {
  await db
    .prepare(
      `INSERT INTO payment_ledger_tasks (user_id, task_id, date_updated, comments_checked_at)
       VALUES (?, ?, ?, ?)
       ON CONFLICT (user_id, task_id) DO UPDATE SET
         date_updated = EXCLUDED.date_updated,
         comments_checked_at = COALESCE(EXCLUDED.comments_checked_at, payment_ledger_tasks.comments_checked_at)`,
    )
    .run(userId, task.id, task.date_updated || null, commentsCheckedAt);
}

type WalkArgs = {
  userId: number;
  client: PaymentLedgerClickUpClient;
  result: PaymentLedgerSyncResult;
  since: string | null;
  page: number;
  offset: number;
  budget: number;
  seen: Set<string>;
  now: number;
};

async function walkTasks(args: WalkArgs): Promise<{ budget: number; page: number; offset: number; finished: boolean }> {
  let { page, offset, budget } = args;
  let pageFetches = 0;
  while (budget > 0 && pageFetches < MAX_LIST_PAGES_PER_WALK) {
    pageFetches += 1;
    const dateUpdatedGt = args.since ? String(Math.max(0, Number(args.since) - 60_000)) : undefined;
    const { tasks } = await args.client.listPage(page, dateUpdatedGt ? { date_updated_gt: dateUpdatedGt } : undefined);
    if (!tasks.length) return { budget, page: 0, offset: 0, finished: true };
    const slice = tasks.slice(offset);
    let index = 0;
    for (const task of slice) {
      if (!task?.id) {
        index += 1;
        continue;
      }
      if (args.seen.has(task.id)) {
        index += 1;
        args.result.tasks_seen += 1;
        continue;
      }
      const prev = await taskCursor(args.userId, task.id);
      const fetchComments = needsCommentFetch(prev, task, args.now);
      if (fetchComments && budget <= 0) break;
      args.seen.add(task.id);
      args.result.tasks_seen += 1;
      let comments: ClickUpComment[] | null = null;
      let replaceComments = false;
      if (fetchComments) {
        budget -= 1;
        args.result.comment_fetches += 1;
        try {
          comments = await args.client.comments(task.id);
          replaceComments = true;
        } catch (err) {
          pushError(
            args.result,
            `Task ${task.id}: ${err instanceof Error ? err.message : 'comment fetch failed'}`,
          );
        }
      } else {
        index += 1;
        continue;
      }
      const rows = extractPaymentLedgerRows(task, comments || []);
      const saved = await saveTaskPaymentRows(args.userId, task.id, rows, { replaceComments });
      args.result.upserted += saved.upserted;
      args.result.removed += saved.removed;
      await rememberTask(args.userId, task, new Date(args.now).toISOString());
      index += 1;
    }
    offset += index;
    if (offset < tasks.length) return { budget, page, offset, finished: false };
    if (tasks.length < 100) return { budget, page: 0, offset: 0, finished: true };
    page += 1;
    offset = 0;
  }
  return { budget, page, offset, finished: false };
}

function defaultClient(token: string, listId: string): PaymentLedgerClickUpClient {
  return {
    listPage: (page, opts) =>
      fetchClickUpListTaskPage({ api_token: token, list_id: listId }, page, {
        include_closed: true,
        date_updated_gt: opts?.date_updated_gt,
      }),
    comments: (taskId) => fetchClickUpTaskComments(token, taskId),
  };
}

/**
 * Poll Nestiee 婚宴回禮 for payment comments and payment fields.
 * Each call fetches at most {@link COMMENT_BUDGET} comment threads so cron stays inside ClickUp rate limits.
 * Order Hub sync does not read comments; this job owns that.
 */
export async function syncPaymentLedger(
  userId: number,
  client?: PaymentLedgerClickUpClient,
): Promise<PaymentLedgerSyncResult> {
  const listId = clickUpPaymentListId();
  const result = emptyResult(userId, listId);
  const creds = await getClickUpCredentials(userId);
  const token = creds.api_token.trim();
  if (!token && !client) {
    result.skipped =
      'ClickUp API token is not set. Add it under Settings → Integrations → ClickUp, or set CLICKUP_API_TOKEN.';
    result.errors.push(result.skipped);
    await writeState(userId, KEY.last, JSON.stringify(result));
    return result;
  }
  const api = client || defaultClient(token, listId);
  const now = Date.now();
  const seen = new Set<string>();
  let budget = COMMENT_BUDGET;

  try {
    let incSince = await readState(userId, KEY.incSince);
    let incNext = await readState(userId, KEY.incNext);
    let incPage = numState(await readState(userId, KEY.incPage));
    let incOffset = numState(await readState(userId, KEY.incOffset));
    const watermark = await readState(userId, KEY.watermark);
    if (!incSince && watermark) {
      incSince = watermark;
      incNext = String(now);
      incPage = 0;
      incOffset = 0;
    }

    let incrementalOpen = Boolean(incSince);
    if (incSince) {
      const walked = await walkTasks({
        userId,
        client: api,
        result,
        since: incSince,
        page: incPage,
        offset: incOffset,
        budget,
        seen,
        now,
      });
      budget = walked.budget;
      if (walked.finished) {
        await writeState(userId, KEY.watermark, incNext || String(now));
        await clearState(userId, KEY.incSince);
        await clearState(userId, KEY.incNext);
        await clearState(userId, KEY.incPage);
        await clearState(userId, KEY.incOffset);
        incrementalOpen = false;
      } else {
        await writeState(userId, KEY.incSince, incSince);
        await writeState(userId, KEY.incNext, incNext || String(now));
        await writeState(userId, KEY.incPage, String(walked.page));
        await writeState(userId, KEY.incOffset, String(walked.offset));
      }
    }

    if (!incrementalOpen && budget > 0) {
      const scanPage = numState(await readState(userId, KEY.scanPage));
      const scanOffset = numState(await readState(userId, KEY.scanOffset));
      const walked = await walkTasks({
        userId,
        client: api,
        result,
        since: null,
        page: scanPage,
        offset: scanOffset,
        budget,
        seen,
        now,
      });
      if (walked.finished) {
        await writeState(userId, KEY.scanPage, '0');
        await writeState(userId, KEY.scanOffset, '0');
        result.cycle_complete = true;
        if (!(await readState(userId, KEY.watermark))) {
          await writeState(userId, KEY.watermark, String(now));
        }
      } else {
        await writeState(userId, KEY.scanPage, String(walked.page));
        await writeState(userId, KEY.scanOffset, String(walked.offset));
        if (!(await readState(userId, KEY.watermark))) {
          await writeState(userId, KEY.watermark, String(now));
        }
      }
    }
  } catch (err) {
    pushError(result, err instanceof Error ? err.message : 'Payment ledger sync failed');
  }

  await writeState(userId, KEY.last, JSON.stringify(result));
  return result;
}
