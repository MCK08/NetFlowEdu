import { Ionicons } from "@expo/vector-icons";
import { Image } from "expo-image";

import { memo } from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { AppBackButton } from "@components/ui/AppBackButton";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import { formatRelativeTime } from "@utils/feedFormat";
import { joinSpokenLabel } from "@utils/spokenLabel";

import { useAnswerReviewQueue } from "../hooks/useAnswerReviewQueue";
import {
  REVIEW_ACTION,
  REVIEW_QUEUE_EMPTY,
  REVIEW_QUEUE_TITLE,
  REVIEW_QUEUE_TRUST_NOTE,
  reviewMethodCopy,
  reviewReasonCopy,
} from "../services/answerReviewCopy";
import { AnswerReviewDetail, AnswerReviewQueueItem } from "../services/answerReviewService";

// Phase 97 — "Yanıt İncelemeleri".
//
// A calm list of the student answers automated review could not settle for
// this class, oldest first. Opening one shows why it is here, the question it
// answers, the submitted image, and two actions: publish, or do not publish.
// Nothing is editable — the teacher rules on publication, not on content, and
// not on the student.
//
// One column at reading width on every size. A review queue is short-lived
// pending work, not a dashboard; a list/detail split would add chrome without
// adding a decision.

interface AnswerReviewScreenProps {
  classId: string;
}

const QueueRow = memo(function QueueRow({
  item,
  isSelected,
  onSelect,
}: {
  item: AnswerReviewQueueItem;
  isSelected: boolean;
  onSelect: (submissionId: string) => void;
}) {
  useThemeSubscription();
  const prompt = item.question.description?.trim() || "Görsel soru";
  const reason = reviewReasonCopy(item.reviewReason);
  const when = formatRelativeTime(item.submittedAt);
  return (
    <Pressable
      onPress={() => onSelect(item.submissionId)}
      style={[styles.row, isSelected ? styles.rowSelected : null]}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      aria-selected={isSelected}
      accessibilityLabel={joinSpokenLabel([
        `${item.author.displayName}, ${reviewMethodCopy(item.method)}`,
        prompt,
        reason,
        when,
        isSelected ? "Açık" : "İncelemek için seçin",
      ])}
    >
      <View style={styles.rowBody}>
        <Text style={styles.rowAuthor}>{`${item.author.displayName} · ${reviewMethodCopy(item.method)}`}</Text>
        <Text style={styles.rowPrompt} numberOfLines={2}>
          {prompt}
        </Text>
        <Text style={styles.rowReason} numberOfLines={2}>
          {reason}
        </Text>
        <Text style={styles.rowWhen}>{when}</Text>
      </View>
      <Ionicons
        name={isSelected ? "chevron-up" : "chevron-forward"}
        size={iconSize.sm}
        color={colors.textTertiary}
      />
    </Pressable>
  );
});

