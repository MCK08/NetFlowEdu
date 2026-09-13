# Phase 97 — Class-Scoped Manual Answer Review + Server-Authoritative Publication Continuity

## Repository Sync

Local HEAD before fetch was `17b97ce` (Phase 86); the canonical remote
`origin/phase17-moderation-infrastructure-20260806-195814` was at `b1b7df9` — ahead/behind `0 10`,
worktree clean: classification **B, behind-only**. `git pull --ff-only` fast-forwarded
`17b97ce..b1b7df9` (Phases 87–96). Post-pull: `0 0`, clean.

## Actual Starting Head

`b1b7df930ad1d4cb54f2b70c1d0582007cf8d947` — Phase 96, Verified Answer Publication Operability
(BLOCKED). No `PHASE97*` document and no Phase 97 commit existed on any branch.

## Collaborator Safety

`git fetch origin` ran before implementation, before commit and before push. The canonical remote
stayed at `b1b7df9` throughout. `main` (`7abfd2f` local and remote) was never checked out, merged or
pushed. No force, no history rewrite.

## Phase 96 Blocker

Phase 96 proved `manual_review` is reachable in a correctly configured production system
(`provider_unavailable`, `no_ocr_provider`, `uncertain`), that nothing resolved it (no callable, no
UI, every client patch 403), and that reviewer authority was undefined. It refused to guess.

## Product Decision

**The human reviewer for a `manual_review` answer submission is the canonical teacher of that
submission's class.** A narrow moderation permission: publish or do not publish. Nothing else.

## Canonical Reviewer

`classes/{classId}.teacherId` — written by `createClass` from `caller.uid`, trusted by
`regenerateClassJoinCode`, `removeClassMember`, `leaveClass` and every `classData(...).teacherId`
rule. Resolvable unambiguously; the server reads it on every call. The client sends no reviewer,
role, class, author or question identity — `submissionId` and a decision word only.

## Teacher Permission Boundary

May: list their own class's reviewable answer submissions; open one (question context, submitted
image, reason, author name, time); approve; reject. May not: edit OCR/text/image, change questionId
or ownerId, delete a published answer, alter likes, alter studyEvents/studyItems/semantic evidence,
alter learning state. There is no request field for any of those; the only writes are the status
flip, `reviewedAt`/`reviewedBy`, and the answer document the shared finalizer produces.

## Self-Review Policy

Refused after the teacher check (`authorId === callerUid` → `permission-denied`,
"Kendi gönderini inceleyemezsin."). Proven for approve, reject and detail; zero writes.

## Cross-Class Policy

Teacher B (verified `role: teacher`) against Class A: queue 403, detail 403, approve 403, reject
403, raw patch 403; own empty queue 200. A submission whose parent question belongs to a different
class than the submission claims is refused for both teachers.

## Moderation State Machine

Unchanged. `pending → scanning|approved|rejected|manual_review|failed`; `scanning → approved|
rejected|manual_review|failed`; `approved → removed`; `manual_review → approved|rejected|removed`;
`failed → scanning|manual_review|rejected`; `rejected`, `removed` terminal. The review path calls
`applyTransition` (the one caller outside the pure module) and targets only `approved`/`rejected`.

## Reviewable States

`HUMAN_REVIEWABLE_STATES = ["manual_review"]`. Pinned by unit test.

## Automated Review

Untouched in behaviour: a clean image with clean available OCR still auto-publishes through
`submitAnswerForModeration`; outage/timeout/error/uncertain/no-OCR still route to `manual_review`
(pinned by the Phase 96 decision tests, unchanged).

## Manual Review

Three callables in `functions/src/review/answerReview.ts`: `listAnswerReviewQueue`,
`getAnswerReviewDetail`, `reviewAnswerSubmission`. Each verifies the caller is the class teacher on
every call.

## Canonical Publication Finalizer

`functions/src/moderation/answerFinalization.ts`: `publishApprovedAnswerObject` (copy quarantine →
deterministic published path, attach token — outside the transaction) and `finalizeApprovedAnswer`
(write the answer document inside the transaction). `buildPublishedAnswerDocument` defines the
shape once. `submitAnswerForModeration` was refactored onto both; `applyAnswerReview` uses both.
Unit-pinned: the only `moderation|review` source spelling `likeCount: 0` is the finalizer.

## Automated / Manual Equivalence

