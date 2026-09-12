import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import type { FamilyMember } from '@/types';

interface MemberCardProps {
  member: FamilyMember;
  flatName?: string;
  onPress?: () => void;
}

export function MemberCard({ member, flatName, onPress }: MemberCardProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}>
      {member.avatarUri ? (
        <Image source={{ uri: member.avatarUri }} style={styles.avatar} contentFit="cover" />
      ) : (
        <View style={styles.avatarPlaceholder}>
          <Text style={styles.initials}>{member.name.charAt(0)}</Text>
        </View>
      )}

      <View style={styles.info}>
        <Text style={styles.flatBadge}>{flatName ?? member.flatId}</Text>
        <Text style={styles.name}>{member.name}</Text>
        <Text style={styles.birthday}>{member.birthday}</Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: FamilySpacing.md,
    padding: FamilySpacing.md,
    marginBottom: FamilySpacing.md,
    backgroundColor: FamilyPalette.softWhite,
    borderRadius: FamilyRadius.lg,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: FamilyRadius.pill,
  },
  avatarPlaceholder: {
    width: 64,
    height: 64,
    borderRadius: FamilyRadius.pill,
    backgroundColor: FamilyPalette.champagneLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  initials: {
    fontSize: 22,
    fontWeight: '300',
    color: FamilyPalette.champagne,
  },
  info: {
    flex: 1,
    gap: FamilySpacing.xs,
  },
  flatBadge: {
    ...FamilyTypography.label,
    fontSize: 11,
    color: FamilyPalette.champagne,
  },
  name: {
    ...FamilyTypography.heading,
    fontSize: 18,
  },
  birthday: {
    ...FamilyTypography.caption,
  },
  pressed: {
    opacity: 0.85,
  },
});
