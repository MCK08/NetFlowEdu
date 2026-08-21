# Features

Status reflects what exists in the tree today, verified against `src/features/`,
`src/services/`, `app/`, and `functions/src/` — not against what a phase document
once planned. See [ROADMAP.md](ROADMAP.md) for how phase numbers map to commits.

The **Phase** column is filled in only where a commit message or the original
roadmap establishes the number. `—` means the work shipped in a stretch of
commits that never recorded a phase number: kapsamı belirsiz (scope not recorded).

## Authentication & identity

| Feature | Where | Phase | Status |
|---|---|---|---|
| Email/password register, login, logout, password reset, email verification | `src/features/authentication/` | 2 | Done |
| Role model via custom claims (student / teacher / org admin / platform admin) | `functions/src/utils/claims.ts`, `functions/src/admin/setUserRole.ts` | 2 | Done |
| Protected + role-aware routing (`RouteGuard`, `routing.ts`, `routeGuardDecision.ts`) | `src/features/authentication/` | 2 | Done |
| Profile bootstrap on signup (`onUserCreate`) | `functions/src/triggers/` | 2 | Done |
| Google Sign-In | `src/features/authentication/services/googleAuth.ts` | — | Done |
| Multi-step onboarding (role → username → organization) | `functions/src/onboarding/`, `GoogleOnboardingScreen` | — | Done |
| Username claiming | `functions/src/users/setUsername.ts` | — | Done |
| Teacher role request flow | `functions/src/teacherRequests/` | — | Done |
| Stored-account switching (multi-account on one device) | `AccountSwitcherSheet.tsx`, `accountSwitchPresentation.ts` | — | Done |
| Force ID-token refresh on account switch | `AuthProvider.tsx` | 34 | Done |

## Questions, answers & feed

| Feature | Where | Phase | Status |
|---|---|---|---|
| Question image upload to Storage + Firestore metadata | `src/features/upload/`, `src/services/storage/` | 3 | Done |
| PDF question upload | — | 3 | Not started |
| Visibility model: private / public / class | `VisibilityPicker.tsx`, `firestore.rules`, `storage.rules` | 3, 6 | Done |
| Vertical swipe question feed | `src/features/feed/` | 4 | Done |
| Question detail + real-time answer list | `src/features/questions/`, `src/features/answers/` | — | Done |
| Photo answers | `src/features/answers/hooks/usePhotoAnswer.ts` | — | Done |
| Drawing answers (canvas, stroke persistence, PNG data URI) | `DrawingBoard.tsx`, `strokeReducer.ts`, `pngDataUri.ts` | — | Done |
| Question metadata + taxonomy (subject / grade / topic) | `questionTaxonomy.ts`, `QuestionMetadataModal.tsx` | — | Done |
| Multiple-choice questions | `src/features/questions/services/multipleChoice.ts` | — | Done |
| Feed filters | `src/features/feed/services/feedFilters.ts` | — | Done |
| Personalized feed ranking | `feedRanking.ts`, `useFeedPersonalizationSignals.ts` | — | Done |
| Saved questions / question archive | `useSavedQuestion.ts`, `useQuestionArchive.ts` | — | Done |

## Social

| Feature | Where | Phase | Status |
|---|---|---|---|
| Merged own+public paginated social feed | `socialFeedService.ts`, `useSocialFeed.ts` | 6 | Done |
| Public profiles via safe-field `publicProfiles/{uid}` mirror | `functions/src/profiles/syncPublicProfile.ts` | 6 | Done |
| Likes on questions and answers (transactional callables) | `functions/src/social/` , `src/features/social/likes/` | 6 | Done |
| Comments on questions (no nested replies) | `src/features/social/comments/` | 6 | Done |
| Server-maintained counts (`likeCount`, `commentCount`, `answerCount`) | `functions/src/social/`, `functions/src/answers/` | 6 | Done |
| Own profile + edit profile + profile stats | `src/features/profile/` | — | Done |
| Profile cache (username/avatar resolution) | `src/features/profiles/` | — | Done |
| Friend graph: request / accept / cancel / remove | `functions/src/friends/`, `src/features/friends/` | 8 | Done |
| Friend search & find-friends screen | `useFriendSearch.ts`, `FindFriendsScreen.tsx` | — | Done |
| Solutions: student explanations with teacher verification | — | 8 | Not started |

