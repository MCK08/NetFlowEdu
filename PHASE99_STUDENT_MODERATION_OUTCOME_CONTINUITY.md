# Phase 99 — Student Moderation Outcome Continuity + Author-Safe Approval / Rejection Notifications

## Repository Sync

Local HEAD and `origin/phase17-moderation-infrastructure-20260806-195814` were both
`261a8da391e0fbf9644bd2deadd42925d57b38e7`, ahead/behind `0 0`, worktree clean — classification
**A, local == remote**. No fast-forward required.

## Actual Starting Head

`261a8da391e0fbf9644bd2deadd42925d57b38e7` — Phase 98, Class-Scoped Manual Comment Review. No
`PHASE99*` document and no Phase 99 commit existed on any branch.

## Collaborator Safety

`git fetch origin` before implementation, before commit and before push. `main` (`7abfd2f` local
and remote) never checked out, merged or pushed. No force, no rebase, no reset.

## Phase 97 / 98 Foundation

Phase 97 gave `manual_review` answers a reviewer — the canonical class teacher — and Phase 98 gave
comments the same one through the same shared authorization. Both decide publication and nothing
else, both are server-authoritative, both are idempotent, and both leave counters and publication
notifications to the existing triggers. Phase 99 changes none of that. It adds the one thing
neither phase produced: an ending the author can see.

## Product Mission

After a human decides, tell the person whose content it was — once, factually, and without naming
the reviewer or the machine reason. Nothing else: no submission history, no student moderation
dashboard, no appeals, no rejection taxonomy.

## Existing Outcome Matrix

Audited before writing anything. For each case: what the author actually receives today.

| Case | Author feedback | Notification produced | Recipient | When |
| --- | --- | --- | --- | --- |
| Answer approved | submit-time toast only | `question_answered` (onAnswerCreate) | **question owner** | at publication |
| Answer rejected | none | none | — | — |
| Comment approved | submit-time toast only | `question_commented` (onQuestionCommentCreate) | **question owner** | at publication |
| Comment rejected | none | none | — | — |

The two notifications that do exist are addressed to the *question owner*, not the author, and
`resolveQuestionEventRecipient` suppresses them entirely for teacher-owned questions and for
self-actions. The submit-time toast (`answerStatusFeedback` / `commentStatusFeedback`) is a
one-shot message with `dismiss: true`; it is produced by the submission call and can never observe
a later decision. No client code outside the teacher's own review service reads
`moderationSubmissions`.

## Confirmed Gap

All four cases. The author learns nothing at review time — an approval appears silently and a
rejection produces no artefact anywhere in the product. A student was told
"Onaylandığında yayınlanacak" and, if refused, was never told otherwise.

## Notification Architecture

Reused exactly as found; no second system, no new collection.

- `users/{uid}/notifications/{dedupeKey}` — the document id **is** `buildNotificationDedupeKey`
  (`recipientId_type_actorId_entityId`), which is what already makes creation idempotent.
- `createNotification.ts` is the only writer, split into `prepareNotification` (reads) and
  `commitNotification` (writes) after a 2026-08-05 production incident about Firestore's
  read-before-write rule. Phase 99 obeys that split.
- `NOTIFICATION_TYPES` grew by four; `NotificationEntityType` grew by one (`moderation`).
- `users/{uid}/notificationMeta/summary.unreadCount` is maintained by `commitNotification`, so the
  badge stays correct with no new code.

## Notification Side-Effect Ownership

One owner: `functions/src/moderation/moderationOutcome.ts`, called by
`applyAnswerReview` and `applyCommentReview` and by nothing else. Counters and publication
notifications keep their existing owners — `onAnswerCreate` and `onQuestionCommentCreate` — and the
review path still contains no reference to `answerCount`, `commentCount` or `FieldValue.increment`.
Two notifications can result from one approval, and they are not duplicates: one tells the question
owner that content arrived, one tells the author what happened to their submission.

## Author Recipient

`submission.authorId`, read from the moderation submission document the server loaded. Never from
the request: the callables accept `submissionId` and `decision` and read nothing else, proven at
runtime by passing `recipientId` / `authorId` / `reviewedBy` in the payload and observing that the
named user received nothing and `reviewedBy` recorded the real caller.

## Reviewer Privacy

The actor is `"system"` with display name `"NetFlowEdu"`. `reviewedBy` stays internal to
`moderationSubmissions`; the notification document contains no teacher uid, name or profile, and
the four presentation branches are the only ones in the mapper that never render `actorDisplayName`.
A pinned test asserts the helper contains no `reviewedBy`/`callerUid`/`reviewerId`/`teacherId`.

The system actor also solves a real constraint rather than being decoration: `prepareNotification`
returns null when `actorId === recipientId`, so an outcome addressed to the author would have been
silently dropped had the author been named as actor — and naming the teacher would have leaked the
reviewer. A non-uid sentinel is the only value that is neither.

## Approval Outcome

`answer_review_approved` / `comment_review_approved` — "Yanıtın yayınlandı" / "Yorumun yayınlandı",
with "Artık sınıfta görüntülenebilir." No celebration, no gamification, no teacher.

