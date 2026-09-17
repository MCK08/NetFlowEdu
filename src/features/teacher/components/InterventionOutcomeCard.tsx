import { Text, View } from "react-native";

import { Card } from "@components/ui/Card";
import { StatusLabel } from "@components/ui/StatusLabel";
import { colors } from "@theme/colors";
import { iconSize } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

import {
  InterventionConfidence,
  InterventionEffectiveness,
  InterventionEffectivenessResult,
} from "../services/interventionEffectiveness";
import { interventionEffectivenessGlyph } from "../services/statusGlyphs";

// Phase 44 — the answer to "did the follow-up assignment I created actually
// help?", on the same screen that offers to create one.
//
// Presentational only. Every string below is either a fixed label for a
// closed union or the service's OWN explanation sentence — this component
// computes no verdict, no count and no rate of its own, exactly as
// StudentPerformanceScreen's other cards are pure renderings of
// buildStudentPerformanceSnapshot's output.

interface InterventionOutcomeCardProps {
  result: InterventionEffectivenessResult;
  title: string;
}

// Phase 104 — the words only. The mark beside them comes from
// interventionEffectivenessGlyph, the same vocabulary the screen's trend line
// and the class summary use, so the verdict lines on this screen read as one.
const EFFECTIVENESS_LABEL: Record<InterventionEffectiveness, string> = {
  improved: "İşe yaradı",
  no_change: "Değişiklik yok",
  worsened: "Geriledi",
  // Deliberately not a verdict: there is nothing to claim yet, and the
  // explanation line below says why.
  insufficient_data: "Sonuç için erken",
};

// Names the STRENGTH of the evidence, never a percentage. "low" is only
// ever shown next to the non-verdict above, so it never reads as a weak
// claim about a real result.
const CONFIDENCE_LABEL: Record<InterventionConfidence, string> = {
  high: "güçlü kanıt",
  medium: "sınırlı kanıt",
  low: "yeterli kanıt yok",
};

function effectivenessStyle(effectiveness: InterventionEffectiveness) {
  if (effectiveness === "improved") return styles.headlineSuccess;
  if (effectiveness === "worsened") return styles.headlineDanger;
  return styles.headlineNeutral;
}

export function InterventionOutcomeCard({ result, title }: InterventionOutcomeCardProps) {
  const glyph = interventionEffectivenessGlyph(result.effectiveness);
  return (
    <Card style={styles.card}>
      <Text style={styles.sectionLabel}>Müdahale sonucu</Text>
      <Text style={styles.title} numberOfLines={2}>
        {title}
      </Text>
      {glyph ? (
        <StatusLabel
          icon={glyph.icon}
          tone={glyph.tone}
          size={iconSize.sm}
          textStyle={effectivenessStyle(result.effectiveness)}
        >
          {EFFECTIVENESS_LABEL[result.effectiveness]}
        </StatusLabel>
      ) : (
        <Text style={effectivenessStyle(result.effectiveness)}>
          {EFFECTIVENESS_LABEL[result.effectiveness]}
        </Text>
      )}
      <Text style={styles.bodyText}>{result.explanation}</Text>
      <View style={styles.evidenceRow}>
        <Text style={styles.bodyTextMuted}>
          Müdahaleden sonra {result.reviewedSinceCount} soru çalışıldı ·{" "}
          {CONFIDENCE_LABEL[result.confidence]}
        </Text>
      </View>
    </Card>
  );
}

const styles = themedStyles(() => ({
  card: {
    gap: spacing.xxs,
  },
  sectionLabel: {
    ...typography.caption,
    color: colors.textTertiary,
    textTransform: "uppercase",
  },
  title: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
  },
  headlineSuccess: {
    ...typography.subtitle,
    color: colors.success,
  },
  headlineDanger: {
    ...typography.subtitle,
    color: colors.danger,
  },
  headlineNeutral: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
  bodyText: {
    ...typography.body,
    color: colors.textPrimary,
  },
  bodyTextMuted: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  evidenceRow: {
    marginTop: spacing.xxs,
  },
}));
