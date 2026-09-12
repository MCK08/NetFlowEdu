import { Ionicons } from "@expo/vector-icons";
import { memo, useCallback } from "react";
import { Pressable, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { iconSize, minTouchTarget } from "@theme/sizes";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { useThemeSubscription } from "@theme/ThemeProvider";
import { typography } from "@theme/typography";
import { joinSpokenLabel } from "@utils/spokenLabel";

import {
  coverageStatusLabel,
  coverageUsageLine,
  SemanticDefinitionCoverage,
} from "../services/semanticDefinitionCoverage";

// Phase 82 — one label in the class's shared vocabulary.
//
// Deliberately quiet. This is authoring infrastructure, so the row carries a
// name, a scope, a usage count and a state — and nothing that looks like a
// verdict. There is no score, no percentage, no colour-coded quality and no
// warning triangle, because a label used once is not worse than one used nine
// times; it is a label an author needed once.

interface SemanticDefinitionRowProps {
  entry: SemanticDefinitionCoverage;
  isBounded: boolean;
  isSelected: boolean;
  onSelect: (definitionId: string) => void;
}

export const SemanticDefinitionRow = memo(function SemanticDefinitionRow({
  entry,
  isBounded,
  isSelected,
  onSelect,
}: SemanticDefinitionRowProps) {
  useThemeSubscription();
  const select = useCallback(
    () => onSelect(entry.definition.id),
    [entry.definition.id, onSelect],
  );

  const { definition } = entry;
  const usage = coverageUsageLine(entry, isBounded);
  const status = coverageStatusLabel(entry);

  return (
    <Pressable
      onPress={select}
      style={[styles.row, isSelected ? styles.rowSelected : null]}
      accessibilityRole="button"
      // Reading order the phase specifies: label, scope, usage, status, and
      // the duplicate note last. Selection is spoken as state rather than
      // shown only as a tinted border.
      accessibilityLabel={joinSpokenLabel([
        definition.label,
        `${definition.subject}, ${definition.topic}`,
        usage,
        status,
        entry.hasDuplicateLabel ? "Aynı adı taşıyan başka bir etiket var" : null,
      ])}
      accessibilityState={{ selected: isSelected }}
    >
      <View style={styles.body}>
        <View style={styles.titleRow}>
          <Text style={styles.label} numberOfLines={2}>
            {definition.label}
          </Text>
          {/* Archived is told by icon AND word, never by colour alone. */}
          {definition.archived ? (
            <View style={styles.statusTag}>
              <Ionicons
                name="archive-outline"
                size={iconSize.xs}
                color={colors.textSecondary}
              />
              <Text style={styles.statusText}>{status}</Text>
            </View>
          ) : null}
        </View>
        <Text style={styles.scope} numberOfLines={1}>
          {`${definition.subject} · ${definition.topic}`}
        </Text>
        <Text style={styles.usage} numberOfLines={2}>
          {usage}
        </Text>
        {entry.hasDuplicateLabel ? (
          <View style={styles.noteRow}>
            <Ionicons
              name="copy-outline"
              size={iconSize.xs}
              color={colors.textSecondary}
            />
            <Text style={styles.note} numberOfLines={2}>
              Aynı adı taşıyan başka bir etiket var
            </Text>
          </View>
        ) : null}
      </View>
      <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textTertiary} />
    </Pressable>
  );
});

const styles = themedStyles(() => ({
  row: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.sm,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    minHeight: minTouchTarget,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  body: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xs,
  },
  label: {
    ...typography.bodyStrong,
    color: colors.textPrimary,
    flexShrink: 1,
  },
  statusTag: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: spacing.xxs,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.pill,
    backgroundColor: colors.surfaceMuted,
  },
  statusText: {
    ...typography.label,
    color: colors.textSecondary,
  },
  scope: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  usage: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  noteRow: {
    flexDirection: "row" as const,
    alignItems: "flex-start" as const,
    gap: spacing.xxs,
    marginTop: 2,
  },
  note: {
    ...typography.caption,
    color: colors.textSecondary,
    flex: 1,
  },
}));
