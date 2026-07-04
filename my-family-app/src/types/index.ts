export type MealCategory = 'all' | 'chinese' | 'western' | 'se-asian' | 'hotpot';

export type MealCategoryFilter = Exclude<MealCategory, 'all'>;

export type HotpotIngredientCategory = 'meat' | 'veggie' | 'seafood' | 'balls';

export interface FamilyProfile {
  id: string;
  name: string;
  birthday: string;
  avatarUri?: string;
}

export interface Meal {
  id: string;
  name: string;
  category: MealCategoryFilter;
  imageUri: string;
  recipe: string;
  youtubeUrl?: string;
  tags: string[];
}

export interface HotpotIngredient {
  id: string;
  name: string;
  category: HotpotIngredientCategory;
}

export interface HotpotSet {
  id: string;
  name: string;
  ingredientIds: string[];
}
