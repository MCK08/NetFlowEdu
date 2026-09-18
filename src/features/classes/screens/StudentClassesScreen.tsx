import { useCallback, useMemo, useState } from "react";
import { SectionList, SectionListData, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { SectionHeader } from "@components/ui/SectionHeader";
import { useAuth } from "@features/authentication";
import { NotificationBellButton } from "@features/notifications";
import { ROUTES } from "@constants/routes";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { JoinClassModal } from "../components/JoinClassModal";
import { StudentClassCard } from "../components/StudentClassCard";
import { useStudentClasses } from "../hooks/useStudentClasses";
import { ClassRoom } from "@/types/class";

function ClassListSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2].map((key) => (
        <LoadingSkeleton key={key} height={76} borderRadius={16} />
      ))}
    </View>
  );
}

function keyExtractor(item: ClassRoom) {
  return item.id;
}

function renderItem({ item }: { item: ClassRoom }) {
  return <StudentClassCard classRoom={item} />;
}

function Separator() {
  return <View style={styles.separator} />;
}

interface ClassSection {
  title: string;
  data: ClassRoom[];
}

// Phase 106 — one contextual line under the title, from the list itself.
// Never a slogan: it says how many classes the student is in, or how to
// join one when they are in none. Loading says nothing rather than "0".
function subtitleFor(classes: readonly ClassRoom[], isLoading: boolean): string | null {
  if (isLoading) return null;
  const active = classes.filter((room) => room.status !== "archived").length;
  if (classes.length === 0) return "Öğretmeninden aldığın kodla bir sınıfa katıl.";
  if (active === 1) return "Bir sınıfta birlikte öğreniyorsun.";
  return `${active} sınıfta birlikte öğreniyorsun.`;
}

export function StudentClassesScreen() {
  const { firebaseUser } = useAuth();
  const { classes, isLoading, isJoining, errorMessage, joinByCode } = useStudentClasses(
    firebaseUser?.uid,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleJoin = useCallback(
    async (code: string) => {
      const success = await joinByCode(code);
      if (success) setIsModalOpen(false);
    },
    [joinByCode],
  );

  // Phase 106 — the class document's own `status` splits the list: the
  // classes still running, then any the teacher has archived. A student is
  // still a member of an archived class (its questions and chat remain
  // readable), so it is not hidden — only moved under its own heading and
  // drawn a step quieter. Empty groups render no heading at all.
  const sections = useMemo<ClassSection[]>(() => {
    const active = classes.filter((room) => room.status !== "archived");
    const archived = classes.filter((room) => room.status === "archived");
    const result: ClassSection[] = [];
    if (active.length > 0) result.push({ title: "Aktif Sınıflarım", data: active });
    if (archived.length > 0) result.push({ title: "Geçmiş Sınıflar", data: archived });
    return result;
  }, [classes]);

  const subtitle = subtitleFor(classes, isLoading);

  const renderSectionHeader = useCallback(
    ({ section }: { section: SectionListData<ClassRoom, ClassSection> }) => (
      <View style={styles.sectionHeader}>
        <SectionHeader title={section.title} />
      </View>
    ),
    [],
  );

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <SectionList
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        SectionSeparatorComponent={Separator}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <View style={styles.headerTitleRow}>
              <View style={styles.headerText}>
                <Text style={styles.title}>Sınıflarım</Text>
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
              </View>
              <NotificationBellButton
                uid={firebaseUser?.uid}
                route={ROUTES.studentNotifications}
              />
            </View>
            <PrimaryButton label="Sınıfa Katıl" onPress={() => setIsModalOpen(true)} />
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <ClassListSkeleton />
          ) : (
            <EmptyState
              icon="school-outline"
              title="Henüz bir sınıfa katılmadın"
              description="Öğretmeninden aldığın kodla katılabilirsin."
            />
          )
        }
      />

      <JoinClassModal
        visible={isModalOpen}
        isJoining={isJoining}
        errorMessage={errorMessage}
        onSubmit={handleJoin}
        onCancel={() => setIsModalOpen(false)}
      />
    </SafeAreaView>
  );
}

const styles = themedStyles(() => ({
  flex: {
    flex: 1,
    backgroundColor: colors.background,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xl,
  },
  header: {
    gap: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.sm,
  },
  headerTitleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: spacing.sm,
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: spacing.xxs,
  },
  title: {
    ...typography.displayLg,
    fontSize: 26,
    color: colors.textPrimary,
  },
  subtitle: {
    ...typography.body,
    color: colors.textSecondary,
  },
  sectionHeader: {
    paddingTop: spacing.xs,
  },
  separator: {
    height: spacing.xs,
  },
  skeletonList: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
}));
