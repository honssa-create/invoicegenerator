import type {
  Dish,
  DishActivity,
  DishComment,
  FamilyMember,
  HotpotIngredient,
  MealPlansByFlat,
} from '@/types';
import { toDateString } from '@/utils/date';

const today = toDateString();
const yesterday = toDateString(new Date(Date.now() - 86400000));

export const MOCK_MEMBERS: FamilyMember[] = [
  {
    id: 'm1',
    name: 'Elena Chen',
    birthday: '1990-03-14',
    flatId: '10J',
    avatarUri: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80',
  },
  {
    id: 'm2',
    name: 'James Chen',
    birthday: '1988-07-22',
    flatId: '10J',
    avatarUri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80',
  },
  {
    id: 'm3',
    name: 'Sophie Wong',
    birthday: '1992-11-05',
    flatId: '20C',
    avatarUri: 'https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=200&q=80',
  },
  {
    id: 'm4',
    name: 'Marcus Lee',
    birthday: '1985-01-18',
    flatId: '20C',
  },
];

export const MOCK_DISHES: Dish[] = [
  {
    id: 'd1',
    name: 'Shakshuka',
    category: 'breakfast',
    flatId: '10J',
    imageUri: 'https://images.unsplash.com/photo-1590412207108-878670de6f6c?w=400&q=80',
    recipe: '1. Sauté onion and peppers.\n2. Add tomatoes and spices.\n3. Crack eggs into wells and cover until set.',
    ingredients: ['eggs', 'tomatoes', 'onion', 'paprika', 'feta', 'parsley'],
    cookingTimeMinutes: 25,
    estimatedBudget: 18,
    youtubeUrl: 'https://www.youtube.com/watch?v=example1',
    tags: ['Weekend', 'Warm'],
  },
  {
    id: 'd2',
    name: 'Herb-Crusted Salmon',
    category: 'dinner',
    flatId: '10J',
    imageUri: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&q=80',
    recipe: '1. Season salmon.\n2. Press herb crust.\n3. Roast at 200°C for 12 minutes.',
    ingredients: ['salmon fillet', 'dill', 'lemon', 'butter', 'breadcrumbs', 'garlic'],
    cookingTimeMinutes: 35,
    estimatedBudget: 42,
    youtubeUrl: 'https://www.youtube.com/watch?v=example2',
    tags: ['Healthy', 'Quick'],
  },
  {
    id: 'd3',
    name: 'Tom Yum Soup',
    category: 'lunch',
    flatId: '10J',
    imageUri: 'https://images.unsplash.com/photo-1548943487-a2e4e43b4853?w=400&q=80',
    recipe: '1. Simmer lemongrass broth.\n2. Add mushrooms and shrimp.\n3. Finish with lime and chili.',
    ingredients: ['lemongrass', 'galangal', 'shrimp', 'mushrooms', 'lime leaves', 'fish sauce'],
    cookingTimeMinutes: 40,
    estimatedBudget: 28,
    tags: ['Light', 'Spicy'],
  },
  {
    id: 'd4',
    name: 'Tiramisu',
    category: 'dessert',
    flatId: '20C',
    imageUri: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400&q=80',
    recipe: '1. Whisk mascarpone cream.\n2. Dip ladyfingers in espresso.\n3. Layer and chill overnight.',
    ingredients: ['mascarpone', 'espresso', 'ladyfingers', 'cocoa', 'eggs', 'sugar'],
    cookingTimeMinutes: 30,
    estimatedBudget: 22,
    tags: ['Indulgent'],
  },
  {
    id: 'd5',
    name: 'Classic Shabu-Shabu',
    category: 'hotpot',
    flatId: '20C',
    imageUri: 'https://images.unsplash.com/photo-1590301157893-3e5ee1b9c6f8?w=400&q=80',
    recipe: '1. Prepare kombu broth.\n2. Slice beef paper-thin.\n3. Swirl ingredients at the table.',
    ingredients: ['thin beef', 'napa cabbage', 'tofu', 'enoki', 'ponzu', 'kombu broth'],
    cookingTimeMinutes: 50,
    estimatedBudget: 65,
    youtubeUrl: 'https://www.youtube.com/watch?v=example5',
    tags: ['Gathering'],
  },
  {
    id: 'd6',
    name: 'Garlic Noodles',
    category: 'dinner',
    flatId: '20C',
    imageUri: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&q=80',
    recipe: '1. Boil noodles.\n2. Toss with garlic butter.\n3. Finish with scallions.',
    ingredients: ['noodles', 'garlic', 'butter', 'soy sauce', 'scallions', 'sesame oil'],
    cookingTimeMinutes: 20,
    estimatedBudget: 15,
    tags: ['Quick', 'Comfort'],
  },
];

