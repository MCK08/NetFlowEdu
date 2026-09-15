import { Ionicons } from "@expo/vector-icons";

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

import { useCommentReviewQueue } from "../hooks/useCommentReviewQueue";
import {
  COMMENT_REVIEW_QUEUE_EMPTY,
  COMMENT_REVIEW_QUEUE_TITLE,
  COMMENT_REVIEW_QUEUE_TRUST_NOTE,
  commentReviewReasonCopy,
  REVIEW_ACTION,
} from "../services/answerReviewCopy";
import { CommentReviewDetail, CommentReviewQueueItem } from "../services/commentReviewService";

// Phase 98 — "Yorum İncelemeleri".
//
// The sibling of Phase 97's answer queue, in the same visual language: a calm
// list of the student comments the text layer could not settle for this
// class, oldest first. Opening one shows why it is here, the question it is
// on, the comment text exactly as it would be published, and two actions.
// Nothing is editable — there is no field the teacher could type into, so the
// published text can only ever be the student's own.
//
// A separate surface rather than a section of the answer queue: the two kinds
// of content are reviewed differently (an image to look at vs. a sentence to
// read), and a teacher should never wonder which kind an item is.

interface CommentReviewScreenProps {
  classId: string;
}

const QueueRow = memo(function QueueRow({
  item,
  isSelected,
  onSelect,
}: {
  item: CommentReviewQueueItem;
  isSelected: boolean;
  onSelect: (submissionId: string) => void;
}) {
  useThemeSubscription();
  const prompt = item.question.description?.trim() || "Görsel soru";
  const reason = commentReviewReasonCopy(item.reviewReason);
  const when = formatRelativeTime(item.submittedAt);
  return (
    <Pressable
      onPress={() => onSelect(item.submissionId)}
      style={[styles.row, isSelected ? styles.rowSelected : null]}
      accessibilityRole="button"
      accessibilityState={{ selected: isSelected }}
      aria-selected={isSelected}
      accessibilityLabel={joinSpokenLabel([
        `${item.author.displayName}, yorum`,
        item.text,
        `Soru: ${prompt}`,
        reason,
        when,
        isSelected ? "Açık" : "İncelemek için seçin",
      ])}
    >
      <View style={styles.rowBody}>
        <Text style={styles.rowAuthor}>{`${item.author.displayName} · Yorum`}</Text>
        <Text style={styles.rowText} numberOfLines={2}>
          {item.text}
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
  detail: CommentReviewDetail | null;
  isLoading: boolean;
  error: string | null;
  pendingDecision: "approve" | "reject" | null;
  decisionError: string | null;
  onApprove: () => void;
  onReject: () => void;
}) {
  if (isLoading) {
    return (
      <View style={styles.detail} accessibilityLiveRegion="polite" aria-live="polite" accessibilityLabel="Yorum yükleniyor">
        <LoadingSkeleton height={18} borderRadius={6} />
        <LoadingSkeleton height={72} borderRadius={12} />
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
      <View
        style={styles.reasonBlock}
        accessible
        accessibilityLabel={`Neden incelemede: ${commentReviewReasonCopy(detail.reviewReason)}`}
      >
        <Ionicons name="information-circle-outline" size={iconSize.sm} color={colors.primary} />
        <Text style={styles.reasonText}>{commentReviewReasonCopy(detail.reviewReason)}</Text>
      </View>

      <Text style={styles.sectionLabel}>Soru</Text>
      {scope ? <Text style={styles.scope}>{scope}</Text> : null}
      <Text style={styles.prompt}>{prompt}</Text>

      <Text style={styles.sectionLabel}>Gönderilen yorum</Text>
      {/* The text exactly as it would be published. Read-only by construction. */}
      <View style={styles.commentBox} accessible accessibilityLabel={`Yorum metni: ${detail.text}`}>
        <Text style={styles.commentText} selectable>
          {detail.text}
        </Text>
      </View>
      <Text style={styles.meta}>{`${detail.author.displayName} · ${formatRelativeTime(detail.submittedAt)}`}</Text>

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
          accessibilityHint="Yorumu soruda yayınlar"
        />
        <PrimaryButton
          label={REVIEW_ACTION.reject}
          variant="secondary"
          onPress={onReject}
          isLoading={pendingDecision === "reject"}
          disabled={isBusy}
          accessibilityHint="Yorumu yayınlamaz; öğrenci yeni bir yorum gönderebilir"
        />
      </View>
    </View>
  );
}

export function CommentReviewScreen({ classId }: CommentReviewScreenProps) {
  useThemeSubscription();
  const queue = useCommentReviewQueue(classId);

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <AppBackButton fallbackHref={{ pathname: "/(teacher)/class/[classId]", params: { classId } }} style={styles.backButton} />
        <View style={styles.headerText}>
          <Text style={styles.title} accessibilityRole="header">
            {COMMENT_REVIEW_QUEUE_TITLE}
          </Text>
          <Text style={styles.subtitle}>{COMMENT_REVIEW_QUEUE_TRUST_NOTE}</Text>
        </View>
      </View>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {queue.decisionNotice ? (
          <View
            style={styles.notice}
            accessibilityLiveRegion="polite"
            aria-live="polite"
            accessible
            accessibilityLabel={queue.decisionNotice}
          >
            <Ionicons name="checkmark-circle-outline" size={iconSize.sm} color={colors.success} />
            <Text style={styles.noticeText}>{queue.decisionNotice}</Text>
          </View>
        ) : null}

        {queue.status === "loading" ? (
          <View
            style={styles.skeletons}
            accessibilityLabel="İncelemeler yükleniyor"
            accessibilityLiveRegion="polite"
            aria-live="polite"
          >
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
            icon="chatbubbles-outline"
            title={COMMENT_REVIEW_QUEUE_EMPTY.title}
            description={COMMENT_REVIEW_QUEUE_EMPTY.description}
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
                accessibilityLabel="Daha fazla yorum yükle"
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
  rowText: { ...typography.bodyStrong, color: colors.textPrimary },
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
  commentBox: {
    backgroundColor: colors.background,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.divider,
    padding: spacing.sm,
  },
  commentText: { ...typography.body, color: colors.textPrimary },
  meta: { ...typography.caption, color: colors.textSecondary },
  error: { ...typography.caption, color: colors.danger },
  actions: { gap: spacing.xs, marginTop: spacing.xs },
  loadMore: { minHeight: minTouchTarget, alignItems: "center" as const, justifyContent: "center" as const },
  loadMoreLabel: { ...typography.bodyStrong, color: colors.primary },
}));
