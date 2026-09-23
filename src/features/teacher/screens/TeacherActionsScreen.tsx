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
import { TeacherClassSwitcher } from "../components/TeacherClassSwitcher";
import { useTeacherToday } from "../context/TeacherTodayContext";
import { ACTION_CENTER_FULL_LIST_NOTE, ACTION_CENTER_TITLE } from "../services/teacherActionCenter";

// Phase 111 — "Aksiyonlar": the complete Action Center, one tap from anywhere.
//
// Bugün shows its first five; this shows every one, in the same order, from
// the same load (TeacherTodayContext) — so the two can never disagree about
// what exists. The Action Center's semantics are untouched: escalate, then
// follow-up, then intervention, then student, exactly as the builder orders
// them. There are no filters here because the list already has the only
// grouping the evidence supports — its own action kinds, labelled on each row.
export function TeacherActionsScreen() {
  useThemeSubscription();
  const { attention, selectedClass, activeClasses, selectClass, refreshClasses } = useTeacherToday();
  const [isRefreshing, setIsRefreshing] = useState(false);

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
              <TeacherClassSwitcher classes={activeClasses} selectedClassId={selectedClass.id} onSelect={selectClass} />
              <ClassAttentionPanel classId={selectedClass.id} attention={attention} mode="full" showHeader={false} />
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
