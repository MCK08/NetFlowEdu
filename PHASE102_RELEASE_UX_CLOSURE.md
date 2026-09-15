# Phase 102 — Release UX Closure: Back Navigation, Class-Teacher Message Moderation, Message Seen Receipts, Light / Dark / System Theme Consistency

## Repository Sync

Local HEAD and `origin/phase17-moderation-infrastructure-20260806-195814` were both `79499be`,
ahead/behind `0 0` — classification **A, local == remote**. No fast-forward required. The only
non-clean item was `package.json` (`android`/`ios` scripts rewritten to `expo run:*` by the Expo
CLI during the earlier physical-iPhone session); left untouched and unstaged.

## Actual Starting Head

`79499be` — Phase 101, teacher action center discoverability. No `PHASE102*` document and no
Phase 102 commit existed anywhere. The old multi-class Phase 102 was not started; Phase 103 was
not started.

## Collaborator Safety

`git fetch origin` before implementation, before commit and before push. Remote stayed `79499be`
throughout. `main` (`7abfd2f` local and remote) never checked out, merged or pushed. No force.

## Product Mission

Four release-blocking UX gaps found on a physical iPhone, closed with the smallest honest change
each: every pushed screen has a way out; a class teacher can remove a student's message from
their own class conversation; a sender can see that a message was read; the app's chrome follows
the chosen theme instead of leaking white bars under a dark surface. No new chat system, no
moderator role, no presence/typing, no AI, no classifier change, no SDK upgrade, no TestFlight.

## Back Navigation Audit

Every Expo Router layout is `headerShown: false`, so each nested screen owns its own back
affordance — and five had none: Öğrenme Haritam (`ConceptMasteryMapScreen`), Zorlanma
Örüntülerim (`StrugglePatternsScreen`), İlerleme Hikâyem (`StudentLearningStoryScreen`), Sınıfın
İlerleme Hikâyesi (`TeacherLearningStoryScreen`) and the Edit Profile modal (no close). A further
22 sites carried their own bespoke `Pressable`/`router.back()` chevrons, each with its own
fallback logic or none.

## Back Navigation Contract

One shared affordance, `AppBackButton` (`src/components/ui/AppBackButton.tsx`, built on the
existing `IconButton`, 44pt target, `accessibilityLabel="Geri"`, themed tint), driven by
`useBackNavigation(fallbackHref)` and the pure rule `resolveBackNavigation(canGoBack, fallback)`:
history present → `router.back()`; no history (deep link, notification tap, shared URL) →
`router.replace(fallbackHref)`, where the fallback is each screen's declared canonical parent.
iOS swipe-back, browser back and Android back are untouched — the stack is native; the button
only adds an explicit control. Root tabs (11 routes) and the signed-out auth flow (5 routes) are
explicitly listed and get no back button.

## Route Audit Test

`tests/unit/routeBackAudit.test.ts` walks every `app/**/*.tsx` route, resolves the screen it
renders through the feature barrels, and asserts every non-root route reaches `AppBackButton`
(directly or through a same-feature header component such as `ChatHeader`/`QuestionHeader`). A
new route file must be placed deliberately — either listed as a root or carrying the affordance.
It also asserts the root tabs do not render the shared back button. 36/36.

## Message Model Audit

There is no DM feature. The one conversation is the class group chat,
`classes/{classId}/messages/{messageId}`, written client-side under rules that deny every update
and delete; `deleted`/`editedAt` were reserved for "a future edit/delete feature" and never
written. Student self-delete has never existed; Phase 102 does not introduce it. Rate limiting
(`messageRateLimits/{uid}`) and the optimistic-send/reconciliation path are unchanged.

## Teacher Moderation Contract

