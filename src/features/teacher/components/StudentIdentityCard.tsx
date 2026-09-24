import { memo } from "react";
import { Text, useWindowDimensions, View } from "react-native";

import { Avatar } from "@components/ui/Avatar";
import { Card } from "@components/ui/Card";
import { colors } from "@theme/colors";
import { stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import { resolvePublicIdentity } from "@utils/publicIdentity";

interface StudentIdentityCardProps {
  /** The name the entry point already knew — the roster's or the Action
   *  Center's, never looked up again here. Empty when the caller could not
   *  resolve one (see teacherStudentHref). */
  studentName?: string;
}

// Phase 124 — which student am I looking at.
//
// The screen used to answer that only in its header title, in ONE clipped
// line: a real Turkish name was truncated mid-name, and a caller that could
// not resolve a name at all (teacherStudentHref sends "" for a student who is
// no longer on the roster) left the title blank, because `"" ?? fallback`
// keeps the empty string. resolvePublicIdentity is the app's own answer to
// both — the same resolver every other identity surface uses, with its own
// "Kullanıcı" fallback — and the name wraps here instead of truncating.
//
// Deliberately only the avatar and the name. The teacher-facing student
// document carries no grade, no school and no section, the class name is not
// known at two of the four entry points, and the handle is not on the
// StudentPerformanceCard the Action Center navigates from — so none of them
// is drawn rather than guessed. The photo is not carried either: it would
// have to travel as a route parameter, and a Storage download URL is a
// tokened link that has no business in a navigation param.
export const StudentIdentityCard = memo(function StudentIdentityCard({
  studentName,
}: StudentIdentityCardProps) {
  useThemeSubscription();
  const { fontScale } = useWindowDimensions();
  // Past the accessibility sizes a name cannot share a line with the avatar
  // without breaking inside itself; it takes the full width instead.
  const stacked = fontScale >= stackAtFontScale;
  const identity = resolvePublicIdentity({ displayName: studentName });

  return (
    <Card>
      <View
        style={[styles.row, stacked ? styles.rowStacked : null]}
        accessible
        accessibilityLabel={identity.primaryName}
      >
        <Avatar displayName={identity.primaryName} size="md" />
        <Text style={[styles.name, stacked ? styles.nameStacked : null]}>{identity.primaryName}</Text>
      </View>
    </Card>
  );
});

const styles = themedStyles(() => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  rowStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  name: {
    ...typography.screenTitleSm,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  // Stacked, the name is the row's full-width child rather than the half of
  // a line the avatar left it.
  nameStacked: {
    alignSelf: "stretch",
  },
}));
