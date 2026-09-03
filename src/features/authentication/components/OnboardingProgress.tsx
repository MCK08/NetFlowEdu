import { Text, View } from "react-native";

import { StepTrack } from "@components/ui/StepTrack";
import { colors } from "@theme/colors";
import { spacing } from "@theme/spacing";
import { typography } from "@theme/typography";
import { themedStyles } from "@theme/themeRuntime";

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
      {/* Filled up to AND including the current step — a bar that leaves the
          step you are on empty reads as "not started yet". Phase 74 moved the
          bar itself to StepTrack so the guided tour renders the same one. */}
      <StepTrack total={steps.length} activeIndex={activeIndex} />
    </View>
  );
}

const styles = themedStyles(() => ({
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
}));
