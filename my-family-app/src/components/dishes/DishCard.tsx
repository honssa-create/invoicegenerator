import { Image } from 'expo-image';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import type { Dish } from '@/types';

interface DishCardProps {
  dish: Dish;
  onSelectTonight?: () => void;
  showSelectTonight?: boolean;
}

export function DishCard({ dish, onSelectTonight, showSelectTonight = true }: DishCardProps) {
  const handleYouTubePress = () => {
    if (dish.youtubeUrl) Linking.openURL(dish.youtubeUrl);
  };

  return (
    <View style={styles.card}>
      <Image
        source={{ uri: dish.imageUri }}
        style={styles.image}
        contentFit="cover"
        transition={200}
      />

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {dish.name}
        </Text>

        <View style={styles.tags}>
          <View style={styles.tag}>
            <Text style={styles.tagText}>{dish.category}</Text>
          </View>
          {dish.tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>

        {dish.recipe ? (
          <Text style={styles.recipe} numberOfLines={2}>
            {dish.recipe}
          </Text>
        ) : null}

        <View style={styles.actions}>
          {showSelectTonight && onSelectTonight ? (
            <Pressable onPress={onSelectTonight} style={styles.selectButton}>
              <Text style={styles.selectText}>Select for Tonight</Text>
            </Pressable>
          ) : null}

          {dish.youtubeUrl ? (
            <Pressable onPress={handleYouTubePress} style={styles.youtubeButton}>
              <Text style={styles.youtubeText}>YouTube</Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    backgroundColor: FamilyPalette.softWhite,
    borderRadius: FamilyRadius.lg,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    overflow: 'hidden',
    marginBottom: FamilySpacing.md,
  },
  image: {
    width: 112,
    minHeight: 140,
    backgroundColor: FamilyPalette.champagneLight,
  },
  body: {
    flex: 1,
    padding: FamilySpacing.md,
    gap: FamilySpacing.sm,
    justifyContent: 'center',
  },
  title: {
    ...FamilyTypography.heading,
    fontSize: 17,
  },
  tags: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: FamilySpacing.xs,
  },
  tag: {
    paddingHorizontal: FamilySpacing.sm,
    paddingVertical: 2,
    borderRadius: FamilyRadius.pill,
    backgroundColor: FamilyPalette.cream,
  },
  tagText: {
    fontSize: 11,
    color: FamilyPalette.champagne,
    letterSpacing: 0.3,
    textTransform: 'capitalize',
  },
  recipe: {
    ...FamilyTypography.caption,
    lineHeight: 18,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: FamilySpacing.sm,
    marginTop: FamilySpacing.xs,
  },
  selectButton: {
    paddingVertical: FamilySpacing.xs,
  },
  selectText: {
    fontSize: 13,
    color: FamilyPalette.champagne,
    fontStyle: 'italic',
    letterSpacing: 0.3,
  },
  youtubeButton: {
    paddingVertical: FamilySpacing.xs,
    paddingHorizontal: FamilySpacing.sm,
    borderRadius: FamilyRadius.sm,
    borderWidth: 1,
    borderColor: FamilyPalette.champagneMuted,
  },
  youtubeText: {
    fontSize: 12,
    color: FamilyPalette.champagne,
  },
});
