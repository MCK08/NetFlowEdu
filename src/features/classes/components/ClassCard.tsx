import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { memo } from "react";
import { Share, Text, useWindowDimensions, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Avatar } from "@components/ui/Avatar";
import { Badge } from "@components/ui/Badge";
import { IconButton } from "@components/ui/IconButton";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { shadows } from "@theme/shadows";
import { iconSize, minTouchTarget, stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { ClassRoom } from "@/types/class";
import { useThemeSubscription } from "@theme/ThemeProvider";

interface ClassCardProps {
  classRoom: ClassRoom;
}

// expo-clipboard isn't a project dependency — RN's built-in Share sheet
// covers "copy or share the code" in one action (every platform's share
// sheet includes a Copy option) without adding a new package for this MVP.
async function shareCode(name: string, code: string) {
  await Share.share({ message: `${name} sınıfına katılmak için kod: ${code}` });
}

// The teacher's own class row. Teacher-only — the student side has its own
// StudentClassCard, and this component has exactly one call site
// (TeacherClassesScreen), so its layout can carry the teacher-specific
// information (join code, archived status) the student card must never show.
//
// The navigation target, the Share action and the "sınıfını aç" label are
// unchanged from the previous version; only the presentation differs.
// memo'd: rendered from TeacherClassesScreen's list — without this,
// any state change in the screen (e.g. join-modal open/close) re-renders
// every mounted card even though each `classRoom` prop reference is
// unchanged.
export const ClassCard = memo(function ClassCard({ classRoom }: ClassCardProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  const { fontScale } = useWindowDimensions();
  const isArchived = classRoom.status !== "active";
  const memberLabel = `${classRoom.memberCount} üye`;
  // Past the accessibility text sizes a class name cannot share a row with a
  // 48pt avatar and a chevron; the column takes the width instead.
  const stacked = fontScale >= stackAtFontScale;

  return (
    <AnimatedPressable
      style={[styles.card, shadows.sm]}
      onPress={() =>
        router.push({ pathname: "/(teacher)/class/[classId]", params: { classId: classRoom.id } })
      }
      accessibilityRole="button"
      // Phase 120 — the row says what it holds before it says what it does:
      // the member count and the archived state were drawn but never spoken.
      accessibilityLabel={`${classRoom.name} sınıfını aç. ${memberLabel}${isArchived ? ". Arşivlendi" : ""}`}
      accessibilityHint="Sınıf detayını açar"
    >
      <View style={[styles.topRow, stacked ? styles.topRowStacked : null]}>
        <Avatar displayName={classRoom.name} size="lg" />

        <View style={styles.textColumn}>
          <View style={styles.nameRow}>
            {/* Phase 120 — a class name wraps rather than truncating. Capped
                at one line it lost the end of any name a teacher actually
                types on a phone, and most of one at the accessibility
                sizes. The name is the row's whole point. */}
            <Text style={styles.name}>{classRoom.name}</Text>
            {isArchived ? <Badge label="Arşiv" variant="neutral" /> : null}
          </View>
          <View style={styles.memberRow}>
            {/* Decorative: the row's own label already speaks the count. */}
            <Ionicons
              name="people-outline"
              size={iconSize.xs}
              color={colors.textTertiary}
              accessibilityElementsHidden
            />
            <Text style={styles.memberCount}>{memberLabel}</Text>
          </View>
        </View>

        {/* Decorative: the row's own label already ends with what it opens.
            Stacked it would be a chevron alone on a line, pointing at
            nothing, so it goes: the whole card is still the button. */}
        {stacked ? null : (
          <Ionicons
            name="chevron-forward"
            size={iconSize.sm}
            color={colors.textTertiary}
            accessibilityElementsHidden
          />
        )}
      </View>

      {/* The join code is already surfaced this prominently on the
          teacher's own class detail screen ("Sınıf Kodu"), so showing it
          here exposes nothing the teacher cannot already see — and it is
          the one thing they come to this screen to hand out. */}
      {/* Phase 120 — the code wraps out of the row rather than out of the
          card. A join code is the one thing a teacher opens this screen to
          hand out, and at the accessibility sizes it was being cut to
          "DEMO…" — the half that cannot be read aloud to a class. */}
      <View style={[styles.codeRow, stacked ? styles.codeRowStacked : null]}>
        {/* Decorative: "Kod" beside it is the same word in text. */}
        <Ionicons
          name="key-outline"
          size={iconSize.xs}
          color={colors.textTertiary}
          accessibilityElementsHidden
        />
        <Text style={styles.codeLabel}>Kod</Text>
        <Text style={[styles.code, stacked ? styles.codeStacked : null]}>{classRoom.joinCode}</Text>
        <IconButton
          icon="share-outline"
          size="sm"
          color={colors.primary}
          onPress={() => shareCode(classRoom.name, classRoom.joinCode)}
          accessibilityLabel={`${classRoom.name} sınıfının katılım kodunu paylaş`}
        />
      </View>
    </AnimatedPressable>
  );
});

const styles = themedStyles(() => ({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
  },
  topRowStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  textColumn: {
    flex: 1,
    // A wrapped name must shrink inside the column, never push the avatar.
    minWidth: 0,
    // Stacked, the column is the row's only full-width child.
    alignSelf: "stretch",
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  name: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  memberRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  memberCount: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  codeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
    backgroundColor: colors.background,
    borderRadius: radius.md,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xxs,
    paddingVertical: spacing.xxs,
  },
  // A column, not a wrapped row: wrapping put the code beside "Kod" with
  // whatever width was left, which broke the code itself across two lines.
  codeRowStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
    paddingRight: spacing.sm,
    paddingVertical: spacing.xs,
  },
  codeLabel: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  code: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    letterSpacing: 2,
    flex: 1,
  },
  // Stacked, the code owns its line rather than sharing one, so it never
  // has to break in the middle of itself.
  codeStacked: {
    flex: 0,
    alignSelf: "stretch",
  },
}));
