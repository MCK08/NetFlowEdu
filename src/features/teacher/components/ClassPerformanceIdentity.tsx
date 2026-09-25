import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Text, useWindowDimensions, View } from "react-native";

import { Badge } from "@components/ui/Badge";
import { colors } from "@theme/colors";
import { iconSize, stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import type { ClassRoom } from "@/types/class";

interface ClassPerformanceIdentityProps {
  /** The class document the screen's composer hook already read. Null until
   *  that one read resolves — nothing is drawn until then. */
  classRoom: ClassRoom | null;
}

export const CLASS_ARCHIVED_BADGE = "Arşivlendi";

// Phase 125 — which class these numbers are about.
//
// The screen answered that only in a back button: the title is the screen's
// name ("Sınıf Performansı") and the class itself was never named, so a
// teacher who arrived from a deep link, or who switched classes and came
// back, had to trust the stack. The name and the member count are the class
// document's own, from the read useClassTopicComposer already performs for
// its organizationId — no second fetch for a line of identity.
//
// Deliberately only name, members and status. The class document holds no
// subject, grade, school or level (the mockup's "7 üye" and "Demo Sınıfı"
// are fixture values, not schema), and this screen must not be the place a
// class metadata vocabulary gets invented.
export const ClassPerformanceIdentity = memo(function ClassPerformanceIdentity({
  classRoom,
}: ClassPerformanceIdentityProps) {
  useThemeSubscription();
  const { fontScale } = useWindowDimensions();
  // Past the accessibility sizes the name cannot share a line with the count
  // without breaking inside itself; each takes the width in turn.
  const stacked = fontScale >= stackAtFontScale;

  if (!classRoom) return null;

  const isArchived = classRoom.status !== "active";
  const memberLabel = `${classRoom.memberCount} üye`;

  return (
    <View
      style={[styles.row, stacked ? styles.rowStacked : null]}
      accessible
      accessibilityLabel={`${classRoom.name}. ${memberLabel}.${isArchived ? ` ${CLASS_ARCHIVED_BADGE}.` : ""}`}
    >
      <Text style={styles.name}>{classRoom.name}</Text>
      <View style={styles.meta}>
        {/* Decorative: the node's own label already speaks the count. */}
        <Ionicons name="people-outline" size={iconSize.xs} color={colors.textTertiary} accessibilityElementsHidden />
        <Text style={styles.memberCount}>{memberLabel}</Text>
        {isArchived ? <Badge label={CLASS_ARCHIVED_BADGE} variant="neutral" /> : null}
      </View>
    </View>
  );
});

const styles = themedStyles(() => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  rowStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xxs,
  },
  name: {
    ...typography.screenTitleSm,
    color: colors.textPrimary,
    flexShrink: 1,
    minWidth: 0,
  },
  meta: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    flexShrink: 0,
  },
  memberCount: {
    ...typography.caption,
    color: colors.textTertiary,
  },
}));
