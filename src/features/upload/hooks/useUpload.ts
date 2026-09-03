import { useState } from "react";
import { Alert } from "react-native";

import { useSubmitLock } from "@hooks/useSubmitLock";

import { Question, QuestionVisibility } from "@/types/question";

import {
  CameraPermissionDeniedError,
  pickQuestionImage,
  QuestionMetadataInput,
  uploadQuestionWithMetadata,
} from "../services/uploadService";

interface UseUploadOptions {
  uid: string | undefined;
  organizationId: string | null;
  onUploaded: (question: Question) => void;
}

// Tapping the camera button first opens a visibility picker (see
// VisibilityPicker) rather than launching the camera directly — the
// question needs a chosen visibility before its Storage path can be built
// (see uploadQuestionImage), so the choice has to happen before capture,
// not after.
//
// Phase 21 — two-stage, same shape as the class composer
// (useStudentQuestionUpload): capture the image, THEN show the mandatory
// subject/grade/topic (+ optional multiple choice) form, and only upload
// once that's submitted. Before this phase, captureWithVisibility captured
// AND uploaded in one step with no metadata at all — that single step is
// now split into captureWithVisibility (image only) and submitMetadata
// (the actual upload).
export function useUpload({ uid, organizationId, onUploaded }: UseUploadOptions) {
  const [isUploading, setIsUploading] = useState(false);
  // Phase 75 — synchronous double-submit guard for the create below.
  const submitLock = useSubmitLock();
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [pendingUpload, setPendingUpload] = useState<{
    localUri: string;
    visibility: QuestionVisibility;
  } | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);

  function openPicker() {
    if (!uid || isUploading) return;
    setIsPickerOpen(true);
  }

  function closePicker() {
    setIsPickerOpen(false);
  }

  // Called by VisibilityPicker's onSelect only after its own close
  // animation has actually finished and it has unmounted itself (see
  // VisibilityPicker.tsx) — no picker UI, native or otherwise, exists by
  // the time this runs, so there is nothing for launchCameraAsync's
  // presentation to race against.
  async function captureWithVisibility(visibility: QuestionVisibility) {
    setIsPickerOpen(false);
    if (!uid || isUploading) return;

    if (__DEV__) console.log("[QUESTION_UPLOAD] captureWithVisibility called", visibility);

    try {
      const localUri = await pickQuestionImage("camera");
      if (__DEV__) console.log("[QUESTION_UPLOAD] pickQuestionImage returned", localUri ? "uri" : "null");
      if (localUri) {
        setMetadataError(null);
        setPendingUpload({ localUri, visibility });
      }
    } catch (error) {
      if (error instanceof CameraPermissionDeniedError) {
        Alert.alert(
          "Kamera izni gerekli",
          "Soru fotoğrafı çekebilmek için kamera erişimine izin vermelisiniz. Ayarlar üzerinden izni etkinleştirebilirsiniz.",
        );
      } else {
        Alert.alert("Bir hata oluştu", "Lütfen tekrar deneyin.");
      }
    }
  }

  function cancelMetadata() {
    setPendingUpload(null);
    setMetadataError(null);
  }

  async function submitMetadata(details: QuestionMetadataInput) {
    if (!uid || !pendingUpload) return;
    // Phase 75 — the lock is acquired here, synchronously, INSTEAD of relying
    // on the `isUploading` state read below. Question creation is the one
    // durable write left with no operationId backstop (answers, comments and
    // study outcomes all carry one), so a second run genuinely creates a
    // second Storage object and a second question document. A state read
    // cannot close that window — see utils/submitLock.ts.
    if (!submitLock.acquire()) return;
    setMetadataError(null);
    setIsUploading(true);
    try {
      if (__DEV__) console.log("[QUESTION_UPLOAD] uploadQuestionWithMetadata called");
      const question = await uploadQuestionWithMetadata({
        uid,
        organizationId,
        visibility: pendingUpload.visibility,
        localUri: pendingUpload.localUri,
        ...details,
      });
      if (__DEV__) console.log("[QUESTION_UPLOAD] uploadQuestionWithMetadata returned question");
      onUploaded(question);
      setPendingUpload(null);
    } catch (error) {
      if (__DEV__) {
        const err = error as { constructor?: { name?: string }; code?: unknown; message?: unknown; stack?: unknown };
        console.log("[QUESTION_UPLOAD] catch: error.constructor.name", err?.constructor?.name);
        console.log("[QUESTION_UPLOAD] catch: error.code", err?.code);
        console.log("[QUESTION_UPLOAD] catch: error.message", err?.message);
      }
      setMetadataError("Fotoğraf yüklenirken bir hata oluştu. Lütfen tekrar deneyin.");
    } finally {
      if (__DEV__) console.log("[QUESTION_UPLOAD] finally: setIsUploading(false)");
      setIsUploading(false);
      // Released in `finally`, never on success only: a failed upload must
      // leave the button usable so the author can retry (Phase 75 §42).
      submitLock.release();
    }
  }

  return {
    isUploading,
    isPickerOpen,
    openPicker,
    closePicker,
    captureWithVisibility,
    // Metadata form is shown whenever an image has been picked and is
    // awaiting its subject/grade/topic before upload.
    pendingImageUri: pendingUpload?.localUri ?? null,
    metadataError,
    cancelMetadata,
    submitMetadata,
  };
}
