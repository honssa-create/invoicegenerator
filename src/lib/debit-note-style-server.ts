import db from '@/lib/db';
import {
  DEFAULT_DEBIT_NOTE_STYLE,
  normalizeDebitNoteStyle,
  type DebitNoteStyleTemplate,
} from '@/lib/debit-note-style';
import type { DebitNoteCompanyId } from '@/lib/rentals';
import type { TemplateCompanyVariantId } from '@/lib/document-templates';

const COMPANY_KEYS: TemplateCompanyVariantId[] = ['label', 'elite', 'joint'];

export async function getDebitNoteStyleTemplate(
  userId: number,
  companyKey: TemplateCompanyVariantId = 'label',
): Promise<DebitNoteStyleTemplate> {
  const row = await db.prepare(
    'SELECT styles_json FROM rental_debit_note_styles WHERE user_id = ? AND company_key = ?'
  ).get(userId, companyKey) as { styles_json: string } | undefined;
  if (!row?.styles_json) return { ...DEFAULT_DEBIT_NOTE_STYLE };
  try {
    return normalizeDebitNoteStyle(JSON.parse(row.styles_json) as Partial<DebitNoteStyleTemplate>);
  } catch {
    return { ...DEFAULT_DEBIT_NOTE_STYLE };
  }
}

export async function listDebitNoteStyleTemplates(
  userId: number,
): Promise<Record<TemplateCompanyVariantId, DebitNoteStyleTemplate>> {
  return {
    label: await getDebitNoteStyleTemplate(userId, 'label'),
    elite: await getDebitNoteStyleTemplate(userId, 'elite'),
    joint: await getDebitNoteStyleTemplate(userId, 'joint'),
  };
}

export async function saveDebitNoteStyleTemplate(
  userId: number,
  companyKey: TemplateCompanyVariantId,
  style: DebitNoteStyleTemplate,
): Promise<DebitNoteStyleTemplate> {
  const normalized = normalizeDebitNoteStyle(style);
  const json = JSON.stringify(normalized);
  await db.prepare(
    `INSERT INTO rental_debit_note_styles (user_id, company_key, styles_json, updated_at)
     VALUES (?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, company_key) DO UPDATE SET styles_json = excluded.styles_json, updated_at = datetime('now')`
  ).run(userId, companyKey, json);
  return normalized;
}

export { COMPANY_KEYS as DEBIT_NOTE_STYLE_COMPANY_KEYS };
