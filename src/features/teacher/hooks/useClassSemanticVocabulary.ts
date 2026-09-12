import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  SemanticDefinition,
  SemanticDefinitionInput,
} from "@features/questions/services/semanticDefinition";
import { getClassQuestionsPage } from "@services/questions/questions";
import {
  createSemanticDefinition,
  getClassSemanticDefinitions,
  setSemanticDefinitionArchived,
  updateSemanticDefinitionDetails,
} from "@services/questions/semanticDefinitions";
import { shouldApplyStaleResponse } from "@features/study/services/staleResponseGuard";
import { Question } from "@/types/question";

import {
  buildClassSemanticVocabulary,
  ClassSemanticVocabulary,
} from "../services/semanticDefinitionCoverage";

/** One page of the existing class question query. Matches the page size the
 *  class feed already uses, so this reuses a warm, index-backed shape rather
 *  than introducing a second one. */
const QUESTION_PAGE_SIZE = 30;

/** How many pages the inventory will walk before it stops and says so.
 *
 *  300 questions is a large class library and four sequential bounded reads.
 *  Beyond it the vocabulary screen reports its counts as "yüklenen sorularda"
 *  rather than pretending to a lifetime total — a bounded read that describes
 *  itself honestly is better than an unbounded one that is cheap until the day
 *  it is not. */
export const MAX_INVENTORY_PAGES = 10;
export const MAX_INVENTORY_QUESTIONS = QUESTION_PAGE_SIZE * MAX_INVENTORY_PAGES;

// Phase 82 — one class's shared vocabulary plus where it is used.
//
// COST, stated exactly:
//   1 read  — the class's whole vocabulary, bounded at
//             MAX_CLASS_SEMANTIC_DEFINITIONS, through Phase 80's own service.
//   <= 10   — sequential pages of the EXISTING getClassQuestionsPage query,
//             which already has its composite index and is the same path the
//             class question list uses. Stops early the moment a page is short.
//
// There is no query per definition, no query per question, no listener and no
// polling. Coverage is derived in memory from those two reads, and nothing
// about it is persisted: a stored coverage count would be a second source of
// truth that goes stale the moment anyone edits a question.
//
// MUTATIONS are explicit and singular. Renaming writes one definition document.
// Archiving writes one. Neither touches a question, an event, a cohort or any
// other student record — see updateSemanticDefinitionDetails for why no
// backfill exists.
export function useClassSemanticVocabulary(classId: string | undefined) {
  const [definitions, setDefinitions] = useState<SemanticDefinition[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isBounded, setIsBounded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);

  const load = useCallback(async () => {
    if (!classId) {
      setDefinitions([]);
      setQuestions([]);
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      // The vocabulary and the first page are independent, so they go together.
      const [loadedDefinitions, firstPage] = await Promise.all([
        getClassSemanticDefinitions(classId),
        getClassQuestionsPage(classId, QUESTION_PAGE_SIZE, null),
      ]);

      const collected: Question[] = [...firstPage.questions];
      let cursor = firstPage.cursor;
      let hasMore = firstPage.hasMore;
      let pages = 1;

      // Sequential by necessity: each page needs the previous page's cursor.
      // Bounded by MAX_INVENTORY_PAGES so a very large library costs a known
      // number of reads instead of an open-ended walk.
      while (hasMore && cursor && pages < MAX_INVENTORY_PAGES) {
        const page = await getClassQuestionsPage(classId, QUESTION_PAGE_SIZE, cursor);
        collected.push(...page.questions);
        cursor = page.cursor;
        hasMore = page.hasMore;
        pages += 1;
      }

      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setDefinitions(loadedDefinitions);
      setQuestions(collected);
      // Bounded only when the walk stopped with pages still outstanding.
      setIsBounded(hasMore);
    } catch {
      if (!shouldApplyStaleResponse(requestId, requestIdRef.current)) return;
      setDefinitions([]);
      setQuestions([]);
      setError("Ortak etiketler yüklenemedi.");
    } finally {
      if (shouldApplyStaleResponse(requestId, requestIdRef.current)) setIsLoading(false);
    }
  }, [classId]);

  useEffect(() => {
    load();
  }, [load]);

  const vocabulary: ClassSemanticVocabulary = useMemo(
    () =>
      buildClassSemanticVocabulary({
        classId: classId ?? "",
        definitions,
        questions,
        isBounded,
      }),
    [classId, definitions, questions, isBounded],
  );

  /** Rename and/or re-describe. One write, then the local row is updated in
   *  place — the id never changes, so there is nothing to re-key and no reason
   *  to re-read the whole vocabulary. */
  const rename = useCallback(
    async (definitionId: string, label: string, description: string | null) => {
      if (!classId) return false;
      const ok = await updateSemanticDefinitionDetails({
        classId,
        definitionId,
        label,
        description,
      });
      if (!ok) return false;
      const trimmed = label.trim();
      const trimmedDescription = description?.trim() ?? "";
      setDefinitions((current) =>
        current.map((definition) =>
          definition.id === definitionId
            ? {
                ...definition,
                label: trimmed,
                description: trimmedDescription.length > 0 ? trimmedDescription : null,
                updatedAt: Date.now(),
              }
            : definition,
        ),
      );
      return true;
    },
    [classId],
  );

  /** Retire or restore. One write, same document id in both directions. */
  const setArchived = useCallback(
    async (definitionId: string, archived: boolean) => {
      if (!classId) return;
      await setSemanticDefinitionArchived(classId, definitionId, archived);
      setDefinitions((current) =>
        current.map((definition) =>
          definition.id === definitionId
            ? { ...definition, archived, updatedAt: Date.now() }
            : definition,
        ),
      );
    },
    [classId],
  );

  /** Creation goes through Phase 80's own service — the same one the composer
   *  uses. A second creation path could diverge on what a legal definition is,
   *  and that divergence would be invisible until two of them disagreed. */
  const create = useCallback(
    async (createdBy: string, input: SemanticDefinitionInput) => {
      if (!classId) return null;
      const created = await createSemanticDefinition({ classId, createdBy, input });
      if (created) setDefinitions((current) => [...current, created]);
      return created;
    },
    [classId],
  );

  /** The loaded questions by id, so the detail pane can name the questions a
   *  label is used in without a second read. */
  const questionsById = useMemo(() => {
    const map = new Map<string, Question>();
    for (const question of questions) map.set(question.id, question);
    return map;
  }, [questions]);

  return {
    vocabulary,
    questionsById,
    isLoading,
    error,
    refresh: load,
    rename,
    setArchived,
    create,
  };
}
