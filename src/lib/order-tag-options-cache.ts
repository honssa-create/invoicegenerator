const TTL_MS = 120_000;

type Entry = { tags: string[]; expiresAt: number };

const cache = new Map<number, Entry>();

export function readOrderTagOptionsCache(ownerId: number): string[] | null {
  const hit = cache.get(ownerId);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    cache.delete(ownerId);
    return null;
  }
  return hit.tags;
}

export function writeOrderTagOptionsCache(ownerId: number, tags: string[]): void {
  cache.set(ownerId, { tags, expiresAt: Date.now() + TTL_MS });
}