## Classes

| Feature | Where | Phase | Status |
|---|---|---|---|
| Teacher creates class; students join by code | `functions/src/classes/` | 7 | Done |
| Leave class, remove member, regenerate join code | `functions/src/classes/` | 7 | Done |
| Class feed (paginated) | `useClassFeed.ts`, `classFeedPagination.ts` | 7 | Done |
| Student posting into a class feed | `useStudentQuestionUpload.ts` | 9.1* | Done |
| Class chat (real-time, date-grouped timeline) | `ClassChatScreen.tsx`, `chatTimeline.ts`, `chatDateGrouping.ts` | — | Done |
| Class-visibility questions readable by classmates | `firestore.rules` | 7 | Done |

\* The number "9.1" is what commit `cc71856` calls it; it is unrelated to the original roadmap's Phase 9 (Leaderboards).

## Study / learning engine

| Feature | Where | Phase | Status |
|---|---|---|---|
| Spaced-repetition scheduler (server-authoritative, pure) | `functions/src/study/reviewScheduler.ts` | 5 | Done |
| `recordStudyOutcome` / `removeStudyItem` / `setStudyDailyGoal` callables | `functions/src/study/` | 5 | Done |
| `REVIEW_CONFIG` actually driving the scheduler | `src/constants/config.ts` | 5 | **Not wired** — defined but referenced nowhere |
| `src/features/review/` module | — | 5 | Empty placeholder (`.gitkeep` only); real code lives in `src/features/study/` |
| Study hub: queue, progress, streak, daily goal | `StudyScreen.tsx`, `StudyProgressCard.tsx`, `studyWeek.ts` | — | Done |
| Mandatory review session | `useReviewSession.ts`, `app/(student)/study/review.tsx` | — | Done |
| Interleaved study rating feed | `useInterleavedStudyFeed.ts` | — | Done |
| Topic mastery bands | `topicMastery.ts` | 25 | Done |
| Forgetting/recency signal | `recencySignal.ts` | 25 | Done |
| Learning trend (improving / declining / stable) | `learningTrend.ts` | 25 | Done |
| Adaptive daily practice plan composer | `dailyPracticePlan.ts` | 25 | Done |
| Learning "moment" one-line insight | `learningMoment.ts` | 25 | Done |
| Adaptive study session screen (swipe cards) | `StudySessionScreen.tsx`, `useAdaptiveStudySession.ts`, `studySessionQuestions.ts` | 28 | Done |
| Session card layout math (height, snap offsets) | `studySessionLayout.ts` | 35, 37 | Done |
| Shared outcome card across all study surfaces | `StudyOutcomeCard.tsx` | 36 | Done |
| "Cevapla" entry point inside a session | `StudyAnswerButton.tsx` | 37/38 | Done |
| Unified student next action | `studentNextAction.ts`, `NextActionSection.tsx` | 39 | Done |
| Cumulative outcome counters | `outcomeCounters.ts`, `recordStudyOutcome.ts` | 41 | Done |
| Learning state (`buildLearningState`) | `learningState.ts` | 42 | Done |

## Assignments

| Feature | Where | Phase | Status |
|---|---|---|---|
| `assignments` + `submissions`: teacher orchestration layer | `src/features/assignments/`, `firestore.rules` | 30–32* | Done |
| Snapshot question set + target students at creation (capped 30/200) | `assignmentCreation.ts`, `assignmentService.ts` | 30–32* | Done |
| Smart question selection from class weakness data | `smartAssignmentSelection.ts`, `assignmentQuestionPool.ts` | 30–32* | Done |
| Student assignment session (reuses `StudySessionScreen`) | `useAssignmentSession.ts`, `assignmentProgress.ts` | 30–32* | Done |
| Teacher per-student progress view | `AssignmentDetailScreen.tsx`, `teacherAssignmentProgress.ts` | 30–32* | Done |
| Assignment outcome insights / follow-up | `assignmentOutcomeInsights.ts`, `assignmentFollowUp.ts` | 30–32* | Done |
| Mapped publish/prepare error messages | `assignmentPublishMessages.ts` | 33 | Done |
| Due date / urgency / status | `assignmentDueDate.ts`, `assignmentUrgency.ts`, `assignmentStatus.ts` | — | Done |

