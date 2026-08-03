import { StyleSheet, Text, View } from "react-native";

import { colors } from "@theme/colors";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";

import {
  OnboardingFlow,
  OnboardingStepId,
  stepAccessibilityLabel,
  stepCounterLabel,
  stepIndex,
  stepsForFlow,
} from "../services/onboardingSteps";

interface OnboardingProgressProps {
  flow: OnboardingFlow;
  currentStep: OnboardingStepId;
}

// Presentation only. Every value it shows comes from resolveOnboardingStep,
// which reads real auth/profile state — there is no percentage, no
// synthesized duration, and nothing here decides anything. The server's
// onboardingStatus and the ID token's claims remain the only gates (see
// RouteGuard).
export function OnboardingProgress({ flow, currentStep }: OnboardingProgressProps) {
  const steps = stepsForFlow(flow);
  const activeIndex = stepIndex(flow, currentStep);

  return (
    <View
      style={styles.container}
      accessible
      accessibilityLabel={stepAccessibilityLabel(flow, currentStep)}
    >
      <View style={styles.header}>
        <Text style={styles.counter}>{stepCounterLabel(flow, currentStep)}</Text>
        <Text style={styles.stepName}>{steps[activeIndex]?.label ?? ""}</Text>
      </View>
      <View style={styles.track}>
        {/* Filled up to AND including the current step — a bar that leaves
            the step you are on empty reads as "not started yet". */}
        {steps.map((step, index) => (
          <View
            key={step.id}
            style={[styles.segment, index <= activeIndex ? styles.segmentFilled : null]}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.xxs,
  },
  header: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
    gap: spacing.xs,
  },
  counter: {
    ...typography.label,
    color: colors.primary,
    letterSpacing: 0.5,
    textTransform: "uppercase",
  },
  stepName: {
    ...typography.caption,
    color: colors.textSecondary,
  },
  track: {
    flexDirection: "row",
    gap: spacing.xxs,
  },
  segment: {
    flex: 1,
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: colors.divider,
  },
  segmentFilled: {
    backgroundColor: colors.primary,
  },
});
