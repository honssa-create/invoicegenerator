import type { PrepOrder } from '@/lib/kitchen-prep';

export type KitchenPrepListCachePayload = {
  orders: PrepOrder[];
  capacities?: { id: string; label: string }[];
};

const MEMORY = new Map<string, { at: number; data: KitchenPrepListCachePayload }>();
const STORAGE_KEY = 'kitchen-prep-list-cache-v1';
const TTL_MS = 120_000;

function storage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

function readStorage(): Record<string, { at: number; data: KitchenPrepListCachePayload }> {
  const raw = storage()?.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, { at: number; data: KitchenPrepListCachePayload }>;
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function writeStorage(entries: Record<string, { at: number; data: KitchenPrepListCachePayload }>) {
  storage()?.setItem(STORAGE_KEY, JSON.stringify(entries));
}

export function prepListCacheKey(dateStart: string, dateEnd: string, status: string): string {
  return `${dateStart}|${dateEnd}|${status}`;
}

export function peekKitchenPrepListCache(key: string): KitchenPrepListCachePayload | undefined {
  const now = Date.now();
  const mem = MEMORY.get(key);
  if (mem && now - mem.at < TTL_MS) return mem.data;

  const fromStore = readStorage()[key];
  if (fromStore && now - fromStore.at < TTL_MS) {
    MEMORY.set(key, fromStore);
    return fromStore.data;
  }
  return undefined;
}

export function setKitchenPrepListCache(key: string, data: KitchenPrepListCachePayload) {
  const entry = { at: Date.now(), data };
  MEMORY.set(key, entry);
  const store = readStorage();
  store[key] = entry;
  writeStorage(store);
}