export const MOCK_COMMENTS: DishComment[] = [
  {
    id: 'c1',
    dishId: 'd2',
    flatId: '10J',
    date: today,
    author: 'Elena',
    comment: 'Salmon was perfectly flaky — kids loved it.',
    createdAt: new Date().toISOString(),
  },
];

export const MOCK_ACTIVITIES: DishActivity[] = [
  {
    id: 'a1',
    dishId: 'd2',
    flatId: '10J',
    type: 'planned',
    date: today,
    message: 'Added to meal plan',
    createdAt: new Date().toISOString(),
  },
  {
    id: 'a2',
    dishId: 'd2',
    flatId: '10J',
    type: 'comment',
    date: today,
    message: 'Elena commented: Salmon was perfectly flaky — kids loved it.',
    author: 'Elena',
    createdAt: new Date().toISOString(),
  },
];

export const INITIAL_MEAL_PLANS: MealPlansByFlat = {
  '10J': {
    [today]: ['d2'],
    [yesterday]: ['d1', 'd3'],
  },
  '20C': {
    [today]: ['d6'],
    [yesterday]: ['d4', 'd5'],
  },
};

export const MOCK_HOTPOT_INGREDIENTS: HotpotIngredient[] = [
  { id: 'i1', name: 'Ribeye', category: 'meat' },
  { id: 'i2', name: 'Lamb Slices', category: 'meat' },
  { id: 'i3', name: 'Chicken Thigh', category: 'meat' },
  { id: 'i4', name: 'Napa Cabbage', category: 'veggie' },
  { id: 'i5', name: 'Enoki Mushroom', category: 'veggie' },
  { id: 'i6', name: 'Bok Choy', category: 'veggie' },
  { id: 'i7', name: 'Tiger Prawns', category: 'seafood' },
  { id: 'i8', name: 'Scallops', category: 'seafood' },
  { id: 'i9', name: 'Fish Balls', category: 'balls' },
  { id: 'i10', name: 'Beef Balls', category: 'balls' },
  { id: 'i11', name: 'Tofu Puffs', category: 'balls' },
];

export const DISH_CATEGORIES = [
  { id: 'all' as const, label: 'All' },
  { id: 'breakfast' as const, label: 'Breakfast' },
  { id: 'lunch' as const, label: 'Lunch' },
  { id: 'dinner' as const, label: 'Dinner' },
  { id: 'hotpot' as const, label: 'Hotpot' },
  { id: 'dessert' as const, label: 'Dessert' },
];

export const SOUP_BASE_OPTIONS = [
  { id: 'miso' as const, label: 'White Miso' },
  { id: 'tom-yum' as const, label: 'Tom Yum' },
  { id: 'spicy-sichuan' as const, label: 'Spicy Sichuan' },
  { id: 'clear-broth' as const, label: 'Clear Broth' },
  { id: 'herbal' as const, label: 'Herbal' },
];

export const HOTPOT_INGREDIENT_GROUPS = [
  { id: 'meat' as const, label: 'Meat' },
  { id: 'veggie' as const, label: 'Veggie' },
  { id: 'seafood' as const, label: 'Seafood' },
  { id: 'balls' as const, label: 'Balls' },
];
