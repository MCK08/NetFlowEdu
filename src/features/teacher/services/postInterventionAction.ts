import { InterventionConfidence, InterventionEffectiveness } from "./interventionEffectiveness";

// Phase 47 — turns Phase 44's already-computed effectiveness verdict into a
// safe "what should the teacher do now" signal.
//
// THE GAP THIS CLOSES
//
// Phase 44 gave a teacher "improved / no_change / worsened / insufficient_data"
// on InterventionOutcomeCard, but nothing ever READ that verdict — grep across
// the repo shows its only consumers are the card component and the screen
// that renders it (see interventionEffectiveness.ts's own doc comment for the
// exact grep). Meanwhile StudentPerformanceScreen's "Takip Ödevi Oluştur"
// button is gated ONLY by Phase 42's persistentStruggleTopics — a LIFETIME,
// monotonic counter that never decreases even after a student fully recovers.
// The result: a student who improved after an intervention keeps seeing the
// exact same "create another intervention" CTA they saw before it worked,
// because nothing downstream of the verdict ever looked at it.
//
// This module is that missing read. It adds no engine, no scheduler, no
// schema and no new action kind beyond the three below — it is a single pure
// function over two enums Phase 44 already produces.
//
// WHY effectiveness ALONE OVERRIDES confidence FOR "improved", BUT NOT THE
// OTHER WAY AROUND
//
// "improved" can only be produced by buildInterventionEffectiveness when
// reviewedSinceCount > 0 AND both states were resolvable (see its own
// `effectiveness = "insufficient_data"` gate) — so an "improved" verdict is,
// by construction, never a low-confidence guess. There is therefore no
// confidence value that would make suppressing further intervention unsafe:
// this rule is unconditional, matching §7's requirement that a student who
// improved must never stay in a repeat-intervention loop.
//
// WHY LOW CONFIDENCE OVERRIDES EVERYTHING ELSE
//
// "no_change"/"worsened" are directional claims about the SAME evidence
// confidence already grades — recommending a stronger action on top of
// evidence the system itself calls thin would contradict its own signal.
// insufficient_data is always "low" by construction (resolveConfidence's
// first rule), so this one check also covers it without a separate branch.
export type PostInterventionActionKind = "monitor" | "follow_up" | "escalate";

export interface PostInterventionAction {
  kind: PostInterventionActionKind;
  // Fixed, deterministic, observational — never a causal claim about the
  // assignment or the intervention (see the module doc above and §3 of the
  // phase spec: "değişmedi", never "başarısız oldu").
  reason: string;
}

const REASON = {
  monitorImproved: "Durum iyileşti — şu an için yeni bir takip ödevi önerilmiyor.",
  monitorLowConfidence: "Yeterli kanıt yok — şimdilik yeni bir aksiyon önerilmiyor.",
  followUp: "Durum değişmedi — bu konuda yeni bir takip ödevi oluşturabilirsiniz.",
  escalate: "Durum geriledi — bu öğrenciyi öncelikle incelemeniz önerilir.",
} as const;

// The single entry point. Deterministic, pure, no I/O — same input always
// produces the same output.
//
// Callers must only invoke this when a real InterventionEffectivenessResult
// exists for the student (i.e. useInterventionEffectiveness returned one).
// When it does not — the student was never targeted by a delivered
// assignment — there is no verdict to react to, and the caller must fall
// back to Phase 42/43's original, effectiveness-independent behavior
// unchanged (§12's "byte-equivalent for students with no data" invariant).
export function resolvePostInterventionAction(
  effectiveness: InterventionEffectiveness,
  confidence: InterventionConfidence,
): PostInterventionAction {
  // §7 — unconditional: an improved student must never stay in a repeat-
  // intervention loop just because lifetime struggle counters are still >0.
  if (effectiveness === "improved") {
    return { kind: "monitor", reason: REASON.monitorImproved };
  }

  // §6/§10 — low-confidence evidence (including every insufficient_data
  // verdict, which is always low by construction) never drives a follow-up
  // or an escalation, regardless of which direction it points.
  if (confidence === "low") {
    return { kind: "monitor", reason: REASON.monitorLowConfidence };
  }

  // §9 — worsened, with real (medium/high) confidence behind it: the one
  // case that should outrank a plain follow-up, using the SAME route the
  // follow-up uses (no new escalation channel — see StudentPerformanceScreen).
  if (effectiveness === "worsened") {
    return { kind: "escalate", reason: REASON.escalate };
  }

  // §8 — no_change with real evidence: a meaningful next action exists,
  // reusing the existing targeted-assignment flow unchanged.
  return { kind: "follow_up", reason: REASON.followUp };
}
