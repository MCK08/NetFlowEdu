# Phase 98 — Class-Scoped Manual Comment Review + Server-Authoritative Comment Publication Continuity

## Repository Sync

Local HEAD and `origin/phase17-moderation-infrastructure-20260806-195814` were both `e0c231a`,
ahead/behind `0 0`, worktree clean — classification **A, local == remote**. No fast-forward
required.

## Actual Starting Head

`e0c231a3647715858a36904cc3d81d361cd5f07e` — Phase 97, Class-Scoped Manual Answer Review. No
`PHASE98*` document and no Phase 98 commit existed anywhere.

## Collaborator Safety

`git fetch origin` before implementation, before commit and before push. Remote stayed `e0c231a`
throughout. `main` (`7abfd2f` local and remote) never checked out, merged or pushed. No force.

## Phase 97 Foundation

Phase 97 fixed the reviewer (`classes/{classId}.teacherId`), the boundary (publish / do not
publish, nothing else), the pattern (server-authoritative callable, transaction-scoped
idempotency, one finalizer, trigger-owned counter and notification) — for answers. Its "Known
Limitations" recorded that comment `manual_review` still had no reviewer. Phase 98 audited that
claim before acting on it.

## Product Mission

If, and only if, comments genuinely reach a human-reviewable state with no resolver: give that
state the same class-teacher reviewer under the same narrow boundary. Otherwise report and stop.

## Comment Publication Pipeline

```
composer (QuestionDetail "Yorum yaz")
  → submitQuestionComment (client service, uid+operationId)
  → submitQuestionCommentForModeration (Admin SDK callable)
      auth → text valid (≤500) → operationId valid
      → evaluateTextRules(normalizeForModeration(text))  [deterministic Turkish layer]
      → decideTextModeration({rules, provider: null})     [no text provider configured]
      → transaction: replay check → question readable → 5s per-author throttle
        → moderationSubmissions/{uid}_{operationId} (text retained)
        → IF approved: questionComments/{id} in the same transaction
  → onQuestionCommentCreate: commentCount += 1, question_commented notification (owner, dedupe key)
  → Phase 93 deleteQuestionComment (owner-only) → onQuestionCommentDelete: floored decrement
```

## Comment Moderation Schema

