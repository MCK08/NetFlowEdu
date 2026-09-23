import { router } from "expo-router";
import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { ClassAttentionPanel } from "../components/ClassAttentionPanel";
import { TeacherActionFilterBar } from "../components/TeacherActionFilterBar";
import { TeacherClassSwitcher } from "../components/TeacherClassSwitcher";
import { useTeacherToday } from "../context/TeacherTodayContext";
import { ACTION_CENTER_FULL_LIST_NOTE, ACTION_CENTER_TITLE } from "../services/teacherActionCenter";
import { ActionFilter, EMPTY_ACTION_FILTER } from "../services/teacherActionFilter";

// Phase 111 — "Aksiyonlar": the complete Action Center, one tap from anywhere.
//
// Bugün shows its first five; this shows every one, in the same order, from
// the same load (TeacherTodayContext) — so the two can never disagree about
// what exists. The Action Center's semantics are untouched: escalate, then
// follow-up, then intervention, then student, exactly as the builder orders
// them.
//
// Phase 121 — and one way to find a row in it. The kind chips and the search
// field are LOCAL: they hide rows, never reorder or re-rank them, and they
// read nothing. The chips are built from the kinds this class's list actually
// contains, under the same canonical labels the rows print, so the filter can
// never name a category the Action Center does not have.
export function TeacherActionsScreen() {
  useThemeSubscription();
  const { attention, selectedClass, activeClasses, selectClass, refreshClasses } = useTeacherToday();
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [filter, setFilter] = useState<ActionFilter>(EMPTY_ACTION_FILTER);

  const refreshAll = useCallback(async () => {
    setIsRefreshing(true);
    await Promise.all([refreshClasses(), attention.refresh()]);
    setIsRefreshing(false);
  }, [refreshClasses, attention]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refreshAll} tintColor={colors.primary} />}
      >
        <View style={styles.column}>
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              Aksiyonlar
            </Text>
            <Text style={styles.subtitle}>
              {ACTION_CENTER_TITLE} · {ACTION_CENTER_FULL_LIST_NOTE}
            </Text>
          </View>

          {!selectedClass ? (
            <View style={styles.block}>
              <EmptyState
                icon="checkmark-done-outline"
                title="Bekleyen aksiyon yok."
                description="Aksiyonlar, aktif bir sınıfının öğrencileri çalıştıkça burada görünür."
              />
              <PrimaryButton label="Sınıflara Git" onPress={() => router.navigate("/(teacher)/(tabs)/classes" as never)} />
            </View>
          ) : (
            <>
              {/* Phase 119 — the switcher NAMES the selected class now, so the
                  caption that used to name it under a row of pills would put
                  the same class name twice in one column. */}
              <TeacherClassSwitcher
                classes={activeClasses}
                selectedClassId={selectedClass.id}
                onSelect={(classId) => {
                  // A filter belongs to the list it was typed against; another
                  // class has its own kinds and its own students.
                  setFilter(EMPTY_ACTION_FILTER);
                  selectClass(classId);
                }}
              />
              {/* Drawn only once there is a list to narrow: while it loads or
                  fails, a filter bar would be a control over nothing. */}
              {!attention.isLoadingList && !attention.error && attention.items.length > 0 ? (
                <TeacherActionFilterBar items={attention.items} filter={filter} onChange={setFilter} />
              ) : null}
              <ClassAttentionPanel
                classId={selectedClass.id}
                attention={attention}
                mode="full"
                showHeader={false}
                filter={filter}
              />
            </>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.md,
    paddingBottom: spacing.xxl,
    alignItems: "center",
  },
  column: {
    width: "100%",
    maxWidth: contentWidth.readable,
    gap: spacing.md,
  },
  header: {
    gap: spacing.xxs,
    paddingTop: spacing.sm,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  block: {
    gap: spacing.sm,
  },
}));
