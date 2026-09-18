import type { Ionicons } from "@expo/vector-icons";

import type { StatusTone } from "@components/ui/StatusLabel";
import type { StudyOutcome } from "@features/study/domain/studyTypes";
import type { ConceptPresentation } from "@features/study/services/conceptMasteryMap";
import { formatRelativeDayLabel } from "@features/learningStory/services/teacherLearningTimeline";
import { trailStepLabel } from "@features/learningStory/services/learningTrail";

import type {
  AnalyticsOverview,
  AnalyticsRange,
  ArchiveEntry,
  ArchiveFilter,
  ArchiveState,
  ArchiveSummary,
  QuestionKind,
  TopicTimeline,
} from "./studentAnalytics";

// Phase 107 — every student-facing sentence on the analytics screens.
//
// Kept apart from the model so the wording can be read (and tested) as
// wording. The rules it follows are the product's existing ones:
//
// - Say what happened, never what the student IS. A repeated struggle is an
//   event, not a verdict ("2 kez zorlandın", never "bu konuda zayıfsın").
// - Only facts the evidence carries. A missing rate is "henüz yeterli kayıt
//   yok", never 0 and never a guess.
// - No Turkish case suffix bolted onto a proper noun. "Matematik'e",
//   "Türkçe'ye" and "Fen Bilimleri'ne" each need a different ending, so a
//   subject name always stands on its own ("En çok çalıştığın ders: X").

type IconName = keyof typeof Ionicons.glyphMap;

// ─── Range ─────────────────────────────────────────────────────────────────

export const RANGE_LABEL: Readonly<Record<AnalyticsRange, string>> = {
  "7d": "7 Gün",
  "30d": "30 Gün",
  all: "Tümü",
};

/** What the numbers under the range control are about. The range selects
 *  QUESTIONS by when they were last worked on — it is said out loud so no
 *  one reads a lifetime rate as "this week's" rate. */
export function rangeScopeLabel(range: AnalyticsRange): string {
  if (range === "7d") return "Son 7 günde üzerinde çalıştığın sorular";
  if (range === "30d") return "Son 30 günde üzerinde çalıştığın sorular";
  return "Tüm çalışma geçmişin";
}

export const SUCCESS_RATE_FOOTNOTE =
  "Çözme oranı, bu sorulardaki tüm kayıtlı denemelerinden hesaplanır.";

// ─── Rates ─────────────────────────────────────────────────────────────────

/** The visible value: a real percentage, or an em dash — never "%0" for
 *  "we do not know". */
export function successRateValue(percent: number | null): string {
  return percent === null ? "—" : `%${percent}`;
}

export function successRateSentence(percent: number | null, knownOutcomeCount: number): string {
  if (percent === null) return "Çözme oranı için henüz yeterli kayıt yok";
  return `Çözme oranı yüzde ${percent}, ${knownOutcomeCount} kayıtlı denemeden`;
}

// ─── Overview ──────────────────────────────────────────────────────────────

/** One sentence the evidence can stand behind, or null. Silence beats a
 *  sentence that has to be hedged into meaninglessness. */
export function overviewNarrative(overview: AnalyticsOverview, range: AnalyticsRange): string | null {
  if (overview.questionCount === 0) {
    return range === "all"
      ? "Soru çözdükçe öğrenme geçmişin burada oluşacak."
      : "Bu dönemde henüz bir çalışma kaydın yok.";
  }
  if (overview.focusSubject) return `En çok çalıştığın ders: ${overview.focusSubject}.`;
  return null;
}

export function archiveEntryDescription(summary: ArchiveSummary): string {
  if (summary.pending > 0) return `${summary.pending} soru tekrar bakmak için bekliyor`;
  if (summary.solvedLater > 0) {
    return `Bekleyen soru yok · ${summary.solvedLater} soruyu sonradan çözdün`;
  }
  return "Zorlandığın sorular burada saklanır";
}

// ─── Archive ───────────────────────────────────────────────────────────────

export const ARCHIVE_STATE_LABEL: Readonly<Record<ArchiveState, string>> = {
  pending: "Tekrar Bekliyor",
  solved_later: "Sonradan Çözüldü",
};

export const ARCHIVE_STATE_ICON: Readonly<Record<ArchiveState, IconName>> = {
  pending: "time-outline",
  solved_later: "checkmark-circle-outline",
};

export const ARCHIVE_STATE_TONE: Readonly<Record<ArchiveState, StatusTone>> = {
  pending: "primary",
  solved_later: "success",
};

export const ARCHIVE_FILTER_LABEL: Readonly<Record<ArchiveFilter, string>> = {
  all: "Tümü",
  pending: "Tekrar Bekleyen",
  solved_later: "Sonradan Çözülen",
};

/** The row's one supporting fact. A legacy item only carries its latest
 *  outcome, so that is exactly — and only — what it says. */
export function archiveStruggleFact(entry: Pick<ArchiveEntry, "state" | "struggledCount">): string {
  if (entry.struggledCount === null) return "Son denemende zorlandın";
  const times = `${entry.struggledCount} kez`;
  return entry.state === "solved_later" ? `${times} zorlanmıştın` : `${times} zorlandın`;
}

