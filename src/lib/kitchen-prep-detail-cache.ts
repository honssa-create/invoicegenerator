import type { PrepCalculation, PrepOrder } from '@/lib/kitchen-prep';

export type KitchenPrepDetailPayload = {
  order: PrepOrder;
  calculation: PrepCalculation;
  capacities: { id: string; label: string }[];
};

const cache = new Map<string, KitchenPrepDetailPayload>();
const inflight = new Map<string, Promise<KitchenPrepDetailPayload | null>>();

export function peekKitchenPrepDetailCache(id: number | string): KitchenPrepDetailPayload | undefined {
  return cache.get(String(id));
}

export function setKitchenPrepDetailCache(id: number | string, payload: KitchenPrepDetailPayload) {
  cache.set(String(id), payload);
}

export function prefetchKitchenPrepDetail(id: number | string): void {
  const key = String(id);
  if (cache.has(key) || inflight.has(key)) return;

  const promise = fetch(`/api/kitchen-prep/${id}`)
    .then((r) => (r.ok ? r.json() : null))
    .then((d) => {
      if (!d?.order) return null;
      const payload: KitchenPrepDetailPayload = {
        order: d.order as PrepOrder,
        calculation: d.calculation as PrepCalculation,
        capacities: (d.capacities as { id: string; label: string }[]) || [],
      };
      cache.set(key, payload);
      return payload;
    })
    .catch(() => null)
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, promise);
}