Same keys (`questionId, ownerId, imageUrl, method, likeCount, createdAt`), same `likeCount: 0`,
same `createdAt = Date(now)` (publication moment), same published path scheme, same
`onAnswerCreate` counter/notification behaviour. Verified live: the manually published document's
key set equals `buildPublishedAnswerDocument`'s exactly; no review metadata leaks into it.

## Queue Architecture

Server-authoritative callable, class-scoped. Query: `moderationSubmissions where classId == X,
targetType == "answer_image", status == "manual_review" orderBy createdAt asc, __name__ asc, limit 21`.
Composite index added to `firestore.indexes.json` (pinned by test).

## Queue Authorization

`classes/{classId}.teacherId === caller.uid` or `permission-denied`. Proven live: class teacher
200; other teacher, student, organization_admin, platform_admin (both with verified claims),
outsider 403; anonymous 401.

## Pagination

20 per page, oldest first (pending work: the student who has waited longest is served first).
Cursor = `createdAt:submissionId`, opaque to the UI. Integration test: 23 seeded → 20 + 3, no
overlap, deterministic on re-fetch.

## Review Detail

Reason (factual copy), subject · topic, question text, submitted image, author display name (from
the class member record), method, relative time, `Yayınla` / `Yayınlama`. No textarea, no edit.
No raw uid, storage path or reviewer id in the payload (asserted) or on screen (checked).

## Quarantine Media

Mechanism: on detail open, the server copies the quarantined object to
`moderation/review/{submissionId}/upload.{ext}` (client-unreadable by rule) with a fresh download
token and returns that URL; each open replaces the copy; recording a decision **deletes** the copy.
Deletion is the revocation because production and the emulator honour it identically (the emulator
appends token metadata rather than replacing it — measured). Signed URLs were rejected: the runtime
SA cannot sign without an IAM grant and the emulator cannot sign at all. The teacher never receives
a quarantine-path URL; the review URL is used as an image source, never rendered as text.

## Storage Security

`storage.rules`: explicit `match /moderation/review/{submissionId}/{fileName} { allow read, write:
if false; }` (was covered by the catch-all; now stated). Rules tests: author, teacher, classmate,
anonymous reads denied; client writes denied. Integration: own-class teacher URL serves 200 and the
bytes match; other teacher/students/admins/outsider denied; anonymous unauthenticated; the same
object without the token is not served; an older URL dies on reopen; after a decision the copy is
gone (404).

## Review Reason Copy

`provider_unavailable` → "Otomatik inceleme şu anda tamamlanamadı."; `no_ocr_provider` → "Metin
incelemesi otomatik tamamlanamadı."; `uncertain` → "Otomatik inceleme bu yanıt için kesin karar
veremedi."; `no_image_provider` → "Görsel için otomatik inceleme yapılamadı." Unit-pinned to never
say güvensiz/şüpheli/tehlikeli/riskli/öğrenci.

## Approval Contract

auth → submission → `targetType` → class teacher → self-review → question-in-class → state
reviewable → publish object (pre-transaction, shared finalizer) → transaction: re-read submission,
re-verify teacher/question, re-check state, `tx.update` status/publishedEntityId/reviewedAt/
reviewedBy/updatedAt + `finalizeApprovedAnswer` → after commit: token repair if the race was lost,
review copy deleted. `reviewedAt`/`reviewedBy` are the schema's existing fields, server-written.

## Rejection Contract

Same authorization; transaction updates status `rejected`, `reviewedAt`, `reviewedBy`; no answer,
no object publication, no counter, no notification; review copy deleted; quarantine object retained.

## Approval Idempotency

Live (Functions emulator): retry ×2 after approval → `alreadyDecided: true`, same
`publishedEntityId`, one answer, `answerCount` 1, `reviewedAt` unchanged.

## Concurrent Approval

Live: two simultaneous `reviewAnswerSubmission(approve)` → one `alreadyDecided:false`, one `true`,
same `publishedEntityId`, **one** answer, `answerCount` 1, **one** `question_answered`
notification, winner's image URL serves. Integration test repeats it with real transactions and
also concurrent approve+reject → exactly one outcome.

## Rejection Idempotency

Live: concurrent reject ×2 → one fresh, one `alreadyDecided`; a third retry `alreadyDecided`; no
answer, count 0.

## Invalid Transitions

Approve after reject → `failed-precondition`; reject after approve → `failed-precondition`
("Bu gönderi için karar zaten verildi."); approve after approve / reject after reject → safe
already-decided result. No reopening path exists.

