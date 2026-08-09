import {
  resolveAnswerExitGuard,
  UNSAVED_DRAWING_MESSAGE,
  UPLOAD_IN_PROGRESS_MESSAGE,
} from "../../src/features/answers/services/answerExitGuard";

const IDLE = {
  method: "photo" as const,
  hasUnsavedDrawing: false,
  isPhotoUploading: false,
  isDrawingUploading: false,
};

describe("resolveAnswerExitGuard — Phase 24 regression", () => {
  it("does not block when nothing is in flight and nothing is unsaved", () => {
    expect(resolveAnswerExitGuard(IDLE)).toEqual({ blocked: false, message: "" });
  });

  // The core bug: a photo upload in flight was never checked at all — the
  // student could freely back out mid-submit, and the submission's own
  // delayed router.back() would later fire onto whatever screen they'd
  // since navigated to.
  it("blocks while a photo upload is in flight, even with no unsaved drawing", () => {
    const result = resolveAnswerExitGuard({ ...IDLE, isPhotoUploading: true });
    expect(result).toEqual({ blocked: true, message: UPLOAD_IN_PROGRESS_MESSAGE });
  });

  // The drawing method's own upload was ALSO never part of the exit check
  // — only hasUnsavedDrawing was, which only tracks whether there's an
  // uncommitted stroke, not whether a save is mid-flight.
  it("blocks while a drawing upload is in flight, even with no unsaved drawing", () => {
    const result = resolveAnswerExitGuard({
      ...IDLE,
      method: "drawing",
      isDrawingUploading: true,
    });
    expect(result).toEqual({ blocked: true, message: UPLOAD_IN_PROGRESS_MESSAGE });
  });

  it("blocks for unsaved drawing content when nothing is uploading", () => {
    const result = resolveAnswerExitGuard({
      ...IDLE,
      method: "drawing",
      hasUnsavedDrawing: true,
    });
    expect(result).toEqual({ blocked: true, message: UNSAVED_DRAWING_MESSAGE });
  });

  it("does not apply the unsaved-drawing check to the photo method", () => {
    // hasUnsavedDrawing lingering true after a method switch must never
    // block exit from the photo method.
    const result = resolveAnswerExitGuard({ ...IDLE, method: "photo", hasUnsavedDrawing: true });
    expect(result).toEqual({ blocked: false, message: "" });
  });

  it("prioritizes the upload-in-progress message over unsaved-drawing when both are true", () => {
    const result = resolveAnswerExitGuard({
      ...IDLE,
      method: "drawing",
      hasUnsavedDrawing: true,
      isDrawingUploading: true,
    });
    expect(result).toEqual({ blocked: true, message: UPLOAD_IN_PROGRESS_MESSAGE });
  });

  it("is a pure function — the same input always produces the same output", () => {
    const input = { ...IDLE, isPhotoUploading: true };
    expect(resolveAnswerExitGuard(input)).toEqual(resolveAnswerExitGuard(input));
  });
});
