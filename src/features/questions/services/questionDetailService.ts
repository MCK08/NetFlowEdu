import { getQuestionById } from "@services/questions/questions";
import { Question } from "@/types/question";

export const QUESTION_NOT_FOUND_MESSAGE = "Bu soru bulunamadı.";
export const QUESTION_UNAUTHORIZED_MESSAGE = "Bu soruyu görüntüleme yetkiniz yok.";
export const QUESTION_GENERIC_ERROR_MESSAGE = "Soru yüklenirken bir hata oluştu.";

/** Why the question is not being shown.
 *
 *  Phase 75 — added so the screen can tell a RECOVERABLE failure from a
 *  settled answer. "Bu soru bulunamadı" and "yetkiniz yok" are conclusions:
 *  offering "Tekrar Dene" on them invites the reader to keep tapping at
 *  something that will never change. Only `unavailable` is worth retrying. */
export type QuestionDetailFailure = "not_found" | "unauthorized" | "unavailable";

export interface QuestionDetailResult {
  question: Question | null;
  errorMessage: string | null;
  failure: QuestionDetailFailure | null;
}

// Firestore's rules engine can't safely distinguish "document never
// existed" from "exists but you're not allowed to see it" without leaking
// existence to an unauthorized caller — both deny with the same
// permission-denied code (see firestore.rules `questions/{questionId}`).
// So in practice, almost every inaccessible question surfaces as
// QUESTION_UNAUTHORIZED_MESSAGE; QUESTION_NOT_FOUND_MESSAGE is reserved
// for the case rules *do* allow the read but the document doesn't exist —
// e.g. a question that was deleted after being linked to.
export async function loadQuestionDetail(questionId: string): Promise<QuestionDetailResult> {
  try {
    const question = await getQuestionById(questionId);
    if (!question) {
      return { question: null, errorMessage: QUESTION_NOT_FOUND_MESSAGE, failure: "not_found" };
    }
    return { question, errorMessage: null, failure: null };
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "permission-denied") {
      return {
        question: null,
        errorMessage: QUESTION_UNAUTHORIZED_MESSAGE,
        failure: "unauthorized",
      };
    }
    return { question: null, errorMessage: QUESTION_GENERIC_ERROR_MESSAGE, failure: "unavailable" };
  }
}
