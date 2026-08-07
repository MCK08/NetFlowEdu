import { StyleSheet, Text, View } from "react-native";

import { BottomActionSheet } from "@components/ui/BottomActionSheet";
import { Chip } from "@components/ui/Chip";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { GRADE_LEVELS, getTopicsForSubject, QUESTION_SUBJECTS } from "@features/questions/data/questionTaxonomy";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import { EMPTY_FEED_FILTER, FeedFilter } from "../services/feedFilters";

interface FeedFilterSheetProps {
  visible: boolean;
  filter: FeedFilter;
  onChange: (filter: FeedFilter) => void;
  onClose: () => void;
}

// Ana Akış'ın filtre bottom sheet'i (Phase 21) — reuses the app's one
// existing sheet shell (BottomActionSheet) and the one existing selectable
// tag primitive (Chip), same as QuestionMetadataModal reuses Checkbox for
// the multiple-choice toggle. Each row includes a "Tümü" chip to clear just
// that field; "Filtreleri Temizle" clears all three at once. Konu options
// depend on the selected Ders, matching the composer's own subject→topic
// dependency.
export function FeedFilterSheet({ visible, filter, onChange, onClose }: FeedFilterSheetProps) {
  const topicOptions = filter.subject ? getTopicsForSubject(filter.subject) : [];

  function setSubject(next: string | null) {
    // Changing (or clearing) the subject invalidates any topic selection
    // that belonged to the PREVIOUS subject's topic list.
    onChange({ ...filter, subject: next, topic: null });
  }

  function setGradeLevel(next: string | null) {
    onChange({ ...filter, gradeLevel: next });
  }

  function setTopic(next: string | null) {
    onChange({ ...filter, topic: next });
  }

  return (
    <BottomActionSheet visible={visible} onClose={onClose} title="Filtreler">
      <Text style={styles.label}>Ders</Text>
      <View style={styles.chipRow}>
        <Chip label="Tümü" selected={filter.subject === null} onPress={() => setSubject(null)} />
        {QUESTION_SUBJECTS.map((subject) => (
          <Chip
            key={subject}
            label={subject}
            selected={filter.subject === subject}
            onPress={() => setSubject(subject)}
          />
        ))}
      </View>

      <Text style={styles.label}>Sınıf</Text>
      <View style={styles.chipRow}>
        <Chip label="Tümü" selected={filter.gradeLevel === null} onPress={() => setGradeLevel(null)} />
        {GRADE_LEVELS.map((grade) => (
          <Chip
            key={grade}
            label={grade}
            selected={filter.gradeLevel === grade}
            onPress={() => setGradeLevel(grade)}
          />
        ))}
      </View>

      {filter.subject ? (
        <>
          <Text style={styles.label}>Konu</Text>
          <View style={styles.chipRow}>
            <Chip label="Tümü" selected={filter.topic === null} onPress={() => setTopic(null)} />
            {topicOptions.map((topic) => (
              <Chip key={topic} label={topic} selected={filter.topic === topic} onPress={() => setTopic(topic)} />
            ))}
          </View>
        </>
      ) : (
        <Text style={styles.hint}>Konu filtresi için önce bir ders seçin.</Text>
      )}

      <PrimaryButton label="Filtreleri Temizle" variant="secondary" onPress={() => onChange(EMPTY_FEED_FILTER)} />
      <PrimaryButton label="Uygula" onPress={onClose} />
    </BottomActionSheet>
  );
}

const styles = StyleSheet.create({
  label: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textSecondary,
    marginTop: spacing.sm,
    marginBottom: spacing.xxs,
  },
  chipRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
  hint: {
    ...typography.caption,
    color: colors.textTertiary,
    marginBottom: spacing.sm,
  },
});
