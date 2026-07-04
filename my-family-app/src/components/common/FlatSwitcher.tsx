import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import type { FlatId } from '@/types';
import { FLATS } from '@/types';

interface FlatSwitcherProps {
  activeFlat: FlatId;
  onChange: (flat: FlatId) => void;
  label?: string;
}

export function FlatSwitcher({ activeFlat, onChange, label = 'Flat' }: FlatSwitcherProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.row}>
        {FLATS.map((flat) => {
          const selected = activeFlat === flat.id;
          return (
            <Pressable
              key={flat.id}
              onPress={() => onChange(flat.id)}
              style={[styles.chip, selected && styles.chipActive]}>
              <Text style={[styles.chipText, selected && styles.chipTextActive]}>
                {flat.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
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
  },
  chip: {
    flex: 1,
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
});
