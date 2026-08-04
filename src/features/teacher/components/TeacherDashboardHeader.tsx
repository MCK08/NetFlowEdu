import { StyleSheet, Text, View } from "react-native";

import { Avatar } from "@components/ui/Avatar";
import { IconButton } from "@components/ui/IconButton";
import { RoleBadge } from "@components/ui/RoleBadge";
import { NotificationBellButton } from "@features/notifications";
import { ROUTES } from "@constants/routes";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

interface TeacherDashboardHeaderProps {
  greeting: string;
  displayName: string;
  photoURL: string | null;
  onSignOut: () => void;
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
  notificationUid,
}: TeacherDashboardHeaderProps) {
  return (
    <View style={styles.container}>
      <Avatar photoURL={photoURL} displayName={displayName} size="lg" />

      <View style={styles.textColumn}>
        <Text style={styles.greeting} numberOfLines={1}>
          {greeting}
        </Text>
        <Text style={styles.name} numberOfLines={1}>
          {displayName}
        </Text>
        <View style={styles.badgeRow}>
          <RoleBadge role="teacher" />
          <Text style={styles.context} numberOfLines={1}>
            Sınıflarını yönet
          </Text>
        </View>
      </View>

      {notificationUid ? (
        <NotificationBellButton uid={notificationUid} route={ROUTES.teacherNotifications} />
      ) : null}

      <IconButton
        icon="log-out-outline"
        onPress={onSignOut}
        accessibilityLabel="Çıkış yap"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  greeting: {
    ...typography.caption,
    color: colors.textTertiary,
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
});
