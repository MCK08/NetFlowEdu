# Phase 49 — Light / Dark Theme

## Goal

Add a production-quality appearance system across the whole app — light, dark
and system — without redesigning NetFlowEdu. Light mode is pixel-identical to
what shipped before this phase; dark is the same product in a dark palette.

## Theme Modes

| Mode | Behaviour |
|---|---|
| **Sistem** | Follows the OS/browser appearance live. Default. |
| **Açık** | Explicit light, overrides the OS in both directions. |
| **Koyu** | Explicit dark, overrides the OS in both directions. |

## Architecture

Phase 12A had already named the semantic tokens and defined **both** palettes
in `colors.ts` — `darkColors` had simply never been reachable, because every
screen bakes its palette in at import time:

```ts
const styles = StyleSheet.create({ card: { backgroundColor: colors.surface } });
```

`StyleSheet.create` runs once, at module load, so the values are copied
permanently. Phase 49 made both reads **lazy** instead of rewriting ~130
screens by hand:

| File | Role |
|---|---|
| `src/theme/palettes.ts` | The two concrete palettes (split out to avoid a cycle). |
| `src/theme/themePreference.ts` | Pure rules: parse a stored value, resolve preference + OS → theme. No React, no storage. |
| `src/theme/themeRuntime.ts` | `colors` proxy (live palette view) and `themedStyles()` (per-theme lazy `StyleSheet.create`, cached). |
| `src/theme/themeStorage.ts` | AsyncStorage read/write, never throws. |
| `src/theme/ThemeProvider.tsx` | Owns the preference, resolves the theme, publishes it, exposes `useTheme()` / `useThemeSubscription()`. |
| `src/theme/AppearanceSelector.tsx` | The Görünüm control. |

`colors.x` call sites (~627) and their types are unchanged — only *when* the
value is read moved from import time to render time.

### Why screens subscribe explicitly

Making the values lazy is only half the problem: something has to make a
screen **re-render** so it re-reads them. Two React behaviours block that:

1. A provider's `children` prop keeps the same element identity when only the
   provider's state changes, so React bails out of the subtree.
2. React Navigation isolates each screen, and 41 components use `React.memo`,
   which skips prop-driven re-renders.

`React.memo` does **not** block context updates, so the fix is a no-op
subscription (`useThemeSubscription()`) in exactly two places:

- every route in `app/` — the root of each screen's tree
- the 41 memoised components that read `colors`

This was verified by observation, not assumption: before adding the memo
subscriptions, switching theme re-themed the selector card but left the rest
of the screen light.

## Persistence

`AsyncStorage`, key `netflowedu.theme.preference.v1`.

**Zero backend writes.** Appearance is a device property, not an account one:
storing it in Firestore would cost a network write per toggle, would not work
logged out, and would fight itself on a shared device. No schema or rules
change was needed in this phase.

A corrupted/unknown stored value falls back to `system` rather than throwing —
this read runs before first paint.

## Semantic Tokens

The Phase 12A token names are unchanged. Dark values were tuned against the
light set (same roles, same elevation hierarchy, same brand hue lifted for
legibility), and four were corrected from their Phase 12A placeholders:

| Token | Phase 12A | Phase 49 | Why |
|---|---|---|---|
| `textTertiary` | `#8A8F98` | `#98A0AB` | 5.9:1 → 7.4:1 (used for placeholders) |
| `primary` | `#5B7CFA` | `#7C97FF` | 4.6:1 → 7.0:1 (used for links/actions) |
| `border` | `#2C2E36` | `#3A3D47` | borders were nearly invisible |
| `danger` / `success` / `accent` | — | lightened | readable on `#0B0B0F` |

## Profile UX

`Görünüm` sits above the account card in `ProfileScreen`, which is **shared by
both roles**, so teacher and student get the same control from one
implementation. It checks the stored *preference* (not the resolved theme), so
"Sistem" reads as selected on a light device instead of highlighting "Açık".
44pt touch targets, `radiogroup`/`radio` accessibility roles.

## Web Verification

Chrome, Expo Web, against the Firebase emulators.

- Light / Dark / Sistem — PASS
- Live switch with no reload and **no navigation reset** — PASS
- Reload persistence — PASS
- Teacher → Student account switch keeps the theme — PASS
- Bottom sheet (Account Switcher), forms, tab bar, headers — PASS

## iOS Verification

iPhone 17 Pro simulator, iOS 26.5, dev client against the emulators.

- Light / Dark / Sistem — PASS
- Live in-app switch including tab bar + status bar — PASS
- **Force-close → reopen keeps the theme and the account** — PASS
- OS Light→Dark with "Sistem" updates live, no restart — PASS
- OS changed while "Koyu" is explicit → app stays dark — PASS

Native and web keep **separate** preferences, because AsyncStorage is
per-device. That is correct behaviour, not a bug.

## Accessibility Notes

Dark text/background pairs, measured against `#0B0B0F`:

| Pair | Ratio | WCAG |
|---|---|---|
| `textPrimary` | ~18.3:1 | AAA |
| `textSecondary` | ~10.2:1 | AAA |
| `textTertiary` | ~7.4:1 | AA |
| `primary` | ~7.0:1 | AA |
| `success` | ~13.4:1 | AAA |
| `danger` | ~9.4:1 | AAA |

Semantic state colours keep their meaning in dark: `✅ İşe yaradı`,
`➡️ Değişiklik yok` and `⚠️ Geriledi` remain distinguishable, as do the
attention chips on Class Performance.

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | 134 suites / 2244 tests (+33 new) |
| rules | 5 suites / 350 tests |
| verify | PASS |
| expo-doctor | 17/18 (pre-existing Expo patch drift, untouched) |
| `git diff --check` | PASS |

## Known Limitations

- **The class feed stays dark in both themes.** `ClassFeedScreen` is the
  immersive full-bleed media surface (`#0B0B0F`); making it follow the palette
  would turn it white in light mode, which is a redesign, not theming.
- One decorative separator dot in `QuestionDetailCard` still uses a literal
  (`#C4C7CC`). Readable on both surfaces; left as legacy rather than
  churn a business-logic file for a dot.
- Web and native preferences are independent (per-device storage).
- Question/answer images are user content and are never recoloured; a photo
  shot on white paper still looks like a photo shot on white paper.

## Final Result

Light, dark and system all work across authentication, both role trees,
navigation, tab bars, status bar, modals and bottom sheets — switching live,
persisting across reload, force-close and account switching, with no backend
involvement and no change to any learning, assignment or security logic.
