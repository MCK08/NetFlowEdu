# Changelog

All notable changes to this project are documented here.

## [Unreleased]

> **Note on Phases 7–44.** These entries were reconstructed from `git log` on
> 2026-08-22, after the changelog had gone unwritten since Phase 6. Each entry
> names the commits it is built from. A phase number is given only where a
> commit message states or directly implies one; otherwise the entry is marked
> *unnumbered* or **kapsamı belirsiz (scope not recorded)** rather than guessed.
> See [ROADMAP.md](ROADMAP.md) for the known numbering inconsistencies.

> **Note on Phase 44.** `213abd1` and `b385c6e` both call themselves "Phase 44"
> in their own commit messages. Split below into 44A (the effectiveness engine)
> and 44B (the attribution fix on top of it), per the numbering canonicalized
> ahead of Phase 48. Commit hashes and messages are unchanged.

### Phase 47 — Post-Intervention Teacher Next Action (`903a528`, 2026-08-21)
- New pure `postInterventionAction.ts`: `resolvePostInterventionAction(effectiveness, confidence)` → `monitor` / `follow_up` / `escalate`, wired into `StudentPerformanceScreen` exactly where the Phase 44A verdict was already computed. Previously nothing consumed the verdict — the "Takip Ödevi Oluştur" CTA was gated only by Phase 42's lifetime, monotonic `persistentStruggleTopics`, so a fully recovered student kept seeing the same repeat-intervention prompt.
- Decision contract: `improved` → `monitor` unconditionally; `confidence === "low"` → `monitor` regardless of direction (covers every `insufficient_data` verdict, always low by construction); `worsened` + medium/high confidence → `escalate` (same CTA, stronger reason text); `no_change` + medium/high confidence → `follow_up` (existing CTA, unchanged).
- Reuses the existing targeted-assignment composer route (`openInterventionForStudent`) — no new composer, write path, schema, or collection. `teacherActionSummary.ts`/`ClassPerformanceScreen` untouched (no per-student effectiveness data loaded there).
- All four reason strings are observational, not causal — locked in by a regex test that none of them claims the assignment "başarılı/başarısız oldu".
- 12 new tests (`postInterventionAction.test.ts`); full suite 133 suites / 2211 tests. Rules/Functions diffs empty. Expo web smoke-test passed; the full authenticated teacher walkthrough was not run in this environment and is reported as unverified, not as a pass.

### Phase 46 — Cumulative-Evidence Reinforce Selection (`d0bdbb5`, 2026-08-21)
- `smartAssignmentSelection.ts`'s reinforce strategy already put any-struggle questions in a dedicated tier, but couldn't distinguish a question 8 targeted students struggled with repeatedly from one struggled with once — both fell back to an arbitrary base tiebreak. Same class of gap as Phase 45's, in the reinforce assignment path instead of the adaptive study plan.
- `TargetedQuestionSignal` gains `cumulativeStruggleCount: number | null` — the summed Phase 41 `struggledCount` across targeted students with trustworthy history on that question, read off study items `useCreateAssignment.ts` already fetches (zero new reads). `null`, never a fabricated `0`, when no targeted student has trustworthy history.
- `selectReinforce` stable-sorts the existing `struggled` array by this signal before building the final order — tier membership, `focus`/`balanced` selection, `requestedCount`, and dedupe are all unchanged.
- Legacy safety: pre-Phase-41 items contribute `null`; a large cumulative struggle count never promotes a question into the struggled tier if its most recent attempt wasn't itself a struggle.
- 17 new tests; full suite 132 suites / 2199 tests. `dailyPracticePlan.ts`, `firestore.rules`, `functions/`, `routing.ts` untouched (verified via `git diff --stat`). Expo web smoke-test passed; full authenticated reinforce-composer walkthrough not run in this environment, reported as unverified.

### Phase 45 — Cumulative-Evidence Adaptive Prioritization (`b5b66e7`, 2026-08-21)
- Phase 41's per-question cumulative outcome counters were already resolved into `LearningInsightItem.outcomeHistory`, but `buildAdaptivePracticePlan`'s comparator never read them — only topic-level `masteryBand`/recency, both derived from a single most-recent outcome. Two questions in the same topic with tied topic-level signals were indistinguishable regardless of how many times each had actually been struggled with.
- Fix: `dailyPracticePlan.ts`'s `adaptiveComparator` gains one ordered tie-break — `outcomeHistory.struggledCount` — inserted after mastery/recency and before the existing `nextReviewAt`/id fallback. Reuses the exact field Phase 41 already wired; no new field, no duplicate computation.
- Tier order (`due > struggled > weak_topic > goal_fill`), `topicMastery.ts`/`recencySignal.ts`, the non-adaptive plan, and `studentNextAction.ts` are all untouched. `smartAssignmentSelection.ts` has the identical gap and was deliberately left for Phase 46.
- Recovery safety is structural, not a new rule: a question with heavy lifetime struggle but a current `lastOutcome` of `solved` never reaches tier 2 at all, so it can't outrank a question genuinely still struggling.
- 12 new tests including an explicit before/after regression pair proving the exact pre-fix tie this phase resolves. Full suite 132 suites / 2182 tests. `firestore.rules` and `functions/` diffs both empty.

