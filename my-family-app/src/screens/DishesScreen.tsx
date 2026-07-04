import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { FloatingActionButton } from '@/components/common/FloatingActionButton';
import { AddDishModal } from '@/components/dishes/AddDishModal';
import { CategoryFilter, useDishFilter } from '@/components/dishes/CategoryFilter';
import { DishCard } from '@/components/dishes/DishCard';
import { useAppContext } from '@/context/AppContext';
import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';

export function DishesScreen() {
  const router = useRouter();
  const { dishes, addDishToDate } = useAppContext();
  const { selectedCategory, setSelectedCategory, filteredItems } = useDishFilter(dishes);
  const [modalVisible, setModalVisible] = useState(false);

  const handleSelectTonight = (dishId: string) => {
    addDishToDate(dishId);
  };

  const openDetail = (dishId: string) => {
    router.push(`/dish/${dishId}`);
  };

  return (
    <View style={styles.root}>
      <ScreenContainer>
        <View style={styles.header}>
          <Text style={styles.label}>Dishes</Text>
          <Text style={styles.title}>The Collection</Text>
          <Text style={styles.subtitle}>
            Tap any dish for full recipe, ingredients, time & budget.
          </Text>
        </View>

        <CategoryFilter selected={selectedCategory} onSelect={setSelectedCategory} />

        {selectedCategory === 'hotpot' ? (
          <Pressable
            onPress={() => router.push('/hotpot-builder')}
            style={styles.hotpotCta}>
            <Text style={styles.hotpotCtaText}>+ New Hotpot Set</Text>
          </Pressable>
        ) : null}

        <View style={styles.list}>
          {filteredItems.length > 0 ? (
            filteredItems.map((dish) => (
              <DishCard
                key={dish.id}
                dish={dish}
                onPress={() => openDetail(dish.id)}
                onSelectTonight={() => handleSelectTonight(dish.id)}
              />
            ))
          ) : (
            <View style={styles.empty}>
              <Text style={styles.emptyText}>No dishes in this category.</Text>
            </View>
          )}
        </View>
      </ScreenContainer>

      <FloatingActionButton onPress={() => setModalVisible(true)} />
      <AddDishModal visible={modalVisible} onClose={() => setModalVisible(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    marginBottom: FamilySpacing.xl,
    gap: FamilySpacing.sm,
  },
  label: {
    ...FamilyTypography.label,
  },
  title: {
    ...FamilyTypography.title,
  },
  subtitle: {
    ...FamilyTypography.body,
    marginTop: FamilySpacing.xs,
  },
  hotpotCta: {
    alignSelf: 'flex-start',
    marginBottom: FamilySpacing.lg,
    paddingHorizontal: FamilySpacing.md,
    paddingVertical: FamilySpacing.sm,
    borderRadius: FamilyRadius.pill,
    borderWidth: 1,
    borderColor: FamilyPalette.champagne,
  },
  hotpotCtaText: {
    fontSize: 13,
    color: FamilyPalette.champagne,
    letterSpacing: 0.4,
  },
  list: {
    gap: FamilySpacing.md,
  },
  empty: {
    paddingVertical: FamilySpacing.xxl,
    alignItems: 'center',
  },
  emptyText: {
    ...FamilyTypography.caption,
    fontStyle: 'italic',
    color: FamilyPalette.charcoalMuted,
  },
});
