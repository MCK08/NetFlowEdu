import { FirebaseError } from "firebase/app";

const QUESTION_UPLOAD_ERROR_MESSAGES: Record<string, string> = {
  "storage/unauthorized": "Bu soruyu paylaşma izniniz yok. Lütfen sınıf üyeliğinizi kontrol edin.",
  "storage/canceled": "Yükleme iptal edildi.",
  "storage/quota-exceeded": "Depolama kotası doldu. Lütfen daha sonra tekrar deneyin.",
  "storage/retry-limit-exceeded": "Bağlantı sorunu. Lütfen tekrar deneyin.",
  // Firestore rule denial (see questions.ts's own doc comment: a rule
  // rejection throws a FirebaseError with this exact code, no prefix).
  "permission-denied": "Bu soruyu paylaşma izniniz yok. Lütfen sınıf üyeliğinizi kontrol edin.",
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
  if (isFirebaseError(error)) {
    return QUESTION_UPLOAD_ERROR_MESSAGES[error.code] ?? DEFAULT_MESSAGE;
  }
  return DEFAULT_MESSAGE;
}