/** The sentence the detail screen opens with, before the question itself. */
export function archiveContextSentence(entry: Pick<ArchiveEntry, "state" | "struggledCount">): string {
  const count = entry.struggledCount;
  if (entry.state === "solved_later") {
    return count !== null && count > 1
      ? `Bu soruda ${count} kez zorlanmıştın, son denemende çözdün.`
      : "Bu soruda zorlanmıştın, son denemende çözdün.";
  }
  if (count === null) return "Bu soruda son denemende zorlanmıştın.";
  return count > 1 ? `Bu soruda daha önce ${count} kez zorlanmıştın.` : "Bu soruda daha önce zorlanmıştın.";
}

export function lastAttemptLabel(timestamp: number, now: number): string | null {
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  return `Son deneme: ${formatRelativeDayLabel(timestamp, now)}`;
}

export function lastStudiedLabel(timestamp: number | null, now: number): string | null {
  if (timestamp === null || !Number.isFinite(timestamp) || timestamp <= 0) return null;
  return `Son çalışma: ${formatRelativeDayLabel(timestamp, now)}`;
}

export interface EmptyCopy {
  title: string;
  description: string;
}

/** Empty states are truthful about WHICH absence this is — never a
 *  celebration, and never "no failures" when there is simply no history. */
export function archiveEmptyCopy(
  summary: ArchiveSummary,
  filter: ArchiveFilter,
  isScoped: boolean,
): EmptyCopy {
  if (summary.total === 0) {
    return isScoped
      ? {
          title: "Bu konuda arşivde soru yok",
          description: "Bu konudaki bir soruda zorlandığında burada saklanır.",
        }
      : {
          title: "Henüz arşivlenecek bir soru oluşmadı",
          description: "Bir soruda zorlandığında burada saklanır; istediğin zaman geri dönebilirsin.",
        };
  }
  if (filter === "pending") {
    return {
      title: "Şu anda tekrar bekleyen bir sorun yok",
      description: "Zorlandığın soruları sonradan çözdün. Geçmişin Sonradan Çözülen altında duruyor.",
    };
  }
  return {
    title: "Henüz sonradan çözdüğün bir soru yok",
    description: "Bekleyen bir soruyu tekrar çözdüğünde burada görünür.",
  };
}

export const ARCHIVE_INTRO =
  "Daha önce zorlandığın sorular burada. İstediğin zaman geri dönüp tekrar deneyebilirsin.";

// ─── Question kinds ────────────────────────────────────────────────────────

export const QUESTION_KIND_LABEL: Readonly<Record<QuestionKind, string>> = {
  multiple_choice: "Çoktan Seçmeli",
  open: "Açık Uçlu",
};

export const QUESTION_KIND_ICON: Readonly<Record<QuestionKind, IconName>> = {
  multiple_choice: "list-outline",
  open: "create-outline",
};

/** A neutral pointer, never a claim about ability or a cause. */
export function questionKindNote(pendingArchiveCount: number): string | null {
  if (pendingArchiveCount <= 0) return null;
  return `Bu soru türünde tekrar bakabileceğin ${pendingArchiveCount} soru var.`;
}

export function retryGuidance(kind: QuestionKind | null): string {
  return kind === "multiple_choice"
    ? "Soruyu açıp şıkkını seç; cevabın öğrenme geçmişine eklenir."
    : "Soruyu çözdükten sonra nasıl geçtiğini aşağıdan işaretle.";
}

// ─── Topic timeline ────────────────────────────────────────────────────────

export const OUTCOME_ICON: Readonly<Record<StudyOutcome, IconName>> = {
  solved: "checkmark-circle",
  struggled: "alert-circle",
  again: "refresh-circle",
};

/** The text alternative for the outcome strip — the strip itself is never
 *  the only carrier of the sequence. */
export function topicTimelineSentence(timeline: TopicTimeline): string {
  if (!timeline.isSufficient) {
    return "Bu konudaki son kayıtlarında sıralı bir gelişim göstermek için henüz yeterli deneme yok.";
  }
  const steps = timeline.steps.map(trailStepLabel).join(", ");
  return `Bu konudaki son ${timeline.steps.length} denemen, eskiden yeniye: ${steps}.`;
}

// ─── Topic verdicts ────────────────────────────────────────────────────────

// The SAME mark Öğrenme Haritam draws for each Phase 70 presentation, so a
// topic looks identical whichever screen the student reaches it from. The
// words come from conceptMasteryMap's own conceptStateLabel; only the glyph
// and tone are chosen here, and a test pins them to the map's view.
export const CONCEPT_ICON: Readonly<Record<ConceptPresentation, IconName>> = {
  needs_attention: "repeat-outline",
  recovering: "trending-up-outline",
  watch: "flag-outline",
  steady: "checkmark-circle-outline",
  needs_evidence: "ellipse-outline",
};

export const CONCEPT_TONE: Readonly<Record<ConceptPresentation, StatusTone>> = {
  needs_attention: "danger",
  recovering: "primary",
  watch: "neutral",
  steady: "success",
  needs_evidence: "muted",
};
