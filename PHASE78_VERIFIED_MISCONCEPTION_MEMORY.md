# Phase 78 — Verified Misconception Memory

## Repository Sync

Baseline `8e6b98e` (Phase 77). Remote `origin/phase17-moderation-infrastructure-20260806-195814`
was identical (`0 0`), worktree clean, `git merge-base --is-ancestor 8e6b98e HEAD` held. Nothing
pulled. No `PHASE78*.md` existed.

## Collaborator Safety

`git fetch origin` was run at the start, again immediately before committing, and again
immediately before pushing. The canonical remote did not advance during implementation, so no
integration decision was required and nothing was merged, rebased or forced.

## Starting Baseline

`8e6b98e`, branch `phase17`, clean.

## Product Goal

When the SAME authored wrong-answer meaning turns up on DIFFERENT questions, say so — and say
nothing more than that.

## Phase 77 Foundation

Phase 77 gave a distractor an author's words (`text`) and, optionally, an author's machine-readable
name for what it represents (`conceptKey`). It deliberately stopped there: the selected choice was
never persisted, so nothing could accumulate. Its own doc comment says the key "exists so a later
phase can group the same authored meaning across questions without guessing". This is that phase.

Immediate feedback is untouched. `resolveChoiceFeedback`, `ChoiceFeedbackPanel` and the reveal
timing have zero diff, and the panel still renders nothing until a choice is committed.

## Why conceptKey Alone Is Unsafe

`conceptKey` is not a curated global taxonomy — it is one author's word, typed into their own
question. Two teachers may both write `sign_transfer_error` and mean different things; nothing in
the repository defines a shared vocabulary. Grouping on the key alone would invent one, and would
merge two people's private notation into a single claim about a student.

## Author Namespace Audit

The canonical field is **`ownerId`** on the question document, and it is server-authoritative twice
over:

- `firestore.rules` pins `request.resource.data.ownerId == uid()` on create — a client cannot
  create a question under someone else's name.
- The update rule pins `request.resource.data.ownerId == resource.data.ownerId` — the namespace is
  immutable for the life of the question.

`recordStudyOutcome` already reads it (it writes `questionOwnerId` onto the study item), so no new
read was needed to obtain it. The §13 blocker therefore did not trigger.

## Semantic Identity Contract

Four components, and each one is a refusal to merge things that only look alike:

| Component | Stored where | Why |
| --- | --- | --- |
| `namespaceId` (question `ownerId`) | in the event | a key is the author's word, not a global term |
| `conceptKey` | in the event | the authored meaning itself |
| `subject` | joined on the client | conservative learning scope |
| `topic` | joined on the client | conservative learning scope |

## Subject / Topic Scope

Subject and topic are **not** written into the event, and that is a deliberate conflict with the
brief's default. `functions/src/study/learningEvent.ts` refuses to carry question content —
"snapshotting here would leak private/class material into a document the owner can read forever" —
and an event outlives the item. Persisting subject/topic to satisfy the identity would have broken
a privacy contract established two phases before this one.

Instead they are joined on the client from the shared question-metadata cache, keyed by the
`questionId` the event already carries, exactly as Phase 59's trail resolves them today. The
recorded *meaning* is immutable; the *learning scope* is resolved live, consistently with every
other surface. Phase 70's concept identity (trim-only subject + topic) is reused rather than a
second normalizer invented.

## Selected Choice Lifecycle

`MultipleChoiceAnswer` already held the picked label at the exact moment it called
`recordStudyOutcome` — Phase 25 wired the multiple-choice control to the canonical outcome path,
and Phase 77 added the feedback beside it. No new plumbing across screens was required; the label
rides along on the call that was already being made.

## Exactly-Once Integration

Semantic evidence is written inside the existing `studyEvent`, in the existing transaction, under
the existing `operationId` guard. The replay branch RETURNS before any write is staged, so a
replayed gesture cannot reach the counters, the scheduler, the event or the new payload. One
mechanism protects all four, which is the property that keeps them consistent.

## recordStudyOutcome Changes

- Accepts an optional `selectedChoice`, validated as a **label only** and rejected (not ignored) if
  malformed.
- Derives evidence in the pure COMPUTE section from the question document the transaction had
  already read.
- Passes it to `buildLearningEventRecord`, which spreads it only when present.

Nothing else in the function changed: the scheduler, the counters, `nextReviewAt`, the daily stats
and the returned result are byte-identical.

## Server Verification

The client sends a label. The server decides everything else: whether the label names a real option,
whether it was wrong, what the author attached to it, whether that carries a key, and whose
namespace it belongs to. There is **no request field** for a conceptKey, a namespace, a correctness
claim or feedback text — a malicious caller has nothing to put a forged meaning in. Proven at
runtime: a call carrying `conceptKey` and a whole fabricated `semanticChoice` object produced an
event with no semantic payload at all.

