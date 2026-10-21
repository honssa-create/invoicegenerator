import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { getCuisineLabel } from '@/constants/cuisines';
import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import type { PublicDish } from '@/types';

interface CommunityDishCardProps {
  dish: PublicDish;
  onPress: () => void;
}

export function CommunityDishCard({ dish, onPress }: CommunityDishCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      <Image source={{ uri: dish.imageUri }} style={styles.image} contentFit="cover" transition={200} />

      <View style={styles.body}>
        <Text style={styles.cuisine}>{getCuisineLabel(dish.cuisine)}</Text>
        <Text style={styles.title} numberOfLines={2}>
          {dish.name}
        </Text>
        <Text style={styles.publisher}>Published by {dish.familyName}</Text>

        <View style={styles.stats}>
          <Text style={styles.stat}>♥ {dish.likesCount}</Text>
          <Text style={styles.stat}>💬 {dish.comments.length}</Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: FamilyPalette.softWhite,
    borderRadius: FamilyRadius.lg,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    overflow: 'hidden',
    marginBottom: FamilySpacing.xl,
  },
  pressed: {
    opacity: 0.94,
  },
  image: {
    width: '100%',
    height: 200,
    backgroundColor: FamilyPalette.champagneLight,
  },
  body: {
    padding: FamilySpacing.lg,
    gap: FamilySpacing.sm,
  },
  cuisine: {
    ...FamilyTypography.label,
    fontSize: 11,
  },
  title: {
    ...FamilyTypography.heading,
    fontSize: 22,
    letterSpacing: 0.2,
  },
  publisher: {
    ...FamilyTypography.caption,
    fontStyle: 'italic',
    color: FamilyPalette.charcoalMuted,
  },
  stats: {
    flexDirection: 'row',
    gap: FamilySpacing.lg,
    marginTop: FamilySpacing.sm,
  },
  stat: {
    ...FamilyTypography.caption,
    color: FamilyPalette.champagne,
    letterSpacing: 0.4,
  },
});
