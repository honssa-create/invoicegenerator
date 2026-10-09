import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  FLAT_10J,
  INITIAL_MEAL_PLANS,
  MOCK_ACTIVITIES,
  MOCK_COMMENTS,
  MOCK_DISHES,
  MOCK_FLATS,
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
  Flat,
  FlatId,
  HotpotIngredient,
  HotpotSet,
  MealPlan,
  MealPlansByFlat,
} from '@/types';
import { suggestDishesForBudget } from '@/utils/budgetPlanner';
import { isWithinScheduleWindow, toDateString } from '@/utils/date';

interface AppContextValue {
  flats: Flat[];
  activeFlat: FlatId;
  setActiveFlat: (flat: FlatId) => void;
  addFlat: (name: string) => FlatId;
  getFlatName: (flatId: FlatId) => string;
  members: FamilyMember[];
  dishes: Dish[];
  hotpotIngredients: HotpotIngredient[];
  hotpotSets: HotpotSet[];
  flatMealPlans: MealPlansByFlat;
  dishComments: DishComment[];
  dishActivities: DishActivity[];
  getMembersForFlat: (flatId: FlatId) => FamilyMember[];
  getOwnedDishesForFlat: (flatId: FlatId) => Dish[];
  canScheduleDish: (dishId: string) => boolean;
  addMember: (input: AddMemberInput) => void;
  updateMember: (id: string, input: AddMemberInput) => void;
  deleteMember: (id: string) => void;
  addDish: (input: AddDishInput) => void;
  updateDish: (id: string, input: AddDishInput) => void;
  updateDishBudget: (id: string, budget: number) => void;
  deleteDish: (id: string) => void;
  getDishById: (id: string) => Dish | undefined;
  addDishToDate: (dishId: string, date: string, flatId?: FlatId) => boolean;
  removeDishFromDate: (dishId: string, date: string, flatId?: FlatId) => void;
  getDishesForDate: (date: string, flatId: FlatId) => Dish[];
  getDatesWithMeals: (flatId: FlatId) => string[];
  getOtherFlats: (flatId: FlatId) => Flat[];
  getRandomDish: (flatId?: FlatId) => Dish | null;
  suggestDishesForBudget: (request: BudgetPlanRequest, flatId?: FlatId) => Dish[];
  applyBudgetPlan: (request: BudgetPlanRequest, date: string, flatId?: FlatId) => Dish[];
  addDishComment: (
    dishId: string,
    date: string,
    author: string,
    comment: string,
    flatId?: FlatId,
  ) => void;
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

export function AppProvider({ children }: { children: ReactNode }) {
  const [flats, setFlats] = useState<Flat[]>(MOCK_FLATS);
  const [activeFlat, setActiveFlat] = useState<FlatId>(FLAT_10J);
  const [members, setMembers] = useState<FamilyMember[]>(MOCK_MEMBERS);
  const [dishes, setDishes] = useState<Dish[]>(MOCK_DISHES);
  const [hotpotIngredients] = useState<HotpotIngredient[]>(MOCK_HOTPOT_INGREDIENTS);
  const [hotpotSets, setHotpotSets] = useState<HotpotSet[]>([]);
  const [flatMealPlans, setFlatMealPlans] = useState<MealPlansByFlat>(INITIAL_MEAL_PLANS);
  const [dishComments, setDishComments] = useState<DishComment[]>(MOCK_COMMENTS);
  const [dishActivities, setDishActivities] = useState<DishActivity[]>(MOCK_ACTIVITIES);

  const getFlatName = useCallback(
    (flatId: FlatId) => flats.find((flat) => flat.id === flatId)?.name ?? flatId,
    [flats],
  );

  const addFlat = useCallback((name: string) => {
    const trimmed = name.trim();
    const id = createId('flat');
    const newFlat: Flat = { id, name: trimmed };
    setFlats((prev) => [...prev, newFlat]);
    setFlatMealPlans((prev) => ({ ...prev, [id]: {} }));
    setActiveFlat(id);
    return id;
  }, []);

  const logActivity = useCallback(
    (
      dishId: string,
      flatId: FlatId,
      type: DishActivity['type'],
      date: string,
      message: string,
      author?: string,
    ) => {
      const entry: DishActivity = {
        id: createId('act'),
        dishId,
        flatId,
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
      cuisine: 'hotpot-cuisine',
      ownerFlatId: set.flatId,
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

  const getMembersForFlat = useCallback(
    (flatId: FlatId) => members.filter((member) => member.flatId === flatId),
    [members],
  );

  const getOwnedDishesForFlat = useCallback(
    (flatId: FlatId) => allDishes.filter((dish) => dish.ownerFlatId === flatId),
    [allDishes],
  );

  const canScheduleDish = useCallback(
    (dishId: string) => Boolean(allDishes.find((item) => item.id === dishId)),
    [allDishes],
  );

  const getOtherFlats = useCallback(
    (flatId: FlatId) => flats.filter((flat) => flat.id !== flatId),
    [flats],
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

  const addDish = useCallback(
    (input: AddDishInput) => {
      const id = createId('d');
      setDishes((prev) => [...prev, { id, tags: [], ...input }]);
      logActivity(
        id,
        input.ownerFlatId,
        'created',
        toDateString(),
        'Dish added to shared library',
      );
    },
    [logActivity],
  );

  const updateDish = useCallback((id: string, input: AddDishInput) => {
    setDishes((prev) =>
      prev.map((dish) => (dish.id === id ? { ...dish, ...input } : dish)),
    );
  }, []);

  const updateDishBudget = useCallback(
    (id: string, budget: number) => {
      const dish = allDishes.find((item) => item.id === id);
      setDishes((prev) =>
        prev.map((item) =>
          item.id === id ? { ...item, estimatedBudget: budget } : item,
        ),
      );
      if (dish) {
        logActivity(
          id,
          dish.ownerFlatId,
          'budget_updated',
          toDateString(),
          `Budget updated to $${budget}`,
        );
      }
    },
    [allDishes, logActivity],
  );

  const deleteDish = useCallback((id: string) => {
    setDishes((prev) => prev.filter((dish) => dish.id !== id));
    setFlatMealPlans((prev) => {
      const next: MealPlansByFlat = { ...prev };
      for (const flatId of Object.keys(next)) {
        const plan = next[flatId] ?? {};
        const cleaned: MealPlan = {};
        for (const [date, ids] of Object.entries(plan)) {
          const filtered = ids.filter((dishId) => dishId !== id);
          if (filtered.length > 0) cleaned[date] = filtered;
        }
        next[flatId] = cleaned;
      }
      return next;
    });
  }, []);

  const addDishToDate = useCallback(
    (dishId: string, date: string, flatId: FlatId = activeFlat): boolean => {
      const dish = allDishes.find((item) => item.id === dishId);
      if (!dish) return false;
      if (!isWithinScheduleWindow(date)) return false;

      setFlatMealPlans((prev) => {
        const plan = prev[flatId] ?? {};
        const existing = plan[date] ?? [];
        if (existing.includes(dishId)) return prev;
        return {
          ...prev,
          [flatId]: { ...plan, [date]: [...existing, dishId] },
        };
      });

      logActivity(
        dishId,
        flatId,
        'planned',
        date,
        `Planned for ${date}: ${dish.name}`,
      );
      return true;
    },
    [activeFlat, allDishes, logActivity],
  );

  const removeDishFromDate = useCallback(
    (dishId: string, date: string, flatId: FlatId = activeFlat) => {
      setFlatMealPlans((prev) => {
        const plan = prev[flatId] ?? {};
        const existing = plan[date] ?? [];
        const filtered = existing.filter((id) => id !== dishId);
        if (filtered.length === 0) {
          const { [date]: _, ...rest } = plan;
          return { ...prev, [flatId]: rest };
        }
        return { ...prev, [flatId]: { ...plan, [date]: filtered } };
      });
    },
    [activeFlat],
  );

  const getDishesForDate = useCallback(
    (date: string, flatId: FlatId) => {
      const ids = flatMealPlans[flatId]?.[date] ?? [];
      return ids
        .map((id) => allDishes.find((dish) => dish.id === id))
        .filter((dish): dish is Dish => Boolean(dish));
    },
    [flatMealPlans, allDishes],
  );

  const getDatesWithMeals = useCallback(
    (flatId: FlatId) =>
      Object.keys(flatMealPlans[flatId] ?? {}).filter(
        (date) => (flatMealPlans[flatId]?.[date]?.length ?? 0) > 0,
      ),
    [flatMealPlans],
  );

  const getRandomDish = useCallback(
    (flatId: FlatId = activeFlat) => {
      const pool = allDishes.filter((dish) => !dish.isHotpotSet);
      if (pool.length === 0) return null;
      return pool[Math.floor(Math.random() * pool.length)];
    },
    [activeFlat, allDishes],
  );

  const suggestBudget = useCallback(
    (request: BudgetPlanRequest, flatId: FlatId = activeFlat) =>
      suggestDishesForBudget(allDishes.filter((d) => !d.isHotpotSet), request),
    [activeFlat, allDishes],
  );

  const applyBudgetPlan = useCallback(
    (request: BudgetPlanRequest, date: string, flatId: FlatId = activeFlat) => {
      const picks = suggestDishesForBudget(allDishes.filter((d) => !d.isHotpotSet), request);
      picks.forEach((dish) => addDishToDate(dish.id, date, flatId));
      return picks;
    },
    [activeFlat, allDishes, addDishToDate],
  );

  const addDishComment = useCallback(
    (
      dishId: string,
      date: string,
      author: string,
      comment: string,
      flatId: FlatId = activeFlat,
    ) => {
      const entry: DishComment = {
        id: createId('cmt'),
        dishId,
        flatId,
        date,
        author,
        comment,
        createdAt: new Date().toISOString(),
      };
      setDishComments((prev) => [entry, ...prev]);
      logActivity(
        dishId,
        flatId,
        'comment',
        date,
        `${author} commented: ${comment}`,
        author,
      );
    },
    [activeFlat, logActivity],
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
      flats,
      activeFlat,
      setActiveFlat,
      addFlat,
      getFlatName,
      members,
      dishes: allDishes,
      hotpotIngredients,
      hotpotSets,
      flatMealPlans,
      dishComments,
      dishActivities,
      getMembersForFlat,
      getOwnedDishesForFlat,
      canScheduleDish,
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
      getOtherFlats,
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
      flats,
      activeFlat,
      addFlat,
      getFlatName,
      members,
      allDishes,
      hotpotIngredients,
      hotpotSets,
      flatMealPlans,
      dishComments,
      dishActivities,
      getMembersForFlat,
      getOwnedDishesForFlat,
      canScheduleDish,
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
      getOtherFlats,
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
