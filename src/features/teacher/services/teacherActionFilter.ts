import {
  actionCenterKindLabel,
  TeacherActionCenterItem,
  TeacherActionCenterKind,
} from "./teacherActionCenter";

// Phase 121 — narrowing the Action Center's list, and nothing else.
//
// WHAT THIS IS NOT
//
// It is not a second opinion about which actions exist, how important they
// are, or what order they belong in. Every function here takes the canonical
// list and returns a SUBSET OF IT IN ITS OWN ORDER. There is no score, no
// ranking, no re-sort and no category of its own: the only categories are the
// four kinds the Action Center already builds, under the labels it already
// prints on each row.
//
// WHY THE MOCKUP'S THREE CHIPS BECAME FOUR
//
// The Phase 121 mockup offers Tümü / Takip / Müdahale / İzleme — which maps
// to follow_up, prepare_intervention and review_student, and silently leaves
// out `escalate`. That is the kind a teacher would most regret missing (a
// Phase 47 regression with real evidence behind it), and a chip row covering
// three of four kinds would hide it behind "Tümü" without saying so. So the
// chips are one per kind ACTUALLY PRESENT in the loaded list, named by the
// canonical label, and a kind with no actions gets no chip rather than a
// chip that leads to an empty page.
//
// EVERYTHING IS LOCAL
//
// Both the kind filter and the query run over the list already in memory.
// Neither reads, queries or fetches anything.

/** The "no filter" option. Not a kind — a kind would have to mean something. */
export const ACTION_FILTER_ALL = "all";

export type ActionFilterValue = typeof ACTION_FILTER_ALL | TeacherActionCenterKind;

export interface ActionFilter {
  kind: ActionFilterValue;
  /** Raw text from the search field; trimmed and folded here, not by callers. */
  query: string;
}

export const EMPTY_ACTION_FILTER: ActionFilter = { kind: ACTION_FILTER_ALL, query: "" };

export const ACTION_FILTER_ALL_LABEL = "Tümü";

/** Phase 121 — distinct from ACTION_CENTER_EMPTY_COPY on purpose. "There are
 *  no actions" and "none of the actions match what you typed" are different
 *  facts, and a filter that reports the first one is lying about the class. */
export const ACTION_FILTER_NO_MATCH =
  "Bu filtreyle eşleşen aksiyon yok. Filtreyi temizleyip tüm aksiyonları görebilirsin.";

export function actionFilterLabel(value: ActionFilterValue): string {
  return value === ACTION_FILTER_ALL ? ACTION_FILTER_ALL_LABEL : actionCenterKindLabel(value);
}

/** "Tümü", then one chip per kind the list actually contains, in the order
 *  the canonical list already puts those kinds in — so the chips read left to
 *  right in the same precedence the rows read top to bottom. */
export function actionFilterOptions(items: readonly TeacherActionCenterItem[]): ActionFilterValue[] {
  const seen: TeacherActionCenterKind[] = [];
  for (const item of items) {
    if (!seen.includes(item.kind)) seen.push(item.kind);
  }
  // One kind is not a choice: a single chip beside "Tümü" would select the
  // whole list under a second name.
  if (seen.length < 2) return [];
  return [ACTION_FILTER_ALL, ...seen];
}

/** Turkish-aware folding, so "izle" finds "İzle" and "ÖĞRENCI" finds
 *  "Öğrenci". toLocaleLowerCase("tr") is what the rest of this codebase uses
 *  wherever Turkish text is compared. */
function fold(value: string): string {
  return value.toLocaleLowerCase("tr").trim();
}

/** Everything a row already shows, and nothing it does not.
 *
 *  Deliberately no uid, no raw history, no private field: a teacher searches
 *  the words in front of them. */
function haystack(item: TeacherActionCenterItem): string {
  return [
    item.title,
    item.topicContext?.subject,
    item.topicContext?.topic,
    item.reason,
    item.evidenceNote,
    actionCenterKindLabel(item.kind),
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

export function actionMatchesQuery(item: TeacherActionCenterItem, query: string): boolean {
  const needle = fold(query);
  if (needle.length === 0) return true;
  return fold(haystack(item)).includes(needle);
}

/** The canonical list, narrowed. Never re-ordered, never re-scored, never
 *  extended: the result is always a subsequence of `items`. */
export function filterActionCenterItems(
  items: readonly TeacherActionCenterItem[],
  filter: ActionFilter,
): TeacherActionCenterItem[] {
  const needle = fold(filter.query);
  const result: TeacherActionCenterItem[] = [];
  for (const item of items) {
    if (filter.kind !== ACTION_FILTER_ALL && item.kind !== filter.kind) continue;
    if (needle.length > 0 && !actionMatchesQuery(item, needle)) continue;
    result.push(item);
  }
  return result;
}

/** Whether anything is being narrowed at all — the difference between "this
 *  class has no actions" and "your filter matched none of them". */
export function isActionFilterActive(filter: ActionFilter): boolean {
  return filter.kind !== ACTION_FILTER_ALL || fold(filter.query).length > 0;
}