`removeClassMessage({ classId, messageId })` — `functions/src/classes/removeClassMessage.ts`, the
Phase 93 gateway shape (`applyRemoveClassMessage(db, callerUid, data)`). The payload is the
message's path and nothing forgeable. The server loads the class and the message and derives every
right from stored data: `classes/{classId}.teacherId === caller`, `message.senderRole ===
"student"`, `message.senderId !== caller`, stored `classId` equals the path. No role claim is read
at all.

## Moderation Authorization Matrix

Proven against a real Firestore in `tests/integration/removeClassMessage.emulator.test.ts`
(M1–M11): teacher of this class → removed; teacher of another class → `permission-denied`; a
teacher addressing a foreign message through their own class's path → `not-found`; the message's
own author → denied; another student → denied; organization admin and platform admin → denied
(no role is consulted); the teacher's own message → denied ("Yalnızca öğrenci mesajları
kaldırılabilir."); stored/path classId mismatch → `not-found`; malformed ids → `invalid-argument`.

## Removal Semantics

A soft delete, transaction-scoped: `deleted: true`, `deletedAt: serverTimestamp()`, `deletedBy`,
`text: ""`. `createdAt`, `editedAt`, sender fields and `clientMessageId` are never touched — no
timestamp moves, no words are rewritten, no impersonation path exists. An already-removed message
returns `{ removed: false }` as a success (retry after a lost response is safe); two concurrent
removals remove exactly once. The document stays so the conversation keeps its shape: the bubble
renders "Bu mesaj öğretmen tarafından kaldırıldı." in place, with its original time.

## Moderation UI

Long-press on a student bubble (teacher only, `canRemoveMessage`) opens the app's shared
`BottomActionSheet` with the excerpt, one row "Mesajı kaldır", then a plain confirmation "Bu
öğrenci mesajını kaldırmak istiyor musun?" with "Kaldır" / "Vazgeç". No red button, no reason
field, nothing a student ever sees. Works on web and native (a real `Modal`, not `Alert.alert`).
The same action is exposed to screen readers via `accessibilityActions`. The UI gate uses the
viewer's member role — a class's member list can hold exactly one teacher (its owner: `createClass`
adds the owner, `joinClassByCode` admits students only) — and the server checks `teacherId` again
regardless. Refusals map to sentences without ids (`messageModeration.ts`).

## Message Seen Model

`classes/{classId}/chatReads/{uid}` = `{ lastReadMessageId, lastReadAt, updatedAt }` — one read
cursor per member, the newest message they have opened the conversation on. `lastReadAt` is the
message's own stored `createdAt` (the client passes the raw `Timestamp` from the live snapshot, so
it equals exactly); `updatedAt` is `request.time`. A class chat is a group, so "seen" is
per-recipient: a single `seenAt` on the message would be wrong and none exists.

## Seen Rules

`firestore.rules`: read by any class member; create/update only by the owner, only while a member,
only with exactly those three keys, `lastReadAt == get(message).createdAt` (the message must exist
in this class), `updatedAt == request.time`, and on update `lastReadAt >= resource.lastReadAt`
(monotonic; an identical re-mark is idempotent); delete `false`. No field could carry presence,
typing or online state — extra keys are refused. `tests/integration/classChatReads.rules.test.ts`
R1–R9, plus a re-pin that the class teacher, the author and other members still cannot update or
delete a message from the client.

## Seen Semantics

Marked only when the conversation is genuinely in front of the member: the chat route is focused
(`useFocusEffect`) AND the app is in the foreground (`AppState === "active"`; on web this follows
document visibility). Fetching, a background listener delivery or a notification never marks.
One write per "the newest message changed while I was looking", skipped entirely when the
member's own cursor already covers it (`shouldMarkRead`). The sender's label — "Görüldü" for one
reader, "Görüldü · N" for several — sits under the sender's newest confirmed, not-removed message
only, derived from every OTHER member's cursor (`seenCount` never counts the sender). Pure rules
pinned in `tests/unit/chatReadReceipts.test.ts`.

## Theme Audit

