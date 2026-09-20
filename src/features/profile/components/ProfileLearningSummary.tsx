import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { memo, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";

import { Card } from "@components/ui/Card";
import { ANALYTICS_ROUTES } from "@features/studentAnalytics/routes";
import { EMPTY_SUMMARY, StudySummary, subscribeToStudySummary } from "@features/study/services/studyService";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

interface ProfileLearningSummaryProps {
  uid: string | undefined;
}

export const LEARNING_SUMMARY_TITLE = "Öğrenme Özetin";
export const LEARNING_SUMMARY_ACTION = "Tümünü gör";

interface Fact {
  id: string;
  icon: keyof typeof Ionicons.glyphMap;
  value: string;
  label: string;
  detail: string;
}

// Phase 109/114 — the student's own summary on Profil.
//
// Two facts, both off ONE document: the study summary listener the Hub
// already holds (studyService.subscribeToStudySummary). Phase 109 showed a
// third fact derived from the full study-item set, which meant opening
// Profil paid for an analytics-sized read to print one number that Kişisel
// Analiz shows properly anyway. The deep reading now lives behind "Tümünü
// gör", and this card costs a single snapshot.
//
// Every number here is a count of something the student actually did. There
// is no score, no XP, no level and no percentage invented for this card
// (Phase 113 removed the last of those); if a number is not yet meaningful
// it is not shown at all rather than rendered as a confident 0.
/** Past this OS text scale the card stacks instead of sharing rows. Found on
 *  the simulator at the largest accessibility size: "Tümünü gör" grows wide
 *  enough to squeeze the title into one word per line, and two facts side by
 *  side get the same treatment. Flex wrapping alone does not rescue it —
 *  both items still "fit" once they shrink — so the layout changes shape. */
const STACK_ABOVE_FONT_SCALE = 1.3;

function ProfileLearningSummaryComponent({ uid }: ProfileLearningSummaryProps) {
  useThemeSubscription();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale > STACK_ABOVE_FONT_SCALE;
  const [summary, setSummary] = useState<StudySummary>(EMPTY_SUMMARY);

  useEffect(() => {
    if (!uid) {
      setSummary(EMPTY_SUMMARY);
      return;
    }
    return subscribeToStudySummary(uid, setSummary);
  }, [uid]);

  const facts = useMemo<Fact[]>(() => {
    const list: Fact[] = [];
    if (summary.totalUniqueQuestions > 0) {
      list.push({
        id: "studied",
        icon: "book-outline",
        value: String(summary.totalUniqueQuestions),
        label: "Çalışılan soru",
        // Deliberately "toplam", not a 7-day window: totalUniqueQuestions
        // is a lifetime distinct count, and labelling it as a week would
        // be a nicer sentence about a different number.
        detail: "Toplam",
      });
    }
    if (summary.dailyGoal > 0) {
      list.push({
        id: "goal",
        icon: "flag-outline",
        value: `${summary.reviewedToday} / ${summary.dailyGoal}`,
        label: "Günlük hedef",
        detail: "Bugünün ilerlemesi",
      });
    }
    return list;
  }, [summary]);

  if (facts.length === 0) return null;

  return (
    <Card style={styles.card}>
      <View style={[styles.header, stacked ? styles.headerStacked : null]}>
        <Text style={styles.title}>{LEARNING_SUMMARY_TITLE}</Text>
        <Pressable
          onPress={() => router.push(ANALYTICS_ROUTES.overview as never)}
          accessibilityRole="button"
          accessibilityLabel={`${LEARNING_SUMMARY_ACTION}. Kişisel Analiz'i aç`}
          style={styles.action}
        >
          <Text style={styles.actionText}>{LEARNING_SUMMARY_ACTION}</Text>
          <Ionicons
            name="chevron-forward"
            size={iconSize.xs}
            color={colors.primary}
            accessibilityElementsHidden
          />
        </Pressable>
      </View>

      <View style={[styles.facts, stacked ? styles.factsStacked : null]}>
        {facts.map((fact, index) => (
          <View
            key={fact.id}
            style={styles.fact}
            accessible
            accessibilityLabel={`${fact.label}: ${fact.value}. ${fact.detail}`}
          >
            {index > 0 && !stacked ? <View style={styles.factDivider} /> : null}
            <View style={styles.factBody}>
              <View style={styles.factHead}>
                <Ionicons
                  name={fact.icon}
                  size={iconSize.sm}
                  color={colors.primary}
                  accessibilityElementsHidden
                />
                <Text style={styles.factValue}>{fact.value}</Text>
              </View>
              <Text style={styles.factLabel}>{fact.label}</Text>
              <Text style={styles.factDetail}>{fact.detail}</Text>
            </View>
          </View>
        ))}
      </View>
    </Card>
  );
}

export const ProfileLearningSummary = memo(ProfileLearningSummaryComponent);

const styles = themedStyles(() => ({
  card: {
    gap: spacing.sm,
  },
  // Wraps rather than competes: at a large OS text size "Tümünü gör" is
  // wide enough to squeeze the title into a one-word-per-line column, so
  // past a sensible minimum the action drops onto its own line instead
  // (caught on the simulator at the largest accessibility size).
  header: {
    flexDirection: "row",
    alignItems: "center",
    columnGap: spacing.sm,
  },
  headerStacked: {
    flexDirection: "column",
    alignItems: "flex-start",
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
  },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
    // The label is short, so the tap target is widened rather than the text.
    minHeight: minTouchTarget,
    flexShrink: 0,
  },
  actionText: {
    ...typography.caption,
    color: colors.primary,
  },
  facts: {
    flexDirection: "row",
    alignItems: "stretch",
  },
  factsStacked: {
    flexDirection: "column",
    rowGap: spacing.md,
  },
  fact: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
  },
  factDivider: {
    width: StyleSheet.hairlineWidth,
    backgroundColor: colors.divider,
    marginRight: spacing.md,
    borderRadius: radius.sm,
  },
  factBody: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  factHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  factValue: {
    ...typography.title,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  factLabel: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  factDetail: {
    ...typography.caption,
    color: colors.textTertiary,
  },
}));