`moderationSubmissions/{uid}_{operationId}` with `targetType: "question_comment"`, `text`
retained ("a reviewer has to read what they are ruling on" — the schema's own comment),
`status`, `riskCategories`, `decisionReason`, `publishedEntityId`, `reviewedAt: null`,
`reviewedBy: null`.

## State Machine

Unchanged (`moderationStates.ts`): `manual_review → approved | rejected | removed`; `rejected`
and `removed` terminal. The comment path targets only `approved`/`rejected`.

## manual_review Reachability

**YES — a real, shipped product state.** `evaluateTextRules` returns `review` (never block, never
clean) for: an ambiguous token (`hayvan`, `top`, `meme`, `mal`, `eşek`, `domuz`, `salak`, `aptal`),
wellbeing / meet-up phrases, a Turkish phone number, an e-mail, a social handle, and meaningless
repetition. `decideTextModeration` maps `review` → `manual_review`, reason `uncertain`.
`provider_unavailable` is **not** reachable for comments today (`resolveProviders().text` is
`null`), though the code path exists should a text provider be configured. Proven by unit tests on
the real rules and, at runtime, by a comment typed into the real composer ("… hayvan gibi çalışmak
…") landing in `manual_review`.

## Pre-Phase98 Resolution Path

**None.** Phase 97's review path filters `targetType == "answer_image"` and refuses any other kind
(`failed-precondition`); every client write to `moderationSubmissions` is denied; no other
callable, script or UI touched the state. Proven in the integration suite: the real decision layer
routes a comment to `manual_review`, it is absent from the answer queue, and `applyAnswerReview`
refuses it — the submission stays `manual_review` with no comment published. **Comment manual
review was terminal.**

## Branch Decision

**BRANCH A — real and terminal.** Implemented the class-scoped continuation. Rejected: a generic
"submission" review (kinds must stay explicit); a moderator role; org/platform authority; a
unified screen that would have required renaming Phase 97's route and screen for a UX gain the
sibling surface already provides.

## Reviewer Authorization

Extracted Phase 97's checks verbatim into `functions/src/review/reviewAuthorization.ts` and
pointed both paths at it: `assertClassTeacher` (`classes/{classId}.teacherId === caller`),
`assertMayReview(…, expectedTargetType)` (kind, class present, teacher, self-review),
`assertQuestionInClass`, cursor codec, bounded `queryReviewPage`, `loadReviewContext`. The answer
path's exported API and behaviour are unchanged (its 44 integration tests still pass).

## Teacher Permission Boundary

May: list own class's reviewable comments, read the retained text with question context, approve,
reject. May not: edit text (no request field), impersonate the author (ownerId comes from the
submission), delete a published comment (Phase 93 gateway refuses the teacher — proven), touch
likes, question content, studyEvents/studyItems/semantic evidence or learning state.

## Self-Review

`authorId === callerUid` → `permission-denied` for detail, approve and reject; zero writes
(integration + contract pin).

## Cross-Class Security

Teacher B (verified `role: teacher`): Class A queue/detail/approve/reject 403, raw patch 403.
Question-in-another-class submissions refused for both teachers.

## Canonical Comment Finalizer

`functions/src/moderation/commentFinalization.ts`: `buildPublishedCommentDocument` (the one
shape: `questionId, ownerId, text, status:"active", createdAt`) and `finalizeApprovedComment`
(the transaction write). `submitQuestionCommentForModeration` was refactored onto it; the manual
path uses it. Unit-pinned: neither caller spells `status: "active"` itself.

## Automated / Manual Equivalence

Runtime: the automatically published clean comment and the manually approved one on the same
question have identical key sets and `status: "active"`; both counted by the trigger; both notify
the owner through the same dedupe key. Only `reviewedAt`/`reviewedBy` on the submission differ.

## Queue Architecture

`listCommentReviewQueue({classId, cursor?})`: `classId == X ∧ targetType == "question_comment" ∧
status == "manual_review"`, `createdAt asc, __name__ asc`, 20 per page, opaque cursor. **Reuses
the Phase 97 composite index** (`classId, targetType, status, createdAt`) — targetType is an
equality filter; no new index (pinned: exactly one `moderationSubmissions` index).

## Queue Authorization

Class teacher 200; other teacher / student / org admin / platform admin (claims verified) /
outsider 403; anonymous 401.

## Review Detail

Reason copy, subject · topic, question text, the retained comment text in a read-only box
(0 inputs on the page), author display name, relative time, `Yayınla` / `Yayınlama`. No raw ids
(asserted on the payload and checked on screen).

## Review Reasons

`uncertain` → "Otomatik inceleme bu yorum için kesin karar veremedi."; `provider_unavailable` →
"Otomatik inceleme şu anda tamamlanamadı." Pinned to never name the student as unsafe.

## Approval Contract

auth → submission → kind → class teacher → self-review → question-in-class → reviewable state →
transaction: re-read, re-verify, re-check, validate retained text against the submission bound,
`tx.update` status/publishedEntityId/reviewedAt/reviewedBy/updatedAt + `finalizeApprovedComment`.
No throttle re-applied: the 5-second limit guards author submission, not reviewer publication
(pinned).

## Rejection Contract

Same authorization; `rejected` + `reviewedAt`/`reviewedBy`; no comment, no counter, no
notification.

## Approval Idempotency

Runtime: retry ×2 → `alreadyDecided: true`, same `publishedEntityId`, one comment, `reviewedAt`
unchanged.

## Concurrent Approval

Runtime (Functions emulator): two simultaneous approvals of Student C's comment → one fresh, one
`alreadyDecided`, same id, **one** comment, `commentCount` +1, **one** new `question_commented`
notification for that actor. Integration test repeats it against real transactions.

## Rejection Idempotency

Runtime: concurrent reject ×2 → one fresh, one already-decided; third retry already-decided;
approve-after-reject `failed-precondition`; reject-after-approve `failed-precondition`.

## Comment Create Idempotency

Untouched: `uid + operationId` deterministic submission id, replay returns the same result
(re-verified live: same operationId → same `publishedEntityId`).

## commentCount Ownership

Unchanged: `onQuestionCommentCreate` increments, `onQuestionCommentDelete` decrements floored at
zero, at-least-once documented. The review callable never touches it (pinned).

## commentCount Exactness

manual_review 0 · manual approval +1 once · retry +0 · concurrent +1 total · rejected 0 · author
delete −1 once (3 → 2) · delete retry +0 · never negative.

## Notification Exactness

Owner of the student-owned question: one notification doc per (actor, question) — the canonical
dedupe key. Manual approval by a new actor created exactly one; retry/concurrent created no
second; reject none. Teacher-owned questions notify nobody by the existing rule (unchanged).

## Published Comment Ownership

`ownerId` = the submission's author. Teacher delete via the Phase 93 gateway → 403 ("Bu yorumu
yalnızca yazarı silebilir."); teacher raw delete 403.

## Author Delete Regression

Author deletes the manually approved comment through `deleteQuestionComment` → `deleted:true`;
retry → `deleted:false`; count −1 once. Submission audit trail untouched.

## Raw Moderation Security

Student / teacher / org admin / platform admin raw `status` patch: 403 each. Decision: callable
only. `firestore.rules` unchanged.

## Answer Review Regression

Real answer submission (Student D) → answer queue contains it, comment queue does not; media 200;
Teacher B 403; approve publishes; reject-after-approve refused. 44 Phase 97 integration tests
still green.

## Question / Answer Security Regression

Raw question create/update/delete 403; raw answer create/update/delete 403; raw comment
create/delete 403; raw answerLikes/questionLikes 403; raw moderation patch 403.

## Likes Regression

Question like/like-retry `{liked:true, likeCount:1}` ×2, unlike/retry `{liked:false, likeCount:0}`
×2 (Phase 91). Answer like/unlike with retries identical (Phase 92).

## Learning Evidence Regression

Per-student `studyEvents`/`studyItems` digests byte-identical to the pre-QA baseline after every
decision and probe.

## Query / Cost

Queue: 1 call, 1 query (≤21) + ≤2 bounded `getAll` (≤20 each). Detail: 1 call, 4 reads. Decision:
1 call; pre-flight 3 reads; transaction 3 reads + 1 update (+1 comment set). Trigger: unchanged
1 transaction per comment. Indexes: +0. Listeners: 0. Polling: 0. No Storage.

## Runtime QA

Emulators proven local before any credential (Auth config 200, Firestore "Ok", Functions 401 for
anonymous, 0 googleapis resources). Functions rebuilt before the emulator started; the three
comment callables listed in the load log. The headline comment was typed into the real composer;
further comments went through the canonical callable with the author's own token. Temporary
fixtures (Teacher B/class B, org admin, platform admin, one student-owned question) deleted and
existence-checked; dev server and emulators stopped.

## Responsive QA

375 light and dark, 1280×800, 853×533 (≈150 %): no horizontal overflow; long (398-char) comment,
long question, empty queue, one item, approve/reject loading, already-reviewed race, permission
error all rendered.

## Accessibility

Header role; every control labelled; all targets ≥44; the comment text is a single accessible
node ("Yorum metni: …"); notice/error/loading carry `aria-live="polite"`; row selection in words
and `aria-selected`; no colour-only state; no raw ids; no input fields.

## iOS Decision

New native dependency: NO · native config: NO · native-only API: NO · native-only behaviour: NO ·
confirmed native defect: NO. **NATIVE IOS: NOT REQUIRED THIS PHASE.**

## Automated Validation

typecheck PASS · lint PASS · unit **183 suites / 3592 tests** (+1, +15) · rules **12 suites /
626 tests** (+1, +30) · functions build PASS · functions lint: 4 pre-existing, 0 new · `npm run
verify` exit 0 · expo-doctor 17/18 (known drift) · `git diff --check` PASS.

## Source Integrity

20 touched/new files: NUL 0, CRLF 0, no BOM, no control characters, UTF-8. No raw colours. No
instrumentation. No secrets. `.env`, `firestore.rules`, `storage.rules`, `firestore.indexes.json`,
`routing.ts`, `studentPerformance.ts` untouched.

## Known Limitations

- Comment `manual_review` is reachable only through the deterministic layer's `review` verdict
  today; `provider_unavailable` becomes reachable only if a text provider is configured.
- The class teacher is the only reviewer; no org/platform/moderator authority; no cross-class.
- Teacher cannot edit or delete student comments; commentCount stays trigger-owned with the
  documented at-least-once semantics; the 5-second comment throttle is unchanged and not applied
  to reviewer publication.
- Author delete remains the Phase 93 contract; answer review remains the Phase 97 contract.
- A comment on a question with no `classId` has no reviewer.
- Two review surfaces (answers, comments) rather than one unified queue.
- No bulk moderation, no AI grading or score UI; learning evidence unaffected.
- Known Functions lint debt (4), expo-doctor drift, historical unrelated NUL.

## Phase 99 Readiness

Comment manual review READY · reviewer auth READY · comment publication READY · commentCount
LIMITED (at-least-once, as documented) · comment author deletion READY · answer manual review
READY · question likes READY · answer likes READY · teacher edit student comment: NO · moderation
mutate learning evidence: NO. Strongest safe next capability: a single "İncelemeler" entry
combining both queues, or `provider_unavailable` continuity if a text provider is ever added.

## Product Assessment

The publication gate is now complete for both kinds of student content: what the automated layer
can settle it settles instantly; what it cannot, the person responsible for the class settles —
reading exactly what was written, publishing it verbatim or not at all, and never touching the
author's ownership of it.
