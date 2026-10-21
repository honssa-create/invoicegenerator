export type FlatId = string;

export interface Flat {
  id: FlatId;
  name: string;
}

export type Cuisine =
  | 'chinese'
  | 'western'
  | 'se-asian'
  | 'japanese'
  | 'korean'
  | 'hotpot-cuisine'
  | 'fusion'
  | 'other';

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

export interface RecipeComment {
  id: string;
  userName: string;
  userAvatar: string;
  text: string;
  timestamp: string;
}

export interface Dish {
  id: string;
  name: string;
  category: DishCategory;
  cuisine: Cuisine;
  ownerFlatId: FlatId;
  imageUri: string;
  recipe: string;
  ingredients: string[];
  cookingTimeMinutes: number;
  estimatedBudget: number;
  youtubeUrl?: string;
  tags: string[];
  isHotpotSet?: boolean;
  isPublic?: boolean;
  comments?: RecipeComment[];
  likesCount?: number;
}

/** Recipe shared in the global community pool (公海) */
export interface PublicDish {
  id: string;
  sourceDishId?: string;
  familyName: string;
  name: string;
  category: DishCategory;
  cuisine: Cuisine;
  imageUri: string;
  recipe: string;
  ingredients: string[];
  cookingTimeMinutes: number;
  estimatedBudget: number;
  youtubeUrl?: string;
  tags: string[];
  comments: RecipeComment[];
  likesCount: number;
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
  cuisine: Cuisine;
  ownerFlatId: FlatId;
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
