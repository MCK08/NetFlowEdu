# Phase 56 — Learning Story

## Product Promise

The feed answers "what can I learn", Daily Flow answers "what should I do
next". Learning Story answers the third question: **how is my learning
changing**. Student-facing name "İlerleme Hikâyem"; teacher counterpart
"Sınıfın İlerleme Hikâyesi".

## Data Availability

Mapped from source before any UI was designed, because it determines what may
be claimed:

| Signal | Source | Ordered? | Time-bounded? |
|---|---|---|---|
| `solvedCount` / `struggledCount` / `againCount` | `outcomeCounters.ts` | No — lifetime totals | No |
| `lastOutcome` | study item | Yes — the single most recent | No |
| `lastReviewedAt` | study item | Yes — a timestamp | Per item only |
| `status`, `successfulReviews` | review scheduler | n/a | No |
| `LearningState` | Phase 42 classifier | derived | No |
| `StudentAttentionCard` | Phase 43 | derived | No |

**No per-outcome timestamps exist anywhere in the product.** That single fact
shaped the whole feature.

## Evidence Rules

Learning Story classifies nothing. Phase 42's `buildLearningState` is called
unchanged; this feature only decides which verdicts are worth telling, in what
order, and in what words. Re-deriving "is this a struggle" would have created
a second definition of the same idea, free to drift.

Phase 41's completeness rule is inherited rather than reimplemented: a
question whose counters do not account for its whole history is
`insufficient_data`, and **produces no moment at all**. Saying nothing is the
honest output; a vague card would imply knowledge the counters cannot support.

That has a useful consequence discovered while writing the tests: because the
classifier already refuses untrusted history, a moment that exists always has
fully-counted evidence. An "unknown"/"limited" evidence level was therefore
removed from the model — it described a state this pipeline cannot reach.

## Temporal Honesty

No copy says "bu hafta", "geçen hafta", "son 7 gün", or any percentage,
because no queried data is week-scoped. `lastReviewedAt` could support "when",
but a single timestamp cannot establish "what changed since", so no trend is
claimed either.

The one genuinely ordered fact — which outcome was most recent — is stated
explicitly ("Son denemende çözdün.") and is taken from the **most recently
reviewed** contributing question, not the highest-priority one.

A test asserts the forbidden phrases never appear. It matches whole words:
Turkish second-person past tense ("çözdün") legitimately ends in "-dün", so a
substring check fired on correct copy.

## Student Story

Grouped by subject+topic, which is also the dedupe boundary: one topic yields
at most one moment carrying both its insight and its action, never an
"you are recovering" card followed by a separate "revise this" card built from
the same evidence.

Four kinds map from the classifier: `recovery`, `strength`, `needs_attention`,
`one_off`. Capped at six moments — past that it stops being a narrative.

**A scope bug caught at runtime:** the first build read "Aynı soruda 10 kez
zorlandın" for a topic whose 10 struggles were 8 on one question and 2 on
another. The count is a topic total, so the sentence is now "Bu konuda 10 kez
zorlandın." A regression test locks it.

## Teacher Story

Reads the attention cards `useClassPerformance` already builds. Sections are
emitted only when they have real students; an empty section disappears rather
than showing a zero. Wording is observational throughout — nothing says an
intervention "worked", which is exactly the causal claim Phase 44 avoided.

The subheadline states scope ("5 öğrencinin kayıtlı sonuçlarına göre") rather
than echoing the first section, which had rendered the same sentence twice.

## Learning Trail

**Not implemented — the evidence does not exist.**

A trail showing `Zorlandım → Zorlandım → Çözdüm` requires an ordered per-
question outcome sequence. The counters are cumulative totals, and the
teacher-side `recentOutcomes` sample carries one outcome per *distinct*
question, not a within-question timeline. Building the trail would have meant
inventing order from totals.

What shipped instead is an **evidence bar**: a proportional composition of the
topic's known outcomes, which cannot be misread as chronology, paired with the
most recent outcome stated in words. It carries the same insight honestly.

## Story Ordering

Deterministic: kind order (recovery → strength → attention → one_off), then
evidence size, then a stable alphabetical tie-break. Verified by a test that
reverses the input and expects identical output — ordering must never depend
on Firestore's return order.

## Daily Flow Relationship

Daily Flow decides the next action; Learning Story explains what is happening.
The student CTA routes into the **existing** adaptive session that Study Hub's
next-action card already uses, so no second recommendation engine exists.

## Navigation

Student: Study Hub, directly under the next-action card. Teacher: Class
Detail, beside Class Performance, using the same guarded navigation. No new
bottom tab on either side.

## Theme

`themedStyles` throughout, no module-scope colour constants. Semantic colours
distinguish the four kinds; brand blue is reserved for the CTA and entry
affordance.

## Accessibility

The evidence bar carries an `accessibilityLabel` spoken as composition, not as
a sequence. Cards and sections expose button roles with full labels.

## Native iOS

Verified on iPhone 17 Pro: the student story renders with hero, semantic icon,
truthful count, evidence bar, last-outcome line and working CTA. The immersive
feed, its Question → Rating paging and Daily Flow are unchanged.

## Web

Student and teacher stories verified in light and dark, at mobile and desktop
widths. Both use a bounded content column so neither becomes a full-width
dashboard.

## Performance

New Firestore reads: **none**. Both screens derive from hooks their entry
surfaces already mount (`useStudyQueue` + `useLearningInsights` for the
student, `useClassPerformance` for one class). No new listener, no polling, no
N+1, no new dependency. Teacher scope is one class, deliberately — fanning out
across every class would be one query per class.

## Security

No rules change and no new access. Students read their own study items;
teachers read the class they already have access to.

## Automated Tests

29 new tests across two suites, weighted toward honesty rather than rendering:
legacy counters never becoming zero, no temporal language, no leaked
classifier names, no score or percentage, claim scope, dedupe, determinism,
capping, first-run, and — on the teacher side — no causal claims.

## Known Limitations

- No Learning Trail, for the evidence reason above.
- No time-bounded insight of any kind, for the same reason.
- Teacher story covers the class it was opened from, not all classes.
- A topic whose questions predate Phase 41 produces no moment; that is
  deliberate, and is what keeps Student D honest.

## Final Product Assessment

The feature turns evidence the product already had into something a student
can read, without inventing a single number. Its most important design
decisions were subtractions: no score, no week, no trail.
