# MVP Demo Checklist

Companion to [ROADMAP.md](ROADMAP.md) — this file exists only to make Phase
48's runtime acceptance pass repeatable. It does not itself claim demo
readiness; see "Phase 48 scenarios" below for the honest current status.

## Environment

- Firebase emulators (`firebase.json`: auth 9099, firestore 8080, storage
  9199, functions 5001, UI 4000). Requires a local JDK — Firestore/Auth run
  on the JVM. If `java -version` fails, install one (e.g.
  `brew install openjdk`) and put it on `PATH` for the shell session:
  `export PATH="/opt/homebrew/opt/openjdk/bin:$PATH"`.
- Expo (`npm run web` / `npm run ios` / `npm run android`), pointed at the
  emulators — see `src/services/firebase/config.ts` for the emulator-connect
  guard.

## Seed

```bash
npm run demo:seed
```

Wraps `firebase emulators:exec --only auth,firestore "node functions/scripts/seedDemoFixtures.mts"`.
Safe to rerun any time — every fixture id is fixed and every write is a
`.set()`, so rerunning reproduces the same logical state rather than piling
up duplicates. The script refuses to run at all unless
`FIRESTORE_EMULATOR_HOST` and `FIREBASE_AUTH_EMULATOR_HOST` are set to a
local host (127.0.0.1/localhost/0.0.0.0/::1) — it cannot touch production.

The script prints a manifest of everything it creates on success, including
the shared emulator-only test password.

## Personas

| Persona | uid | Purpose |
|---|---|---|
| Teacher | `demo-teacher-1` | Owns the demo class |
| Student A | `demo-student-a` | Repeated struggle — Q-heavy (8/10 struggled) vs Q-light (2/10 struggled), same topic/tier. Also carries the Phase 44B explicit-vs-normal-vs-second-explicit intervention ordering. |
| Student B | `demo-student-b` | Recovering — explicit intervention with a struggled baseline, then live study items showing a standing recovery. Drives intervention effectiveness = `improved`. |
| Student C | `demo-student-c` | Stable control persona; also the legacy-fallback attribution case (one marker-less assignment, no explicit intervention candidate). |
| Student D | `demo-student-d` | Legacy/insufficient — a study item with `attemptCount > 0` but no cumulative counters at all (genuinely absent, never zero). |
| Student E | `demo-student-e` | Explicit intervention, live items still show repeated struggle post-intervention. Drives effectiveness = `no_change`. |
| Student F | `demo-student-f` | Explicit intervention on a then-stable baseline, live items now show repeated struggle. Drives effectiveness = `worsened`. |

Class: `demo-class-1` — "Demo Sınıfı", join code `DEMO01`.
Questions: `demo-q-heavy`, `demo-q-light`, `demo-q-int-1/2/3` (all class-visibility, owned by the teacher).

No secrets: every account uses `*@example.test` and the single documented
emulator-only password. None of this is valid against production Auth.

## Runtime demo preparation

1. Start emulators: `npm run emulators` (or let `demo:seed` start its own
   scoped auth+firestore instance — for a full interactive demo you want
   the full `emulators:start`, including functions, running separately).
2. Seed fixtures: `npm run demo:seed`.
3. Start Expo against the emulators: `npm run web` (or `ios`/`android`),
   with the app's emulator-connect guard active.
4. Log in as `teacher-demo@example.test` / student personas via the app's
   normal login screen, or use the Auth emulator UI (port 4000) to switch
   quickly between accounts during a demo.

## Phase 48 scenarios

Executed against a live Expo web build on the full local emulator suite
(auth/firestore/functions/storage), using the seeded personas above.

