# Preview fidelity — findings and resolution

> **Status, 2026-09-14 — all 52 findings closed.** Each was re-checked against the code as it stands
> today by one agent per section, then every proposed change was independently audited by a second
> agent instructed to refute it. Outcome: **29 already fixed** by the token pass recorded below,
> **23 patches applied**, and **13 proposals rejected** by the audit — twelve of them because the
> proposal was one half of a change that breaks alone (a comment documenting behaviour the code did
> not yet have, a CSS rule for a class that did not exist, a caller passing a prop the component did
> not accept), and one because it was a no-op. Those twelve were then implemented as whole units and
> are listed under "Reconstructed" below; the no-op was dropped.
>
> The findings below are kept as written — they are the record of what drifted and why, and several
> explain a specificity or token-cascade trap that would otherwise be re-introduced.

## Reconstructed as whole changes

The audit was right to reject these as fragments. Each needed markup, CSS and sometimes a caller to
land together:

- **Detail header at 390** — `pv-header--detail` now scopes the two M3 exceptions (58:327 has neither
  the bottom hairline nor a trailing wordmark) so the catalog header at 390 keeps both. The trailing
  wordmark got its own `pv-wordmark-trailing` hook, because hiding `.pv-wordmark` wholesale would
  have taken the catalog's with it.
- **Back-link copy at 390** — the component ships both labels and the breakpoint chooses, mirroring
  the Unit Toggle's `ft / in` → `ft`. Both spans are `aria-hidden` and the anchor carries the full
  copy as its accessible name, so the link announces the same thing at every width.
- **Mobile filter rail** — 58:239 is a clipped, non-wrapping row; the strip now scrolls sideways
  instead of folding, and the Liked chip moves to second position via flex `order` rather than by
  moving the markup, so the DOM order `filters.ts` walks is identical at both widths.
- **Thumbnail strip at 390** — the whole `<section>` is dropped, not just `.pv-thumbs`: an empty flex
  item would still contribute one `.pv-main` gap of its own.
- **Gate password field** — the 36px literal became
  `calc(var(--input-x) + var(--size-icon) + var(--tight))`, which is the drawn 40.8 and leaves the
  12px text-to-icon gap of 53:11 / 58:213.

`tests/integration/preview-header.test.ts` guards the header variants and the scoping of the 390
exceptions; the scoping guard was mutation-tested against a bare `.pv-header { border-bottom: 0 }`.

Generated from an adversarial audit of the customer preview against Figma `05 · Customer Preview`
(file `Zzv9aXvSad5NTZc9rFRFxx`). Each finding was raised by one agent and then independently
refuted-or-confirmed by a second, which rejected 6 of the original 75; these 52 survived.

The preview realm was first built from this file on 2026-09-09 (ADR D18). These are the places it
drifted, or never matched. They are listed so none is lost, not because all are equal —
severity is on each row.

**Already fixed** in the token pass that accompanied this audit (the 29 above):

- the 390 and 810 breakpoints no longer invent `--section-gap` / `--space-section` steps;
  they now carry only what the handoff states and the frames draw
- `--text-lg` drops to the body step at 390, fixing every 15 → 13 lead paragraph at once
- the redundant component-level mobile heading overrides are gone (they applied the
  step-down twice, since the token layer already remaps the scale at 390)
- Label tracking is 0, not 0.02em
- the select chevron is ink
- the footer wordmark, contact label and email win their specificity fights again
- the gate’s second consent line renders as the Caption it is drawn as

---

## G1 · Password gate

### M1 gate stack gap between the four groups

- **Severity** — wrong-value
- **Figma** — 58:207 — column gap 64 (--section-stack-gap), identical to desktop; children at y 0 / 117 / 200 / 358.6
- **Code** — src/components/customer/PreviewGate.astro:83 `.pv-gate-col { gap: var(--section-gap) }`; at ≤767px src/styles/modes.css:412 redefines `--section-gap: var(--space-24)` → renders 24px, not 64px
- **Fix** — In src/components/customer/PreviewGate.astro, inside the existing `@media (max-width: 767px)` block, add the gap alongside the max-width already restored there, mirroring how the 48 gutter is clawed back from the mobile token: .pv-gate-col { max-width: 294px; gap: var(--space-64); /* 390 keeps the 64 section-stack gap; the mode token drops to 24 */ } (Leave the `.pv-gate` padding alone — the frame centres the 398.6-tall stack in 844 with no padding, which `place-items: center` already does.)

### M1 wordmark 'Serio Ludere' size at 390

- **Severity** — wrong-value
- **Figma** — 58:209 — Mobile/H1 Inter 700 / 19.8px / lh 1.2 / uppercase / #000000
- **Code** — src/components/customer/PreviewGate.astro:169-171 `.pv-gate-brand .pv-h1 { font-size: var(--h3) }`; modes.css:415 already maps `--h3: var(--h3-mobile)` = 16.2px at ≤767, so the step-down is applied twice → renders 16.2px. Without this override `.pv-h1` (var(--h1) → --h1-mobile) would already be the correct 19.8px
- **Fix** — In src/components/customer/PreviewGate.astro, delete the `.pv-gate-brand .pv-h1 { font-size: var(--h3); }` rule from the `@media (max-width: 767px)` block (lines 169-171). `.pv-h1` then falls through to src/styles/preview.css:77 `font-size: var(--h1)`, which modes.css:413 already resolves to `--h1-mobile` = 19.8px at ≤767 — exactly Figma 58:209. (The adjacent `.pv-gate-welcome { font-size: var(--h4); }` at lines 172-174 has the identical double-step-down problem — it yields 14.4px where Figma 58:211 specifies Mobile/H3 16.2px — and should be removed too so `.pv-h3` resolves to `--h3-mobile` = 16.2px.)

### M1 'Welcome, Hala.' size at 390

- **Severity** — wrong-value
- **Figma** — 58:211 — Mobile/H3 Inter 700 / 16.2px / lh 1.2 / uppercase / #000000
- **Code** — src/components/customer/PreviewGate.astro:172-174 `.pv-gate-welcome { font-size: var(--h4) }`; modes.css:416 maps `--h4: var(--h4-mobile)` = 14.4px at ≤767 → renders 14.4px. The unoverridden `.pv-h3` would already resolve to 16.2px
- **Fix** — Delete the `.pv-gate-welcome { font-size: var(--h4); }` rule from the `@media (max-width: 767px)` block in src/components/customer/PreviewGate.astro (lines 171-174). With no override, the element's `.pv-h3` class resolves `--h3` → `--h3-mobile` → `--size-h3-min` = 16.2px at ≤767, matching Figma 58:211, while desktop keeps `--size-h3` = 19.8px. (Separately, the sibling rule at lines 169-171, `.pv-gate-brand .pv-h1 { font-size: var(--h3) }`, has the same double-step defect: `--h1-mobile` is already 19.8px per modes.css:242/:83, which is the spec value, but the override forces 16.2px — worth removing in the same pass.)

### M1 subtitle 'A private preview, prepared for you' size at 390

- **Severity** — wrong-value
- **Figma** — 58:210 — Body Inter 400 / 13px (--text-base) / #403F3C, w294 h21 (desktop uses 15px)
- **Code** — src/styles/preview.css:108-111 `.pv-lede { font-size: var(--text-lg) }` = 15px; PreviewGate.astro's ≤767 block (lines 162-178) has no step-down for it → renders 15px at 390
- **Fix** — Preferred (fixes all three 15→13 mappings in DIFF-1 at once — gate subtitle, catalog subtitle, product description): in src/styles/modes.css, inside the `@media (max-width: 767px)` preview block (lines 408-419), add `--text-lg: var(--size-body-base); /* lead drops to body at 390 — DIFF-1 */` alongside the existing --h1..--h4 step-downs. Narrower alternative if you want to scope it to the gate only: add to PreviewGate.astro's ≤767 block (lines 162-178) `.pv-gate-brand .pv-lede { font-size: var(--text-base); }`.

### Second fine-print line "It helps us show you more of what you're drawn to." — its 11px/#8C8B84 caption styling never applies

