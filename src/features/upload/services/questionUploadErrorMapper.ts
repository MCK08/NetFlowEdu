import { FirebaseError } from "firebase/app";

import { QuestionCreateError, QuestionCreateErrorCode } from "@services/questions/questionCreateError";

const QUESTION_UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  "storage/unauthorized": "Bu soruyu paylaşma izniniz yok. Lütfen sınıf üyeliğinizi kontrol edin.",
  "storage/canceled": "Yükleme iptal edildi.",
  "storage/quota-exceeded": "Depolama kotası doldu. Lütfen daha sonra tekrar deneyin.",
  "storage/retry-limit-exceeded": "Bağlantı sorunu. Lütfen tekrar deneyin.",
  // Phase 89 — a client can no longer write a question document at all, so a
  // bare Firestore rule denial is no longer reachable from the create path.
  // Kept because the image upload immediately before it is still a direct
  // client write to Storage, and that one can still be refused this way.
  "permission-denied": "Bu soruyu paylaşma izniniz yok. Lütfen sınıf üyeliğinizi kontrol edin.",
};

// Phase 89 — the server gateway's refusals. Each keeps its own sentence: an
// author who is not in the class, an author whose question is not yet valid,
// and an author whose connection dropped need three different next actions,
// and collapsing them would leave someone retrying a save that cannot succeed.
const QUESTION_CREATE_ERROR_MESSAGES: Record<QuestionCreateErrorCode, string> = {
  unauthenticated: "Soru paylaşmak için oturum açmış olman gerekir.",
  "not-member": "Bu sınıfa soru ekleme iznin yok. Sınıf üyeliğini kontrol et.",
  "class-not-found": "Bu sınıf artık bulunamıyor.",
  "invalid-question":
    "Soru kaydedilemedi. Ders ve konu seçimini, şıkları, doğru cevabı ve seçtiğin ortak etiketi kontrol et.",
  unavailable: "Soru kaydedilemedi. Bağlantını kontrol edip tekrar dene.",
};

const DEFAULT_MESSAGE = "Soru yüklenemedi. Lütfen tekrar deneyin.";

function isFirebaseError(error: unknown): error is FirebaseError {
  return typeof error === "object" && error !== null && "code" in error;
}

// Never surfaces the raw Firebase error code/message to the user — only a
// mapped Turkish message, same convention as
// authentication/errorMapper.mapAuthErrorToMessage. Callers log the real
// error themselves (__DEV__ only) before calling this — see
// useStudentQuestionUpload.submitDetails.
export function mapQuestionUploadErrorToMessage(error: unknown): string {
  // Checked before the FirebaseError branch: QuestionCreateError also carries a
  // `code`, so the generic branch would otherwise swallow it and report the
  // default for every server refusal.
  if (error instanceof QuestionCreateError) {
    return QUESTION_CREATE_ERROR_MESSAGES[error.code] ?? DEFAULT_MESSAGE;
  }
  if (isFirebaseError(error)) {
    return QUESTION_UPLOAD_ERROR_MESSAGES[error.code] ?? DEFAULT_MESSAGE;
  }
  return DEFAULT_MESSAGE;
}
