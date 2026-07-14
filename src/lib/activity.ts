import db from './db';

export type EntityType = 'order' | 'invoice' | 'quotation';

export interface ActivityRow {
  id: number;
  kind: 'comment' | 'activity';
  author: string | null;
  body: string;
  created_at: string;
}

const OWNER_TABLE: Record<EntityType, string> = {
  order: 'orders',
  invoice: 'invoices',
  quotation: 'quotations',
};

export function entityBelongsToUser(type: EntityType, entityId: number | string, userId: number): boolean {
  const table = OWNER_TABLE[type];
  if (!table) return false;
  const row = db.prepare(`SELECT 1 FROM ${table} WHERE id = ? AND user_id = ?`).get(entityId, userId);
  return Boolean(row);
}

export function logActivity(
  type: EntityType,
  entityId: number | string,
  userId: number,
  kind: 'comment' | 'activity',
  author: string,
  body: string
) {
  db.prepare(
    'INSERT INTO activity_logs (entity_type, entity_id, user_id, kind, author, body) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(type, entityId, userId, kind, author, body);
}

export function getActivities(type: EntityType, entityId: number | string): ActivityRow[] {
  return db
    .prepare(
      'SELECT id, kind, author, body, created_at FROM activity_logs WHERE entity_type = ? AND entity_id = ? ORDER BY created_at ASC, id ASC'
    )
    .all(type, entityId) as ActivityRow[];
}
