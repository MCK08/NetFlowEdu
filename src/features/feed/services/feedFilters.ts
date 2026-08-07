import { Question } from "@/types/question";

// Phase 21 — Ana Akış filtering.
//
// Deliberately CLIENT-SIDE, filtering the questions the existing cursor
// query already loaded, rather than adding subject/gradeLevel/topic `where`
// clauses to the server query. Every one of the up to 8 combinations
// (subject alone, subject+grade, subject+topic, all three, grade alone,
// ...) would each need its OWN Firestore composite index (equality filters
// combined with `orderBy(createdAt)` always do — the exact reasoning
// getClassQuestionsPage's own doc comment already documents for a single
// extra field). Declaring and deploying eight new composite indexes for a
// dropdown-only filter is the "composite index patlaması" this phase's own
// spec explicitly warns against, and this session deploys nothing anyway —
// so this is the safe choice, not a shortcut.
//
// Because filtering happens at "which of the already-fetched questions
// become feed items" and never touches useSocialFeed's fetch/cursor logic
// itself, cursor pagination, dedupe, refresh, and prepend all keep working
// completely unchanged underneath a filter — FeedScreen just narrows what
// it hands to useInterleavedStudyFeed, which already knows how to
// reconcile an arbitrary change to its `questions` input (Phase 20).

export interface FeedFilter {
  subject: string | null;
  gradeLevel: string | null;
  topic: string | null;
}

export const EMPTY_FEED_FILTER: FeedFilter = { subject: null, gradeLevel: null, topic: null };

export function isFeedFilterActive(filter: FeedFilter): boolean {
  return filter.subject !== null || filter.gradeLevel !== null || filter.topic !== null;
}

export function activeFeedFilterCount(filter: FeedFilter): number {
  return [filter.subject, filter.gradeLevel, filter.topic].filter((value) => value !== null).length;
}

// A stable string identity for a filter's CONTENT — two filters that pick
// the same values produce the same key regardless of object identity. Used
// to detect "the filter actually changed" (as opposed to "the filter
// object was merely recreated"), e.g. to reset a feed session.
export function feedFilterKey(filter: FeedFilter): string {
  return `${filter.subject ?? ""}|${filter.gradeLevel ?? ""}|${filter.topic ?? ""}`;
}

// AND-combines every active filter field; a null field never excludes
// anything. Comparison is exact-match only (dropdown selection, not free
// text search — out of scope for this phase by design).
export function matchesFeedFilter(question: Question, filter: FeedFilter): boolean {
  if (filter.subject !== null && question.subject !== filter.subject) return false;
  if (filter.gradeLevel !== null && question.gradeLevel !== filter.gradeLevel) return false;
  if (filter.topic !== null && question.topic !== filter.topic) return false;
  return true;
}

export function filterQuestions(questions: Question[], filter: FeedFilter): Question[] {
  if (!isFeedFilterActive(filter)) return questions;
  return questions.filter((question) => matchesFeedFilter(question, filter));
}
