import type { Cuisine } from '@/types';

export const CUISINE_OPTIONS: { id: Cuisine; label: string }[] = [
  { id: 'chinese', label: '中式' },
  { id: 'western', label: '西式' },
  { id: 'se-asian', label: '东南亚' },
  { id: 'japanese', label: '日式' },
  { id: 'korean', label: '韩式' },
  { id: 'hotpot-cuisine', label: '火锅' },
  { id: 'fusion', label: '融合' },
  { id: 'other', label: '其他' },
];

export function getCuisineLabel(cuisine: Cuisine): string {
  return CUISINE_OPTIONS.find((c) => c.id === cuisine)?.label ?? cuisine;
}
