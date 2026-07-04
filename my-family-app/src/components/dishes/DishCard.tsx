import { Image } from 'expo-image';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';

import { getCuisineLabel } from '@/constants/cuisines';
import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import { formatBudget, formatCookingTime } from '@/utils/budgetPlanner';
import type { Dish } from '@/types';

interface DishCardProps {
  dish: Dish;
  ownerFlatName?: string;
  onPress?: () => void;
  onSchedule?: () => void;
  canSchedule?: boolean;
}

export function DishCard({
  dish,
  ownerFlatName,
  onPress,
  onSchedule,
  canSchedule = false,
}: DishCardProps) {
  const handleYouTubePress = () => {
    if (dish.youtubeUrl) Linking.openURL(dish.youtubeUrl);
  };

  return (
    <View style={styles.card}>
      <Pressable
        onPress={onPress}
        style={({ pressed }) => [styles.mainArea, pressed && styles.pressed]}>
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

          <View style={styles.meta}>
            <Text style={styles.metaText}>{getCuisineLabel(dish.cuisine)}</Text>
            <Text style={styles.metaText}>{formatCookingTime(dish.cookingTimeMinutes)}</Text>
            <Text style={styles.metaText}>{formatBudget(dish.estimatedBudget)}</Text>
          </View>

          {ownerFlatName ? (
            <Text style={styles.owner}>Flat {ownerFlatName}</Text>
          ) : null}

          <View style={styles.tags}>
            <View style={styles.tag}>
              <Text style={styles.tagText}>{dish.category}</Text>
            </View>
            {dish.tags.slice(0, 2).map((tag) => (
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
        </View>
      </Pressable>

      <View style={styles.actions}>
        {canSchedule && onSchedule ? (
          <Pressable onPress={onSchedule} style={styles.scheduleButton}>
            <Text style={styles.scheduleText}>Schedule</Text>
          </Pressable>
        ) : ownerFlatName ? (
          <Text style={styles.viewOnly}>View only — owned by Flat {ownerFlatName}</Text>
        ) : null}

        {dish.youtubeUrl ? (
          <Pressable onPress={handleYouTubePress} style={styles.youtubeButton}>
            <Text style={styles.youtubeText}>YouTube</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: FamilyPalette.softWhite,
    borderRadius: FamilyRadius.lg,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    overflow: 'hidden',
    marginBottom: FamilySpacing.md,
  },
  mainArea: {
    flexDirection: 'row',
  },
  pressed: {
    opacity: 0.92,
  },
  image: {
    width: 112,
    minHeight: 148,
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
  meta: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: FamilySpacing.sm,
  },
  metaText: {
    ...FamilyTypography.caption,
    color: FamilyPalette.champagne,
  },
  owner: {
    ...FamilyTypography.caption,
    color: FamilyPalette.charcoalMuted,
    fontStyle: 'italic',
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
    color: FamilyPalette.charcoalMuted,
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
    alignItems: 'center',
    gap: FamilySpacing.md,
    paddingHorizontal: FamilySpacing.md,
    paddingBottom: FamilySpacing.md,
    borderTopWidth: 1,
    borderTopColor: FamilyPalette.border,
    paddingTop: FamilySpacing.sm,
  },
  scheduleButton: {
    paddingVertical: FamilySpacing.xs,
    paddingHorizontal: FamilySpacing.sm,
    borderRadius: FamilyRadius.sm,
    backgroundColor: FamilyPalette.champagneLight,
    borderWidth: 1,
    borderColor: FamilyPalette.champagne,
  },
  scheduleText: {
    fontSize: 13,
    color: FamilyPalette.champagne,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
  viewOnly: {
    ...FamilyTypography.caption,
    fontStyle: 'italic',
    color: FamilyPalette.charcoalMuted,
    flex: 1,
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
