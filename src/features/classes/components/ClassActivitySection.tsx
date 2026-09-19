import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { memo } from "react";
import { Pressable, Text, useWindowDimensions, View } from "react-native";

import { Card } from "@components/ui/Card";
import { formatRelativeDayLabel } from "@features/learningStory/services/teacherLearningTimeline";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget, stackAtFontScale } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { ClassActivityEvent, ClassActivityKind, classActivitySentence } from "../services/classSocial";
import { KudosButton } from "./KudosButton";

const ICON: Readonly<Record<ClassActivityKind, keyof typeof Ionicons.glyphMap>> = {
  question_shared: "help-circle-outline",
  assignment_posted: "clipboard-outline",
  member_joined: "person-add-outline",
};

function destination(event: ClassActivityEvent): string | null {
  if (event.questionId) return `/(student)/question/${encodeURIComponent(event.questionId)}`;
  if (event.assignmentId) return `/(student)/assignment/${encodeURIComponent(event.assignmentId)}`;
  return null;
}

interface ClassActivitySectionProps {
  events: readonly ClassActivityEvent[];
  now: number;
  congratulated: ReadonlySet<string>;
  pendingQuestionId: string | null;
  kudosError: string | null;
  onCongratulate: (questionId: string) => void;
}

const ActivityRow = memo(function ActivityRow({
  event,
  now,
  isSent,
  isPending,
  onCongratulate,
}: {
  event: ClassActivityEvent;
  now: number;
  isSent: boolean;
  isPending: boolean;
  onCongratulate: (questionId: string) => void;
}) {
  useThemeSubscription();
  const { fontScale } = useWindowDimensions();
  const stacked = fontScale >= stackAtFontScale;
  const sentence = classActivitySentence(event);
  const when = formatRelativeDayLabel(event.occurredAt, now);
  const href = destination(event);

  const body = (
    <>
      <View style={styles.iconWrap}>
        <Ionicons name={ICON[event.kind]} size={iconSize.sm} color={colors.primary} accessibilityElementsHidden />
      </View>
      <View style={styles.text}>
        <Text style={styles.sentence}>{sentence}</Text>
        <Text style={styles.when}>{when}</Text>
      </View>
    </>
  );

  return (
    <View style={stacked ? styles.rowStacked : styles.row}>
      {href ? (
        <Pressable
          onPress={() => router.push(href as never)}
          accessibilityRole="button"
          accessibilityLabel={`${sentence} ${when}.`}
          accessibilityHint={event.questionId ? "Soruyu açar" : "Çalışmayı açar"}
          style={styles.content}
        >
          {body}
        </Pressable>
      ) : (
        <View style={styles.content} accessible accessibilityLabel={`${sentence} ${when}.`}>
          {body}
        </View>
      )}
      {event.canCongratulate && event.questionId ? (
        <KudosButton
          recipientName={event.actorName ?? "Sınıf arkadaşın"}
          isSent={isSent}
          isPending={isPending}
          onPress={() => onCongratulate(event.questionId as string)}
        />
      ) : null}
    </View>
  );
});

// Phase 110 — "Sınıf Etkinliği". A short, calm list of what really happened in
// the class — not a second feed. Ordered by time only, capped, and every line
// is backed by a record (see classSocial.ts). The one interaction is "Tebrik
// Et" on a classmate's shared question.
export const ClassActivitySection = memo(function ClassActivitySection({
  events,
  now,
  congratulated,
  pendingQuestionId,
  kudosError,
  onCongratulate,
}: ClassActivitySectionProps) {
  useThemeSubscription();
  return (
    <View style={styles.section}>
      <Text style={styles.title} accessibilityRole="header">
        Sınıf Etkinliği
      </Text>
      {events.length === 0 ? (
        <Text style={styles.empty}>Sınıf etkinliği başladığında burada göreceksin.</Text>
      ) : (
        <Card variant="outlined" style={styles.card}>
          {events.map((event, index) => (
            <View key={event.id} style={index > 0 ? styles.divided : null}>
              <ActivityRow
                event={event}
                now={now}
                isSent={event.questionId ? congratulated.has(event.questionId) : false}
                isPending={event.questionId !== null && pendingQuestionId === event.questionId}
                onCongratulate={onCongratulate}
              />
            </View>
          ))}
        </Card>
      )}
      {kudosError ? (
        <Text style={styles.error} accessibilityRole="alert">
          {kudosError}
        </Text>
      ) : null}
    </View>
  );
});

const styles = themedStyles(() => ({
  section: {
    gap: spacing.xs,
  },
  title: {
    ...typography.subtitle,
    color: colors.textPrimary,
    marginTop: spacing.xs,
  },
  empty: {
    ...typography.body,
    color: colors.textSecondary,
  },
  card: {
    paddingVertical: spacing.xxs,
  },
  divided: {
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  rowStacked: {
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  content: {
    flex: 1,
    minWidth: 0,
    minHeight: minTouchTarget,
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
  },
  iconWrap: {
    width: 32,
    height: 32,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primaryMuted,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  sentence: {
    ...typography.body,
    color: colors.textPrimary,
  },
  when: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  error: {
    ...typography.caption,
    color: colors.danger,
  },
}));
