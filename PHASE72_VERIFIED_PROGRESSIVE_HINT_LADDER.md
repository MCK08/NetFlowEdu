# Phase 72 — Verified Progressive Hint Ladder

## Repository Sync

Repo present at `/Users/mertcankurt/NetFlowEdu`, remote confirmed
`git@github.com:MCK08/NetFlowEdu.git`. HEAD was already `c6cc8a8`, sync **0 0**,
worktree clean, `c6cc8a8` an ancestor of HEAD. Nothing to fast-forward.

Latest doc on disk was `PHASE71_VERIFIED_STRUGGLE_PATTERN_MEMORY.md`; no
`PHASE72_*` existed. This is genuinely Phase 72.

## Starting Baseline

`c6cc8a8` — Phase 71 Verified Struggle Pattern Memory.

## Product Goal

Answer "takıldığımda NetFlowEdu bana nasıl yardım ediyor?" with progressively
stronger support that never becomes an answer-reveal button.

## Existing Instructional Content Audit

Searched `src/` and `functions/src/` for `hint`, `hints`, `clue`, `scaffold`,
`explanation`, `solution`, `rationale`, `feedback`, `steps`, `guidance`,
`workedSolution`, `teacherExplanation`, `answerExplanation`.

Every `hint` hit was **UI form-field helper text** — password rules, the feed
filter sheet, the register screen. Zero instructional content on questions.
`explanation` / `solution` / `workedSolution` / `feedback` / `steps`: **no hits
at all** in the question types, question features or Cloud Functions.

**Branch C — no authored instructional support existed.**

## Question Schema Audit

`Question` carried `choices: QuestionChoices | null` and
`correctChoice: ChoiceLabel | null` and nothing else instructional. Phase 71 had
already established there is no misconception taxonomy, and that finding is
unchanged: an authored hint is a teaching prompt, **not** a label for what the
student got wrong.

## Authoring Path

Questions are created client-side via `addDoc` through
`createQuestion` (`src/services/questions/questions.ts`), fed by
`QuestionMetadataModal` → `useUpload` / `useStudentQuestionUpload` /
`useTeacherQuestionComposer` → `uploadService`. There is no Cloud Function in
the create path, so `firestore.rules` is the only server-side enforcement point.

Reads go through two mappings — `questions.ts` and `savedQuestions.ts` — both of
which already use the Phase 21 "parse defensively from unknown" convention.

## Chosen Hint Architecture

`hints: string[]` on the question document, gentlest first. `[]` for every
legacy question and every question whose author added none — the same "empty
rather than optional" convention `subject`/`topic` already use, so no consumer
needs a null check it did not already have.

**The ladder IS the order.** Levels are positions, not stored labels, which
makes "a level 3 with no level 1" unrepresentable rather than something a rule
has to forbid.

`questionHints.ts` is pure and Firebase-free, mirroring `multipleChoice.ts`
beside it — the write half (`sanitizeHints`) and the read half
(`parseHintsFromUnknown`) live together so the two can never disagree:

- max **3** hints (`MAX_QUESTION_HINTS`)
- max **200** characters each (`MAX_HINT_LENGTH`) — shorter than a question's own
  300-char description, because a hint is a prompt and not a worked solution
- trimmed; blank entries dropped, which keeps the ladder contiguous when an
  author fills boxes 1 and 3
- bounds re-applied on read, so a hand-edited document cannot bypass them

## Trust Model

Author-written: **YES.** AI generated: **NO.** Question-text inference: **NO.**
Semantic mistake inference: **NO.**

There is no model anywhere in this path. Nothing generates, rewrites, expands or
infers instructional content — the component renders authored strings and
nothing else.

## Legacy Question Behavior

A question with no `hints` field renders **exactly** as it always did: no hint
action, no placeholder, and no message explaining our schema to the student.
Verified at runtime on `demo-q-int-1`.

## Teacher Authoring

`QuestionMetadataModal` gains an optional checkbox-gated section, matching the
existing multiple-choice section's shape rather than inventing a second pattern:

```
İpucu ekle (isteğe bağlı)
  Öğrenci takıldığında sırayla gösterilir. İpuçlarını doğrudan cevabı
  vermeden adım adım yaz.
  1. ipucu   2. ipucu   3. ipucu
```

`maxLength` is enforced in the field, and `sanitizeHints` runs on submit, so
blanks and over-long entries can never reach the document. `hints` is threaded
through all three composer paths (main upload, class upload, teacher composer).

Answer-leakage detection is deliberately **not** attempted — an unreliable
automatic check would be worse than none. The copy asks the author to write
step by step; the author remains responsible for the content.

