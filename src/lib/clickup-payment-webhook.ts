import {
  ClickUpApiError,
  fetchClickUpTask,
  fetchClickUpTaskComments,
  type ClickUpComment,
  type ClickUpTask,
} from './clickup';
import { decideClickUpPaymentWebhook } from './clickup-webhook';
import { listHubCronOwnerUserIds } from './hub-server';
import { getClickUpCredentials } from './integration-settings-server';
import { clickUpPaymentListId } from './payment-ledger';
import { applyPaymentLedgerTask } from './payment-ledger-server';

export type ClickUpPaymentIngestBody = {
  ok: boolean;
  ignored?: string;
  task_id?: string;
  list_id?: string;
  owners?: number[];
  upserted?: number;
  removed?: number;
  reason?: string;
  error?: string;
};

export type ClickUpPaymentIngestResult = {
  status: number;
  body: ClickUpPaymentIngestBody;
};

type IngestDeps = {
  ownerIds?: () => Promise<number[]>;
  loadToken?: (userId: number) => Promise<string>;
  loadTask?: (token: string, taskId: string) => Promise<ClickUpTask>;
  loadComments?: (token: string, taskId: string) => Promise<ClickUpComment[]>;
};

function listIdOf(task: ClickUpTask): string {
  const id = task.list?.id;
  if (id == null) return '';
  return String(id).trim();
}

/**
 * Verify the caller already checked `X-Signature`. This fetches the task and its comments,
 * then upserts with the same extractor the payment-ledger cron uses.
 * Rows are written for the same owner accounts as `GET /api/cron/payment-ledger`.
 */
export async function ingestClickUpPaymentWebhook(
  payload: unknown,
  deps?: IngestDeps,
): Promise<ClickUpPaymentIngestResult> {
  const decision = decideClickUpPaymentWebhook(payload);
  if (decision.action === 'ignore') {
    return { status: 200, body: { ok: true, ignored: decision.reason } };
  }

  const ownerIds = await (deps?.ownerIds ?? listHubCronOwnerUserIds)();
  const loadToken = deps?.loadToken ?? (async (userId: number) => (await getClickUpCredentials(userId)).api_token);
  const loadTask = deps?.loadTask ?? fetchClickUpTask;
  const loadComments = deps?.loadComments ?? fetchClickUpTaskComments;

  const targets: number[] = [];
  let token = '';
  for (const ownerId of ownerIds) {
    const value = (await loadToken(ownerId)).trim();
    if (!value) continue;
    targets.push(ownerId);
    if (!token) token = value;
  }
  if (!targets.length || !token) {
    return {
      status: 503,
      body: {
        ok: false,
        error:
          'ClickUp API token is not set. Add it under Settings → Integrations → ClickUp, or set CLICKUP_API_TOKEN.',
      },
    };
  }

  let task: ClickUpTask;
  try {
    task = await loadTask(token, decision.taskId);
  } catch (err) {
    if (err instanceof ClickUpApiError && err.status === 404) {
      return { status: 200, body: { ok: true, ignored: 'task not found', task_id: decision.taskId } };
    }
    throw err;
  }
  if (!task?.id) {
    return { status: 200, body: { ok: true, ignored: 'task has no id', task_id: decision.taskId } };
  }

  const listId = clickUpPaymentListId();
  const foundList = listIdOf(task);
  if (foundList !== listId) {
    return {
      status: 200,
      body: {
        ok: true,
        ignored: 'different list',
        task_id: task.id,
        ...(foundList ? { list_id: foundList } : {}),
      },
    };
  }

  const comments = await loadComments(token, task.id);
  let upserted = 0;
  let removed = 0;
  for (const ownerId of targets) {
    const saved = await applyPaymentLedgerTask(ownerId, task, comments);
    upserted += saved.upserted;
    removed += saved.removed;
  }

  return {
    status: 200,
    body: {
      ok: true,
      task_id: task.id,
      list_id: listId,
      owners: targets,
      upserted,
      removed,
      reason: decision.reason,
    },
  };
}