## Raw Moderation Security

Raw `status` patch on `moderationSubmissions`: student 403, teacher 403, organization_admin 403,
platform_admin 403. `allow write: if false` unchanged (pinned). Decision path: callable only.

## Author Experience

Unchanged copy. Pending: "Cevabın inceleniyor. Onaylandığında yayınlanacak." — now operationally
true. Approved: the author sees their own published answer (verified with the author's token:
answer visible, image serves, `answerCount` 1). Rejected: no client surface reads a submission
after the fact, so nothing is shown; the author's own submission document (author-readable by rule)
carries `rejected`, never an accusation. No submission-history feature was built.

## Teacher Experience

Entry: "Yanıt İncelemeleri" on the class page beside Sınıf Performansı / İlerleme Hikâyesi.
Queue: calm cards, trust note first ("Bu ekranda, otomatik incelemenin kesin karar veremediği
öğrenci yanıtlarını yayınlanmadan önce kontrol edebilirsin."). Empty: "İncelenecek yanıt yok."
Decision notices: "Yanıt yayınlandı." / "Yanıt yayınlanmadı." Already-decided race: "Bu gönderi
için karar zaten verilmiş." and the item drops. Focus/manual refresh only; no listener, no polling.

## Provider-Outage Continuity

Headline proof (Vision unreachable in the emulator = `provider_unavailable`): student submission
→ `manual_review`, no answer, count 0, no notification, student/other-teacher/admins denied →
class teacher queue shows it → approve in the UI → one answer, correct owner and question,
`answerCount` +1 once, review copy gone, queue item removed → retry: no duplicate.

## Uncertain Continuity

Integration test: a submission recorded with `decisionReason: "uncertain"` (the exact document the
decision layer writes — that layer's `review → manual_review/uncertain` mapping is unit-pinned) is
queued, inspectable, publishable by the teacher, and never auto-published; a separate uncertain
submission was rejected without publication. No provider double was wired into `resolveProviders`
— a test seam that can alter moderation is not something to ship.

## No-OCR Continuity

Same integration path with `no_ocr_provider`: queued, image inspectable (200), teacher decision
publishes; no automatic publication; no fake OCR (the schema retains none for images, and the
detail shows the image itself).

## Explicit Provider Rejection

`rejected` is terminal in the state table and the review path cannot leave it: approve on a
rejected submission → `failed-precondition`, zero writes. No teacher override was added.

## answerCount Exactness

manual_review 0 · approved +1 once · approval retry +0 · concurrent approval +1 total · rejected 0
· automated approval +1 once (unchanged path). The Phase 95 pin was updated deliberately: the one
`applyTransition` caller must never target `removed`, delete an answer, or decrement — asserted.

## Notification Exactness

`onAnswerCreate` remains the sole owner. Live on a student-owned question: approval → exactly one
`question_answered` to the owner; retry/concurrent → still one; reject → none. (Teacher-owned
questions notify no one by the existing `resolveQuestionEventRecipient` rule — unchanged.)

## Answer-Like Regression

On the manually published answer, as a classmate: like → `{liked:true, likeCount:1}`; same
operation retry → identical; unlike → `{liked:false, likeCount:0}`; retry → identical. Phase 92
preserved.

## Comment Regression

Comment create → published; same `operationId` retry → same entity; server delete → `deleted:true`;
retry → `deleted:false`. Phase 93 preserved.

## Question / Answer Security Regression

Raw question create/update/delete 403; raw answer create/update/delete 403; raw comment
create/delete 403; raw answerLikes/questionLikes writes 403; raw moderation patch 403.

## Learning Evidence Regression

Per-student `studyEvents`/`studyItems` digests and the class `semanticDefinitions` digest were
byte-identical to the pre-QA baseline after every decision, probe and regression call.

## Query / Cost

Queue: 1 callable, 1 query (≤21 docs) + 1 `getAll` distinct questions (≤20) + 1 `getAll` distinct
class members (≤20) — bounded, no per-item fan-out. Detail: 1 callable, 3 reads (submission, class,
question) + 1 re-read for enrichment + 2 `getAll` (1 each) + Storage exists/getMetadata/delete/copy/
setMetadata. Decision: pre-flight 3 reads; approve adds Storage exists/getMetadata/copy/setMetadata;
transaction 3 reads + 1 update + (approve) 1 answer set; after: (race only) 1 answer read + 1
setMetadata; 1 delete. `onAnswerCreate`: unchanged 1 transaction per answer. Indexes: +1. Listeners:
0. Polling: 0.

## Deployment Documentation

`FIREBASE_SETUP.md` §6c rewritten: who reviews, no org/platform authority, provider failure never
auto-approves, explicit refusal final, callable-only decision, one finalizer, index to deploy,
teacher availability as turnaround, production Vision enablement still operator-verified. No
credentials.

## Runtime QA

Emulators proven local before any credential (Auth `/emulator/v1/…/config` 200, Firestore "Ok",
Storage alive, Functions 401 for anonymous; 0 googleapis resources). Functions rebuilt before the
emulator started; the three review callables were listed in the load log. Student submissions went
through the canonical path (client-authenticated quarantine upload under Storage rules →
`submitAnswerForModeration`); the web drawing canvas cannot export on web (pre-existing,
`toDataURL` is native-only), so bytes were supplied from a canvas-rendered PNG and the file picker
step was driven from the signed-in page. Temporary fixtures (Teacher B/class B, org admin, platform
admin, one student-owned question) deleted and existence-checked; dev server and emulators stopped.

## Responsive QA

375 light and dark, 1280×800, 853×533 (≈150 %): no horizontal overflow; long question text,
1200×1600 image, empty queue, one item, approve/reject loading, already-reviewed race and
permission error states all rendered.

## Accessibility

Header role; every control labelled; all targets ≥44; image alt names the author and method;
reason/notice/error/loading carry `aria-live="polite"` (react-native-web does not emit it from
`accessibilityLiveRegion`, so it is set explicitly); row selection state in words and
`aria-selected`; no colour-only state; no raw ids.

## iOS Decision

New native dependency: NO · native config: NO · native-only API: NO · native-only behaviour: NO ·
confirmed native defect: NO. **NATIVE IOS: NOT REQUIRED THIS PHASE.**

## Automated Validation

typecheck PASS · lint PASS · unit **182 suites / 3577 tests** (+1 suite, +20) · rules **11 suites /
596 tests** (+1 suite, +48) · functions build PASS · functions lint: 4 pre-existing
(`textNormalization.ts`), 0 new · `npm run verify` exit 0 · expo-doctor 17/18 (known drift) ·
`git diff --check` PASS.

## Source Integrity

21 touched/new files: NUL 0, CRLF 0, no BOM, no unexpected control characters, UTF-8. No raw
colours in the new UI. No instrumentation. No secrets in the diff. `.env` untouched. Historical
`routing.ts` and the raw NUL in `studentPerformance.ts` untouched. `functions/src/review/.gitkeep`
replaced by real files.

## Known Limitations

- The class teacher is the only Phase 97 human reviewer; no org-admin, platform-admin or moderator
  authority exists.
- A submission with no `classId` (non-class question) has no reviewer in Phase 97.
- Comment submissions in `manual_review` are not in this queue (answers only).
- Teacher can approve/reject but cannot edit student content; teacher availability is the
  turnaround; a Vision outage raises queue volume.
- Production Vision API enablement remains operator-verified, not verified here.
- Quarantine objects are retained after a decision (no cleanup feature).
- Review-copy URLs are capability URLs for the life of the review (replaced on reopen, deleted on
  decision); they are not time-expiring signed URLs.
- The author can read `reviewedBy` from their own submission document by raw Firestore read (the
  rule was already author-readable); the UI never shows it.
- No bulk moderation, no answer edit/delete, no AI grading; `answerCount` stays materialized;
  likes stay desired-state safe; comments stay server-authoritative; learning evidence unaffected.
- Known Functions lint debt (4), expo-doctor drift, historical unrelated NUL.

## Phase 98 Readiness

manual_review OPERABLE · reviewer authorization READY · class scope READY · self-review protection
READY · cross-class protection READY · approval idempotency READY · concurrent approval READY ·
rejection READY · provider-outage continuity READY · uncertain continuity READY · answer
publication DEPLOYMENT-DEPENDENT (Vision enablement + index deploy) · answerCount READY · likes
READY · comments READY. Strongest safe next capability: comment `manual_review` through the same
class-teacher path.

## Product Assessment

Answer publication now has a complete contract: the machine clears what it can, and what it
cannot, the person responsible for the class decides — with no way to edit the student, no way to
reopen a refusal, and no second copy of the publication algorithm to drift.
