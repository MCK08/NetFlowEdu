# Phase 96 — Verified Answer Publication Operability + Vision Provider Readiness + Manual Review Continuity

## Repository Sync

Local HEAD was `18034b9` (Phase 95) and the canonical remote
`origin/phase17-moderation-infrastructure-20260806-195814` was at the same commit: ahead/behind
`0 0`, worktree clean — classification A, already current. No fast-forward was required.

## Actual Starting Head

`18034b978a1e567d0ef3828217c3f6f668cadad8` — Phase 95, Verified Answer Count Integrity +
Materialized Counter Truth. No `PHASE96*` document and no Phase 96 commit existed on any branch.

## Collaborator Safety

`git fetch origin` ran before implementation, immediately before commit and immediately before push.
The canonical remote stayed at `18034b9` throughout. `main` was never checked out, merged or pushed.
No force push, no history rewrite.

## Phase 95 Foundation

Phase 95 observed in passing that without a Vision provider, answers route to `manual_review` and no
reviewer path was found. Phase 96 exists to establish whether that is a deployment gap, an
incomplete feature, or an undecided product question.

## Product Mission

Determine the real intended production contract for answer publication — without weakening
moderation and without inventing review authority.

## Full Publication Pipeline

```
composer (photo / drawing)
  → client uploads to moderation/pending/{uid}/{uid}_{operationId}/upload.{ext}
  → submitAnswerForModeration (Admin SDK callable)
      auth → question exists + readable → quarantine path REBUILT server-side and compared
      → Storage metadata read (mime and size from the object, never from the request)
      → Cloud Vision SafeSearch + document OCR
      → decideImageModeration
      → moderationSubmissions/{uid}_{operationId} written with the decision
      → IF approved: object copied to the published path, answers/{id} created
  → onAnswerCreate: questions/{id}.answerCount += 1, question owner notified
```

Everything before the decision is server-authoritative and was re-proven this phase. Everything after
it depends on the decision being `approved`.

## Storage Quarantine Contract

The upload path is `moderation/pending/{uid}/{submissionId}/upload.{ext}`, deterministic so a retry
overwrites its own object rather than littering orphans. The server rebuilds that exact path from the
caller's uid and operation id and compares — a path naming another user's uid is refused
(`PERMISSION_DENIED`, proven). Metadata is read from Storage, never trusted from the request, so a
client that declares `image/png` and uploads something else is caught. On approval the object is
copied to the published path; a submission that never reaches approval leaves its quarantined object
in place.

## Provider Architecture

Google Cloud Vision — SafeSearch plus document OCR — wired in Phase 17B.

- **No API key, no secret, no npm dependency.** The function's own runtime service account mints the
  token. There is nothing to store in `.env`, in Secret Manager or in this repository, and therefore
  **no credential value exists in the repo to expose, and none was printed.**
- `callProvider` wraps every call in a hard timeout and converts *every* failure mode — rejection,
  timeout, malformed response — into `unavailable`. **There is no path through it that returns
  "clean" on error.**

## Provider Configuration Contract

The single requirement is that **`vision.googleapis.com` is enabled on the Firebase project**.
Verifiable with `gcloud services list --enabled`, which prints service names only.

## Deployment Prerequisites

**This was entirely undocumented.** `FIREBASE_SETUP.md` — the repository's deployment guide — did not
mention Vision, moderation or SafeSearch anywhere. An operator could follow every step in it and
still deploy a project whose answer surface never publishes anything.

Phase 96 adds §6c to that document: the API to enable, the fact that no secret is involved, the
fail-closed behaviour, the three routes into `manual_review`, and the operational consequence stated
plainly.

## Local / Emulator Provider Contract

The emulator has no access to `vision.googleapis.com`, so every locally submitted answer resolves to
`manual_review`. That is correct behaviour, and there is deliberately **no emulator-only auto-approve
branch** — a bypass keyed on an environment variable is exactly the kind of thing that reaches
production. To exercise publication locally, inject a provider double at the `resolveProviders` seam.

**No production Vision call was made during this phase's QA.**

## Moderation Submission Schema

`moderationSubmissions/{uid}_{operationId}`: `submissionId`, `authorId`, `targetType`, `questionId`,
`classId`, `organizationId`, `text` (comments) or image fields, `status`, `riskCategories`,
`decisionReason`, `operationId`, `publishedEntityId`, `createdAt`, `updatedAt`, **`reviewedAt: null`,
`reviewedBy: null`**, `schemaVersion`.

