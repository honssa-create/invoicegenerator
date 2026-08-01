import { ReactNode } from 'react';
import {
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from 'react-native';

import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';

interface FormFieldProps {
  label: string;
  children: ReactNode;
}

export function FormField({ label, children }: FormFieldProps) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

export function FormInput(props: TextInputProps) {
  return (
    <TextInput
      placeholderTextColor={FamilyPalette.charcoalMuted}
      style={[styles.input, props.multiline && styles.multiline]}
      {...props}
    />
  );
}

const styles = StyleSheet.create({
  field: {
    gap: FamilySpacing.sm,
  },
  label: {
    ...FamilyTypography.label,
    color: FamilyPalette.charcoalMuted,
  },
  input: {
    backgroundColor: FamilyPalette.cream,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    borderRadius: FamilyRadius.md,
    paddingHorizontal: FamilySpacing.md,
    paddingVertical: FamilySpacing.sm + 4,
    fontSize: 16,
    color: FamilyPalette.charcoal,
    fontWeight: '300',
    letterSpacing: 0.2,
  },
  multiline: {
    minHeight: 100,
    textAlignVertical: 'top',
    paddingTop: FamilySpacing.md,
  },
});
