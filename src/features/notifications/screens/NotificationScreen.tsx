import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useCallback, useEffect, useMemo } from "react";
import { ActivityIndicator, Pressable, RefreshControl, SectionList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { Divider } from "@components/ui/Divider";
import { ROUTES } from "@constants/routes";
import { EmptyState } from "@components/ui/EmptyState";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { Toast } from "@components/ui/Toast";
import { useToast } from "@components/ui/useToast";
import { useAuth } from "@features/authentication";
import { useNavigationGuard } from "@hooks/useNavigationGuard";
import { colors } from "@theme/colors";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";
import { NotificationRecord } from "@/types/notification";
import { UserRole } from "@/types/user";

import { NotificationRow } from "../components/NotificationRow";
import { useNotificationInbox } from "../hooks/useNotificationInbox";
import { resolveNotificationDestination } from "../services/notificationNavigation";
import { groupNotificationsByRecency } from "../services/notificationTimeline";
import { formatUnreadBadge } from "../services/unreadBadge";

function keyExtractor(item: NotificationRecord) {
  return item.id;
}

function RowSeparator() {
  return <Divider style={styles.separator} />;
}

function NotificationSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2, 3].map((key) => (
        <LoadingSkeleton key={key} height={56} borderRadius={12} />
      ))}
    </View>
  );
}

// Shared by both role route wrappers — see app/(student)/notifications.tsx
// and app/(teacher)/notifications.tsx, both thin pass-throughs. `role` is
// the one thing that differs between them, needed only by the navigation
// resolver (a teacher and a student land in different route groups for
// the same notification type).
export function NotificationScreen({ role }: { role: UserRole }) {
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;
  const {
    notifications,
    unreadCount,
    isLoading,
    isRefreshing,
    isLoadingMore,
    loadError,
    paginationError,
    actionError,
    clearActionError,
    refresh,
    loadMore,
    markRead,
    markAllRead,
  } = useNotificationInbox(uid);
  const { message: toastMessage, variant: toastVariant, showToast } = useToast();

  // A failed mark-read/mark-all (already rolled back in the hook) is
  // surfaced through the same transient toast used for unreachable
  // destinations — the list itself is still fine, so it must not be
  // replaced by a full-screen error.
  useEffect(() => {
    if (!actionError) return;
    showToast(actionError, "danger");
    clearActionError();
  }, [actionError, showToast, clearActionError]);
  const guardNavigation = useNavigationGuard();

  const sections = useMemo(() => groupNotificationsByRecency(notifications), [notifications]);

  const handlePress = useCallback(
    (notification: NotificationRecord) => {
      markRead(notification.id);
      const destination = resolveNotificationDestination(notification, role);
      if (destination.kind === "unavailable") {
        showToast(destination.message, "neutral");
        return;
      }
      guardNavigation(notification.id, () => router.push(destination.path as never));
    },
    [markRead, role, showToast, guardNavigation],
  );

  const renderItem = useCallback(
    ({ item }: { item: NotificationRecord }) => (
      <NotificationRow notification={item} onPress={handlePress} />
    ),
    [handlePress],
  );

  const badgeLabel = formatUnreadBadge(unreadCount);

  // Phase 28 §1 — this screen previously had no back affordance at all:
  // headerShown is false at the Stack level (see app/(student)/_layout.tsx),
  // and this component never rendered one of its own, so the only way out
  // was the iOS edge-swipe gesture or Android hardware back — both real,
  // but with zero VISIBLE way to leave. `canGoBack()` falls back to
  // replacing with this role's own tab home rather than calling back()
  // blindly, which would be a no-op (and log a warning) if this screen was
  // ever opened as the root of its own stack (e.g. a future deep link).
  function goBack() {
    if (router.canGoBack()) router.back();
    else router.replace((role === "teacher" ? ROUTES.teacher : ROUTES.student) as never);
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.header}>
        <View style={styles.headerTopRow}>
          <Pressable
            onPress={goBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Geri"
            accessibilityHint="Önceki ekrana döner"
            hitSlop={8}
          >
            <Ionicons name="chevron-back" size={26} color={colors.textPrimary} />
          </Pressable>
          <View style={styles.headerTitleRow}>
            <Text style={styles.title}>Bildirimler</Text>
            {badgeLabel ? (
              <View style={styles.headerBadge}>
                <Text style={styles.headerBadgeText}>{badgeLabel}</Text>
              </View>
            ) : null}
          </View>
        </View>
        {unreadCount > 0 ? (
          <Text
            style={styles.markAllLink}
            onPress={markAllRead}
            accessibilityRole="button"
            accessibilityLabel="Tümünü okundu işaretle"
          >
            Tümünü okundu işaretle
          </Text>
        ) : null}
      </View>

      {isLoading ? (
        <NotificationSkeleton />
      ) : loadError ? (
        // Phase 75 — "Tekrar dene" used to be the EmptyState's DESCRIPTION:
        // an instruction with nothing to act on. The screen's own `refresh`
        // is wired only to the list's pull-to-refresh, and this branch
        // replaces the list, so there was no way to retry at all. Same
        // EmptyState + "Tekrar Dene" pairing every other error screen uses.
        <View style={styles.errorState}>
          <EmptyState icon="cloud-offline-outline" title={loadError} />
          <PrimaryButton label="Tekrar Dene" onPress={refresh} variant="secondary" />
        </View>
      ) : sections.length === 0 ? (
        <EmptyState
          icon="notifications-outline"
          title="Henüz bildirimin yok"
          description="Sorularınla, cevaplarınla ve arkadaşlıklarınla ilgili gelişmeler burada görünecek."
        />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          renderSectionHeader={({ section }) => (
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionHeaderText}>{section.label}</Text>
            </View>
          )}
          ItemSeparatorComponent={RowSeparator}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl refreshing={isRefreshing} onRefresh={refresh} tintColor={colors.primary} />
          }
          onEndReached={loadMore}
          onEndReachedThreshold={0.4}
          ListFooterComponent={
            isLoadingMore ? (
              <ActivityIndicator style={styles.footerSpinner} color={colors.primary} />
            ) : paginationError ? (
              <Text style={styles.paginationError} onPress={loadMore}>
                {paginationError} — Tekrar dene
              </Text>
            ) : null
          }
        />
      )}

      <Toast message={toastMessage} variant={toastVariant} />
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    paddingBottom: spacing.md,
    gap: spacing.xxs,
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  backButton: {
    minWidth: minTouchTarget,
    minHeight: minTouchTarget,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -spacing.sm,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xs,
  },
  title: {
    ...typography.displayLg,
    fontSize: 24,
    color: colors.textPrimary,
  },
  headerBadge: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: "center",
  },
  headerBadgeText: {
    ...typography.label,
    color: colors.textInverse,
  },
  markAllLink: {
    ...typography.caption,
    color: colors.primary,
    fontWeight: "600",
    paddingVertical: spacing.xxs,
    alignSelf: "flex-end",
  },
  sectionHeader: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  sectionHeaderText: {
    ...typography.label,
    color: colors.textTertiary,
    textTransform: "uppercase",
  },
  separator: {
    marginLeft: spacing.lg + 40 + spacing.sm,
  },
  listContent: {
    paddingBottom: spacing.xxl,
  },
  skeletonList: {
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  errorState: {
    paddingTop: spacing.xxl,
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
  },
  footerSpinner: {
    marginVertical: spacing.lg,
  },
  paginationError: {
    ...typography.caption,
    color: colors.danger,
    textAlign: "center",
    marginVertical: spacing.lg,
  },
}));
