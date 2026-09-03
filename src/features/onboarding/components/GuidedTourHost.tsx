import { GuidedTourOverlay } from "./GuidedTourOverlay";
import { useGuidedTour } from "../hooks/useGuidedTour";

// Phase 74 — mounts the tour above the navigator, next to the account
// switcher and the offline banner in app/_layout.tsx.
//
// Rendering nothing until the gate says otherwise is the whole point: the app
// below has already routed and is fully interactive, so a device that cannot
// read local storage, an admin account, or anyone who has seen the tour simply
// never pays for it. Nothing about navigation, the student feed's pager, or
// any screen's own state is involved.
export function GuidedTourHost() {
  const tour = useGuidedTour();
  if (!tour || tour.presentation.kind !== "visible") return null;

  return (
    <GuidedTourOverlay
      steps={tour.presentation.steps}
      stepIndex={tour.stepIndex}
      onAdvance={tour.advance}
      onSkip={tour.dismiss}
    />
  );
}
