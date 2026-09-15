import { Href } from "expo-router";
import { Text, View } from "react-native";

import { AppBackButton } from "@components/ui/AppBackButton";
import { ROUTES } from "@constants/routes";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

// Phase 102 — a deep-linked question (notification tap, shared link) has no
// history; the feed tab is its canonical parent.
export function QuestionHeader({
  title = "Soru",
  fallbackHref = ROUTES.student,
}: {
  title?: string;
  fallbackHref?: Href;
}) {
  return (
    <View style={styles.header}>
      <AppBackButton fallbackHref={fallbackHref} size="lg" style={styles.backButton} />
      <Text style={styles.title}>{title}</Text>
    </View>
  );
}

const styles = themedStyles(() => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xs,
  },
  backButton: {
    marginLeft: -spacing.xs,
  },
  title: {
    ...typography.title,
    fontSize: 20,
    color: colors.textPrimary,
  },
}));
