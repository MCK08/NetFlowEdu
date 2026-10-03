import { useCallback, useRef, useState } from "react";

import { updateAssignmentStatus } from "../services/assignmentService";
import { logAssignmentError, PUBLISH_FAILED_MESSAGE } from "../services/assignmentPublishMessages";

// Phase 129 — sending a saved draft, through the write that has always
// existed for it.
//
// updateAssignmentStatus and the firestore.rules update branch have allowed
// draft → published since assignments were introduced; nothing in the app
// ever called them, so a draft could not be sent. This adds no service and no
// rule — it is the one call, guarded so a double tap (or a second confirm
// while the first is in flight) can never publish twice.
//
// The `inFlight` ref is the real guard: state updates are asynchronous, so a
// second press inside the same frame would still see `isPublishing === false`.
export function usePublishAssignment(onPublished: () => Promise<void> | void) {
  const [isPublishing, setIsPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const publish = useCallback(
    async (assignmentId: string): Promise<boolean> => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setIsPublishing(true);
      setError(null);
      try {
        await updateAssignmentStatus(assignmentId, "published");
        // The detail re-reads the document: the badge, the response summary
        // and "Yanıtları İncele" come back from what is actually stored, not
        // from an optimistic guess.
        await onPublished();
        return true;
      } catch (err) {
        logAssignmentError("publish", err);
        // The assignment is untouched on failure — it is still the draft the
        // teacher is looking at — so only the message changes.
        setError(PUBLISH_FAILED_MESSAGE);
        return false;
      } finally {
        inFlight.current = false;
        setIsPublishing(false);
      }
    },
    [onPublished],
  );

  return { publish, isPublishing, error };
}
