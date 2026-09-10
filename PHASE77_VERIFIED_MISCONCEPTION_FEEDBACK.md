# Phase 77 — Verified Misconception Feedback

## Repository Sync

Repository already present locally, branch
`phase17-moderation-infrastructure-20260806-195814`, worktree clean. `git fetch`
found nothing newer: local and remote were both at `ab1fea6`, sync `0 0`, so no
pull was needed. No `PHASE77_*.md` existed. `main` never checked out; `.env`
never touched or read for anything but confirming the emulator flag.

## Starting Baseline

**Starting Phase 77 HEAD: `ab1fea6`** (Phase 76 — NetFlow Learning Atlas).

## Choice Architecture Audit

Done before any code was written, and it changed the design.

| Question | Answer from source |
|---|---|
| How is a choice represented? | `QuestionChoices = {A?, B?, C?, D?, E?}` — a **label-keyed map**, not an array |
| How is a choice identified? | By `ChoiceLabel` (`"A"`…`"E"`), a stable map key |
| How is the answer identified? | `correctChoice: ChoiceLabel` — the same key space |
| Where do the invariants live? | `multipleChoice.ts` — `buildChoicesPayload` (write) and `parseChoicesFromUnknown` (read) |
| What is "multiple choice active"? | `hasMultipleChoice` — 2+ non-empty options |

**A choice already has a stable identity.** That is the single most important
finding of the phase: no new id scheme, no schema migration, and above all no
matching on choice TEXT — which would silently re-point an author's explanation
at a different option the moment they fixed a typo.

Edit behaviour follows from the shape. There is no reorder in the composer
(each label owns a fixed row); adding = filling a blank label, deleting =
emptying its text, editing = retyping the same label's text. So the only rules
needed were: a note follows its **label**, and a note whose option no longer
exists (or has become the correct answer) is **dropped**, never re-pointed.

## Phase 71 Semantic Gap

Phase 71 proved the repository has no misconception taxonomy and never
persisted the selected answer as semantic evidence, so a mistake label could
not be truthfully inferred. Phase 77 does not close that by inference. It
closes the **authoring** half: an author may say what a particular OPTION
represents, and when a student picks that option the app repeats the author's
words. The claim on screen is about the answer, never about the learner.

## Phase 72 Relationship

The Phase 72 hint implementation was read in full and reused as the pattern:
pure service with the write half and read half in one file, bounded, sanitized
on both sides, `parse*FromUnknown` for untrusted documents, optional, legacy-safe,
zero generation, no new write path, no student write for opening help.

The two channels stay **separate schemas and separate resolvers**:

| | Hint | Choice feedback |
|---|---|---|
| When | BEFORE answering, on request | AFTER an answer is committed |
| Trigger | student asks | the option the student picked |
| Shape | ordered `string[]` | map keyed by `ChoiceLabel` |
| Service | `questionHints.ts` | `choiceFeedback.ts` |

A test asserts neither resolver can read the other's data.

## Answer Lifecycle

`QuestionDetailScreen` → `MultipleChoiceAnswer` → `handleSelect(label)` →
`setSelected(label)` (this **is** the commit; the list locks) → `evaluateChoice`
→ result banner → **feedback** → `Cevapla` → the rest of the existing flow.

`selected: ChoiceLabel | null` is the variable carrying the committed choice,
and it is null until commit — which is what makes pre-submission leakage
structurally impossible rather than a thing to remember.

**Answer surfaces audited.** `MultipleChoiceAnswer` is rendered in exactly one
place: `QuestionDetailScreen`. The study session cards
(`StudySessionAdaptiveCard`, `StudySessionMandatoryCard`) render the hint ladder
and a `StudyAnswerButton` that navigates to the photo/drawing answer screen —
**they do not render choices at all**, so there is no selected choice at that
seam. Per the phase's own rule, no second answer model was invented there; the
feedback reaches session students through the detail route they already use.
`FeedCard` remains preview-only and has **zero diff**.

## Authored Feedback Model

```ts
interface ChoiceFeedbackEntry { text: string; conceptKey: string | null }
type QuestionChoiceFeedback = Partial<Record<ChoiceLabel, ChoiceFeedbackEntry>>
Question.choiceFeedback: QuestionChoiceFeedback | null
```

