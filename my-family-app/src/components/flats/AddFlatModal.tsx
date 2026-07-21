import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { AppModal } from '@/components/common/AppModal';
import { FormField, FormInput } from '@/components/common/FormField';
import { GoldButton } from '@/components/common/GoldButton';
import { useAppContext } from '@/context/AppContext';

interface AddFlatModalProps {
  visible: boolean;
  onClose: () => void;
}

export function AddFlatModal({ visible, onClose }: AddFlatModalProps) {
  const { addFlat, flats } = useAppContext();
  const [name, setName] = useState('');

  const handleSave = () => {
    const trimmed = name.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Please enter a flat name (e.g. 10J, 20C).');
      return;
    }
    if (flats.some((flat) => flat.name.toLowerCase() === trimmed.toLowerCase())) {
      Alert.alert('Already exists', 'A flat with this name already exists.');
      return;
    }
    addFlat(trimmed);
    setName('');
    onClose();
  };

  return (
    <AppModal visible={visible} title="Add Flat" onClose={onClose}>
      <FormField label="Flat Name">
        <FormInput
          value={name}
          onChangeText={setName}
          placeholder="e.g. 12A, 8F"
          autoCapitalize="characters"
        />
      </FormField>
      <GoldButton label="Create Flat" onPress={handleSave} />
    </AppModal>
  );
}

const styles = StyleSheet.create({});
