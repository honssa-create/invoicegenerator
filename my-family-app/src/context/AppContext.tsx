import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  MOCK_DISHES,
  MOCK_HOTPOT_INGREDIENTS,
  MOCK_MEMBERS,
} from '@/constants/mockData';
import type {
  AddDishInput,
  AddHotpotSetInput,
  AddMemberInput,
  Dish,
  FamilyMember,
  HotpotIngredient,
  HotpotSet,
  MealPlan,
  SoupBase,
} from '@/types';
import { toDateString } from '@/utils/date';

interface AppContextValue {
  members: FamilyMember[];
  dishes: Dish[];
  hotpotIngredients: HotpotIngredient[];
  hotpotSets: HotpotSet[];
  mealPlan: MealPlan;
  addMember: (input: AddMemberInput) => void;
  updateMember: (id: string, input: AddMemberInput) => void;
  deleteMember: (id: string) => void;
  addDish: (input: AddDishInput) => void;
  updateDish: (id: string, input: AddDishInput) => void;
  deleteDish: (id: string) => void;
  addDishToDate: (dishId: string, date?: string) => void;
  removeDishFromDate: (dishId: string, date: string) => void;
  getDishesForDate: (date: string) => Dish[];
  getDatesWithMeals: () => string[];
  getRandomDish: () => Dish | null;
  addHotpotSet: (input: AddHotpotSetInput) => HotpotSet;
  deleteHotpotSet: (id: string) => void;
  hotpotSetToDish: (set: HotpotSet) => Dish;
}

const AppContext = createContext<AppContextValue | null>(null);

function createId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

const INITIAL_MEAL_PLAN: MealPlan = {
  [toDateString()]: ['d2'],
  [toDateString(new Date(Date.now() - 86400000))]: ['d1', 'd4'],
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [members, setMembers] = useState<FamilyMember[]>(MOCK_MEMBERS);
  const [dishes, setDishes] = useState<Dish[]>(MOCK_DISHES);
  const [hotpotIngredients] = useState<HotpotIngredient[]>(MOCK_HOTPOT_INGREDIENTS);
  const [hotpotSets, setHotpotSets] = useState<HotpotSet[]>([]);
  const [mealPlan, setMealPlan] = useState<MealPlan>(INITIAL_MEAL_PLAN);

  const hotpotSetToDish = useCallback((set: HotpotSet): Dish => {
    const ingredientNames = set.ingredientIds
      .map((id) => hotpotIngredients.find((i) => i.id === id)?.name)
      .filter(Boolean)
      .join(', ');

    return {
      id: `hotpot-set-${set.id}`,
      name: set.name,
      category: 'hotpot',
      imageUri:
        'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&q=80',
      recipe: `Soup base: ${set.soupBase.replace('-', ' ')}. Ingredients: ${ingredientNames || 'Custom selection'}.`,
      tags: ['Hotpot Set'],
      isHotpotSet: true,
    };
  }, [hotpotIngredients]);

  const addMember = useCallback((input: AddMemberInput) => {
    setMembers((prev) => [...prev, { id: createId('m'), ...input }]);
  }, []);

  const updateMember = useCallback((id: string, input: AddMemberInput) => {
    setMembers((prev) =>
      prev.map((member) => (member.id === id ? { ...member, ...input } : member)),
    );
  }, []);

  const deleteMember = useCallback((id: string) => {
    setMembers((prev) => prev.filter((member) => member.id !== id));
  }, []);

  const addDish = useCallback((input: AddDishInput) => {
    setDishes((prev) => [
      ...prev,
      {
        id: createId('d'),
        tags: [],
        ...input,
      },
    ]);
  }, []);

  const updateDish = useCallback((id: string, input: AddDishInput) => {
    setDishes((prev) =>
      prev.map((dish) => (dish.id === id ? { ...dish, ...input } : dish)),
    );
  }, []);

  const deleteDish = useCallback((id: string) => {
    setDishes((prev) => prev.filter((dish) => dish.id !== id));
    setMealPlan((prev) => {
      const next: MealPlan = {};
      for (const [date, ids] of Object.entries(prev)) {
        const filtered = ids.filter((dishId) => dishId !== id);
        if (filtered.length > 0) next[date] = filtered;
      }
      return next;
    });
  }, []);

  const addDishToDate = useCallback((dishId: string, date = toDateString()) => {
    setMealPlan((prev) => {
      const existing = prev[date] ?? [];
      if (existing.includes(dishId)) return prev;
      return { ...prev, [date]: [...existing, dishId] };
    });
  }, []);

  const removeDishFromDate = useCallback((dishId: string, date: string) => {
    setMealPlan((prev) => {
      const existing = prev[date] ?? [];
      const filtered = existing.filter((id) => id !== dishId);
      if (filtered.length === 0) {
        const { [date]: _, ...rest } = prev;
        return rest;
      }
      return { ...prev, [date]: filtered };
    });
  }, []);

  const getDishesForDate = useCallback(
    (date: string) => {
      const ids = mealPlan[date] ?? [];
      return ids
        .map((id) => dishes.find((dish) => dish.id === id))
        .filter((dish): dish is Dish => Boolean(dish));
    },
    [mealPlan, dishes],
  );

  const getDatesWithMeals = useCallback(
    () => Object.keys(mealPlan).filter((date) => (mealPlan[date]?.length ?? 0) > 0),
    [mealPlan],
  );

  const getRandomDish = useCallback(() => {
    const pool = dishes.filter((dish) => !dish.isHotpotSet);
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }, [dishes]);

  const addHotpotSet = useCallback((input: AddHotpotSetInput) => {
    const newSet: HotpotSet = { id: createId('hs'), ...input };
    setHotpotSets((prev) => [...prev, newSet]);
    return newSet;
  }, []);

  const deleteHotpotSet = useCallback((id: string) => {
    setHotpotSets((prev) => prev.filter((set) => set.id !== id));
  }, []);

  const allDishes = useMemo(() => {
    const hotpotDishes = hotpotSets.map(hotpotSetToDish);
    return [...dishes, ...hotpotDishes];
  }, [dishes, hotpotSets, hotpotSetToDish]);

  const value = useMemo<AppContextValue>(
    () => ({
      members,
      dishes: allDishes,
      hotpotIngredients,
      hotpotSets,
      mealPlan,
      addMember,
      updateMember,
      deleteMember,
      addDish,
      updateDish,
      deleteDish,
      addDishToDate,
      removeDishFromDate,
      getDishesForDate,
      getDatesWithMeals,
      getRandomDish,
      addHotpotSet,
      deleteHotpotSet,
      hotpotSetToDish,
    }),
    [
      members,
      allDishes,
      hotpotIngredients,
      hotpotSets,
      mealPlan,
      addMember,
      updateMember,
      deleteMember,
      addDish,
      updateDish,
      deleteDish,
      addDishToDate,
      removeDishFromDate,
      getDishesForDate,
      getDatesWithMeals,
      getRandomDish,
      addHotpotSet,
      deleteHotpotSet,
      hotpotSetToDish,
    ],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export function useAppContext() {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
}
