import type { Dish, FamilyMember, HotpotIngredient } from '@/types';

export const MOCK_MEMBERS: FamilyMember[] = [
  {
    id: 'm1',
    name: 'Elena Chen',
    birthday: '1990-03-14',
    avatarUri: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=200&q=80',
  },
  {
    id: 'm2',
    name: 'James Chen',
    birthday: '1988-07-22',
    avatarUri: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=200&q=80',
  },
];

export const MOCK_DISHES: Dish[] = [
  {
    id: 'd1',
    name: 'Shakshuka',
    category: 'breakfast',
    imageUri: 'https://images.unsplash.com/photo-1590412207108-878670de6f6c?w=400&q=80',
    recipe: 'Eggs poached in spiced tomato sauce with herbs.',
    youtubeUrl: 'https://www.youtube.com/watch?v=example1',
    tags: ['Weekend', 'Warm'],
  },
  {
    id: 'd2',
    name: 'Herb-Crusted Salmon',
    category: 'dinner',
    imageUri: 'https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400&q=80',
    recipe: 'Oven-roasted salmon with dill, lemon zest, and butter.',
    youtubeUrl: 'https://www.youtube.com/watch?v=example2',
    tags: ['Healthy', 'Quick'],
  },
  {
    id: 'd3',
    name: 'Tom Yum Soup',
    category: 'lunch',
    imageUri: 'https://images.unsplash.com/photo-1548943487-a2e4e43b4853?w=400&q=80',
    recipe: 'Fragrant lemongrass broth with shrimp and mushrooms.',
    tags: ['Light', 'Spicy'],
  },
  {
    id: 'd4',
    name: 'Tiramisu',
    category: 'dessert',
    imageUri: 'https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=400&q=80',
    recipe: 'Espresso-soaked ladyfingers with mascarpone cream.',
    tags: ['Indulgent'],
  },
  {
    id: 'd5',
    name: 'Classic Shabu-Shabu',
    category: 'hotpot',
    imageUri: 'https://images.unsplash.com/photo-1590301157893-3e5ee1b9c6f8?w=400&q=80',
    recipe: 'Thinly sliced beef swirled in light kombu broth.',
    youtubeUrl: 'https://www.youtube.com/watch?v=example5',
    tags: ['Gathering'],
  },
];

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
