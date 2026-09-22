import { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { IconButton } from "@components/ui/IconButton";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useAuth } from "@features/authentication";
import { NotificationBellButton } from "@features/notifications";
import { ROUTES } from "@constants/routes";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { ClassSwitcherSheet } from "../components/ClassSwitcherSheet";
import { JoinClassModal } from "../components/JoinClassModal";
import { useStudentClasses } from "../hooks/useStudentClasses";
import { StudentClassDetailScreen } from "./StudentClassDetailScreen";
import { ClassRoom } from "@/types/class";

export const CLASS_TAB_TITLE = "Sınıf";

/** The class the tab opens on: the first class still running, or — when every
 *  class the student is in has been archived — the first of those. The list's
 *  own order, never a ranking of classes. */
function defaultClassId(classes: readonly ClassRoom[]): string | null {
  const active = classes.find((room) => room.status !== "archived");
  return active?.id ?? classes[0]?.id ?? null;
}

// Phase 118 — the Sınıf tab shows a CLASS, not a list of classes.
//
// It was a list: "Sınıflarım", one card per joined class, and every real
// thing — the chat, the questions, sharing one, the classmates, the week, the
// activity — one tap behind it. A student in a single class, which is most of
// them, got a whole screen to hold one row. "Which class am I in?" was the
// only question the tab answered, and it was not the one being asked.
//
// The workspace below is the SAME component the /class/[classId] route
// renders — not a copy of it — so there is one class page in this app, whether
// it is reached from the tab or pushed from a notification. What the tab adds
// is its header (the title, notifications, joining a class) and, when there is
// more than one class to choose between, the switcher.
export function StudentClassesScreen() {
  const { firebaseUser } = useAuth();
  const { classes, isLoading, isJoining, errorMessage, joinByCode } = useStudentClasses(
    firebaseUser?.uid,
  );
  const [isJoinOpen, setIsJoinOpen] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  // The class being viewed. Deliberately in-memory and deliberately not a new
  // stored preference: the product has no concept of a "current class" and
  // this phase does not invent one — it resolves to the list's first running
  // class each time the tab is built.
  const [pickedClassId, setPickedClassId] = useState<string | null>(null);

  const selectedClassId = useMemo(() => {
    if (pickedClassId && classes.some((room) => room.id === pickedClassId)) return pickedClassId;
    return defaultClassId(classes);
  }, [pickedClassId, classes]);

  const handleJoin = useCallback(
    async (code: string) => {
      const success = await joinByCode(code);
      if (success) setIsJoinOpen(false);
    },
    [joinByCode],
  );

  const header = (
    <View style={styles.headerRow}>
      <Text style={styles.title}>{CLASS_TAB_TITLE}</Text>
      <View style={styles.headerActions}>
        <NotificationBellButton uid={firebaseUser?.uid} route={ROUTES.studentNotifications} />
        <IconButton
          icon="add-circle-outline"
          onPress={() => setIsJoinOpen(true)}
          accessibilityLabel="Sınıfa katıl"
          color={colors.primary}
        />
      </View>
    </View>
  );

  const joinModal = (
    <JoinClassModal
      visible={isJoinOpen}
      isJoining={isJoining}
      errorMessage={errorMessage}
      onSubmit={handleJoin}
      onCancel={() => setIsJoinOpen(false)}
    />
  );

  if (isLoading) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <View style={styles.plain}>
          {header}
          <View style={styles.skeletonList}>
            {[0, 1, 2].map((key) => (
              <LoadingSkeleton key={key} height={76} borderRadius={16} />
            ))}
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // No class: the tab is the join flow, and says so once rather than drawing
  // a workspace's worth of empty sections.
  if (!selectedClassId) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <ScrollView contentContainerStyle={styles.plain} showsVerticalScrollIndicator={false}>
          {header}
          <EmptyState
            icon="school-outline"
            title="Henüz bir sınıfa katılmadın"
            description="Öğretmeninden aldığın kodla katılabilirsin."
          />
          <PrimaryButton label="Sınıfa Katıl" onPress={() => setIsJoinOpen(true)} />
        </ScrollView>
        {joinModal}
      </SafeAreaView>
    );
  }

  return (
    <>
      <StudentClassDetailScreen
        classId={selectedClassId}
        header={header}
        // The identity card becomes a control only when there is somewhere to
        // switch to.
        onSwitchClass={classes.length > 1 ? () => setIsSwitcherOpen(true) : undefined}
      />
      {joinModal}
      <ClassSwitcherSheet
        visible={isSwitcherOpen}
        classes={classes}
        selectedClassId={selectedClassId}
        onSelect={(classId) => {
          setPickedClassId(classId);
          setIsSwitcherOpen(false);
        }}
        onCancel={() => setIsSwitcherOpen(false)}
      />
    </>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  plain: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
  },
  title: {
    ...typography.displayLg,
    fontSize: 26,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  skeletonList: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
}));
