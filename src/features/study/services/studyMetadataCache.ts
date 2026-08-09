import { getQuestionById } from "@services/questions/questions";
import { Question } from "@/types/question";

// Phase 22 — resolves subject/topic metadata for the Learning Hub's insight
// computation, and (Phase 22 performance gate) is now ALSO what
// resolveQueueEntries below uses for the due-queue/review-session question
// join — one shared cache for every place in the study feature that needs
// a Question by id, so the same question fetched from two different
// screens in one session costs one Firestore read, not two.
//
// A BATCHED `documentId() in [...]` query was considered and EMPIRICALLY
// DISPROVEN against the real rules emulator (Phase 22 performance gate
// audit), not just inferred: a batch where every document shares one
// visibility (e.g. all public) succeeds, but a batch mixing even ONE
// document the caller cannot read (a private question they don't own, a
// class they're not a member of) makes Firestore reject the WHOLE query
// with an evaluation error — no partial results, nothing to catch per-item.
// Since a student's real study items span public/private/class questions
// interchangeably, a general-purpose batched fetch here would be a
// correctness regression (a single revoked/deleted question could blank
// out the entire Hub), not just an optimization risk. getQuestionById's
// single-document read has no such failure mode — a missing/denied
// question fails alone, cached as null, exactly like resolveQueueEntries's
// original per-item try/catch did.
//
// Module-level (not per-hook-instance) so the cache is shared across every
// screen that resolves question metadata in one app session, and survives
// a Learning Hub remount (e.g. tab switch).

const cache = new Map<string, Question | null>();
const pending = new Map<string, Promise<Question | null>>();

async function fetchAndCache(questionId: string): Promise<Question | null> {
  const existing = pending.get(questionId);
  if (existing) return existing;

  const fetchPromise = getQuestionById(questionId)
    .then((question) => {
      // Cached even when null: a question that's gone (deleted, or access
      // revoked) stays gone for the rest of this session — matches
      // resolveQueueEntries's "permission-denied and not-found both mean
      // gone" treatment, and avoids retrying a fetch that can only fail
      // the same way again.
      cache.set(questionId, question);
      pending.delete(questionId);
      return question;
    })
    .catch(() => {
      cache.set(questionId, null);
      pending.delete(questionId);
      return null;
    });

  pending.set(questionId, fetchPromise);
  return fetchPromise;
}

/**
 * Resolves a batch of question IDs to their metadata, in parallel, reusing
 * the shared cache. Duplicate IDs in `questionIds` are fetched at most once
 * (both via the cache and via the in-flight de-dup above).
 */
export async function resolveQuestionMetadata(
  questionIds: readonly string[],
): Promise<Map<string, Question | null>> {
  const uniqueIds = [...new Set(questionIds)];
  const results = await Promise.all(
    uniqueIds.map(async (id) => {
      if (cache.has(id)) return [id, cache.get(id) ?? null] as const;
      return [id, await fetchAndCache(id)] as const;
    }),
  );
  return new Map(results);
}

// Test-only escape hatch — the module-level cache would otherwise leak
// state between test cases. Mirrors profileCacheService.ts's
// clearProfileCache for the same reason.
export function clearStudyMetadataCache(): void {
  cache.clear();
  pending.clear();
}
