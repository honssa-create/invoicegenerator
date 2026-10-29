import { afterEach, describe, expect, it } from 'vitest';
import { ClickUpApiError, type ClickUpComment, type ClickUpTask } from './clickup';
import { ingestClickUpPaymentWebhook } from './clickup-payment-webhook';
import db from './db';

const USER_ID = 99941;

const task: ClickUpTask = {
  id: 'task-webhook-1',
  name: '12104 - Shirley Ho',
  url: 'https://app.clickup.com/t/task-webhook-1',
  date_updated: '1793182594511',
  list: { id: '901812202272', name: '婚宴回禮' },
  custom_fields: [
    { id: 'd1', name: '第一次Payment日期', type: 'date', value: '1792180800000' },
    { id: 'a1', name: '第一次Payment ($)', type: 'number', value: '6288.5' },
  ],
};

const comment: ClickUpComment = {
  id: 'c-tail',
  comment_text: '已付 $100 尾數',
  date: '1792255649598',
};

async function cleanup() {
  await db.prepare('DELETE FROM payment_ledger WHERE user_id = ?').run(USER_ID);
  await db.prepare('DELETE FROM payment_ledger_tasks WHERE user_id = ?').run(USER_ID);
  await db.prepare('DELETE FROM users WHERE id = ?').run(USER_ID);
}

describe('ingestClickUpPaymentWebhook', () => {
  afterEach(async () => {
    await cleanup();
  });

  it('upserts payment fields and comments for the Nestiee list', async () => {
    await cleanup();
    await db
      .prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
      .run(USER_ID, 'ledger-webhook@example.com', 'hash', 'Ledger Webhook');

    let commentFetches = 0;
    const deps = {
      ownerIds: async () => [USER_ID],
      loadToken: async () => 'pk_test',
      loadTask: async () => task,
      loadComments: async () => {
        commentFetches += 1;
        return [comment];
      },
    };

    const first = await ingestClickUpPaymentWebhook(
      {
        event: 'taskCommentPosted',
        task_id: task.id,
        history_items: [{ field: 'comment' }],
      },
      deps,
    );
    expect(first.status).toBe(200);
    expect(first.body.ok).toBe(true);
    expect(first.body.upserted).toBe(2);
    expect(commentFetches).toBe(1);

    const rows = (await db
      .prepare(
        `SELECT dedupe_key, source, amount, order_no, category FROM payment_ledger WHERE user_id = ? ORDER BY dedupe_key`,
      )
      .all(USER_ID)) as { dedupe_key: string; source: string; amount: number; order_no: string; category: string }[];
    expect(rows.map((row) => row.dedupe_key)).toEqual([
      'comment:task-webhook-1:c-tail',
      'installment:task-webhook-1:1',
    ]);
    expect(rows.find((row) => row.source === 'installment')?.amount).toBe(6288.5);
    expect(rows.find((row) => row.source === 'comment')?.amount).toBe(100);
    expect(rows.every((row) => row.order_no === '12104' && row.category === '回禮')).toBe(true);

    const again = await ingestClickUpPaymentWebhook(
      {
        event: 'taskUpdated',
        task_id: task.id,
        history_items: [{ field: 'custom_field', custom_field: { name: '第一次Payment ($)' } }],
      },
      deps,
    );
    expect(again.body.upserted).toBe(2);
    const count = (await db.prepare('SELECT COUNT(*)::int AS n FROM payment_ledger WHERE user_id = ?').get(USER_ID)) as {
      n: number;
    };
    expect(Number(count.n)).toBe(2);

    const ignored = await ingestClickUpPaymentWebhook(
      { event: 'taskUpdated', task_id: task.id, history_items: [{ field: 'custom_field', custom_field: { name: 'Phone' } }] },
      {
        ...deps,
        loadTask: async () => {
          throw new Error('should not fetch');
        },
      },
    );
    expect(ignored).toEqual({ status: 200, body: { ok: true, ignored: 'custom field is not a payment field' } });
    const afterIgnore = (await db
      .prepare('SELECT COUNT(*)::int AS n FROM payment_ledger WHERE user_id = ?')
      .get(USER_ID)) as { n: number };
    expect(Number(afterIgnore.n)).toBe(2);
  });

  it('does not write rows for another list, a missing task, or a missing token', async () => {
    await cleanup();
    await db
      .prepare('INSERT INTO users (id, email, password_hash, name) VALUES (?, ?, ?, ?)')
      .run(USER_ID, 'ledger-webhook@example.com', 'hash', 'Ledger Webhook');

    const otherList = await ingestClickUpPaymentWebhook(
      { event: 'taskCommentPosted', task_id: 'other-task' },
      {
        ownerIds: async () => [USER_ID],
        loadToken: async () => 'pk_test',
        loadTask: async () => ({ ...task, id: 'other-task', list: { id: 123 } }),
        loadComments: async () => {
          throw new Error('comments should not load');
        },
      },
    );
    expect(otherList.status).toBe(200);
    expect(otherList.body.ignored).toBe('different list');
    expect(otherList.body.list_id).toBe('123');

    const missing = await ingestClickUpPaymentWebhook(
      { event: 'taskCommentUpdated', task_id: 'gone' },
      {
        ownerIds: async () => [USER_ID],
        loadToken: async () => 'pk_test',
        loadTask: async () => {
          throw new ClickUpApiError(404, 'ClickUp task 404: not found');
        },
        loadComments: async () => [],
      },
    );
    expect(missing.body.ignored).toBe('task not found');

    const noToken = await ingestClickUpPaymentWebhook(
      { event: 'taskCommentPosted', task_id: task.id },
      {
        ownerIds: async () => [USER_ID],
        loadToken: async () => '  ',
        loadTask: async () => task,
        loadComments: async () => [comment],
      },
    );
    expect(noToken.status).toBe(503);
    expect(noToken.body.ok).toBe(false);

    const count = (await db.prepare('SELECT COUNT(*)::int AS n FROM payment_ledger WHERE user_id = ?').get(USER_ID)) as {
      n: number;
    };
    expect(Number(count.n)).toBe(0);
  });
});
