# Roadmap

Each phase must leave the application in a working, demoable state. No phase begins until the previous one is approved.

## How to read this file

This roadmap was written for Phases 1–11 and then stopped being updated while
development continued through a phase numbering that exists **only in commit
messages**. This file has been reconciled against the actual commit history
(`git log`) and the actual contents of `src/`, `app/`, and `functions/src/`.

Two rules were applied while reconciling:

- A phase is marked ✅ only if the code that implements it exists in the tree today.
- A phase number is stated only where a commit message states it. Where the
  number could not be established from a commit message, the entry is marked
  **kapsamı belirsiz (scope not recorded)** instead of being guessed.

## Numbering caveats (real inconsistencies, not editorial ones)

- The original Phase 9 is "Leaderboards", but commit `cc71856` refers to a
  **"Phase 9.1"** that added *student posting to class questions*. The two are
  unrelated features sharing a number.
- Commit `7abfd2f` (2026-08-12) refers to **"Phase 28's adaptive
  StudySessionScreen"**, while commit `adef732` (2026-08-14) refers to
  **"Phase 27's topic hotspots"** — code that landed two days *after* Phase 28.
  The commit-message numbering is therefore not strictly chronological.
- No commit message records a phase number between Phase 7 and Phase 25.

---

# Original roadmap (Phases 1–11)

## Phase 1 — Bootstrap ✅
Folder structure, Firebase configuration, Expo/TypeScript/ESLint configuration, documentation. No business features.

