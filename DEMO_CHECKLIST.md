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

Fixture data for every scenario below now exists. None of the scenarios
have been executed against the running app yet — that is Phase 48's own
job, not this fixture task's.

- A. Authentication / account switching — NOT YET EXECUTED
- B. Student next action — NOT YET EXECUTED
- C. Adaptive session — NOT YET EXECUTED
- D. Assignment session — NOT YET EXECUTED
- E. Teacher class performance — NOT YET EXECUTED
- F. Persistent struggle — NOT YET EXECUTED
- G. Intervention creation — NOT YET EXECUTED
- H. Explicit attribution (Phase 44B) — NOT YET EXECUTED
- I. Reinforce cumulative selection (Phase 46) — NOT YET EXECUTED
- J. Intervention effectiveness (Phase 44A/47) — NOT YET EXECUTED
- K. Post-intervention action (Phase 47) — NOT YET EXECUTED
- L. Cross-account isolation — NOT YET EXECUTED
- M. Error/loading/empty states — NOT YET EXECUTED
- N. Session rendering/auto-advance — NOT YET EXECUTED

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
