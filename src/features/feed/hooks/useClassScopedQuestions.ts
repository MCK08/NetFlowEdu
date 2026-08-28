import { useCallback, useEffect, useRef, useState } from "react";

import { getClassQuestionsPage } from "@services/questions/questions";
import { Question } from "@/types/question";

// Phase 50 — the class-scoped side of "Derslerim" (student) and "Sınıfım"
// (teacher).
//
// READ COST (§24)
//
// ONE bounded query per class the caller is already a member of, run once
// when the channel is first opened — never one query per card, and never a
// per-student fan-out. A user belongs to a handful of classes in practice,
// and the page size below caps each one, so the whole channel is a small,
// fixed number of reads regardless of how far the feed is scrolled.
//
// This deliberately reuses getClassQuestionsPage rather than adding a
// classId filter to the main feed query: that function's exact query shape
// (classId + visibility == 'class') is the one firestore.rules can
// statically prove readable for a class member — see its own doc comment
// and the rules' canReadQuestionData. Querying any other way would need a
// rules change, which §50 forbids.
const CLASS_PAGE_SIZE = 20;

export function useClassScopedQuestions(classIds: readonly string[], enabled: boolean) {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const requestIdRef = useRef(0);
  // Joined so the effect below re-runs on real membership changes, not on
  // every re-render that happens to rebuild the array identity.
  const classKey = classIds.join(",");

  const load = useCallback(async () => {
    if (!enabled || classIds.length === 0) {
      setQuestions([]);
      setIsLoading(false);
      return;
    }
    const requestId = ++requestIdRef.current;
    setIsLoading(true);
    setError(null);

    try {
      const pages = await Promise.all(
        classIds.map((classId) => getClassQuestionsPage(classId, CLASS_PAGE_SIZE, null)),
      );
      if (requestIdRef.current !== requestId) return;

      // Deduped across classes (a question belongs to exactly one class, so
      // this is belt-and-braces) and sorted newest-first, which is the same
      // ordering every other question surface in the app presents.
      const seen = new Set<string>();
      const merged: Question[] = [];
      for (const page of pages) {
        for (const question of page.questions) {
          if (seen.has(question.id)) continue;
          seen.add(question.id);
          merged.push(question);
        }
      }
      merged.sort((a, b) => b.createdAt - a.createdAt);
      setQuestions(merged);
    } catch {
      if (requestIdRef.current !== requestId) return;
      setError("İçerik yüklenemedi.");
    } finally {
      if (requestIdRef.current === requestId) setIsLoading(false);
    }
    // classKey stands in for classIds' contents — see its own note above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [classKey, enabled]);

  useEffect(() => {
    load();
  }, [load]);

  return { questions, isLoading, error, refresh: load };
}