Those last two fields are the clearest evidence that human review was intended: the schema has
somewhere to record a reviewer, and nothing ever writes it.

## Moderation State Machine

States: `pending`, `scanning`, `approved`, `rejected`, `manual_review`, `removed`, `failed`.

Transitions: `pending → scanning|approved|rejected|manual_review|failed`;
`scanning → approved|rejected|manual_review|failed`; `approved → removed`;
`manual_review → approved|rejected|removed`; `failed → scanning|manual_review|rejected`;
`rejected` and `removed` terminal.

## State Reachability Matrix

| State | Created by | Transition out exists in code | Reachable in product |
|---|---|---|---|
| `pending` | initial value | yes | yes |
| `scanning` | decision layer | yes | yes |
| `approved` | automated decision (clean image **and** clean available OCR) | `→ removed` declared | **yes, automated only** |
| `rejected` | automated decision (block on either signal) | terminal | yes |
| `failed` | provider machinery | declared | yes |
| `manual_review` | three distinct reasons (below) | `→ approved|rejected|removed` declared | **reached: YES. Resolved: NO** |
| `removed` | — | terminal | **NO — no caller** |

`applyTransition` is invoked nowhere outside its own pure module and that module's unit test —
established in Phase 95 and re-verified here.

## manual_review Creation

Three reasons, all live:

| Reason | When |
|---|---|
| `provider_unavailable` | Vision disabled, outage, timeout, error, or malformed response |
| `no_ocr_provider` | Vision answered, but no OCR text was available — handwriting is exactly what image classifiers miss |
| `uncertain` | Vision **or** the OCR text layer returned "review" |

The third matters most: `uncertain` is the provider's *intended* verdict for ambiguous content. So
`manual_review` is not merely a symptom of misconfiguration — **a correctly deployed project with
Vision fully enabled will still route answers there routinely.**

## manual_review Resolution Before Phase 96

**Nothing resolves it.** Proven at runtime, not inferred:

- No reviewer callable is deployed. Eight plausible names were probed against the live Functions
  emulator; none exists.
- No client may patch a submission's status: teacher **403**, the author **403**, an outsider **403**.
  The submission remained `manual_review` throughout.
- No moderation UI exists anywhere in the client. Every apparent match in a repository-wide search
  was the *spaced-review* study system, not moderation.

**MANUAL REVIEW IS A TERMINAL PRODUCT STATE TODAY.**

## Reviewer Authorization Audit

| Candidate | Status |
|---|---|
| a dedicated moderator / reviewer role | **does not exist** — the role enum is `student`, `teacher`, `organization_admin`, `platform_admin` |
| class teacher | not designated anywhere; Phases 86–94 consistently refuse teachers authority over student content |
| organization admin | has an `isOrgAdmin` helper that Phase 90 left orphaned; never named for moderation |
| platform admin | exists for role administration (`adminSetUserRole`); never named for content review |
| the author | reviewing one's own submission would defeat the gate |

There is no Phase 17 document in the repository, and `SECURITY.md` does not state a moderation
authority. The `moderationSubmissions` rule comment says reviewer read access is not granted because
"the review queue is a server-side callable" — describing an architecture that was never built.

**Reviewer authority is undefined.** It cannot be derived from the code, the roles, the rules or the
documentation.

## Existing Moderation UI Audit

None. No route, no queue, no screen, no service.

## Current Fail-Closed Runtime Proof

13 of 13 checks passed against the emulator with real tokens, with Vision unreachable — which *is*
the provider-unavailable condition under test.

- A valid answer was **not** auto-published; zero answer documents.
- Stored state `manual_review`, reason `provider_unavailable`, category `provider_unavailable`.
- `answerCount` untouched.
- The quarantined object retained in `moderation/pending/`, not published.
- No publication notification to the question owner.
- Unauthenticated, outsider, missing-upload and forged-path submissions all refused with zero writes.
- Every Phase 88–95 raw lifecycle denial intact (question create/update/delete, answer create,
  comment create — all 403).
- No `studyEvents` or `studyItems` written.

**Safety is intact. The system fails closed exactly as designed.**

## Branch Decision

**BRANCH C — BLOCKED BY REVIEW AUTHORIZATION.**

