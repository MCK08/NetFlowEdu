import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { iconSize } from "@theme/sizes";

interface EmptyStateProps {
  height: number;
}

// This is the Student Home (global feed) empty state — a distinct
// component from the generic `@components/ui/EmptyState` (this one needs
// a `height` prop to size itself to the paged feed's full-screen card).
// Kept as its own file/export rather than merged into the generic one to
// avoid a breaking prop-shape change in FeedScreen.tsx.
export function EmptyState({ height }: EmptyStateProps) {
  return (
    <View style={[styles.container, { height }]}>
      <Ionicons name="camera-outline" size={iconSize.xl} color={colors.textTertiary} />
      <Text style={styles.title}>Henüz soru yüklenmedi</Text>
      <Text style={styles.subtitle}>İlk soruyu sen yükle</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.background,
    gap: spacing.xs,
  },
  title: {
    ...typography.title,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
});
