# Phase 52 — Brand Identity

## Canonical Logo

`assets/branding/netflowedu-logo-source.jpeg` — 1254×1254, committed unmodified
and never overwritten. Every launch asset in this phase is derived from it by
script, so each one is traceable back to this single file.

The mark is a stylized **N** whose two stems are deep royal blue and whose
diagonal is a lighter, cyan-leaning ribbon with a folded-paper dimensionality,
with a graduation cap seated on the right stem and a tassel hanging beside it.
The source presents it inside its own soft rounded white card.

## Brand Principles

Blue carries **actions and state**, not decoration. The logo's energy lives in
one diagonal, not across the whole mark, and the product follows the same
restraint: the primary CTA, the active channel and selected states are blue;
cards, text and chrome stay calm enough to read for an hour.

Semantic state colours were explicitly **not** re-tinted. They mean something.

## Extracted Palette

Sampled from the real pixels (clustered, then averaged per region), not matched
by eye:

| Region | Sampled | Contrast |
|---|---|---|
| N left stem | `#0052E4` | 6.31:1 on white |
| N right stem | `#003EB9` | 8.79:1 on white |
| Diagonal ribbon | `#2DA6FC` | **2.63:1 on white**, 7.38:1 on dark |
| Diagonal, lightest fold | `#75D3F9` | 11.51:1 on dark |
| Cap plate | `#015FE5` | 5.57:1 on white |
| Card ground | `#F9FAFC` / `#EDF1F9` | — |

The cyan measurement is the phase's central finding. At 2.63:1 on white it
cannot legally carry text or a control in the light theme, but at 7.38:1 on a
dark ground it is excellent. So **light is built from the stem and dark from
the diagonal** — both straight out of the artwork, each used where it actually
works. `brandCyan` / `brandNavy` exist as tokens for brand surfaces only and
are deliberately outside the action vocabulary.

## Light Theme

`primary #0052E4` · `primaryMuted #E6EEFE` · `background #FFFFFF` ·
`surface #F6F8FC` · `surfaceMuted #EDF1F9` · `border #CBD5E8` ·
`textPrimary #0F1729` · `textSecondary #4A5568` · `textTertiary #666E7D`

Neutrals are cool-tinted from the logo card's own off-white family rather than
the previous pure greys, and body copy is navy-tinted so it belongs to the same
family as the mark.

**An accessibility fix, not just a recolour:** the old `textTertiary #8A8F98`
measured 3.25:1 on white and 3.03:1 on its own surface — a real AA failure in
the placeholder/metadata role it fills. It is now 5.13:1 / 4.83:1.

## Dark Theme

`primary #2DA6FC` · `primaryMuted #12243D` · `background #080B14` ·
`surface #111827` · `surfaceMuted #1A2233` · `border #31405A` ·
`textPrimary #F2F5F9` · `textSecondary #AFBACD` · `textTertiary #94A1B8`

Deep cool navy rather than neutral near-black, so the mark's blues sit in a
related ground. Everything measures AA or better; body text is 17.98:1 and the
dark label on a cyan button is 7.65:1.

## App Icon

The source contains its **own** rounded white card, and iOS applies its own
mask on top — shipping it unchanged would stack two roundings and shrink the
mark. Measured, the mark occupied only 61.8% × 59.6% of the source canvas.

The icon is therefore rebuilt full-bleed: the card is keyed out, the mark is
re-centred on its true ink bounds and scaled to 78% of a 1024 square. The
identity is untouched — only canvas, safe area and scale changed, exactly what
§9 permits.

1024×1024, **no alpha**. Verified at 180/120/60/40/29px: the N, the cap and the
cyan all survive; at 29px it still reads as the mark.

Android's adaptive foreground is transparent at 60% (inside the launcher's safe
zone) over a white `backgroundColor`, rather than baking white into the image.

## Splash

`expo-splash-screen` was already a dependency, so its config plugin is used
with real light/dark variants — no new package. The splash image is the same
transparent mark the app renders at runtime, so the launch image and the first
React surface are literally one asset and cannot drift.

