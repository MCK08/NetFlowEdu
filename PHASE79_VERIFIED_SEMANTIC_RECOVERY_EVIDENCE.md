# Phase 79 — Verified Semantic Opportunity & Recovery Evidence

## Repository Sync

Baseline `a01c5f9` (Phase 78). Remote `origin/phase17-moderation-infrastructure-20260806-195814`
was identical (`0 0`), worktree clean, `git merge-base --is-ancestor a01c5f9 HEAD` held. Nothing
pulled. No `PHASE79*.md` existed.

## Collaborator Safety

`git fetch origin` ran at the start, immediately before committing, and immediately before pushing.
The canonical remote did not advance during implementation, so nothing was merged, rebased or forced.

## Starting Baseline

`a01c5f9`, branch `phase17`, clean.

## Phase 78 Limitation

Phase 78 recorded what was SELECTED. It could not record what was AVAILABLE, so "the student has not
picked X lately" collapsed two unrelated facts into one silence: they saw X and chose otherwise, or X
was never in front of them again. Phase 78 refused to build a recovery claim on that, and was right to.

## Product Goal

Record the bounded set of author-verified semantic distractors that were selectable at the moment a
student answered, so "offered again and not re-selected" becomes a checkable fact.

## Why "Not Selected Again" Was Previously Unverifiable

Because absence of evidence was the only evidence. Nothing in the event history said which traps had
been on the page, so any inference from a gap in selections was a guess about the curriculum, not an
observation about the learner.

## Semantic Opportunity Definition

An option qualifies when the server can verify, from the canonical question document, that it is a
real selectable option, it is **not** the correct answer, its author attached feedback with real
text, and that feedback carries a usable `conceptKey`. Anything else is not an opportunity.

## Server Derivation

`resolveSemanticOpportunities` reads the question document the transaction had **already fetched for
its access check**. The client contributes one thing — the label it picked — and there is no request
field for a key, a namespace, an offered set or a correctness claim.

## Privacy-Minimal Payload

`{ namespaceId, conceptKeys[], selectedChoice }`. No choice text, no feedback text, no question
content, no subject/topic, no author display name. `namespaceId` is hoisted rather than repeated per
entry, because every option on one question belongs to one author by construction — repeating it
would store the same string four times and imply entries could differ.

`selectedChoice` is not decoration. It is what makes the payload meaningful: a student can record an
outcome on a multiple-choice question **without touching the options** (the rating control does
exactly that), and counting those distractors as "offered" would turn *did not engage* into
*declined*. Opportunities are therefore recorded only alongside a real pick.

## StudyEvent Evolution

An optional field under the existing version, matching Phase 78's decision and for the same reason:
an event without it is not an event needing translation, it is one where this was never observed.
That distinction is load-bearing here — a legacy event proves nothing about what was on the page, so
it must never read as a passed-over opportunity.

## Legacy Compatibility

No backfill. Pre-Phase-79 events, pre-Phase-78 events and plain Phase 59 events all parse unchanged
and are explicitly excluded from recovery evidence.

## Exactly-Once Integration

Same event, same transaction, same `operationId` guard. The replay branch returns before any write is
staged, so counters, scheduler, event, selected meaning and opportunities are all protected by one
mechanism. No second collection was created.

## Opportunity Deduplication

By `conceptKey`, within the question. If an author attached the same meaning to two wrong options the
student was offered it **once**; counting it twice would inflate every later decline. Keys are sorted
so the stored bytes are deterministic, and bounded by the number of wrong options a question can have.

## Recovery Evidence Contract

For an identity that **already qualifies as repeated** under Phase 78: at least two later events that
offered the identity and where the student picked something else, across at least two distinct
questions. Deliberately the same shape as the repetition threshold — the evidence for recovering
should not be weaker than the evidence that raised the pattern.

## Latest-Selection Window

The window opens at the most recent time the meaning **was taken**. That single choice is what makes
relapse self-correcting: there is no separate reset branch to get wrong, because a later selection
moves the window forward and every earlier decline falls out automatically. Evidence earned before a
relapse can never be presented as current.

## Distinct-Question Requirement

Answering one question twice is not breadth, for the same reason it was not breadth when the pattern
formed.

## Reselection Behavior

Verified at runtime: a recovery signal present on screen disappeared the moment the meaning was taken
again, and the pattern grew from two questions to three. Two fresh declines afterwards produced a new
signal counting **only** the post-relapse declines.

## Why This Is Not "Resolved"

A declined option is not a demonstrated one. A student offered a distractor who picks something else
may have reasoned it through, guessed, or chosen a different wrong answer. What can be said is what
happened: the trap was on the page and it was not taken. There is no `resolved`, `mastered`, `fixed`
or `understood` state anywhere in this phase — asserted by tests that inspect the pattern's own keys
and scan the visible copy.

## Student UX

The existing "Tekrarlayan Seçim Örüntüleri" section, evolved rather than replaced. A recovering
pattern gains an onward step on its convergence mark and one more sentence beneath the first — a
continuation of the same evidence trail, not a badge. Copy: *"Toparlanma sinyali · Sonraki 2 farklı
soruda aynı seçim yeniden seçilmedi."* No trophy, no green tick, no percentage; the accent stays the
same brand blue the row already used.

## Teacher UX

The same component in Student Performance shows the same verified facts with the teacher lead-in.
Derived from the class-scoped events that screen already fetched — zero incremental reads.

## Phase 43/44/47 Safety

Untouched. A recovery signal creates no intervention, removes none, changes no Phase 47 verdict, does
not reorder the Action Center and does not touch the Class Concept Heatmap. It never marks a student
"safe".

