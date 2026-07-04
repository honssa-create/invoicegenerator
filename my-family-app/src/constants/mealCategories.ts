import type { MealCategory } from '@/types';

export interface CategoryOption {
  id: MealCategory;
  label: string;
}

export const MEAL_CATEGORIES: CategoryOption[] = [
  { id: 'all', label: 'All' },
  { id: 'chinese', label: 'Chinese' },
  { id: 'western', label: 'Western' },
  { id: 'se-asian', label: 'SE Asian' },
  { id: 'hotpot', label: 'Hotpot' },
];
