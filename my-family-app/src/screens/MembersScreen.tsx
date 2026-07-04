import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ScreenContainer } from '@/components/common/ScreenContainer';
import { FlatSwitcher } from '@/components/common/FlatSwitcher';
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
  const { activeFlat, setActiveFlat, getMembersForFlat } = useAppContext();
  const members = getMembersForFlat(activeFlat);
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
            Flat {activeFlat} — the people gathered around your table.
          </Text>
        </View>

        <FlatSwitcher activeFlat={activeFlat} onChange={setActiveFlat} />

        {members.length > 0 ? (
          members.map((member) => (
            <MemberCard key={member.id} member={member} onPress={() => openEdit(member)} />
          ))
        ) : (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>No members in {activeFlat} yet. Tap + to add.</Text>
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
    marginBottom: FamilySpacing.lg,
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
