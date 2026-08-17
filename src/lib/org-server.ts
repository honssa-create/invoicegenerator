import db from './db';
import type { SessionPayload } from './auth';

/** Org data pool owner — child users share their admin's records. */
export async function getDataOwnerId(userIdOrSession: number | SessionPayload): Promise<number> {
  if (typeof userIdOrSession === 'object') {
    return resolveDataOwnerId(userIdOrSession);
  }
  const userId = userIdOrSession;
  const row = await db.prepare('SELECT id, owner_user_id FROM users WHERE id = ?').get(userId) as
    | { id: number; owner_user_id: number | null }
    | undefined;
  if (!row) return userId;
  return row.owner_user_id ?? row.id;
}

/** Prefer JWT claim; fall back to DB for legacy sessions without ownerUserId. */
export async function resolveDataOwnerId(session: SessionPayload): Promise<number> {
  if (typeof session.ownerUserId === 'number') return session.ownerUserId;
  return getDataOwnerId(session.userId);
}

export async function expenseWhereClause(session: SessionPayload): Promise<{ sql: string; params: number[] }> {
  const ownerId = await resolveDataOwnerId(session);
  if (session.role === 'operator') {
    return { sql: 'user_id = ? AND created_by_user_id = ?', params: [ownerId, session.userId] };
  }
  return { sql: 'user_id = ?', params: [ownerId] };
}

export async function canAccessExpense(session: SessionPayload, expenseId: number): Promise<boolean> {
  const { sql, params } = await expenseWhereClause(session);
  const row = await db.prepare(`SELECT 1 FROM expenses WHERE id = ? AND ${sql}`).get(expenseId, ...params);
  return Boolean(row);
}

/** Rental data is org-scoped like expenses/invoices. */
export async function rentalOwnerId(userIdOrSession: number | SessionPayload): Promise<number> {
  return getDataOwnerId(userIdOrSession);
}
