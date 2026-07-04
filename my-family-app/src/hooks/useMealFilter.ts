import { useMemo, useState } from 'react';

import { MOCK_MEALS } from '@/constants/mockMeals';
import type { Meal, MealCategory } from '@/types';

export function useMealFilter(initialMeals: Meal[] = MOCK_MEALS) {
  const [selectedCategory, setSelectedCategory] = useState<MealCategory>('all');

  const filteredMeals = useMemo(() => {
    if (selectedCategory === 'all') {
      return initialMeals;
    }

    return initialMeals.filter((meal) => meal.category === selectedCategory);
  }, [initialMeals, selectedCategory]);

  return {
    selectedCategory,
    setSelectedCategory,
    filteredMeals,
    isHotpotView: selectedCategory === 'hotpot',
  };
}
