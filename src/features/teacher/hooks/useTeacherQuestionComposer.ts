import { useState } from "react";
import { Alert } from "react-native";

import { QuestionMetadataDetails } from "@features/questions/components/QuestionMetadataModal";
import {
  CameraPermissionDeniedError,
  GalleryPermissionDeniedError,
  pickQuestionImage,
  QuestionImageSource,
  uploadClassQuestionImage,
} from "@features/upload/services/uploadService";
import { mapQuestionUploadErrorToMessage } from "@features/upload/services/questionUploadErrorMapper";
import { Question } from "@/types/question";

interface UseTeacherQuestionComposerOptions {
  uid: string | undefined;
  organizationId: string | null;
  classId: string;
  onUploaded: (question: Question) => void;
}

// The Teacher Action Center's "Soru Oluştur" flow — the exact same
// two-stage pick-image-then-fill-metadata pattern
// useStudentQuestionUpload already uses (same primitives: pickQuestionImage,
// uploadClassQuestionImage, QuestionMetadataModal), kept as its OWN hook
// rather than generalizing that one, so this addition carries zero risk to
// the existing student composer — nothing in useStudentQuestionUpload.ts or
// its caller (StudentClassDetailScreen) is touched by this file existing.
// The only real difference from the student flow is posterRole: "teacher",
// which firestore.rules already independently verifies against the
// caller's own class-ownership (classData(classId).teacherId == uid()) —
// not a new authorization path, the existing one a teacher's one-tap
// capture button (useClassUpload) already exercises today.
export function useTeacherQuestionComposer({
  uid,
  organizationId,
  classId,
  onUploaded,
}: UseTeacherQuestionComposerOptions) {
  const [isSourcePickerOpen, setIsSourcePickerOpen] = useState(false);
  const [pickedImageUri, setPickedImageUri] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function openComposer() {
    if (!uid || !organizationId || isUploading) return;
    setIsSourcePickerOpen(true);
  }

  function cancelSourcePicker() {
    setIsSourcePickerOpen(false);
  }

  async function selectImageSource(source: QuestionImageSource) {
    setIsSourcePickerOpen(false);
    if (!uid || !organizationId) return;

    try {
      const uri = await pickQuestionImage(source);
      if (uri) setPickedImageUri(uri);
    } catch (error) {
      if (error instanceof CameraPermissionDeniedError) {
        Alert.alert(
          "Kamera izni gerekli",
          "Soru fotoğrafı çekebilmek için kamera erişimine izin vermelisiniz. Ayarlar üzerinden izni etkinleştirebilirsiniz.",
        );
      } else if (error instanceof GalleryPermissionDeniedError) {
        Alert.alert(
          "Galeri izni gerekli",
          "Fotoğraf seçebilmek için galeri erişimine izin vermelisiniz. Ayarlar üzerinden izni etkinleştirebilirsiniz.",
        );
      } else {
        Alert.alert("Bir hata oluştu", "Lütfen tekrar deneyin.");
      }
    }
  }

  function cancelDetails() {
    setPickedImageUri(null);
    setErrorMessage(null);
  }

  async function submitDetails(details: QuestionMetadataDetails) {
    if (!uid || !organizationId || !pickedImageUri || isUploading) return;
    setErrorMessage(null);
    setIsUploading(true);
    try {
      const question = await uploadClassQuestionImage({
        uid,
        organizationId,
        classId,
        posterRole: "teacher",
        localUri: pickedImageUri,
        subject: details.subject,
        description: details.description,
        gradeLevel: details.gradeLevel,
        topic: details.topic,
        choices: details.choices,
        correctChoice: details.correctChoice,
      });
      onUploaded(question);
      setPickedImageUri(null);
    } catch (error) {
      setErrorMessage(mapQuestionUploadErrorToMessage(error));
    } finally {
      setIsUploading(false);
    }
  }

  return {
    isSourcePickerOpen,
    pickedImageUri,
    isUploading,
    errorMessage,
    openComposer,
    cancelSourcePicker,
    selectImageSource,
    cancelDetails,
    submitDetails,
  };
}