## Student Hint Ladder

Closed by default. `İpucu Al` opens the first rung, then `Bir İpucu Daha` opens
each next one, and the action **disappears** once the ladder is fully open —
no dead button making a promise the question cannot keep.

Earlier rungs stay visible when a later one opens, because seeing hint 1 beside
hint 2 is what makes the second one land. Progression reads from the numbered
markers, never from fading earlier hints out — dimming them would make the
most-read text the least legible.

## Immersive Feed Integration

**The immersive Feed is untouched by diff.** `FeedCard` is a full-bleed preview
whose overlays navigate to the question; the student answers in
`QuestionDetailScreen`, reached via "Çöz". Putting an expanding ladder inside an
absolutely-positioned overlay on a snap pager would have risked the pager for a
surface where the student has not opened the question yet.

So the contract stays byte-identical: **Question → Rating → Question**, with the
ladder living inside the Question state the student actually works in. Verified
at runtime: the class feed renders its pager card unchanged, with no hint UI in
it.

## Adaptive Integration

Mounted in `StudySessionAdaptiveCard` (adaptive **and** assignment sessions),
between the question and the rating controls — support arrives before the
student judges how it went. Inside the card's existing `ScrollView`, so the
scroll strategy is the one that was already there.

Verified at runtime: `İpucu Al` renders, opens, and the outcome controls
("Bu soruyu nasıl çözdün?") and the `0 / 2` session header remain intact.

## Review Integration

Mounted at the identical seam in `StudySessionMandatoryCard`, so both session
modes offer support in the same place. Canonical fixtures had nothing due during
this run, so the review card was verified by shared-code identity with the
adaptive card (same component, same seam, same props) rather than by opening a
review session — stated rather than claimed.

## Outcome Integrity

Opening a hint calls nothing. The component holds one number in local state and
renders strings; it does not import `recordStudyOutcome`, does not select a
choice, does not submit, and does not read `correctChoice`.

Proven with real data: after opening four hints across two questions,
`demo-student-b`'s study state was **byte-identical** — same `attemptCount`,
same `struggledCount`, same `nextReviewAt`, same three `studyEvents`.

## Phase 42 Integrity

Untouched. `buildLearningState` reads the same counters it always did. Asking
for help is not the same as struggling, and nothing here makes it look that way.

## Scheduler Integrity

Untouched. `nextReviewAt` moves only through the normal `recordStudyOutcome`
flow, verified unchanged above. No `hintPenalty`, no adaptive ranking input.

## Persistence Decision

**Not persisted.** The reveal depth is not evidence, so it is deliberately not
stored, not counted and not fed to Phase 41/42, the scheduler or adaptive
ranking.

`studyEvents` is unchanged — no `hintsUsed`, `hintLevel` or `hintCount`. The
Phase 69 session schema is unchanged too: losing the reveal on refresh causes no
learning-integrity harm, because the student can simply reopen what they need,
and expanding a session schema to remember it would be cost with no product
question behind it.

## Firestore Cost

| Surface | Incremental cost |
|---|---|
| Student reads | **0** — hints ride inside the question document already fetched |
| Student writes | **0** |
| Listeners / polling | **0** |
| New collections / Functions / indexes | **0** |
| Teacher save | the **same** existing question write, one extra field |

No separate hint collection, so no per-question hint query and no N+1.

## Security

Reads follow the existing question read rules unchanged — a hint is question
content and is visible to exactly whoever could already read the question.

Writes go through the existing authorized create/update path; no new client
write privilege was introduced. `firestore.rules` gains a bounded check on both
create and update:

```
function hintsWithinBounds(data) {
  return !('hints' in data) || data.hints == null
         || (data.hints is list && data.hints.size() <= 3);
}
```

Rules can bound the list but cannot iterate it to measure each entry, so the
count is enforced where a client cannot bypass it and per-entry
trimming/truncation is enforced by `questionHints.ts` on both write and read.
Same reasoning as `description`'s existing size cap: this is content every
classmate can read, so its size is not left entirely to the client. Absent or
null passes, which keeps every pre-Phase-72 writer working unchanged.

Five rules tests cover: authored ladder accepted, no field accepted, explicit
null accepted, four hints denied, non-list denied.

## Fixtures

Authored rather than placeholder, and varied so all three student-facing states
are reachable from canonical data:

- `demo-q-heavy` — a full three-step ladder for "Denklemler", each step adding
  structure without handing over the result
- `demo-q-light` — a single hint
- `demo-q-int-1/2/3` — **none**, so the legacy path stays exercised

Phase 41/42 evidence personalities (A–F) were not touched.

## Runtime Acceptance