## Query / Backend Cost

Extra client reads **0** · extra server reads **0** (the question was already read for the access
check) · extra writes **0** · event grows by one small object, only on outcomes where a pick was made
on a question carrying authored distractors · student memory reuses the existing bounded Phase 59
query · teacher reuses the existing timeline query · listeners 0 · polling 0 · N+1 none · new
collections, indexes and rules **0**.

## Runtime Proof

Emulator attachment proven before any credential (flag `true`, fail-closed guard passing, zero
production Firebase endpoints). Then, through the real authenticated callable, inspecting the written
documents rather than trusting responses:

| Step | Result |
| --- | --- |
| Q-A, Q-B: X offered and taken | `sel=sign_transfer_error`, `offered=[sign_transfer_error]@A` |
| Retry with the same operationId | one event, no duplicate |
| Forged `semanticOpportunities` + `conceptKey` in the request | ignored; server derived its own |
| Q-C: X offered, **correct** answer picked | opportunity recorded, no selected meaning |
| After one decline | **no** recovery signal |
| Q-D: X offered, **unmapped wrong** answer picked | opportunity recorded, no selected meaning |
| After two distinct declines | recovery signal, "2 farklı soruda" |
| Q-X: different author, identical key, declined | excluded — count stayed 2, not 3 |
| Q-E: X offered and taken again | recovery withdrawn, pattern grew to 3 |
| One decline after relapse | **no** recovery |
| Two distinct declines after relapse | fresh signal, counting only post-relapse declines |

## Functions Build Requirement

Phase 78 recorded that the Functions emulator serves compiled `lib/`, and that `tsc --noEmit` is not
runtime preparation. This phase built the functions **first** and verified the artifact contained the
new resolver before starting the emulators. The first Phase 79 runtime pass was correct on the first
attempt as a result.

## Idempotency

The retried `operationId` produced exactly one event carrying exactly one selected payload and one
opportunity payload — verified by reading the student's events directly.

## Responsive

375 light, 375 dark, 375 at 150%, desktop dark (student) and desktop (teacher) all verified with no
overflow and no clipping.

## Accessibility

Each pattern is one accessible node reading area, repetition fact, supporting counts, then the
recovery label and its fact — the order a sighted reader takes them. The convergence mark and its
onward stroke are decorative and hidden on both platforms. Repeated and recovering states differ by
text, by an added icon and by layout, never by colour alone. No `conceptKey` and no author uid appear
in any label, verified at runtime by scanning the rendered text of both surfaces.

## Regression

Phases 42–47, 59, 61–78 untouched by the diff. Student Feed zero diff. Learning Atlas zero diff. Hint
Ladder zero diff. Phase 77 immediate feedback zero diff. Phase 78's repetition threshold unchanged —
its 30 original tests still pass without modification beyond one fixture gaining the new field.

## iOS Decision

New native dependency **NO** · native package **NO** · native config **NO** · native permission
**NO** · native API **NO** · native-only behaviour **NO** · confirmed native defect **NO**.

**NATIVE IOS: NOT REQUIRED THIS PHASE.**

## Automated Validation

typecheck PASS · lint PASS · unit 168 suites / 3152 tests (+2 suites / +47) · rules 5 suites / 375
tests · functions build PASS · verify PASS · expo-doctor 17/18 (known pre-existing drift) ·
`git diff --check` PASS.

## Source Integrity

No binary source, no NUL bytes, valid UTF-8, LF-only. Zero raw colour literals and zero debug
instrumentation added. No temporary QA artefact in the repository — the QA script was removed and
cleanup verified zero residue. `.env`, lockfiles, `firestore.rules`, `app.json`, `package.json`,
`routing.ts` and `main` untouched.

## Known Limitations

- **Bounded history.** Everything is derived from Phase 59's bounded window, and the copy says "Son
  öğrenme kayıtlarında". A pattern and its recovery can both age out of that window.
- **No absolute resolution.** A recovery signal is an observation, not a verdict, and can be withdrawn
  by a single relapse.
- **Author-scoped vocabulary.** `conceptKey` remains one author's word. There is no global taxonomy,
  and opportunities from another author never contribute.
- **No historical backfill.** Events written before this phase carry no opportunity data and are
  excluded from recovery evidence, so a student with a long history starts accumulating from now.
- **Live subject/topic regrouping remains.** Concept scope is still resolved from current question
  metadata, so re-filing a question regroups past events. The recorded *meaning* is immutable; the
  *scope* follows metadata, exactly as every other surface does. Not expanded into a historical scope
  migration here.
- **Opportunities require a pick.** An outcome recorded through the rating control on a
  multiple-choice question records no opportunity. That is deliberate, and it means recovery evidence
  accumulates only where students actually answer the options.

## Next Capability

**A verified resolution contract — still NOT safe.** Recovery evidence proves a trap was declined,
not that the underlying idea is understood. Resolution would need evidence of demonstrated
competence on the thing the distractor tests, and the repository has no representation of that; the
correct answer proves the item was answered, not that the misconception is gone. Two declines is a
signal precisely because it is weaker than a claim.

**Class-wide semantic intelligence — still NOT safe.** The blocker is unchanged and structural:
`conceptKey` is author-scoped, a class's questions may come from several authors, and a cohort view
would either fragment along namespaces or quietly merge them. Phase 79 adds volume to each student's
own record but changes nothing about that.

## Product Assessment

The product can now distinguish "has not picked this lately" from "was shown this again and chose
otherwise" — a distinction it could not make one phase ago, and the one that separates an observation
from a guess. It says exactly that much and stops: a signal, withdrawable, never a verdict.