**Why not Branch A.** Branch A requires that automated provision is the deployment contract *and*
that manual review is not needed as a fallback. The brief's own condition settles it: "if
`manual_review` can still occur during ambiguous provider results: prove how those submissions are
resolved. If they cannot be resolved, Branch A is NOT sufficient." They occur by design via
`uncertain`, and they cannot be resolved. Enabling Vision reduces the rate; it does not close the
hole.

**Why not Branch B.** Branch B requires that "reviewer authority is already defined". It is not — no
moderation role exists, and no document, rule or helper designates one. Building a review gateway
would mean choosing between teacher, org admin and platform admin by guess, in a product whose last
nine phases have repeatedly refused to widen teacher authority over student content. The brief
forbids this in four separate places, and it is the one decision in this area that must not be made
by inference.

**Rejected alternatives:** auto-approving on provider unavailability (forbidden, and the exact bug
the architecture was built to prevent); an emulator-only bypass (would reach production); treating a
provider outage as a content rejection (would falsely tell a student their work violated the rules).

## Publication Finalization

Single path today: the approval branch inside `submitAnswerForModeration` copies the object and
creates the answer. **Not refactored** — extracting a shared finalizer only earns its keep when a
second caller exists, and building that second caller is the blocked decision.

## Automated / Manual Schema Equivalence

N/A — there is no manual approval path to diverge from the automated one. When one is built, it
**must** reuse the same finalization rather than implement a second answer-creation algorithm.

## Approval / Rejection Idempotency

N/A this phase. Recorded as a requirement for whoever builds the review path: first approval creates
exactly one answer; a retry creates none; concurrent approvals yield one; `answerCount` increments
once; the notification fires once.

## Reviewer Security

N/A — no reviewer exists. What *was* verified is that the submission document is not client-writable
by anyone, which is the right foundation for a future callable-only review path.

## Storage Review Access

Not widened. Quarantined objects remain unreadable to clients. A future reviewer surface must solve
media access without broadening the bucket — noted, not implemented.

## answerCount Regression

Phase 95's contract intact: no unpublished, pending or refused submission moved the counter.

## Answer-Like Regression

Phase 92 untouched; no answer was published this phase to like, and the callable was not modified.

## Comment Regression

Phase 93 untouched.

## Question Lifecycle Regression

Phases 88–90 intact: raw question create, update and delete all 403; raw answer create 403; raw
comment create 403.

## Failure Semantics

The author-visible mapping collapses seven internal states into four: `checking`, `in_review`,
`published`, `not_published`. A provider outage maps to `in_review`, **not** to `not_published` — so
an outage is never presented as "your content broke the rules". That distinction is already correct
and was preserved.

## Provider Outage Semantics

Correct and unchanged: an outage is an operational condition, never a content judgement, and the copy
reflects that.

## Author Experience

**This is the sharpest consequence of the blocker, and it is user-facing.**

A student whose answer lands in `manual_review` is shown:

> **"Cevabın inceleniyor."** — "Onaylandığında yayınlanacak."
> *("Your answer is being reviewed." — "It will be published when approved.")*

That copy promises an approval that no one can currently give. The student waits for an event that
cannot occur.

The copy was **deliberately not changed** in this phase. Which wording is honest depends on the
decision that is blocked: if a reviewer is introduced, the current sentence becomes true; if the
decision is instead that Vision is mandatory and `manual_review` is an incident state, it needs
different wording entirely. Rewriting it now would presuppose the answer and quietly hide the
problem, which is worse than stating it.

## Reviewer Experience

N/A — not built, deliberately.

## Query / Cost

**Zero change.** No callable, trigger, index, collection, listener or query was added or altered. The
only changes are one documentation section and one test file.

## Deployment Documentation

`FIREBASE_SETUP.md` §6c added, covering the Vision prerequisite, the absence of any secret, how to
verify readiness without exposing values, the fail-closed behaviour, the three routes into
`manual_review`, the terminal-state consequence, and the local/emulator contract.

## Production Readiness Honesty

- **Code contract: READY.** Fail-closed behaviour is correct and now test-pinned.
- **Deployment configuration contract: READY** as of this phase — previously undocumented.
- **Actual production secret presence: NOT APPLICABLE.** There is no secret; the requirement is an
  enabled API.
