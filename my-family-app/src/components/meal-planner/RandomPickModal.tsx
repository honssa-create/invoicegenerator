import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

import { AppModal } from '@/components/common/AppModal';
import { GoldButton } from '@/components/common/GoldButton';
import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import type { Dish } from '@/types';

interface RandomPickModalProps {
  visible: boolean;
  dish: Dish | null;
  onClose: () => void;
  onPickAgain: () => void;
}

export function RandomPickModal({
  visible,
  dish,
  onClose,
  onPickAgain,
}: RandomPickModalProps) {
  return (
    <AppModal visible={visible} title="Tonight's Pick" onClose={onClose}>
      {dish ? (
        <View style={styles.content}>
          <Image source={{ uri: dish.imageUri }} style={styles.image} contentFit="cover" />
          <Text style={styles.name}>{dish.name}</Text>
          <Text style={styles.hint}>Let the evening decide for you.</Text>
          <GoldButton label="Pick Again" onPress={onPickAgain} />
        </View>
      ) : (
        <Text style={styles.empty}>Add dishes to enable random picks.</Text>
      )}
    </AppModal>
  );
}

const styles = StyleSheet.create({
  content: {
    alignItems: 'center',
    gap: FamilySpacing.md,
    paddingVertical: FamilySpacing.md,
  },
  image: {
    width: '100%',
    height: 200,
    borderRadius: FamilyRadius.lg,
    backgroundColor: FamilyPalette.champagneLight,
  },
  name: {
    ...FamilyTypography.title,
    fontSize: 24,
    textAlign: 'center',
  },
  hint: {
    ...FamilyTypography.caption,
    fontStyle: 'italic',
    textAlign: 'center',
  },
  empty: {
    ...FamilyTypography.body,
    textAlign: 'center',
    fontStyle: 'italic',
    color: FamilyPalette.charcoalMuted,
  },
});