- A. Authentication / account switching — **PASS** (after fixing the emulator-connect bug in `multiAccountAuth.ts` — see CHANGELOG/commit `d59f502`). Teacher → add Student A → add Student D → instant-switch back to Teacher, all with correct role routing and no stale cross-account data.
- B. Student next action — **PASS**. "Şimdi Ne Yapmalısın?" correctly prioritized an urgent assignment over the adaptive plan for Student A (Phase 39's documented priority contract).
- C. Adaptive session — **PASS**. 2-card session for Student A: first card visible, no blank spacer, "Cevapla" navigated to the correct question route, outcome buttons recorded against the exact card on screen (verified by reading the Firestore document back before/after).
- D. Assignment session — **PASS** (composer → publish path only; a student completing an assignment card-by-card was not separately driven beyond the adaptive-session mechanics in C, which the assignment session UI reuses). Publish-through-real-UI verified in I below.
- E. Teacher class performance — **PASS**. Roster, Class Health counts, Topic Hotspots, and per-student attention rows all rendered correctly and updated live after a real recorded outcome (Öğrenci A's struggle count went 8 → 9 on screen).
- F. Persistent struggle — **PASS**. Student A ("Aynı soruda 9 kez zorlandı"), Student D ("Yetersiz veri" / "Henüz veri yok" — never a fake 0%), and stable Students B/C all rendered distinctly and correctly.
- G. Intervention creation — **PASS**. "Takip Ödevi Oluştur" composer prefilled the correct class/subject(Matematik)/topic(Denklemler)/grade(10, no fabricated fallback)/strategy(Güçlendir), and preselected exactly the priority students (F, E, A) — confirmed B/C/D correctly excluded.
- H. Explicit attribution (Phase 44B) — **PASS**. Student A's effectiveness card resolved to one of the two explicit interventions (never the intervening ordinary assignment) — confirmed indirectly by verdict shape (reviewedSinceCount=0 only possible via the explicit picks, since the ordinary assignment's questions had real recent activity) and directly a second time when a newly-published explicit intervention immediately became the newest-selected one, live. The A/B/A′ three-stage intermediate check (per-commit ordering before the second explicit intervention exists) was not separately isolated — UNVERIFIED as its own sub-case, though the end state and the "newest explicit wins" mechanism were both directly observed.
- I. Reinforce cumulative selection (Phase 46) — **PASS**, with direct evidence: published a real assignment through the teacher UI (Güçlendir strategy, class-hotspot composer) and read the persisted `questionIds` back — `['demo-q-heavy', 'demo-q-int-1', 'demo-q-int-2', 'demo-q-int-3', 'demo-q-light']`, i.e. Q-heavy (8/10 struggled) ranked first and Q-light (2/10) last. The composer's own pre-publish screen has no per-question list to visually inspect (a product-UI gap, not a bug), so the ordering evidence comes from the real persisted write, not a screenshot.
- J. Intervention effectiveness (Phase 44A/47) — **PASS**, all four states observed directly: Student B → `✅ İşe yaradı` (improved), Student E → `➡️ Değişiklik yok` (no_change), Student F → `⚠️ Geriledi` (worsened), Student A → `Sonuç için erken` (insufficient_data). Wording checked against the forbidden-causal-language list — all observational.
- K. Post-intervention action (Phase 47) — **PASS**. Improved (B): CTA suppressed, "yeni bir takip ödevi önerilmiyor". No_change (E) and worsened (F): CTA present with correct kind-specific wording ("yeni bir takip ödevi oluşturabilirsiniz" vs "öncelikle incelemeniz önerilir"). Tapping the per-student CTA specifically (as opposed to the equivalent class-hotspot composer entry, which reuses the identical screen and *was* driven end-to-end in I) was blocked by this environment's scroll tooling — UNVERIFIED for that one interaction path only.
- L. Cross-account isolation — **PASS**. No teacher UI leaked into any student session; no student's data appeared under another student; real client-token REST reads confirmed Student A cannot read Student B's private `studyItems` (403) but can read their own (200), and cannot mutate `interventionOf` on an existing assignment (403).
- M. Error/loading/empty states — **PASS** for everything actually observed (no raw Firebase errors, no `[object Object]`, no fake 0%/NaN, no infinite spinners across ~15 screens visited). Not an exhaustive sweep of every screen in the app.
- N. Session rendering/auto-advance — **PASS** for the 2-card case actually exercised (first card visible, "Cevapla" routes correctly, outcome recording advances state, reload/re-entry stayed deterministic). 3/5/10-card cases, auto-advance specifically, and web-scroll-stuck behavior were not separately driven — **UNVERIFIED**, no fixture currently has a longer queue for Student A/B/C without disturbing the 2-question ranking fixture.

One real bug was found and fixed during this pass (not fixture-only): named per-account/staging Firebase Auth instances in `src/services/firebase/multiAccountAuth.ts` never connected to the Auth emulator, breaking "Hesap Ekle" and switch-to-a-not-yet-stored-account under `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true`. Fixed in commit `d59f502`. One fixture bug was also found and fixed in the same commit: the seed script's Admin SDK app used a synthetic project id instead of the real one, which was the actual reason the above bug was reproducible at all (Auth emulator partitions by project id with no coalescing, unlike Firestore's `singleProjectMode`).

**Tested platform:** web (Chrome via the Claude Code browser tool), against `firebase emulators:start` (auth/firestore/functions/storage) with `EXPO_PUBLIC_USE_FIREBASE_EMULATORS=true` set locally for the session only (`.env` restored to its original `false` afterward). iOS/Android were not driven this pass.
**Tested date:** 2026-08-24.
**Emulator setup:** local JDK via `brew install openjdk` (this machine had none installed); `npm run emulators` run standalone (not through `demo:seed`'s own scoped wrapper) so the same instance served both the seed script and the live app.
**Final commit:** `d59f502` (`chore: harden mvp demo flows` — the code state this checklist's results describe).

## Reset/reseed

Rerun `npm run demo:seed` — it overwrites the same fixed ids in place. To
wipe all emulator state instead (not just the fixture), stop and restart
`firebase emulators:start` (in-memory by default; nothing persists across
a restart unless `--export-on-exit`/`--import` is used).

## Known non-blocking limitations

- `imageUrl` on every seeded question points at a placeholder
  (`storage.googleapis.com/netflowedu-demo-fixtures/placeholder-question.png`)
  rather than a real uploaded image — no Storage emulator upload is part of
  fixture setup. Expect a broken/placeholder image in the question view;
  this does not affect any of the ranking/attribution/effectiveness logic
  under test.
- The reinforce cumulative-selection fixture (Student A's Q-heavy/Q-light)
  targets a single student. Multi-student coverage-signal behavior was left
  unseeded as out of minimum scope for this fixture task.