## StudyEvent Schema Evolution

An **optional field under the existing version**, not a version bump. Every pre-Phase-78 event is
still a completely valid version-1 event and nothing about how it is parsed changes. Bumping would
have implied old events need translating, and they do not. Absence means "this outcome carried no
authored semantic meaning" — which is equally true of an old event and a new one.

## Legacy Event Compatibility

No backfill, and no conversion of old events into fabricated nulls. The client parser treats the
field as all-or-nothing: a payload missing any component is dropped entirely, because a conceptKey
without its namespace is not a weaker identity but an unsafe one.

## Semantic Event Qualification

Recorded only when: a real option was picked, it was **not** the correct answer, the correct answer
is known, the author attached feedback with real text, that entry carries a usable `conceptKey`, and
the question has a usable `ownerId`. Every other case records nothing, and nothing is ever
re-pointed at a neighbouring option to rescue an unusable pick.

## Cross-Question Repetition Rule

`occurrenceCount >= 2` **and** `distinctQuestionCount >= 2`, for one identity.

## Same-Question Exclusion

Three selections on one question is a real thing that happened, and it is not this. Phase 71 already
owns same-question repetition, and it may say as much about that question as about the student. What
is new here is the same authored meaning showing up somewhere *else* — the only shape suggesting the
signal travels with the learner rather than the item.

## Cross-Author Isolation

Proven at runtime, not only in tests: with four semantic events present — three under
`demo-teacher-1` across two questions, one under a different author with the *identical* visible key
— the surface reported "2 farklı soru · 3 kayıt". The other author's event neither joined the
pattern nor raised its counts.

## Why No Recovery Exists Yet

A later correct answer proves the student answered that question correctly. It does not prove an
authored meaning stopped applying: they may have guessed, met a different sub-skill, or simply never
been offered that distractor again. Nothing in the repository can distinguish those. So there is no
`resolved`, no `recovered`, no `fixed` — asserted by a test that inspects the pattern's own keys, and
by another proving a later `solved` event does not clear a pattern.

## Student Memory Model

`buildVerifiedChoicePatterns({ events })` — pure, O(n) plus one sort, no Firestore call, no clock
read. Ordered by recency first, because nothing here ranks how serious a pattern is and a count-first
order would imply it did. Capped at 4. No score, severity, risk or confidence field exists.

## Student UX

A secondary section **inside** Zorlanma Örüntülerim, not a new route. It is the same question asked
one level deeper — Phase 71 says a difficulty is repeating, this says a specific authored selection is
repeating across different questions — and a separate destination would have made the student choose
between two answers to "what keeps coming back" while remounting identical hooks to do it. It costs
no query of its own.

Copy states the bounded fact and the counts, and nothing else: "Son öğrenme kayıtlarında aynı seçim
örüntüsü 2 farklı soruda tekrarlandı." / "2 farklı soru · 3 kayıt". Two distinct absence states —
"nothing repeated" and "not enough records yet" — and neither is praise.

## Teacher Student-Performance UX

A compact card directly under Son öğrenme akışı, derived from the same class-scoped events that
section already fetched. Zero incremental reads. Rendered only when a pattern qualifies, so a student
without one costs the screen nothing. Same component, same verified facts, one different lead-in
sentence.

## Phase 71 Relationship

Phase 71 remains authoritative for same-question repetition, topic-wide persistent struggle and
recovery. Phase 78 is strictly narrower. A student may have either without the other; no classifier
was merged and none was created.

## Phase 43/44/47 Safety

Untouched. A repeated selection creates no intervention, changes no Phase 47 verdict, does not enter
the Phase 73 Action Center ordering and does not affect the Class Concept Heatmap. Letting an
unproven signal silently raise teacher urgency is exactly the failure this phase was scoped to avoid.

## Query Cost

Extra client reads **0**. Extra server reads per eligible outcome **0** — the question was already
read for the access check, which is the single fact that makes this feature free. Extra writes **0**;
the payload rides inside the existing event. Event size grows by four small fields, and only on
qualifying outcomes. Student memory reuses the Phase 59 bounded query already on the screen; teacher
reuses the timeline query already on the screen. No listeners, no polling, no N+1, no new
collections, indexes or rules.

## Runtime QA

Emulator attachment proven before any credential (flag `true` in the live runtime, the fail-closed
guard in `config.ts` passing, auth traffic to `127.0.0.1:9099`, Firestore to `127.0.0.1:8080`, and
`www.gstatic.com` as the only non-local host). Then, through the real authenticated callable:

