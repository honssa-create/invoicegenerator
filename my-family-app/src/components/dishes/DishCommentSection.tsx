import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { FormField, FormInput } from '@/components/common/FormField';
import { GoldButton } from '@/components/common/GoldButton';
import { useAppContext } from '@/context/AppContext';
import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import { formatDisplayDate } from '@/utils/date';

interface DishCommentSectionProps {
  dishId: string;
  date: string;
}

export function DishCommentSection({ dishId, date }: DishCommentSectionProps) {
  const { members, getDishComments, addDishComment } = useAppContext();
  const [author, setAuthor] = useState(members[0]?.name ?? 'Family');
  const [comment, setComment] = useState('');

  const comments = getDishComments(dishId, date);

  const handleSubmit = () => {
    if (!comment.trim()) return;
    addDishComment(dishId, date, author.trim(), comment.trim());
    setComment('');
  };

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Comments · {formatDisplayDate(date)}</Text>

      <FormField label="Your Name">
        <FormInput value={author} onChangeText={setAuthor} placeholder="Who is commenting?" />
      </FormField>

      <FormField label="Comment">
        <FormInput
          value={comment}
          onChangeText={setComment}
          placeholder="How was this dish today?"
          multiline
        />
      </FormField>

      <GoldButton label="Add Comment" onPress={handleSubmit} />

      <View style={styles.list}>
        {comments.length > 0 ? (
          comments.map((item) => (
            <View key={item.id} style={styles.commentCard}>
              <Text style={styles.commentAuthor}>{item.author}</Text>
              <Text style={styles.commentText}>{item.comment}</Text>
            </View>
          ))
        ) : (
          <Text style={styles.empty}>No comments yet for this day.</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: FamilySpacing.md,
    marginTop: FamilySpacing.lg,
  },
  title: {
    ...FamilyTypography.heading,
    fontSize: 17,
  },
  list: {
    gap: FamilySpacing.sm,
  },
  commentCard: {
    padding: FamilySpacing.md,
    borderRadius: FamilyRadius.md,
    backgroundColor: FamilyPalette.cream,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
  },
  commentAuthor: {
    ...FamilyTypography.label,
    color: FamilyPalette.champagne,
    marginBottom: FamilySpacing.xs,
  },
  commentText: {
    ...FamilyTypography.body,
    fontSize: 15,
  },
  empty: {
    ...FamilyTypography.caption,
    fontStyle: 'italic',
    color: FamilyPalette.charcoalMuted,
  },
});