- **Severity** — wrong-value
- **Figma** — 53:31 — Caption 11px (--text-xs) / #8C8B84 (text/muted), h18, sitting under the 12px/#403F3C line 53:30
- **Code** — src/components/customer/PreviewGate.astro:151-154 `.pv-gate-note p { font-size: var(--text-sm); color: var(--ink-soft) }` is specificity (0,1,1) and outranks `.pv-gate-note-2` (0,1,0) at lines 155-158 regardless of source order → the second line renders 12px #403F3C instead of 11px #8C8B84
- **Fix** — In src/components/customer/PreviewGate.astro, raise the override's specificity above the base rule. Replace lines 155-158 `.pv-gate-note-2 { font-size: var(--text-xs); color: var(--ink-muted); }` with `.pv-gate-note p.pv-gate-note-2 { font-size: var(--text-xs); color: var(--ink-muted); }` — (0,2,1) beats the base rule's (0,1,1) pre-scope, and the compiler adds the same scope suffix to both. (Equivalently, narrow the base rule to `.pv-gate-note > p:first-child`.) Leave the `@media (max-width: 767px)` block at lines 174-177 unchanged: it only sets `display`, which nothing else contests.

### Gap between the password text and the eye icon inside the input

- **Severity** — wrong-value
- **Figma** — 53:11 / 58:213 — row with 12.8px inline padding, row gap 12, flex-1 text, 16x16 Icon/Eye: the text box stops 40.8px from the right edge (12.8 + 16 + 12)
- **Code** — src/components/customer/PreviewGate.astro:111 `.pv-field .pv-input { padding-right: 36px }` with the eye at `right: var(--input-x)` (12.8) and width 16 (line 116, 121) → the text–icon gap is 7.2px, not 12px
- **Fix** — In src/components/customer/PreviewGate.astro, replace the literal with the token-derived reservation so the text stops 40.8px from the right edge and the gap is exactly the 12 Figma draws: .pv-field .pv-input { /* 12.8 inline padding + 16 glyph + 12 row gap = 40.8, per Figma 53:11 / 58:213. */ padding-right: calc(var(--input-x) + var(--size-icon) + var(--tight)); text-align: left; } --input-x is 12.8px, --size-icon is 16px (modes.css:233), --tight is 12px (modes.css, preview block), so this resolves to 40.8px at both breakpoints and matches the sibling pattern in src/styles/controls.css:245. Leave .pv-eye's `right: var(--input-x)` and `width/height: 16px` as they are.

## G2 · Catalog

### Footer wordmark "Serio Ludere" is overridden to body size/colour by a more specific rule — `.pv-footer-col p` (0,1,1) beats `.pv-h4` (0,1,0), so the H4 never lands

- **Severity** — wrong-value
- **Figma** — 130:277 — H4 Inter 700 / 16.2px / lh 1.2 / uppercase / #000000, w260 h19
- **Code** — 12px (`--text-sm`) / #403F3C (`--ink-soft`) — src/styles/preview.css:249-250 outspecifies `.pv-h4` at src/styles/preview.css:92-97; markup src/components/customer/PreviewFooter.astro:14
- **Fix** — Re-assert the H4 for the footer wordmark with a rule that out-specifies `.pv-footer-col p`, and give it the ink colour `.pv-h4` never declares. Add immediately after src/styles/preview.css:251: /* The wordmark is the H4 (16.2 / #000000), not footer body copy: `.pv-footer-col p` above is (0,1,1) and would otherwise outspecify `.pv-h4`. */ .pv-footer-col p.pv-h4 { font-size: var(--h4); color: var(--ink); } This is breakpoint-agnostic, which is correct — mobile 131:294 specifies the same 16.2px / #000000. An equivalent alternative is to stop nesting the wordmark under `.pv-footer-col` (hoist it out of the column, or scope the body rule to `.pv-footer-col p:not(.pv-h4)`), but the explicit re-assertion is the smaller change and keeps the footer's column layout intact.

### Footer "Contact" label colour — `.pv-footer-col p` outspecifies `.pv-muted`

- **Severity** — wrong-value
- **Figma** — 130:280 — Label Inter 700 / 12px / uppercase / #8C8B84 (text/muted)
- **Code** — #403F3C (`color: var(--ink-soft)`) — src/styles/preview.css:250 beats `.pv-muted` at src/styles/preview.css:113-115; markup src/components/customer/PreviewFooter.astro:18
- **Fix** — In src/styles/preview.css, add a rule with specificity high enough to beat `.pv-footer-col p` (0,1,1), placed immediately after the `.pv-footer-col p` block at lines 248-251, mirroring how `.pv-footer-fine p` already handles the muted colour: .pv-footer-col p.pv-muted { color: var(--ink-muted); } That is specificity (0,2,1), so the Contact label resolves to --ink-muted = #8c8b84 as Figma 130:280 draws it, while the sibling `<p>` elements in the footer columns keep --ink-soft. It also fixes the mobile footer (131:296 'Contact' Label 12/700/uppercase/#8C8B84), which is the same markup. Alternatively, scope the override to the contact column with `.pv-footer-contact .pv-muted`, but the `p.pv-muted` form is preferable because it repairs the general cascade bug wherever `.pv-muted` is applied to a `<p>` inside `.pv-footer-col` rather than only at this one call site.

### Footer email line size and colour

