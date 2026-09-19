import { Href } from "expo-router";
import { memo, useCallback } from "react";
import { ActivityIndicator, FlatList, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { AppBackButton } from "@components/ui/AppBackButton";
import { Avatar } from "@components/ui/Avatar";
import { EmptyState } from "@components/ui/EmptyState";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

import { useClassmates } from "../hooks/useClassmates";
import { Classmate, CLASS_ROLE_LABEL, otherStudentCount } from "../services/classSocial";

interface ClassmatesScreenProps {
  classId: string;
}

function spokenLabel(mate: Classmate): string {
  const parts = [mate.name];
  if (mate.username) parts.push(`@${mate.username}`);
  parts.push(CLASS_ROLE_LABEL[mate.role]);
  if (mate.isSelf) parts.push("sen");
  return parts.join(", ");
}

const ClassmateRow = memo(function ClassmateRow({ mate }: { mate: Classmate }) {
  useThemeSubscription();
  return (
    <View style={styles.row} accessible accessibilityLabel={spokenLabel(mate)}>
      <Avatar displayName={mate.name} photoURL={mate.photoURL} size="md" />
      <View style={styles.text}>
        <Text style={styles.name}>{mate.name}</Text>
        {mate.username ? <Text style={styles.username}>@{mate.username}</Text> : null}
      </View>
      <View style={styles.tags}>
        {mate.isSelf ? <Text style={[styles.tag, styles.selfTag]}>Sen</Text> : null}
        <Text style={styles.tag}>{CLASS_ROLE_LABEL[mate.role]}</Text>
      </View>
    </View>
  );
});

// Phase 110 — "Sınıf Arkadaşların".
//
// Who is in your class: a name, a public handle when there is one, a face or
// initials, and a role. Listed alphabetically (the teacher first) — an order
// that ranks no one. There is deliberately nothing else here: no email, no
// activity, no progress, no count of anything. Rows are not buttons, because
// there is no classmate page worth opening that would not have to invent data.
export function ClassmatesScreen({ classId }: ClassmatesScreenProps) {
  useThemeSubscription();
  const { classmates, isLoading, error } = useClassmates(classId);
  const renderItem = useCallback(({ item }: { item: Classmate }) => <ClassmateRow mate={item} />, []);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <FlatList
        data={classmates}
        keyExtractor={(mate) => mate.uid}
        renderItem={renderItem}
        style={styles.scroller}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        showsVerticalScrollIndicator={false}
        initialNumToRender={20}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.titleRow}>
              <AppBackButton fallbackHref={`/(student)/class/${classId}` as Href} style={styles.back} />
              <Text style={styles.title} accessibilityRole="header">
                Sınıf Arkadaşların
              </Text>
            </View>
            {!isLoading && !error && classmates.length > 0 ? (
              <Text style={styles.subtitle}>{classmates.length} üye</Text>
            ) : null}
            {error ? (
              <View style={styles.errorBanner} accessibilityRole="alert">
                <Text style={styles.errorText}>{error}</Text>
              </View>
            ) : null}
            {isLoading ? <ActivityIndicator color={colors.primary} /> : null}
          </View>
        }
        ListFooterComponent={
          !isLoading && !error && classmates.length > 0 && otherStudentCount(classmates) === 0 ? (
            <EmptyState icon="people-outline" title="Bu sınıfta henüz başka öğrenci yok." />
          ) : null
        }
      />
    </SafeAreaView>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scroller: {
    flex: 1,
    width: "100%",
    maxWidth: contentWidth.readable,
    alignSelf: "center",
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  header: {
    gap: spacing.xs,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.xxs,
  },
  back: {
    marginLeft: -spacing.sm,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
    flex: 1,
    minWidth: 0,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.sm,
    minHeight: minTouchTarget,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  name: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  username: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  tags: {
    alignItems: "flex-end",
    gap: spacing.xxs,
  },
  tag: {
    ...typography.caption,
    color: colors.textSecondary,
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.xs,
    overflow: "hidden",
  },
  selfTag: {
    color: colors.primary,
  },
  separator: {
    height: spacing.sm,
  },
  errorBanner: {
    backgroundColor: colors.dangerMuted,
    borderRadius: radius.lg,
    padding: spacing.sm,
  },
  errorText: {
    ...typography.body,
    color: colors.danger,
  },
}));