- **Production Vision API enablement: NOT VERIFIED FROM REPOSITORY.** It cannot be, and no production
  call was made to check. An operator must verify it on the project.
- **Manual review continuity: NOT READY** — blocked.

## Runtime QA

13/13, described above.

## Rules QA

548 rules and integration tests pass unchanged. No rule was modified.

## Learning Evidence Regression

No `studyEvents`, `studyItems` or semantic evidence was written or read. Phases 42–47, 59 and 61–95
untouched.

## UI Decision

**UI changed: NO.** No screen, component, control or copy was touched — including the author-facing
copy discussed above, deliberately.

## Accessibility

**N/A — no interface change.**

## iOS Decision

- New native dependency: **NO**
- Native configuration change: **NO**
- Native-only API: **NO**
- Native-only behaviour: **NO**
- Confirmed native defect: **NO**

**NATIVE IOS: NOT REQUIRED THIS PHASE.**

## Automated Validation

- `npx tsc --noEmit` (root and functions) — clean
- `npx eslint . --ext .ts,.tsx` — clean
- `npx jest` — **3557 passed, 181 suites** (was 3546 / 180)
- `npm run test:rules` — **548 passed, 10 suites**
- `npm run verify` — pass
- Functions build — pass
- Functions lint — **4 errors, all pre-existing, zero new**
- `git diff --check` — clean
- `npx expo-doctor` — 17/18
- Runtime QA — 13/13

## Source Integrity

Both changed files: no NUL, no CR or CRLF, no BOM, no stray control characters, final newline
present, UTF-8. **No credential value appears anywhere** — the added documentation names an API and a
verification command only. No instrumentation, no `.only`/`.skip`. The temporary probe was deleted;
`functions/scripts/` holds only the repository's own seed script.

## Known Limitations

- **THE BLOCKER: `manual_review` is a terminal product state, and reviewer authority is undefined.**
  Some proportion of legitimate answers will never publish, including in a correctly configured
  deployment.
- **The student is told their answer "will be published when approved."** That promise cannot
  currently be kept. The copy was left alone because the honest replacement depends on the blocked
  decision.
- **Vision enablement in production was not verified**, and cannot be from the repository. No
  production call was made.
- **Quarantined objects are retained indefinitely** for submissions that never resolve. No cleanup
  job was added; none should be added before the lifecycle decision.
- **No reviewer path, queue, role or UI was created.** Deliberate.
- No auto-approval fallback exists, and none was added.
- `answerCount` remains materialized (Phase 95); answer likes remain desired-state safe (Phase 92);
  comments remain server-authoritative (Phase 93); answer create/update/delete remain closed to
  clients (Phase 94).
- No AI answer generation, grading, scoring or safety-score UI was added.
- Learning evidence is unaffected.
- **`functions` lint reports 4 `no-irregular-whitespace` errors** in
  `functions/src/moderation/textNormalization.ts`, from commit `2fdb5b5` — literal zero-width
  characters inside the moderation stripper's regex classes, load-bearing. Untouched. Zero new.
- **`expo-doctor` reports 3 Expo patch-version drifts.** Pre-existing, unrelated, not in this
  changeset.
- **Pre-existing technical debt, untouched:** `src/features/teacher/services/studentPerformance.ts`
  still contains one raw NUL byte.

## Phase 97 Readiness

The safety half is ready and now pinned: a provider that is missing, erroring, timing out or unsure
cannot publish, and a test asserts each of those individually. The operability half is blocked on one
question that only the product can answer:

> **Who may review an answer that automated moderation could not clear — and does that role exist, or
> must it be created?**

Once that is answered, the work is well-specified: a single server-authoritative review callable
reusing the existing publication logic, idempotent approval and rejection, a bounded queue, and media
access that does not widen the bucket. All of it is recorded above, and a test now fails the moment
someone starts building it without deciding first.

## Product Assessment

The phase was briefed as provider readiness and turned out to be about a promise. The moderation
pipeline is well built — it fails closed on every path, it refuses forged quarantine paths, it reads
metadata from storage rather than the request, and it never blames a student for an outage. What it
lacks is the other half of a decision someone made when they wrote `reviewedAt` and `reviewedBy` into
the schema and then never built the reviewer. Until that person is named, a student can be told to
wait for an approval that nobody is able to give, and the right response to that is to say so rather
than to pick a reviewer by guess.