## Rejection Outcome

`answer_review_rejected` / `comment_review_rejected` — "Yanıtın yayınlanmadı" / "Yorumun
yayınlanmadı", with "Yeni bir yanıt/yorum gönderebilirsin." No reason, no blame, no academic
judgement. A test asserts the copy contains none of "yanlış", "hatalı", "kural", "uygunsuz",
"ihlal", and none of the four machine reasons.

## Answer Outcome Contract

Prepared in the read phase of the same transaction that flips the submission to `approved` /
`rejected`, committed in its write phase, alongside the answer document the shared finalizer
produces. One transaction: the decision, the published answer and the author's notification commit
together or not at all.

## Comment Outcome Contract

Identical, through the same helper, alongside `finalizeApprovedComment`.

## Notification Identity

`{authorId}_{type}_system_{submissionId}` — derived from the **immutable moderation submission**,
not the question. This is the phase's load-bearing detail: a question-keyed identity would have
silently merged two rejected answers on the same question into one notification and lost one of
them. Pinned by unit test and proven at runtime with two submissions on one question.

## Retry Idempotency

Two independent mechanisms, either sufficient. The review callables short-circuit on
`state === target` and return `alreadyDecided` before re-entering the write path; and the
notification's document id is deterministic, so `prepareNotification` finds it and plans nothing.
Runtime: approve→retry and reject→retry each leave exactly one notification, one answer/comment,
and one counter increment.

## Concurrent Review Idempotency

Two sessions approving the same submission at the same instant: one answer document, one
`answerCount` increment, one publication notification, one author outcome. The loser's transaction
re-reads the submission, sees `approved` and writes nothing.

## Final-State Semantics

Unchanged from Phase 97/98 and re-proven: `rejected → approved` and `approved → rejected` are
refused by `applyTransition`, so a submission has exactly one final decision and therefore at most
one outcome notification. Phase 99 depends on that and does not weaken it.

## Deep-Link Contract

All four types route through `parentEntityId` — the parent question — exactly as `answer_liked`
already does. `entityId` (the submission id) is never a route. A rejection has no published
document, so routing to content would have meant inventing an id; the parent question is valid for
both outcomes and is where the student wanted to be anyway. A null parent degrades to the existing
`unavailable` branch instead of a broken push.

## Existing Publication Notification Interaction

Unchanged and re-proven at runtime: manual answer approval still produces exactly one
`question_answered` for the question owner, manual comment approval exactly one
`question_commented`. The review path calls neither `prepareNotification` nor `commitNotification`
directly — only the shared outcome helper — and a test pins that boundary.

## Self-Recipient Edge Cases

When the author answers their own question, `resolveQuestionEventRecipient` and the self-actor
guard already suppress the publication notification. The outcome notification is still delivered,
because its actor is the platform. Proven at runtime: publication notification `0`, outcome `1` —
the author is told exactly once, by the message that actually answers their question.

## Raw Notification Security

No rules change. `users/{uid}/notifications` was already `read: isOwner(uid)` with create, update
and delete all `if false`. Three regression tests pin the Phase 99 shape specifically: a teacher
cannot write an outcome into a student's inbox, a student cannot fabricate their own, and neither a
classmate nor the reviewing teacher can read it.

## Author Status Surface Decision

The submit-time toast is the only author surface and it cannot observe a later decision. It was not
turned into a persistent status view — that would be the submission-history product this phase
forbids. Its pending copy now reads "Onaylandığında yayınlanacak. Sonucu bildirimlerinde
göreceksin.", which is true only because the outcome it points at now exists.

## No Submission-History Decision

Not built. No "gönderilerim", no moderation history, no status dashboard, no new navigation domain.
Continuity is delivered entirely through the existing notification centre.

## Provider Failure Wording

A submission reaches human review because the provider was unavailable, because there was no OCR
provider, or because the automated check was uncertain. None of those is the student's doing and
none appears in their copy — only the publication outcome. Automated moderation itself is
untouched: fail-closed stays fail-closed, explicit provider rejection stays terminal.

## Runtime QA

Emulators only — Auth, Firestore, Storage and Functions all on `127.0.0.1`; production not
targeted. Functions rebuilt before the run and the compiled `lib/` verified to contain the outcome
logic. **52 assertions, 52 passed**, covering N1–N13 and N16: answer approve/retry/concurrent,
answer reject/retry, comment approve/retry, comment reject/retry, seven unauthorized actors,
cross-class, forged request fields, learning evidence, and the self-recipient case.

## Security QA

Author, classmate, unrelated teacher, organization admin, platform admin, outsider and anonymous
all refused, each leaving the submission in `manual_review` and producing **zero** notifications —
a denied review must never tell a student their content was published. Cross-class refused. Request
fields naming another recipient ignored.

## Answer Regression

Phase 92 desired-state likes, Phase 97 review authorization and media access unchanged; the answer
review suite (44 tests) still passes unmodified.

## Comment Regression

