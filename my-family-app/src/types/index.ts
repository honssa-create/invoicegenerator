export type DishCategory = 'breakfast' | 'lunch' | 'dinner' | 'hotpot' | 'dessert';

export type DishCategoryFilter = DishCategory | 'all';

export type HotpotIngredientCategory = 'meat' | 'veggie' | 'seafood' | 'balls';

export type SoupBase = 'miso' | 'tom-yum' | 'spicy-sichuan' | 'clear-broth' | 'herbal';

export interface FamilyMember {
  id: string;
  name: string;
  birthday: string;
  avatarUri?: string;
}

/** @deprecated Use FamilyMember */
export type FamilyProfile = FamilyMember;

export interface Dish {
  id: string;
  name: string;
  category: DishCategory;
  imageUri: string;
  recipe: string;
  youtubeUrl?: string;
  tags: string[];
  isHotpotSet?: boolean;
}

/** @deprecated Use Dish */
export type Meal = Dish;

export interface HotpotIngredient {
  id: string;
  name: string;
  category: HotpotIngredientCategory;
}

export interface HotpotSet {
  id: string;
  name: string;
  soupBase: SoupBase;
  ingredientIds: string[];
}

export type MealPlan = Record<string, string[]>;

export interface AddMemberInput {
  name: string;
  birthday: string;
  avatarUri?: string;
}

export interface AddDishInput {
  name: string;
  category: DishCategory;
  imageUri: string;
  recipe: string;
  youtubeUrl?: string;
}

export interface AddHotpotSetInput {
  name: string;
  soupBase: SoupBase;
  ingredientIds: string[];
}
