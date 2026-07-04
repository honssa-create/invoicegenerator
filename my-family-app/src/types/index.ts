export type FlatId = '10J' | '20C';

export const FLATS: { id: FlatId; label: string }[] = [
  { id: '10J', label: '10J' },
  { id: '20C', label: '20C' },
];

export type DishCategory = 'breakfast' | 'lunch' | 'dinner' | 'hotpot' | 'dessert';

export type DishCategoryFilter = DishCategory | 'all';

export type HotpotIngredientCategory = 'meat' | 'veggie' | 'seafood' | 'balls';

export type SoupBase = 'miso' | 'tom-yum' | 'spicy-sichuan' | 'clear-broth' | 'herbal';

export type BudgetMode = 'economy' | 'balanced' | 'luxury';

export type DishActivityType = 'planned' | 'comment' | 'created' | 'budget_updated';

export interface FamilyMember {
  id: string;
  name: string;
  birthday: string;
  flatId: FlatId;
  avatarUri?: string;
}

/** @deprecated Use FamilyMember */
export type FamilyProfile = FamilyMember;

export interface Dish {
  id: string;
  name: string;
  category: DishCategory;
  flatId: FlatId;
  imageUri: string;
  recipe: string;
  ingredients: string[];
  cookingTimeMinutes: number;
  estimatedBudget: number;
  youtubeUrl?: string;
  tags: string[];
  isHotpotSet?: boolean;
}

/** @deprecated Use Dish */
export type Meal = Dish;

export interface DishComment {
  id: string;
  dishId: string;
  flatId: FlatId;
  date: string;
  author: string;
  comment: string;
  createdAt: string;
}

export interface DishActivity {
  id: string;
  dishId: string;
  flatId: FlatId;
  type: DishActivityType;
  date: string;
  message: string;
  author?: string;
  createdAt: string;
}

export interface HotpotIngredient {
  id: string;
  name: string;
  category: HotpotIngredientCategory;
}

export interface HotpotSet {
  id: string;
  name: string;
  flatId: FlatId;
  soupBase: SoupBase;
  ingredientIds: string[];
}

export type MealPlan = Record<string, string[]>;

export type MealPlansByFlat = Record<FlatId, MealPlan>;

export interface AddMemberInput {
  name: string;
  birthday: string;
  flatId: FlatId;
  avatarUri?: string;
}

export interface AddDishInput {
  name: string;
  category: DishCategory;
  flatId: FlatId;
  imageUri: string;
  recipe: string;
  ingredients: string[];
  cookingTimeMinutes: number;
  estimatedBudget: number;
  youtubeUrl?: string;
}

export interface AddHotpotSetInput {
  name: string;
  flatId: FlatId;
  soupBase: SoupBase;
  ingredientIds: string[];
}

export interface BudgetPlanRequest {
  budget: number;
  dishCount: number;
  mode: BudgetMode;
}

export interface YoutubeRecipeExtraction {
  name: string;
  ingredients: string[];
  recipe: string;
  cookingTimeMinutes: number;
  estimatedBudget: number;
  imageUri?: string;
}