Confirmed on the iOS Simulator: with the OS in Light (System), the student Akış is the Phase 55
immersive dark pager (`#0B0B0F`, pinned in both themes) while the channel strip and the bottom tab
bar followed the light theme — white bars under a dark surface. Not reproduced in Dark. Teacher
feed, other tabs and nested stacks were coherent. Root: the immersive surface carried no chrome of
its own.

## Theme Fix

`src/theme/immersive.ts` gives the immersive surface its chrome from the dark palette
(`immersiveChrome`, `immersiveTabBarStyle()`). The student feed tab alone gets
`tabBarStyle: immersiveTabBarStyle()` and immersive tints; `FeedChannelBar` gains a
`surface="immersive"` variant; `FeedScreen` renders `<StatusBar style="light" />` only while
focused. Every other tab, the teacher feed and every nested screen keep the themed bar. System
resolves through the existing `resolveTheme` — verified live: flipping the simulator's appearance
re-themed Çalış, the chat and the nested screens without a restart.

## Status Bar / Safe Area / White Flash

`app/(student)/_layout.tsx` and `app/(teacher)/_layout.tsx` now set
`contentStyle: { backgroundColor: colors.background }` (the root stack already did), so a pushed
card never paints a default white ground between screens in Dark. The feed's light status bar is
scoped to focus; other screens keep the resolved-theme status bar from `app/_layout.tsx`. No new
`#fff`/`#000` on themed surfaces; the only raw white in the diff is `ClassFeedScreen`'s
pre-existing pinned chrome, now expressed as `IMMERSIVE_FOREGROUND`.

## Theme Structural Tests

`tests/unit/themeChrome.test.ts` (12): System → OS scheme, explicit choice overrides; runtime
palette follows the active theme; both tab layouts paint `tabBarStyle`/`sceneStyle` from tokens
with no literal; all three stacks paint `contentStyle` from tokens; immersive tokens are the dark
palette; the student feed tab and channel bar use the immersive chrome and no white returns; the
teacher feed stays themed.

## Query / Cost

Removal: 1 callable; transaction 2 reads + 1 update. Reads: 1 listener on `chatReads` per open
chat (documents = class members, ≤ member count), open only while the chat is focused and
foregrounded; 1 write per newest-message change while open, 0 when the cursor already covers it, 0
on fetch/background. Rules: +1 `get` (the message) and the existing membership `exists` per cursor
write. Indexes: +0. Polling: 0. Triggers: 0 new. Storage: none. Teacher UI gate: 0 extra reads
(no class document fetch).

## Runtime QA

Emulator-only (`EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true`, host from `resolveEmulatorHost()`,
nothing hardcoded). Functions rebuilt before the emulator started; `removeClassMessage` listed in
the load log. Demo fixtures re-seeded. iOS Simulator (iPhone 15 Pro, dev client) as the teacher,
web as Öğrenci A: student message → teacher opened the chat → "Görüldü" appeared live on web →
teacher long-press → sheet → confirm → Function ran once (251 ms) → both sides show the placeholder,
`createdAt` unchanged, `deletedBy` = teacher. Teacher message → "Görüldü" on the simulator; a
second recipient's cursor → "Görüldü · 2". With the web page hidden (`visibilityState: hidden`) a
new teacher message was NOT marked; on visible it was, and the label moved to the newest bubble
only. Deep-linked chat with no history → back replaced to the class detail.

## Responsive QA

Web 375 light and dark: Akış channel strip `rgb(11,11,15)` and tab bar `rgb(11,11,15)` / border
`rgb(30,40,57)` in Light; Çalış tab bar `rgb(255,255,255)` / `rgb(230,234,242)` in Light and
`rgb(8,11,20)` in Dark. Nested chain Öğrenme Atlasım → Öğrenme Haritam → Zorlanma Örüntülerim
each with "Geri"; browser back preserved. Chat at desktop and 683×512 (≈150 %): no horizontal
overflow; removed placeholder, seen label and composer intact. Simulator light and dark for the
feed, Çalış, İlerleme Hikâyem and the chat. Console: no errors.