- **Severity** — wrong-value
- **Figma** — 130:281 'hello@serioludere.com' — Body Inter 400 / 13px / #000000, w240 h21
- **Code** — 12px from src/styles/preview.css:249 and #403F3C from `.pv-footer a` at src/styles/preview.css:263-266; markup src/components/customer/PreviewFooter.astro:19
- **Fix** — Give the email line the body token and ink colour without disturbing the sibling lines. In src/components/customer/PreviewFooter.astro:19 add a class: `<p class="pv-footer-email"><a href={`mailto:${STUDIO_EMAIL}`}>{STUDIO_EMAIL}</a></p>`. Then in src/styles/preview.css, after the `.pv-footer a` block (line 266), add: .pv-footer-col p.pv-footer-email, .pv-footer-email a { font-size: var(--text-base); /* 13 — Figma 130:281 / 131:297 */ color: var(--ink); } Keep the existing `.pv-footer a:hover { color: var(--brand); }` and add `.pv-footer-email a:hover { color: var(--brand); }` if the hover needs to win over the new colour (or raise the hover selector's specificity to match).

### Mobile section rhythm between top-level sections (header→title→filters→grid)

- **Severity** — wrong-value
- **Figma** — 58:231 — column stack, gap 64 between every section at 390 (header h52 at y=0, title block at y=116, filters 245, grid 345); DIFF-2: "Section gap 64 everywhere, both breakpoints"
- **Code** — `gap: 40px; padding-top: 40px` — src/styles/preview.css:303-304 (hard literals, and `--section-gap` itself is redefined to 24px at ≤767 in src/styles/modes.css:411)
- **Fix** — In C:/Users/MD/Desktop/WebScraber/src/styles/preview.css, replace the hard literals in the ≤767 block (lines 302-305) so the mobile stack keeps the frame's 64: `css .pv-main { gap: var(--space-64); padding-top: var(--space-64); } ` (`--space-64: 64px` is defined at :root in src/styles/modes.css:105, so it is in scope; writing it as the token rather than `64px` keeps the value on-system, which the `40px`/`40px` literals were not.) Then correct the comment at src/styles/preview.css:286-288, which is what licensed the drift — drop the false clause so it reads: `css /* ---------- 390 ---------- The mobile frames are not a squeeze of the desktop: the gutter halves to 16 and the header shrinks to 52 with the wordmark one step down the scale. The 64px section rhythm is unchanged — DIFF-2 in the handoff: "Section gap 64 everywhere, both breakpoints." */ ` Do not fix this by editing `--section-gap` at src/styles/modes.css:412 — that token is shared, and at 390 the spec panel genuinely wants 16 ("58:345 … Padding 16 all sides (desktop 64)"), so raising it to 64 globally would break SpecTable.astro:51 and the gate. Keep the override local to `.pv-main`. If full DIFF-2 parity is wanted in the same pass, the same 24px leak needs pinning to 64 at ≤767 in three more places: `.pv-footer` `margin-top` (preview.css:233) and its mobile `padding` block value (preview.css:308), and the catalogue grid's `row-gap` (src/pages/[slug]/index.astro:188).

### Mobile grid row gap between cards

- **Severity** — wrong-value
- **Figma** — 58:250 — M2 grid, single column, gap 64 (cards at y=0, 521, 1042 — pitch 521 = 457 + 64)
- **Code** — `row-gap: var(--section-gap)` which resolves to 24px at ≤767 — src/pages/[slug]/index.astro:188 with src/styles/modes.css:411
- **Fix** — In src/pages/[slug]/index.astro, change the mobile rule (line 188) from `row-gap: var(--section-gap);` to `row-gap: var(--space-64);` (64px, the primitive on :root at modes.css:105, which no breakpoint overrides) so the single-column grid keeps the drawn 521px pitch. Do not fix it by changing `--section-gap` at ≤767 — that token also drives .pv-header, .pv-footer and .pv-state padding, which would move several unrelated bands.

### Mobile grid bottom padding

- **Severity** — wrong-value
- **Figma** — 58:250 — padding-bottom 64 at 390 (desktop 53:61 uses 112)
- **Code** — `padding-bottom: var(--space-section)` which resolves to 40px at ≤767 — src/pages/[slug]/index.astro:170 with src/styles/modes.css:411
- **Fix** — Pin the grid band's bottom padding at the mobile breakpoint instead of letting the shared token decide it. In C:\Users\MD\Desktop\WebScraber\src\pages\[slug]\index.astro, inside the existing `@media (max-width: 767px)` block, extend the `.pv-grid` rule: .pv-grid { grid-template-columns: 1fr; row-gap: var(--section-gap); /* 58:250 draws 64 below the last row at 390 — the same step as desktop's 112 is drawn there, not the theme's sub-1000px "tight" value that --space-section falls to. */ padding-bottom: var(--space-64); } Do NOT fix this by raising `--space-section` in modes.css:411 — that token also drives `.pv-state` padding (index.astro:180) and components.css:1339/1384, so a global bump would move unrelated screens. If you also want the drawn 128px footer clearance at 390, the second half is preview.css's mobile `.pv-footer { padding: var(--section-gap) var(--stack-lg); }` / `margin-top: var(--section-gap)` (24px) versus Figma's 64 — but that is a separate finding; the padding-bottom change above is the one this claim names.

### Mobile footer block padding

- **Severity** — wrong-value
- **Figma** — 131:293 — padding 64 block / 16 inline (footer 390x252 = 64 + 124 content + 64)
- **Code** — `padding: var(--section-gap) var(--stack-lg)` = 24px block / 16px inline at ≤767 — src/styles/preview.css:308 with src/styles/modes.css:411
- **Fix** — In src/styles/preview.css, inside @media (max-width: 767px), pin the footer's block padding to the drawn 64 instead of letting it ride the tightened mobile --section-gap: .pv-footer { /* Figma 131:293 / 131:311 keep the desktop 64 block padding at 390; only the gutter halves. */ padding: var(--space-64) var(--stack-lg); } (--gutter is already --space-16 at this breakpoint, so `var(--space-64) var(--gutter)` is equivalent for the inline half; do not simply delete the override, since the base rule would then resolve to the mobile --section-gap of 24px and reproduce the same defect.) Worth checking the sibling values in the same query while there: .pv-main uses gap/padding-top 40px where the spec's DIFF-2 says the 64 section gap holds at both breakpoints.

### Mobile footer column gap between the three groups

- **Severity** — wrong-value
- **Figma** — 131:293 — column gap 12 (wordmark ends y=83, next block y=95; block ends y=140, caption y=152)
- **Code** — `gap: var(--stack-lg)` = 16px — src/styles/preview.css:311-314
- **Fix** — In src/styles/preview.css, inside the @media (max-width: 767px) block, change the footer stack gap from --stack-lg to --stack-md: .pv-footer-row { flex-direction: column; gap: var(--stack-md); /* 12 — Figma 131:293 tightens the mobile footer stack */ } Leave the desktop rule at line 236-240 (`gap: var(--stack-lg)`) unchanged; 16 is correct there per Figma 130:275.

### Clearance between the last card row and the footer at 390

- **Severity** — wrong-value
- **Figma** — 58:230 — grid ends y=2026 (incl. its 64 padding-bottom), footer starts y=2090 → 64 grid padding + 64 section gap = 128
- **Code** — 40px grid padding-bottom + 24px `.pv-footer { margin-top: var(--section-gap) }` = 64 total — src/pages/[slug]/index.astro:170 and src/styles/preview.css:233 with src/styles/modes.css:411
- **Fix** — Restore the drawn 64px rhythm at 390 for the preview realm only. 1) src/styles/modes.css:411-412, inside `@media (max-width: 767px)`: change `--space-section: var(--space-40)` to `var(--space-64)` and `--section-gap: var(--space-24)` to `var(--space-64)` (the 1023 block keeps its 36/40 theme-derived values — no frame is drawn at 810, as its comment says). That alone makes the grid's padding-bottom 64 and the footer's margin-top 64 = 128, and it also corrects the mobile footer's own padding at preview.css:308 (`var(--section-gap) var(--stack-lg)`) to the drawn 64 block / 16 inline of 131:293. 2) src/styles/preview.css:302-305: drop the hard-coded `.pv-main { gap: 40px; padding-top: 40px; }` so main inherits the 64 the frame measures (header ends 52 -> title block at 116). 3) Guard the two consumers whose mobile values are genuinely smaller in the frame: add a max-width:767 override `padding: var(--stack-lg)` to `.pv-spec` (src/components/customer/SpecTable.astro:51 currently uses --section-gap; 58:345 draws 16 on mobile vs 64 on desktop). The header is already safe — preview.css:295 overrides it to `var(--stack-lg)`. 4) Fix the stale comments: preview.css:286-288 should not claim "the section rhythm tightens" (only the gutter, header height and type scale step down), and index.astro:169 / preview.css:215 should note the clearance is 176 at desktop and 128 at 390.

### Mobile title 'The collection' font size — the override forces the mobile-H3 step even though `--h1` already resolves to the correct 19.8 at ≤767

- **Severity** — wrong-value
- **Figma** — 151:26 — Mobile/H1 Inter 700 / 19.8px / uppercase, w174 h36; DIFF-1 "catalog H1 'The collection' 28.8 → 19.8"
- **Code** — `font-size: var(--h3)` → `--h3-mobile` → `--size-h3-min` = 16.2px — src/pages/[slug]/index.astro:200 with src/styles/modes.css:415 and :87
- **Fix** — In src/pages/[slug]/index.astro, delete the `font-size: var(--h3);` declaration from the `@media (max-width: 767px)` rule at line 199-202, leaving `.pv-title-row .pv-h1 { white-space: nowrap; }`. The base `.pv-h1` rule (src/styles/preview.css:77) already resolves `--h1` to `--h1-mobile` = `--size-h1-min` = 19.8px inside that same breakpoint, which is the Figma Mobile/H1 value. Also correct the comment at lines 193-195: the title does not step down again at 390 — the token remap in modes.css is the single step from 28.8 to 19.8; only the row gap tightening from 12 to 8 and the abbreviated "ft" belong in that note. If an explicit value is preferred over relying on the token remap, use `font-size: var(--h1-mobile);` instead, which pins 19.8px directly.

### Mobile header wordmark font size (and therefore the 52px header height)

