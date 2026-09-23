import { Ionicons } from "@expo/vector-icons";
import { useMemo, useState } from "react";
import { SectionList, SectionListData, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { EmptyState } from "@components/ui/EmptyState";
import { IconButton } from "@components/ui/IconButton";
import { LoadingSkeleton } from "@components/ui/LoadingSkeleton";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useAuth } from "@features/authentication";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import { ClassCard } from "../components/ClassCard";
import { CreateClassModal } from "../components/CreateClassModal";
import { useTeacherClasses } from "../hooks/useTeacherClasses";
import { ClassRoom } from "@/types/class";

function ClassListSkeleton() {
  return (
    <View style={styles.skeletonList}>
      {[0, 1, 2].map((key) => (
        <LoadingSkeleton key={key} height={112} borderRadius={radius.xl} />
      ))}
    </View>
  );
}

function keyExtractor(item: ClassRoom) {
  return item.id;
}

function renderItem({ item }: { item: ClassRoom }) {
  return <ClassCard classRoom={item} />;
}

function Separator() {
  return <View style={styles.separator} />;
}

function renderSectionHeader({ section }: { section: SectionListData<ClassRoom, ClassSection> }) {
  if (!section.title) return null;
  return (
    <View style={styles.sectionHeader}>
      <Text style={styles.sectionTitle} accessibilityRole="header">
        {section.title}
      </Text>
    </View>
  );
}

export const TEACHER_CLASSES_TITLE = "Sınıflar";
export const TEACHER_ARCHIVED_TITLE = "Arşivlenen";

interface ClassSection {
  title: string | null;
  data: ClassRoom[];
}

/** Phase 120 — the class document's own `status`, split without a second
 *  read and without a control that promises anything.
 *
 *  NO TEACHER ACTION CAN ARCHIVE A CLASS TODAY: createClass writes
 *  status:"active" and firestore.rules denies every client write to
 *  classes/{classId}, so there is no archive callable and no rule that
 *  would let one through. The mockup's "Aktif Sınıflar / Arşivlenen"
 *  segmented control is therefore left unbuilt — a tab that can never fill
 *  is a promise the product cannot keep. What IS built is the honest
 *  degradation: if a class ever carries the archived status the type has
 *  always allowed, it drops under its own quiet heading instead of sitting
 *  among the running classes. With none, this is exactly the plain list a
 *  teacher sees today. */
function sectionsFor(classes: readonly ClassRoom[]): ClassSection[] {
  const active = classes.filter((classRoom) => classRoom.status === "active");
  const archived = classes.filter((classRoom) => classRoom.status !== "active");
  const sections: ClassSection[] = [];
  // The active list keeps the query's own order and needs no heading: with
  // nothing to tell it apart from, "Aktif Sınıflar" would name the page.
  if (active.length > 0) sections.push({ title: null, data: active });
  if (archived.length > 0) sections.push({ title: TEACHER_ARCHIVED_TITLE, data: archived });
  return sections;
}

// Phase 120 — "Sınıflar": every class, and a way to add one.
//
// The create action was a full-width secondary button under the title that
// appeared only once a teacher already had a class, so the page's one verb
// took a row of its own and was missing from the one state that needs it
// most. It is a compact + beside the title now, always there, opening the
// same CreateClassModal and the same callable.
//
// The mockup's "Sınıfa Katıl" is deliberately absent: joinClassByCode
// rejects any caller whose role is not "student", so a teacher pressing it
// would meet a server error. This screen offers what a teacher can do.
//
// Phase 111 — this screen used to be the teacher's home, so it carried the
// greeting, a three-number stats card and four shortcut tiles. Bugün is the
// home now: the greeting moved there, the stats were counts of the list right
// below them, and the tiles pointed at places that are now a tab (Profil) or
// live inside it (Arkadaşlar, Arkadaş Bul). What remains is the list itself —
// each class with its name, members and status (ClassCard) — and the one way
// to add another. No per-class metric is added: one would need a read per
// class, and this is a class navigator, not a dashboard.
export function TeacherClassesScreen() {
  const { firebaseUser } = useAuth();
  const { classes, isLoading, isCreating, errorMessage, createClass, refresh } = useTeacherClasses(
    firebaseUser?.uid,
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const sections = useMemo(() => sectionsFor(classes), [classes]);

  // The hook reuses one `errorMessage` for both "the class list failed to
  // load" and "createClass failed". The modal already renders the latter
  // while it is open, so the banner below is scoped to the case the old
  // screen showed nothing at all for: loading failed and there is not a
  // single class to fall back on.
  const showLoadError = !isLoading && !isModalOpen && classes.length === 0 && errorMessage !== null;

  async function handleCreate(name: string) {
    const success = await createClass(name);
    if (success) setIsModalOpen(false);
  }

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <SectionList
        sections={sections}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        renderSectionHeader={renderSectionHeader}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={Separator}
        stickySectionHeadersEnabled={false}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title} accessibilityRole="header">
              {TEACHER_CLASSES_TITLE}
            </Text>
            <IconButton
              icon="add-circle-outline"
              onPress={() => setIsModalOpen(true)}
              accessibilityLabel="Yeni sınıf oluştur"
              color={colors.primary}
            />
          </View>
        }
        ListEmptyComponent={
          isLoading ? (
            <ClassListSkeleton />
          ) : showLoadError ? (
            <View style={styles.errorPanel}>
              <Ionicons name="cloud-offline-outline" size={32} color={colors.textTertiary} />
              <Text style={styles.errorText}>{errorMessage}</Text>
              <PrimaryButton label="Tekrar Dene" onPress={refresh} variant="secondary" />
            </View>
          ) : (
            <View style={styles.emptyPanel}>
              <EmptyState
                icon="school-outline"
                title="Henüz bir sınıfın yok"
                description="İlk sınıfını oluştur, öğrencilerin katılım koduyla katılsın."
              />
              <PrimaryButton label="İlk Sınıfını Oluştur" onPress={() => setIsModalOpen(true)} />
            </View>
          )
        }
      />

      <CreateClassModal
        visible={isModalOpen}
        isCreating={isCreating}
        errorMessage={errorMessage}
        onSubmit={handleCreate}
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
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.lg,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  sectionHeader: {
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  sectionTitle: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textSecondary,
  },
  separator: {
    height: spacing.sm,
  },
  skeletonList: {
    gap: spacing.sm,
    marginTop: spacing.xs,
  },
  emptyPanel: {
    marginTop: spacing.xs,
    gap: spacing.sm,
  },
  errorPanel: {
    alignItems: "center",
    gap: spacing.sm,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.md,
  },
  errorText: {
    ...typography.body,
    color: colors.textSecondary,
    textAlign: "center",
  },
}));