## Accessibility

Every back control is a labelled button ("Geri"; "Kapat" on the profile modal), 44pt. The bubble
is one accessible node whose label carries sender, role, text, time and the seen label ("…,
Görüldü"); the removed placeholder replaces the text in the label. The remove action is reachable
as an accessibility action ("Mesajı kaldır"). Sheet controls are real buttons; no colour-only
state; no raw ids in any copy.

## Physical iPhone Checklist (user-performed)

Claude did not control the phone. Restart the LAN set (`firebase emulators:start` from the
scratchpad `lanproj` with `host: 0.0.0.0`; `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true npx expo start
--dev-client --lan`) and run P1–P14: P1 Akış Light — no white strip/bar; P2 Akış Dark; P3 System
follows Control Center toggle; P4 Çalış → İlerleme Hikâyem → back; P5 Çalış → Öğrenme Atlasım →
Öğrenme Haritam → Zorlanma Örüntülerim → back ×3; P6 Profil → Düzenle → Kapat; P7 swipe-back on a
pushed screen; P8 notification deep link → back lands on the tab; P9 teacher long-press on a
student message → "Mesajı kaldır" → confirm → placeholder on both phones; P10 teacher long-press on
own message → nothing; P11 student long-press → nothing; P12 student's message shows "Görüldü"
after the teacher opens the chat; P13 backgrounding the app with the chat open does not mark a new
message; P14 no white flash pushing screens in Dark.

## Learning Evidence Regression

No classifier, evidence writer, study session, assignment or performance code changed; `npm test`
189 suites / 3720 tests (baseline 185 / 3646 — the delta is the six new/extended suites).
`studentPerformance.ts` raw NUL and historical `routing.ts` untouched.

## Moderation Regression

Phase 93 comment delete (D1–D8), Phase 97 answer review, Phase 98 comment review and Phase 99
outcome notification suites all pass unchanged inside `test:rules`: 15 suites / 668 tests
(baseline 13 / 644). `applyTransition` caller lists unaffected; no moderation file changed.

## Automated Validation

`npm run typecheck` clean; `npm run lint` clean; `npm test` 189/3720; `npm run test:rules` 15/668;
`npm run verify` pass; `npx expo-doctor` 17/18 (the pre-existing "3 packages out of date" check;
no SDK upgrade); `git diff --check` clean; `functions` build clean; `functions` lint 4 pre-existing
`no-irregular-whitespace` errors in `textNormalization.ts` (baseline, untouched).

## Source Integrity

No `.env` read, printed or staged; no `ios/`, `android/`, `Pods/`, `DerivedData/`, coverage,
screenshots, emulator exports or QA scratch staged. `package.json` local drift (`expo run:*`
scripts) reported, not staged. Emulator host never hardcoded. Simulator keyboard preference tried
once for typing and reverted (`AppleKeyboards` deleted).

## Known Limitations

A removed message in another viewer's already-paginated OLDER history (beyond the 30-message live
window) keeps its text until that viewer reopens the chat; the live window and the remover's own
list update immediately. The teacher's remove gate is inferred from member role (correct by
construction today); the server is the authority either way. Removal clears the text rather than
archiving it — there is no moderation log in scope. "Görüldü · N" counts readers, it does not name
them. No message notification path exists, so P8 exercises the existing question/notification deep
links only.

## Product Assessment

Release-blocking navigation, moderation, receipt and theme gaps are closed with one shared back
affordance, one server-authoritative removal, one per-recipient read cursor and one immersive
chrome module — each pinned by structural tests so it cannot quietly regress. The learning thesis
is untouched: nothing here makes easy content more attractive; it makes the app trustworthy to
hold in the hand.
