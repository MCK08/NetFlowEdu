import { Text, useWindowDimensions, View } from "react-native";

import { Avatar } from "@components/ui/Avatar";
import { IconButton } from "@components/ui/IconButton";
import { RoleBadge } from "@components/ui/RoleBadge";
import { NotificationBellButton } from "@features/notifications";
import { ROUTES } from "@constants/routes";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

/** iOS "Accessibility Medium" and above — the first category where a
 *  single long word stops fitting beside a 48pt avatar on a 375pt phone. */
const STACK_AT_FONT_SCALE = 1.6;

interface TeacherDashboardHeaderProps {
  greeting: string;
  displayName: string;
  photoURL: string | null;
  onSignOut: () => void;
  // Optional so any existing/future caller that omits it renders exactly
  // as before — the icon simply stays enabled with no busy state.
  isSigningOut?: boolean;
  // Optional so any existing/future caller that omits it renders exactly
  // as before — the bell simply doesn't appear without a uid to subscribe
  // its badge to.
  notificationUid?: string;
}

// The teacher home's identity block.
//
// Replaces a bare "Sınıflarım" title that sat next to a full-width "Çıkış
// Yap" button — a layout that gave the most destructive action on the
// screen the same visual weight as the page title. Here the greeting and
// the teacher's own name carry the hierarchy, the role is stated
// explicitly, and sign-out becomes a quiet icon action (still one tap,
// exactly as before, and still additionally available on the Profil tab).
//
// Reads only what AuthProvider already holds; it opens no profile
// subscription of its own.
export function TeacherDashboardHeader({
  greeting,
  displayName,
  photoURL,
  onSignOut,
  isSigningOut = false,
  notificationUid,
}: TeacherDashboardHeaderProps) {
  // Phase 104 (B3) — at the accessibility text sizes (≥ AccessibilityM,
  // fontScale ≈ 1.6) a 24pt name is drawn at ~40pt+ and a single Turkish
  // surname no longer fits beside the avatar even with the full row: it
  // either truncated ("Öğretm…") or broke mid-word. The identity row stacks
  // there — avatar above, name across the whole width — which is what a
  // row that no longer fits its content should do. Below that scale the
  // layout is exactly the side-by-side one.
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= STACK_AT_FONT_SCALE;
  return (
    <View style={styles.container}>
      {/* Phase 104 (B3) — the greeting and the two quiet actions share the
          top line; the name gets the whole width beside the avatar.

          Before, the bell and sign-out sat IN the name's row: on a 375pt
          phone the name column was ~185pt and "Demo Öğretmen" already
          ellipsized at 24pt, so a real 25–30 character Turkish name lost
          most of itself to chrome. Moving the actions up to the greeting
          line (where a header's utilities conventionally live) frees ~95pt
          for the name, which may also wrap — up to three lines, one more
          than ProfileHero allows, because this column sits beside an avatar
          where the hero's is centred at full width: at the ~200%
          accessibility size "Demo Öğretmen" needs the third line at 393pt.
          No size reduction, no tighter truncation, the bell and sign-out
          unchanged. */}
      <View style={styles.topRow}>
        <Text style={styles.greeting} numberOfLines={1}>
          {greeting}
        </Text>

        {notificationUid ? (
          <NotificationBellButton uid={notificationUid} route={ROUTES.teacherNotifications} />
        ) : null}

        <IconButton
          icon="log-out-outline"
          onPress={onSignOut}
          disabled={isSigningOut}
          accessibilityLabel="Çıkış yap"
        />
      </View>

      <View style={stacked ? styles.identityStacked : styles.identityRow}>
        <Avatar photoURL={photoURL} displayName={displayName} size="lg" />

        <View style={styles.textColumn}>
          <Text style={styles.name} numberOfLines={3}>
            {displayName}
          </Text>
          <View style={styles.badgeRow}>
            <RoleBadge role="teacher" />
            <Text style={styles.context} numberOfLines={1}>
              Sınıflarını yönet
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
}

const styles = themedStyles(() => ({
  container: {
    paddingTop: spacing.xs,
    paddingBottom: spacing.lg,
    gap: spacing.xxs,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  identityStacked: {
    alignItems: "flex-start",
    gap: spacing.xs,
  },
  textColumn: {
    flex: 1,
    // A wrapped name must shrink inside the column, never push the avatar.
    minWidth: 0,
    // Stacked, the column is the row's only child and must span it.
    alignSelf: "stretch",
    gap: 2,
  },
  greeting: {
    ...typography.caption,
    color: colors.textTertiary,
    flex: 1,
  },
  name: {
    ...typography.displayLg,
    fontSize: 24,
    lineHeight: 30,
    color: colors.textPrimary,
  },
  badgeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    marginTop: 2,
    flexWrap: "wrap",
  },
  context: {
    ...typography.caption,
    color: colors.textTertiary,
    flexShrink: 1,
  },
}));
