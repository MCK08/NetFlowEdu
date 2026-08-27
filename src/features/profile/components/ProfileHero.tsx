import { memo, ReactNode } from "react";
import { Text, View } from "react-native";

import { Avatar } from "@components/ui/Avatar";
import { RoleBadge } from "@components/ui/RoleBadge";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { UserRole } from "@/types/user";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface ProfileHeroProps {
  photoURL: string | null;
  primaryName: string;
  usernameHandle: string | null;
  role: UserRole | string;
  // Whatever belongs under the identity for THIS surface — stats on both,
  // plus the friendship action area on a public profile. The hero itself
  // stays free of any own-vs-public branching.
  children?: ReactNode;
}

// The identity block shared by the own profile and the public profile.
//
// Both screens previously hand-assembled the same avatar → name → handle →
// role stack with their own copies of the styles, and drifted: the own
// profile put its stats several cards further down the page, while the
// public profile put a mixed points/questions row directly underneath.
// Sharing the hero is what makes "my profile" and "someone else's profile"
// finally read as the same product.
export const ProfileHero = memo(function ProfileHero({
  photoURL,
  primaryName,
  usernameHandle,
  role,
  children,
}: ProfileHeroProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  return (
    <View style={styles.container}>
      <Avatar photoURL={photoURL} displayName={primaryName} size="xl" />

      <View style={styles.identity}>
        {/* A long display name wraps onto a second line rather than being
            truncated — a name is the one thing on this screen the reader
            most needs in full. */}
        <Text style={styles.name} numberOfLines={2}>
          {primaryName}
        </Text>
        {usernameHandle ? (
          <Text style={styles.handle} numberOfLines={1}>
            {usernameHandle}
          </Text>
        ) : null}
      </View>

      <RoleBadge role={role} />

      {children}
    </View>
  );
});

const styles = themedStyles(() => ({
  container: {
    alignItems: "center",
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  identity: {
    alignItems: "center",
    gap: 2,
  },
  name: {
    ...typography.displayLg,
    fontSize: 22,
    lineHeight: 28,
    color: colors.textPrimary,
    textAlign: "center",
  },
  handle: {
    ...typography.body,
    color: colors.textTertiary,
  },
}));
