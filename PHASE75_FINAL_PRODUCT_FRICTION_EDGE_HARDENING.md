# Phase 75 — Final Product Friction Audit + Edge-State Hardening

## Repository Sync

Baseline `14bace2` (Phase 74). Remote `origin/phase17-moderation-infrastructure-20260806-195814`
was identical (`0 0`), worktree clean, `git merge-base --is-ancestor 14bace2 HEAD` held. Nothing
pulled, nothing to pull. No `PHASE75*.md` existed.

## Runtime Emulator Safety Gate

Phase 74 sent two failed sign-in attempts at production before the environment problem was
noticed. This phase proved attachment before typing anything.

`.env` was not modified and still reads `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=false`. Expo was
launched with the flag exported in the shell, which `config.ts` reads through bracket access
specifically so the shell value wins over the bundled `.env` snapshot.

Proof obtained **before any credential was entered**:

1. In the live page, `process.env.EXPO_PUBLIC_USE_FIREBASE_EMULATORS === "true"`.
2. The app rendered. `config.ts` throws when the flag is true and `auth.emulatorConfig` is still
   null, so rendering at all is proof Auth bound to the emulator.
3. Observed Auth traffic: `POST http://127.0.0.1:9099/securetoken.googleapis.com/v1/token` — the
   emulator's proxy path. The host is the emulator, not `securetoken.googleapis.com`.
4. Enumerating every resource the page had fetched, the only non-local host was
   `www.gstatic.com` (a static SDK asset). No `identitytoolkit.googleapis.com`, no
   `firestore.googleapis.com`.

Firestore was confirmed the moment the first authenticated screen loaded: every Firestore request
went to `127.0.0.1:8080`, and the non-local host set was still only `www.gstatic.com`.

**No production Auth or Firestore endpoint was contacted at any point in Phase 75.**

## Starting Baseline

`14bace2`, branch `phase17`, clean.

## Audit Method

Code audit first, then runtime reproduction of each candidate. Findings were only accepted as
real when the failing path could be pointed at in source and, where the surface was reachable,
observed in the browser. Nothing was changed on suspicion.

## Friction Inventory

The headline result is that the learning-critical paths are already hardened. Study outcome
writes, answers and comments all carry `operationId` idempotency; `useStudyQueue` and
`useLearningInsights` both guard stale responses with a request id *and* an active-uid ref;
`useNavigationGuard` covers double-tap navigation across twelve screens; Concept Mastery Map and
Struggle Pattern Memory already gate their empty state on `!error`.

What the audit found were five real defects clustered at the edges of that core.

## P0 Findings

None. No data, integrity or security defect was found. Outcome writes, counter honesty and the
teacher intervention chain are untouched and intact.

## P1 Findings

**Question creation could be submitted twice by a double-tap.**

All three composers (`useUpload`, `useTeacherQuestionComposer`, `useStudentQuestionUpload`)
guarded with `if (... || isUploading) return`, where `isUploading` is React state. A handler
closes over the value from the render that created it, and `setIsUploading(true)` only takes
effect on the next render — so two taps landing before that render both read the stale `false`
and both proceed. Disabling the button does not help: the button becomes disabled on the same
re-render the guard is waiting for.

This matters here specifically because question creation is **the only durable write left in the
app with no server-side backstop**. Answers, comments and study outcomes all carry an
`operationId` that makes the backend return the original submission. `createQuestion` is a plain
`addDoc`, so a second run genuinely creates a second Storage object and a second question
document.

The repo had already recognised this exact class of bug four times — `createKeyedNavigationLock`,
`useReviewSession`'s `submitLockRef`, `useStudyQuestionState`, `DailyGoalEditor` — and fixed it
with refs each time. The composers were the ones that had been missed.

## P2 Findings

**A failed read on Learning Story rendered as an empty learning story.**

`StudentLearningStoryScreen` destructured only `{ items }` from `useLearningInsights`, discarding
`error` entirely, and took its loading gate from a *different* hook (`useStudyQueue`). Two
consequences, both reproducible:

- `useStudyQueue` fetches one page of due items and settles first; `useLearningInsights` loads
  every study item plus metadata. Between the two, `items` was `[]` with `isLoading` already
  false, so the screen briefly announced **"Henüz anlatacak bir hikâye yok"** to a student who
  has one.
- If the insights read *failed*, nothing distinguished it from that same empty state. The screen
  told the student their evidence did not exist, when the truth was that we could not load it.

For a product whose entire thesis is evidence honesty, this is the worst sentence it can say.
`TeacherLearningStoryScreen` had the identical defect against `useClassPerformance`.

**Question Detail had no way forward from a failed read.** Every comparable screen in the app
reports a failed read as an `EmptyState` with a "Tekrar Dene" button. This one — the screen a
deep link is most likely to land on — rendered a bare centred sentence, even though
`useQuestionDetail` has always exposed an unused `reload`.

