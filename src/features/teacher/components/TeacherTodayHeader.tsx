import { Text, View } from "react-native";

import { NotificationBellButton } from "@features/notifications";
import { ROUTES } from "@constants/routes";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

export const TEACHER_TODAY_TITLE = "Bugün";

interface TeacherTodayHeaderProps {
  /** Absent while auth is still resolving; the bell simply does not appear
   *  rather than subscribing its badge to nothing. */
  notificationUid?: string;
}

// Phase 119 — the day, named once.
//
// What stood here was the teacher's IDENTITY: a greeting, their avatar, their
// name at 24pt, their role badge and "Sınıflarını yönet" — a third of the
// screen spent telling a teacher who they are, above the work they opened the
// app to do. Identity is Profil's subject (Phase 114) and sign-out is one tap
// away in Profil → Ayarlar (Phase 115), so neither is repeated here.
//
// The bell stays: it is the only notification affordance on this tab and its
// badge comes from the existing subscription, not a count invented here.
export function TeacherTodayHeader({ notificationUid }: TeacherTodayHeaderProps) {
  useThemeSubscription();
  return (
    <View style={styles.row}>
      <Text style={styles.title} accessibilityRole="header">
        {TEACHER_TODAY_TITLE}
      </Text>
      {notificationUid ? (
        <NotificationBellButton uid={notificationUid} route={ROUTES.teacherNotifications} />
      ) : null}
    </View>
  );
}

const styles = themedStyles(() => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: spacing.xs,
  },
  title: {
    ...typography.displayLg,
    // Resized, so the line box is resized with it: displayLg's own 34 at 32pt
    // is a 1.06 ratio, which clips a Turkish descender (ğ) against the
    // ascender above it. Same 1.25 the role itself is built on.
    fontSize: 32,
    lineHeight: 40,
    color: colors.textPrimary,
    flexShrink: 1,
  },
}));
