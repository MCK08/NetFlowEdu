import { Ionicons } from "@expo/vector-icons";
import { memo } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";

import { Avatar } from "@components/ui/Avatar";
import { Card } from "@components/ui/Card";
import { RoleBadge } from "@components/ui/RoleBadge";
import { UserRole } from "@/types/user";
import { colors } from "@theme/colors";
import { iconSize, minTouchTarget, stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

interface ProfileIdentityCardProps {
  photoURL: string | null;
  primaryName: string;
  usernameHandle: string | null;
  role: UserRole;
  onPress: () => void;
}

// Phase 114 — who you are, in one row.
//
// The own profile used to open with the same centred hero the PUBLIC
// profile uses: a 96pt avatar, the name, the handle and a stat row, costing
// most of the first screen before a single destination appeared. A peer's
// profile is *about* that identity, so the hero earns its space there; your
// own profile is a place you pass through, so here identity is one compact
// row that also happens to be the way into editing it.
//
// ProfileHero is deliberately left exactly as it is, still shared by
// PublicProfileScreen (Phase 112's contract: identity only, no measurement).
export const ProfileIdentityCard = memo(function ProfileIdentityCard({
  photoURL,
  primaryName,
  usernameHandle,
  role,
  onPress,
}: ProfileIdentityCardProps) {
  useThemeSubscription();
  const { fontScale } = useWindowDimensions();
  // Past the accessibility sizes a name that needs two or three lines cannot
  // share a row with an avatar and a chevron: the avatar ends up floating
  // against the middle of the text instead of beside its first line.
  const stacked = fontScale >= stackAtFontScale;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${primaryName}${usernameHandle ? `, ${usernameHandle}` : ""}. Hesap ve profil bilgilerini düzenle`}
      style={styles.pressable}
    >
      {/* Card takes one style object, not a list, so the two layouts are two
          complete styles rather than a base and an override. */}
      <Card style={stacked ? styles.cardStacked : styles.card}>
        <Avatar photoURL={photoURL} displayName={primaryName} size="lg" />

        <View style={styles.identity}>
          {/* A name wraps rather than truncates — it is the one thing on
              this screen the reader most needs in full. */}
          <Text style={styles.name} numberOfLines={2}>
            {primaryName}
          </Text>
          {usernameHandle ? (
            /* Phase 122 — a handle wraps rather than truncating. One line cut
               "@demo_teacher" to "@demo_tea…" at the accessibility sizes, and
               a half-handle identifies no account. */
            <Text style={styles.handle} numberOfLines={2}>
              {usernameHandle}
            </Text>
          ) : null}
          <View style={styles.badgeWrap}>
            <RoleBadge role={role} />
          </View>
        </View>

        {/* Decorative, and dropped once the card stacks: on its own line at
            the foot of a column it points at nothing. The card is still a
            button and still says what it opens. */}
        {stacked ? null : (
          <Ionicons
            name="chevron-forward"
            size={iconSize.sm}
            color={colors.textTertiary}
            accessibilityElementsHidden
          />
        )}
      </Card>
    </Pressable>
  );
});

const styles = themedStyles(() => ({
  pressable: {
    minHeight: minTouchTarget,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
  },
  cardStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
    gap: spacing.sm,
  } as const,
  identity: {
    flex: 1,
    minWidth: 0,
    // Stacked, the column is the card's full-width child.
    alignSelf: "stretch",
    gap: 2,
  },
  name: {
    ...typography.subtitle,
    color: colors.textPrimary,
  },
  handle: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  // Shrink-wraps the badge so it keeps its own width inside a flexed column
  // instead of stretching across it.
  badgeWrap: {
    flexDirection: "row",
    marginTop: spacing.xxs,
  },
}));
