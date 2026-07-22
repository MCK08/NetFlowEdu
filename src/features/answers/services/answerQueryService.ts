// Thin re-export: the actual Firestore query lives in
// @services/questions/answers (alongside createAnswer, which already owns
// the answers collection's read/write access) so there's exactly one place
// that knows the answers collection's shape — see CLAUDE.md "never write
// duplicate logic."
export { subscribeToAnswersForQuestion } from "@services/questions/answers";
