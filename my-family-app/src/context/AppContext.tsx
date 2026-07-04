import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  MOCK_ACTIVITIES,
  MOCK_COMMENTS,
  MOCK_DISHES,
  MOCK_HOTPOT_INGREDIENTS,
  MOCK_MEMBERS,
} from '@/constants/mockData';
import type {
  AddDishInput,
  AddHotpotSetInput,
  AddMemberInput,
  BudgetPlanRequest,
  Dish,
  DishActivity,
  DishComment,
  FamilyMember,
  HotpotIngredient,
  HotpotSet,
  MealPlan,
} from '@/types';
import { suggestDishesForBudget } from '@/utils/budgetPlanner';
import { toDateString } from '@/utils/date';

interface AppContextValue {
  members: FamilyMember[];
  dishes: Dish[];
  hotpotIngredients: HotpotIngredient[];
  hotpotSets: HotpotSet[];
  mealPlan: MealPlan;
  dishComments: DishComment[];
  dishActivities: DishActivity[];
  addMember: (input: AddMemberInput) => void;
  updateMember: (id: string, input: AddMemberInput) => void;
  deleteMember: (id: string) => void;
  addDish: (input: AddDishInput) => void;
  updateDish: (id: string, input: AddDishInput) => void;
  updateDishBudget: (id: string, budget: number) => void;
  deleteDish: (id: string) => void;
  getDishById: (id: string) => Dish | undefined;
  addDishToDate: (dishId: string, date?: string) => void;
  removeDishFromDate: (dishId: string, date: string) => void;
  getDishesForDate: (date: string) => Dish[];
  getDatesWithMeals: () => string[];
  getRandomDish: () => Dish | null;
  suggestDishesForBudget: (request: BudgetPlanRequest) => Dish[];
  applyBudgetPlan: (request: BudgetPlanRequest, date?: string) => Dish[];
  addDishComment: (dishId: string, date: string, author: string, comment: string) => void;
  getDishComments: (dishId: string, date?: string) => DishComment[];
  getDishActivities: (dishId: string) => DishActivity[];
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
  const [dishComments, setDishComments] = useState<DishComment[]>(MOCK_COMMENTS);
  const [dishActivities, setDishActivities] = useState<DishActivity[]>(MOCK_ACTIVITIES);

  const logActivity = useCallback(
    (
      dishId: string,
      type: DishActivity['type'],
      date: string,
      message: string,
      author?: string,
    ) => {
      const entry: DishActivity = {
        id: createId('act'),
        dishId,
        type,
        date,
        message,
        author,
        createdAt: new Date().toISOString(),
      };
      setDishActivities((prev) => [entry, ...prev]);
    },
    [],
  );

  const hotpotSetToDish = useCallback((set: HotpotSet): Dish => {
    const ingredientNames = set.ingredientIds
      .map((id) => hotpotIngredients.find((i) => i.id === id)?.name)
      .filter(Boolean) as string[];

    const estimatedBudget = Math.max(35, ingredientNames.length * 8);

    return {
      id: `hotpot-set-${set.id}`,
      name: set.name,
      category: 'hotpot',
      imageUri: 'https://images.unsplash.com/photo-1547592166-23ac45744acd?w=400&q=80',
      recipe: `Soup base: ${set.soupBase.replace('-', ' ')}.\nSwirl ingredients at the table and enjoy together.`,
      ingredients: ingredientNames,
      cookingTimeMinutes: 60,
      estimatedBudget,
      tags: ['Hotpot Set'],
      isHotpotSet: true,
    };
  }, [hotpotIngredients]);

  const allDishes = useMemo(() => {
    const hotpotDishes = hotpotSets.map(hotpotSetToDish);
    return [...dishes, ...hotpotDishes];
  }, [dishes, hotpotSets, hotpotSetToDish]);

