import { useCallback, useEffect, useRef, useState } from "react";

import {
  createSemanticDefinition,
  getClassSemanticDefinitions,
} from "@services/questions/semanticDefinitions";

import {
  SemanticDefinition,
  SemanticDefinitionInput,
} from "../services/semanticDefinition";

// Phase 80 — one class's shared vocabulary, for the composer that is authoring
// into that class.
//
// COST: exactly ONE bounded read, and only when `enabled` — which the callers
// set to "this is a class question and the composer is open". A private or
// public question has no shared scope and therefore never triggers it, and no
// screen pays for a vocabulary it will not offer.
//
// Deliberately one-shot rather than a listener. A vocabulary changes when a
// teacher decides to add to it, a handful of times ever; a live subscription
// would hold a connection open on every composer to observe almost nothing.
// A definition created here is spliced into local state so it is immediately
// selectable without re-reading.
//
// FAILURE POSTURE: non-fatal. A vocabulary that fails to load leaves the list
// empty, the picker offers only "new label", and authoring is otherwise
// completely unchanged — a shared label is an optional refinement, never a
// precondition for writing a question.
export function useClassSemanticDefinitions(classId: string | undefined, enabled: boolean) {
  const [definitions, setDefinitions] = useState<SemanticDefinition[]>([]);
  const requestIdRef = useRef(0);
  const activeClassRef = useRef(classId);
  activeClassRef.current = classId;

  useEffect(() => {
    if (!classId || !enabled) {
      setDefinitions([]);
      return;
    }
    const requestId = ++requestIdRef.current;
    getClassSemanticDefinitions(classId)
      .then((loaded) => {
        // Guarded on BOTH: a slow response for a class the teacher has since
        // navigated away from must never paint over the current one.
        if (requestIdRef.current !== requestId || activeClassRef.current !== classId) return;
        setDefinitions(loaded);
      })
      .catch(() => {
        if (requestIdRef.current !== requestId) return;
        setDefinitions([]);
      });
  }, [classId, enabled]);

  const create = useCallback(
    async (createdBy: string, input: SemanticDefinitionInput) => {
      if (!classId) return null;
      const created = await createSemanticDefinition({ classId, createdBy, input });
      // Spliced in rather than re-read: the author is looking at this list and
      // expects the label they just typed to be selectable immediately.
      if (created) setDefinitions((current) => [...current, created]);
      return created;
    },
    [classId],
  );

  return { definitions, create };
}
