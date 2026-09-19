import { useCallback, useState } from "react";
import { Text, View } from "react-native";

import { Chip } from "@components/ui/Chip";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { useFeedLaunch } from "@features/feed/hooks/useFeedLaunch";
import { QUESTION_KIND_LABEL } from "@features/feed/components/FeedFilterSheet";
import { EMPTY_FEED_FILTER, FeedFilter, FeedQuestionKind } from "@features/feed/services/feedFilters";
import { getTopicsForSubject, QUESTION_SUBJECTS } from "@features/questions/data/questionTaxonomy";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";

export const PRACTICE_TITLE = "Çalışmak istediğini seç";
export const PRACTICE_START_LABEL = "Soruları Başlat";
export const UNRESOLVED_ONLY_LABEL = "Çözemediğim";

// Phase 109 — "filtrelenebilir sorular için çalışma sayfası", as one
// section of Çalış rather than a page: Ders, Konu, Soru türü and the
// "Çözemediğim" source, one CTA. It launches the same question feed with
// that context (feedLaunch.ts) and never renders a question itself.
export function PracticeLauncher() {
  useThemeSubscription();
  const launch = useFeedLaunch();
  const [filter, setFilter] = useState<FeedFilter>(EMPTY_FEED_FILTER);
  const [unresolvedOnly, setUnresolvedOnly] = useState(false);
  const topics = filter.subject ? getTopicsForSubject(filter.subject) : [];

  const start = useCallback(() => {
    launch({ filter, channel: unresolvedOnly ? "struggles" : "for_you" });
  }, [launch, filter, unresolvedOnly]);

  return (
    <View style={styles.wrapper}>
      <Text style={styles.label}>Ders</Text>
      <View style={styles.row}>
        <Chip label="Tümü" selected={filter.subject === null} onPress={() => setFilter({ ...filter, subject: null, topic: null })} />
        {QUESTION_SUBJECTS.map((subject) => (
          <Chip
            key={subject}
            label={subject}
            selected={filter.subject === subject}
            onPress={() => setFilter({ ...filter, subject, topic: null })}
          />
        ))}
      </View>

      {filter.subject ? (
        <>
          <Text style={styles.label}>Konu</Text>
          <View style={styles.row}>
            <Chip label="Tümü" selected={filter.topic === null} onPress={() => setFilter({ ...filter, topic: null })} />
            {topics.map((topic) => (
              <Chip key={topic} label={topic} selected={filter.topic === topic} onPress={() => setFilter({ ...filter, topic })} />
            ))}
          </View>
        </>
      ) : null}

      <Text style={styles.label}>Soru türü</Text>
      <View style={styles.row}>
        <Chip label="Tümü" selected={filter.kind === null} onPress={() => setFilter({ ...filter, kind: null })} />
        {(Object.keys(QUESTION_KIND_LABEL) as FeedQuestionKind[]).map((kind) => (
          <Chip
            key={kind}
            label={QUESTION_KIND_LABEL[kind]}
            selected={filter.kind === kind}
            onPress={() => setFilter({ ...filter, kind })}
          />
        ))}
      </View>

      <Text style={styles.label}>Kaynak</Text>
      <View style={styles.row}>
        <Chip label="Tüm sorular" selected={!unresolvedOnly} onPress={() => setUnresolvedOnly(false)} />
        <Chip label={UNRESOLVED_ONLY_LABEL} selected={unresolvedOnly} onPress={() => setUnresolvedOnly(true)} />
      </View>

      <PrimaryButton label={PRACTICE_START_LABEL} onPress={start} accessibilityHint="Seçtiğin filtrelerle soru akışını açar" />
    </View>
  );
}

const styles = themedStyles(() => ({
  wrapper: {
    gap: spacing.xs,
  },
  label: {
    ...typography.caption,
    fontWeight: "600",
    color: colors.textSecondary,
    marginTop: spacing.xs,
  },
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.xs,
  },
}));
