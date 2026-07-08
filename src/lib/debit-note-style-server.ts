import db from '@/lib/db';
import {
  DEFAULT_DEBIT_NOTE_STYLE,
  normalizeDebitNoteStyle,
  type DebitNoteStyleTemplate,
} from '@/lib/debit-note-style';

export function getDebitNoteStyleTemplate(userId: number): DebitNoteStyleTemplate {
  const row = db.prepare(
    'SELECT styles_json FROM rental_debit_note_styles WHERE user_id = ?'
  ).get(userId) as { styles_json: string } | undefined;
  if (!row?.styles_json) return { ...DEFAULT_DEBIT_NOTE_STYLE };
  try {
    return normalizeDebitNoteStyle(JSON.parse(row.styles_json) as Partial<DebitNoteStyleTemplate>);
  } catch {
    return { ...DEFAULT_DEBIT_NOTE_STYLE };
  }
}

export function saveDebitNoteStyleTemplate(userId: number, style: DebitNoteStyleTemplate): DebitNoteStyleTemplate {
  const normalized = normalizeDebitNoteStyle(style);
  const json = JSON.stringify(normalized);
  db.prepare(
    `INSERT INTO rental_debit_note_styles (user_id, styles_json, updated_at)
     VALUES (?, ?, datetime('now'))
     ON CONFLICT(user_id) DO UPDATE SET styles_json = excluded.styles_json, updated_at = datetime('now')`
  ).run(userId, json);
  return normalized;
}
