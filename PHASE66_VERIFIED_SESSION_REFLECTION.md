# Phase 66 — Verified Session Reflection + Learning Closure

## Starting Baseline

`3f4b2af` — Phase 65. Worktree clean, sync 0/0, main untouched.

## Product Goal

Answer one question honestly at the end of a study session: **what actually
happened in the session I just completed?**

Not "how am I doing" (Phase 56 owns that), not "what should I do next"
(Phase 45/62 own that). Just a truthful receipt for the sitting that ended.

## Why This Is Not Phase 56

Phase 56 deliberately **refused** to draw an ordered trail from lifetime
counters, because with `solvedCount` / `struggledCount` / `againCount` the order
genuinely is not known — only the totals are.

Within one session the order **is** known, because the receipt is appended as
each outcome is confirmed. That is the entire reason this phase can say
"zorlanmanın ardından çözüm görüldü" where Phase 56 could not: it is a read of
real sequence rather than an inference from totals.

## Session Identity — The Decision That Shaped The Phase

The tempting implementation is to reconstruct the session by scanning
`studyEvents` for "everything in the last twenty minutes". That was rejected.

**Timestamp proximity is not session identity.** A student who studied at
09:00, closed the app, and returned at 09:18 would have the earlier sitting
silently absorbed into the later summary. There is no session id in
`studyEvents` — Phase 59 stores an append-only chronological record, not a
session grouping — so any time-window reconstruction would be a guess presented
as a fact.

The session therefore describes itself: the hook that ran it holds the receipt.

## The Receipt

`SessionOutcomeReceipt` — `{ operationId, questionId, subject, topic, outcome }`,
appended in `useReviewSession` immediately after `recordStudyOutcome` resolves.

Held in session state, never persisted. It describes one sitting and should not
outlive it; there is no cached summary that could survive an account switch, a
restart or a re-mount.

## Idempotency

Keyed on `operationId` — **Phase 59's existing idempotency key, reused rather
than reinvented**.

This matters because the session count sits beside a server-side counter that is
already exactly-once. A replayed success callback, or a retried request that had
actually succeeded, must collapse to one receipt for the same reason the server
counts it once — otherwise the screen would contradict the database.

## Confirmed-Only Rule

The receipt is appended **only after the canonical write resolved**. A failed
write throws before that line, so an outcome the server never accepted can never
appear in the summary. The session never reports work the backend does not have.

## Counting Honesty — `soru` vs `sonuç`

Four outcomes across three questions is not four questions.

- `confirmedOutcomeCount === distinctQuestionCount` → "N soru üzerinde çalıştın"
- otherwise → "N çalışma sonucu kaydedildi"

The screen never inflates a repeated attempt into a distinct question. This was
observed with real data at runtime (see *Runtime Evidence*).

## Topic Moments

Receipts are grouped by `subject|topic` and read as an ordered run:

| Kind | Condition | Copy |
|---|---|---|
| `recovery` | last is `solved`, an earlier one was `struggled` | "Bu çalışmada zorlanmanın ardından çözüm görüldü." |
| `repeated_struggle` | every outcome is `struggled` | "Bu çalışmada bu konuda zorlanma tekrar etti." |
| `steady` | every outcome is `solved` | "Bu çalışmada bu konuda çözümler arka arkaya geldi." |
| `mixed` | anything else | "Bu çalışmada sonuçlar karışık ilerledi." |

`MIN_MOMENT_OUTCOMES = 2`: one outcome is not a sequence, and calling it one
would be exactly the overclaim Phase 56 was careful to avoid. `MAX_SESSION_MOMENTS = 2`:
this is a closure screen, not a dashboard.

## `again` Semantics

`again` is **not** a struggle. It is a request to see the card again shortly —
the same rule `reviewScheduler`, `buildLearningState` and the Learning Trail
already apply. Treating it as difficulty here would make one interaction mean two
different things in two places.

It is still counted and still shown; it simply never contributes to a struggle
verdict.

## Copy Policy

Every sentence is scoped by **"Bu çalışmada"**, so none can be read as a verdict
on the student's overall grip on a topic. The copy is fixed, observational, and
asserted by test to contain:

