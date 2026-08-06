// Moderation core + the question-comment publication gate.
//
// Comments are the one user-generated surface that can be genuinely
// protected with no external provider: they are text, and the deterministic
// layer needs nothing but itself. Image-bearing content (answers, question
// images) is NOT gated here — see the Phase 17 report for why gating it
// without an image/OCR provider would either be a false claim of safety or
// would send every submission to a human.
export {
  canPublish,
  canTransition,
  applyTransition,
  isModerationState,
  isTerminal,
  safeStatusFor,
  MODERATION_STATES,
} from "./moderationStates";
export type { ModerationState, AuthorVisibleStatus } from "./moderationStates";

export {
  collapseRepeats,
  normalizeForModeration,
  tokenVariants,
  turkishLower,
  MAX_MODERATION_TEXT_LENGTH,
} from "./textNormalization";
export type { NormalizedText } from "./textNormalization";

export { evaluateTextRules } from "./textRules";
export type { TextRuleResult, TextRuleVerdict } from "./textRules";

export {
  callProvider,
  isProviderSignal,
  resolveProviders,
  IMAGE_ANALYSIS_UNAVAILABLE,
  PROVIDER_UNAVAILABLE,
} from "./providers";
export { createVisionProvider, safeSearchToSignal, extractVisionText, parseVisionResponse } from "./visionProvider";
export type {
  ImageAnalysisProvider,
  ImageAnalysisResult,
  ModerationProviders,
  ProviderOutcome,
  ProviderSignal,
  TextModerationProvider,
} from "./providers";

export {
  combineModerationSignals,
  decideImageModeration,
  decideTextModeration,
} from "./moderationDecision";
export type { ImageSignals, ModerationDecision, TextSignals } from "./moderationDecision";

export { submitQuestionCommentForModeration, buildSubmissionId } from "./submitQuestionComment";
export { MODERATION_SCHEMA_VERSION, isValidCommentText, MAX_COMMENT_LENGTH } from "./submissionTypes";
export type { ModerationSubmissionRecord, SubmissionResult, ModeratedTargetType } from "./submissionTypes";
export { submitAnswerForModeration, buildAnswerSubmissionId } from "./submitAnswer";
export {
  ALLOWED_ANSWER_MIME,
  MAX_ANSWER_BYTES,
  buildApprovedAnswerPath,
  buildDownloadUrl,
  buildQuarantinePath,
  extensionForMime,
  isAllowedAnswerMime,
  isOwnedQuarantinePath,
} from "./answerPublication";
export type { AnswerMethod } from "./answerPublication";
