import { useCallback, useEffect, useRef, useState } from "react";

import {
  EMPTY_SUMMARY,
  getDueStudyItemsPage,
  resolveQueueEntries,
  ResolvedQueueEntry,
  StudySummary,
  subscribeToStudySummary,
} from "../services/studyService";
import { mapStudyErrorToMessage } from "../services/studyErrorMapper";

// Loads the due-review queue and the progress summary for one student.
//
// The queue is a plain getDocs (no listener) — it's a point-in-time working
// set, and re-querying on pull-to-refresh is both cheaper and less
// surprising than a live list that reshuffles under the user's finger. The
// summary IS live (one small document), so streak/goal update instantly
// after each review.
export function useStudyQueue(uid: string | undefined) {
  const [entries, setEntries] = useState<ResolvedQueueEntry[]>([]);
  const [summary, setSummary] = useState<StudySummary>(EMPTY_SUMMARY);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Guards a slow response from a superseded load overwriting a newer one.
  const requestIdRef = useRef(0);
  const activeUidRef = useRef(uid);
  activeUidRef.current = uid;

  const load = useCallback(
    async (mode: "initial" | "refresh") => {
      if (!uid) {
        setEntries([]);
        setIsLoading(false);
        return;
      }
      const requestId = ++requestIdRef.current;
      if (mode === "initial") setIsLoading(true);
      else setIsRefreshing(true);
      setError(null);

      try {
        // The dashboard shows the FIRST page only — it is a preview of what
        // is due, not the working session. Paging through the whole queue is
        // the review session's job (see useReviewSession).
        const page = await getDueStudyItemsPage(uid, Date.now());
        const resolved = await resolveQueueEntries(page.items);
        if (requestIdRef.current !== requestId || activeUidRef.current !== uid) return;
        setEntries(resolved);
      } catch (err) {
        if (requestIdRef.current !== requestId || activeUidRef.current !== uid) return;
        setError(mapStudyErrorToMessage(err));
      } finally {
        if (requestIdRef.current === requestId) {
          setIsLoading(false);
          setIsRefreshing(false);
        }
      }
    },
    [uid],
  );

  useEffect(() => {
    load("initial");
  }, [load]);

  useEffect(() => {
    if (!uid) {
      setSummary(EMPTY_SUMMARY);
      return;
    }
    return subscribeToStudySummary(uid, setSummary);
  }, [uid]);

  const refresh = useCallback(() => load("refresh"), [load]);

  // Removes one card from the working set after it's been reviewed. The
  // server has already rescheduled it; re-querying immediately would just
  // fetch a list that no longer contains it anyway.
  const dismiss = useCallback((questionId: string) => {
    setEntries((prev) => prev.filter((e) => e.item.questionId !== questionId));
  }, []);

  return { entries, summary, isLoading, isRefreshing, error, refresh, dismiss };
}
