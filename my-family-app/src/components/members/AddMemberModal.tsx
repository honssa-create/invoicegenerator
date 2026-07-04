import * as ImagePicker from 'expo-image-picker';
import { Image } from 'expo-image';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { AppModal } from '@/components/common/AppModal';
import { FormField, FormInput } from '@/components/common/FormField';
import { GoldButton } from '@/components/common/GoldButton';
import { useAppContext } from '@/context/AppContext';
import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import type { FamilyMember } from '@/types';

interface AddMemberModalProps {
  visible: boolean;
  onClose: () => void;
  member?: FamilyMember | null;
}

export function AddMemberModal({ visible, onClose, member }: AddMemberModalProps) {
  const { addMember, updateMember } = useAppContext();
  const [name, setName] = useState(member?.name ?? '');
  const [birthday, setBirthday] = useState(member?.birthday ?? '');
  const [avatarUri, setAvatarUri] = useState(member?.avatarUri ?? '');

  const resetAndClose = () => {
    setName('');
    setBirthday('');
    setAvatarUri('');
    onClose();
  };

  const pickImage = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Please allow gallery access to choose an avatar.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      setAvatarUri(result.assets[0].uri);
    }
  };

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Name required', 'Please enter a family member name.');
      return;
    }

    const payload = {
      name: name.trim(),
      birthday: birthday.trim() || '—',
      avatarUri: avatarUri || undefined,
    };

    if (member) {
      updateMember(member.id, payload);
    } else {
      addMember(payload);
    }

    resetAndClose();
  };

  return (
    <AppModal
      visible={visible}
      title={member ? 'Edit Member' : 'Add Member'}
      onClose={resetAndClose}>
      <Pressable onPress={pickImage} style={styles.avatarWrap}>
        {avatarUri ? (
          <Image source={{ uri: avatarUri }} style={styles.avatar} contentFit="cover" />
        ) : (
          <View style={styles.avatarPlaceholder}>
            <Text style={styles.avatarHint}>Tap to add photo</Text>
          </View>
        )}
      </Pressable>

      <FormField label="Name">
        <FormInput
          value={name}
          onChangeText={setName}
          placeholder="Full name"
          autoCapitalize="words"
        />
      </FormField>

      <FormField label="Birthday">
        <FormInput
          value={birthday}
          onChangeText={setBirthday}
          placeholder="YYYY-MM-DD"
        />
      </FormField>

      <GoldButton label={member ? 'Save Changes' : 'Add Member'} onPress={handleSave} />
    </AppModal>
  );
}

const styles = StyleSheet.create({
  avatarWrap: {
    alignSelf: 'center',
    marginBottom: FamilySpacing.sm,
  },
  avatar: {
    width: 96,
    height: 96,
    borderRadius: FamilyRadius.pill,
    borderWidth: 2,
    borderColor: FamilyPalette.champagneMuted,
  },
  avatarPlaceholder: {
    width: 96,
    height: 96,
    borderRadius: FamilyRadius.pill,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: FamilyPalette.champagne,
    backgroundColor: FamilyPalette.cream,
    alignItems: 'center',
    justifyContent: 'center',
    padding: FamilySpacing.sm,
  },
  avatarHint: {
    ...FamilyTypography.caption,
    textAlign: 'center',
    color: FamilyPalette.champagne,
  },
});
