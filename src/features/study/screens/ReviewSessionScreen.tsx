import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";
import { router } from "expo-router";
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { FormError } from "@components/ui/FormError";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { ROUTES } from "@constants/routes";
import { useAuth } from "@features/authentication";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { StudyOutcomeControls } from "../components/StudyOutcomeControls";
import { toHydratedStudyItem } from "../services/studyItemParser";
import { useReviewSession } from "../hooks/useReviewSession";

// A focused, one-card-at-a-time review session. Distinct from the dashboard
// (which is a browsable list) — this is the "sit down and work through your
// queue" surface, and it advances automatically after each outcome.
export function ReviewSessionScreen() {
  const { firebaseUser } = useAuth();
  const session = useReviewSession(firebaseUser?.uid);

  // Single, safe way back to the dashboard. `replace` (not push) so the
  // session never stacks up behind itself.
  function backToDashboard() {
    router.replace(ROUTES.studentStudy as never);
  }

  if (session.isLoading) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <View style={styles.content}>
          <LoadingSkeleton height={220} borderRadius={16} />
          <LoadingSkeleton width="60%" height={18} />
          <LoadingSkeleton height={48} borderRadius={12} />
        </View>
      </SafeAreaView>
    );
  }

  if (session.loadError) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <EmptyState icon="cloud-offline-outline" title={session.loadError} />
          <PrimaryButton label="Tekrar Dene" onPress={session.retry} />
          <PrimaryButton label="Çalışma Paneline Dön" onPress={backToDashboard} variant="secondary" />
        </View>
      </SafeAreaView>
    );
  }

  // Session finished (or there was nothing due) — show the summary.
  if (session.isComplete || !session.current) {
    const { totals } = session;
    const nothingDue = totals.reviewed === 0;
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <View style={styles.centered}>
          <Ionicons
            name={nothingDue ? "checkmark-done-outline" : "trophy-outline"}
            size={48}
            color={colors.primary}
          />
          <Text style={styles.summaryTitle}>
            {nothingDue ? "Şu an tekrar bekleyen soru yok" : "Oturum tamamlandı"}
          </Text>

          {!nothingDue ? (
            <View style={styles.summaryCard}>
              <SummaryRow label="Tekrar edilen" value={totals.reviewed} />
              <SummaryRow label="Çözdüm" value={totals.solved} />
              <SummaryRow label="Zorlandım" value={totals.struggled} />
              <SummaryRow label="Tekrar Et" value={totals.again} />
            </View>
          ) : null}

          <PrimaryButton label="Çalışma Paneline Dön" onPress={backToDashboard} />
        </View>
      </SafeAreaView>
    );
  }

  const { item, question } = session.current;
  const position = `${session.index + 1} / ${session.total}${session.hasMore ? "+" : ""}`;

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <Text style={styles.progressText}>{position}</Text>
          {session.isLoadingMore ? <ActivityIndicator size="small" color={colors.primary} /> : null}
        </View>

        {question ? (
          <>
            <Image
              source={{ uri: question.imageUrl }}
              style={styles.image}
              contentFit="contain"
              transition={150}
              accessibilityIgnoresInvertColors
              accessibilityLabel="Soru görseli"
            />
            {question.description ? (
              <Text style={styles.description}>{question.description}</Text>
            ) : null}

            {/* Same control, same wording as the question surfaces. The
                previous answer is NOT pre-selected here (showLastOutcome) —
                the student is judging the question right now, and a
                highlighted button would read as "already answered". The
                status badge above still says where it stands. */}
            <StudyOutcomeControls
              item={toHydratedStudyItem(item)}
              isHydrating={false}
              pendingOutcome={session.pendingOutcome}
              onSelect={(outcome) => session.submitOutcome(item.questionId, outcome)}
              mutationError={session.actionError}
              showLastOutcome={false}
            />
          </>
        ) : (
          // Deleted question, or access revoked (class removal / visibility
          // change). resolveQueueEntries maps both to question === null.
          <View style={styles.unavailable}>
            <Ionicons name="alert-circle-outline" size={32} color={colors.textTertiary} />
            <Text style={styles.unavailableTitle}>Bu soruya artık erişilemiyor.</Text>
            <Text style={styles.unavailableDescription}>
              Soru silinmiş veya erişimin kaldırılmış olabilir.
            </Text>
            <PrimaryButton
              label="Çalışma Planından Kaldır"
              onPress={() => session.removeCurrent(item.questionId)}
              isLoading={session.isSubmitting}
            />
            <PrimaryButton label="Sonraki Soru" onPress={session.skip} variant="secondary" />
            <FormError message={session.actionError} />
          </View>
        )}

        {session.paginationError ? (
          <View style={styles.paginationError}>
            <Text style={styles.paginationErrorText}>{session.paginationError}</Text>
            <PrimaryButton
              label="Sonraki Sayfayı Tekrar Dene"
              onPress={session.retryPagination}
              variant="secondary"
            />
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function SummaryRow({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryRow} accessible accessibilityLabel={`${label}: ${value}`}>
      <Text style={styles.summaryLabel}>{label}</Text>
      <Text style={styles.summaryValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.md,
    padding: spacing.xl,
  },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  progressText: { ...typography.caption, color: colors.textTertiary },
  image: {
    width: "100%",
    height: 320,
    borderRadius: radius.lg,
    backgroundColor: colors.surfaceMuted,
  },
  description: { ...typography.body, color: colors.textSecondary },
  submittingRow: { flexDirection: "row", alignItems: "center", gap: spacing.xs },
  submittingText: { ...typography.caption, color: colors.textTertiary },
  unavailable: {
    alignItems: "center",
    gap: spacing.sm,
    padding: spacing.lg,
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
  },
  unavailableTitle: { ...typography.bodyStrong, color: colors.textSecondary, textAlign: "center" },
  unavailableDescription: {
    ...typography.caption,
    color: colors.textTertiary,
    textAlign: "center",
  },
  summaryTitle: { ...typography.title, color: colors.textPrimary, textAlign: "center" },
  summaryCard: {
    alignSelf: "stretch",
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    padding: spacing.md,
    gap: spacing.xs,
  },
  summaryRow: { flexDirection: "row", justifyContent: "space-between" },
  summaryLabel: { ...typography.body, color: colors.textSecondary },
  summaryValue: { ...typography.bodyStrong, color: colors.textPrimary },
  paginationError: { gap: spacing.xs },
  paginationErrorText: { ...typography.caption, color: colors.danger },
});