**A missing route parameter claimed a technical failure.** `useQuestionDetail(undefined)` left
`errorMessage` null, and the screen's `errorMessage ?? "Soru yüklenirken bir hata oluştu."`
fallback turned that into a report of a failure that never happened.

**Notifications instructed a retry with nothing to tap.** `description="Tekrar dene"` was the
EmptyState's descriptive text, not a control. The screen's own `refresh` is wired only to the
list's pull-to-refresh, and the error branch replaces the list — so there was no way to retry at
all.

## P3 Findings

Label drift between the "Tekrar Dene" button and "Tekrar dene" inline text. Left alone except on
the surfaces already being changed, which now use the button label. Sweeping the rest would have
been repo cleanup, not friction removal.

## Student Empty States

No study evidence, no due reviews, no concept evidence, no patterns, no hints, no session plan —
all audited. Concept Mastery Map and Struggle Pattern Memory both compute `!isLoading && !error &&
isEmpty`, which is exactly right and was left untouched. Learning Story was the one screen that
did not, and is fixed. No empty state claims mastery, and none is styled as an error.

## Teacher Empty States

Empty class, students without evidence, no assignments, no intervention, empty heatmap: all
factual and distinct. Student D still reads "Daha fazla kanıt gerekiyor" rather than being
counted as zero. Teacher Learning Story's empty state is now suppressed on error like the rest.

## Loading State Audit

The empty-flash on Learning Story is fixed by gating on both hooks. Account-switch and
class-switch staleness were checked and are already handled: both student hooks carry
`requestIdRef` plus `activeUidRef`, and reject a superseded response instead of painting it.
Verified at runtime in both directions — student → teacher and teacher → student — with no
previous account's data visible.

## Error / Retry Audit

Nine of twelve error screens already offered a retry. Question Detail and Notifications did not,
and now do. `ClassChatScreen` and `FindFriendsScreen` remain without one, deliberately: chat has
its own per-message retry affordance, and a failed search is retried by searching again.

Retry is offered only where retrying can change the answer. Question Detail distinguishes
`unavailable` (retryable) from `not_found` and `unauthorized` (settled), and shows the button
only for the first — a retry button on "Bu soru bulunamadı" would invite the reader to keep
tapping at something that cannot change.

No raw `FirebaseError`, error code or stack trace reaches any user-facing string.

## Double-Tap Audit

Answer, rating and comment writes are protected by `operationId` and were not touched. Login is
guarded by `isSubmitting` in `useLoginForm`; a duplicate auth attempt is rejected by the backend
and creates nothing. Navigation double-taps are covered by `useNavigationGuard`. Question
creation was the gap, and is fixed with a synchronous ref lock released in `finally`, so a failed
upload leaves the button usable.

## Routing / Deep-Link Audit

Direct navigation to Study Hub, Concept Map, Patterns, Learning Story, Class Performance and
Student Performance all resolve correctly. A nonexistent question id resolves to the calm
"yetkiniz yok" state that Firestore's rules make unavoidable (existence cannot be leaked to an
unauthorised caller), with a working back control. A student route opened under a teacher account
redirects to the teacher's own home — auth gating intact. No routing loop was observed or
introduced; `decideRouteGuardTarget` is untouched.

## Auth / Account Switching

Student → teacher and teacher → student both verified at runtime with a full sign-out in between.
No learning data, class data, session or onboarding state crossed accounts. The guided tour's
completion record stayed correctly scoped by (account, audience).

## AsyncStorage Corruption

Theme, guided tour and active study session were re-checked against their existing contracts.
All three fail closed on malformed JSON and on an unknown version, all three never throw on a
read or write failure, and none deletes an unreadable record — a future client's data survives.
The guided tour's bounded 8-entry policy is unchanged. No change was needed here.

## Adaptive Session Edge States

Empty plan, short plan, refresh before and after the first outcome, completion, acknowledgement
and the 12-hour per-slot staleness rule were reviewed against Phases 65–69. No defect found and
nothing changed. The frozen-plan answerable-entry behaviour from Phase 68 is intact.

## Review Edge States

Zero due, single due item, pagination boundary, refresh and the completed snapshot were reviewed.
The Phase 63/64 raw Firestore cursor is untouched, as required.

## Hint Edge States

Legacy questions with no hints show no hint action at all; one hint retires the action after the
first reveal; three reveal progressively. `questionHints.ts` and `QuestionHintLadder` have zero
diff this phase and are covered by their existing 30 tests. Hint reveal still mutates no evidence.

## Onboarding Edge States

Fresh, skip, complete, replay, wrong role, wrong user, malformed storage and the bounded record
are all covered by the 49 tests added in Phase 74 and were re-run green. The overlay's modal
semantics (`accessibilityViewIsModal`, `role="dialog"`, `aria-modal`) are unchanged.

## Teacher Intervention Edge States

Phase 43/44/47 semantics are untouched: explicit `interventionOf` still wins, the legacy
heuristic still runs only when there is no explicit candidate, and no new classifier exists. The
Phase 73 eight-assignment window remains a documented limitation — a student whose newest relevant
assignment falls outside it keeps their verdict on their own screen, and the class Action Center's
silence is not phrased as "no follow-up exists".

