import { useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { FormField, FormInput } from '@/components/common/FormField';
import { GoldButton } from '@/components/common/GoldButton';
import {
  HOTPOT_INGREDIENT_GROUPS,
  SOUP_BASE_OPTIONS,
} from '@/constants/mockData';
import { useAppContext } from '@/context/AppContext';
import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import type { HotpotIngredientCategory, SoupBase } from '@/types';

export function HotpotBuilderScreen() {
  const router = useRouter();
  const { hotpotIngredients, addHotpotSet } = useAppContext();
  const [name, setName] = useState('');
  const [soupBase, setSoupBase] = useState<SoupBase>('miso');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const toggleIngredient = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id],
    );
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please name your hotpot set.');
      return;
    }
    if (selectedIds.length === 0) {
      Alert.alert('Ingredients required', 'Select at least one ingredient.');
      return;
    }

    addHotpotSet({
      name: name.trim(),
      soupBase,
      ingredientIds: selectedIds,
    });

    router.back();
  };

  const renderGroup = (category: HotpotIngredientCategory, label: string) => {
    const items = hotpotIngredients.filter((item) => item.category === category);

    return (
      <View key={category} style={styles.group}>
        <Text style={styles.groupLabel}>{label}</Text>
        <View style={styles.checkboxGrid}>
          {items.map((item) => {
            const checked = selectedIds.includes(item.id);
            return (
              <Pressable
                key={item.id}
                onPress={() => toggleIngredient(item.id)}
                style={[styles.checkbox, checked && styles.checkboxChecked]}>
                <View style={[styles.check, checked && styles.checkActive]}>
                  {checked ? <Text style={styles.checkMark}>✓</Text> : null}
                </View>
                <Text style={[styles.checkboxLabel, checked && styles.checkboxLabelActive]}>
                  {item.name}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <ScreenContainer>
      <View style={styles.header}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Text style={styles.back}>← Back</Text>
        </Pressable>
        <Text style={styles.label}>Hotpot Builder</Text>
        <Text style={styles.title}>New Set</Text>
        <Text style={styles.subtitle}>
          Compose your perfect pot — ingredients, base, and all.
        </Text>
      </View>

      <FormField label="Set Name">
        <FormInput
          value={name}
          onChangeText={setName}
          placeholder="Sunday Family Hotpot"
        />
      </FormField>

      <FormField label="Soup Base">
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.baseRow}>
            {SOUP_BASE_OPTIONS.map((option) => {
              const active = soupBase === option.id;
              return (
                <Pressable
                  key={option.id}
                  onPress={() => setSoupBase(option.id)}
                  style={[styles.baseChip, active && styles.baseChipActive]}>
                  <Text style={[styles.baseText, active && styles.baseTextActive]}>
                    {option.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>
      </FormField>

      {HOTPOT_INGREDIENT_GROUPS.map((group) =>
        renderGroup(group.id, group.label),
      )}

      <View style={styles.footer}>
        <GoldButton label="Save Hotpot Set" onPress={handleSave} />
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  header: {
    marginBottom: FamilySpacing.xl,
    gap: FamilySpacing.sm,
  },
  back: {
    ...FamilyTypography.caption,
    color: FamilyPalette.champagne,
    marginBottom: FamilySpacing.sm,
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
  baseRow: {
    flexDirection: 'row',
    gap: FamilySpacing.sm,
    paddingVertical: FamilySpacing.xs,
  },
  baseChip: {
    paddingHorizontal: FamilySpacing.md,
    paddingVertical: FamilySpacing.sm,
    borderRadius: FamilyRadius.pill,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    backgroundColor: FamilyPalette.cream,
  },
  baseChipActive: {
    borderColor: FamilyPalette.champagne,
    backgroundColor: FamilyPalette.champagneLight,
  },
  baseText: {
    ...FamilyTypography.caption,
    color: FamilyPalette.charcoalMuted,
  },
  baseTextActive: {
    color: FamilyPalette.charcoal,
    fontWeight: '500',
  },
  group: {
    marginTop: FamilySpacing.lg,
    gap: FamilySpacing.md,
  },
  groupLabel: {
    ...FamilyTypography.label,
    color: FamilyPalette.charcoalMuted,
  },
  checkboxGrid: {
    gap: FamilySpacing.sm,
  },
  checkbox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FamilySpacing.md,
    padding: FamilySpacing.md,
    borderRadius: FamilyRadius.md,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    backgroundColor: FamilyPalette.softWhite,
  },
  checkboxChecked: {
    borderColor: FamilyPalette.champagne,
    backgroundColor: FamilyPalette.champagneLight,
  },
  check: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: FamilyPalette.champagneMuted,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkActive: {
    backgroundColor: FamilyPalette.champagne,
    borderColor: FamilyPalette.champagne,
  },
  checkMark: {
    color: FamilyPalette.white,
    fontSize: 13,
    fontWeight: '600',
  },
  checkboxLabel: {
    ...FamilyTypography.body,
    fontSize: 15,
  },
  checkboxLabelActive: {
    color: FamilyPalette.charcoal,
  },
  footer: {
    marginTop: FamilySpacing.xl,
    marginBottom: FamilySpacing.xxl,
  },
});