| Case | Result |
| --- | --- |
| wrong + mapped (A) | `{ns: demo-teacher-1, key: sign_transfer_error, label: A, v: 1}` |
| same operationId retried | one event, no duplicate payload |
| wrong + unmapped (C) | no payload |
| correct (B) | no payload |
| invalid label (Z) | `INVALID_ARGUMENT`, no event |
| forged conceptKey + semanticChoice in payload | no payload |
| no selectedChoice (legacy / non-MC) | no payload, behaviour unchanged |
| second question, same author + key | payload → pattern qualifies |
| second occurrence, same question | payload, but no cross-question pattern |
| different author, identical key | payload, separate identity, pattern unchanged |

## Idempotency Proof

The retried `operationId` produced no second event and no second payload — verified by counting the
student's events directly in Firestore, not by trusting the callable's response.

## Temporary QA Cleanup

Two temporary questions (one same-author, one other-author), all QA events and the study item the QA
calls created on a canonical question were removed, verified programmatically: **0 residual `qa78`
documents**, canonical fixtures intact. The QA scripts lived outside the repository and are not in
the diff.

## Accessibility

Each pattern is one accessible node reading topic, repetition fact and supporting counts in that
order. The convergence marks are decorative and hidden on both platforms. No meaning is carried by
colour, and the accent used is deliberately not `danger` — this is not a failure state. The
`conceptKey` and the author's uid appear in no label, hint or test id, verified at runtime by
scanning the rendered text of both surfaces.

## Responsive

375 light, 375 dark, 375 at 150%, and desktop dark all verified with no overflow and no clipping.
Teacher surface verified on desktop.

## Regression

Phases 42–47, 59, 61–77 untouched by the diff: no classifier, scheduler, counter, rules,
intervention or hint file appears in it. Student Feed zero diff. Learning Atlas zero diff. Hint
Ladder zero diff. Phase 77's immediate feedback zero diff. Full suite green at 166 suites / 3105
tests, rules at 5 suites / 375 tests.

## iOS Decision

New native dependency **NO** · native package **NO** · native config **NO** · native permission
**NO** · native-only API **NO** · native-only behaviour **NO** · confirmed native-only defect **NO**.
TypeScript, shared React Native, an existing callable and existing Firestore reads.

**NATIVE IOS: NOT REQUIRED THIS PHASE.**

## Automated Validation

typecheck PASS · lint PASS · unit 166 suites / 3105 tests (+2 suites / +53) · rules 5 suites / 375
tests · functions build PASS · verify PASS · expo-doctor 17/18 (known pre-existing drift) ·
`git diff --check` PASS.

## Source Integrity

No binary source, no NUL bytes, valid UTF-8, LF-only. Zero raw colour literals and zero debug
instrumentation in any new file. `.env`, lockfiles, `firestore.rules`, `app.json`, `package.json`,
`routing.ts` and `main` untouched.

One process note worth recording: the first runtime pass showed no semantic payloads at all, because
the Functions emulator serves the compiled `lib/` and only `tsc --noEmit` had been run. Building the
functions and restarting the emulator resolved it — the code was correct, the runtime was stale.
Anything touching the canonical Functions evidence path needs `npm run functions:build` before QA
means anything.

## Known Limitations

- Event history is bounded by Phase 59's window; the copy says "Son öğrenme kayıtlarında" and never
  implies a lifetime.
- No semantic recovery, resolution or mastery exists, by design.
- No global cross-author taxonomy exists; `conceptKey` remains author-scoped vocabulary.
- Old events are not backfilled, and no fake history was manufactured for them.
- Subject/topic scope is resolved live from current question metadata. If an author later re-files a
  question under a different topic, past occurrences regroup — the recorded *meaning* is immutable,
  the *scope* follows the metadata, exactly as every other surface already does.
- The evidence only exists where an author actually wrote a `conceptKey`, which today is a small
  slice of all questions.
- Value depends on authors reusing keys consistently across their own questions; nothing enforces or
  suggests that yet.

## Next Semantic Capability

**Class-wide verified misconception intelligence — NOT YET SAFE.** The evidence is author-scoped, and
a class's questions may come from several authors; a cohort view would either fragment along
namespaces or quietly merge them. It also has no volume evidence yet: nothing shows how often authors
reuse a key across questions, and a class heatmap built on a handful of qualifying events would look
authoritative while resting on almost nothing. Worth revisiting once real authoring data exists.

**Verified misconception resolution — NOT YET SAFE.** Resolution needs evidence that the *same
authored distractor was offered and declined*, which requires recording the options presented, not
just the one picked. Until that exists, "resolved" cannot be distinguished from "never asked again".

## Product Assessment

The product can now remember, without guessing, that the same authored wrong-answer meaning came up
on more than one question — and it says exactly that and nothing more. The claim is small on purpose:
every part of it was written down by a server at the moment it happened, scoped to the author who
wrote the meaning, and it stops well short of telling a learner what they think.
