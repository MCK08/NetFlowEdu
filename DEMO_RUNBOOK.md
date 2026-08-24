# NetFlowEdu MVP Demo Runbook

## Status

**MVP DEMO READY: YES** (Phase 48 final decision, `DEMO_CHECKLIST.md`)

**Baseline:** `54110b2` (docs) on top of `d59f502` (the one runtime fix Phase 48 made)
**Tested platform:** Web
**Backend:** Firebase local emulators (Auth, Firestore, Functions, Storage) — never production

> **A note on the exact seed command.** `package.json` does **not** define an
> `npm run demo` script — only `npm run demo:seed`. That script wraps
> `firebase emulators:exec --only auth,firestore "..."`, which starts its
> **own** throwaway Auth+Firestore pair, seeds it, and **shuts it down the
> instant the script exits** — there is nothing left running for Expo to
> connect to afterward. For a live demo you need one persistent emulator
> suite that both the seed script and the running app talk to. The
> "Fresh Start" section below documents the exact two-step sequence that was
> actually run and verified in this session — starting the full suite
> standalone, then seeding it directly (bypassing `demo:seed`'s own
> throwaway wrapper). Nothing here is invented; every command below was
> executed for real during Phase 48 and again during this runbook's own
> rehearsal (see "Rehearsal Result" at the bottom).

## Prerequisites

- Node.js (verified on v26.7.0 — no `engines` pin in `package.json`)
- **Java (JDK 11+)** — the Firestore/Auth emulators run on the JVM.
  `README.md`/`FIREBASE_SETUP.md` suggest `brew install temurin` on macOS;
  this session verified `brew install openjdk` works equally well. Confirm
  with `java -version`. If missing, `npm run emulators` fails with
  `Could not spawn 'java -version'`.
- Firebase CLI — already a local devDependency (`firebase-tools`), resolved
  automatically through `npm run emulators` / `node_modules/.bin/firebase`.
  No global install needed.
- A browser (verified: Chrome, via the Claude Code browser tool, at
  `localhost:8081`)
- Branch `phase17-moderation-infrastructure-20260806-195814`, commit
  `54110b2` or later
- `npm install` already run (existing `node_modules/`)

## Fresh Start

Exact commands, in order, across two terminals.

**Terminal 1 — start the emulator suite and leave it running:**

```bash
npm run emulators
```

Wait for:

```
✔  All emulators ready! It is now safe to connect your app.
```

**Terminal 2 — seed that running instance directly** (bypasses
`demo:seed`'s own throwaway `emulators:exec` wrapper on purpose — see the
note above):

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node functions/scripts/seedDemoFixtures.mts
```

Expected success indicator — the script's own manifest, ending with:

```
[seedDemoFixtures] verification passed — all fixture reads matched expectations.

