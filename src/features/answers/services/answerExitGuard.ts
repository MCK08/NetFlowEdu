// Pure decision behind AnswerScreen's beforeRemove confirmation — whether
// leaving right now should be blocked, and what to tell the student if so.
//
// Phase 24 regression: this used to be computed inline as
// `method === "drawing" && hasUnsavedDrawing`, which never considered an
// upload in flight for EITHER method. Leaving mid-submit was completely
// unguarded, which let the submission's own delayed router.back() (fired
// once the network call resolves — see AnswerScreen.tsx's handleSubmitted)
// pop whatever screen the student had since navigated to, instead of the
// AnswerScreen that actually issued it.
export interface AnswerExitGuardState {
  method: "photo" | "drawing";
  hasUnsavedDrawing: boolean;
  isPhotoUploading: boolean;
  isDrawingUploading: boolean;
}

export interface AnswerExitGuardResult {
  blocked: boolean;
  message: string;
}

export const UPLOAD_IN_PROGRESS_MESSAGE =
  "Cevabınız gönderiliyor. Şimdi çıkmak istediğinize emin misiniz?";
export const UNSAVED_DRAWING_MESSAGE =
  "Kaydedilmemiş çiziminiz var. Çıkmak istediğinize emin misiniz?";

const NOT_BLOCKED: AnswerExitGuardResult = { blocked: false, message: "" };

// An upload in flight always wins over — and always blocks regardless of —
// the drawing-specific unsaved-content check: it applies to both methods,
// and a submission that's already left the device shouldn't be described
// to the student as merely "unsaved".
export function resolveAnswerExitGuard(state: AnswerExitGuardState): AnswerExitGuardResult {
  if (state.isPhotoUploading || state.isDrawingUploading) {
    return { blocked: true, message: UPLOAD_IN_PROGRESS_MESSAGE };
  }
  if (state.method === "drawing" && state.hasUnsavedDrawing) {
    return { blocked: true, message: UNSAVED_DRAWING_MESSAGE };
  }
  return NOT_BLOCKED;
}
