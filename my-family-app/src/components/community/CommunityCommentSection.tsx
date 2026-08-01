import { useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  FamilyPalette,
  FamilyRadius,
  FamilySpacing,
  FamilyTypography,
} from '@/constants/familyTheme';
import type { RecipeComment } from '@/types';

function formatCommentTimestamp(iso: string): string {
  const date = new Date(iso);
  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface CommunityCommentListProps {
  comments: RecipeComment[];
}

export function CommunityCommentList({ comments }: CommunityCommentListProps) {
  return (
    <View style={styles.list}>
      <Text style={styles.sectionTitle}>Comments</Text>
      <Text style={styles.sectionHint}>
        {comments.length === 0
          ? 'Be the first to share your thoughts.'
          : `${comments.length} note${comments.length === 1 ? '' : 's'} from the community`}
      </Text>

      {comments.length > 0 ? (
        comments.map((item) => (
          <View key={item.id} style={styles.commentRow}>
            <Image source={{ uri: item.userAvatar }} style={styles.avatar} />
            <View style={styles.commentBody}>
              <View style={styles.commentHeader}>
                <Text style={styles.userName}>{item.userName}</Text>
                <Text style={styles.timestamp}>{formatCommentTimestamp(item.timestamp)}</Text>
              </View>
              <Text style={styles.commentText}>{item.text}</Text>
            </View>
          </View>
        ))
      ) : (
        <Text style={styles.empty}>No comments yet.</Text>
      )}
    </View>
  );
}

interface CommunityCommentBarProps {
  onPost: (text: string) => void;
}

export function CommunityCommentBar({ onPost }: CommunityCommentBarProps) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState('');

  const handlePost = () => {
    if (!text.trim()) return;
    onPost(text);
    setText('');
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={insets.bottom}>
      <View style={[styles.inputBar, { paddingBottom: Math.max(insets.bottom, FamilySpacing.md) }]}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder="Share your thoughts…"
          placeholderTextColor={FamilyPalette.charcoalMuted}
          style={styles.input}
          multiline
          maxLength={500}
        />
        <Pressable
          onPress={handlePost}
          disabled={!text.trim()}
          style={({ pressed }) => [
            styles.postButton,
            !text.trim() && styles.postButtonDisabled,
            pressed && text.trim() ? styles.postButtonPressed : null,
          ]}>
          <Text style={[styles.postLabel, !text.trim() && styles.postLabelDisabled]}>Post</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: FamilySpacing.lg,
    marginTop: FamilySpacing.xl,
    paddingBottom: FamilySpacing.xl,
  },
  sectionTitle: {
    ...FamilyTypography.heading,
    fontSize: 20,
  },
  sectionHint: {
    ...FamilyTypography.caption,
    marginBottom: FamilySpacing.sm,
  },
  commentRow: {
    flexDirection: 'row',
    gap: FamilySpacing.md,
    paddingBottom: FamilySpacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: FamilyPalette.border,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: FamilyRadius.pill,
    backgroundColor: FamilyPalette.champagneLight,
  },
  commentBody: {
    flex: 1,
    gap: FamilySpacing.xs,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: FamilySpacing.sm,
  },
  userName: {
    ...FamilyTypography.label,
    color: FamilyPalette.charcoal,
    textTransform: 'none',
    letterSpacing: 0.3,
    fontSize: 13,
  },
  timestamp: {
    ...FamilyTypography.caption,
    fontSize: 11,
  },
  commentText: {
    ...FamilyTypography.body,
    color: FamilyPalette.charcoal,
    lineHeight: 22,
  },
  empty: {
    ...FamilyTypography.caption,
    fontStyle: 'italic',
    color: FamilyPalette.charcoalMuted,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: FamilySpacing.md,
    paddingTop: FamilySpacing.md,
    paddingHorizontal: FamilySpacing.lg,
    borderTopWidth: 1,
    borderTopColor: FamilyPalette.border,
    backgroundColor: FamilyPalette.cream,
  },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 100,
    paddingVertical: FamilySpacing.sm,
    paddingHorizontal: FamilySpacing.md,
    borderWidth: 1,
    borderColor: FamilyPalette.border,
    borderRadius: FamilyRadius.md,
    backgroundColor: FamilyPalette.softWhite,
    ...FamilyTypography.body,
    fontSize: 15,
    color: FamilyPalette.charcoal,
  },
  postButton: {
    paddingVertical: FamilySpacing.sm,
    paddingHorizontal: FamilySpacing.md,
    borderWidth: 1,
    borderColor: FamilyPalette.champagne,
    borderRadius: FamilyRadius.sm,
    backgroundColor: 'transparent',
  },
  postButtonPressed: {
    backgroundColor: FamilyPalette.champagneLight,
  },
  postButtonDisabled: {
    borderColor: FamilyPalette.border,
  },
  postLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: FamilyPalette.champagne,
    letterSpacing: 0.5,
  },
  postLabelDisabled: {
    color: FamilyPalette.charcoalMuted,
  },
});
