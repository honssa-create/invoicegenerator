import db from './db';
import type { SessionPayload } from './auth';

/** Org data pool owner — child users share their admin's records. */
export function getDataOwnerId(userId: number): number {
  const row = db.prepare('SELECT id, owner_user_id FROM users WHERE id = ?').get(userId) as
    | { id: number; owner_user_id: number | null }
    | undefined;
  if (!row) return userId;
  return row.owner_user_id ?? row.id;
}

export function expenseWhereClause(session: SessionPayload): { sql: string; params: number[] } {
  const ownerId = getDataOwnerId(session.userId);
  if (session.role === 'operator') {
    return { sql: 'user_id = ? AND created_by_user_id = ?', params: [ownerId, session.userId] };
  }
  return { sql: 'user_id = ?', params: [ownerId] };
}

export function canAccessExpense(session: SessionPayload, expenseId: number): boolean {
  const { sql, params } = expenseWhereClause(session);
  const row = db.prepare(`SELECT 1 FROM expenses WHERE id = ? AND ${sql}`).get(expenseId, ...params);
  return Boolean(row);
}