DEMO FIXTURES READY
...
```

Exit code 0. If Terminal 1 isn't already running, this command fails fast
with `ECONNREFUSED` — start Terminal 1 first.

**Terminal 2 (or a third) — start Expo Web pointed at the emulators:**

```bash
EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true npm run web
```

## Emulator Mode

**`EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true` is a LOCAL, TEMPORARY
configuration only.** Do not commit it. Two ways to set it for the demo,
either is fine:

- Prefix the start command as shown above (`EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true npm run web`) — cleanest, nothing touches `.env`.
- Or temporarily edit the `EXPO_PUBLIC_USE_FIREBASE_EMULATORS` line in your
  local `.env` to `true`, then **restore it to `false`** (the repository
  baseline) after the demo. `.env` is already git-ignored, but never stage
  or commit it regardless.

**DO NOT USE PRODUCTION FIREBASE FOR DEMO FIXTURES.** The seed script
itself refuses to run unless `FIRESTORE_EMULATOR_HOST`/
`FIREBASE_AUTH_EMULATOR_HOST` point at a local host — there is no override.

## Seed

```bash
FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9099 node functions/scripts/seedDemoFixtures.mts
```

(`npm run demo:seed` is the same script but in its own throwaway emulator
pair — use it only if you specifically want to validate the fixture in
isolation, not for a live demo. See the note at the top.)

**Result:** exit 0, `[seedDemoFixtures] verification passed`, manifest
printed with Teacher + Student A–F + Demo Sınıfı listed. Safe to rerun any
time — every id is fixed, every write is a `.set()`, reruns reproduce the
same state rather than duplicating. Verified idempotent (rerun twice
back-to-back, identical seeded counts both times) during Phase 48.

## Demo Accounts

**LOCAL FIREBASE EMULATOR ONLY — NOT A REAL ACCOUNT — NOT FOR PRODUCTION.**
These credentials are valid only against the local Auth emulator seeded
above; they authenticate against nothing else.

| Role | Email | Password |
|---|---|---|
| All seeded accounts | `teacher-demo@example.test`, `student-a@example.test` … `student-f@example.test` | `Demo123!` |

No API keys, tokens, or service credentials appear anywhere in this
document.

## Persona Map

Read directly from `functions/scripts/seedDemoFixtures.mts` — no guessed
IDs.

| Persona | uid | Purpose | Demo use |
|---|---|---|---|
| Teacher | `demo-teacher-1` | Owns the demo class | Primary demo operator |
| Student A | `demo-student-a` | Repeated struggle: Q-heavy (`demo-q-heavy`, 8–9/10 struggled) vs Q-light (`demo-q-light`, 2–3/10 struggled), same topic/tier | **Main protagonist** — Phase 45/46 personalization story |
| Student B | `demo-student-b` | Explicit intervention with a struggled baseline, now recovered (standing solve) | Effectiveness = `improved` (supporting example) |
| Student C | `demo-student-c` | Stable persona; one marker-less assignment, no explicit intervention | Legacy-fallback attribution control (not in the core story) |
| Student D | `demo-student-d` | One study item with real attempts but no cumulative counters at all (genuinely absent, never zero) | Legacy/insufficient-data example (not in the core story) |
| Student E | `demo-student-e` | Explicit intervention; live items still show repeated struggle | Effectiveness = `no_change` (supporting example) |
| Student F | `demo-student-f` | Explicit intervention on a then-stable baseline, now struggling | Effectiveness = `worsened` (supporting example) |

Class: `demo-class-1` — **"Demo Sınıfı"**, join code `DEMO01`.

## Golden Demo (~7 minutes, do not demo the whole app)

Student A is the protagonist. B/E/F appear only as a short comparison near
the end. All screen names and button labels below are the actual Turkish
UI text, confirmed on screen during Phase 48 and this runbook's rehearsal.

### PART A — Teacher diagnosis & targeted intervention

| # | SCREEN | ACTION | EXPECTED RESULT |
|---|---|---|---|
| 1 | Login | Sign in as `teacher-demo@example.test` | Teacher dashboard, "Demo Sınıfı" card |
| 2 | Sınıflarım | Tap **Demo Sınıfı** | Class detail: roster, "Sınıf Performansı" button |
| 3 | Demo Sınıfı | Tap **Sınıf Performansı** | Class Performance: "Şimdi Yapılabilecekler" lists Öğrenci F/E/A as needing attention |
| 4 | Sınıf Performansı | Tap **Öğrenci A** row ("Öğrenciyi Aç") | Student Performance for Öğrenci A: "Aynı soruda N kez zorlandı", "Tekrarlayan Zorlanma" card, "Denklemler (Matematik)" weak topic |
| 5 | Öğrenci A | Tap back to Sınıf Performansı, scroll to **Konu Sıcak Noktaları → Denklemler** row, tap it to expand | Shows "Soru Oluştur" / "Ödev Oluştur" actions for the topic |
| 6 | Konu Sıcak Noktaları (expanded) | Tap **"Denklemler konusunda ödev oluştur"** | **Ödev Oluştur** composer opens, prefilled: Ders **Matematik**, Konu **Denklemler**, Sınıf Seviyesi **10**, Seçim Stratejisi **Güçlendir**, Öğrenciler = **Öğrenci seç** with **A, E, F** pre-highlighted (the system correctly flagged all three as needing help) |
| 7 | Ödev Oluştur | **Tap "Öğrenci E" and "Öğrenci F" to deselect them**, leaving only **Öğrenci A** highlighted — say something like "bugün sadece Öğrenci A'ya odaklanalım" | Only Öğrenci A remains highlighted (verified: tapping an already-selected chip toggles it off) |
| 8 | Ödev Oluştur | Type a Başlık (e.g. "Denklemler Takip Ödevi"), tap **Soruları Hazırla** | "5 soru hazırlandı" summary appears |
| 9 | Ödev Oluştur | Tap **Yayınla** | Navigates to Assignment Detail: **"1 öğrenci"**, 0/5 tamamlandı |

> **Why step 7 matters (verified during this runbook's own rehearsal, not
> theoretical):** publishing with the default A+E+F preselection creates a
> new explicit intervention for all three. Per Phase 44B's own correct
> "newest explicit intervention wins" rule, that new assignment becomes each
> of their most-recent intervention — which overwrites Student E's and F's
> carefully pre-built `no_change`/`worsened` effectiveness fixtures with a
> fresh `insufficient_data` reading, and **reseeding does not fix this**
> (reseed only restores the fixture's own fixed-id documents; the new
> assignment has a random Firestore id the reseed script has no way to
> know about or remove — only stopping and restarting the emulator suite
> clears it). Narrowing the selection to Student A alone avoids the problem
> entirely: verified live, publishing with only Öğrenci A targeted leaves
> Öğrenci B/E/F's effectiveness cards completely untouched, and Student A's
> own card still reads the same designed `insufficient_data` story either
> way. **No reseed is required anywhere in the Golden Demo when Part A is
> run this way** — see "Reseed Strategy" below.

> **Talking point, not a visual proof:** the composer's own pre-publish
> screen shows a question *count*, not a per-question list — you cannot
> point at the screen and show the audience "this is Q-heavy, this is
> Q-light." The convincing visual evidence for reinforce prioritization is
> the **teacher-side struggle count** (step 4's "N kez zorlandı") and the
> **student-side card order** in Part B below, not this screen.

### PART B — Student personalization

| # | SCREEN | ACTION | EXPECTED RESULT |
|---|---|---|---|
| 9 | Profil (as teacher) | Tap **Hesap Değiştir → Başka Hesap Ekle**, sign in `student-a@example.test` / `Demo123!` (first time only — instant "Bu hesaba geç" afterward) | Student tab bar (Akış / Çalış / Sınıflarım / Profil) |
| 10 | Akış (auto-landed) | Tap **Çalış** tab | Öğrenme Merkezi: "Şimdi Ne Yapmalısın?" shows the just-published assignment as the top action (assignment urgency wins over the adaptive plan — Phase 39) |
| 11 | Öğrenme Merkezi | Scroll to **Bugünkü Plan → Güçlendir**, tap **Çalışmaya Başla** | Study session opens, "N soru" header |
| 12 | Çalışma | Tap **Zorlandım** (or **Çözdüm**) on the first card | Card advances / outcome recorded; "Sonraki tekrar" countdown updates |
| 13 | Öğrenme Merkezi (back) | — | "Zorlandığın Konular" count and daily-goal progress updated live |

### PART C — Effectiveness (no reseed needed — see below)

> No reseed step here. Because Part A published targeting only Student A
> (step 7 above), Students B/E/F were never touched — their effectiveness
> fixtures are still exactly as seeded. Verified live during this
> runbook's rehearsal: opening B/E/F immediately after publishing Part A's
> assignment shows their designed `improved`/`no_change`/`worsened`
> verdicts unchanged.

| # | SCREEN | ACTION | EXPECTED RESULT |
|---|---|---|---|
| 14 | Profil (as student A) | **Hesap Değiştir → Bu hesaba geç** (Demo Öğretmen) | Instant switch, teacher dashboard |
| 15 | Sınıf Performansı → **Öğrenci A** | Öğrenciyi Aç | **Müdahale Sonucu: "Sonuç için erken"** — insufficient_data, "yeterli kanıt yok"; **Sonraki Adım: "Yeterli kanıt yok — şimdilik yeni bir aksiyon önerilmiyor"** |
| 16 | Sınıf Performansı → **Öğrenci B** | Öğrenciyi Aç | **✅ İşe yaradı** — improved; next step: no new follow-up suggested |
| 17 | Sınıf Performansı → **Öğrenci E** | Öğrenciyi Aç | **➡️ Değişiklik yok** — no_change; next step: "yeni bir takip ödevi oluşturabilirsiniz" (follow-up CTA available) |
| 18 | Sınıf Performansı → **Öğrenci F** | Öğrenciyi Aç | **⚠️ Geriledi** — worsened; next step: "öncelikle incelemeniz önerilir" (stronger follow-up CTA available) |

## Reseed Strategy

**Exact point: nowhere in the core Golden Demo, if Part A step 7 (deselect
Öğrenci E and F) is followed.** This was the single biggest thing this
rehearsal changed from the original plan — see the callout under Part A
step 7 for the full reasoning and verified evidence.

Reseed is still the right tool, just not a scheduled demo step — reach for
it only as **recovery**:

- If a run of the demo accidentally publishes an assignment targeting
  B, E, D, or C, their fixtures get disturbed and only reseed (or a
  restart) fixes it.
- If Student A's live-recorded outcome (Part B) needs to be reset back to
  the original 8-vs-2 split before repeating Part B for a second audience.
- Before the very first demo of the day, as a clean-slate step.

**One real, reproducible behavior to know before you rely on reseed as
recovery mid-demo:** reseeding while a browser tab has an active signed-in
session can invalidate that account's session specifically — observed
consistently for the **teacher** account across two independent tests in
this rehearsal (Student accounts stayed signed in both times). The app
handles this cleanly: the login screen shows "Bu hesabın oturumu sona
ermiş. Devam etmek için şifrenle tekrar giriş yap." with a working
re-login prompt — not a crash, not a silent failure. If you reseed
mid-demo, be ready to retype the teacher's credentials (table above) once.

## Recovery

| Situation | Action |
|---|---|
| Wrong account active | Profil → **Hesap Değiştir**, pick the right stored account (or **Başka Hesap Ekle** if not yet added) |
| Assignment/fixture state already mutated (e.g. published targeting the wrong students) | Reseed (see command above). If the mutation was a *new* document (like a stray assignment) rather than a change to a fixture's own fixed-id document, reseed alone won't remove it — restart the emulator suite first, then reseed |
| Demo state no longer matches baseline | Reseed, or restart + reseed if a stray document (see above) is suspected |
| Browser refreshed | Reload the page; the app resumes the signed-in session automatically; use the account switcher if it lands on the wrong account |
| Emulator restarted | Restart with `npm run emulators`, then reseed (emulator data is in-memory only — nothing persists across a restart) |
| Expo lost connection | Re-run `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true npm run web` |
| Teacher shows "Bu hesabın oturumu sona ermiş" after a reseed | Expected (see Reseed Strategy above) — tap "Tekrar giriş yap" and type the teacher credentials again; takes a few seconds |

**Never** use `git reset --hard`, delete Firestore documents by hand,
write a temporary Admin script, or touch production Firebase to recover.
The only supported recovery is reseeding the deterministic fixtures.

## Shutdown

1. Stop the Expo dev server (Ctrl+C in its terminal).
2. Stop the emulator suite (Ctrl+C in Terminal 1) — all data is in-memory
   and discarded automatically.
3. Restore the local environment: if you edited `.env`, set
   `EXPO_PUBLIC_USE_FIREBASE_EMULATORS` back to `false` (the repository
   baseline). If you used the env-var-prefix method instead, there is
   nothing to restore — `.env` was never touched.
4. Confirm `.env` was never staged: `git status --short .env` should be
   empty.

## Presenter Talk Track

**SCENE 1 — Teacher Intelligence**
WHAT THEY SEE: Class Performance — "Şimdi Yapılabilecekler", Öğrenci A
flagged with a specific struggle count.
WHAT I SAY: "Öğretmen yalnızca sınıf ortalamasını görmüyor. Sistem
öğrencinin aynı konuda tekrar tekrar zorlandığını ayırt edip hangi
öğrencinin dikkat gerektirdiğini görünür hale getiriyor."
WHY IT MATTERS: Moves the teacher from "everyone's grade" to "this
specific student, this specific pattern."

**SCENE 2 — Targeted Intervention**
WHAT THEY SEE: The composer opens pre-filled with the right class,
subject, topic, grade, and students.
WHAT I SAY: "Öğretmen problemi gördüğü yerden çıkmadan, doğrudan o
öğrenci ve konuya yönelik takip çalışması oluşturabiliyor."
WHY IT MATTERS: Zero manual re-entry between diagnosis and action.

**SCENE 3 — Reinforce Selection**
WHAT THEY SEE: The published assignment; the struggle-count evidence
already shown in Scene 1.
WHAT I SAY: "Burada yalnızca öğrencinin son cevabına bakılmıyor. Geçmişte
hangi sorularda ne kadar zorlandığı da seçim önceliğine dahil ediliyor."
WHY IT MATTERS: Selection uses accumulated history, not a single snapshot.

**SCENE 4 — Student Next Action**
WHAT THEY SEE: "Şimdi Ne Yapmalısın?" surfacing the new assignment first.
WHAT I SAY: "Öğrenci uygulamayı açtığında sistem ona yalnızca bir içerik
listesi göstermiyor; mevcut ödevlerini, tekrar ihtiyaçlarını ve öğrenme
durumunu kullanarak sıradaki çalışmayı yönlendiriyor."
WHY IT MATTERS: One prioritized action, not a pile of options.

**SCENE 5 — Adaptive Personalization**
WHAT THEY SEE: The "Güçlendir" study session opening.
WHAT I SAY: "Aynı konuda iki soru bugün benzer durumda olsa bile,
öğrencinin birinde sekiz kez diğerinde iki kez zorlanmış olması çalışma
sırasını değiştirebiliyor."
WHY IT MATTERS: Explain this verbally — the two cards look visually
identical on screen (placeholder art), so the claim rests on the
struggle-count evidence already shown, not on visibly distinguishing the
cards.

**SCENE 6 — Closed Loop**
WHAT THEY SEE: Recording "Zorlandım"/"Çözdüm"; the Study Hub's struggle
count updating.
WHAT I SAY: "Döngü ödev verildiğinde bitmiyor. Öğrencinin yeni sonuçları
tekrar sisteme giriyor ve hem öğrencinin sonraki çalışmasını hem de
öğretmenin gördüğü tabloyu güncelliyor."
WHY IT MATTERS: The number visibly moves live — the strongest single
"look, it's real" moment in the demo.

**SCENE 7 — Effectiveness**
WHAT THEY SEE: Öğrenci B/E/F's effectiveness cards.
WHAT I SAY: "Öğretmen müdahale sonrasında öğrencinin durumunun iyileşip
iyileşmediğini gözlemsel olarak görebiliyor."
WHY IT MATTERS: Sets up the causal-language discipline for Scene 8.

**SCENE 8 — Next Teacher Action**
WHAT THEY SEE: Three different "Sonraki Adım" outcomes.
WHAT I SAY: "Sonuç iyiyse gereksiz tekrar müdahalesi önleniyor;
değişiklik yoksa takip aksiyonu sunuluyor; gerileme varsa öğretmen daha
güçlü biçimde incelemeye yönlendiriliyor."
WHY IT MATTERS: Closes the loop from data to a concrete next decision.

**Never say:** "Bu ödev öğrenciyi geliştirdi." **Always say:** "Müdahale
sonrası öğrencinin durumu iyileşti."

## Safe Demo Claims

- NetFlowEdu accumulates student study outcomes over time.
- It can identify repeated struggle on a specific question.
- It can prioritize adaptive study using cumulative evidence, not just the
  most recent attempt.
- Teachers can see persistent struggle, differentiated from a one-off slip.
- Teachers can create targeted follow-up assignments directly from a
  diagnosis.
- Reinforce question selection can use cumulative struggle evidence across
  targeted students.
- Assignment outcomes feed back into the student's learning state.
- Teachers can see observational post-intervention effectiveness.
- The system can guide a teacher's next action based on that evidence.
- The MVP demo loop has been runtime-tested on Web against Firebase
  emulators (Phase 48).

## Claims To Avoid

- Clinically or scientifically proven learning gains.
- Causal proof that a specific intervention improved a specific student.
- Predictive AI accuracy, or any AI-model-based diagnosis (nothing in this
  product currently uses an AI model to decide this).
- Production-scale readiness, or readiness for thousands of students.
- iOS or Android runtime acceptance (this pass was Web only).
- School-wide deployment readiness.
- Statistical validation of effectiveness.
- Autonomous teacher replacement.
- "AI knows the student." Say instead: "The system uses the student's
  accumulated learning signals."

## Timed Presenter Script (~7 minutes core, +45s optional)

| Time | Content |
|---|---|
| 0:00–0:45 | Open teacher dashboard / Demo Sınıfı |
| 0:45–1:30 | Student A persistent struggle (Scene 1) |
| 1:30–2:30 | Targeted intervention composer (Scene 2) |
| 2:30–3:15 | Reinforce prioritization talking point (Scene 3) |
| 3:15–4:15 | Switch to Student A / next action (Scene 4) |
| 4:15–5:00 | Adaptive session opens (Scene 5) |
| 5:00–5:45 | Record one learning outcome (Scene 6, part 1) |
| 5:45–6:45 | Return to teacher / updated evidence (Scene 6, part 2) |
| 6:45–7:45 | Switch back to teacher, effectiveness + next action (Scene 7–8) — no reseed needed |
| 7:45–8:30 *(optional)* | Quick B/E/F comparison: improved / no_change / worsened |

Do not exceed 10 minutes unless the presenter deliberately extends.

## Operator Quick Reference

| Current Role | Screen | Button to Press | Expected Next Screen |
|---|---|---|---|
| Teacher | Sınıflarım | Demo Sınıfı | Class detail |
| Teacher | Class detail | Sınıf Performansı | Class Performance |
| Teacher | Class Performance | Öğrenci A row → Öğrenciyi Aç | Student Performance (A) |
| Teacher | Class Performance | Denklemler hotspot → Ödev Oluştur | Create Assignment (prefilled A+E+F) |
| Teacher | Create Assignment | **Tap Öğrenci E, Öğrenci F to deselect** (leaves only A) | Only Öğrenci A highlighted |
| Teacher | Create Assignment | Soruları Hazırla → Yayınla | Assignment Detail ("1 öğrenci") |
| Teacher | Profil | Hesap Değiştir → Başka Hesap Ekle / Bu hesaba geç | Account switch |
| Student A | Çalış tab | Bugünkü Plan → Çalışmaya Başla | Adaptive session |
| Student A | Çalışma session | Zorlandım / Çözdüm | Outcome recorded, next card |
| Student A | Profil | Hesap Değiştir → Bu hesaba geç (Demo Öğretmen) | Back to teacher dashboard |
| Teacher | Class Performance | Öğrenci A/B/E/F row → Öğrenciyi Aç | Student Performance (effectiveness card) |

## Recommended Immutable Demo Baseline

```
DEMO BASELINE COMMIT: 54110b2
Suggested future tag: mvp-demo-ready-2026-08
TAG CREATED: NO
```

The user will decide separately whether to create a tag.

---

## Rehearsal Result

**Duration:** see final report.
**Result:** see final report.
Recorded there, not duplicated here, to avoid this file drifting out of
sync with the actual rehearsal log on a future demo-only edit.