- **Severity** — wrong-value
- **Figma** — 58:233 — 'Serio Ludere' H4 Inter 700 / 16.2px / uppercase at (16,16.5), 119.33x19; header 390x52 = 16 + 19.44 + 16
- **Code** — `font-size: var(--h4)` → `--h4-mobile` → `--size-h4-min` = 14.4px, giving a ~49px header — src/styles/preview.css:298-300 with src/styles/modes.css:416 and :89
- **Fix** — In src/styles/preview.css:298-300, stop reading --h4 (which the same breakpoint has already floored to 14.4px) and pin the 16.2px step the frame draws: .pv-header .pv-wordmark { /* 16.2 (Figma 58:233). --h4 resolves to --h4-mobile (14.4) inside this breakpoint, so read the raw step rather than the semantic alias. */ font-size: var(--size-h4); } Equivalent and simpler: delete the override entirely — the element already carries .pv-h3, and --h3 -> --h3-mobile -> --size-h3-min = 16.2px at <=767px, which is exactly the M2 value. (Keep the explicit rule if you want the mobile size stated at the call site.) Separately, while in this rule: on desktop the detail header wordmark renders at --h3 19.8px, but Figma 57:229 draws it as H4 16.2px (G3 header 148 tall vs G2's 152). Not part of this claim, but worth checking as its own item.

### Mobile catalog subtitle font size — `--text-lg` is never stepped down at 390

- **Severity** — wrong-value
- **Figma** — 58:238 'Mark what draws you — and what doesn't.' — Body Inter 400 / 13px / #403F3C, w358 h21; DIFF-1 "catalog subtitle 15 → 13"
- **Code** — `.pv-lede { font-size: var(--text-lg) }` = 15px at every width — src/styles/preview.css:108-111 (no ≤767 override of `--text-lg` in src/styles/modes.css:408-419)
- **Fix** — In src/styles/modes.css, inside the `@media (max-width: 767px)` preview block (lines 408-420), add the missing lead step alongside the existing heading overrides: `css @media (max-width: 767px) { :root:not([data-mode='admin']):not([data-mode='admin-dark']), [data-mode='preview'] { --gutter: var(--space-16); --space-section: var(--space-40); --section-gap: var(--space-24); --h1: var(--h1-mobile); --h2: var(--h2-mobile); --h3: var(--h3-mobile); --h4: var(--h4-mobile); --text-lg: var(--size-body-base); /* lead drops 15 -> 13 at 390 (Figma 58:238, 58:210, 58:344; DIFF-1) */ --text-xl: var(--size-body-xl-min); } } ` Safe to scope at the token: `--text-lg` has exactly one consumer (`.pv-lede`, preview.css:109) plus the mid-migration alias `--text-md` (modes.css:432), which nothing currently reads — so the public catalogue's catalogue.css/editorial.css parity record is unaffected. One line fixes the catalog subtitle, the gate subtitle and the M3 product description together.

### Mobile filter chip strip wraps instead of scrolling horizontally

- **Severity** — missing
- **Figma** — 58:239 — row, gap 8, padding-inline 16, items-start, clip, NO wrap; tags total 378 in a 358 box and the last tag is cut at the 390 edge (NOTES #4: "Implement as a horizontally scrollable strip; do not wrap")
- **Code** — `.pv-filters { display: flex; flex-wrap: wrap; gap: var(--stack-sm) }` with no ≤767 override and no `overflow-x` anywhere — src/components/customer/TagFilters.astro:41-46 (no `.pv-filters` rule exists in any other stylesheet)
- **Fix** — Add a mobile-only override in src/components/customer/TagFilters.astro's <style> block (keep the desktop wrap, which matches 53:42): @media (max-width: 767px) { /* 58:239: the mobile strip is a row with clip and NO wrap — the tags total 378 in a 358 box, so it scrolls sideways rather than folding into a second row. */ .pv-filters { flex-wrap: nowrap; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; } .pv-filters::-webkit-scrollbar { display: none; } .pv-chip { flex: 0 0 auto; } } The nav already sits inside .pv-wrap, whose mobile padding-inline is var(--stack-lg) = 16px, matching 58:239's padding-inline 16, so the scroll container lines up with the frame. Two details worth carrying over: .pv-chip already has white-space: nowrap (line 64) but needs flex: 0 0 auto so chips stop shrinking once the row cannot fit; and give the chip a focus outline-offset that is not clipped by the scroller (editorial.css:12 uses outline-offset: -4px for exactly this reason) so keyboard focus stays visible inside the overflow box. Also update the component header comment at TagFilters.astro:2-4, which currently says only "wrapping" and cites 53:42, to record that 58:239 scrolls instead.

### Desktop footer gap between column 1 and column 2 is doubled — a hard-coded margin is added on top of the flex gap

- **Severity** — wrong-value
- **Figma** — 130:275 — row gap 16 (col1 w300 at x=0, col2 w240 at x=316)
- **Code** — `.pv-footer-row { gap: var(--stack-lg) }` (16px, src/styles/preview.css:239) plus `.pv-footer-contact { margin-left: 16px }` = 32px — src/components/customer/PreviewFooter.astro:29-31
- **Fix** — Delete the `.pv-footer-contact` rule block entirely from src/components/customer/PreviewFooter.astro:28-37 (both the `margin-left: 16px` and its `max-width: 767px` reset), and drop the now-unused `pv-footer-contact` class from the div on line 17, leaving `<div class="pv-footer-col">`. The `gap: var(--stack-lg)` on `.pv-footer-row` (preview.css:239) then supplies the drawn 16px on its own, and the mobile column stack keeps its flush left edge. If the intent was to reach Figma's 316px column-2 offset, the correct fix is a fixed width on column 1 (`width: 300px`, per 130:276 w300) rather than an extra margin — the margin does not produce the drawn geometry at any viewport.

### 'Questions, or want to see one in person?' is rendered at 390

- **Severity** — extra
- **Figma** — 131:293 — the M2 footer has only the wordmark, the Contact block and the caption; DIFF-3 item 4 lists this line as present on desktop and absent on mobile
- **Code** — rendered unconditionally, no ≤767 hide — src/components/customer/PreviewFooter.astro:15
- **Fix** — In C:/Users/MD/Desktop/WebScraber/src/components/customer/PreviewFooter.astro, tag the line and hide it at the existing 767 breakpoint (the component already owns a `@media (max-width: 767px)` block, so no new breakpoint is introduced). Line 15 — change: <p>Questions, or want to see one in person?</p> to: <p class="pv-footer-ask">Questions, or want to see one in person?</p> Then in the component's `<style>` block, inside the existing `@media (max-width: 767px)` rule, add: .pv-footer-ask { display: none; } Also update the component comment: line 2 currently claims "Figma 130:274 / 130:297, identical on both screens" — the mobile footer is 131:293 / 131:311 and is not identical; note that the invitation line is desktop-only per DIFF-3 item 4, so the next reader does not re-add it. If the studio wants the line kept at 390 as a product decision, record it as a fourth deliberate deviation under D18 in docs/ADR.md instead of changing the markup.

### Currency picker chevron stroke colour

- **Severity** — wrong-value
- **Figma** — 130:265 — 'Icon / Chevron Down' 16x16 at (46,10), 1px stroke bound to text/primary = #000000
- **Code** — `.pv-select svg { color: var(--ink-soft) }` = #403F3C — src/components/customer/PreviewControls.astro:113-120
- **Fix** — In src/components/customer/PreviewControls.astro, change the chevron rule at lines 113-120 from `color: var(--ink-soft);` to `color: var(--ink);` so the 1px stroke resolves to #000000, matching 'Icon / Chevron Down' in 130:265 and the trigger's own 'USD' label. If a softened chevron is actually wanted, record it as a fourth deliberate deviation in ADR D18 and add a comment on the rule — but note D18 currently claims the closed trigger matches the drawing, so that line would need amending too.

### Mobile unit toggle segment inline padding (and hence the 85px toggle width)

- **Severity** — wrong-value
- **Figma** — 131:281 — 85x36; seg 1 'cm' 45 wide = 12 + 21 + 12, seg 2 'ft' 40 wide = 12 + 16 + 12, i.e. padding 12 inline is unchanged from desktop; DIFF-2 lists no toggle-padding change
- **Code** — `padding-inline: var(--stack-sm)` = 8px at ≤767, giving a ~77px toggle — src/components/customer/PreviewControls.astro:132-134
- **Fix** — In src/components/customer/PreviewControls.astro, delete the `.pv-seg button { padding-inline: var(--stack-sm); }` rule from the `@media (max-width: 767px)` block (lines 132-134) so the segments keep `var(--stack-md)` (12px) inline padding at mobile, giving 45px + 40px = the 85px toggle drawn at 131:281. Keep the `.pv-controls { gap: var(--stack-sm) }` override (that 12→8 gap IS in DIFF-2) and keep the `ft` abbreviation swap.

### Letter-spacing on Label-style text (unit toggle, chips-adjacent labels, buttons, footer 'Contact')

- **Severity** — wrong-value
- **Figma** — TOKENS — heading and body both letter-spacing 0; Label = Inter 700 / 12 / lh 1.65 / uppercase, letter-spacing 0
- **Code** — `letter-spacing: 0.02em` — src/styles/preview.css:105 (`.pv-label`), src/styles/preview.css:178 (`.pv-btn`), src/components/customer/PreviewControls.astro:73 (`.pv-seg button`)
- **Fix** — Set the Label style's tracking to the Figma token value of 0 in all three rules, matching .pv-h1 and .pv-select select which already do: change `letter-spacing: 0.02em` to `letter-spacing: 0` at src/styles/preview.css:105 (.pv-label), src/styles/preview.css:178 (.pv-btn), and src/components/customer/PreviewControls.astro:73 (.pv-seg button). If the 0.02em is actually wanted as an optical correction for 12px uppercase, the alternative is to keep it but apply it uniformly to every Label instance (including .pv-select select at PreviewControls.astro:109) via a single --label-tracking token, and record it in docs/ADR.md D18's deviation list with the reason.

### 'Liked' chip count is dimmed

- **Severity** — extra
- **Figma** — 53:59 — the whole tag label '♡ Liked 38' is a single Body S 12px text node in one fill (#FFFFF5 selected / #000000 default); no separate treatment for the number
- **Code** — `.pv-chip-count { opacity: 0.65 }` — src/components/customer/TagFilters.astro:79-82
- **Fix** — In src/components/customer/TagFilters.astro delete the `opacity: 0.65` declaration so the count inherits the chip's label fill (#000000 default / #FFFFF5 selected), matching the single-fill Body S label in Figma 53:59. The `<span data-liked-count>` hook is still needed by src/scripts/filters.ts, so keep the span and either drop the rule entirely or reduce it to `.pv-chip-count { color: inherit; }`. Separately worth noting (outside this claim): the chip renders the heart as a 12px SVG plus a single space before the number, while Figma draws '♡ Liked 38' as one text run with two spaces — see spec NOTES item 9, which asks for a one-vs-two-space decision.

### 'Liked' chip position in the mobile rail

- **Severity** — wrong-value
- **Figma** — 58:242 — '♡ Liked 38' is the SECOND chip at 390 (x=70, directly after 'All'), ahead of Kashan/Tabriz/Heriz; on desktop 53:59 it is last
- **Code** — rendered last at every width, after the tag chips — src/components/customer/TagFilters.astro:19-38
- **Fix** — Add a mobile-only reorder to the `<style>` block in src/components/customer/TagFilters.astro, using the repo's existing 767px breakpoint. Because `.pv-filters` is a flexbox, "All" needs a lower order value than the liked chip so it stays first: /* At 390 the file (58:242) puts the shortlist chip second, straight after "All", ahead of the type tags; the strip does not wrap there, so a trailing Liked chip would sit off-screen. */ @media (max-width: 767px) { .pv-chip[data-filter='all'] { order: -2; } .pv-chip-liked { order: -1; } } Then update the component's header comment, which currently states the desktop behaviour as universal ("closes the row with a 'Liked' chip"), to record that the chip closes the row at 1440 (53:59) and moves to second position at 390 (58:242). If the studio prefers one order at both widths, record that as a deviation under docs/ADR.md D18 instead, alongside the existing three.

## G3 · Product detail

### Product price type size (desktop). Figma draws the price at H3; the code uses H1, the title's step.

- **Severity** — wrong-value
- **Figma** — '$4,850' H3 Inter 700 / 19.8px / lh 1.2 (151:15, w72)
- **Code** — font-size: var(--h1) → 28.8px — src/pages/[slug]/[productId].astro:234
- **Fix** — In C:/Users/MD/Desktop/WebScraber/src/pages/[slug]/[productId].astro, change the desktop rule at line 233-237 from `font-size: var(--h1);` to `font-size: var(--h3);` so the price resolves to 19.8px, one step below the 28.8px title, matching Figma 151:15. Note on the mobile block while you are in there (lines 288-290): `.pv-price { font-size: var(--h3); }` inside `@media (max-width: 767px)` resolves --h3 to --h3-mobile = --size-h3-min = 16.2px (modes.css:87, 415), but Figma 151:37 draws the M3 price as "Mobile/H4 Inter 700 / 14.4px … w52" and DIFF-1 records "price 19.8 → 14.4". So the mobile override should become `font-size: var(--h4);` (= --h4-mobile = 14.4px, modes.css:89). If only the desktop line is changed, the mobile override becomes redundant-but-wrong rather than harmless — fixing both keeps the pair consistent with the drawn scale.

### Spec panel rows have no gap between them. Figma's panel is a column with gap 8, giving a 45px row pitch (37 row + 8 gap); the code stacks rows flush, pitch 37. Panel height comes out 381 instead of the drawn 417.

- **Severity** — missing
- **Figma** — column gap 8 (stack-sm); six rows at local y = 91, 136, 181, 226, 271, 316, pitch 45 (57:266/57:268). Mobile pitch 36 = 28 + 8 (58:345)
- **Code** — .pv-spec-list has margin: 0 and no row gap — src/components/customer/SpecTable.astro:56-58
- **Fix** — In C:/Users/MD/Desktop/WebScraber/src/components/customer/SpecTable.astro, make the list an explicit column with the drawn gap (8 at both breakpoints, so no media-query override is needed): .pv-spec-list { margin: 0; display: flex; flex-direction: column; gap: var(--stack-sm); } Adjacent, not part of this claim but visible in the same height maths: `.pv-spec-title` uses `margin-bottom: var(--stack-md)` (12) where the Figma panel's own column gap puts 8 between the heading and the first row (title at y=64 h19, first row at y=91). Dropping that margin and letting the panel itself be a column with `gap: var(--stack-sm)` would settle both spacings from one declaration.

### Product description type size (desktop). Figma uses Body L; the code inherits the 13px body base because no font-size is set.

- **Severity** — wrong-value
- **Figma** — 57:253 Body L Inter 400 / 15px / lh 1.65 / #403F3C
- **Code** — .pv-detail-desc sets only color: var(--ink-soft); inherits var(--text-base) = 13px — src/pages/[slug]/[productId].astro:238-240
- **Fix** — In src/pages/[slug]/[productId].astro, give the rule the missing size token: .pv-detail-desc { font-size: var(--text-lg); color: var(--ink-soft); } (equivalently, drop the bespoke class and reuse the existing .pv-lede primitive, which is exactly these two declarations.) Note that Figma's M3 description (58:344) is Body 13px, so to keep the mobile frame right add a step-down inside the file's existing @media (max-width: 767px) block (lines 262-297): .pv-detail-desc { font-size: var(--text-base); }

### G3 header wordmark step. The spec calls this out explicitly — G3's header is 148 tall (not G2's 152) precisely because the right-hand wordmark is H4, not H3. The shared PreviewHeader hard-codes pv-h3 for both screens.

- **Severity** — wrong-value
- **Figma** — 57:229 'Serio Ludere' H4 Inter 700 / 16.2px (G2's 53:36 is H3 19.8px)
- **Code** — <a class="pv-wordmark pv-h3"> → var(--h3) = 19.8px — src/components/customer/PreviewHeader.astro:27
- **Fix** — In src/components/customer/PreviewHeader.astro, change the wordmark in the `back` (detail) branch on line 27 from `class="pv-wordmark pv-h3"` to `class="pv-wordmark pv-h4"`, leaving the catalog branch on line 33 at `pv-h3`. The `.pv-h4` class already exists at src/styles/preview.css:92 (`font-size: var(--h4)` → `--size-h4: 16.2px`), so no new CSS is needed and the mobile rule `.pv-header .pv-wordmark { font-size: var(--h4) }` (preview.css:298) stays consistent. Then correct the now-wrong comments: PreviewHeader.astro:4 ("One row, 152 tall on desktop") should note 152 for the catalog header and 148 for the detail header, since the H4 wordmark's 19px box makes 64+19+64+1 = 148; and the comment at preview.css:194 should say the same.

### Gap between the 'Specification' heading and the first spec row.

- **Severity** — wrong-value
- **Figma** — 8 (panel column gap, stack-sm): heading ends local y=83, first row at y=91 (57:266)
- **Code** — .pv-spec-title { margin-bottom: var(--stack-md) } → 12px — src/components/customer/SpecTable.astro:54
- **Fix** — In C:/Users/MD/Desktop/WebScraber/src/components/customer/SpecTable.astro, change .pv-spec-title's margin-bottom from var(--stack-md) to var(--stack-sm) so the heading-to-first-row gap is 8px, matching the panel's declared column gap at both 1440 and 390 (Figma 57:266 and 58:345). No mobile override is needed since Figma keeps the panel stack gap at 8 on mobile.

### Section rhythm at 390. DIFF-2 states the 64 section gap is unchanged at both breakpoints (M3 stack 58:326: header h52, hero at y=116 → 64); the code tightens it to 40.

- **Severity** — wrong-value
- **Figma** — column gap 64 and 64 from the header to the hero (58:326)
- **Code** — .pv-main { gap: 40px; padding-top: 40px } — src/styles/preview.css:303-304
- **Fix** — In src/styles/preview.css, inside `@media (max-width: 767px)`, restore the 64 rhythm and correct the comment. Replace lines 302-305 with `.pv-main { gap: var(--space-64); padding-top: var(--space-64); }` — use `--space-64` from modes.css, not `--section-gap`, because modes.css:409 remaps `--section-gap` to `--space-24` for preview mode below 767. Then amend the block comment at preview.css:286-288 to drop "and the section rhythm tightens", e.g. "...the header shrinks to 52 with the wordmark one step down the scale, but the 64 section rhythm is unchanged (Figma 58:326: header h52, hero at y=116)." If the tightening was in fact wanted, record it in docs/ADR.md D18 as a deviation with its reason instead.

### Gap between the info block and the spec panel at 390.

- **Severity** — wrong-value
- **Figma** — 64 — info block 58:341 at y=668 h124 ends 792, spec 58:345 at y=856
- **Code** — .pv-body { gap: var(--section-gap) } which is --space-24 = 24px at ≤767 — src/pages/[slug]/[productId].astro:276
- **Fix** — In C:/Users/MD/Desktop/WebScraber/src/pages/[slug]/[productId].astro, inside the `@media (max-width: 767px)` block (line 274-278), stop letting the info→spec gap collapse to the intra-section token. Figma treats the info block (58:341) and spec panel (58:345/58:346) as peer sections of the M3 stack, 64 apart: .pv-body { flex-direction: column; gap: var(--space-64); /* M3 58:326 — the 390 stack keeps the 64 section rhythm (DIFF-2) */ padding: 0 var(--stack-lg); } If the intent is instead to keep the project's tightened mobile rhythm, use the same step `.pv-main` uses (40px / `var(--space-40)`) rather than 24, and record the deviation in docs/ADR.md D18 alongside the other three — as written, the two blocks sit closer together than any two sections on the page, which is what makes it read as an accident rather than a decision.

### Product title size at 390. Figma uses Mobile/H2 (18px); the code steps it down to H3, which resolves to 16.2 at this breakpoint.

- **Severity** — wrong-value
- **Figma** — 58:342 'Kashan — hand-knotted wool' Mobile/H2 Inter 700 / 18px
- **Code** — .pv-detail-text .pv-h1 { font-size: var(--h3) } → --h3-mobile = 16.2px — src/pages/[slug]/[productId].astro:286
- **Fix** — In src/pages/[slug]/[productId].astro, inside the @media (max-width: 767px) block, change the product-title override from --h3 to --h2 so it lands on the drawn 18px (--h2 resolves to --h2-mobile = --size-h2-min = 18px at ≤767px): .pv-detail-text .pv-h1 { font-size: var(--h2); } Note this is only the title. The adjacent `.pv-price { font-size: var(--h3) }` at line 288-290 is a separate, still-unverified question: Figma 151:37 draws the M3 price as Mobile/H4 14.4px, while --h3 gives 16.2px — worth checking as its own claim, not part of this fix.

### Price size at 390. Figma uses Mobile/H4 (14.4px); the code's H3 resolves to 16.2.

- **Severity** — wrong-value
- **Figma** — 151:37 '$4,850' Mobile/H4 Inter 700 / 14.4px, w52
- **Code** — .pv-price { font-size: var(--h3) } → --h3-mobile = 16.2px — src/pages/[slug]/[productId].astro:289
- **Fix** — In src/pages/[slug]/[productId].astro, change the mobile override at line 288-290 from `.pv-price { font-size: var(--h3); }` to `.pv-price { font-size: var(--h4); }` — inside @media (max-width: 767px) that resolves via --h4-mobile -> --size-h4-min to the drawn 14.4px. Also correct the desktop base at line 233-237 from `font-size: var(--h1)` (28.8px) to `font-size: var(--h3)` (--size-h3: 19.8px) to match the desktop price row; the mobile `var(--h4)` override is still required after that, since --h3 at mobile falls to 16.2px, not 14.4px.

### Spec row VALUE size at 390. DIFF-1 maps spec value 13 → 12 on mobile; the code has no mobile override so it stays at 13.

- **Severity** — wrong-value
- **Figma** — 58:348 value Body S Inter 400 / 12px (desktop 13px)
- **Code** — dd { font-size: var(--text-base) } = 13px at every width; the ≤767 block overrides only gap, padding-block and dt width — src/components/customer/SpecTable.astro:72, 76-87
- **Fix** — In src/components/customer/SpecTable.astro, inside the `@media (max-width: 767px)` block (lines 76-87), add the value override: `.pv-spec-row dd { font-size: var(--text-sm); }` (--text-sm = 12px), leaving the desktop rule at line 72 as `var(--text-base)`.

### 'Specification' heading size at 390. The spec notes M3 deliberately keeps the DESKTOP h4 token, and DIFF-1 lists it as unchanged across breakpoints; the code's --h4 drops to --h4-mobile at ≤767.

- **Severity** — wrong-value
- **Figma** — 58:347 'Specification' H4 Inter 700 / 16.2px
- **Code** — <p class="pv-h4 pv-spec-title"> → var(--h4) = --h4-mobile = 14.4px at ≤767 — src/components/customer/SpecTable.astro:25 (token at src/styles/modes.css:416)
- **Fix** — Pin the spec-panel heading to the desktop H4 step at mobile instead of letting the mode token drop. In src/components/customer/SpecTable.astro, inside the existing `@media (max-width: 767px)` block, add: `.pv-spec-title { font-size: var(--size-h4); }` (--size-h4 is 16.2px and is mode/breakpoint-invariant, declared at modes.css:88). Alternatively, if the 14.4px step is actually wanted, record it as a deviation in docs/ADR.md D18 and note it in a comment. Note the same --h4 drift affects the header wordmark (src/styles/preview.css:299) and the footer wordmark (src/components/customer/PreviewFooter.astro:14), which Figma also draws at 16.2 on M2 (58:233, 131:294) — worth fixing in the same pass.

### Vertical gap inside the info block at 390 (title → price row → description).

- **Severity** — wrong-value
- **Figma** — 58:341 column gap 12 (stack-md): title h22 ends y=22, price row at y=34; price row h36 ends 70, description at y=82
- **Code** — .pv-detail-text { gap: var(--stack-lg) } → 16px — src/pages/[slug]/[productId].astro:283
- **Fix** — In C:/Users/MD/Desktop/WebScraber/src/pages/[slug]/[productId].astro at line 283, inside the @media (max-width: 767px) `.pv-detail-text` rule, change `gap: var(--stack-lg);` to `gap: var(--stack-md);` so the 390 info block stacks title -> price row -> description at the drawn 12px (matching Figma 58:341's 124px block height) instead of 16px.

### Unit toggle segment padding at 390. The mobile variant keeps the desktop 12px inline padding (that is what makes the segments 45 and 40 wide, 85 total); the code halves it to 8, yielding ~71.

- **Severity** — wrong-value
- **Figma** — 131:299 segment 1 45x36 with text at (12,8); segment 2 40x36 with 'ft' at (12,8) — padding-inline 12, same as desktop
- **Code** — @media (max-width:767px) .pv-seg button { padding-inline: var(--stack-sm) } → 8px — src/components/customer/PreviewControls.astro:132-134
- **Fix** — In src/components/customer/PreviewControls.astro, delete the `.pv-seg button { padding-inline: var(--stack-sm); }` rule from the `@media (max-width: 767px)` block (lines 132-134) so the mobile segments inherit the base `padding-inline: var(--stack-md)` (12px), reproducing the drawn 45 + 40 = 85 toggle at 390. Keep the `.pv-controls { gap: var(--stack-sm); }` override and the ft/in -> ft label swap, both of which match the frames. If a note is wanted, extend the existing comment to say the inline padding stays 12 at both breakpoints and only the label abbreviates.

### Currency picker chevron stroke colour.

- **Severity** — wrong-value
- **Figma** — 130:291 'Icon / Chevron Down' 16x16 at (46,10), 1px stroke bound to text/primary = #000000
- **Code** — .pv-select svg { color: var(--ink-soft) } → #403F3C — src/components/customer/PreviewControls.astro:118
- **Fix** — In C:/Users/MD/Desktop/WebScraber/src/components/customer/PreviewControls.astro, change the chevron rule at line 113-120 from `color: var(--ink-soft);` to `color: var(--ink);` so the 16px chevron strokes #000000 (text/primary), matching the Figma binding and the trigger label beside it — or simply drop the `color` declaration and let it inherit currentColor from the select's `var(--ink)`, which is how the design-system twin (.currency__trigger in src/styles/components.css:819) already does it.

### M3 header renders the 'Serio Ludere' wordmark. DIFF-3 item 6: M3 drops it (desktop 57:229 keeps it, M2 58:233 keeps it).

- **Severity** — extra
- **Figma** — 58:327 — only '← Back' plus a flex-1 spacer; no wordmark node
- **Code** — PreviewHeader always emits the wordmark in the `back` branch; the ≤767 block only restyles it — src/components/customer/PreviewHeader.astro:27, src/styles/preview.css:298-300
- **Fix** — Hide the detail-header wordmark at the mobile breakpoint. In PreviewHeader.astro mark the back-branch wordmark so it can be targeted (e.g. `class="pv-wordmark pv-h3 pv-wordmark-trailing"`), then in src/styles/preview.css inside the existing `@media (max-width: 767px)` block add `.pv-header .pv-wordmark-trailing { display: none; }` (leaving the M2 catalog wordmark, which keeps its `font-size: var(--h4)` override, untouched). Note DIFF-3 item 6 also covers the M3 header's missing `border-bottom` and item 7 the shortened '← Back' label — both are separate from this fix and handled elsewhere.

### M3 header carries a bottom hairline. DIFF-3 item 6: unlike M2 and unlike desktop G3, M3 has no border-bottom.

- **Severity** — extra
- **Figma** — 58:327 — no border-bottom
- **Code** — .pv-header { border-bottom: var(--rule-width) solid var(--rule) } at every width — src/styles/preview.css:200
- **Fix** — Scope the hairline so the detail header loses it at 390. In src/components/customer/PreviewHeader.astro line 19, tag the detail variant: `<header class:list={['pv-header', back && 'pv-header--detail']}>`. Then in src/styles/preview.css, inside the existing `@media (max-width: 767px)` block (after the `.pv-header { padding: var(--stack-lg); }` rule around line 294), add: `.pv-header--detail { border-bottom: 0; }` with a short comment noting Figma 58:327 drops the rule on the mobile detail header while M2 (58:232) and desktop G3 (57:226) keep it. Desktop G3 is unaffected because the override is inside the mobile query. If the shared hairline is preferred instead, record it as a deliberate deviation in docs/ADR.md D18 rather than leaving it undocumented.

### Back-link copy at 390. DIFF-3 item 7: the label shortens on mobile.

- **Severity** — wrong-value
- **Figma** — 58:328 '← Back' (43x20); desktop 57:227 '← Back to the collection'
- **Code** — label: 'Back to the collection' passed unconditionally, no responsive variant — src/pages/[slug]/[productId].astro:74
- **Fix** — Give PreviewHeader a mobile variant using the same pattern PreviewControls already uses. In src/components/customer/PreviewHeader.astro widen the prop to `back?: { href: string; label: string; shortLabel?: string }` and render both spans, keeping the full label as the accessible name: <a class="pv-back" href={back.href} aria-label={back.label}> <span aria-hidden="true">←</span> <span class="pv-back-long" aria-hidden="true">{back.label}</span> {back.shortLabel && <span class="pv-back-short" aria-hidden="true">{back.shortLabel}</span>} </a> and in the component's <style> mirror the PreviewControls rules: .pv-back-short { display: none; } @media (max-width: 767px) { .pv-back-long { display: none; } .pv-back-short { display: inline; } } Then at src/pages/[slug]/[productId].astro:74 pass `back={{ href: `/${slug}`, label: 'Back to the collection', shortLabel: 'Back' }}`. Add a comment citing Figma 57:227 / 58:328 and DIFF-3 item 7, matching the style of the existing Unit Toggle comment. Leave the in-page fallback link at line 97 ('Back to the collection' inside .pv-state) unchanged — it is body copy, not the header element the Figma frames measure.

### The reaction row with the 'You liked this rug' note renders at 390. DIFF-3 item 2: it has no M3 counterpart — M3 shows Like/Dislike only inside the hero.

- **Severity** — extra
- **Figma** — 57:254 is desktop-only; M3 info block 58:341 contains title, price row and description only
- **Code** — <div class="pv-react-row"> with Reactions + [data-react-note], no ≤767 suppression — src/pages/[slug]/[productId].astro:150-153
- **Fix** — Suppress the row at 390 in the existing @media (max-width: 767px) block of C:/Users/MD/Desktop/WebScraber/src/pages/[slug]/[productId].astro (after the .pv-price-row rule, ~line 293): /* M3 (58:341) carries title, price row and description only — the reaction pair lives solely in the hero at 390, so the duplicate row is dropped. */ .pv-react-row { display: none; } This also removes the duplicate Like/Dislike control pair at mobile. src/scripts/votes.ts:101 resolves the note with `g.parentElement?.querySelector('[data-react-note]')`, scoped to the group being updated, so the hero group keeps working unchanged.

### The 96x120 thumbnail strip renders at 390. DIFF-3 item 1: it has no M3 counterpart — the slot holds an empty 40px frame.

- **Severity** — extra
- **Figma** — 57:242 is desktop-only; M3 has 58:366, a 390x40 frame with no fill, no children, no border
- **Code** — the <section class="pv-wrap"> thumbnail strip has no mobile suppression; .pv-thumb keeps 96x120 at every width — src/pages/[slug]/[productId].astro:118-134, 194-203
- **Fix** — Give the strip section its own hook and suppress it at the mobile breakpoint, so the 390 layout matches 58:366's empty slot. 1. src/pages/[slug]/[productId].astro line 119: `<section class="pv-wrap">` → `<section class="pv-wrap pv-thumbwrap">`. 2. In the same file's `@media (max-width: 767px)` block (lines 262–297) add: `css /* Figma M3 (58:366) drops the strip at 390 — the slot is an empty 40px frame. */ .pv-thumbwrap { display: none; } ` Hide the section, not just `.pv-thumbs`: an empty flex item would still draw one 40px `.pv-main` gap on top of its own. If the strip is instead wanted at 390 on purpose — real rugs carry up to 12 photos where the mock carries one, and the hero has no other way to reach them — then leave the code as is and record it as a fourth deliberate deviation under ADR D18, since today nothing in the repo says the divergence was chosen.

## Token conformance

### Mobile section rhythm is hardcoded to 40px in .pv-main, and the value itself is wrong — Figma keeps the 64 stack gap at 390. Should be var(--section-gap) (or var(--space-section)), not a literal.

- **Severity** — wrong-value
- **Figma** — M2 inner stack 58:231 / M3 58:326: column gap 64; DIFF-2 note states "Section gap 64 everywhere, both breakpoints"
- **Code** — src/styles/preview.css:303-304 — `gap: 40px; padding-top: 40px;` inside @media (max-width: 767px)
- **Fix** — Delete the `.pv-main` override from the 390 media query in src/styles/preview.css (lines 302-305) entirely — the base rule at preview.css:220-224 already uses `var(--section-gap)`, which still resolves to 64px at 390 in the preview realm, so removing the override yields the Figma value with no new declaration. If an explicit rule is preferred for readability, write `.pv-main { gap: var(--section-gap); padding-top: var(--section-gap); }` instead of the literals — never `40px`. Also correct the now-stale clause in the comment at preview.css:286-288: drop "and the section rhythm tightens", since the section rhythm is 64 at both breakpoints (DIFF-2); the gutter (48→16) and header (152→52) claims in that comment are accurate and should stay.

### Thumbnail selected state hardcodes a hex and a border width that both exist as semantics (--border-strong = #1c1c1c, --border-width-focus = 2px).

- **Severity** — token-literal
- **Figma** — 57:243 thumb 1 selected: border 2px solid #1C1C1C, explicitly bound to border/width-focus + border/strong
- **Code** — src/pages/[slug]/[productId].astro:205 — `border: 2px solid #1c1c1c;`
- **Fix** — In src/pages/[slug]/[productId].astro, replace line 205 inside the `.pv-thumb.is-on` rule: `border: 2px solid #1c1c1c;` becomes `border: var(--border-width-focus) solid var(--border-strong);`. Computed output is unchanged (2px #1c1c1c under data-mode="preview"), it matches the Figma binding for 57:243, and it mirrors the existing correct usage at src/styles/components.css:1507.

### Invented letter-spacing on the Label style. Figma sets tracking to 0 on every run in this file; 0.02em is not drawn and has no token. Note the same file's .pv-select select correctly uses 0, so the two label surfaces disagree.

- **Severity** — wrong-value
- **Figma** — TOKENS note: heading letter-spacing 0; body letter-spacing 0. Label runs (53:20 button, 130:280 'Contact', 57:268 spec keys) carry no tracking
- **Code** — src/styles/preview.css:105 (.pv-label) and :178 (.pv-btn) — `letter-spacing: 0.02em;`; src/components/customer/PreviewControls.astro:73 — same, vs :109 `letter-spacing: 0`
- **Fix** — Drop the invented tracking so every Label surface matches Figma (0) and the repo's own controls.css: in src/styles/preview.css change line 105 (.pv-label) and line 178 (.pv-btn) from `letter-spacing: 0.02em;` to `letter-spacing: 0;` (or delete the declarations and let the 0 default stand, matching .pv-h3/.pv-h4), and in src/components/customer/PreviewControls.astro change line 73 (.pv-seg button) from `letter-spacing: 0.02em;` to `letter-spacing: 0;` so it agrees with .pv-select select at line 109.

### The footer contact column gets an extra 16px margin on top of the row's own 16px gap, so the drawn 16 gap renders as 32 — and the 16 is a literal where --stack-lg belongs.

- **Severity** — wrong-value
- **Figma** — 130:275 footer inner row: gap 16 (stack-lg); col 1 w300 at x=0, col 2 at x=316 → 16px between them
- **Code** — src/components/customer/PreviewFooter.astro:30 — `margin-left: 16px;` on .pv-footer-contact, added to `gap: var(--stack-lg)` at src/styles/preview.css:239
- **Fix** — Delete the `<style>` block in src/components/customer/PreviewFooter.astro (lines 28-37) entirely — both the `.pv-footer-contact { margin-left: 16px; }` rule and its `@media (max-width: 767px)` reset, which exists only to undo it. `.pv-footer-row`'s `gap: var(--stack-lg)` (src/styles/preview.css:239) then supplies the single 16px the Figma row draws between column 1 and column 2, and `.pv-footer-fine { margin-left: auto; }` keeps the fine print pushed right as the transparent spacer 130:282 does. The `pv-footer-contact` class can stay on the div as a hook or be dropped with the styles. If a deliberate extra offset is ever wanted, it should be `margin-left: var(--stack-lg);` rather than a literal, and recorded in docs/ADR.md D18 alongside the other named deviations.

### Spec panel title gap is 12 where the panel's auto-layout gap is 8, at both breakpoints.

- **Severity** — wrong-value
- **Figma** — 57:266 Specification panel: column, gap 8 (stack-sm); 58:345 mobile panel: column, gap 8
- **Code** — src/components/customer/SpecTable.astro:54 — `margin-bottom: var(--stack-md);` (12px); should be var(--stack-sm)
- **Fix** — In C:/Users/MD/Desktop/WebScraber/src/components/customer/SpecTable.astro line 54, change `margin-bottom: var(--stack-md);` to `margin-bottom: var(--stack-sm);` so the title sits 8px above the first spec row, matching the panel's gap-8 auto-layout at both 1440 and 390 (no mobile override is needed, since Figma uses 8 at both).

### Detail price reads the wrong heading semantic at both breakpoints: --h1 (28.8) desktop where Figma binds H3 (19.8), and --h3 (16.2 at ≤767) where Figma binds Mobile/H4 (14.4).

- **Severity** — wrong-value
- **Figma** — 151:15 price row: '$4,850' H3 Inter 700 / 19.8px; 151:37 mobile: Mobile/H4 Inter 700 / 14.4px
- **Code** — src/pages/[slug]/[productId].astro:234 — `font-size: var(--h1);` and :289 — `font-size: var(--h3);`
- **Fix** — In C:/Users/MD/Desktop/WebScraber/src/pages/[slug]/[productId].astro, drop the price one heading step at each breakpoint — both targets already exist as tokens in the preview scale: line 234: `font-size: var(--h1);` -> `font-size: var(--h3);` (resolves to --size-h3 = 19.8px, matching 151:15) line 289: `font-size: var(--h3);` -> `font-size: var(--h4);` (at <=767 --h4 = --h4-mobile = --size-h4-min = 14.4px, matching 151:37) Note the mobile override is still required after the desktop fix: without it `--h3` at <=767 would resolve to 16.2, so the `@media (max-width: 767px)` rule must move to `--h4` rather than be deleted.

### The liked-chip count is dimmed with a literal 0.65 opacity that matches no token and is not drawn — the tag label is a single run in one colour.

- **Severity** — extra
- **Figma** — 53:59 tag '♡ Liked 38': Body S Inter 400 / 12px / lh 1.65, one fill (#000000 default / #FFFFF5 selected), no opacity
- **Code** — src/components/customer/TagFilters.astro:81 — `opacity: 0.65;`
- **Fix** — In C:/Users/MD/Desktop/WebScraber/src/components/customer/TagFilters.astro delete the `opacity: 0.65` declaration (line 81) so the count inherits the chip's label fill — #000000 on the default chip, #FFFFF5 when selected — matching the single-fill Body S label of Figma 53:59. Keep the `<span class="pv-chip-count" data-liked-count>` element: src/scripts/filters.ts:46 queries `[data-liked-count]` to write the per-visitor count, and tests/unit/preview-scripts.test.ts and tests/integration/customer-pages.test.ts:179 assert on it. Either drop the whole rule or reduce it to `.pv-chip-count { color: inherit; }`. If the studio actually wants a quieter count, it should be recorded as a deviation in docs/ADR.md D18 and expressed with a token rather than a literal.

---

## Counts

| Severity      | Count  |
| ------------- | ------ |
| wrong-value   | 42     |
| missing       | 2      |
| extra         | 7      |
| token-literal | 1      |
| **total**     | **52** |