### Phase 44B — Explicit Intervention Attribution (`b385c6e`, 2026-08-21)
- Root cause (Phase 44 audit): `selectMostRecentIntervention` picked simply the most recently delivered assignment targeting a student and assumed it was the intervention — an ordinary assignment published to the same student afterward could silently hijack `InterventionOutcomeCard`'s verdict onto the wrong assignment.
- `Assignment` gains one additive, optional field: `interventionOf: { subject, topic } | null`. Set only by the two explicit Phase 43 intervention CTAs, propagated through a narrow `intervention=1` route param rather than inferred from subject/topic/studentIds being present (both of which ordinary assignment flows also send).
- `selectMostRecentIntervention` now prefers explicit `interventionOf` evidence when present; falls back to the original "most recent, period" heuristic only for a fully legacy history with zero explicit interventions.
- `firestore.rules`: `interventionOf` validated on create and frozen on update, using `.get(key, null)` (not dot-access, since the field is genuinely absent on pre-Phase-44 documents). Not a security boundary — grants no read/write rights, only display attribution.
- The effectiveness engine itself (`interventionEffectiveness.ts`'s `buildInterventionEffectiveness`, `resolveStateAtIntervention`, `aggregateCurrentState`, confidence logic, `learningState.ts`, `outcomeCounters.ts`) is unchanged — this fixes assignment identity, not the effectiveness model.
- 10 new unit cases plus 10 new rules integration tests. Full suite 132 unit suites / 2170 tests, 5 rules suites / 350 tests.

### Phase 44A — Intervention Effectiveness (`213abd1`, 2026-08-21)
- New pure service `src/features/teacher/services/interventionEffectiveness.ts`: compares the state an intervention itself recorded — the assignment submission's frozen `questionOutcomes` — against the student's live learning state from Phase 42's `buildLearningState`. No new collection, no Cloud Function, no rules change, no stored snapshot.
- A verdict requires work done *after* the intervention: nothing reviewed since → `insufficient_data`, however good the current numbers look.
- Two documented judgement calls: `struggle` counts `struggled` only (not `again`), matching `learningState.ts` rather than `assignmentOutcomeInsights.ts`, so `persistent_struggle` cannot mean two different things across one comparison; and `one_off_struggle → recovering` reads as worsened, because the counters are monotonic.
- Wiring adds 2 bounded reads (class assignments + one submission doc) and reuses the study items `useStudentPerformanceDetail` already loads. `InterventionOutcomeCard` renders above the Phase 43 diagnosis.
- 51 unit tests; `npm run verify` green (132 suites / 2160 tests).

### Phase 43 — Teacher Diagnosis → Intervention (`460f1bf`, 2026-08-21)
- New `src/features/teacher/services/teacherIntervention.ts`: turns a class/student diagnosis into a concrete targeted-assignment action.
- Wired into `ClassPerformanceScreen` and `StudentPerformanceScreen` via `useClassPerformance`; `classTopicInsights.ts`, `studentPerformance.ts`, and `teacherActionSummary.ts` extended to feed it.

### Phase 42 — Persistent Learning Struggles Surfaced to Teachers (`36142c8`, 2026-08-21)
- New `src/features/study/services/learningState.ts` (`buildLearningState`) — the shared definition of a student's learning state, later reused by Phase 44A.
- `studentAttention.ts` and `classTopicInsights.ts` extended to surface persistent struggle on both teacher screens.

### Phase 41 — Cumulative Learning Outcome Signals (`faf7528`, 2026-08-21)
*Phase number inferred from position between the commit-stated Phases 40 and 42; no commit states it.*
- New `src/features/study/services/outcomeCounters.ts` plus server-written cumulative counters in `functions/src/study/recordStudyOutcome.ts` and `studyTypes.ts`.
- `learningInsights.ts`, `useLearningInsights.ts`, `WeakTopicsSection.tsx`, and `studentPerformance.ts` consume the new counters.

### Phase 40 — Adaptive Learning Engine Audit (`8187e58`, 2026-08-19)
- Audit only — no production code changed. Verified the requested closed loop (student state → mastery → weakness/forgetting-risk → adaptive session composition → next best action → outcome → mastery update) was already implemented and already tested across `topicMastery.ts`, `recencySignal.ts`, `learningTrend.ts`, `dailyPracticePlan.ts`, `studySessionQuestions.ts`, and `studentNextAction.ts`.
- No new parallel engine was built, per the phase's own rule against duplicating existing architecture.
- The one verified gap: `learningMoment.ts`'s `buildLearningMoment` had zero unit tests despite being pure and deterministic. Closed with 11 tests covering every trend state, the weak-topic branches, determinism, no-mutation, and the same explainability bar (no score/percentage/AI claim) that `nextActionCopy`'s tests enforce.

### Phase 39 — Unified Student Next Action (`e89bb67`, 2026-08-17)
- New `studentNextAction.ts` (priority engine) + `nextActionCopy` (real, non-technical explanation text), `studyDueCheck.ts`, `studyPresentation.ts`, and `assignmentUrgency.ts`.
- New `NextActionSection.tsx` and `AssignedWorkSection.tsx` on the Study Hub.

### Phase 38 — Study Session Completion & Web Fallback (`507745f`, `9bcd63d`, 2026-08-17)
*Attribution uncertain: `5fad82a` (labelled Phase 37) is what adds the "Phase 38 guards" locking `StudyAnswerButton`'s route. Which commit is Phase 38 — kapsamı belirsiz (scope not recorded).*
- `507745f`: study session cards now land below the header; assignment sessions can actually finish (`assignmentSessionCompletion.ts`).
- `9bcd63d`: bounded rendering fallback for the session screen on web.

### Phase 37 — Assignment/Study Session Layout Root Cause Fix (`5fad82a`, 2026-08-14)
- Root cause: `imageWrap` used `flex: 1` inside a fixed-height swipe page, stretching the image box to every leftover pixel and leaving dead space above the outcome section; image and outcome were also two separate blocks instead of one cohesive card, unlike the reference `StudyQueueCard`.
- Fix: one ScrollView containing one `StudyOutcomeCard` with `[image, Cevapla, description, outcome controls]` as natural content flow. `imageWrap` uses `aspectRatio` (0.78, portrait-leaning) instead of `flex: 1`, capped by `SESSION_IMAGE_MAX_HEIGHT_RATIO` (raised 0.45 → 0.62). `scrollContent` no longer vertically centers. `contentFit="contain"` still guarantees no cropping.
- Applied identically to `StudySessionAdaptiveCard` (Çalış + Ödev) and `StudySessionMandatoryCard` (Tekrar).
- Added `StudyAnswerButton` — a shared "Cevapla" entry point reusing the exact route/guard/`AnswerScreen`+moderation pipeline `QuestionDetailScreen` already uses; sessions previously had self-assessment but no way to submit a real answer without leaving.
- No rules, Functions, auth, or assignment business logic changed.

### Phase 36 — Shared Study Outcome Card (`c5717e5`, 2026-08-14)
- The "Bu soruyu nasıl çözdün?" + Tekrar Et/Zorlandım/Çözdüm section on the Ödev and Çalış swipe screens rendered in a bare unstyled `View`, inconsistent with `StudyQueueCard` (the reference design).
- New `StudyOutcomeCard.tsx`: `StudyQueueCard`'s own card style extracted into a shared wrapper rather than a coincidentally-matching duplicate. `StudyQueueCard` now renders through it too (pixel-identical).
- Regression guards in `studyCrossSurfaceConsistency.test.ts`: all three surfaces render through `<StudyOutcomeCard>`, and its styling is defined in exactly one file.

### Phase 35 — Session Cards Overflowing the Viewport (`1149fb2`, 2026-08-14)
- Root cause: `StudySessionScreen` passed the raw `useWindowDimensions()` height straight through as each card's height, ignoring the floating absolute header, the equal-height `ListHeaderComponent` spacer, and the bottom safe-area inset — so the outcome buttons sat below the real viewport, unreachable. One shared cause for all three modes (assignment, adaptive, mandatory).
- New pure, tested `studySessionLayout.ts`: `computeSessionCardHeight` (window − header − bottom inset), `computeSessionSnapOffsets` / `computeSessionItemOffset` (real per-item stops; `snapToOffsets` replaces `snapToInterval`, whose single-fixed-interval-from-zero assumption was never correct here).
- Outcome area wrapped in a ScrollView capped at `SESSION_CONTROLS_MAX_HEIGHT_RATIO` (0.55) as a safety net for pathologically long content; behaves identically to the plain `View` in the normal case.
- Tests across real device shapes, plus the invariant the bug violated: card height must always be strictly less than raw window height when a header or inset is nonzero.

### Phase 34 — Assignment Publish `permission-denied` (`acf6841`, `ae28f20`, 2026-08-14)
- `acf6841`: `AuthProvider.switchToStoredAccount` reactivated a stored account's cached Firebase `User` without ever calling `getIdToken(true)` — the one reactivation path missing that guard (`signIn()` already forced it). A device switching between a student and teacher persona keeps failing every teacher-only rule check until the cached token expires naturally. Evidence gathered read-only from the real Auth export, the real class doc, and a rules-emulator test using the exact real uid/classId/organizationId — which proved the rule and the data were both correct in isolation.
- `ae28f20`: **the actual root cause.** The Phase 34 force-refresh did not resolve the report. Proven via the Firebase Rules Management API (not guessed): production's deployed ruleset was last released 2026-08-12, while the `assignments/{assignmentId}` block was added 2026-08-14 in `1b0d9bb` and extended twice more the same day — none of it ever deployed. Fetched the live ruleset and confirmed byte-for-byte that no `assignments` block existed in production, so every assignment create/read fell through to the default-deny catch-all. Fixed by deploying the already-reviewed, unchanged `firestore.rules`; re-verified post-deploy. Same root-cause category as Phase 29's undeployed `submitAnswerForModeration`.
- Kept: the `__DEV__`-gated diagnostic logging in `useCreateAssignment.ts` that produced the evidence, and the account-switch force-refresh (independently correct even though it was not this incident's trigger).

### Phase 33 — Assignment Publish Error Surfacing (`7ed7abe`, 2026-08-14)
- Audit traced `CreateAssignmentScreen → publish() → useCreateAssignment → assignmentService.createAssignment → firestore.rules` using the real production modules against a real Firestore + Auth emulator with a realistic fixture. The exact reported configuration succeeded end to end — no rules mismatch, payload mismatch, validation bug, due-date bug, or target-resolution bug.
- What the audit did find: `prepare()`/`publish()` both had a bare `catch {}` that discarded the real Firebase error, making any future failure unreproducible from a user report. Fixed with `assignmentPublishMessages.ts` (mirroring `answerSubmissionMessages.ts`): dev-only logging of `error.code`/`message`, and a mapped message per known Firebase error code, never a raw Firebase message in the UI.
- Added Phase 33 regression tests to `firestore.rules.test.ts`, locking in the verified-working shapes. No rules loosened, no payload changed.

### Smart Assignments (`1b0d9bb`, `26d61d0`, `81cec5c`, `c545fd6`, 2026-08-14)
*Phase numbers not recorded in any commit — kapsamı belirsiz (scope not recorded). The Phase 33 audit implies they precede Phase 33.*
- `1b0d9bb`: new `assignments/{assignmentId}` + `submissions` subcollection — a teacher **orchestration** layer on top of the existing learning engine, never a replacement (`reviewScheduler`/`recordStudyOutcome`/adaptive plan untouched). Question set and target-student list are deterministic snapshots taken at creation, capped at 30 questions / 200 students. Firestore rules: teacher-own-class create/update/delete, student read-if-targeted, cross-student progress write denial, `completedCount`/`completedQuestionIds` validated against the assignment's own snapshot — all client-writable, no new Cloud Function. Student session reuses `StudySessionScreen` (`mode="assignment"`) and the same `recordStudyOutcome` path; assignment progress is a parallel, idempotent write that never gates the real outcome. 68 new unit tests, 30 new rules integration tests. Zero new composite indexes, zero N+1 in teacher progress reads.
- `26d61d0`: `smartAssignmentSelection.ts` and `assignmentQuestionPool.ts` — question selection driven by real class weakness data.
- `81cec5c`: closes the learning feedback loop — `assignmentFollowUp.ts`, `assignmentOutcomeInsights.ts`, `assignmentHistorySignals.ts`, `assignmentProgress.ts`, plus rules updates.
- `c545fd6`: restores teacher weekly performance visibility; new `studyWeek.ts`.

### Teacher Action Center (`adef732`, 2026-08-14)
*Unnumbered. Its body refers to "Phase 27's already-sorted topic hotspots", so it follows Phase 27.*
- Optional prefill props on `QuestionMetadataModal` (`initialSubject`/`initialGradeLevel`/`initialTopic`) — a suggestion, not a lock; falls back safely if a value is not a real current taxonomy option.
- New `useTeacherQuestionComposer`: the same two-stage compose flow `useStudentQuestionUpload` already uses, isolated per-role to carry zero risk to the student composer, wired to `posterRole: "teacher"` via the already-authorized `uploadClassQuestionImage`.
- New `teacherActionSummary.ts`: deterministic, capped "what can I do now" list built from existing topic hotspots and attention cards — no new ranking, no fake score.
- `ClassPerformanceScreen` gains a "Şimdi Yapılabilecekler" summary and a "Soru Oluştur" action per topic hotspot. One new read (`getClassById`, once per mount); no new writes, no rules changes.

### Phase 27 — Teacher Classroom Intelligence (`5d5a0ce`, 2026-08-14)
- `studentAttention.ts`: explainable 5-category student attention classification (`needs_attention`/`watch`/`progressing`/`strong`/`insufficient_data`) with fixed-template reasons, built on the existing per-student engines.
- `classTopicInsights.ts`: class-wide topic hotspots aggregated from already-computed per-student `TopicInsight` data, real counts only.
- `classTrend.ts`: class-wide trend by merging per-student day buckets through the unmodified `buildLearningTrend`.
- `boundedConcurrency.ts`: caps simultaneous per-student `studyItems` queries in `useClassPerformance`'s N-student fan-out (same read count, safer concurrency).
- `ClassPerformanceScreen` gains Class Health, Topic Hotspots, Student Attention, and filters; `StudentPerformanceScreen` gains a teacher-attention summary card.
- Zero new Firestore reads/writes, zero rules changes — every aggregate derives from data `useClassPerformance` already fetches.

### Adaptive Study Flow Hardening (`0e46e30`, 2026-08-14)
- Re-verify due-ness at press time in the Learning Hub's "Çalışmaya Başla" routing instead of trusting a memoized snapshot.
- Exit guard for in-flight study session outcome submissions.
- Fixed a real stuck-`isLoadingMore` bug in `useReviewSession.loadMore` (same class as the earlier `useSocialFeed` P0).
- Extracted the shared, tested `staleResponseGuard` predicate, now used by `useStudyQueue`, `useReviewSession`, `useAdaptiveStudySession`, and `useClassPerformance`.
- Locked in the intentional Feed/Daily-Plan discovery-vs-reinforcement divergence with a contract test.

### Study Routing & Moderation Deployment (`7abfd2f`, 2026-08-12)
- Bug #1: `DailyPracticePlanSection`'s `dueCount === 0` fallback called `onOpenQuestion(ctaTarget)`, pushing to `QuestionDetailScreen`/`AnswerScreen` for a single question instead of starting Phase 28's adaptive `StudySessionScreen` — a leftover from before that architecture existed. `StudyScreen` now passes a dedicated `onStartAdaptive` callback; `onOpenQuestion` is untouched for its other legitimate uses.
- Bug #2 (**Phase 29's real root cause**): `submitAnswerForModeration` and `submitQuestionCommentForModeration` existed in `functions/src` since `2fdb5b5` but were never deployed — confirmed absent via `firebase functions:list`. Both photo and drawing answers call this one shared callable, so both failed identically with a generic message. No client or rules code was at fault; fixed by deploying the two missing functions.

### Phase 28 — Adaptive Study Session (`d157daa`, 2026-08-12)
- New `StudySessionScreen`, `useAdaptiveStudySession`, and `studySessionQuestions.ts` (unavailable-question skip, dedupe) — named "Phase 28" by `7abfd2f` and by the Phase 40 audit.
- Notification navigation hardening in the same commit.

### Teacher Class Performance Dashboard (`38c39e9`, 2026-08-12)
*Unnumbered.*
- New `ClassPerformanceScreen` and `StudentPerformanceScreen` with `useClassPerformance`, `useStudentPerformanceDetail`, `studentPerformance.ts`, `StudentPerformanceCard`.
- New teacher routes `class/[classId]/performance` and `class/[classId]/student/[studentId]`; `firestore.rules` updated for teacher reads of student study data.

### Adaptive Question Feed (`0e0c4a7`, 2026-08-12)
*Unnumbered.*
- New `feedRanking.ts` and `useFeedPersonalizationSignals.ts` — the main feed now ranks by the student's own learning signals.

### Phase 25 — Adaptive Learning Engine (`3e207e5`, 2026-08-11)
- `topicMastery.ts` (MasteryBand model), `recencySignal.ts` (forgetting/staleness), `learningTrend.ts` (real improving/declining/stable trend from server-written `studyDays` counters), and `dailyPracticePlan.ts`'s `buildAdaptivePracticePlan` (mastery + recency-aware tiered composer, dedupe, cap, reason metadata) — all four attributed to "Phase 25" by the Phase 40 audit.
- Also added `learningMoment.ts`, `learningInsights.ts`, `studyMetadataCache.ts`, `multipleChoiceStudyBridge.ts`, and `WeakTopicsSection.tsx`.

### Release Hardening (`b0dcc14`, 2026-08-09)
*Unnumbered.*
- P0: `useSocialFeed.loadMore` `isLoadingMore` stuck `true` on a refresh race.
- P1: `useClassFeed` pagination retry button dead after the first error.
- P1: `AnswerScreen` mid-submission unguarded exit + delayed navigation.
- P1: raw `signOut` + `router.replace` race across 3 screens → one `useSignOut` hook.
- New pure helpers `shouldApplyFeedPageResult`, `nextHasMoreAfterPage`, `resolveAnswerExitGuard`; 25 new regression cases.
- Full validation: 1405 unit + 293 rules tests, `expo-doctor` 18/18.

### Learning Hub and Daily Practice Plan (`e5a57b7`, `e3d283f`, 2026-08-09)
*Unnumbered.*
- `e5a57b7`: personalized learning hub — `learningInsights.ts`, `useLearningInsights.ts`, rebuilt `StudyScreen`.
- `e3d283f`: `dailyPracticePlan.ts`, `DailyPracticePlanSection.tsx`, `DailyGoalEditor.tsx`, `dailyGoalValidation.ts`.

### Question Metadata, Multiple Choice and Feed Filters (`936344f`, 2026-08-07)
*Unnumbered.*
- `questionTaxonomy.ts` (subject/grade/topic), `QuestionMetadataModal.tsx`, `multipleChoice.ts`, `MultipleChoiceAnswer.tsx`, `feedFilters.ts`, `FeedFilterSheet.tsx`.

### Interleaved Study Rating Feed (`d1e5f50`, 2026-08-07)
*Unnumbered.*
- `useInterleavedStudyFeed.ts` and `RatingCard.tsx`: rating cards interleaved into the class/global feeds.

### Moderation Infrastructure (`2fdb5b5`, 2026-08-06)
*Referred to as "Phase 29" by `ae28f20`, though that may mean the deployment in `7abfd2f` instead — kapsamı belirsiz (scope not recorded).*
- New `functions/src/moderation/`: `submitAnswerForModeration` and `submitQuestionCommentForModeration` callables, `moderationDecision.ts`, `moderationStates.ts`, `textRules.ts`, `textNormalization.ts`, `providers.ts`, `visionProvider.ts`, `answerPublication.ts`.
- Answers are now published through a moderation gate rather than written directly; `answerQuarantine.ts` added on the Storage side; `firestore.rules` updated accordingly.

### Adaptive Study Engine and Review Sessions (`1b0eeb7`, `9a801a1`, 2026-08-06)
*Unnumbered. This is where the original Phase 5 (spaced repetition) actually shipped.*
- New `functions/src/study/`: `reviewScheduler.ts` (pure, server-authoritative scheduling engine — timezone-independent epoch arithmetic, calendar-day concerns kept separate in `dayKey.ts`), `recordStudyOutcome.ts`, `removeStudyItem.ts`, `setStudyDailyGoal.ts`, `operationId.ts`.
- New `src/features/study/` module with the Study Hub, study queue, review session, and outcome controls; new routes `app/(student)/(tabs)/study.tsx` and `app/(student)/study/review.tsx`.
- Note: `REVIEW_CONFIG` in `src/constants/config.ts` is **not** used by the scheduler, which defines its own named constants. The config is currently dead.
- `9a801a1`: the question-repeat ("soru tekrar") screen and related class/question wiring.

### Firestore Transaction Ordering (`0fcaad1`, 2026-08-06)
*Unnumbered.*
- Enforced read-before-write ordering across `functions/src/answers`, `classes`, `friends`, `notifications`, and `social` transactions.

### Notification Center and Activity Inbox (`979a3de`, 2026-08-04)
*Original Phase 10, in-app portion only — no FCM/push.*
- New `functions/src/notifications/`: `createNotification`, `markNotificationRead`, `markAllNotificationsRead`, `dedupeKey.ts`, `notificationMeta.ts`, `notificationTypes.ts`, `questionEventDecision.ts`.
- New `src/features/notifications/` with the inbox screen, bell button, unread badge, merge/timeline/presentation services and `notificationNavigation.ts`; new `notifications` routes for both roles; `firestore.rules` updated.

### Premium UI Redesign (`19c9059`, `1800744`, `b2f6fcd`, `7972e1b`, `c85eb42`, `657f7aa`, 2026-07-31 – 2026-08-04)
*Unnumbered.*
- `19c9059`: question feed experience redesign.
- `1800744`: teacher command center — `TeacherDashboardHeader`, `TeacherQuickActions`, `TeacherStatsCard`, `teacherDashboardStats.ts`.
- `b2f6fcd`: class chat redesign.
- `7972e1b`: profile and social experience redesign across `src/features/profile/` and `src/features/friends/`.
- `c85eb42`: authentication and onboarding experience (45 files) — `AuthShell`, `OnboardingProgress`, `RoleSelector`, `PasswordRequirements`, `onboardingSteps.ts`, `onboardingSession.ts`.
- `657f7aa`: shared UI polish across questions, answers, feed, classes, profile.

### Production Hardening (`b4aeeb9`, 2026-08-04)
*Unnumbered.*
- Dependency-free network status hook + `OfflineBanner`.
- Tuned the two highest-traffic FlatLists (global feed, class feed) for paging performance; memoized list-item cards.
- Fixed fade/error handling on the shared `Avatar`; removed remaining hardcoded colors and a duplicate `EmptyState` implementation.

### Account Switching and Web/EAS Setup (`9ab9f8b`, `dce1fb9`, 2026-07-30)
*Unnumbered.*
- `9ab9f8b` (83 files): stored-account switching (`AccountSwitcherSheet`, `AccountRow`, `AddAccountForm`, `RecentAccountsList`, `accountSwitchPresentation.ts`), plus `eas.json`, `.env.example`, and app config updates.
- `dce1fb9`: synced `firestore.indexes.json` with production.

### Teacher Profiles and Friendship System (`276efe3`, 2026-07-29)
*Original Phase 8, friend-graph portion only.*
- New `functions/src/friends/`: `sendFriendRequest`, `respondToFriendRequest`, `cancelFriendRequest`, `removeFriend`, `eligibility.ts`, `pairId.ts`, `socialMeta.ts`.
- New `src/features/friends/` with `FriendsScreen`, `FindFriendsScreen`, friendship state/presentation/merge services and `requestBadge.ts`; new teacher tab layout and teacher public-profile route; `firestore.rules` and `firestore.indexes.json` updated.

### Phase 7 — Classes (`4621c1e` and follow-ups, 2026-07-24 – 2026-07-29)
- `4621c1e`: classes, direct teacher onboarding, and the public identity model.
- `aa6aa66`, `bb220bb`, `90f150d`, `4e51497`, `5e28921`, `b1ae113`: onboarding, route-guard, verification-email, logout and public-auth-route hardening, plus comprehensive auth routing coverage (`routeTarget.ts`, `routeGuardDecision.ts`, `profileWait.ts`, `guardedAction.ts`).
- `f2424ab`: actionable class-creation errors (`classErrorMapper.ts`).
- `759dda3`: added the missing `classes` composite index (`teacherId` + `createdAt`). Without it the list query `useTeacherClasses.createClass()` runs right after a successful create failed with `FAILED_PRECONDITION`, so a teacher's class never appeared even though it was created correctly. Verified end-to-end against production after deploying the index.
- `4698f9b`: student scrollable class feed (`ClassFeedScreen`, `useClassFeed`, `classFeedPagination.ts`, `feedItems.ts`).
- `d4ec6cb`: restored student class listing; prevented duplicate navigation.
- `c5d8d03` (38 files): class chat — `ClassChatScreen`, `ChatComposer`, `ChatMessageBubble`, `ChatHeader`, `ChatDateSeparator`, `chatTimeline.ts`, `chatDateGrouping.ts`, `classMessageMerge.ts`, `messageValidation.ts`, for both roles.
- `cc71856`: students' class-question creates were rejected with `permission-denied` because production `firestore.rules` was never redeployed after **"Phase 9.1"** added student posting (the deployed rule still required `isTeacher()` unconditionally). Deployed the already-correct local rules. Also fixed `useStudentQuestionUpload`'s bare `catch {}`, which discarded the real error and always showed a generic "Soru yüklenemedi" — added dev-only staged diagnostics and an error-code-to-message mapper.

### Answers, Usernames and Profiles (`4c8d10d`, `ca2c259`, `027b8a1`, `5df6350`, `2a5d45a`, 2026-07-21 – 2026-07-23)
*Unnumbered; predates the Phase 6 entry below.*
- `4c8d10d`: answer workflow, usernames, and the profile system.
- `ca2c259`: stabilized drawing-canvas gestures and stroke persistence.
- `027b8a1`: Question Detail screen with the full answer list (photo/drawing), real-time `onSnapshot` updates, profile-cache-backed username resolution, a lightweight pinch-zoom image viewer, and server-maintained `answerCount` via a new `onAnswerCreate` Cloud Function. Tightened `firestore.rules`/`storage.rules` so answers are readable only via the related question's own visibility and `answerCount` cannot be client-tampered.
- `5df6350`, `2a5d45a`: completed the answer upload flow and Storage rules; resolved the production-device-only drawing-answer save failure flagged as unconfirmed in `027b8a1`.

### Phase 6 — Social Feed, User Profiles, Likes and Comments
- Question visibility model changed from `private/class/friends` to `private/public/class`; `public` questions are readable by any authenticated user regardless of organization. `class` currently fails closed (treated as owner-only) pending a real class-roster system — the `VisibilityPicker` shows it disabled ("Sınıf özelliği yakında").
- New `publicProfiles/{uid}` collection: a safe-field mirror of `users/{uid}` (no email/accountStatus), readable by any authenticated user, kept in sync by the new `syncPublicProfile` Cloud Function trigger. Fixes a pre-existing bug where any user but yourself would show as "Kullanıcı" everywhere.
- Social feed rebuilt: merged own+public paginated feed (`useSocialFeed`/`socialFeedService`), sequential-phase pagination (own questions first, then public), replacing the old single-query `useFeed`/`feedService`.
- Like system for questions and answers: `questionLikes`/`answerLikes` collections (deterministic `{targetId}_{userId}` doc IDs), toggled only via the new `toggleQuestionLike`/`toggleAnswerLike` transactional Cloud Functions callables; `LikeButton` component with optimistic UI.
- Comment system for questions (no nested replies, no edit): `questionComments` collection, `CommentSection`/`CommentItem` components, real-time via `onSnapshot`.
- Server-maintained aggregate counts: `likeCount` (transactional), `commentCount`/`answerCount` (trigger-based, floored at 0) — all client-writes to these fields denied by `firestore.rules`.
- Public profile screen (`app/(student)/user/[userId].tsx`) with the user's public questions; owner rows across feed/detail/answers now navigate there.
- Storage rules reworked: visibility is now encoded directly in the Storage path (`questions/{public|private}/...`, `answers/{public|private}/...`) instead of a cross-service `firestore.get()` lookup, which was found to throw `EvaluationException: Null value error` on real requests. Avatar upload cap raised 2MB → 5MB.
- New Firestore indexes: `questions` (`visibility ASC, createdAt DESC`), `questions` (`ownerId ASC, visibility ASC, createdAt DESC`), `questionComments` (`questionId ASC, createdAt ASC`).
- Tests: ~34 new Firestore rules tests, rewritten Storage rules tests for the new path scheme, new unit tests for `likeId`, `commentValidation`, `socialFeedService`, rewritten `profileCache` tests.
- Docs: ARCHITECTURE, SECURITY, README, ROADMAP, FEATURES, FIREBASE_SETUP updated for the Phase 6 design.

### Chore — Expo SDK 52 → 54
- Upgraded `expo` and every Expo-managed dependency (`expo-router`, `expo-image`, `expo-image-picker`, `expo-linking`, `expo-splash-screen`, `expo-status-bar`, `expo-constants`, `expo-asset`) to their SDK 54 versions via `expo install --fix`, matching the SDK the currently-published Expo Go app requires. Also bumped `react` to 19.1.0, `react-native` to 0.81.5, `react-native-reanimated` to 4.x, `react-native-safe-area-context`/`react-native-screens`/`react-native-gesture-handler`, `@react-native-async-storage/async-storage` to 2.x, and `typescript`/`@types/react`/`eslint-config-expo` to their compatible versions.
- Added `react-native-worklets` (reanimated 4's babel plugin moved out of `react-native-reanimated` into this package) and repointed `babel.config.js` at `react-native-worklets/plugin`.
- Fixed a React 19 stricter-typing break: `useRef<ReturnType<typeof setInterval>>()` in `useEmailVerification.ts` now requires an explicit initial value.
- Split the Jest babel config out of the app's `babel.config.js` into `babel.jest.config.js`: the reanimated/worklets plugin errors when loaded outside a Metro bundling context, and unit tests never import RN code anyway.
- Generated placeholder `assets/images/{icon,adaptive-icon,splash,favicon}.png` (solid-color PNGs at the correct dimensions) — `app.json` referenced these paths since Phase 1 but the files never existed, which broke `expo start`. Replace with real artwork before shipping.
- Verified with `npx expo-doctor` (18/18 checks pass) and a full `npm run verify && npm run test:rules` re-run.

### Cross-platform Firebase Auth (`ab8ab2f`, 2026-07-19)
- Native (iOS/Android) keeps `initializeAuth` + `getReactNativePersistence`; web uses `getAuth`; resolved via `initAuth.native.ts`/`initAuth.web.ts` and tsconfig `moduleSuffixes`. Added `react-dom`/`react-native-web` for the web target.

### Chore — .gitignore hardening (`616fccb`, 2026-07-17)
- Added missing secret/credential patterns (`*.p12`, `*.key`, `*.jks`, `*.keystore`, `*.mobileprovision`, service account key filenames) and native prebuild output directories (`android/`, `ios/`).

### Phase 2 — Authentication
- Client Firebase config rewritten: single guarded app/auth instance (survives Expo Fast Refresh), AsyncStorage-backed session persistence, guarded/platform-aware emulator connection, env var presence validation without logging values.
- Renamed the user schema's placeholder fields to match the authoritative Phase 2 spec: `orgId` → `organizationId`, single `points` → `totalPoints`/`weeklyPoints`, added `accountStatus`. Updated across `firestore.rules`, `storage.rules`, `firestore.indexes.json`, and shared types.
- `firestore.rules`: `users/{uid}` now denies all client-side document creation (profiles are Cloud-Function-only) and allows updates only to `displayName`/`photoURL`/`updatedAt` via explicit field-diff validation.
- Cloud Functions: `onUserCreate` (1st-gen Auth trigger, idempotent) creates the Firestore profile and initial custom claims on signup; `adminSetUserRole` (2nd-gen callable) is the sole, caller-authorized path for role promotion — not wired to any UI yet.
- Authentication feature module: Turkish-message validation, Firebase Auth error mapping, `authService` (register/login/logout/reset/resend orchestration), pure `resolveRouteForState` routing helper, `AuthProvider` with bounded profile-load retry, `RouteGuard` for centralized protected/role-aware routing.
- Screens: login, register, forgot password (privacy-safe generic response), verify email (resend cooldown), and placeholder student/teacher/admin dashboards.
- Tests: unit tests for validation, error mapping, and routing (33 tests); Firestore rules tests via the emulator covering ownership, field-level write protection, and create-denial (13 tests).
- Docs: README, ARCHITECTURE, SECURITY, FIREBASE_SETUP, ROADMAP updated for the authentication design and the `organizationId`/points/`accountStatus` rename.

### Phase 1 — Bootstrap
- Initial project architecture: feature-based folder structure under `src/features/`.
- Expo + TypeScript (strict) + Expo Router configuration.
- ESLint + Prettier configuration.
- Firebase project configuration: `firebase.json`, `firestore.rules`, `storage.rules`, `firestore.indexes.json`.
- Cloud Functions skeleton (`functions/`) with TypeScript build setup.
- Full documentation set: README, ROADMAP, CLAUDE, ARCHITECTURE, FIREBASE_SETUP, SECURITY, CONTRIBUTING, FEATURES, CHANGELOG.
- Minimal working Expo Router entry screen.
