import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { AppModal } from '@/components/common/AppModal';
import { FormField, FormInput } from '@/components/common/FormField';
import { GoldButton } from '@/components/common/GoldButton';
import { DISH_CATEGORIES } from '@/constants/mockData';
import { useAppContext } from '@/context/AppContext';
import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import { extractRecipeFromYoutube } from '@/services/youtubeRecipeExtractor';
import type { Dish, DishCategory } from '@/types';

interface AddDishModalProps {
  visible: boolean;
  onClose: () => void;
  dish?: Dish | null;
}

const CATEGORY_OPTIONS = DISH_CATEGORIES.filter((c) => c.id !== 'all');

export function AddDishModal({ visible, onClose, dish }: AddDishModalProps) {
  const { activeFlat, addDish, updateDish } = useAppContext();
  const [name, setName] = useState(dish?.name ?? '');
  const [category, setCategory] = useState<DishCategory>(dish?.category ?? 'dinner');
  const [imageUri, setImageUri] = useState(dish?.imageUri ?? '');
  const [ingredientsText, setIngredientsText] = useState(
    dish?.ingredients?.join(', ') ?? '',
  );
  const [cookingTime, setCookingTime] = useState(
    dish ? String(dish.cookingTimeMinutes) : '30',
  );
  const [budget, setBudget] = useState(
    dish ? String(dish.estimatedBudget) : '25',
  );
  const [recipe, setRecipe] = useState(dish?.recipe ?? '');
  const [youtubeUrl, setYoutubeUrl] = useState(dish?.youtubeUrl ?? '');
  const [analyzing, setAnalyzing] = useState(false);

  const resetAndClose = () => {
    setName('');
    setCategory('dinner');
    setImageUri('');
    setIngredientsText('');
    setCookingTime('30');
    setBudget('25');
    setRecipe('');
    setYoutubeUrl('');
    onClose();
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow gallery access to choose a photo.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setImageUri(result.assets[0].uri);
    }
  };

  const handleAnalyzeYoutube = async () => {
    if (!youtubeUrl.trim()) {
      Alert.alert('YouTube link required', 'Paste a YouTube URL first.');
      return;
    }

    try {
      setAnalyzing(true);
      const extracted = await extractRecipeFromYoutube(youtubeUrl.trim());
      setName(extracted.name);
      setIngredientsText(extracted.ingredients.join(', '));
      setRecipe(extracted.recipe);
      setCookingTime(String(extracted.cookingTimeMinutes));
      setBudget(String(extracted.estimatedBudget));
      if (extracted.imageUri) setImageUri(extracted.imageUri);
    } catch (error) {
      Alert.alert(
        'AI extraction failed',
        error instanceof Error ? error.message : 'Could not read this video.',
      );
    } finally {
      setAnalyzing(false);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a dish name.');
      return;
    }

    const payload = {
      name: name.trim(),
      category,
      flatId: dish?.flatId ?? activeFlat,
      imageUri: imageUri || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&q=80',
      recipe: recipe.trim(),
      ingredients: ingredientsText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
      cookingTimeMinutes: Number(cookingTime) || 30,
      estimatedBudget: Number(budget) || 20,
      youtubeUrl: youtubeUrl.trim() || undefined,
    };

    if (dish && !dish.isHotpotSet) {
      updateDish(dish.id, payload);
    } else {
      addDish(payload);
    }

    resetAndClose();
  };

  return (
    <AppModal
      visible={visible}
      title={dish ? 'Edit Dish' : 'Add Dish'}
      onClose={resetAndClose}>
      <FormField label="YouTube Link">
        <FormInput
          value={youtubeUrl}
          onChangeText={setYoutubeUrl}
          placeholder="https://youtube.com/..."
          autoCapitalize="none"
          keyboardType="url"
        />
      </FormField>

      <Pressable
        onPress={handleAnalyzeYoutube}
        disabled={analyzing}
        style={[styles.aiButton, analyzing && styles.aiButtonDisabled]}>
        {analyzing ? (
          <ActivityIndicator color={FamilyPalette.champagne} />
        ) : (
          <Text style={styles.aiButtonText}>✦ Analyze with AI</Text>
        )}
      </Pressable>

      <Text style={styles.aiHint}>
        Paste a YouTube link — AI will draft ingredients, recipe, time & budget.
      </Text>

      <Pressable onPress={pickImage} style={styles.imageWrap}>
        {imageUri ? (
          <Image source={{ uri: imageUri }} style={styles.image} contentFit="cover" />
        ) : (
          <View style={styles.imagePlaceholder}>
            <Text style={styles.imageHint}>Tap to add image</Text>
          </View>
        )}
      </Pressable>

      <FormField label="Name">
        <FormInput value={name} onChangeText={setName} placeholder="Dish name" />
      </FormField>

      <FormField label="Category">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.categoryRow}>
            {CATEGORY_OPTIONS.map((option) => {
              const active = category === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => setCategory(option.id)}
                  style={[styles.chip, active && styles.chipActive]}>
                  <Text style={[styles.chipText, active && styles.chipTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </FormField>

      <FormField label="Ingredients (comma separated)">
        <FormInput
          value={ingredientsText}
          onChangeText={setIngredientsText}
          placeholder="egg, tomato, onion..."
          multiline
        />
      </FormField>

      <View style={styles.row}>
        <View style={styles.half}>
          <FormField label="Cooking Time (min)">
            <FormInput value={cookingTime} onChangeText={setCookingTime} keyboardType="numeric" />
          </FormField>
        </View>
        <View style={styles.half}>
          <FormField label="Est. Budget ($)">
            <FormInput value={budget} onChangeText={setBudget} keyboardType="numeric" />
          </FormField>
        </View>
      </View>

      <FormField label="Recipe Notes">
        <FormInput
          value={recipe}
          onChangeText={setRecipe}
          placeholder="Steps and notes..."
          multiline
        />
      </FormField>

      <GoldButton label={dish ? 'Save Changes' : 'Add Dish'} onPress={handleSave} />
    </AppModal>
  );
}

const styles = StyleSheet.create({
  aiButton: {
    alignItems: 'center',
    paddingVertical: FamilySpacing.md,
    borderRadius: FamilyRadius.md,
    borderWidth: 1,
    borderColor: FamilyPalette.champagne,
    backgroundColor: FamilyPalette.champagneLight,
  },
  aiButtonDisabled: {
    opacity: 0.7,
  },
  aiButtonText: {
    color: FamilyPalette.champagne,
    fontSize: 15,
    letterSpacing: 0.6,
  },
  aiHint: {
    ...FamilyTypography.caption,
    fontStyle: 'italic',
    textAlign: 'center',
    marginBottom: FamilySpacing.sm,
  },
  imageWrap: {
    alignSelf: 'stretch',
  },
  image: {
    width: '100%',
    height: 160,
    borderRadius: FamilyRadius.md,
  },
  imagePlaceholder: {
    width: '100%',
    height: 160,
    borderRadius: FamilyRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: FamilyPalette.champagne,
    backgroundColor: FamilyPalette.cream,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageHint: {
    ...FamilyTypography.caption,
    color: FamilyPalette.champagne,
  },
  categoryRow: {
    flexDirection: 'row',
    gap: FamilySpacing.sm,
    paddingVertical: FamilySpacing.xs,
  },
  chip: {
    paddingHorizontal: FamilySpacing.md,
    paddingVertical: FamilySpacing.sm,
    borderRadius: FamilyRadius.pill,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    backgroundColor: FamilyPalette.cream,
  },
  chipActive: {
    borderColor: FamilyPalette.champagne,
    backgroundColor: FamilyPalette.champagneLight,
  },
  chipText: {
    ...FamilyTypography.caption,
    color: FamilyPalette.charcoalMuted,
  },
  chipTextActive: {
    color: FamilyPalette.charcoal,
    fontWeight: '500',
  },
  row: {
    flexDirection: 'row',
    gap: FamilySpacing.md,
  },
  half: {
    flex: 1,
  },
});
