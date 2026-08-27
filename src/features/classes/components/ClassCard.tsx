import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { memo } from "react";
import { Share, Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { Avatar } from "@components/ui/Avatar";
import { Badge } from "@components/ui/Badge";
import { IconButton } from "@components/ui/IconButton";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { shadows } from "@theme/shadows";
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
// memo'd: rendered from TeacherClassesScreen's FlatList — without this,
// any state change in the screen (e.g. join-modal open/close) re-renders
// every mounted card even though each `classRoom` prop reference is
// unchanged.
export const ClassCard = memo(function ClassCard({ classRoom }: ClassCardProps) {
  // Phase 49 — memo() blocks prop-driven re-renders, but NOT context
  // updates; without this subscription this component would keep its
  // previous theme's styles after a live theme switch.
  useThemeSubscription();
  const isArchived = classRoom.status !== "active";

  return (
    <AnimatedPressable
      style={[styles.card, shadows.sm]}
      onPress={() =>
        router.push({ pathname: "/(teacher)/class/[classId]", params: { classId: classRoom.id } })
      }
      accessibilityRole="button"
      accessibilityLabel={`${classRoom.name} sınıfını aç`}
      accessibilityHint="Sınıf detayını açar"
    >
      <View style={styles.topRow}>
        <Avatar displayName={classRoom.name} size="lg" />

        <View style={styles.textColumn}>
          <View style={styles.nameRow}>
            <Text style={styles.name} numberOfLines={1}>
              {classRoom.name}
            </Text>
            {isArchived ? <Badge label="Arşiv" variant="neutral" /> : null}
          </View>
          <View style={styles.memberRow}>
            <Ionicons name="people-outline" size={14} color={colors.textTertiary} />
            <Text style={styles.memberCount}>{classRoom.memberCount} üye</Text>
          </View>
        </View>

        <Ionicons name="chevron-forward" size={18} color={colors.textTertiary} />
      </View>

      {/* The join code is already surfaced this prominently on the
          teacher's own class detail screen ("Sınıf Kodu"), so showing it
          here exposes nothing the teacher cannot already see — and it is
          the one thing they come to this screen to hand out. */}
      <View style={styles.codeRow}>
        <Ionicons name="key-outline" size={14} color={colors.textTertiary} />
        <Text style={styles.codeLabel}>Kod</Text>
        <Text style={styles.code} numberOfLines={1}>
          {classRoom.joinCode}
        </Text>
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
  },
  textColumn: {
    flex: 1,
    gap: 2,
  },
  nameRow: {
    flexDirection: "row",
    alignItems: "center",
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
}));
