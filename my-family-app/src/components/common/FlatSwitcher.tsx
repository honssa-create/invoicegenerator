import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import type { Flat, FlatId } from '@/types';

interface FlatSwitcherProps {
  flats: Flat[];
  activeFlat: FlatId;
  onChange: (flat: FlatId) => void;
  onAddFlat?: () => void;
  label?: string;
}

export function FlatSwitcher({
  flats,
  activeFlat,
  onChange,
  onAddFlat,
  label = 'Flat',
}: FlatSwitcherProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View style={styles.row}>
          {flats.map((flat) => {
            const selected = activeFlat === flat.id;
            return (
              <Pressable
                key={flat.id}
                onPress={() => onChange(flat.id)}
                style={[styles.chip, selected && styles.chipActive]}>
                <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                  {flat.name}
                </Text>
              </Pressable>
            );
          })}
          {onAddFlat ? (
            <Pressable onPress={onAddFlat} style={styles.addChip}>
              <Text style={styles.addText}>+ Add Flat</Text>
            </Pressable>
          ) : null}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: FamilySpacing.sm,
    marginBottom: FamilySpacing.lg,
  },
  label: {
    ...FamilyTypography.label,
    color: FamilyPalette.charcoalMuted,
  },
  row: {
    flexDirection: 'row',
    gap: FamilySpacing.sm,
    paddingRight: FamilySpacing.lg,
  },
  chip: {
    paddingHorizontal: FamilySpacing.lg,
    paddingVertical: FamilySpacing.sm + 2,
    borderRadius: FamilyRadius.md,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    backgroundColor: FamilyPalette.softWhite,
    alignItems: 'center',
  },
  chipActive: {
    borderColor: FamilyPalette.champagne,
    backgroundColor: FamilyPalette.champagneLight,
  },
  chipText: {
    ...FamilyTypography.body,
    fontSize: 15,
    color: FamilyPalette.charcoalMuted,
  },
  chipTextActive: {
    color: FamilyPalette.charcoal,
    fontWeight: '500',
  },
  addChip: {
    paddingHorizontal: FamilySpacing.md,
    paddingVertical: FamilySpacing.sm + 2,
    borderRadius: FamilyRadius.md,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: FamilyPalette.champagne,
    justifyContent: 'center',
  },
  addText: {
    ...FamilyTypography.caption,
    color: FamilyPalette.champagne,
  },
});
