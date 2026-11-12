/** Presentation helpers for the wedding-gift ClickUp-style comments rail. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const AVATAR_BY_LETTER: Record<string, string> = {
  T: '#2f333a',
  V: '#7c6bc4',
};

const AVATAR_PALETTE = ['#7c6bc4', '#2f333a', '#0f766e', '#b45309', '#1d4ed8', '#be185d'];

export function localDateYmd(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function feedDayKey(createdAt: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})/.exec(String(createdAt || '').trim());
  return match ? match[1] : '';
}

export function feedDayLabel(dayKey: string, todayYmd: string): string {
  if (!dayKey) return '';
  if (dayKey === todayYmd) return 'Today';
  const [year, month, day] = dayKey.split('-').map(Number);
  const name = MONTHS[(month || 1) - 1] || '';
  if (!name || !day) return dayKey;
  const todayYear = Number(todayYmd.slice(0, 4));
  return year === todayYear ? `${day} ${name}` : `${day} ${name} ${year}`;
}

/** Clock stored on the activity row, shown as 11:42 AM. */
export function formatFeedClock(createdAt: string): string {
  const match = /(?:T|\s)(\d{2}):(\d{2})/.exec(String(createdAt || '').trim())
    || /(\d{2}):(\d{2})/.exec(String(createdAt || '').trim());
  if (!match) return '';
  let hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}

export function commentInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 1).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function commentAvatarColor(name: string): string {
  const initial = commentInitials(name).slice(0, 1);
  if (AVATAR_BY_LETTER[initial]) return AVATAR_BY_LETTER[initial];
  let hash = 0;
  for (const ch of name) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return AVATAR_PALETTE[hash % AVATAR_PALETTE.length];
}

/** Quiet one-liner: "Tracy created order …", without a duplicated [System] tag. */
export function activityOneLiner(author: string | null, body: string): string {
  const text = String(body || '').trim().replace(/^\[System\]\s*/i, '');
  const name = String(author || '').trim();
  if (!text) return name;
  if (!name || name === 'System') return text;
  if (text.toLowerCase().startsWith(name.toLowerCase())) return text;
  return `${name} ${text}`;
}

export type CommentPart =
  | { kind: 'text'; text: string }
  | { kind: 'card'; label: string | null; href: string; display: string };

function parseUrlLine(line: string): { href: string; display: string } | null {
  const raw = line.trim().replace(/[),.;]+$/, '');
  if (!raw || /\s/.test(raw)) return null;
  if (/^https?:\/\//i.test(raw)) {
    return { href: raw, display: raw.replace(/^https?:\/\//i, '') };
  }
  if (/^www\./i.test(raw)) {
    return { href: `https://${raw}`, display: raw };
  }
  if (/^(?:[a-z0-9-]+\.)+[a-z]{2,}(?:\/\S*)?$/i.test(raw) && raw.includes('/')) {
    return { href: `https://${raw}`, display: raw };
  }
  return null;
}

/** Whole-line links become a light card. A short line above the link is its label. */
export function commentParts(body: string): CommentPart[] {
  const lines = String(body || '').replace(/\r\n/g, '\n').split('\n');
  const parts: CommentPart[] = [];
  let textLines: string[] = [];
  const flush = () => {
    const text = textLines.join('\n').trim();
    if (text) parts.push({ kind: 'text', text });
    textLines = [];
  };
  for (const raw of lines) {
    const url = parseUrlLine(raw.trim());
    if (!url) {
      textLines.push(raw);
      continue;
    }
    let label: string | null = null;
    if (textLines.length) {
      const prev = textLines[textLines.length - 1].trim();
      if (prev && prev.length <= 48 && !parseUrlLine(prev) && !/[.。！？!?]$/.test(prev)) {
        textLines.pop();
        label = prev;
      }
    }
    flush();
    parts.push({ kind: 'card', label, href: url.href, display: url.display });
  }
  flush();
  return parts;
}

export function groupFeedByDay<T extends { created_at: string }>(
  items: T[],
  todayYmd: string,
): { key: string; label: string; items: T[] }[] {
  const groups: { key: string; label: string; items: T[] }[] = [];
  for (const item of items) {
    const key = feedDayKey(item.created_at) || 'undated';
    const label = key === 'undated' ? '' : feedDayLabel(key, todayYmd);
    const last = groups[groups.length - 1];
    if (!last || last.key !== key) groups.push({ key, label, items: [item] });
    else last.items.push(item);
  }
  return groups;
}
