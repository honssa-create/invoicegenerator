import { Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';

import {
  CommunityCommentBar,
  CommunityCommentList,
} from '@/components/community/CommunityCommentSection';
import { GoldButton } from '@/components/common/GoldButton';
import { useAppContext } from '@/context/AppContext';
import { getCuisineLabel } from '@/constants/cuisines';
import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
  MaxContentWidth,
} from '@/constants/familyTheme';
import { formatBudget, formatCookingTime } from '@/utils/budgetPlanner';

export function CommunityDishDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { getPublicDishById, addCommentToDish, publicDishes } = useAppContext();

  const dish = id ? getPublicDishById(id) : undefined;
  const liveDish = publicDishes.find((item) => item.id === id) ?? dish;

  if (!liveDish) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.notFound}>
          <Text style={styles.empty}>Recipe not found.</Text>
          <GoldButton label="Go Back" onPress={() => router.back()} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <View style={styles.layout}>
        <ScrollView
          style={styles.scroll}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled">
          <View style={styles.content}>
            <Pressable onPress={() => router.back()} style={styles.back}>
              <Text style={styles.backText}>← Back</Text>
            </Pressable>

            <Image
              source={{ uri: liveDish.imageUri }}
              style={styles.hero}
              contentFit="cover"
            />

            <View style={styles.header}>
              <Text style={styles.label}>
                {getCuisineLabel(liveDish.cuisine)} · {liveDish.category}
              </Text>
              <Text style={styles.title}>{liveDish.name}</Text>
              <Text style={styles.publisher}>Published by {liveDish.familyName}</Text>
            </View>

            <View style={styles.metaRow}>
              <View style={styles.metaCard}>
                <Text style={styles.metaLabel}>Cooking Time</Text>
                <Text style={styles.metaValue}>
                  {formatCookingTime(liveDish.cookingTimeMinutes)}
                </Text>
              </View>
              <View style={styles.metaCard}>
                <Text style={styles.metaLabel}>Est. Budget</Text>
                <Text style={styles.metaValue}>{formatBudget(liveDish.estimatedBudget)}</Text>
              </View>
              <View style={styles.metaCard}>
                <Text style={styles.metaLabel}>Likes</Text>
                <Text style={styles.metaValue}>{liveDish.likesCount}</Text>
              </View>
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Ingredients</Text>
              {liveDish.ingredients.map((item) => (
                <Text key={item} style={styles.bullet}>
                  · {item}
                </Text>
              ))}
            </View>

            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Recipe</Text>
              <Text style={styles.recipe}>{liveDish.recipe}</Text>
            </View>

            {liveDish.youtubeUrl ? (
              <Pressable
                onPress={() => Linking.openURL(liveDish.youtubeUrl!)}
                style={styles.youtube}>
                <Text style={styles.youtubeText}>Watch on YouTube</Text>
              </Pressable>
            ) : null}

            <CommunityCommentList comments={liveDish.comments} />
          </View>
        </ScrollView>

        <CommunityCommentBar onPost={(text) => addCommentToDish(liveDish.id, text)} />
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: FamilyPalette.cream,
  },
  layout: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
  },
  content: {
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
    paddingHorizontal: FamilySpacing.lg,
    paddingTop: FamilySpacing.lg,
    paddingBottom: FamilySpacing.lg,
  },
  back: {
    marginBottom: FamilySpacing.md,
  },
  backText: {
    ...FamilyTypography.caption,
    color: FamilyPalette.champagne,
  },
  hero: {
    width: '100%',
    height: 260,
    borderRadius: FamilyRadius.lg,
    marginBottom: FamilySpacing.xl,
    backgroundColor: FamilyPalette.champagneLight,
  },
  header: {
    gap: FamilySpacing.xs,
    marginBottom: FamilySpacing.xl,
  },
  label: {
    ...FamilyTypography.label,
    textTransform: 'capitalize',
  },
  title: {
    ...FamilyTypography.title,
    fontSize: 28,
  },
  publisher: {
    ...FamilyTypography.caption,
    fontStyle: 'italic',
    color: FamilyPalette.charcoalMuted,
    marginTop: FamilySpacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: FamilySpacing.md,
    marginBottom: FamilySpacing.xl,
  },
  metaCard: {
    flex: 1,
    minWidth: 100,
    padding: FamilySpacing.md,
    borderRadius: FamilyRadius.md,
    backgroundColor: FamilyPalette.softWhite,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    gap: FamilySpacing.xs,
  },
  metaLabel: {
    ...FamilyTypography.caption,
  },
  metaValue: {
    ...FamilyTypography.heading,
    fontSize: 17,
  },
  section: {
    marginBottom: FamilySpacing.xl,
    gap: FamilySpacing.sm,
  },
  sectionTitle: {
    ...FamilyTypography.heading,
    fontSize: 17,
  },
  bullet: {
    ...FamilyTypography.body,
    fontSize: 15,
    textTransform: 'capitalize',
    color: FamilyPalette.charcoal,
  },
  recipe: {
    ...FamilyTypography.body,
    lineHeight: 26,
    color: FamilyPalette.charcoal,
  },
  youtube: {
    alignSelf: 'flex-start',
    marginBottom: FamilySpacing.xl,
    paddingVertical: FamilySpacing.sm,
    paddingHorizontal: FamilySpacing.md,
    borderRadius: FamilyRadius.sm,
    borderWidth: 1,
    borderColor: FamilyPalette.champagne,
  },
  youtubeText: {
    color: FamilyPalette.champagne,
    letterSpacing: 0.3,
  },
  notFound: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: FamilySpacing.xl,
    gap: FamilySpacing.lg,
  },
  empty: {
    ...FamilyTypography.caption,
    fontStyle: 'italic',
    color: FamilyPalette.charcoalMuted,
  },
});
