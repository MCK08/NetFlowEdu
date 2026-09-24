import type { Ionicons } from "@expo/vector-icons";

import type { StatusTone } from "@components/ui/StatusLabel";
import type { AssignmentEffectiveness } from "@features/assignments/services/assignmentOutcomeInsights";
import type { LearningTrend } from "@features/study/services/learningTrend";

import type { InterventionEffectiveness } from "./interventionEffectiveness";
import type { AttentionCategory } from "./studentAttention";

// Phase 104 — the ONE glyph vocabulary for the teacher's state words.
//
// Presentation only. Every classification here is produced elsewhere
// (studentAttention, classTrend/learningTrend, interventionEffectiveness,
// assignmentOutcomeInsights) and none of those change; this file only says
// which mark and which tone a given state is drawn with, so the class
// summary, the priority rows, the trend lines and the verdict cards agree
// with each other and with the Action Center's rows. It imports no React and
// no theme so it can be pinned by a plain unit test.
//
// Tones are the palette's semantic colours and nothing else: danger for a
// state that asks for attention, success for movement in the right
// direction, primary for a strength, neutral/muted for watching and waiting.
// There is deliberately no amber — the product's state semantics are words
// with a mark, not a traffic light.

export interface StatusGlyph {
  icon: keyof typeof Ionicons.glyphMap;
  tone: StatusTone;
}

/** The class summary chips and the priority-student rows. */
export function attentionCategoryGlyph(category: AttentionCategory): StatusGlyph {
  switch (category) {
    case "needs_attention":
      return { icon: "alert-circle", tone: "danger" };
    case "watch":
      return { icon: "eye-outline", tone: "neutral" };
    case "progressing":
      return { icon: "trending-up-outline", tone: "success" };
    case "strong":
      return { icon: "sparkles-outline", tone: "primary" };
    case "insufficient_data":
      return { icon: "remove-circle-outline", tone: "muted" };
  }
}

/** The teacher-facing WORD for an attention category, for the mark above to
 *  sit beside. Phase 124 — lifted out of Sınıf Performansı, which owned the
 *  only copy: one student's own screen now names their state too, and two
 *  private switch statements are how the class list and the student screen
 *  would start calling the same category different things. The words are
 *  unchanged, and none of them is a score or a rank. */
export function attentionCategoryLabel(category: AttentionCategory): string {
  switch (category) {
    case "needs_attention":
      return "Dikkat gereken";
    case "watch":
      return "İzlemede";
    case "progressing":
      return "İlerliyor";
    case "strong":
      return "Güçlü";
    case "insufficient_data":
      return "Yetersiz veri";
  }
}

/** A learning trend, for the class as a whole and for one student. Null when
 *  there is no trend to draw — the caller shows its "not enough data" sentence
 *  with no mark, exactly as before. */
export function learningTrendGlyph(trend: LearningTrend): StatusGlyph | null {
  switch (trend) {
    case "improving":
      return { icon: "trending-up-outline", tone: "success" };
    case "declining":
      return { icon: "trending-down-outline", tone: "danger" };
    case "stable":
      return { icon: "remove-outline", tone: "neutral" };
    case "insufficient_data":
      return null;
  }
}

/** The verdict on the last intervention (Phase 44). */
export function interventionEffectivenessGlyph(effectiveness: InterventionEffectiveness): StatusGlyph | null {
  switch (effectiveness) {
    case "improved":
      return { icon: "checkmark-circle-outline", tone: "success" };
    case "no_change":
      return { icon: "remove-outline", tone: "neutral" };
    case "worsened":
      return { icon: "alert-circle-outline", tone: "danger" };
    case "insufficient_data":
      return null;
  }
}

/** The outcome line on an assignment's detail. */
export function assignmentEffectivenessGlyph(effectiveness: AssignmentEffectiveness): StatusGlyph | null {
  switch (effectiveness) {
    case "effective":
      return { icon: "trending-up-outline", tone: "success" };
    case "mixed":
      return { icon: "remove-outline", tone: "neutral" };
    case "needs_follow_up":
      return { icon: "alert-circle-outline", tone: "danger" };
    case "insufficient_data":
      return null;
  }
}
