import type { BudgetMode, BudgetPlanRequest, Dish } from '@/types';

export const BUDGET_MODE_OPTIONS: { id: BudgetMode; label: string; subtitle: string }[] = [
  { id: 'economy', label: '經濟之選', subtitle: 'Best value within budget' },
  { id: 'balanced', label: 'Balanced', subtitle: 'Even mix of cost & quality' },
  { id: 'luxury', label: 'Luxury Day', subtitle: 'Premium picks for special nights' },
];

export function suggestDishesForBudget(
  dishes: Dish[],
  request: BudgetPlanRequest,
): Dish[] {
  const { budget, dishCount, mode } = request;
  const pool = dishes.filter((dish) => !dish.isHotpotSet && dish.estimatedBudget > 0);

  if (pool.length === 0 || dishCount <= 0 || budget <= 0) return [];

  const targetPerDish = budget / dishCount;
  let sorted = [...pool];

  if (mode === 'economy') {
    sorted.sort((a, b) => a.estimatedBudget - b.estimatedBudget);
  } else if (mode === 'luxury') {
    sorted.sort((a, b) => b.estimatedBudget - a.estimatedBudget);
  } else {
    sorted.sort(
      (a, b) =>
        Math.abs(a.estimatedBudget - targetPerDish) -
        Math.abs(b.estimatedBudget - targetPerDish),
    );
  }

  const selected: Dish[] = [];
  let remaining = budget;

  for (const dish of sorted) {
    if (selected.length >= dishCount) break;
    if (dish.estimatedBudget <= remaining) {
      selected.push(dish);
      remaining -= dish.estimatedBudget;
    }
  }

  if (selected.length < dishCount) {
    const leftovers = pool
      .filter((dish) => !selected.some((s) => s.id === dish.id))
      .sort((a, b) => a.estimatedBudget - b.estimatedBudget);

    for (const dish of leftovers) {
      if (selected.length >= dishCount) break;
      if (dish.estimatedBudget <= remaining) {
        selected.push(dish);
        remaining -= dish.estimatedBudget;
      }
    }
  }

  return selected;
}

export function formatBudget(amount: number): string {
  return `$${amount.toFixed(0)}`;
}

export function formatCookingTime(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}