function DetailPanel({
  detail,
  isLoading,
  error,
  pendingDecision,
  decisionError,
  onApprove,
  onReject,
}: {
  detail: AnswerReviewDetail | null;
  isLoading: boolean;
  error: string | null;
  pendingDecision: "approve" | "reject" | null;
  decisionError: string | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  if (isLoading) {
    return (
      <View style={styles.detail} accessibilityLiveRegion="polite" aria-live="polite" accessibilityLabel="Yanıt yükleniyor">
        <LoadingSkeleton height={18} borderRadius={6} />
        <LoadingSkeleton height={220} borderRadius={12} />
        <LoadingSkeleton height={44} borderRadius={12} />
      </View>
    );
  }
  if (error) {
    return (
      <View style={styles.detail}>
        <Text style={styles.error} accessibilityLiveRegion="polite" aria-live="polite">
          {error}
        </Text>
      </View>
    );
  }
  if (!detail) return null;

  const prompt = detail.question.description?.trim() || "Görsel soru";
  const scope = [detail.question.subject, detail.question.topic].filter(Boolean).join(" · ");
  const isBusy = pendingDecision !== null;

  return (
    <View style={styles.detail}>
      <View style={styles.reasonBlock} accessible accessibilityLabel={`Neden incelemede: ${reviewReasonCopy(detail.reviewReason)}`}>
        <Ionicons name="information-circle-outline" size={iconSize.sm} color={colors.primary} />
        <Text style={styles.reasonText}>{reviewReasonCopy(detail.reviewReason)}</Text>
      </View>

      <Text style={styles.sectionLabel}>Soru</Text>
      {scope ? <Text style={styles.scope}>{scope}</Text> : null}
      <Text style={styles.prompt}>{prompt}</Text>

      <Text style={styles.sectionLabel}>Gönderilen yanıt</Text>
      {detail.imageUrl ? (
        <View style={styles.imageWrap}>
          <Image
            source={{ uri: detail.imageUrl }}
            style={styles.image}
            contentFit="contain"
            accessibilityLabel={`${detail.author.displayName} tarafından gönderilen ${reviewMethodCopy(detail.method).toLowerCase()}`}
          />
        </View>
      ) : (
        <Text style={styles.muted}>Görsel şu anda görüntülenemiyor.</Text>
      )}
      <Text style={styles.meta}>
        {`${detail.author.displayName} · ${reviewMethodCopy(detail.method)} · ${formatRelativeTime(detail.submittedAt)}`}
      </Text>

      {decisionError ? (
        <Text style={styles.error} accessibilityLiveRegion="polite" aria-live="polite">
          {decisionError}
        </Text>
      ) : null}

      <View style={styles.actions}>
        <PrimaryButton
          label={REVIEW_ACTION.approve}
          onPress={onApprove}
          isLoading={pendingDecision === "approve"}
          disabled={isBusy}
          accessibilityHint="Yanıtı sınıfta yayınlar"
        />
        <PrimaryButton
          label={REVIEW_ACTION.reject}
          variant="secondary"
          onPress={onReject}
          isLoading={pendingDecision === "reject"}
          disabled={isBusy}
          accessibilityHint="Yanıtı yayınlamaz; öğrenci yeni bir yanıt gönderebilir"
        />
      </View>
    </View>
  );
}

export function AnswerReviewScreen({ classId }: AnswerReviewScreenProps) {
  useThemeSubscription();
  const queue = useAnswerReviewQueue(classId);

  const header = (
    <View style={styles.header}>
      <AppBackButton fallbackHref={{ pathname: "/(teacher)/class/[classId]", params: { classId } }} style={styles.backButton} />
      <View style={styles.headerText}>
        <Text style={styles.title} accessibilityRole="header">
          {REVIEW_QUEUE_TITLE}
        </Text>
        <Text style={styles.subtitle}>{REVIEW_QUEUE_TRUST_NOTE}</Text>
      </View>
    </View>
  );

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      {header}
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {queue.decisionNotice ? (
          <View style={styles.notice} accessibilityLiveRegion="polite" aria-live="polite" accessible accessibilityLabel={queue.decisionNotice}>
            <Ionicons name="checkmark-circle-outline" size={iconSize.sm} color={colors.success} />
            <Text style={styles.noticeText}>{queue.decisionNotice}</Text>
          </View>
        ) : null}

        {queue.status === "loading" ? (
          <View style={styles.skeletons} accessibilityLabel="İncelemeler yükleniyor" accessibilityLiveRegion="polite" aria-live="polite">
            <LoadingSkeleton height={88} borderRadius={12} />
            <LoadingSkeleton height={88} borderRadius={12} />
          </View>
        ) : queue.status === "error" ? (
          <View style={styles.centered}>
            <EmptyState icon="cloud-offline-outline" title={queue.error ?? "Yüklenemedi"} />
            <PrimaryButton label="Tekrar Dene" onPress={queue.refresh} />
          </View>
        ) : queue.items.length === 0 ? (
          <EmptyState
            icon="checkmark-done-outline"
            title={REVIEW_QUEUE_EMPTY.title}
            description={REVIEW_QUEUE_EMPTY.description}
          />
        ) : (
          <>
            {queue.items.map((item) => (
              <View key={item.submissionId} style={styles.card}>
                <QueueRow
                  item={item}
                  isSelected={queue.selectedId === item.submissionId}
                  onSelect={(id) => queue.select(queue.selectedId === id ? null : id)}
                />
                {queue.selectedId === item.submissionId ? (
                  <DetailPanel
                    detail={queue.detail}
                    isLoading={queue.isDetailLoading}
                    error={queue.detailError}
                    pendingDecision={queue.pendingDecision}
                    decisionError={queue.decisionError}
                    onApprove={() => {
                      void queue.decide("approve");
                    }}
                    onReject={() => {
                      void queue.decide("reject");
                    }}
                  />
                ) : null}
              </View>
            ))}
            {queue.hasMore ? (
              <Pressable
                onPress={queue.loadMore}
                disabled={queue.isLoadingMore}
                style={styles.loadMore}
                accessibilityRole="button"
                accessibilityLabel="Daha fazla yanıt yükle"
              >
                {queue.isLoadingMore ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.loadMoreLabel}>Daha fazla göster</Text>
                )}
              </Pressable>
            ) : null}
            {queue.error ? (
              <Text style={styles.error} accessibilityLiveRegion="polite" aria-live="polite">
                {queue.error}
              </Text>
            ) : null}
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: { flex: 1, backgroundColor: colors.background },
  centered: {
    alignItems: "center" as const,
    justifyContent: "center" as const,
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  header: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: spacing.xs,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    width: "100%" as const,
    maxWidth: contentWidth.readable,
    alignSelf: "center" as const,
  },
  backButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center" as const,
    justifyContent: "center" as const,
    marginLeft: -spacing.xs,
  },
  headerText: { flex: 1, gap: 2 },
  title: { ...typography.screenTitle, color: colors.textPrimary },
  subtitle: { ...typography.caption, color: colors.textSecondary },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    gap: spacing.sm,
    width: "100%" as const,
    maxWidth: contentWidth.readable,
    alignSelf: "center" as const,
  },
  skeletons: { gap: spacing.sm },
  notice: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: spacing.xs,
    backgroundColor: colors.successMuted,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  noticeText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
  card: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden" as const,
  },
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xs,
    padding: spacing.sm,
    minHeight: minTouchTarget,
  },
  rowSelected: { backgroundColor: colors.primaryMuted },
  rowBody: { flex: 1, gap: 2 },
  rowAuthor: { ...typography.label, color: colors.textTertiary },
  rowPrompt: { ...typography.bodyStrong, color: colors.textPrimary },
  rowReason: { ...typography.caption, color: colors.textSecondary },
  rowWhen: { ...typography.caption, color: colors.textTertiary },
  detail: {
    paddingHorizontal: spacing.sm,
    paddingBottom: spacing.sm,
    paddingTop: spacing.xs,
    gap: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
  },
  reasonBlock: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: spacing.xs,
    backgroundColor: colors.primaryMuted,
    borderRadius: radius.md,
    padding: spacing.xs,
  },
  reasonText: { ...typography.caption, color: colors.textPrimary, flex: 1 },
  sectionLabel: { ...typography.label, color: colors.textTertiary, marginTop: spacing.xxs },
  scope: { ...typography.caption, color: colors.textSecondary },
  prompt: { ...typography.body, color: colors.textPrimary },
  imageWrap: {
    width: "100%" as const,
    aspectRatio: 1,
    maxHeight: 420,
    borderRadius: radius.md,
    backgroundColor: colors.background,
    overflow: "hidden" as const,
  },
  image: { width: "100%" as const, height: "100%" as const },
  muted: { ...typography.caption, color: colors.textTertiary },
  meta: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger },
  actions: { gap: spacing.xs, marginTop: spacing.xs },
  loadMore: { minHeight: minTouchTarget, alignItems: "center" as const, justifyContent: "center" as const },
  loadMoreLabel: { ...typography.bodyStrong, color: colors.primary },
}));
