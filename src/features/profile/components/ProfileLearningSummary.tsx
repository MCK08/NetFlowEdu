import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { memo, useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import { SectionHeader } from "@components/ui/SectionHeader";
import { useStudentAnalytics } from "@features/studentAnalytics/hooks/useStudentAnalytics";
import { ANALYTICS_ROUTES } from "@features/studentAnalytics/routes";
import { buildQuestionArchive, summarizeArchive } from "@features/studentAnalytics/services/studentAnalytics";
import { EMPTY_SUMMARY, StudySummary, subscribeToStudySummary } from "@features/study/services/studyService";
import { buildStrongAreas } from "@features/studyPlan/services/learningMaps";
import { PLAN_ROUTES } from "@features/studyPlan/routes";
import { colors } from "@theme/colors";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

interface ProfileLearningSummaryProps {
  uid: string | undefined;
}

export const LEARNING_SUMMARY_TITLE = "Öğrenme Özetin";

interface Fact {
  id: string;
  value: string;
  label: string;
}

// Phase 109 — the student's personal summary on Profil, now that Kişisel
// Analiz is no longer a tab. Three facts and two quiet links: the studied
// question count and today's goal (the summary listener the Hub already
// holds), and one improvement fact from Phase 107's archive (a question the
// student could not solve and later did) or Phase 70's "steady" topics.
// No chart, no score, no state of its own.
function ProfileLearningSummaryComponent({ uid }: ProfileLearningSummaryProps) {
  useThemeSubscription();
  const [summary, setSummary] = useState<StudySummary>(EMPTY_SUMMARY);
  const analytics = useStudentAnalytics(uid);

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
      list.push({ id: "studied", value: String(summary.totalUniqueQuestions), label: "çalışılan soru" });
    }
    if (summary.dailyGoal > 0) {
      list.push({ id: "goal", value: `${summary.reviewedToday} / ${summary.dailyGoal}`, label: "bugünkü hedef" });
    }
    const archive = summarizeArchive(buildQuestionArchive(analytics.items));
    if (archive.solvedLater > 0) {
      list.push({ id: "solved_later", value: String(archive.solvedLater), label: "çözemediğin soruyu sonradan çözdün" });
    } else {
      const steady = buildStrongAreas(analytics.items, analytics.loadedAt).length;
      if (steady > 0) list.push({ id: "steady", value: String(steady), label: "konuda istikrarlı başarı" });
    }
    return list;
  }, [summary, analytics.items, analytics.loadedAt]);

  if (facts.length === 0) return null;

  return (
    <View style={styles.wrapper}>
      <SectionHeader title={LEARNING_SUMMARY_TITLE} />
      <View style={styles.facts}>
        {facts.map((fact) => (
          <View key={fact.id} style={styles.fact} accessible accessibilityLabel={`${fact.value} ${fact.label}`}>
            <Text style={styles.factValue}>{fact.value}</Text>
            <Text style={styles.factLabel}>{fact.label}</Text>
          </View>
        ))}
      </View>
      <View style={styles.links}>
        <Link label="Kişisel Analiz" icon="analytics-outline" onPress={() => router.push(ANALYTICS_ROUTES.overview as never)} />
        <Link
          label="İlerleme Haritam"
          icon="trending-up-outline"
          onPress={() => router.push(PLAN_ROUTES.progress as never)}
          divided
        />
      </View>
    </View>
  );
}

function Link({ label, icon, onPress, divided }: { label: string; icon: keyof typeof Ionicons.glyphMap; onPress: () => void; divided?: boolean }) {
  return (
    <Pressable
      onPress={onPress}
      style={[styles.link, divided ? styles.divided : null]}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={iconSize.sm} color={colors.primary} accessibilityElementsHidden />
      <Text style={styles.linkText}>{label}</Text>
      <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} accessibilityElementsHidden />
    </Pressable>
  );
}

export const ProfileLearningSummary = memo(ProfileLearningSummaryComponent);

const styles = themedStyles(() => ({
  wrapper: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.xl,
    gap: spacing.sm,
  },
  facts: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
  },
  fact: {
    flexGrow: 1,
    flexBasis: 100,
    minWidth: 0,
    gap: 2,
  },
  factValue: {
    ...typography.title,
    color: colors.textPrimary,
  },
  factLabel: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  links: {
    marginTop: spacing.xs,
  },
  link: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
    paddingVertical: spacing.xs,
  },
  divided: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.divider,
  },
  linkText: {
    ...typography.body,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
}));