## Phase 2 — Authentication ✅
Student / Teacher / Organization Admin / Platform Admin roles via Firebase custom claims. Teacher/admin accounts are never self-registered — only promotable server-side via `adminSetUserRole`. Student registration, email/password login, logout, password reset, email verification, persistent sessions, protected + role-aware routing, Turkish validation/error messages, Firestore rules tests. See [ARCHITECTURE.md](ARCHITECTURE.md#authentication) and [SECURITY.md](SECURITY.md).

Extended well past the original scope in later, unnumbered phases: Google Sign-In (`googleAuth.ts`), a multi-step onboarding flow (`functions/src/onboarding/`), username claiming (`functions/src/users/setUsername.ts`), teacher role requests (`functions/src/teacherRequests/`), and stored-account switching (`AccountSwitcherSheet.tsx`).

## Phase 3 — Question Upload ✅
Students upload question images (PDFs later) to Cloud Storage. Metadata written to Firestore. Visibility: private / class / friends.

## Phase 4 — Swipe Feed ✅
TikTok-style vertical one-question-per-screen feed. Virtualized, animated, fast-loading.

## Phase 5 — Review System ✅ (implemented, but not where this file said it would be)
Spaced-repetition scheduling: wrong answers resurface sooner, correct answers later.

Shipped in the unnumbered "adaptive study engine" work (`1b0eeb7`), not as a
standalone Phase 5. Two corrections to the original description:

- The engine lives in [`functions/src/study/reviewScheduler.ts`](functions/src/study/reviewScheduler.ts) — a pure, server-authoritative function. `src/features/review/` is still an empty placeholder (`.gitkeep` only); all client-side study code lives in `src/features/study/`.
- It is **not** driven by [`REVIEW_CONFIG`](src/constants/config.ts). `REVIEW_CONFIG` is defined but referenced nowhere else in the repo; the scheduler uses its own named constants (`AGAIN_DELAY_MINUTES`, `FIRST_SOLVED_INTERVAL_DAYS`, `SOLVED_INTERVAL_MULTIPLIER`, `MAX_INTERVAL_DAYS`, mastery thresholds). Either wire the config up or delete it — today it is dead.

## Phase 6 — Social Feed, User Profiles, Likes and Comments ✅
Public/private/class question visibility. Merged own+public paginated social feed. Public user profiles via a safe-field `publicProfiles/{uid}` mirror. Like system for questions and answers via transactional Cloud Functions callables. Comment system for questions (no nested replies). Server-maintained aggregate counts (`likeCount`, `commentCount`, `answerCount`). Storage paths encode visibility directly. See [ARCHITECTURE.md](ARCHITECTURE.md#social-feed-phase-6) and [SECURITY.md](SECURITY.md#social-feed-phase-6).

Commits: `9a8fb73`, `41e9618`.

## Phase 7 — Classes ✅
Real class membership: teachers create classes; students join via code; teachers monitor progress. `class`-visibility questions are readable by classmates.

Landed in `4621c1e` (classes + direct teacher onboarding + public identity model) and completed across a run of follow-up commits: the missing `classes` composite index (`759dda3`), the student scrollable class feed (`4698f9b`), class chat (`c5d8d03`), student class-question posting and the stale-rules deploy that was blocking it (`cc71856`). Cloud Functions: `createClass`, `joinClassByCode`, `leaveClass`, `removeClassMember`, `regenerateClassJoinCode`.

## Phase 8 — Friends ✅ (partially)
Friend graph: ✅ — `functions/src/friends/` (`sendFriendRequest`, `respondToFriendRequest`, `cancelFriendRequest`, `removeFriend`) plus `src/features/friends/`. Landed in `276efe3`.

Friends solving each other's questions and uploading solutions: ❌ — no solutions feature exists in the tree.

## Phase 9 — Leaderboards ❌ Not started
`src/features/leaderboards/` contains only `.gitkeep` files. `totalPoints`/`weeklyPoints` are initialized to `0` by `onUserCreate` and mirrored by `syncPublicProfile`, but **nothing anywhere awards points**. No leaderboard query, screen, or Cloud Function exists.

(See the numbering caveat above: the "Phase 9.1" referenced by `cc71856` is class-question posting, not this.)

## Phase 10 — Notifications ✅ (partially)
In-app notification center and activity inbox: ✅ — `functions/src/notifications/` (`createNotification`, `markNotificationRead`, `markAllNotificationsRead`, dedupe keys, question-event decisioning) plus `src/features/notifications/`. Landed in `979a3de`.

Firebase Cloud Messaging / push: ❌ — the repo contains no `expo-notifications`, no `firebase/messaging`, and no FCM token handling. Everything is Firestore-backed and in-app only. Streak reminders and review-reminder pushes are not implemented.

## Phase 11 — AI Features — kapsamı belirsiz (scope not recorded)
Still TBD as originally written. The only external-model integration in the tree is the moderation vision provider (`functions/src/moderation/visionProvider.ts`), which shipped under the moderation work, not under this phase.

---

# Phases as actually executed (post–Phase 7)

Ordered newest first. Phase numbers are given only where a commit message
states or directly implies one.

## Phase 44 — Intervention effectiveness ✅
`213abd1`. `interventionEffectiveness.ts` + `useInterventionEffectiveness` + `InterventionOutcomeCard`: compares an assignment submission's frozen `questionOutcomes` against the student's live learning state, and refuses a verdict (`insufficient_data`) unless work was done *after* the intervention. No new collection, Cloud Function, or rules change.

## Phase 43 — Diagnosis → intervention ✅
`460f1bf`. `teacherIntervention.ts` turns a class/student diagnosis into a targeted assignment action inside `ClassPerformanceScreen`/`StudentPerformanceScreen`.

## Phase 42 — Learning state / persistent struggle ✅
`36142c8`. `learningState.ts`'s `buildLearningState` (explicitly named "Phase 42's buildLearningState" in `213abd1`), surfaced to teachers via `studentAttention.ts` and `classTopicInsights.ts`.

## Phase 41 — Cumulative learning outcome signals ✅ — number inferred, not stated
`faf7528`. `outcomeCounters.ts` plus server-written counters in `recordStudyOutcome`. Sits between the commit-stated Phase 40 and Phase 42; no commit states its number.

## Phase 40 — Adaptive learning engine audit ✅
`8187e58`. Explicitly labelled "PHASE 40 — ADAPTIVE LEARNING ENGINE audit". Verified the closed loop (state → mastery → weakness/forgetting-risk → session composition → next action → outcome → mastery update) was already implemented and tested; the one real gap found was `learningMoment.ts`'s missing unit tests, closed with 11 tests. No production code changed.

## Phase 39 — Unified student next action ✅
`e89bb67`. `studentNextAction.ts` + `nextActionCopy` + `NextActionSection`/`AssignedWorkSection` — named as Phase 39 by the Phase 40 audit.

## Phase 38 — StudyAnswerButton route guards ✅ — attribution uncertain
`5fad82a` adds what it calls "Phase 38 guards" while its own subject line says Phase 37; `507745f` and `9bcd63d` (bounded web session rendering fallback) follow. Which commit *is* Phase 38 — kapsamı belirsiz (scope not recorded).

## Phase 37 — Study/assignment session layout root cause fix ✅
`5fad82a`. Stated in the subject line. Replaced `flex: 1` hero images with `aspectRatio`, collapsed image + outcome controls into one `StudyOutcomeCard` in a single ScrollView, and added the shared `StudyAnswerButton` ("Cevapla") entry point.

## Phase 36 — Shared study outcome card ✅
`c5717e5`. Extracted `StudyQueueCard`'s card styling into `StudyOutcomeCard.tsx` (named as "Phase 36" by `5fad82a`).

## Phase 35 — Session card viewport overflow fix ✅
`1149fb2`. `studySessionLayout.ts` (`computeSessionCardHeight`, `computeSessionSnapOffsets`) plus the capped ScrollView safety net that `c5717e5` calls "the Phase 35 ScrollView safety net".

## Phase 34 — Assignment publish permission-denied ✅
`acf6841` (force-refresh ID token claims on stored-account switch) and `ae28f20` (the real root cause: production Firestore rules were never redeployed after `1b0d9bb` added the `assignments` block, so every write hit the default-deny catch-all). Both label themselves Phase 34.

## Phase 33 — Assignment publish error surfacing ✅
`7ed7abe`. Labels itself "Phase 33 audit". Added `assignmentPublishMessages.ts` and Phase 33 regression tests; no rule or payload change.

## Phases 30–32 — Smart assignments ✅ — numbers not recorded
`1b0d9bb` (assignments + submissions collections, snapshot question/target sets, rules, student session via `StudySessionScreen` `mode="assignment"`), `26d61d0` (`smartAssignmentSelection.ts`, `assignmentQuestionPool.ts`), `81cec5c` (`assignmentFollowUp.ts`, `assignmentOutcomeInsights.ts`, `assignmentHistorySignals.ts`), `c545fd6` (`studyWeek.ts`, teacher weekly performance). The Phase 33 audit implies these precede 33, but no commit states their numbers — kapsamı belirsiz (scope not recorded).

## Phase 28 — Teacher action center ✅ — number conflicts with the study-session Phase 28
`adef732`. `teacherActionSummary.ts`, `useTeacherQuestionComposer`, prefillable `QuestionMetadataModal`. Follows `5d5a0ce` in history but the number is not stated; see the caveat above.

## Phase 27 — Teacher classroom intelligence ✅
`5d5a0ce`. `studentAttention.ts`, `classTopicInsights.ts`, `classTrend.ts`, `boundedConcurrency.ts`; Class Health / Topic Hotspots / Student Attention on `ClassPerformanceScreen`. Named "Phase 27" by `adef732`.

## Phase 28 (study) — Adaptive study session ✅
`d157daa`. `StudySessionScreen`, `useAdaptiveStudySession`, `studySessionQuestions.ts` — called "Phase 28's adaptive StudySessionScreen" by `7abfd2f` and "Phase 28" by the Phase 40 audit. Followed by `7abfd2f` (routing fallback + deploying the two missing moderation callables) and `0e46e30` (tap-time due-ness re-check, exit guard, `staleResponseGuard.ts`).

## Phase 25 — Adaptive learning engine ✅
`3e207e5`. `topicMastery.ts` (MasteryBand), `recencySignal.ts`, `learningTrend.ts`, `learningMoment.ts`, and `dailyPracticePlan.ts`'s `buildAdaptivePracticePlan` — all four attributed to "Phase 25" by the Phase 40 audit.

## Phase 29 — Moderation deployment ✅ — attribution uncertain
`ae28f20` refers to "Phase 29's undeployed submitAnswerForModeration Cloud Function". That function was written in `2fdb5b5` (2026-08-06) and deployed in `7abfd2f` (2026-08-12); which of the two is Phase 29 — kapsamı belirsiz (scope not recorded).

## Phases 8–24 — kapsamı belirsiz (scope not recorded)
No commit between `4621c1e` (Phase 7) and `3e207e5` (Phase 25) states a phase number. The work in that window, in order, is real and shipped: auth/onboarding/route-guard hardening (`aa6aa66`…`b1ae113`), class creation and class feed completion, class chat (`c5d8d03`), teacher profiles + friendships (`276efe3`), account switching (`9ab9f8b`), the "premium" UI redesign run (`19c9059`, `1800744`, `b2f6fcd`, `7972e1b`, `c85eb42`, `657f7aa`), production hardening (`b4aeeb9`), notification center (`979a3de`), transaction read-before-write ordering (`0fcaad1`), the adaptive study engine and review sessions (`1b0eeb7`), moderation infrastructure (`2fdb5b5`), the interleaved study rating feed (`d1e5f50`), question metadata + multiple choice + feed filters (`936344f`), the personalized learning hub (`e5a57b7`), the daily practice plan (`e3d283f`), and a P0/P1 release-hardening pass (`b0dcc14`). Also in this window: the adaptive question feed (`0e0c4a7`) and the teacher class performance dashboard (`38c39e9`), both after Phase 25's engine landed.

Mapping these to individual phase numbers would be a guess, so no numbers are asserted here.

---

# Not implemented

- **Leaderboards and any points award path** (original Phase 9).
- **Push notifications / FCM** (original Phase 10's actual delivery mechanism).
- **Solutions**: student explanations with teacher verification (part of original Phase 8).
- **PDF question upload** (deferred since Phase 3; images only).
- **AI features** (original Phase 11).
- **Subscriptions, payments, moderation dashboard** — never scoped.
