/** Session-persisted list/filter UI state (survives navigation within the tab). */

export function readListUi<T extends Record<string, unknown>>(key: string): Partial<T> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<T>;
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeListUi<T extends Record<string, unknown>>(key: string, state: T) {
  try {
    sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* ignore quota / private mode */
  }
}
