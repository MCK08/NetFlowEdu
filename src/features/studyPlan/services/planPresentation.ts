import type { Ionicons } from "@expo/vector-icons";

import type { StatusTone } from "@components/ui/StatusLabel";

import { PlanStep, PlanStepKind, PlanStepState } from "./dailyPlan";

// Phase 108 — the plan's words and marks. Fixed, observational, and
// pinned by tests so the same fact always reads the same way.

type IconName = keyof typeof Ionicons.glyphMap;

export const PLAN_INTRO_EVIDENCE = "Bugünkü planın öğrenme geçmişine göre hazırlandı.";
export const PLAN_INTRO_ASSIGNED = "Bugünkü planın atanan çalışmalardan ve günlük hedefinden oluşuyor.";
export const PLAN_INTRO_EMPTY = "Planını kişiselleştirmek için birkaç çalışma tamamlaman gerekiyor.";

export const STEP_KIND_LABEL: Readonly<Record<PlanStepKind, string>> = {
  revisit: "Çözemediğin sorulara dön",
  review: "Tekrar",
  reinforce: "Konu tekrarı",
  recover: "Kısa tekrar",
  assignment: "Atanan çalışma",
  practice: "Soru çözümü",
};

export const STEP_KIND_ICON: Readonly<Record<PlanStepKind, IconName>> = {
  revisit: "refresh-outline",
  review: "time-outline",
  reinforce: "flame-outline",
  recover: "trending-up-outline",
  assignment: "clipboard-outline",
  practice: "school-outline",
};

export const STEP_STATE_LABEL: Readonly<Record<PlanStepState, string>> = {
  pending: "Bekliyor",
  completed: "Tamamlandı",
  skipped: "Atlandı",
};

export const STEP_STATE_ICON: Readonly<Record<PlanStepState, IconName>> = {
  pending: "ellipse-outline",
  completed: "checkmark-circle",
  skipped: "remove-circle-outline",
};

export const STEP_STATE_TONE: Readonly<Record<PlanStepState, StatusTone>> = {
  pending: "muted",
  completed: "success",
  skipped: "neutral",
};

/** "Matematik — Denklemler", or what the step is about when it has no topic. */
export function stepTitle(step: PlanStep): string {
  if (step.subject && step.topic) return `${step.subject} — ${step.topic}`;
  if (step.subject) return step.subject;
  return STEP_KIND_LABEL[step.kind];
}

/** The second line of a row: kind · workload. */
export function stepDetail(step: PlanStep): string {
  const kind = STEP_KIND_LABEL[step.kind];
  return step.workload && step.workload !== kind ? `${kind} · ${step.workload}` : kind;
}

/** What "Adıma Başla" will open, in the student's words. */
export function stepStartLabel(step: PlanStep): string {
  switch (step.target.kind) {
    case "archive":
      return "Soruları Gör";
    case "review_session":
      return "Tekrara Başla";
    case "adaptive_session":
      return "Çalışmaya Başla";
    case "question":
      return "Soruyu Aç";
    case "assignment":
      return "Çalışmaya Devam Et";
  }
}

/** "Bu adımda" bullets — facts only. */
export function stepContents(step: PlanStep, pendingRevisitCount: number): string[] {
  switch (step.kind) {
    case "revisit": {
      const worked = step.workedToday ?? 0;
      const lines = [`çözemediğin ${pendingRevisitCount} soruya yeniden bak`];
      if (worked > 0) lines.push(`bugün ${worked} tanesine çalıştın`);
      return lines;
    }
    case "review":
      return [`tekrar zamanı gelen ${step.workload}`];
    case "reinforce":
      return ["kısa konu tekrarı", `bu konudan ${step.questionIds.length} soru`];
    case "recover":
      return ["kısa tekrar", `bu konudan ${step.questionIds.length} soru`];
    case "assignment":
      return [`öğretmenin atadığı çalışma · ${step.workload}`];
    case "practice":
      return [`günlük hedefin için ${step.workload}`];
  }
}

/** The one calm sentence behind a step. Observational; never a promise. */
export function stepWhy(step: PlanStep): string {
  switch (step.kind) {
    case "revisit":
      return "Son çalışmalarında bu sorularda zorlanmıştın. Tekrar zamanı gelen sorular aynı gün plana alınır.";
    case "review":
      return "Tekrar zamanı, önceki çalışmalarına göre belirlenir; süresi gelen sorular önce gelir.";
    case "reinforce":
      return "Son çalışmalarında bu konuda tekrar eden zorlanma görüldü.";
    case "recover":
      return "Bu konu toparlanıyor. Kısa bir tekrar kalıcılığı destekleyebilir.";
    case "assignment":
      return "Bu çalışma öğretmenin tarafından atandı.";
    case "practice":
      return "Günlük hedefinden kalan soru sayısına göre planlandı.";
  }
}

export function stepAccessibilityLabel(step: PlanStep, index: number, total: number): string {
  return `Adım ${index + 1} / ${total}. ${stepTitle(step)}. ${stepDetail(step)}. ${STEP_STATE_LABEL[step.state]}.`;
}

/** Day-of-week and short date words for the weekly view, device-local. */
export const WEEKDAY_SHORT: readonly string[] = ["Paz", "Pzt", "Sal", "Çar", "Per", "Cum", "Cmt"];
export const MONTH_SHORT: readonly string[] = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"];

export function shortDateLabel(epochMs: number): string {
  const date = new Date(epochMs);
  return `${date.getDate()} ${MONTH_SHORT[date.getMonth()]}`;
}