Required-with-null, matching how `choices` and `hints` are already declared, so
every reader has to consider the field rather than silently ignore an optional.

**Deliberately two fields, not three.** The spec sketched a possible third —
a separate "concise teaching cue" — and also warned against over-modelling. A
third authored box per option would have meant up to fifteen extra inputs in a
composer that already has five choices and three hints, and the example's own
second sentence ("Önce 2x = 8 adımına ulaşmayı dene") fits inside one 240-char
note. One text field carries both jobs; the demo fixture shows exactly that.

## Stable Choice Association

Keyed by `ChoiceLabel`. Association is validated **against the question's own
options** on both write and read, so:

- an entry for a label with no (or a now-blank) option is dropped;
- an entry on `correctChoice` is dropped;
- nothing is ever re-pointed at another label to rescue it — a misattributed
  explanation is worse than a missing one.

Proven at runtime: removing choice C dropped C's note while A kept its own note
and its own key, and nothing migrated into the newly-added D slot.

## Bounds / Sanitization

`MAX_CHOICE_FEEDBACK_LENGTH = 240` (longer than a hint's 200 because it carries
"what to reconsider" plus a next step; still under a description's 300).
`MAX_CONCEPT_KEY_LENGTH = 48`. At most one entry per label. Text is trimmed,
blanks dropped, malformed entries dropped rather than coerced, duplicates
impossible by shape. The parser iterates the known labels rather than the stored
object's keys, so a corrupted document cannot invent a sixth option or pollute a
prototype (asserted).

## Semantic Identifier Decision

**Option B — an optional, per-question, authored stable key.** Option C (a
system-defined vocabulary) was rejected for lack of evidence: Phase 71
established there is no taxonomy in this repository and the prompt forbids
inventing one.

`conceptKey` is normalised to `[a-z0-9_]` so the same intent typed two ways
lands on one key, and it is:

- **authored or nothing** — never derived from question text, option text,
  wrong-answer frequency, or any model;
- **never shown to the student** (verified: the key never appears in the DOM);
- `null` until an author actually types one.

Honest limit: this makes cross-question grouping *possible* when authors reuse a
key. It is not a curated taxonomy and does not pretend to be one.

## Teacher Authoring

Inside the existing `QuestionMetadataModal`, not a new product area. Each
feedback box sits **directly under the option it explains**, indented beneath
that option's letter, so the relationship is structural rather than remembered.

Density is controlled by disclosure that does real work: a feedback box appears
only for an option that **has text** and is **not the correct answer**, and the
optional key box appears only once that note is non-empty. A four-choice
question with one answer therefore shows three extra fields, not fifteen.

Author guidance is one line under the choices: feedback is shown after the
student picks that option; say what to reconsider, do not give the answer away.
Hints and feedback remain visibly separate sections with separate checkboxes.

## Student Experience

| Case | Behaviour |
|---|---|
| Wrong + mapped | existing result banner, then the authored note |
| Wrong + unmapped | existing result banner, **nothing else** — no fabrication |
| Correct | existing "✓ Doğru" — no wrong-choice feedback |
| Before commit | nothing rendered at all |

`Soru → Cevap → Geri bildirim → Cevapla` — the existing flow, with one panel
inserted between result and next action. No second screen, no new route.

## Correctness vs Instruction

Two channels, deliberately not merged. The result banner owns correctness and
keeps the danger colour. The feedback panel owns instruction.

Correct-answer rationale was **not** added: the phase asks whether it earns its
place rather than assuming symmetry, and wrong-answer redirection is the stated
goal. Adding an authored "why B is right" box would have doubled authoring cost
for a case the student has already got right.

## Hint vs Feedback

Verified together at runtime on one question: `İpucu Al` revealed hint 1 with
the feedback panel still absent, then answering A revealed the authored note.
Two channels, two moments, one flow.

## Pre-Submission Leakage Safety

The panel is not hidden before commit — it **does not exist**. `resolveChoiceFeedback`
returns null while `selected` is null, so `ChoiceFeedbackPanel` returns null and
nothing enters the tree, the DOM or the accessibility tree.

Verified in the browser before answering: a full-document text scan found
neither authored note and no `conceptKey`.

## Firestore Read / Write Path

Existing paths only, no parallel writes.

- **Write:** composer → `uploadService` → `createQuestion` → `sanitizeChoiceFeedback`
- **Read:** `questions.ts toQuestion` and `savedQuestions.ts` →
  `parseChoiceFeedbackFromUnknown`

Feedback rides inside the existing question document.

## Rules / Validation

One helper, `choiceFeedbackWithinBounds`, added beside Phase 72's
`hintsWithinBounds` and applied to the same two create rules. It bounds the
**shape** (absent/null legal; otherwise a map with at most 5 entries) and
deliberately does not re-check the option/correct-choice relationship — that is
a relationship between three fields, and `choiceFeedback.ts` is its single
authority on both write and read. Duplicating a weaker copy in rules would
create a second, drifting one. No permission was loosened. 5 new rules tests.

## Query Cost

| | Change |
|---|---|
| New question reads | **0** |
| Per-feedback reads | **0** |
| New student writes | **0** |
| New listeners | **0** |
| New polling | **0** |
| New collections | **0** (verified: root collections unchanged) |
| New indexes | **0** |
| New Cloud Functions | **0** |
| N+1 | **NONE** |

## Runtime Fixtures

The demo seed had **no multiple-choice question at all**. Phase 77 adds one —
`demo-q-mc-1`, `2x + 6 = 14` — with four options, a hint, and authored feedback
on two of the three wrong options; the third is deliberately left unmapped so
the honest no-explanation case is also reachable from canonical fixtures.

A **new** question rather than choices bolted onto an existing one: every other
seeded question backs a Phase 41/42 persona's evidence, and `MultipleChoiceAnswer`
reports a real StudyOutcome when an option is picked (the Phase 25 bridge), so
adding choices to `demo-q-heavy` would have let a demo tap rewrite Öğrenci A's
counters. The new question has no study items and no persona was altered.

## Authoring Round Trip

The composer requires an OS image-picker dialog, which is a genuine human-only
boundary in a headless session. The round trip was therefore driven through the
**real** `buildChoicesPayload` + `sanitizeChoiceFeedback` the composer calls, then
the real read path and the real student UI. Every step except the file dialog
and the modal's own JSX was exercised:

- drafts `{A: " 12 ", B: "18", C: "24", D: "  "}` with notes on A, B, C, D →
  saved as choices `{A,B,C}` and feedback on **A and C only** — D's note dropped
  with its blank option, B's dropped because B is the answer, A's text trimmed
  and its key normalised `"Denominator Addition"` → `denominator_addition`.
- Student answered A → exactly A's authored note; C's not shown.
- **Edit:** removed C, added D → A kept its own note and key, C's note was
  dropped with its option, and answering D showed only D's own note. Nothing
  migrated.

Temporary QA data and the temporary script were removed; the emulator held no
export and its in-memory data went with it.

## Adaptive / Review Integration

**Not wired, and that is the audited answer rather than an omission.** The
adaptive and review session cards do not render choices; their answer is a
self-assessment plus navigation to the photo/drawing answer screen. There is no
selected choice at that seam, so mounting choice feedback there would have
required inventing a second multiple-choice answer model. Session integrity is
untouched: no receipt, operationId, completion count, resume storage or
multi-mode slot is involved.

## Visual Design

The first attempt used the `accent` token and was **wrong on screen**: the
palette defines `accent` as the notification/like badge red (`#FF3B5C`), so a
second red block sat directly under a red banner and read as one long alarm
whatever the words said. Corrected to `primary` — the same token the hint ladder
uses — so the panel joins the "here is help" family.

It stays distinguishable from a hint rather than identical: a hint is a filled
blue block **above** the choices; this is a neutral surface with a blue rule
**below** the result. Same family, different jobs. A short connector tethers the
panel to the result so "this follows from that" survives without colour.

No red wall, no animated X, no shake, no siren. No avatar, no speech bubble, no
"AI says". No new animation dependency.

## Accessibility

Meaning never rests on colour: the heading names the panel, an icon reinforces
it, and the connector carries the relationship structurally. The panel is one
accessible node with a composed label and `accessibilityLiveRegion="polite"`, so
it is announced when it appears and not before — and before commit there is
nothing to announce because nothing exists. The connector is marked decorative.
Authoring inputs each carry an explicit label naming the option they belong to,
and the optional key input says outright that it is not shown to students.

Verified: 375 light, 375 dark, desktop, and a 150%-equivalent viewport — text
reflows to four lines with no clipping, no fixed height, no horizontal overflow
and no label collision.

## Evidence Integrity

Resolving or displaying feedback writes nothing. Verified against the emulator
after four real answers on the fixture: `attemptCount` 4, `solved + struggled +
again = 4`, exactly **4** `studyEvents` — one per selection, none extra, despite
the panel rendering twice and a hint being opened.

No `misconceptionEvents`, `mistakeEvents` or `choiceEvents` collection exists.
No historical `studyEvents` were reinterpreted. Phase 42, the scheduler,
`nextReviewAt` and adaptive ranking are untouched.

## Why Misconception Memory Is Not Implemented Yet

Because one wrong answer is not proof of a durable misconception. It is a
selected option plus an authored interpretation of that option — and persisting
it as a learner property would turn a single tap into a claim about a mind.
Counting frequency, building history, or showing a teacher "this student's
misconception is X" all require deciding when repetition becomes evidence, which
is a real design question this phase does not pretend to have answered.

## Phase 78 Readiness

- Can a future system persist the chosen authored semantic identity without
  guessing? **YES.** At the moment of answering, `(questionId, ChoiceLabel)` is
  exact, and `resolveChoiceFeedback` returns the authored entry including its
  `conceptKey` — all authored, none inferred.
- What is intentionally missing: nothing persists it, nothing counts it, no
  history exists, and the key space is per-author rather than curated. Phase 78
  will need to decide when repetition becomes evidence, and whether a shared
  vocabulary is warranted.

## Regression

Phases 42, 45, 46, 59, 61–69 and 70–76 all pass. Phase 72 hints unchanged
(and now actually persisted on class questions — see below). Phase 71 pattern
semantics unchanged. Phase 76 Atlas untouched — no misconception lens, no
semantic nodes. Daily Flow, review scheduling, adaptive ranking, `studyEvents`,
assignment and the immersive Feed unchanged.

## iOS Decision

New native dependency **NO** · native package **NO** · native config **NO** ·
native permission **NO** · native-only API **NO** · native-only behaviour **NO**
· confirmed native-only defect **NO**.

**NATIVE IOS: NOT REQUIRED THIS PHASE.**

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | **164 suites / 3052 tests** (was 163 / 3013) |
| rules | **5 suites / 375 tests** (was 5 / 370) |
| functions build | PASS |
| verify | PASS |
| expo-doctor | 17/18 — same pre-existing dependency drift |
| `git diff --check` | clean |

One transient typecheck error (`RouteGuard.tsx`, a Phase 70 route) turned out to
be stale expo-router **generated** types that arrived with the earlier pull; it
regenerated when the dev server started, with no source change.

## Source Integrity

All touched files UTF-8, LF only, 0 NUL bytes, no binary. No raw colours and no
debug instrumentation were introduced — the two matches a scan flags
(`rgba(0,0,0,0.4)` modal backdrop, a `__DEV__`-guarded MC bridge log) both exist
unchanged at `ab1fea6` and are outside this diff. No temporary scripts,
screenshots, storage dumps or emulator exports remain. `routing.ts` untouched.

## Known Limitations

- **Only the question-detail surface** carries choice feedback, because it is
  the only surface with a multiple-choice answer. A student inside an adaptive
  or review session reaches it through the detail route.
- **The composer's image picker could not be driven headlessly**, so the modal's
  own JSX submit was verified by unit test and inspection rather than by a click;
  every other step of the round trip ran against the emulator.
- **`conceptKey` is per-author, not a curated vocabulary.** Two authors group
  only if they happen to type the same key.
- **Editing a choice's text keeps its note.** That is the intended, deterministic
  behaviour of label binding — and the note is visible directly under that option
  in the composer — but an author who repurposes a slot must update the note
  themselves.
- **No correct-answer rationale**, deliberately.

## Product Assessment

Recorded in the phase report.
