import { Ionicons } from "@expo/vector-icons";
import { Text, View } from "react-native";

import { AnimatedPressable } from "@components/ui/AnimatedPressable";
import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { minTouchTarget } from "@theme/sizes";
import { themedStyles } from "@theme/themeRuntime";

import { IntendedRole } from "../types";
import { ROLE_OPTIONS, ROLE_SELECTION_NOTE } from "../services/rolePresentation";

interface RoleSelectorProps {
  value: IntendedRole | null;
  onChange: (role: IntendedRole) => void;
  errorMessage?: string;
  disabled?: boolean;
}

// The single role picker, shared by RegisterScreen and
// GoogleOnboardingScreen. Both previously carried their own near-identical
// copy of this JSX plus its own hardcoded-hex StyleSheet — two places to
// fix any accessibility or wording problem, and they had already drifted.
//
// Selection is NOT signalled by colour alone: the chosen card also gets a
// filled check icon and a heavier border, so it survives greyscale,
// low-contrast displays and colour-blind users.
export function RoleSelector({ value, onChange, errorMessage, disabled }: RoleSelectorProps) {
  return (
    <View style={styles.container} accessibilityRole="radiogroup">
      <View style={styles.cards}>
        {ROLE_OPTIONS.map((option) => {
          const selected = value === option.value;
          return (
            <AnimatedPressable
              key={option.value}
              onPress={() => onChange(option.value)}
              disabled={disabled}
              style={[styles.card, selected ? styles.cardSelected : null]}
              accessibilityRole="radio"
              accessibilityState={{ selected, disabled: Boolean(disabled) }}
              accessibilityLabel={option.accessibilityLabel}
            >
              <View style={styles.cardHeader}>
                <Text style={[styles.cardTitle, selected ? styles.cardTitleSelected : null]}>
                  {option.title}
                </Text>
                <Ionicons
                  name={selected ? "checkmark-circle" : "ellipse-outline"}
                  size={20}
                  color={selected ? colors.primary : colors.textTertiary}
                />
              </View>
              <Text style={styles.cardDescription}>{option.description}</Text>
            </AnimatedPressable>
          );
        })}
      </View>

      {errorMessage ? (
        <Text style={styles.errorText} accessibilityLiveRegion="polite">
          {errorMessage}
        </Text>
      ) : (
        <Text style={styles.note}>{ROLE_SELECTION_NOTE}</Text>
      )}
    </View>
  );
}

const styles = themedStyles(() => ({
  container: {
    gap: spacing.xs,
  },
  cards: {
    gap: spacing.xs,
  },
  card: {
    // Column, not the previous side-by-side row: two cards sharing a row
    // could not fit a title AND a description on a compact Android width
    // without truncating one of them.
    minHeight: minTouchTarget,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.sm,
    gap: spacing.xxs,
    backgroundColor: colors.background,
  },
  cardSelected: {
    borderColor: colors.primary,
    backgroundColor: colors.primaryMuted,
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  cardTitle: {
    ...typography.subtitle,
    color: colors.textPrimary,
    flex: 1,
  },
  cardTitleSelected: {
    color: colors.primary,
  },
  cardDescription: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  note: {
    ...typography.caption,
    color: colors.textTertiary,
  },
  errorText: {
    ...typography.caption,
    color: colors.danger,
  },
}));
