import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { useAuth } from "@features/authentication";
import { SemanticDefinition } from "@features/questions/services/semanticDefinition";
import {
  createQuestionRevisionDraft,
  isRevisionDirty,
  isSemanticMappingChanged,
  QuestionRevisionDraft,
  sanitizeQuestionRevision,
  validateQuestionRevision,
} from "@features/questions/services/questionRevision";
import { shouldApplyStaleResponse } from "@features/study/services/staleResponseGuard";
import { useSubmitLock } from "@hooks/useSubmitLock";
import { getQuestionById, QuestionUpdateError, updateQuestion } from "@services/questions/questions";
import { getClassSemanticDefinitions } from "@services/questions/semanticDefinitions";
import { Question } from "@/types/question";

// Phase 86 — the state behind the owner-only revision screen.
//
// WHAT LOADS, AND WHAT DOES NOT
//
// Exactly two reads on open: the question (one document) and the class's
// shared vocabulary (one bounded query, so the semantic picker has something
// to offer). No evidence, no timeline, no events — revision is about the
// authoring state, and nothing about a learner's history is needed to change
// it or is allowed to be changed by it.
//
// AUTHORISATION IS NOT THE ROUTE
//
// A hand-typed URL reaches this hook like any other mount. The question is
// loaded and its ownerId compared to the signed-in user BEFORE any form state
// exists; a non-owner gets `unauthorized` and never sees a field. The service
// repeats the check, and firestore.rules would refuse the write regardless —
// three refusals, none of them the edit button being hidden.
//
// ZERO WRITES UNTIL SAVE
//
// Every keystroke lands in local state. Cancel discards it. Only an explicit
// save calls updateQuestion, once, guarded by the same SubmitLock the composers
// use so a double tap cannot produce two updates.

export type QuestionRevisionStatus =
  | "loading"
  | "missing"
  | "unauthorized"
  | "ready"
  | "saving"
  | "saved";

export function useQuestionRevision(params: { classId: string | undefined; questionId: string | undefined }) {
  const { classId, questionId } = params;
  const { firebaseUser } = useAuth();
  const uid = firebaseUser?.uid;

  const [question, setQuestion] = useState<Question | null>(null);
  const [definitions, setDefinitions] = useState<SemanticDefinition[]>([]);
  const [draft, setDraft] = useState<QuestionRevisionDraft | null>(null);
  const [status, setStatus] = useState<QuestionRevisionStatus>("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  const submitLock = useSubmitLock();

  const load = useCallback(async () => {
    if (!questionId || !uid) {
      setStatus("loading");
      return;
    }
    const requestId = ++requestIdRef.current;
    setStatus("loading");
    setLoadError(null);
    try {
      const [loaded, vocabulary] = await Promise.all([
        getQuestionById(questionId),
        classId ? getClassSemanticDefinitions(classId) : Promise.resolve([]),
      ]);
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      if (!loaded) {
        setStatus("missing");
        return;
      }
      // The gate. Compared here, before a single field is rendered.
      if (loaded.ownerId !== uid) {
        setQuestion(loaded);
        setStatus("unauthorized");
        return;
      }
      setQuestion(loaded);
      setDefinitions(vocabulary);
      setDraft(createQuestionRevisionDraft(loaded));
      setStatus("ready");
    } catch {
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setLoadError("Soru yüklenemedi.");
      setStatus("missing");
    }
  }, [classId, questionId, uid]);

  useEffect(() => {
    load();
  }, [load]);

  const updateDraft = useCallback((next: (draft: QuestionRevisionDraft) => QuestionRevisionDraft) => {
    setSaveError(null);
    setDraft((current) => (current ? next(current) : current));
  }, []);

  const validationError = useMemo(() => (draft ? validateQuestionRevision(draft) : null), [draft]);
  const isDirty = useMemo(() => Boolean(question && draft && isRevisionDirty(question, draft)), [question, draft]);
  const mappingChanged = useMemo(
    () => Boolean(question && draft && isSemanticMappingChanged(question, draft)),
    [question, draft],
  );

  /** Explicit save. Returns the updated question, or null when nothing was
   *  written (locked, invalid, unchanged, or refused). */
  const save = useCallback(async (): Promise<Question | null> => {
    if (!question || !draft || status !== "ready") return null;
    if (validationError) {
      setSaveError(validationError);
      return null;
    }
    if (!submitLock.acquire()) return null;
    setStatus("saving");
    setSaveError(null);
    try {
      const updated = await updateQuestion(question.id, sanitizeQuestionRevision(draft));
      setQuestion(updated);
      setDraft(createQuestionRevisionDraft(updated));
      setStatus("saved");
      return updated;
    } catch (error) {
      setStatus("ready");
      if (error instanceof QuestionUpdateError) {
        setSaveError(
          error.code === "not-owner"
            ? "Bu soruyu yalnızca yazarı düzenleyebilir."
            : error.code === "not-found"
              ? "Soru artık bulunamıyor."
              : "Kaydetmek için oturum açmış olman gerekir.",
        );
      } else {
        setSaveError("Kaydedilemedi. Bağlantını kontrol edip tekrar dene.");
      }
      return null;
    } finally {
      submitLock.release();
    }
  }, [draft, question, status, submitLock, validationError]);

  return {
    status,
    question,
    definitions,
    draft,
    updateDraft,
    validationError,
    saveError,
    loadError,
    isDirty,
    mappingChanged,
    save,
    retry: load,
  };
}
