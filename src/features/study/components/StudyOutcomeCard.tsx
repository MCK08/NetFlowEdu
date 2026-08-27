import { ReactNode } from "react";
import { StyleProp, StyleSheet, View, ViewStyle } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";

interface StudyOutcomeCardProps {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}

// Phase 36 — the ONE card box the self-assessment section ("Bu soruyu nasıl
// çözdün?" + StudyOutcomeControls) renders inside, everywhere it appears.
//
// This is StudyQueueCard's own `.card` style (the Öğrenme Merkezi/Study
// Hub's main scroll page — the reference/"master" design per the design
// audit) extracted so it has exactly one definition instead of three
// independently-typed copies that could silently drift apart. StudyQueueCard
// itself now renders through this too, unchanged in every visible pixel —
// the reference design was never edited, only named and shared.
export function StudyOutcomeCard({ children, style }: StudyOutcomeCardProps) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = themedStyles(() => ({
  card: {
    backgroundColor: colors.background,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.border,
    padding: spacing.sm,
    gap: spacing.sm,
  },
}));