\* Numbers not recorded in commit messages — kapsamı belirsiz (scope not recorded). See [ROADMAP.md](ROADMAP.md).

## Teacher tools

| Feature | Where | Phase | Status |
|---|---|---|---|
| Teacher dashboard / command center | `TeacherDashboardHeader.tsx`, `teacherDashboardStats.ts` | — | Done |
| Class performance dashboard | `ClassPerformanceScreen.tsx`, `useClassPerformance.ts` | — | Done |
| Per-student performance detail | `StudentPerformanceScreen.tsx`, `studentPerformance.ts` | — | Done |
| Student attention classification (5 explainable categories) | `studentAttention.ts` | 27 | Done |
| Class-wide topic hotspots | `classTopicInsights.ts` | 27 | Done |
| Class-wide trend | `classTrend.ts` | 27 | Done |
| Bounded-concurrency fan-out for N-student queries | `boundedConcurrency.ts` | 27 | Done |
| "Şimdi yapılabilecekler" action summary | `teacherActionSummary.ts` | 28* | Done |
| Teacher question composer (prefilled from a hotspot) | `useTeacherQuestionComposer.ts` | 28* | Done |
| Diagnosis → targeted intervention | `teacherIntervention.ts` | 43 | Done |
| Intervention effectiveness verdict | `interventionEffectiveness.ts`, `InterventionOutcomeCard.tsx` | 44 | Done |

\* Commit `adef732` is unnumbered; "28" here conflicts with the study-session Phase 28. See the numbering caveats in [ROADMAP.md](ROADMAP.md).

## Moderation

| Feature | Where | Phase | Status |
|---|---|---|---|
| Answer publication gate (`submitAnswerForModeration`) | `functions/src/moderation/submitAnswer.ts` | 29* | Done |
| Comment moderation (`submitQuestionCommentForModeration`) | `functions/src/moderation/submitQuestionComment.ts` | 29* | Done |
| Text rules + normalization | `textRules.ts`, `textNormalization.ts` | 29* | Done |
| Vision provider for image moderation | `visionProvider.ts`, `providers.ts` | 29* | Done |
| Moderation dashboard (human review UI) | — | — | Not started |

\* `ae28f20` calls this "Phase 29"; whether that means the write (`2fdb5b5`) or the deploy (`7abfd2f`) is kapsamı belirsiz (scope not recorded).

## Notifications

| Feature | Where | Phase | Status |
|---|---|---|---|
| In-app notification center / activity inbox | `src/features/notifications/`, `functions/src/notifications/` | 10 | Done |
| Notification dedupe keys and question-event decisioning | `dedupeKey.ts`, `questionEventDecision.ts` | 10 | Done |
| Unread badge + deep-link navigation | `unreadBadge.ts`, `notificationNavigation.ts` | 10 | Done |
| Push notifications via FCM | — | 10 | **Not started** — no `expo-notifications`, no messaging SDK, no token handling |
| Review reminders / streak pushes | — | 10 | Not started |

## Gamification

| Feature | Where | Phase | Status |
|---|---|---|---|
| `totalPoints` / `weeklyPoints` fields on the user + public profile | `functions/src/triggers/onUserCreate.ts`, `syncPublicProfile.ts` | 2 | Fields exist, initialized to 0 |
| Any Cloud Function that awards points | — | 9 | **Not started** — nothing anywhere writes these fields after init |
| Leaderboards (weekly / monthly / class / school / org) | `src/features/leaderboards/` | 9 | **Not started** — `.gitkeep` placeholders only |

## Platform & shared UI

| Feature | Where | Phase | Status |
|---|---|---|---|
| Shared UI kit (28 components: buttons, cards, sheets, skeletons, toasts…) | `src/components/ui/` | — | Done |
| Offline detection + banner | `useNetworkStatus.ts`, `OfflineBanner.tsx` | — | Done |
| Navigation guard hook | `src/hooks/useNavigationGuard.ts` | — | Done |
| Theme tokens (no hardcoded colors) | `src/theme/` | — | Done |
| Expo SDK 54 / React 19 / RN 0.81 | `package.json` | — | Done |

## Not scoped anywhere

Subscriptions, payments, direct messaging, OCR, AI features (original Phase 11).
