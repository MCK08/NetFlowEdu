import { useCallback, useEffect, useRef, useState } from "react";

import { resolveQuestionMetadata } from "@features/study/services/studyMetadataCache";

import { getRecentLearningEvents } from "../services/learningEventService";
import { LearningEvent } from "../services/learningTrail";

// Phase 59 — the student's own recent chronological history, ready to render.
//
// COST: ONE bounded Firestore query (see getRecentLearningEvents' limit), plus
// the SHARED question-metadata cache the Study Hub and the feed already
// populate — subject/topic are joined from it rather than denormalized onto
// the event, so this adds no per-event read.
//
// FAILURE POSTURE (§62): a failure here is non-fatal by design. `events`
// simply stays empty, and Learning Story falls back to its Phase 56 evidence
// bar — a timeline error must never take down a screen whose cumulative story
// is still perfectly valid.
export function useLearningTrail(uid: string | undefined) {
  const [events, setEvents] = useState<LearningEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const requestIdRef = useRef(0);
  const activeUidRef = useRef(uid);
  activeUidRef.current = uid;

  const load = useCallback(async () => {
    if (!uid) {
      setEvents([]);
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);

    try {
      const stored = await getRecentLearningEvents(uid);
      const metadata = await resolveQuestionMetadata(stored.map((event) => event.questionId));
      if (requestIdRef.current !== requestId || activeUidRef.current !== uid) return;

      setEvents(
        stored.map((event) => {
          const question = metadata.get(event.questionId) ?? null;
          return {
            id: event.id,
            questionId: event.questionId,
            outcome: event.outcome,
            occurredAt: event.occurredAt,
            // "" for a question whose metadata cannot be resolved — the same
            // legacy convention learningInsights.ts uses. selectTopicTrail
            // refuses to match on an empty subject/topic, so such an event
            // can never contaminate a real topic's trail.
            subject: question?.subject ?? "",
            topic: question?.topic ?? "",
          };
        }),
      );
    } catch {
      if (requestIdRef.current !== requestId) return;
      // Deliberately silent: see the failure posture note above.
      setEvents([]);
    } finally {
      if (requestIdRef.current === requestId) setIsLoading(false);
    }
  }, [uid]);

  useEffect(() => {
    load();
  }, [load]);

  return { events, isLoading, refresh: load };
}