Emulators + Expo Web at 375px.

| Case | Result |
|---|---|
| Three-hint question | `İpucu Al` → 1 → 2 → 3, earlier rungs preserved, action gone at the end |
| Single-hint question | opens once, action correctly disappears |
| No-hint question | no action, no placeholder, question unchanged |
| Adaptive session card | hint between question and rating; controls and `0 / 2` header intact |
| Immersive Feed | pager card unchanged, no hint UI, no overflow |
| Outcome integrity | counters, `nextReviewAt` and event count byte-identical after 4 reveals |
| Authoring round trip | `ALPHA → BETA → GAMMA` written, read back and rendered in exact order |
| Light / Dark / desktop / 150% | no clipping, no horizontal overflow |

Temporary QA question `p72-tmp-q` removed with an existence check: **0 stray
docs, questions back to the canonical 5**. Theme and zoom reset; no emulator
export artifact.

## Professional Design

Calm blue support surface, not a yellow help box, not a chat bubble, not an AI
assistant. Each rung is a numbered marker plus the authored text; the ladder
sits below the answer action and above the rating, so the question stays
primary and the support reads as secondary.

Raw-colour audit on the new component: **zero** hex, `rgb(`, `"white"` or
`"black"` — every colour is a semantic token, so both themes follow
automatically. No new animation dependency.

## Accessibility

Each rung is one accessible element: **"İpucu 1. Bilinmeyeni bir tarafta
toplamayı dene."**, verified live in numeric order. The action carries its label
plus `accessibilityHint="Sorunun cevabını göstermez"`, and meets
`minTouchTarget`. Nothing is communicated by colour alone — the number and the
label carry the meaning.

## iOS Decision

| Gate | Answer |
|---|---|
| New native dependency / package | NO |
| New native configuration | NO |
| New native permission | NO |
| Native-only API | NO |
| Native-specific gesture | NO |
| Native-only layout behaviour | NO |
| Confirmed native-only bug | NO |

**NATIVE IOS: NOT REQUIRED THIS PHASE.** Shared React Native / TypeScript /
theme components inside existing scroll views and existing routes.

## Regression

Phases 42, 45, 46, 59, 61, 62, 63, 64, 65, 66, 67, 68, 69, 70 and 71 are
**untouched by diff** — no learning-logic, scheduler, session, Concept Map or
Pattern Memory file appears in the change set. The immersive Feed has no diff at
all. Full suite green.

No teacher hint analytics, no hint-based ranking, no semantic taxonomy.

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | 157 suites / 2829 tests (+1 suite / +30) |
| rules | 5 suites / 370 tests (+5) |
| functions build | PASS |
| verify | PASS |
| expo-doctor | 17/18 (known pre-existing drift) |
| `git diff --check` | PASS |

## Source Integrity

Every touched file: **0 NUL bytes**, valid UTF-8, LF-only, no conflict markers.
No `console.*`, `debugger` or temporary QA code.

## Known Limitations

- **Hints are per question, not per misconception.** Phase 71's finding stands:
  there is no taxonomy, and an authored hint is not a mistake label.
- **No answer-leakage detection.** An author can write a hint that gives the
  answer away; the copy asks them not to, and no unreliable automatic check was
  added.
- **Reveal state resets on refresh or remount**, by design — it is not evidence,
  so it is not persisted. The student reopens what they need.
- **Rules bound the hint count, not each entry's length.** Rules cannot iterate a
  list; per-entry length is enforced on both write and read in TypeScript.
  A determined client could still store long entries, bounded ultimately by
  Firestore's own 1MB document limit.
- **The review session card was not opened at runtime** — nothing was due in the
  canonical fixtures during this run. It shares the component, seam and props
  with the adaptive card, which was verified.
- **The composer modal was not driven synthetically**, because it is gated
  behind the native image picker. Its data path is covered by unit tests and by
  a real write → read → render round trip.

## Future Opportunities

- Hint effectiveness as evidence — only with a carefully defined question behind
  it, since "asked for help" is not "struggled".
- Per-distractor authored guidance, which would need the misconception metadata
  Phase 71 documented as absent.
- Editing hints on an existing question, once a question edit surface exists.

## Final Product Assessment

The audit set the ceiling again, and again it was the valuable part: with no
authored instructional content anywhere in the repository, the only honest way
to build a hint ladder was to create the authoring seam first and let teachers
fill it — not to let a model improvise mathematics into a student's question.

The restraint that mattered most was leaving the immersive Feed alone. Hints
belong where a student is actually working, and the pager card is a preview; the
easy version of this phase would have bolted an expanding panel onto a snap
pager and called the resulting fragility a feature.
