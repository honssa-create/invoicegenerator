import { Image } from 'expo-image';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import type { Meal } from '@/types';

interface MealCardProps {
  meal: Meal;
}

export function MealCard({ meal }: MealCardProps) {
  const handleYouTubePress = () => {
    if (meal.youtubeUrl) {
      Linking.openURL(meal.youtubeUrl);
    }
  };

  return (
    <View style={styles.card}>
      <Image
        source={{ uri: meal.imageUri }}
        style={styles.image}
        contentFit="cover"
        transition={200}
      />

      <View style={styles.body}>
        <Text style={styles.title} numberOfLines={2}>
          {meal.name}
        </Text>

        <View style={styles.tags}>
          {meal.tags.map((tag) => (
            <View key={tag} style={styles.tag}>
              <Text style={styles.tagText}>{tag}</Text>
            </View>
          ))}
        </View>

        <Text style={styles.recipe} numberOfLines={2}>
          {meal.recipe}
        </Text>

        {meal.youtubeUrl ? (
          <Pressable
            onPress={handleYouTubePress}
            style={({ pressed }) => [styles.youtubeButton, pressed && styles.pressed]}>
            <Text style={styles.youtubeText}>Watch on YouTube</Text>
          </Pressable>
        ) : null}
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
    shadowColor: FamilyPalette.charcoal,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
  },
  image: {
    width: 112,
    minHeight: 132,
    backgroundColor: FamilyPalette.champagneLight,
  },
  body: {
    flex: 1,
    padding: FamilySpacing.md,
    justifyContent: 'center',
    gap: FamilySpacing.sm,
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
  },
  recipe: {
    ...FamilyTypography.caption,
    lineHeight: 18,
  },
  youtubeButton: {
    alignSelf: 'flex-start',
    marginTop: FamilySpacing.xs,
    paddingVertical: FamilySpacing.xs,
    paddingHorizontal: FamilySpacing.sm,
    borderRadius: FamilyRadius.sm,
    borderWidth: 1,
    borderColor: FamilyPalette.champagneMuted,
  },
  youtubeText: {
    fontSize: 12,
    color: FamilyPalette.champagne,
    letterSpacing: 0.3,
  },
  pressed: {
    opacity: 0.7,
  },
});
