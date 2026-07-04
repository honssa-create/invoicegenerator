import { useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { CommunityDishCard } from '@/components/community/CommunityDishCard';
import { ScreenContainer } from '@/components/common/ScreenContainer';
import { useAppContext } from '@/context/AppContext';
import {
  FamilyPalette,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';

export function CommunityFeedScreen() {
  const router = useRouter();
  const { publicDishes } = useAppContext();

  return (
    <View style={styles.root}>
      <ScreenContainer contentStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.label}>公海 · Global Kitchen</Text>
          <Text style={styles.title}>Community</Text>
          <Text style={styles.subtitle}>
            Recipes shared by families near and far — discover, savor, and connect.
          </Text>
        </View>

        <View style={styles.feed}>
          {publicDishes.map((dish) => (
            <CommunityDishCard
              key={dish.id}
              dish={dish}
              onPress={() => router.push(`/community/${dish.id}`)}
            />
          ))}
        </View>

        {publicDishes.length === 0 ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>
              The community pool is quiet for now. Share a recipe from your library.
            </Text>
          </View>
        ) : null}
      </ScreenContainer>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: FamilyPalette.cream,
  },
  content: {
    paddingTop: FamilySpacing.xxl,
  },
  header: {
    marginBottom: FamilySpacing.xxl,
    gap: FamilySpacing.sm,
  },
  label: {
    ...FamilyTypography.label,
  },
  title: {
    ...FamilyTypography.title,
    fontSize: 32,
    fontWeight: '200',
  },
  subtitle: {
    ...FamilyTypography.body,
    maxWidth: 420,
    lineHeight: 24,
    color: FamilyPalette.charcoalMuted,
  },
  feed: {
    gap: FamilySpacing.md,
  },
  empty: {
    paddingVertical: FamilySpacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    ...FamilyTypography.caption,
    fontStyle: 'italic',
    textAlign: 'center',
    maxWidth: 280,
  },
});