Phase 93 create/delete gateway and Phase 98 comment review unchanged; those suites pass unmodified.

## Counter Regression

`answerCount` +1 exactly once on approval, +0 on retry, +1 total under concurrency, 0 on rejection.
`commentCount` identical. Neither the helper nor the review path references a counter.

## Learning Evidence Regression

`studyEvents` and `studyItems` empty for both the author and the question owner after every
decision. The outcome helper contains no reference to `studyEvents`, `studyItems` or
`semanticDefinitions`, pinned by test.

## Query / Cost

One notification document write per final human decision, plus one `tx.get` of that document and
one of `notificationMeta/summary` inside the transaction that was already running. The actor
snapshot is supplied rather than read, so there is no `users/system` lookup. No new collection, no
new index, no listener, no polling, no fanout — one recipient, always the author.

## UI Decision

No redesign. Four new branches in the existing presentation and navigation mappers, rendered by the
unchanged `NotificationRow`. The client's unknown-type filter (`isKnownNotificationType`, which
existed and was wired to nothing) is now applied when mapping documents, so a client running an
older build meets a type it has no branch for and skips that row instead of throwing out of the
exhaustive switch and taking down the whole inbox.

## Responsive QA

Measured against the row's real 263px text column (375 − 40 padding − 12 gap − 40 avatar − 20
unread dot) rather than estimated. Titles are 125–162px at 100% and 182–237px at 150% against a
two-line cap — they never truncate at any supported scale. "Artık sınıfta görüntülenebilir." fits
at both. The original softer rejection line ("İstersen yeni bir yanıt gönderebilirsin.") measured
306px at 150% and would have been cut off for precisely the readers who enlarge text, so it was
shortened to "Yeni bir yanıt gönderebilirsin." (237px at 150%). Copy is token-styled, so light,
dark and desktop follow the existing row with no new colour or layout.

## Accessibility

The outcome is carried by text, never by colour or icon alone — "Yanıtın yayınlandı" and "Yanıtın
yayınlanmadı" are distinct sentences. `notificationAccessibilityLabel` now includes the secondary
line, so assistive tech receives the full message and the next step even where the visual line
truncates, followed by the existing read/unread state. No raw ids, no uid, no reviewer.

## iOS Decision

New native dependency: NO. Native config: NO. Native-only API: NO. Native-only behaviour: NO.
Confirmed native defect: NO. In-app notification documents and copy only.
**NATIVE IOS: NOT REQUIRED THIS PHASE.**

## Automated Validation

typecheck PASS · lint PASS · unit **184 suites / 3614 tests** (from 183 / 3592) · rules
**13 suites / 644 tests** (from 12 / 626) · Functions build PASS · Functions lint 4 pre-existing in
`textNormalization.ts`, **0 new** · `npm run verify` PASS · expo-doctor 17/18 (known dependency
drift) · `git diff --check` clean · runtime QA 52/52.

## Source Integrity

UTF-8 throughout; no NUL, CRLF, BOM or unexpected control characters in any touched file. No
secrets, no credentials, no signed URLs. The temporary QA probe was deleted. `.env` untouched. The
historical unrelated NUL in `studentPerformance.ts` untouched.

## Known Limitations

- Continuity is delivered through the notification centre only; there is no submission history and
  no student-facing moderation view.
- A student who never opens notifications still never sees the outcome; nothing pushes it.
- No push or email delivery was added — in-app notifications only, as before.
- Reviewer identity stays private, so a student cannot tell who decided, by design.
- No rejection reasons: a student is told their content was not published, not why. A teacher has
  no way to say more, also by design.
- The rejection's guidance line truncates visually only if a future copy change lengthens it; the
  outcome itself and the spoken label never truncate.
- The class teacher remains the only reviewer (Phase 97/98); no org, platform or moderator
  authority; manual review still depends on teacher availability.
- A submission with no `classId` still has no reviewer and therefore no outcome.
- `answerCount` stays materialized with at-least-once trigger semantics; `commentCount` likewise.
- Answer likes stay desired-state safe; comments stay server-authoritative; no answer edit or
  delete; no AI grading; learning evidence unaffected.
- Older already-installed clients will skip these notification types rather than render them; the
  filter added here protects this build and every later one, not builds already shipped.
- 4 known Functions lint findings, expo-doctor drift, historical unrelated NUL.

## Phase 100 Readiness

Answer moderation outcome READY · comment moderation outcome READY · approval continuity READY ·
rejection continuity READY · notification idempotency READY · reviewer privacy READY · deep-link
safety READY · learning evidence UNCHANGED.

Strongest safe next capability: the moderation loop is now closed end to end — automated decision,
human resolution, author outcome. The remaining thin spot is operational rather than product:
quarantined objects are retained forever after a decision, and nothing reconciles a materialized
counter if a trigger is ever delivered twice.

## Product Assessment

A student who submits work now always finds out what happened to it. The machine settles what it
can, the person responsible for the class settles what it cannot, and either way exactly one
factual message reaches the person who was waiting — without naming the teacher, without blaming
the student for a vendor outage, and without inventing a reason nobody gave.