## Offline / Network Behavior

No offline architecture was added. An attempt to inject a Firestore read failure at runtime by
blocking requests to `127.0.0.1:8080` did **not** produce an error: the Firestore web SDK served
the query from its own cache and the screen rendered real content. That is worth stating plainly —
the error-precedence fix is proven by the twelve `resolveStoryPanel` unit tests, not by a runtime
failure injection, because the SDK's caching made a read failure unreachable from the browser.

## Responsive

375px verified on every changed surface, light and dark, plus 150% on Question Detail's error
state and both Learning Story screens. No horizontal overflow, no clipping, no fixed heights.
Desktop is unchanged — no layout or measure was touched this phase.

## Accessibility

The two new error affordances use the existing `EmptyState` + `PrimaryButton` pair, so they carry
the same roles and 48pt targets as the nine screens that already used it. Both new error banners
are `accessibilityRole="alert"`, matching Phase 70/71. No meaning is carried by colour alone — the
banners state the failure in words.

## Fixes Implemented

1. `createSubmitLock` / `useSubmitLock`, adopted in all three question composers, closing the
   double-submit on the one durable write with no server idempotency.
2. Student Learning Story: reads `error`, gates loading on both hooks, and reports a failure as a
   failure.
3. Teacher Learning Story: the same fix against `useClassPerformance`.
4. `resolveStoryPanel`, so the precedence "loading beats error beats empty" is stated once and
   tested, instead of being re-derived as a ternary chain per screen.
5. `QuestionDetailFailure`, so the screen can tell a recoverable failure from a settled answer,
   and offer retry only for the former.
6. Question Detail's error state adopts the app-wide `EmptyState` + "Tekrar Dene" convention and
   wires the `reload` the hook already exposed.
7. A route opened without a usable question id now reports "not found" instead of a technical
   failure that never happened.
8. Notifications' "Tekrar dene" becomes a real button wired to the existing `refresh`.

## Intentionally Not Fixed

- The remaining twelve `if (isSubmitting) return` guards. Each is either backed by server
  idempotency (answers, comments) or writes something idempotent (profile save, class join, auth
  attempt). Converting them would have been a repo-wide sweep with no defect behind it.
- `ClassChatScreen` and `FindFriendsScreen` error states without a retry button — both have a
  natural retry already.
- The pre-existing `__DEV__` console instrumentation in the upload path. It is dev-only, predates
  this phase, and removing it is unrelated cleanup.
- Label casing drift outside the changed screens.
- Firestore's inability to distinguish "deleted" from "not yours" on a denied question read. That
  is a rules-level property protecting existence, not a bug.

## Backend Cost

New reads 0 · writes 0 · listeners 0 · Functions 0 · rules 0 · indexes 0 · polling 0 · N+1 none.
Every change is client-side control flow.

## Regression

Phases 42–47 and 59–74 untouched by the diff: no classifier, scheduler, counter, rules or
intervention file appears in it. Student Feed zero diff. Hint Ladder zero diff. Full suite green
at 162 suites / 2959 tests.

## iOS Decision

New native dependency **NO** · native package **NO** · native config **NO** · native permission
**NO** · native-only API **NO** · native-specific gesture **NO** · native-only storage behaviour
**NO** · native routing behaviour **NO** · newly-changed safe-area behaviour **NO** · confirmed
native-only bug **NO**.

**NATIVE IOS: NOT REQUIRED THIS PHASE.**

## Automated Validation

typecheck PASS · lint PASS · unit 162 suites / 2959 tests (+2 suites / +28) · rules 5 suites / 370
tests · functions build PASS · verify PASS · expo-doctor 17/18 (known pre-existing drift) ·
`git diff --check` PASS.

## Source Integrity

No binary source, no NUL bytes, valid UTF-8, LF-only. No raw colours and no debug instrumentation
added. No temporary QA record was created — Phase 75 runtime QA was read-only apart from sign-ins.
`.env`, lockfiles, `firestore.rules`, `app.json`, `routing.ts` and `main` untouched.

## Known Limitations

- The Firestore read-failure path is covered by unit tests rather than runtime injection, because
  the web SDK's cache made a forced failure unreachable from the browser.
- `useSubmitLock` is a client guard, not idempotency. It closes the double-tap window; it cannot
  protect a retry after a lost response the way an `operationId` does. Question creation still has
  no server-side idempotency, and adding one would be a backend change outside this phase.
- The twelve state-closure guards listed above remain, protected by their own backstops rather
  than by a lock.
- The Phase 73 eight-assignment window is unchanged.

## Release Candidate Readiness

The learning-critical paths were already sound before this phase, which is the most important
finding in it. What Phase 75 removed were the edges: a duplicate question a fast tap could
create, two screens that told a learner their evidence was empty when the read had failed, and
two dead ends with no way forward. Those were the remaining places where the product could feel
unfinished rather than merely incomplete.