  const getDishById = useCallback(
    (id: string) => allDishes.find((dish) => dish.id === id),
    [allDishes],
  );

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
    const id = createId('d');
    setDishes((prev) => [...prev, { id, tags: [], ...input }]);
    logActivity(id, 'created', toDateString(), 'Dish added to collection');
  }, [logActivity]);

  const updateDish = useCallback((id: string, input: AddDishInput) => {
    setDishes((prev) =>
      prev.map((dish) => (dish.id === id ? { ...dish, ...input } : dish)),
    );
  }, []);

  const updateDishBudget = useCallback(
    (id: string, budget: number) => {
      setDishes((prev) =>
        prev.map((dish) =>
          dish.id === id ? { ...dish, estimatedBudget: budget } : dish,
        ),
      );
      logActivity(
        id,
        'budget_updated',
        toDateString(),
        `Budget updated to $${budget}`,
      );
    },
    [logActivity],
  );

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

  const addDishToDate = useCallback(
    (dishId: string, date = toDateString()) => {
      setMealPlan((prev) => {
        const existing = prev[date] ?? [];
        if (existing.includes(dishId)) return prev;
        return { ...prev, [date]: [...existing, dishId] };
      });
      const dish = allDishes.find((item) => item.id === dishId);
      logActivity(
        dishId,
        'planned',
        date,
        `Planned for ${date}${dish ? `: ${dish.name}` : ''}`,
      );
    },
    [allDishes, logActivity],
  );

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
        .map((id) => allDishes.find((dish) => dish.id === id))
        .filter((dish): dish is Dish => Boolean(dish));
    },
    [mealPlan, allDishes],
  );

  const getDatesWithMeals = useCallback(
    () => Object.keys(mealPlan).filter((date) => (mealPlan[date]?.length ?? 0) > 0),
    [mealPlan],
  );

  const getRandomDish = useCallback(() => {
    const pool = allDishes.filter((dish) => !dish.isHotpotSet);
    if (pool.length === 0) return null;
    return pool[Math.floor(Math.random() * pool.length)];
  }, [allDishes]);

  const suggestBudget = useCallback(
    (request: BudgetPlanRequest) => suggestDishesForBudget(allDishes, request),
    [allDishes],
  );

  const applyBudgetPlan = useCallback(
    (request: BudgetPlanRequest, date = toDateString()) => {
      const picks = suggestDishesForBudget(allDishes, request);
      picks.forEach((dish) => addDishToDate(dish.id, date));
      return picks;
    },
    [allDishes, addDishToDate],
  );

  const addDishComment = useCallback(
    (dishId: string, date: string, author: string, comment: string) => {
      const entry: DishComment = {
        id: createId('cmt'),
        dishId,
        date,
        author,
        comment,
        createdAt: new Date().toISOString(),
      };
      setDishComments((prev) => [entry, ...prev]);
      logActivity(
        dishId,
        'comment',
        date,
        `${author} commented: ${comment}`,
        author,
      );
    },
    [logActivity],
  );

  const getDishComments = useCallback(
    (dishId: string, date?: string) =>
      dishComments
        .filter((item) => item.dishId === dishId && (!date || item.date === date))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [dishComments],
  );

  const getDishActivities = useCallback(
    (dishId: string) =>
      dishActivities
        .filter((item) => item.dishId === dishId)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [dishActivities],
  );

  const addHotpotSet = useCallback((input: AddHotpotSetInput) => {
    const newSet: HotpotSet = { id: createId('hs'), ...input };
    setHotpotSets((prev) => [...prev, newSet]);
    return newSet;
  }, []);

  const deleteHotpotSet = useCallback((id: string) => {
    setHotpotSets((prev) => prev.filter((set) => set.id !== id));
  }, []);

  const value = useMemo<AppContextValue>(
    () => ({
      members,
      dishes: allDishes,
      hotpotIngredients,
      hotpotSets,
      mealPlan,
      dishComments,
      dishActivities,
      addMember,
      updateMember,
      deleteMember,
      addDish,
      updateDish,
      updateDishBudget,
      deleteDish,
      getDishById,
      addDishToDate,
      removeDishFromDate,
      getDishesForDate,
      getDatesWithMeals,
      getRandomDish,
      suggestDishesForBudget: suggestBudget,
      applyBudgetPlan,
      addDishComment,
      getDishComments,
      getDishActivities,
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
      dishComments,
      dishActivities,
      addMember,
      updateMember,
      deleteMember,
      addDish,
      updateDish,
      updateDishBudget,
      deleteDish,
      getDishById,
      addDishToDate,
      removeDishFromDate,
      getDishesForDate,
      getDatesWithMeals,
      getRandomDish,
      suggestBudget,
      applyBudgetPlan,
      addDishComment,
      getDishComments,
      getDishActivities,
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
