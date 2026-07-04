import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { FormField, FormInput } from '@/components/common/FormField';
import { GoldButton } from '@/components/common/GoldButton';
import { useAppContext } from '@/context/AppContext';
import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import type { BudgetMode } from '@/types';
import { BUDGET_MODE_OPTIONS } from '@/utils/budgetPlanner';

import { AppModal } from '@/components/common/AppModal';

interface BudgetPlannerModalProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: string;
}

export function BudgetPlannerModal({
  visible,
  onClose,
  selectedDate,
}: BudgetPlannerModalProps) {
  const { suggestDishesForBudget, applyBudgetPlan } = useAppContext();
  const [budget, setBudget] = useState('100');
  const [dishCount, setDishCount] = useState('3');
  const [mode, setMode] = useState<BudgetMode>('economy');
  const [preview, setPreview] = useState<ReturnType<typeof suggestDishesForBudget>>([]);

  const handlePreview = () => {
    const picks = suggestDishesForBudget({
      budget: Number(budget) || 0,
      dishCount: Number(dishCount) || 1,
      mode,
    });
    setPreview(picks);
  };

  const handleApply = () => {
    applyBudgetPlan(
      {
        budget: Number(budget) || 0,
        dishCount: Number(dishCount) || 1,
        mode,
      },
      selectedDate,
    );
    onClose();
  };

  const total = preview.reduce((sum, dish) => sum + dish.estimatedBudget, 0);

  return (
    <AppModal visible={visible} title="Budget Planner" onClose={onClose}>
      <Text style={styles.intro}>
        Set your budget and let the system curate tonight&apos;s menu.
      </Text>

      <FormField label="Total Budget ($)">
        <FormInput
          value={budget}
          onChangeText={setBudget}
          keyboardType="numeric"
          placeholder="100"
        />
      </FormField>

      <FormField label="Number of Dishes">
        <FormInput
          value={dishCount}
          onChangeText={setDishCount}
          keyboardType="numeric"
          placeholder="3"
        />
      </FormField>

      <View style={styles.modeRow}>
        {BUDGET_MODE_OPTIONS.map((option) => {
          const active = mode === option.id;
          return (
            <Pressable
              key={option.id}
              onPress={() => setMode(option.id)}
              style={[styles.modeChip, active && styles.modeChipActive]}>
              <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>
                {option.label}
              </Text>
              <Text style={styles.modeSubtitle}>{option.subtitle}</Text>
            </Pressable>
          );
        })}
      </View>

      <GoldButton label="Preview Selection" onPress={handlePreview} variant="outline" />

      {preview.length > 0 ? (
        <View style={styles.preview}>
          <Text style={styles.previewTitle}>
            Suggested · {preview.length} dishes · ${total}
          </Text>
          {preview.map((dish) => (
            <View key={dish.id} style={styles.previewItem}>
              <Text style={styles.previewName}>{dish.name}</Text>
              <Text style={styles.previewMeta}>
                ${dish.estimatedBudget} · {dish.cookingTimeMinutes} min
              </Text>
            </View>
          ))}
          <GoldButton label="Apply to Planner" onPress={handleApply} />
        </View>
      ) : null}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  intro: {
    ...FamilyTypography.caption,
    marginBottom: FamilySpacing.sm,
  },
  modeRow: {
    gap: FamilySpacing.sm,
  },
  modeChip: {
    padding: FamilySpacing.md,
    borderRadius: FamilyRadius.md,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    backgroundColor: FamilyPalette.cream,
    gap: FamilySpacing.xs,
  },
  modeChipActive: {
    borderColor: FamilyPalette.champagne,
    backgroundColor: FamilyPalette.champagneLight,
  },
  modeLabel: {
    ...FamilyTypography.body,
    color: FamilyPalette.charcoalSoft,
    fontSize: 15,
  },
  modeLabelActive: {
    color: FamilyPalette.charcoal,
    fontWeight: '500',
  },
  modeSubtitle: {
    ...FamilyTypography.caption,
    fontSize: 12,
  },
  preview: {
    gap: FamilySpacing.sm,
    padding: FamilySpacing.md,
    borderRadius: FamilyRadius.md,
    backgroundColor: FamilyPalette.cream,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
  },
  previewTitle: {
    ...FamilyTypography.label,
    color: FamilyPalette.charcoal,
  },
  previewItem: {
    paddingVertical: FamilySpacing.xs,
    borderBottomWidth: 1,
    borderBottomColor: FamilyPalette.border,
  },
  previewName: {
    ...FamilyTypography.body,
    color: FamilyPalette.charcoal,
    fontSize: 15,
  },
  previewMeta: {
    ...FamilyTypography.caption,
    marginTop: 2,
  },
});
