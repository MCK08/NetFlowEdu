import { router } from "expo-router";
import { memo } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { Avatar } from "@components/ui/Avatar";
import { colors } from "@theme/colors";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { Classmate, CLASS_ROLE_LABEL } from "../services/classSocial";

const PREVIEW_LIMIT = 8;
const TILE_WIDTH = 76;

interface ClassmatesPreviewProps {
  classId: string;
  classmates: readonly Classmate[];
  /** Other students in the class — the teacher and the student themselves excluded. */
  otherStudents: number;
  error: string | null;
}

// Phase 110 — "Sınıf Arkadaşların", in one glance.
//
// Faces and NAMES, never a number beside anyone. The avatar is never the only
// cue — every tile carries the name under it — and the row is one spoken
// sentence for a screen reader rather than a string of unlabelled pictures.
export const ClassmatesPreview = memo(function ClassmatesPreview({
  classId,
  classmates,
  otherStudents,
  error,
}: ClassmatesPreviewProps) {
  useThemeSubscription();
  const others = classmates.filter((mate) => !mate.isSelf);
  const shown = others.slice(0, PREVIEW_LIMIT);
  const rest = others.length - shown.length;
  const spoken =
    shown.length > 0
      ? `Sınıf arkadaşların: ${shown.map((mate) => mate.name).join(", ")}${rest > 0 ? ` ve ${rest} kişi daha` : ""}.`
      : "";

  return (
    <View style={styles.section}>
      <View style={styles.header}>
        <Text style={styles.title} accessibilityRole="header">
          Sınıf Arkadaşların
        </Text>
        {others.length > 0 ? (
          <Pressable
            onPress={() => router.push(`/(student)/class/${encodeURIComponent(classId)}/classmates` as never)}
            accessibilityRole="button"
            accessibilityLabel="Tüm sınıf arkadaşlarını gör"
            style={styles.seeAll}
          >
            <Text style={styles.seeAllText}>Tümünü Gör</Text>
          </Pressable>
        ) : null}
      </View>

      {error ? (
        <Text style={styles.muted} accessibilityRole="alert">
          {error}
        </Text>
      ) : otherStudents === 0 ? (
        <Text style={styles.muted}>Bu sınıfta henüz başka öğrenci yok.</Text>
      ) : (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.row}
          accessible
          accessibilityLabel={spoken}
        >
          {shown.map((mate) => (
            <View key={mate.uid} style={styles.tile}>
              <Avatar displayName={mate.name} photoURL={mate.photoURL} size="lg" />
              <Text style={styles.name} numberOfLines={2}>
                {mate.name}
              </Text>
              {mate.role === "teacher" ? <Text style={styles.role}>{CLASS_ROLE_LABEL.teacher}</Text> : null}
            </View>
          ))}
        </ScrollView>
      )}
    </View>
  );
});

const styles = themedStyles(() => ({
  section: {
    gap: spacing.xs,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  seeAll: {
    minHeight: minTouchTarget,
    justifyContent: "center",
    paddingHorizontal: spacing.xs,
  },
  seeAllText: {
    ...typography.bodyStrong,
    color: colors.primary,
  },
  row: {
    gap: spacing.sm,
  },
  tile: {
    width: TILE_WIDTH,
    alignItems: "center",
    gap: spacing.xxs,
  },
  name: {
    ...typography.caption,
    color: colors.textPrimary,
    textAlign: "center",
  },
  role: {
    ...typography.label,
    color: colors.textTertiary,
  },
  muted: {
    ...typography.body,
    color: colors.textSecondary,
  },
}));
