import { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { FloatingActionButton } from '@/components/common/FloatingActionButton';
import { AddMemberModal } from '@/components/members/AddMemberModal';
import { MemberCard } from '@/components/members/MemberCard';
import { useAppContext } from '@/context/AppContext';
import {
  FamilyPalette,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import type { FamilyMember } from '@/types';

export function MembersScreen() {
  const { members } = useAppContext();
  const [modalVisible, setModalVisible] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);

  const openAdd = () => {
    setEditingMember(null);
    setModalVisible(true);
  };

  const openEdit = (member: FamilyMember) => {
    setEditingMember(member);
    setModalVisible(true);
  };

  return (
    <View style={styles.root}>
      <ScreenContainer>
        <View style={styles.header}>
          <Text style={styles.label}>Members</Text>
          <Text style={styles.title}>Our Family</Text>
          <Text style={styles.subtitle}>
            The people gathered around your table.
          </Text>
        </View>

        {members.length > 0 ? (
          members.map((member) => (
            <MemberCard key={member.id} member={member} onPress={() => openEdit(member)} />
          ))
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No members yet. Tap + to add.</Text>
          </View>
        )}
      </ScreenContainer>

      <FloatingActionButton onPress={openAdd} />

      <AddMemberModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        member={editingMember}
      />
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
