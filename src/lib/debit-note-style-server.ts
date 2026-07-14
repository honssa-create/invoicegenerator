import db from '@/lib/db';
import {
  DEFAULT_DEBIT_NOTE_STYLE,
  normalizeDebitNoteStyle,
  type DebitNoteStyleTemplate,
} from '@/lib/debit-note-style';
import type { DebitNoteCompanyId } from '@/lib/rentals';
import type { TemplateCompanyVariantId } from '@/lib/document-templates';

const COMPANY_KEYS: TemplateCompanyVariantId[] = ['label', 'elite', 'joint'];

export function getDebitNoteStyleTemplate(
  userId: number,
  companyKey: TemplateCompanyVariantId = 'label',
): DebitNoteStyleTemplate {
  const row = db.prepare(
    'SELECT styles_json FROM rental_debit_note_styles WHERE user_id = ? AND company_key = ?'
  ).get(userId, companyKey) as { styles_json: string } | undefined;
  if (!row?.styles_json) return { ...DEFAULT_DEBIT_NOTE_STYLE };
  try {
    return normalizeDebitNoteStyle(JSON.parse(row.styles_json) as Partial<DebitNoteStyleTemplate>);
  } catch {
    return { ...DEFAULT_DEBIT_NOTE_STYLE };
  }
}

export function listDebitNoteStyleTemplates(
  userId: number,
): Record<TemplateCompanyVariantId, DebitNoteStyleTemplate> {
  return {
    label: getDebitNoteStyleTemplate(userId, 'label'),
    elite: getDebitNoteStyleTemplate(userId, 'elite'),
    joint: getDebitNoteStyleTemplate(userId, 'joint'),
  };
}

export function saveDebitNoteStyleTemplate(
  userId: number,
  companyKey: TemplateCompanyVariantId,
  style: DebitNoteStyleTemplate,
): DebitNoteStyleTemplate {
  const normalized = normalizeDebitNoteStyle(style);
  const json = JSON.stringify(normalized);
  db.prepare(
    `INSERT INTO rental_debit_note_styles (user_id, company_key, styles_json, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, company_key) DO UPDATE SET styles_json = excluded.styles_json, updated_at = datetime('now')`
  ).run(userId, companyKey, json);
  return normalized;
}

export { COMPANY_KEYS as DEBIT_NOTE_STYLE_COMPANY_KEYS };
