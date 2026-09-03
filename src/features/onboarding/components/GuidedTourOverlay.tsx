import { Pressable, StyleSheet, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { BrandLockup } from "@components/ui/BrandMark";
import { PrimaryButton } from "@components/ui/PrimaryButton";
import { StepTrack } from "@components/ui/StepTrack";
import { colors } from "@theme/colors";
import { contentWidth } from "@theme/layout";
import { radius } from "@theme/radius";
import { spacing } from "@theme/spacing";
import { themedStyles } from "@theme/themeRuntime";
import { typography } from "@theme/typography";
import { useThemeSubscription } from "@theme/ThemeProvider";

import { GuidedTourStep, guidedTourActionLabel } from "../services/guidedTour";

interface GuidedTourOverlayProps {
  steps: readonly GuidedTourStep[];
  stepIndex: number;
  onAdvance: () => void;
  onSkip: () => void;
}

// Phase 74 — first-use orientation, rendered OVER the routed screen rather
// than as a route of its own (see resolveGuidedTourPresentation for why).
//
// Deliberately not a marketing splash. One card, the product's own surface and
// type tokens, and the same segmented step bar the account-onboarding flow
// uses — this should read as the app introducing itself, not as a slideshow
// bolted on in front of it. The logo appears here because §44 is one of the
// few places it earns prominence; it is still the standard lockup at the
// standard size, not a hero treatment.
export function GuidedTourOverlay({
  steps,
  stepIndex,
  onAdvance,
  onSkip,
}: GuidedTourOverlayProps) {
  useThemeSubscription();

  const step = steps[stepIndex];
  if (!step) return null;

  const counter = `${stepIndex + 1} / ${steps.length}`;

  return (
    // Opaque, not a translucent scrim: the screen underneath is a real working
    // surface (the feed), and letting it show through would make the intro
    // read as a dismissible ad over live content rather than as the app's
    // first screen.
    <View
      style={styles.backdrop}
      // The routed screen is still mounted underneath — it has to be, so that
      // finishing the tour reveals a live app rather than a cold mount. That
      // means it also stays in the accessibility tree, where an opaque view
      // over it means nothing: without these two props VoiceOver reads the
      // feed's tabs and cards straight through the introduction, and a web
      // user can Tab into buttons they cannot see.
      accessibilityViewIsModal
      aria-modal
      role="dialog"
      aria-label="NetFlowEdu tanıtımı"
    >
      <SafeAreaView style={styles.safe} edges={["top", "bottom"]}>
        <View style={styles.column}>
          {/* Mark and card travel together as one centred group, with the
              actions pinned below. Anchoring the lockup to the very top
              instead left most of a phone screen empty between the two, which
              read as an unfinished layout rather than a calm one. */}
          <View style={styles.body}>
            <BrandLockup />

            <View style={styles.card}>
              <View style={styles.progress}>
                <Text style={styles.counter}>{counter}</Text>
                <StepTrack total={steps.length} activeIndex={stepIndex} />
              </View>

            {/* One accessible node per card: a screen reader should hear the
                position, the heading and the explanation as one thought,
                rather than three fragments it has to reassemble. */}
              <View
                style={styles.copy}
                accessible
                accessibilityRole="header"
                accessibilityLabel={`Adım ${stepIndex + 1} / ${steps.length}. ${step.title}. ${step.body}`}
              >
                <Text style={styles.title}>{step.title}</Text>
                <Text style={styles.bodyText}>{step.body}</Text>
              </View>
            </View>
          </View>

          <View style={styles.actions}>
            <PrimaryButton
              label={guidedTourActionLabel(stepIndex, steps.length)}
              onPress={onAdvance}
              accessibilityHint={
                guidedTourActionLabel(stepIndex, steps.length) === "Başla"
                  ? "Tanıtımı kapatır ve uygulamayı açar"
                  : "Sonraki tanıtım adımına geçer"
              }
            />
            {/* Always available, on every step. A tour you cannot leave until
                the last card is a tutorial prison — and the skip is the same
                commitment as finishing, so it is never shown again either. */}
            <Pressable
              onPress={onSkip}
              style={styles.skip}
              accessibilityRole="button"
              accessibilityLabel="Tanıtımı atla"
              accessibilityHint="Tanıtımı kapatır. Profil ekranından tekrar açabilirsin."
            >
              <Text style={styles.skipLabel}>Atla</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = themedStyles(() => ({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: colors.background,
  },
  safe: {
    flex: 1,
  },
  column: {
    flex: 1,
    width: "100%",
    // Narrow measure on purpose: this is three short paragraphs, and letting
    // them run the full width of a desktop window is exactly the stretched
    // layout the rest of this phase is capping.
    maxWidth: contentWidth.form,
    alignSelf: "center",
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.xl,
  },
  body: {
    // Grows to take whatever the actions do not, so the group stays centred at
    // any height and nothing clips when the OS font scale enlarges the card.
    flex: 1,
    justifyContent: "center",
    gap: spacing.xl,
  },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  progress: {
    gap: spacing.xs,
  },
  counter: {
    ...typography.label,
    color: colors.primary,
    letterSpacing: 0.5,
  },
  copy: {
    gap: spacing.xs,
  },
  title: {
    ...typography.screenTitle,
    color: colors.textPrimary,
  },
  bodyText: {
    ...typography.body,
    color: colors.textSecondary,
  },
  actions: {
    gap: spacing.xs,
  },
  skip: {
    minHeight: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  skipLabel: {
    ...typography.subtitle,
    color: colors.textSecondary,
  },
}));