Backgrounds are `#FFFFFF` and `#080B14`, which are exactly `background` in each
theme. That is what makes the handoff seamless: the first React surface paints
the same colour the splash was already showing.

`expo-linear-gradient` is **not** installed, and per §8 a sampled solid brand
blue was preferred over adding a dependency for one gradient.

## Authentication

`AuthShell` is the single shell behind login, register, forgot-password and
verify-email, so the mark was added once and all four inherit it. The uppercase
text eyebrow it replaced identified the product only if you read it; the mark
does it at a glance. Hierarchy is unchanged: brand → title → description → form
→ primary action → secondary.

## Feed Branding

Both feeds use the **compact** lockup, deliberately. The feed is content-first
and Phase 50/51 spent real effort making the first card dominant; the brand
identifies the surface without competing with it.

## Teacher / Student Relationship

One brand, two emphases. Both feeds share the mark, the palette, the radius and
typography language, and the same navigation quality. They differ where they
should — channels, card actions (`Cevapla` vs `Ödevde Kullan`), and what the
first screen is for — not in identity.

## Accessibility

Every token pair used for text or controls was measured, not assumed. All pass
AA; most pass AAA. The one colour that fails on white — the logo's own cyan —
is confined to brand surfaces in light mode for exactly that reason.

`accent #FF3B5C` remains 3.48:1 on white, unchanged from before this phase: it
is a notification badge background, not text.

## Native iOS

Xcode 26.6 · iOS 26.5 · iPhone 17 Pro. Prebuilt and rebuilt so the native
asset catalog regenerated from `app.json`.

Home Screen icon verified visually against Apple's own icons — correct mask, no
double corner, mark prominent. Cold launch verified in both appearances: white
splash → white app in light, navy splash → navy app in dark, no flash and no
logo jump. Login, student feed, channels and Study Hub all verified on device.

Prebuild rewrote `package.json`'s `ios`/`android` scripts to `expo run:*`; that
was reverted and is not in the commit.

## Web

Auth, feed and profile verified at desktop and mobile widths, light and dark.
The mark scales by context rather than a fixed size, and never becomes large on
desktop.

## Performance

Assets are the only runtime cost added, and they were optimised: the PNG
encoder was given adaptive row filtering, taking the set from 1.4 MB to 876 KB
(icon 468→318 KB, adaptive 364→269 KB, splash 219→161 KB) with byte-identical
decoded pixels. A duplicate copy of the mark was deleted rather than shipped
twice. No animation, no gradient layers, no new dependency.

## Automated Validation

| Check | Result |
|---|---|
| typecheck | PASS |
| lint | PASS |
| unit | 136 suites / 2277 tests |
| rules | 5 suites / 350 tests |
| verify | PASS |
| expo-doctor | 17/18 (pre-existing Expo patch drift, untouched) |
| `git diff --check` | PASS |

## Known Limitations

- **Three components were frozen on the light palette and are now fixed.**
  `Badge`, `Toast` and `NextActionSection` each held a module-scope constant
  reading `colors.*` at import time — a third variant of the freeze Phase 49
  and 51 fixed for `StyleSheet.create`, in plain objects the codemods never
  looked at. Caught because the role badge rendered light-theme values on the
  dark profile. Worth noting that this class of bug can only be found by
  looking at the running app.
- The splash follows the **OS** appearance, not the in-app override, because it
  renders before JS runs. An explicit Koyu on a light phone briefly shows a
  light splash. This is inherent to native splash screens.
- The bootstrap screen can show its wordmark one frame before the mark decodes
  on web. On native the splash covers that window entirely.
- The offline banner still overlays the screen header (carried from Phase 51,
  unchanged here).
- Question images 404 against the demo fixtures, so cards show the Phase 51
  "Görsel yüklenemedi" placeholder.

## Final Result

The product now derives its palette, its icon, its splash and its brand
surfaces from one committed source file. Light uses the mark's stem blue, dark
uses its diagonal, and the cyan is kept off text where it measurably fails.
No learning logic, no schema, no Firestore change, no new dependency.