- no causal claim (`geliştirdi`, `sayesinde`, `öğrendin`, `başardın`)
- no score, percentage, or lifetime total
- no time-window language (`bu hafta`, `son 7 gün`, `bugün`)
- no internal label (`operationId`, `studyEvents`, `repeated_struggle`, `solved`)

No confetti, no XP, no reward mechanics. The value is that the student can see
what they just did.

## Determinism

Moments sort by kind priority (recovery → repeated_struggle → steady → mixed),
then share of the session, then topic key. Insertion order is never relied on —
asserted by building the same receipts forward and reversed.

## Scope Decision — Which Sessions Get A Reflection

**Mandatory review session: yes.** It has a real completion state reached by
doing the work.

**Adaptive session: deliberately excluded.** Verified in source:
`useAdaptiveStudySession` sets `questions` once from the plan and never shrinks
it, so `isAdaptiveDone` (`adaptive.questions.length === 0`) is an **empty-plan
state, not a completion state** — it is true on entry when nothing was planned,
and a student who works through an adaptive deck never reaches it by exhaustion.
Attaching a session summary to it would summarise a session that did not happen.

**Assignment session: excluded this phase.** It *does* have a genuine completion
state, but its outcomes flow through `assignmentSession.recordProgress`, not
`useReviewSession`, so no receipt exists there; and its existing subtitle is
already an honest assignment-scoped count with a named shortfall (Phase 38).
Extending receipts into that hook is real, separable work — listed under
*Known Limitations* rather than quietly claimed.

## Session Stability

The reflection is memoized on the receipt array, which stops changing once the
session completes. The visible summary therefore describes **that** session and
cannot be rewritten by anything that loads afterwards.

`setReceipts([])` resets in `loadFirstPage`, the same place `totals` resets —
which is what keeps a previous sitting, or a previous account, out of this
session's summary.

## Legacy / Missing-Metadata Honesty

An outcome whose question metadata never resolved carries `subject: ""` /
`topic: ""`. It still **counts** toward the totals, but contributes **no topic
story** — grouping unrelated questions under one "unknown" heading would invent
adjacency that never existed.

A zero count is never rendered. A student who used no `struggled` gets no
"Zorlandım 0" chip, because a zero there is not information.

## Relationship To Existing Phases

| Phase | Relationship |
|---|---|
| 41 counters | Untouched. Cumulative counters are never blended into a session claim. |
| 42 `buildLearningState` | Not called. Session sequence is directly observed, not classified. |
| 45 / 61 adaptive ranking | Untouched. No comparator, no ordering key added. |
| 59 `studyEvents` | Read never, written never. Only its `operationId` convention is reused. |
| 62 review readiness | Untouched. |
| 63 / 64 session composition | Untouched. Composition decides order; this only reports it. |
| `reviewScheduler` | Untouched. No timing logic exists in this phase. |

## Query Architecture / Cost

**Zero new reads, writes, listeners, polling, indexes, collections, fields,
Cloud Functions, security rules or dependencies.**

| Surface | Phase 66 reads |
|---|---|
| App launch | 0 |
| Student Feed | 0 |
| Study Hub | 0 |
| Review session | 0 (in-memory receipt) |
| Per outcome | 0 |

## Error / Offline Behaviour

A failed outcome write throws before the receipt is appended, so the summary
degrades to "fewer outcomes", never to "wrong outcomes". Nothing in the closure
screen can block study, and an empty reflection renders `null` — the screen's
own completion copy still shows.

## Accessibility

The outcome sequence carries `accessibilityLabel` spoken as an ordered list —
`"1. Zorlandım, 2. Çözdüm, 3. Çözdüm"` — so the chronology survives for a reader
who cannot see the arrow row.

Counts are **text label + value**, never colour alone. Semantic colour
(`success` / `danger` / `textSecondary`) is reinforcement, not meaning.

## Theme & Responsive

`themedStyles` + `useThemeSubscription()` — the Phase 49 runtime contract, so
`memo()` cannot freeze the card against a theme change. No raw hex, no CSS named
colours; sweeps on all four touched files returned NONE.

