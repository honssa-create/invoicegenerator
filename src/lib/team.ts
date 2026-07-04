import db from './db';

export function getTeamUserIds(userId: number): number[] {
  const user = db.prepare('SELECT team_id FROM users WHERE id = ?').get(userId) as
    | { team_id: number | null }
    | undefined;

  const teamId = user?.team_id ?? userId;
  const members = db
    .prepare('SELECT id FROM users WHERE team_id = ?')
    .all(teamId) as { id: number }[];

  return members.length > 0 ? members.map((m) => m.id) : [userId];
}

export function teamIdClause(column: string, userId: number): { clause: string; params: number[] } {
  const ids = getTeamUserIds(userId);
  const placeholders = ids.map(() => '?').join(', ');
  return { clause: `${column} IN (${placeholders})`, params: ids };
}

export function resolveTeamId(companyName: string | undefined, newUserId: number): number {
  const trimmed = companyName?.trim();
  if (trimmed) {
    const existing = db
      .prepare('SELECT team_id FROM users WHERE company_name = ? AND team_id IS NOT NULL LIMIT 1')
      .get(trimmed) as { team_id: number } | undefined;
    if (existing) return existing.team_id;
  }
  return newUserId;
}
