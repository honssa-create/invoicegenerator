import { ReactNode } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';

import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';

interface AppModalProps {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  contentStyle?: ViewStyle;
}

export function AppModal({
  visible,
  title,
  onClose,
  children,
  contentStyle,
}: AppModalProps) {
  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <Pressable style={styles.backdrop} onPress={onClose} />
        <View style={[styles.sheet, contentStyle]}>
          <View style={styles.header}>
            <Text style={styles.title}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={12}>
              <Text style={styles.close}>✕</Text>
            </Pressable>
          </View>
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.body}
            keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    padding: FamilySpacing.lg,
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(44, 44, 44, 0.35)',
  },
  sheet: {
    backgroundColor: FamilyPalette.softWhite,
    borderRadius: FamilyRadius.lg,
    maxHeight: '88%',
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: FamilySpacing.lg,
    paddingTop: FamilySpacing.lg,
    paddingBottom: FamilySpacing.md,
    borderBottomWidth: 1,
    borderBottomColor: FamilyPalette.border,
  },
  title: {
    ...FamilyTypography.heading,
    fontSize: 18,
    letterSpacing: 0.4,
  },
  close: {
    fontSize: 18,
    color: FamilyPalette.charcoalMuted,
    fontWeight: '300',
  },
  body: {
    padding: FamilySpacing.lg,
    gap: FamilySpacing.md,
  },
});