Verified at 375px in dark theme and at 150% text zoom: the sequence row and count
chips wrap rather than clip, and the page never scrolls horizontally.

## Localhost Runtime Acceptance

Emulators + Expo web. Canonical fixtures are all future-scheduled, so nothing is
due; three temporary emulator-only due items were created, a real review session
was completed through the UI, and the data was deleted afterwards.

## Runtime Evidence

Rendered from real confirmed outcomes:

```
Bugünkü tekrarların tamamlandı 🎉
3 çalışma sonucu kaydedildi
Çözdüm 2   Zorlandım 1
Denklemler
Zorlandım → Çözdüm → Çözdüm
Bu çalışmada zorlanmanın ardından çözüm görüldü.
```

Firestore confirmed the same three outcomes server-side: `p66-d1` went
`attemptCount` 4 → 7 with exactly three `studyEvents` (`struggled | solved |
solved`). Exactly-once held end to end.

The QA run also produced better evidence than intended. Synthetic clicking landed
all three outcomes on the **same** question, which is precisely the case the
counting rule exists for — and the screen said **"3 çalışma sonucu kaydedildi"**,
not "3 soru". The honesty rule was proven by accident, with real data.

## iOS Decision

**NOT REQUIRED THIS PHASE.** One pure service, one presentational component, one
hook field, one screen swap. No native dependency, config, permission,
safe-area, gesture, storage, navigation or platform API changed.

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | 149 suites / 2568 tests (+1 suite / +30) |
| rules | 5 suites / 365 tests (unchanged) |
| functions build | PASS |
| verify | PASS |
| expo-doctor | 17/18 (known pre-existing drift) |
| `git diff --check` | PASS |

The rules suite first reported 3 timeout failures while the dev server, Metro and
a second emulator set were still running; suite times were 241–274s against a
normal ~35s. Re-run on a quiet machine: **365/365 in 56s**. The three tests
covered message rate-limiting, notification mark-all and storage rules — none of
which this phase touches.

## Source Encoding Sanity

Phase 63 once shipped a heredoc-mangled NUL byte that made a `.ts` file read as
binary. All five touched files were explicitly scanned: **0 NUL bytes**, valid
UTF-8, LF-only, no conflict markers, and `git diff --numstat` reports real line
counts rather than binary markers.

## Temporary QA Cleanup

`questions/{p66-d1,p66-d2,p66-g1}` and
`users/demo-student-a/studyItems/{p66-d1,p66-d2,p66-g1}` deleted, plus the 3
`studyEvents` the QA run wrote, so no temporary question id survives in the
chronological record. Existence check confirmed removal. No debug instrumentation
was added this phase; a scan for `console.*` / `debugger` / TODO markers on the
touched files returned none.

## Known Limitations

- **Review sessions only.** Assignment sessions have a real completion state but
  no receipt; adaptive has a receipt-shaped gap that is not worth filling until
  its "done" state means something (see *Scope Decision*).
- **Not persisted.** Backgrounding the app mid-session loses the receipt, and the
  completion screen would then show a smaller count than the server holds. This
  is the correct trade against inventing a session id, but it is a real edge.
- **Two moments maximum.** A session spanning five topics reports the two most
  useful; the rest are visible only in the totals.
- **The adaptive completion screen still says "Bugün N soru çözdün"** from a
  daily counter on a screen titled "Çalışma tamamlandı" — a pre-existing wart
  this phase deliberately did not touch, since fixing it means changing what that
  screen *means*, not what it prints.
- Canonical fixtures cannot exercise any of this (nothing due), so runtime used
  temporary, fully-removed emulator data.

## Final Product Assessment

The session that just ended is now the one surface in the product that can state
sequence as fact rather than inference, because it is the only place where the
order is genuinely observed. The old line it replaced —
`"N soru tekrar edildi · M doğru"` — was not merely thinner: it silently dropped
`again` outcomes from its count entirely.

The discipline that mattered most was refusing to reconstruct sessions from
`studyEvents` timestamps. That would have been easier, would have survived
backgrounding, and would have quietly lied whenever a student studied twice in
an hour.
