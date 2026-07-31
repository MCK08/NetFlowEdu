import { memo } from "react";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

interface FeedCaptionProps {
  description: string | null;
}

// The question's own caption.
//
// This is the single biggest information gap the old feed had: `description`
// has existed on every question document since students were allowed to
// post (Phase 9.1) and the composer collects it, but NEITHER feed card ever
// rendered it — the text the student typed to explain their question was
// written to Firestore and then never shown. This displays existing data,
// it does not derive or fetch anything new.
//
// Capped at three lines: the caption sits over the question image, and an
// unbounded caption on a long description would cover the very thing the
// reader came to look at. The full text remains available on the question
// detail screen, which both cards already navigate to.
export const FeedCaption = memo(function FeedCaption({ description }: FeedCaptionProps) {
  const text = description?.trim();
  if (!text) return null;

  return (
    <View style={styles.container}>
      <Text style={styles.text} numberOfLines={3}>
        {text}
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  container: {
    marginTop: spacing.xs,
  },
  text: {
    ...typography.body,
    color: colors.textInverse,
    opacity: 0.94,
  },
});
