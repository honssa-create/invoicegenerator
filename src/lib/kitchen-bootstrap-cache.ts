import type { KitchenCatalog, KitchenFormulas, KitchenState } from '@/lib/kitchen';

export type KitchenBootstrapLitePayload = {
  state: Omit<KitchenState, 'catalog' | 'formulas' | 'movements'>;
  catalog: KitchenCatalog;
  formulas: KitchenFormulas;
};

const MEMORY_KEY = 'lite';
const TTL_MS = 90_000;

let memory: { at: number; data: KitchenBootstrapLitePayload } | null = null;

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function peekKitchenBootstrapLiteCache(): KitchenBootstrapLitePayload | undefined {
  const now = Date.now();
  if (memory && now - memory.at < TTL_MS) return memory.data;

  const raw = storage()?.getItem('kitchen-bootstrap-lite-v1');
  if (!raw) return undefined;
  try {
    const parsed = JSON.parse(raw) as { at: number; data: KitchenBootstrapLitePayload };
    if (parsed?.data && now - parsed.at < TTL_MS) {
      memory = parsed;
      return parsed.data;
    }
  } catch {
    /* ignore */
  }
  return undefined;
}

export function setKitchenBootstrapLiteCache(data: KitchenBootstrapLitePayload) {
  const entry = { at: Date.now(), data };
  memory = entry;
  storage()?.setItem('kitchen-bootstrap-lite-v1', JSON.stringify(entry));
}

export function clearKitchenBootstrapLiteCache() {
  memory = null;
  storage()?.removeItem('kitchen-bootstrap-lite-v1');
}
