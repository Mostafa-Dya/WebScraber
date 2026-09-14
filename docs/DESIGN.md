# DESIGN.md — "Folio": the editorial spread (final implementation spec)

Serio Ludere catalogue · design pass on index, cards, detail page, images, skeletons, motion and
page transitions. Base direction: **FOLIO** (winner, 3/3 judges). Grafted from the other two:
naming the plate box for the morph, price + rating on one line, loading-vs-missing states,
`pageshow` vote repaint, enquiry links (mono text links, not buttons), second-photo quick view (P2),
tab-count contrast fix, "n rugs shown" live region, Try-again on 503, prev/next pager, contact
shadow on hover, direction-aware root transition, delegated capture-phase `load` listener,
IntersectionObserver-gated shimmer, `aria-pressed` thumbs. Dropped as infeasible or flagged:
Astro `<ClientRouter />` and every `transition:*` directive (unsupported under `security.csp`,
its styles are unhashed — verified), `rel=expect` reliance (Chrome-only nicety kept, not depended
on), `=w320`/`=w400` thumbnails (unverified lh3 size), `meta refresh` on 503, masthead
`view-transition-name`, parallax, count roll, pan/zoom lightbox, buy bar, black CTA buttons,
plinth band, animated `filter`, `Cache-Control` changes.

Every item is tagged **P0** (must ship), **P1** (should ship, same session) or **P2** (only if
time remains). P0 + P1 is the "few hours" budget; P2 is a separate half hour each.

Conventions used below: `→` = "becomes"; file paths are relative to the repo root; "plate" = the
beige box a photo sits in (`.photo` on cards, `.hero` on the detail page, `.thumb`, `.lb-stage`).

---

## 1. Design principles

1. **Same page, better rhythm.** Masthead, cm/ft + currency controls, collection tabs with counts,
   card grid, mono meta, vote pill: all stay where they are. The upgrade is air, hierarchy and
   photo handling — no new chrome, no new hues.
2. **The rug is an object on paper.** Every photo sits uncropped (`object-fit: contain`) on a
   uniform `--paper-deep` plate with the reference's drop-shadow; letterboxing reads as mount
   board, never as a bug. Placeholders are schematics of the rug's real proportions, not errors.
3. **Nothing bounces; things settle.** Fades, 8–14 px rises, a drawn hairline, one signature move
   (the clicked plate grows into the detail hero and shrinks back). Only `transform`/`opacity`
   animate; `filter`, `height`, `margin`, `box-shadow` never do.
4. **Honest loading.** Shimmer only where bytes are arriving; ghost grids only when the sheet is
   down; no fake delay on tab switch. `aria-busy` + visually-hidden text carry the state.
5. **Cache-exact, CSP-exact.** Every new element is a pure function of the snapshot (route cache
   untouched); no `style=""` attribute, no `define:vars`, no inline script besides `prepaint.js`;
   per-element variation goes through `data-*` attributes and JS-added classes or CSSOM writes.

---

## 2. Token additions — `src/styles/tokens.css`

Append below the untouched reference block (never edit the existing values):

```css
/* ---- Design pass (docs/DESIGN.md): additive tokens. The palette above is unchanged. ---- */
:root {
  /* radii: the brand is square; 2px only softens plate corners against the paper */
  --radius-1: 2px;
  --radius-pill: 999px;

  /* shadows */
  --shadow-plate: 0 10px 22px rgba(0, 0, 0, 0.18); /* the reference's drop-shadow, now named */
  --shadow-pill: 0 1px 2px rgba(0, 0, 0, 0.06), 0 6px 16px rgba(0, 0, 0, 0.06);
  --shadow-contact: radial-gradient(50% 50% at 50% 50%, rgba(0, 0, 0, 0.16), transparent 70%);

  /* easing */
  --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
  --ease-inout: cubic-bezier(0.76, 0, 0.24, 1);
  --ease-spring: cubic-bezier(0.34, 1.56, 0.64, 1);

  /* durations */
  --dur-1: 120ms;
  --dur-2: 240ms;
  --dur-3: 420ms;
  --dur-4: 560ms;
  --dur-vt: 480ms;
  --stagger: 45ms;

  /* skeleton */
  --sk-base: var(--paper-deep);
  --sk-sheen: rgba(255, 253, 242, 0.75);
  --sk-edge: var(--rule);

  /* plate ratio system (overridden per element by [data-ar] and .lead) */
  --plate: 3 / 4;
  --plate-n: 0.75; /* width ÷ height of --plate, as a number */

  /* surfaces derived from the palette (alpha only, no new hue) */
  --paper-90: rgba(255, 253, 242, 0.92);

  /* layout */
  --nav-h: 46px; /* measured into the same property by transitions.ts (CSSOM) */
  --measure: 46ch;
  --focus: 2px solid var(--accent);
}
```

Ratio buckets (also in tokens.css, so every stylesheet can use them). Seven symmetric buckets;
`view.ts plateRatio()` produces the value, the CSS turns it into both the ratio and its decimal:

```css
[data-ar='1-2'] {
  --plate: 1 / 2;
  --plate-n: 0.5;
}
[data-ar='2-3'] {
  --plate: 2 / 3;
  --plate-n: 0.6667;
}
[data-ar='3-4'] {
  --plate: 3 / 4;
  --plate-n: 0.75;
}
[data-ar='1-1'] {
  --plate: 1 / 1;
  --plate-n: 1;
}
[data-ar='4-3'] {
  --plate: 4 / 3;
  --plate-n: 1.3333;
}
[data-ar='3-2'] {
  --plate: 3 / 2;
  --plate-n: 1.5;
}
[data-ar='2-1'] {
  --plate: 2 / 1;
  --plate-n: 2;
}
```

Type scale in use (no new families): mono 10 / 10.5 / 11 / 11.5 / 13.5 / 16; Inter 13.5 / 14 /
15 / `clamp(20px, 2.2vw, 26px)`.

---

## 3. Index page and card

### 3.1 Files

- `src/styles/catalogue.css` stays **byte-identical** (parity record). Two new stylesheets override
  by cascade order: `src/styles/editorial.css` (layout, typography, components, placeholder art,
  ghost cards) and `src/styles/motion.css` (skeleton primitive, keyframes, hover/reveal
  transitions, view-transition rules, reduced-motion blocks). `Layout.astro` imports them after
  `catalogue.css`.
- Both are plain global CSS (no scoping needed; the class names are the contract). Never use
  `define:vars` anywhere — it emits `style=""` attributes that the hash CSP blocks.

### 3.2 Global (editorial.css) — P0

```css
:focus-visible {
  outline: var(--focus);
  outline-offset: 3px;
  border-radius: var(--radius-1);
}
nav#nav button:focus-visible {
  outline-offset: -4px;
} /* not clipped by the nav's overflow-x */
html {
  scroll-padding-top: calc(var(--nav-h) + 12px);
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
  border: 0;
}
```

### 3.3 Masthead — unchanged geometry (P0)

`header` padding stays `52px 5vw 26px`. The eyebrow reads **CATALOGUE on every page** (detail and
tag pages stop passing `eyebrow`; the collection/tag name moves into the page body), so the
masthead is a stable anchor under the root cross-fade. `.home:focus-visible` gets the global ring.

### 3.4 Collection tabs — `CollectionNav.astro` + `tabs.ts` (P0)

Markup keeps the tested contract (`<nav id="nav" role="tablist">`, one-line
`{t.name}<span class="n">{t.count}</span>`). Additions:

```html
<nav id="nav" role="tablist" aria-label="Collections">
  …buttons unchanged…
  <span class="ink" aria-hidden="true"></span>
</nav>
<section class="lede">
  {tabs.map(t => (
  <div class="standfirst" data-standfirst data-collection="{t.slug}" hidden="{t.slug" !="" ="active}">
    <p class="eyebrow">{t.name} · {t.count} {t.count === 1 ? 'rug' : 'rugs'}</p>
    {t.description &&
    <p class="lede-text">{t.description}</p>
    }
  </div>
  ))}
</section>
```

`NavTab` gains `description: string` (from `Collection.description`, already parsed; empty →
no `.lede-text`). All standfirsts ship in the one cached page; `prepaint.js` (see §9) and
`tabs.ts` toggle `hidden`.

CSS (a sticky element is a containing block for absolutely positioned children, so the ink bar
needs no extra wrapper):

```css
nav#nav {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--paper);
}
nav#nav .ink {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 2px;
  width: 100px;
  background: var(--accent);
  transform-origin: 0 50%;
  transform: scaleX(0);
  pointer-events: none;
}
nav#nav.has-ink .ink {
  transition: transform var(--dur-3) var(--ease-inout);
}
nav#nav.has-ink button.on {
  border-bottom-color: transparent;
} /* the bar replaces the underline */
nav button .n {
  font-size: 10px;
  opacity: 1;
  color: var(--ink-soft);
} /* was 9px @ .5 ≈ 2.3:1 */
nav button:hover {
  color: var(--ink);
  transition: color var(--dur-1);
}
.lede {
  padding: 34px 5vw 0;
}
.lede .lede-text {
  max-width: 52ch;
  margin-top: 12px;
  font: 400 15px/1.6 var(--body);
  color: var(--ink);
  text-wrap: pretty;
}
```

`bottom: 0`, not `-1px`: the nav is an overflow container and would clip a negative offset; the
buttons' own 2 px border sits inside the padding box, so `0` lands on the same pixel row.

`tabs.ts` changes (all CSSOM, CSP-safe):

- `placeInk(b)`: `ink.style.transform = \`translateX(${b.offsetLeft}px) scaleX(${b.offsetWidth / 100})\``.
On init: place first, then `requestAnimationFrame(() => nav.classList.add('has-ink'))`so the
first placement does not slide in from the left; re-place on`resize`(rAF-throttled) and after`document.fonts.ready`.
- `activate(slug, push, { animate })`: toggles `.on`/`aria-selected`/`tabindex`, toggles the
  standfirsts' `hidden`, toggles `[data-card]` hidden (through the Flip wrapper when `animate`,
  §7 F), places the ink, and mirrors the URL with
  `win.history.replaceState(win.history.state, '', url)` (state preserved — cheap insurance for
  scroll restoration; the existing test still passes because it inspects argument 2).
- On user activation only (click/keys): writes `${n} ${n===1?'rug':'rugs'} shown · ${name}` to
  `#grid-live` (a `.sr-only` `aria-live="polite"` element rendered by `RugGrid`) and adds
  `is-settled` to `#grid` (stops the CSS entrance from re-firing on later toggles, §7 A).
- GSAP warm-up: `nav.addEventListener('pointerenter', warm, { once: true })` and
  `focusin` likewise; `warm()` does nothing under `matchMedia('(prefers-reduced-motion: reduce)')`.

### 3.5 Grid — `RugGrid.astro` (P0)

```css
main {
  padding: 34px 5vw 96px;
}
.grid {
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 52px 32px;
}
@media (min-width: 700px) {
  .card.lead {
    grid-column: span 2;
  }
  .card.lead .photo {
    aspect-ratio: 3 / 2;
    --plate: 3 / 2;
    --plate-n: 1.5;
  }
}
footer {
  margin-top: 40px;
  padding: 34px 5vw 56px;
}
```

Props: `cards`, `rates`, `active`, `state`, new `error?: boolean` (503 branch, §6.5), new
`eager?: number` (index passes 4: the first four cards of the server-active tab render
`loading="eager"`, the first also `fetchpriority="high"`). Renders `<p id="grid-live" class="sr-only" aria-live="polite"></p>` before the grid.

**Lead card** (P1): `view.ts withLeads(cards)` moves the first `featured` rug of each collection
to the front of that collection's run and sets `lead: true` — only when the collection has ≥ 3
rugs **and** the rug's bucket is landscape or square (a portrait rug in a 3/2 plate would be
letterboxed). Lead-first ordering means the span-2 card is always the first visible card of its
tab, so `auto-fill` never leaves a hole and `grid-auto-flow: dense` (which breaks DOM/visual
order) is not needed. Leads exist on the index only (`RugGrid lead={false}` on tag pages; a mid-grid
span-2 in a mixed grid would hole). `siblings()`/`relatedCards()` (§4) use the same ordered list so
prev/next agree with the grid.

### 3.6 Card — `RugCard.astro` (P0)

Tested contract kept verbatim: `<div class="card" …>` (`class="card lead"` for leads — the
fixture never hits it), `<div class="photo"…>`, `<div class="ph">photo to come</div>` as the
**only** content of `.ph`, `class="like"`, `<div class="price"…>`, the rating string.

```html
<div class="card" data-card data-collection={slug} data-slug={card.slug} hidden={hidden}>
  <div class="photo" data-plate data-empty={card.photoUrl ? undefined : ''} data-alt={card.altPhotoUrl}>
    <RugPhoto src={card.photoUrl} alt={card.name} rot={card.rot} ar={card.ar}
              widthCm={card.widthCm} lengthCm={card.lengthCm} eager={eager} priority={priority} />
    <a class="photo-link" href={href} tabindex="-1" aria-hidden="true"></a>
    <VoteButtons rugId={card.id} name={card.name} />
  </div>
  <div class="nm"><a class="nm-link" href={href}>{card.name}</a></div>
  {hasMeta && <ul class="meta">…unchanged…</ul>}
  <div class="price-row">
    <div class="price" data-price data-usd={card.priceUsd ?? ''} hidden={!priceText}>{priceText}</div>
    <div class="rating" data-rating-for={card.id} hidden={!rating}>{rating}</div>
  </div>
</div>
```

New props: `eager?: boolean`, `priority?: boolean`, `related?: boolean` (omits `data-card` so
tabs/prepaint never touch related cards on the detail page), `lead` comes from `card.lead`.
`CardView` gains `ar: Bucket`, `featured: boolean`, `lead?: boolean`, `altPhotoUrl?: string`
(`driveImageUrl(photos[1], 800)` when a second photo exists). Make `ar`/`featured` optional in
the type (`ar?: Bucket` defaulting to `'3-4'`) so the existing test fixture type-checks.

Plate and text CSS (editorial.css):

```css
.card {
  gap: 12px;
}
.photo {
  background: var(--paper-deep);
  border-radius: var(--radius-1);
  isolation: isolate;
}
.photo img {
  filter: drop-shadow(var(--shadow-plate));
} /* static, never transitioned */
.photo::before {
  /* contact shadow, revealed on hover */
  content: '';
  position: absolute;
  left: 18%;
  right: 18%;
  bottom: 9%;
  height: 8%;
  z-index: 0;
  background: var(--shadow-contact);
  opacity: 0;
  scale: 0.9;
  pointer-events: none;
}
.nm {
  font-size: 15px;
}
.nm-link {
  background-image: linear-gradient(var(--accent), var(--accent));
  background-size: 0% 1px;
  background-repeat: no-repeat;
  background-position: 0 100%;
}
.price-row {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  margin-top: 6px;
}
.price {
  margin-top: 0;
}
.rating {
  margin-left: auto;
  line-height: 1.5;
}
```

Hover / focus (motion.css, `@media (hover: hover) and (prefers-reduced-motion: no-preference)`):

```css
.photo img {
  transition:
    translate var(--dur-3) var(--ease-out),
    opacity var(--dur-3) var(--ease-out);
}
.photo::before {
  transition:
    opacity var(--dur-3) var(--ease-out),
    scale var(--dur-3) var(--ease-out);
}
.card:hover .photo img,
.card:focus-within .photo img {
  translate: 0 -4px;
}
.card:hover .photo::before,
.card:focus-within .photo::before {
  opacity: 1;
  scale: 1;
}
.nm-link {
  transition: background-size var(--dur-2) var(--ease-out);
}
.card:hover .nm-link,
.card:focus-within .nm-link {
  background-size: 100% 1px;
}
.card.is-leaving .photo img {
  translate: 0 0;
}
```

The individual `translate` property composes with `.rot`'s `transform: translate(-50%,-50%) rotate(90deg)`
(individual transforms apply first), so one rule lifts rotated and unrotated photos alike. Under
reduced motion the hairline still appears (instantly) and nothing moves. `:focus-within` mirrors
hover so a keyboard user sees the same state; the `.photo-link` stays `tabindex="-1"` so each card
is one tab stop plus its two vote buttons.

### 3.7 Vote pill — `VoteButtons.astro` (markup unchanged) + `votes.ts` (P0)

```css
.like {
  padding: 2px;
  gap: 0;
  border: 1px solid var(--rule);
  background: var(--paper-90);
  backdrop-filter: blur(6px);
  box-shadow: var(--shadow-pill);
}
.like button {
  width: 32px;
  height: 32px;
  padding: 0;
  display: grid;
  place-items: center;
  border-radius: var(--radius-pill);
}
.like svg {
  width: 18px;
  height: 18px;
}
.like button:hover {
  color: var(--ink);
  background: var(--paper-deep);
}
.like button[aria-busy='true'] {
  opacity: 0.7;
}
.like button,
.like svg {
  transition:
    color var(--dur-1),
    background var(--dur-1),
    fill var(--dur-1);
}
```

`votes.ts`: in `onClick`, after computing `next`, add class `just` to the clicked button and remove
it on `animationend` (heart pop / dislike nod, §7 I; the class is only added on user clicks, so saved
votes painted at load never animate). `paintCounts()` restarts class `tick` on each `.rating` it
writes (remove, force reflow via `void el.offsetWidth`, add; removed on `animationend`). Add
`window.addEventListener('pageshow', e => { if (e.persisted) for (const [id, s] of Object.entries(readSaved(storage))) paint(id, s, doc) })`
inside `bindVotes` — fixes today's bfcache bug (like on the detail page, Back → stale heart).
Exported pure functions keep their signatures; tests unchanged plus two new ones (§10).

### 3.8 Rating — unchanged text contract

`ratingText()` output stays `4.6 · 23 votes` (hidden when 0). It now sits on the price line
(mono 11.5 `--ink-soft`, right-aligned). Detail page: same text in `.vote-row` next to the pill.

### 3.9 Tag page — `tags/[slug].astro` (P0)

Same grid (`lead={false}`, `eager={4}`). Header eyebrow → `Catalogue`. The sticky `#nav` row holds
`← Catalogue`; a `.lede` block shows the eyebrow `Tag · {name} · {n} rugs`. Cards on tag pages
render `showCollection` (P2: a one-line mono `card-collection` eyebrow above the name, because the
tab context is absent).

### 3.10 Empty catalogue / empty tag (P0)

`RugGrid` with `state` and no error: one centred `.plate-empty` (240 px wide, `data-plate data-empty data-ar="3-4"`, the placeholder art of §5.5) above the `.state` text. No shimmer.

---

## 4. Detail page — `src/pages/rugs/[slug].astro` (P0 unless marked)

The page becomes a two-page spread: photo plate left, sticky spec column right, related row
below. The page-level `<style>` moves into `editorial.css`. New components: `Gallery.astro`
(hero + caption + thumbs + `<dialog>`), `Specs.astro` (the `dl`), `RelatedRugs.astro`,
`Pager.astro`. Everything is a pure function of the snapshot → still one cached GET.

### 4.1 Structure

```html
<Layout title="…">
  <header rates />
  <!-- eyebrow: Catalogue -->
  <nav id="nav" class="nav-detail" aria-label="Breadcrumb">
    <a class="back" href="/?collection={collectionSlug}">← {Collection}</a>
    <Pager prev next index total />
    <!-- ‹ Prev · 3 / 5 · Next › -->
  </nav>
  <main class="detail">
    <Gallery card photos … />
    <!-- figure.stage + dialog#lightbox -->
    <aside class="info">
      <a class="eyebrow" href="/?collection={slug}">{Collection}</a>
      <h1 class="nm">{name}</h1>
      <div class="price" data-price data-usd hidden?>{price}</div>
      <div class="vote-row">
        <VoteButtons … />
        <div class="rating" data-rating-for hidden?>{rating}</div>
      </div>
      <Specs card />
      <!-- dl.specs -->
      {description &&
      <p class="desc">{description}</p>
      } {tags.length > 0 &&
      <ul class="tags" aria-label="Tags">
        …
      </ul>
      }
      <p class="enquire">
        <a href="{whatsapp}" target="_blank" rel="noopener">Enquire on WhatsApp</a>
        <a href="{mailto}">Email the studio</a>
        {!photoUrl && <a href="{askPhotos}">Ask for photos</a>}
      </p>
    </aside>
  </main>
  <RelatedRugs cards="{related}" collection … />
  <!-- only when related.length ≥ 1 -->
  <footer />
</Layout>
```

`view.ts` helpers (pure, unit-tested):

- `siblings(cards, slug)` → `{ index, total, prev?, next? }` within the same collection, in grid
  order (after `withLeads`). No wrap-around.
- `relatedCards(cards, slug, n = 4)` → same collection excluding self, starting after the current
  one and wrapping around; `[]` when none.
- `enquiryLinks(name, id)` → `{ whatsapp, mailto, askPhotos }`:
  `https://wa.me/525535760978?text=` + `encodeURIComponent("Hi Serio Ludere, I am interested in " + name + " (ref " + id + ").")`;
  `mailto:hello@serioludere.com?subject=` + `encodeURIComponent(name + " (ref " + id + ")")`;
  `askPhotos` = the same mailto with subject `Photos of <name> (ref <id>)`. Put the phone and email
  in `src/lib/studio.ts` and make `Footer.astro` read the same constants.

### 4.2 Layout

```css
.nav-detail {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
}
.nav-detail .back,
.pager a,
.pager span {
  padding: 12px 0;
  font: 500 11px/1 var(--mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-soft);
  text-decoration: none;
  white-space: nowrap;
}
.nav-detail .back:hover,
.pager a:hover {
  color: var(--accent);
}
.pager {
  display: flex;
  gap: 18px;
  align-items: center;
}
.pager .is-off {
  visibility: hidden;
} /* the slot stays, the row never jumps */

main.detail {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(300px, 5fr);
  column-gap: clamp(40px, 6vw, 88px);
  row-gap: 40px;
  padding: 40px 5vw 96px;
  align-items: start;
}
@media (max-width: 899px) {
  main.detail {
    grid-template-columns: 1fr;
    row-gap: 28px;
    padding-top: 24px;
  }
}
@media (min-width: 900px) and (min-height: 680px) {
  .info {
    position: sticky;
    top: calc(var(--nav-h) + 28px);
  }
}
```

`Pager.astro`: `<a rel="prev" href aria-label="Previous: {name}">‹ Prev</a>`, `<span class="pos">3 / 5</span>`,
`<a rel="next" …>Next ›</a>`; a missing neighbour renders `<span class="is-off" aria-hidden="true">‹ Prev</span>`.
Below 480 px hide the words and keep the glyphs (`.pager .word { display: none }`).

### 4.3 Left column — `Gallery.astro`

```html
<figure class="stage">
  <div class="hero" data-plate data-ar={card.ar} data-slug={card.slug} data-empty={photo ? undefined : ''}>
    <RugPhoto hero src={w800(photo)} full={w1600(photo)} alt={name} rot ar widthCm lengthCm eager priority />
    {photo && <button type="button" class="hero-open" aria-label="Open photo viewer"></button>}
  </div>
  <figcaption class="hero-cap" aria-live="polite">Photo 1 of 3 · click to enlarge</figcaption>   <!-- "No photo yet" when empty -->
  {photos.length > 1 && (
    <div class="thumbs" role="group" aria-label="Photos">
      {photos.map((p, i) => (
        <button type="button" class="thumb" data-plate aria-pressed={i === 0 ? 'true' : 'false'}
                aria-label={`Photo ${i + 1}`} data-i={i} data-src800={w800(p)} data-src1600={w1600(p)}>
          <img src={w800(p)} alt="" loading="lazy" decoding="async" data-rug-img data-plate-img data-rot={rot} />
        </button>
      ))}
    </div>
  )}
</figure>
<dialog id="lightbox" class="lb" aria-label="Photo viewer">
  <div class="lb-stage" data-plate data-ar={card.ar}></div>          <!-- gallery.ts inserts <img class="lb-img"> -->
  <button type="button" class="lb-close" aria-label="Close" autofocus>×</button>
  {photos.length > 1 && <button type="button" class="lb-prev" aria-label="Previous photo">‹</button>}
  {photos.length > 1 && <button type="button" class="lb-next" aria-label="Next photo">›</button>}
  <p class="lb-count" aria-live="polite"></p>
</dialog>
```

A `<button>` may not contain a `<div>`, so the hero stays a `div` with an invisible overlay button
(`.hero-open`); thumbs contain only an `<img>`.

```css
.hero {
  position: relative;
  width: min(100%, calc(72vh * var(--plate-n)));
  width: min(100%, calc(72svh * var(--plate-n)));
  aspect-ratio: var(--plate);
  margin-inline: auto;
  background: var(--paper-deep);
  border-radius: var(--radius-1);
  overflow: hidden;
  isolation: isolate;
}
.hero img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(var(--shadow-plate));
  z-index: 1;
}
.hero .hero-full {
  opacity: 0;
  z-index: 2;
}
.hero .hero-full.loaded {
  opacity: 1;
} /* 420 ms fade, motion.css */
.hero-open {
  position: absolute;
  inset: 0;
  z-index: 3;
  background: none;
  border: 0;
  cursor: zoom-in;
}
.hero-cap {
  margin-top: 12px;
  font: 400 10px/1.6 var(--mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-soft);
}
.thumbs {
  display: flex;
  gap: 10px;
  margin-top: 14px;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  padding: 3px;
}
.thumb {
  flex: 0 0 64px;
  aspect-ratio: 3 / 4;
  --plate: 3 / 4;
  --plate-n: 0.75;
  position: relative;
  overflow: hidden;
  background: var(--paper-deep);
  border: 1px solid var(--rule);
  border-radius: var(--radius-1);
  padding: 0;
  cursor: pointer;
  scroll-snap-align: start;
  isolation: isolate;
}
.thumb img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
}
.thumb[aria-pressed='true'] {
  border-color: var(--ink);
  box-shadow:
    0 0 0 2px var(--paper),
    0 0 0 3px var(--ink);
}
```

Behaviour (`src/scripts/gallery.ts`, imported by `Gallery.astro`'s `<script>`):

- Thumb click, or ← → Home End inside `.thumbs` (same keydown pattern as tabs.ts): `show(i)`
  creates a fresh pair `<img class="hero-base" data-rug-img data-plate-img …>` +
  `<img class="hero-full" data-rug-img …>` (base `src` = `data-src800`, full `src` = `data-src1600`
  plus `srcset`), appends them to `.hero`, and removes the previous pair 420 ms after the new base's
  `load` (immediately on error). The delegated `photos.ts` listeners handle `loaded`/`rot`/plate state,
  so the swap crossfades through the ordinary reveal; a cached base never shimmers. Updates
  `aria-pressed` and the caption.
- `.hero-open` click → `open(i)`: removes any old `.lb-img`, inserts
  `<img class="lb-img" data-rug-img data-plate-img data-rot src=w1600 alt={name}>`, writes the counter
  (`2 / 3`), calls `dialog.showModal()`. `‹ ›` buttons, `ArrowLeft/Right`, and a pointer swipe
  (`pointerdown` → `pointerup`, |dx| > 40 px) move; `Escape`, `.lb-close` and a backdrop click close.
  Focus returns to `.hero-open` natively. `html:has(dialog[open]) { overflow: hidden }`.

```css
.lb {
  border: 0;
  padding: 0;
  background: transparent;
  width: 100vw;
  height: 100svh;
  max-width: none;
  max-height: none;
}
.lb::backdrop {
  background: rgba(255, 253, 242, 0.96);
} /* paper room, not a black box */
.lb-stage {
  position: absolute;
  top: 50%;
  left: 50%;
  translate: -50% -50%;
  width: min(calc(100vw - 96px), calc((100svh - 96px) * var(--plate-n)));
  aspect-ratio: var(--plate);
  background: var(--paper-deep);
  border-radius: var(--radius-1);
  overflow: hidden;
  isolation: isolate;
}
.lb-img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: contain;
  filter: drop-shadow(var(--shadow-plate));
}
.lb-close,
.lb-prev,
.lb-next {
  position: absolute;
  width: 44px;
  height: 44px;
  display: grid;
  place-items: center;
  border: 1px solid var(--rule);
  background: var(--paper-90);
  border-radius: var(--radius-pill);
  font: 400 22px/1 var(--body);
  cursor: pointer;
}
.lb-close {
  top: 16px;
  right: 16px;
}
.lb-prev {
  left: 16px;
  top: 50%;
  translate: 0 -50%;
}
.lb-next {
  right: 16px;
  top: 50%;
  translate: 0 -50%;
}
.lb-count {
  position: absolute;
  left: 20px;
  bottom: 16px;
  font: 500 11px/1 var(--mono);
  letter-spacing: 0.12em;
  color: var(--ink-soft);
}
```

Because `.lb-stage` carries the same `data-ar` as the hero, the generic `.rot` rule (§5.3) rotates a
landscape file inside it with no extra maths.

### 4.4 Right column — `.info`

```css
.info {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.info .eyebrow {
  text-decoration: none;
}
.info h1.nm {
  font: 500 clamp(20px, 2.2vw, 26px)/1.25 var(--body);
  letter-spacing: -0.01em;
  max-width: 22ch;
}
.info .price {
  font-size: 16px;
  margin-top: 0;
}
.vote-row {
  display: flex;
  align-items: center;
  gap: 14px;
}
.vote-row .like {
  position: static;
} /* the same pill, in flow */
.specs {
  display: grid;
  grid-template-columns: 96px 1fr;
  margin-top: 6px;
  border-top: 1px solid var(--rule);
}
.specs dt {
  font: 500 10.5px/1 var(--mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-soft);
  padding: 13px 0;
  border-bottom: 1px solid var(--rule);
}
.specs dd {
  font: 400 13.5px/1.5 var(--body);
  padding: 10px 0;
  border-bottom: 1px solid var(--rule);
}
.desc {
  font: 400 15px/1.65 var(--body);
  max-width: var(--measure);
  text-wrap: pretty;
  margin-top: 6px;
}
.tags {
  list-style: none;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.tags a {
  display: inline-block;
  padding: 6px 10px;
  border: 1px solid var(--rule);
  border-radius: var(--radius-1);
  font: 500 10px/1 var(--mono);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--ink-soft);
  text-decoration: none;
}
.tags a:hover {
  color: var(--accent);
  border-color: var(--accent);
}
.enquire {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 20px;
  margin-top: 10px;
  padding-top: 16px;
  border-top: 1px solid var(--rule);
}
.enquire a {
  font: 500 11px/1.6 var(--mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink);
  text-decoration: none;
  border-bottom: 1px solid var(--ink);
}
.enquire a:hover {
  color: var(--accent);
  border-color: var(--accent);
}
```

`Specs.astro` renders one `dt`/`dd` pair per present value, in this order: Size
(`<dd data-dims data-w data-l>` so `prefs.ts` and `prepaint.js` keep re-rendering it), Material, Age,
Origin, Method, Reference (the rug id, mono — buyers quote it). The old `.meta` list is not rendered on
the detail page.

### 4.5 Related — `RelatedRugs.astro` (P1)

```html
<section class="related">
  <h2 class="eyebrow">More from {Collection}</h2>
  <div class="grid">{cards.map((c) => <RugCard card="{c}" rates="{rates}" related />)}</div>
  <a class="back-all" href="/?collection={slug}">← All {Collection}</a>
</section>
```

```css
.related {
  margin: 0 5vw;
  padding: 40px 0 72px;
  border-top: 1px solid var(--rule);
}
.related .grid {
  margin-top: 24px;
}
.related .back-all {
  display: inline-block;
  margin-top: 34px;
  font: 500 11px/1 var(--mono);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--ink-soft);
  text-decoration: none;
}
@media (max-width: 700px) {
  .related .grid {
    grid-auto-flow: column;
    grid-auto-columns: 72%;
    overflow-x: auto;
    scroll-snap-type: x mandatory;
    padding-bottom: 8px;
  }
  .related .card {
    scroll-snap-align: start;
  }
}
```

Related cards are ordinary `RugCard`s (`related` prop → no `data-card`): lazy images, working votes,
and their plates are morph candidates for the next click (§8).

### 4.6 404 and 503 on this route

404: `.state` text ("This rug is not in the catalogue.") with one empty plate (§3.10), no skeleton.
503: the spread skeleton — a `.hero.sk` plate (3/4) and seven `.sk-line` rows in the `.info` column,
all `aria-hidden="true"`, plus the `.state` message with a **Try again** link (§6.5).

---

## 5. Image treatment

### 5.1 Sizes and attributes (P0)

| Place                  | URL                                                                                                                                                                                                                             | Attributes                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Card                   | `=w800` only (a ≤ 300 px column at DPR 2 needs ≤ 600 px; one URL guarantees the hero base is an HTTP-cache hit)                                                                                                                 | `loading="lazy" decoding="async"`; first 4 of the active tab `loading="eager"`, the first also `fetchpriority="high"` |
| Hero base `.hero-base` | the card's exact `=w800` URL                                                                                                                                                                                                    | `loading="eager" fetchpriority="high" decoding="async" data-rug-img data-plate-img data-rot`                          |
| Hero full `.hero-full` | `src=w1600 srcset="…=w800 800w, …=w1600 1600w" sizes="(min-width: 900px) 55vw, 100vw"`                                                                                                                                          | `loading="eager" fetchpriority="low" decoding="async" data-rug-img data-rot`                                          |
| Thumb                  | `=w800` (photo 1 is cache-hot; the rest pre-warm hero swaps). `=w320` is **unverified** on lh3 (only w800/w1600 were probed), so `PhotoSize` stays `800 \| 1600`; P2: verify `=w320` via `scripts/check-photos.ts`, then switch | `loading="lazy" decoding="async"`                                                                                     |
| Lightbox               | `=w1600` (already fetched by the hero full layer)                                                                                                                                                                               | inserted by JS                                                                                                        |
| Quick-view alt (P2)    | `=w800` of photo 2                                                                                                                                                                                                              | created on hover intent                                                                                               |

`data-rug-img` = handled by photos.ts (loaded / rot / removed on error). `data-plate-img` = additionally
drives the enclosing `[data-plate]`'s state (pending / loaded / empty). The hero full layer and the
quick-view alt carry only `data-rug-img`, so they never shimmer a plate that already shows a picture.

### 5.2 Aspect-ratio boxes (zero CLS without sheet pixel sizes)

Every image lives in a box whose ratio is known before the first byte: cards `3/4` (lead `3/2`),
thumbs `3/4`, hero and lightbox `var(--plate)` from the rug's `data-ar` bucket, ghost plates `3/4`.
Images are `position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain` inside.
`contain` everywhere — rugs are objects; cropping a border is unacceptable — and the `--paper-deep`
plate makes letterboxing read as mount board.

`view.ts plateRatio(widthCm?, lengthCm?, rot): Bucket`:

```
displayed portrait  ⇐ rot === '1' (the sheet says portrait; a landscape file is turned)
                     or (rot !== '1' and lengthCm ≥ widthCm)
displayed landscape ⇐ otherwise
r = portrait ? min/max : max/min          (width ÷ height of the displayed photo)
unknown or zero dims ⇒ '3-4'
snap r to the nearest bucket in log space: 0.5 → '1-2', 0.667 → '2-3', 0.75 → '3-4', 1 → '1-1',
                                            1.333 → '4-3', 1.5 → '3-2', 2 → '2-1'
```

`rot === 'force'` cannot know the file's shape, so it uses the dims rule. When a photo's real
orientation contradicts the prediction (a portrait rug scanned landscape with no `rotate` flag), the
photo letterboxes in the predicted plate; the data fix is the sheet's own `rotate = TRUE`. P2:
`scripts/check-photos.ts` reports rugs whose photo orientation disagrees with their dims so the owner
can set it. There is no client-side ratio correction — it would be a layout shift.

### 5.3 Rotation (P0)

`src/lib/rotate.ts` and `data-rot` are untouched. One generic rule replaces the hard-coded
133.333 % / 75 % (same selector specificity, later in the cascade, identical numbers for 3/4):

```css
.photo img.rot,
.hero img.rot,
.thumb img.rot,
.lb-img.rot {
  position: absolute;
  top: 50%;
  left: 50%;
  inset: auto auto auto 50%;
  width: calc(100% / var(--plate-n));
  height: calc(100% * var(--plate-n));
  transform: translate(-50%, -50%) rotate(90deg);
  transform-origin: center;
}
```

(`inset: auto auto auto 50%` plus `top: 50%` undoes the `inset: 0` of the hero/thumb images.)
`photos.ts` adds `rot` **before** `loaded` in the same synchronous call, so with the reveal
(`is-pending` → opacity 0) the 90° turn is never seen. `RugPhoto` also renders `class="rot"`
server-side when `rot === 'force'` (known without the file). The lift and reveal use `translate` and
`opacity`, never `transform`, so they compose with the rotation.

### 5.4 Reveal-on-load and plate states — `src/scripts/photos.ts` (P0, rewrite)

Plate state classes on `[data-plate]`: `is-pending` (image requested, not yet decoded), `is-loaded`,
`is-empty` (no photo, or the photo failed). Server: `data-empty` when there is no src. `aria-busy="true"`
while pending, `"false"` otherwise — set by JS only (a server-rendered `true` would never flip for
no-JS visitors).

```ts
import { shouldRotate } from '../lib/rotate.ts';

const plateOf = (img: Element) => img.closest<HTMLElement>('[data-plate]');
function setState(plate: HTMLElement | null, s: 'pending' | 'loaded' | 'empty'): void {
  if (!plate) return;
  plate.classList.toggle('is-pending', s === 'pending');
  plate.classList.toggle('is-loaded', s === 'loaded');
  plate.classList.toggle('is-empty', s === 'empty');
  plate.setAttribute('aria-busy', s === 'pending' ? 'true' : 'false');
}
function onReady(img: HTMLImageElement): void {
  if (shouldRotate(img.dataset.rot, img.naturalWidth, img.naturalHeight)) img.classList.add('rot');
  img.classList.add('loaded'); // keeps catalogue.css's `img.loaded ~ .ph` rule working
  if ('plateImg' in img.dataset) setState(plateOf(img), 'loaded');
}
function onFail(img: HTMLImageElement): void {
  const plate = plateOf(img);
  const drives = 'plateImg' in img.dataset;
  img.remove();
  if (drives && plate && !plate.querySelector('img[data-plate-img]')) setState(plate, 'empty');
}
const isRug = (t: EventTarget | null): t is HTMLImageElement =>
  t instanceof HTMLImageElement && t.matches('img[data-rug-img]');

export function initPhotos(doc: Document = document): void {
  // `load`/`error` do not bubble but do capture: one listener covers current and future images.
  doc.addEventListener(
    'load',
    (e) => {
      if (isRug(e.target)) onReady(e.target);
    },
    true,
  );
  doc.addEventListener(
    'error',
    (e) => {
      if (isRug(e.target)) onFail(e.target);
    },
    true,
  );
  const io =
    typeof IntersectionObserver === 'function'
      ? new IntersectionObserver(
          (entries) => {
            for (const en of entries) {
              if (!en.isIntersecting) continue;
              io?.unobserve(en.target);
              const img = en.target as HTMLImageElement;
              if (!img.complete) setState(plateOf(img), 'pending');
            }
          },
          { rootMargin: '100% 0px' },
        )
      : null;
  doc.querySelectorAll<HTMLImageElement>('img[data-rug-img]').forEach((img) => {
    if (img.complete) {
      if (img.naturalWidth > 0) onReady(img);
      else if (img.src) onFail(img);
      return;
    }
    if (!('plateImg' in img.dataset)) return;
    if (io) io.observe(img);
    else setState(plateOf(img), 'pending');
  });
}
```

`RugPhoto.astro` keeps its `<script>` (Astro dedupes it per page, so `initPhotos` runs once);
`Gallery.astro` does not call it again. An image already complete when the module ran gets `is-loaded`
with no transition (its opacity never was 0), so nothing flashes. The IntersectionObserver gate (one
viewport ahead) limits simultaneous shimmer layers to what is near the viewport — from day one.

```css
/* reveal */
[data-plate].is-pending img[data-plate-img] {
  opacity: 0;
}
[data-plate].is-loaded img {
  opacity: 1;
}
/* loading vs missing are different states */
.photo .ph,
.hero .ph {
  border-color: transparent;
  background-image: none;
  color: transparent;
} /* silent block while loading */
[data-plate][data-empty] .ph,
[data-plate].is-empty .ph {
  border-color: var(--rule);
  color: var(--ink-soft);
  background-image:
    repeating-linear-gradient(0deg, transparent 0 3px, rgba(0, 0, 0, 0.035) 3px 4px),
    repeating-linear-gradient(90deg, transparent 0 3px, rgba(0, 0, 0, 0.035) 3px 4px);
}
```

### 5.5 Placeholder art for rugs without a photo (P0)

`RugPhoto` renders, before the `.ph`, a sibling `.ph-art` (shown only when the plate is empty):

```html
<div class="ph-art" aria-hidden="true" data-ar={ar}>
  <span class="ph-rug"></span>
  <span class="ph-dims" data-dims data-w={widthCm ?? ''} data-l={lengthCm ?? ''} hidden={!dimText}>{dimText}</span>
</div>
<div class="ph">photo to come</div>
```

`.ph` keeps exactly the tested text node; its caption moves to the bottom of the plate. `.ph-dims`
carries `data-dims`, so the unit toggle and prepaint re-render it for free (it is `aria-hidden`; the
accessible dims live in `.meta`/`.specs`).

```css
.ph-art {
  position: absolute;
  inset: 0;
  z-index: 0;
  display: none;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  pointer-events: none;
}
[data-plate][data-empty] .ph-art,
[data-plate].is-empty .ph-art {
  display: flex;
}
.ph-rug {
  width: min(64%, calc(74% * var(--plate-n)));
  aspect-ratio: var(--plate);
  border: 1px solid rgba(0, 0, 0, 0.18);
  outline: 1px solid rgba(0, 0, 0, 0.08);
  outline-offset: -5px;
}
.ph-dims {
  font: 400 10px/1 var(--mono);
  letter-spacing: 0.1em;
  color: var(--ink-soft);
}
[data-plate][data-empty] .ph,
[data-plate].is-empty .ph {
  align-items: flex-end;
  padding-bottom: 12%;
}
```

A 3/4 plate is 1.333 × as tall as wide, so `74% × plate-n` of the width ≈ 56 % of the height for
portrait buckets; landscape buckets hit the 64 % cap. `data-ar` on `.ph-art` scopes `--plate`/`--plate-n`
to the diagram; the card's `.photo` keeps 3/4 so `.rot` and the grid rhythm are unaffected. No shimmer
on placeholders: nothing is loading.

### 5.6 Second-photo quick view (P2)

In a 25-line `src/scripts/quickview.ts` (imported by `RugCard.astro`): under
`matchMedia('(hover: hover) and (pointer: fine)')` only, on a card's first `pointerenter` start a 150 ms
timer; if the pointer is still over the card, create
`<img class="alt" data-rug-img data-rot={rot} decoding="async" alt="">` with `src = photo.dataset.alt`
and append it to `.photo` (once per card). CSS: `.photo img.alt { position: absolute; inset: 0; opacity: 0; z-index: 1; }`
and `.card:hover .photo img.alt.loaded { opacity: 1; transition: opacity 280ms var(--ease-out); }`. The
alt never carries `data-plate-img`, so it never shimmers the plate.

---

## 6. Skeleton loaders

### 6.1 The one primitive — `motion.css` (P0)

```css
.sk,
[data-plate].is-pending {
  position: relative;
  overflow: hidden;
}
.sk {
  background: var(--sk-base);
  border: 1px solid var(--sk-edge);
  border-radius: var(--radius-1);
}
.sk::after,
[data-plate].is-pending::after {
  content: '';
  position: absolute;
  inset: 0;
  width: 60%;
  z-index: 2;
  pointer-events: none;
  background: linear-gradient(100deg, transparent 0%, var(--sk-sheen) 50%, transparent 100%);
  transform: translateX(-170%);
}
@media (prefers-reduced-motion: no-preference) {
  [data-plate].is-pending::after,
  .sk.is-live::after {
    animation: sk-sweep 1.6s var(--ease-inout) infinite;
  }
}
@keyframes sk-sweep {
  to {
    transform: translateX(270%);
  }
}
.sk-line {
  height: 12px;
  margin-top: 12px;
}
```

The sheen moves with `transform` (compositor-only); `background-position` is never animated. Under
reduced motion the block is a static beige plate with a hairline. The plate itself is decorative:
the state is carried by `aria-busy` and text (mono `--ink-soft` on `--paper-deep` ≥ 5:1).

### 6.2 Where skeletons appear

| Place                        | Shown when                                                                                          | Hidden when                                                                       | Markup / mechanism                                                                      |
| ---------------------------- | --------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Card, thumb, hero base plate | the plate's `data-plate-img` is requested but not decoded and the plate is within one viewport (IO) | `load` (→ `is-loaded`, image fades in) or `error` (→ `is-empty`, placeholder art) | `photos.ts` §5.4; `::after` sweep on `[data-plate].is-pending`                          |
| Hero full layer              | never shimmers separately — the base's pixels are better than a sweep                               | —                                                                                 | `.hero-full` fades in on its own `loaded`                                               |
| Lightbox stage               | `.lb-img` inserted and not yet complete (usually instant: w1600 is cached)                          | `load`                                                                            | same primitive on `.lb-stage`                                                           |
| Tab switch                   | **never** — all cards are in the DOM; a fake delay would be dishonest                               | —                                                                                 | Flip reflow is the feedback; entering cards with unloaded lazy images shimmer naturally |
| Navigation (old document)    | click on any same-origin link (§6.3)                                                                | the new document replaces it; on bfcache return `pageshow` clears it              | `html.is-navigating`, `.card.is-leaving`, `#progress`                                   |
| Detail arrival               | hero base not cached (deep link, cold cache)                                                        | base `load`                                                                       | the hero plate's own pending state                                                      |
| 503                          | sheet unreachable (`error` prop)                                                                    | —                                                                                 | static ghost grid / ghost spread, no sweep (§6.5)                                       |
| 404 / empty                  | —                                                                                                   | —                                                                                 | no skeleton; one empty plate + `.state`                                                 |

### 6.3 Navigation loading state — `src/scripts/transitions.ts` (P0)

There is no client router (§8), so "loading the next page" happens in the **old** document. On a
plain left-click of a same-origin `<a>` (no modifier keys, no `download`, no `target` other than
`_self`, not `defaultPrevented`): add `html.is-navigating`, add `is-leaving` to the enclosing `.card`
(if any), remember `a.href` in `lastHref` (Safari has no `e.activation`). `Layout.astro` renders
`<div id="progress" aria-hidden="true"></div>`.

```css
#progress {
  position: fixed;
  top: 0;
  left: 0;
  z-index: 50;
  width: 100%;
  height: 2px;
  background: var(--accent);
  transform: scaleX(0);
  transform-origin: 0 50%;
  pointer-events: none;
}
html.is-navigating #progress {
  transform: scaleX(0.7);
  transition: transform 1200ms var(--ease-out) 120ms;
}
html.is-navigating .card:not(.is-leaving) {
  opacity: 0.55;
  transition: opacity var(--dur-2) var(--ease-out);
}
```

The 120 ms grace means a route-cache HIT (≈ 50 ms) never shows the bar; a MISS that re-reads the
sheet does. A `pageshow` listener (§8.3) clears the classes and any `viewTransitionName` when
`event.persisted` is true, so a bfcache Back never lands on a dimmed page. Under reduced motion the
dim stays (opacity only) and the bar appears without its transition.

Equivalent in Astro's router vocabulary, for the record: this replaces wrapping `event.loader` in
`astro:before-preparation` / clearing in `astro:after-preparation`; those events do not exist here
because `<ClientRouter />` is not used (§8.1).

### 6.4 Detail-page arrival

The hero base is the card's cached `=w800`, so it paints at first render; if it is not cached the hero
plate shimmers until the base lands. The full layer fades over it when decoded. Thumbs shimmer as they
lazy-load. The spec column is real content — never a ghost.

### 6.5 503 and empty states — `RugGrid.astro` / `[slug].astro` (P0)

`RugGrid` gains `error?: boolean`. When set:

```html
<div id="state" class="state" role="status">
  {state} <a class="retry" href="{Astro.url.pathname" + Astro.url.search}>Try again</a>
</div>
<p class="sr-only">Loading catalogue</p>
<div class="grid ghost" aria-hidden="true">
  {Array.from({ length: 8 }, () => (
  <div class="card">
    <div class="sk sk-plate"></div>
    <div class="sk sk-line w60"></div>
    <div class="sk sk-line w40"></div>
    <div class="sk sk-line w30"></div>
    <div class="sk sk-line w20"></div>
  </div>
  ))}
</div>
```

```css
.ghost .sk-plate {
  aspect-ratio: 3 / 4;
}
.ghost .w60 {
  width: 60%;
}
.ghost .w40 {
  width: 40%;
}
.ghost .w30 {
  width: 30%;
}
.ghost .w20 {
  width: 20%;
  margin-top: 18px;
}
.state .retry {
  margin-left: 12px;
  color: var(--ink);
  border-bottom: 1px solid var(--ink);
  text-decoration: none;
}
.state .retry:hover {
  color: var(--accent);
  border-color: var(--accent);
}
```

Ghosts are static (nothing is arriving) and `aria-hidden`. **No `meta refresh`**: a Try-again link
does not re-hit an uncached route every minute per open tab. The 503 branch keeps
`cache-control: no-store` + `retry-after: 60` as today. The detail 503 renders the spread ghost (§4.6)
with the same `.state` + Try again. Empty catalogue / empty tag: §3.10, no ghosts.

---

## 7. Animation inventory

Every entry lives in `motion.css` unless marked GSAP; every moving entry sits inside
`@media (prefers-reduced-motion: no-preference)`; the only things allowed under `reduce` are opacity
dissolves ≤ 160 ms. Nothing animates `height`, `margin`, `filter` or `box-shadow`; `will-change` is
never set statically (GSAP sets `translate3d` during a tween and clears it).

| #   | Animation                        | Trigger                                                                                               | Properties                                                                                                                | Duration / stagger                                            | Easing                                | Impl                                                     | Reduced motion                                         |
| --- | -------------------------------- | ----------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| A   | Card entrance `rise`             | first paint of a grid page **without** a view transition (`html:not(.vt)`), grid not yet `is-settled` | opacity 0→1, translateY 14→0                                                                                              | `--dur-4`; `--stagger` × index for the first 12 visible cards | `--ease-out`                          | CSS keyframes, `:nth-child(n of :not([hidden]))` delays  | none: cards visible immediately                        |
| B   | Image reveal                     | plate `is-pending` → `is-loaded`                                                                      | opacity 0→1                                                                                                               | `--dur-3`                                                     | `--ease-out`                          | CSS transition on `img`                                  | 160 ms dissolve                                        |
| C   | Skeleton sweep                   | plate `is-pending`                                                                                    | `::after` translateX −170 % → 270 %                                                                                       | 1.6 s, infinite                                               | `--ease-inout`                        | CSS keyframes                                            | static block                                           |
| D   | Tab ink bar                      | tab activation                                                                                        | transform (translateX, scaleX)                                                                                            | `--dur-3`                                                     | `--ease-inout`                        | CSS transition; JS writes `style.transform`              | no transition (jumps)                                  |
| E   | Standfirst swap                  | tab activation                                                                                        | opacity 0→1 on the incoming block                                                                                         | `--dur-2`                                                     | `--ease-out`                          | CSS keyframes `fade` on `.standfirst:not([hidden])`      | none                                                   |
| F   | Filter reflow                    | tab click / arrow keys (never on load or `?collection=`)                                              | Flip: x/y/scale of surviving cards; onEnter autoAlpha 0→1 + y 12→0; onLeave autoAlpha→0 + scale .98; grid minHeight tween | 0.5 s / 0.38 s stagger 0.03 / 0.22 s                          | power2.inOut / power2.out / power1.in | **GSAP Flip**, lazy-loaded (§7.1)                        | instant toggle (today's behaviour)                     |
| G   | Card hover lift + contact shadow | `:hover` / `:focus-within` under `(hover: hover)`                                                     | img translate 0→−4 px; `.photo::before` opacity 0→1, scale .9→1                                                           | `--dur-3`                                                     | `--ease-out`                          | CSS transition                                           | none                                                   |
| H   | Name hairline                    | `:hover` / `:focus-within`                                                                            | background-size 0→100 % × 1 px                                                                                            | `--dur-2`                                                     | `--ease-out`                          | CSS transition                                           | hairline appears instantly                             |
| I   | Heart pop / dislike nod          | vote click (`.just`, user clicks only)                                                                | svg scale 1→1.28→1 / rotate −12° + 1 px dip                                                                               | 360 ms / 280 ms                                               | `--ease-spring` / `--ease-out`        | CSS keyframes `pop`, `nod`                               | colour change only                                     |
| J   | Count tick                       | `paintCounts()` (`.tick`)                                                                             | opacity 0→1, translateY 4→0                                                                                               | 280 ms                                                        | `--ease-out`                          | CSS keyframes                                            | none                                                   |
| K   | Navigation progress bar          | same-origin link click + 120 ms grace                                                                 | scaleX 0→.7                                                                                                               | 1200 ms                                                       | `--ease-out`                          | CSS transition                                           | bar appears without transition (2 px, non-distracting) |
| L   | Sibling dim                      | link click                                                                                            | opacity 1→.55 on non-clicked cards                                                                                        | `--dur-2`                                                     | `--ease-out`                          | CSS transition                                           | same (opacity only)                                    |
| M   | Root page transition             | cross-document navigation (Chrome 126+, Safari 18.2+)                                                 | old: opacity→0; new: opacity 0→1 + translateY 8→0 (−8 for back)                                                           | 200 ms / 320 ms                                               | `--ease-out`                          | CSS `::view-transition-old/new(root)`                    | 120 ms opacity only                                    |
| N   | Plate → hero morph               | card→detail, detail→related, detail→index navigation                                                  | group box position/size (UA), old/new crossfade with `height:100%; object-fit: contain`                                   | `--dur-vt`                                                    | `--ease-inout`                        | CSS `::view-transition-*(rug-hero)`, names set via CSSOM | no name assigned → no morph                            |
| O   | Detail entrance                  | first paint of `/rugs/*` without a view transition                                                    | `.stage` opacity 0→1; `.info > *` opacity + translateY 8→0                                                                | `--dur-3`; 40 ms × index for 8 children                       | `--ease-out`                          | CSS keyframes, static `:nth-child` delays                | none                                                   |
| P   | Thumb select / hero swap         | thumb click or arrows                                                                                 | thumb border/ring colour; new layers reveal via B; old pair removed after 420 ms                                          | 160 ms / `--dur-3`                                            | linear / `--ease-out`                 | CSS transition + gallery.ts DOM swap                     | 160 ms dissolve                                        |
| Q   | Lightbox open                    | hero click (`dialog[open]`)                                                                           | dialog opacity 0→1 + scale .985→1; `::backdrop` opacity 0→1                                                               | `--dur-2`                                                     | `--ease-out`                          | CSS keyframes `lb-in`, `fade`                            | opacity 120 ms; close always instant                   |
| R   | Links, chips, buttons            | hover / focus                                                                                         | color, border-color, background                                                                                           | `--dur-1`                                                     | linear                                | CSS transition (never `all`)                             | same                                                   |
| S   | Second-photo quick view (P2)     | hover intent 150 ms                                                                                   | opacity 0→1 of `img.alt`                                                                                                  | 280 ms                                                        | `--ease-out`                          | CSS transition                                           | not created                                            |

Keyframes:

```css
@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(14px);
  }
}
@keyframes rise-sm {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
@keyframes fade {
  from {
    opacity: 0;
  }
}
@keyframes pop {
  35% {
    transform: scale(1.28);
  }
}
@keyframes nod {
  40% {
    transform: rotate(-12deg) translateY(1px);
  }
}
@keyframes tick {
  from {
    opacity: 0;
    transform: translateY(4px);
  }
}
@keyframes lb-in {
  from {
    opacity: 0;
    transform: scale(0.985);
  }
}
@keyframes vt-out {
  to {
    opacity: 0;
  }
}
@keyframes vt-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}
@keyframes vt-in-back {
  from {
    opacity: 0;
    transform: translateY(-8px);
  }
}
```

Entrance rules (A, O) — the `of S` form counts only visible cards, so a `?collection=` deep link
(pre-hidden by prepaint) staggers correctly; browsers without `:nth-child(n of S)` drop only the
delay rules and show every card at once:

```css
@media (prefers-reduced-motion: no-preference) {
  html:not(.vt) .grid:not(.is-settled):not(.ghost) > .card {
    animation: rise var(--dur-4) var(--ease-out) both;
  }
  html:not(.vt) .grid:not(.is-settled) > .card:nth-child(2 of :not([hidden])) {
    animation-delay: calc(var(--stagger) * 1);
  }
  /* … 3 … 12 → calc(var(--stagger) * 2) … * 11 */
  .grid.is-flipping > .card {
    animation: none;
  } /* Flip owns the motion */
  html:not(.vt) .stage {
    animation: fade var(--dur-3) var(--ease-out) both;
  }
  html:not(.vt) .info > * {
    animation: rise-sm var(--dur-3) var(--ease-out) both;
  }
  html:not(.vt) .info > :nth-child(2) {
    animation-delay: 40ms;
  } /* … up to :nth-child(8) → 280ms */
}
```

`html.vt` is added in `pagereveal` (before first render) and **never removed**: removing it later
would re-enable the `animation` declarations and start the entrances after the transition. Toggling
`hidden` restarts CSS animations, which is why the grid gets `is-settled` on the first user
activation and `is-flipping` during a Flip — the "double entrance on tab switch" flagged by the judges
cannot occur.

Vote feedback:

```css
@media (prefers-reduced-motion: no-preference) {
  .like button.just[aria-pressed='true'][data-vote='like'] svg {
    animation: pop 360ms var(--ease-spring);
  }
  .like button.just[aria-pressed='true'][data-vote='dislike'] svg {
    animation: nod 280ms var(--ease-out);
  }
  .rating.tick {
    animation: tick 280ms var(--ease-out);
  }
}
```

### 7.1 GSAP — where it earns its bytes (P1)

Only the filter reflow is GSAP-shaped. `tabs.ts`:

```ts
type Motion = { gsap: typeof import('gsap').gsap; Flip: typeof import('gsap/Flip').Flip };
let motion: Motion | null = null;
let loading: Promise<void> | null = null;
const reduce = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;

function warm(): void {
  if (motion || loading || reduce()) return;
  loading = Promise.all([import('gsap'), import('gsap/Flip')])
    .then(([{ gsap }, { Flip }]) => {
      gsap.registerPlugin(Flip);
      motion = { gsap, Flip };
    })
    .catch(() => {
      /* stay on the plain toggle */
    })
    .finally(() => {
      loading = null;
    });
}

let tl: gsap.core.Timeline | null = null;
function reflow(grid: HTMLElement, cards: HTMLElement[], apply: () => void): void {
  if (!motion || reduce()) {
    apply();
    return;
  }
  const { gsap, Flip } = motion;
  tl?.kill();
  const before = grid.offsetHeight;
  const state = Flip.getState(cards);
  grid.classList.add('is-flipping');
  apply();
  const after = grid.offsetHeight;
  grid.style.minHeight = `${before}px`; // CSSOM: allowed by the CSP
  gsap.to(grid, { minHeight: after, duration: 0.5, ease: 'power2.inOut', clearProps: 'minHeight' });
  tl = Flip.from(state, {
    duration: 0.5,
    ease: 'power2.inOut',
    absolute: true,
    scale: true,
    nested: false,
    prune: true,
    onEnter: (els) =>
      gsap.fromTo(
        els,
        { autoAlpha: 0, y: 12 },
        { autoAlpha: 1, y: 0, duration: 0.38, ease: 'power2.out', stagger: 0.03 },
      ),
    onLeave: (els) => gsap.to(els, { autoAlpha: 0, scale: 0.98, duration: 0.22, ease: 'power1.in' }),
    onComplete: () => {
      grid.classList.remove('is-flipping');
      gsap.set(cards, { clearProps: 'all' });
      tl = null;
    },
  });
}
window.addEventListener(
  'resize',
  () => {
    if (tl) {
      tl.progress(1);
    }
  },
  { passive: true },
); // never mid-flip on a resize
```

`clearProps: 'all'` in `onComplete` is mandatory: Flip leaves inline `display`/`position` on
leaving elements, which would defeat `.card[hidden] { display: none }` on the next switch.
`absolute: true` is required so leaving cards stay visible while they fade. Both chunks are
same-origin Vite chunks (`script-src 'self'`); GSAP writes styles through the CSSOM, which the hash
CSP permits — confirm once on the built server (CSP is inert in `astro dev`). A click before the
import resolves falls back to the plain toggle; a `lead` card is verified in the manual checklist
(its `span 2` is restored by `clearProps`). ScrollTrigger is not used (the IntersectionObserver in
photos.ts is the only observer needed). Budget: gsap core ≈ 28 KB gzip + Flip ≈ 10 KB gzip, fetched
only on index pages, only after a nav hover/focus, never under reduced motion; detail pages ship no
GSAP.

---

## 8. Page transitions

### 8.1 Decision: native cross-document View Transitions, no `<ClientRouter />`

The verified facts rule out Astro's router for this site:

- The configuration reference states ClientRouter is **not supported with `security.csp`**.
- `transition:name` / `transition:animate` emit runtime `<style>` elements that are **not hashed**
  (probe: `hashed=false`), so under `style-src 'self' https://fonts.googleapis.com 'sha256-…'` the
  browser drops them and the directives silently do nothing.
- The router's `runScripts()` inserts a `data:` module helper the CSP blocks (a violation per
  navigation), every component script would need re-entrant `astro:page-load` re-initialisation,
  the `#sl-rates` JSON would have to be re-read after each swap, and `tabs.ts`'s `replaceState`
  would collide with the router's history state.

The MPA stays. Page-to-page motion is the browser's own cross-document View Transition API
(Chrome/Edge 126+, Safari 18.2+; Firefox and older browsers get an ordinary navigation), which
needs no router, no per-visitor server state, and keeps every script single-run. Mapping of what
the brief asked for onto what is built:

| Astro directive / event                                          | Status                        | Replacement here                                                                                                                                                                                          |
| ---------------------------------------------------------------- | ----------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `<ClientRouter />` in `Layout.astro`                             | **not used**                  | `@view-transition { navigation: auto }` in `motion.css` (present in every document because Layout imports it — the rule must exist in both pages, and does; 404/503 shells included)                      |
| `transition:name="rug-hero"` on the card image / detail hero     | **not used** (unhashed style) | `el.style.viewTransitionName = 'rug-hero'` set from `transitions.ts` in `pageswap`/`pagereveal` — CSSOM writes are not governed by `style-src`; exactly one element is named per document at capture time |
| `transition:animate="fade"/"slide"/custom`                       | **not used**                  | `::view-transition-old/new(root)` and `::view-transition-*(rug-hero)` rules in `motion.css` (external stylesheet, `style-src 'self'`)                                                                     |
| `transition:persist` on Controls                                 | **not needed**                | prepaint re-applies unit/currency from localStorage before first paint on every document                                                                                                                  |
| `data-astro-reload`                                              | **not needed**                | every link is already a full navigation; nothing to opt out of                                                                                                                                            |
| `data-astro-history="replace"`                                   | **not needed**                | —                                                                                                                                                                                                         |
| `astro:before-preparation` loader wrap (skeleton while fetching) | **replaced**                  | `html.is-navigating` + `#progress` on click in the old document (§6.3); `pageshow(persisted)` cleanup                                                                                                     |
| `astro:after-swap` (pre-paint hook) / `data-astro-rerun`         | **not needed**                | prepaint.js runs inline in every fresh document, exactly as today                                                                                                                                         |
| `astro:page-load` re-init of tabs/prefs/votes/photos             | **not needed**                | each module initialises once per document; the only re-entry is bfcache, handled by `pageshow`                                                                                                            |
| route announcer                                                  | **not needed**                | a new document announces its `<title>` natively (already per page)                                                                                                                                        |
| `fallback="animate"`                                             | **n/a**                       | browsers without cross-document VT simply navigate; §8.5                                                                                                                                                  |

### 8.2 CSS — `motion.css` (P0)

```css
@view-transition {
  navigation: auto;
}

::view-transition-old(root) {
  animation: vt-out 200ms var(--ease-out) both;
}
::view-transition-new(root) {
  animation: vt-in 320ms var(--ease-out) both;
}
html.vt-back::view-transition-new(root) {
  animation-name: vt-in-back;
}

::view-transition-group(rug-hero) {
  animation-duration: var(--dur-vt);
  animation-timing-function: var(--ease-inout);
  z-index: 2;
}
::view-transition-old(rug-hero),
::view-transition-new(rug-hero) {
  animation-duration: var(--dur-vt);
  height: 100%;
  object-fit: contain;
  overflow: clip; /* the UA default is width:100%/height:auto, which stretches when the ratio changes */
}

@media (prefers-reduced-motion: reduce) {
  ::view-transition-group(*),
  ::view-transition-old(*),
  ::view-transition-new(*) {
    animation-duration: 120ms;
  }
  ::view-transition-new(root) {
    animation-name: fade;
  }
}
```

The card plate (3/4) and the detail hero (`data-ar` bucket) are different shapes: the UA morphs
the group box between the two rectangles while both snapshots cross-fade **contained** inside it
(`height: 100%` + `object-fit: contain` — Chrome's own recipe for aspect-ratio changes). Because
both snapshots are beige plates holding the same `=w800` picture, the crossfade reads as one object
growing. Naming the **plate**, not the `<img>`, keeps the `.rot` transform, the drop-shadow and the
hover lift inside the snapshot (the judges' correction to FOLIO). Verify on the built server; if a
particular bucket looks wrong, the fallback is to leave the hero un-named (root dissolve only) —
never to re-introduce `transition:name`.

### 8.3 JS — `src/scripts/transitions.ts` (P0), imported once from `Layout.astro`'s `<script>`

```ts
const KEY = 'sl-vt-slug';
const reduce = (): boolean => matchMedia('(prefers-reduced-motion: reduce)').matches;
const slugOf = (href: string): string | undefined =>
  new URL(href, location.href).pathname.match(/^\/rugs\/([a-z0-9-]{1,80})$/)?.[1];
const plateForSlug = (slug: string): HTMLElement | null =>
  document
    .querySelector<HTMLElement>(`.card:not([hidden]) a.photo-link[href="/rugs/${CSS.escape(slug)}"]`)
    ?.closest<HTMLElement>('[data-plate]') ?? null;
const inViewport = (el: Element): boolean => {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
};
let lastHref: string | undefined;

export function initTransitions(): void {
  const html = document.documentElement;
  const measureNav = (): void => {
    const nav = document.getElementById('nav');
    if (nav) html.style.setProperty('--nav-h', `${nav.offsetHeight}px`);
  };
  measureNav();
  addEventListener('resize', measureNav, { passive: true });

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    const a = (e.target as Element).closest<HTMLAnchorElement>('a[href]');
    if (
      !a ||
      a.origin !== location.origin ||
      a.hasAttribute('download') ||
      (a.target && a.target !== '_self')
    )
      return;
    lastHref = a.href;
    html.classList.add('is-navigating');
    a.closest('.card')?.classList.add('is-leaving');
  });

  addEventListener('pageswap', (e) => {
    const hero = document.querySelector<HTMLElement>('.hero[data-plate]');
    if (hero?.dataset.slug) sessionStorage.setItem(KEY, hero.dataset.slug); // return-morph handshake (Safari too)
    const vt = e.viewTransition;
    if (!vt || reduce()) return;
    const to = e.activation?.entry?.url ?? lastHref;
    const slug = to ? slugOf(to) : undefined;
    const el = (slug && plateForSlug(slug)) || hero; // clicked card's plate, else this page's hero
    if (!el || !inViewport(el)) return;
    el.style.viewTransitionName = 'rug-hero';
    void vt.finished.finally(() => {
      el.style.viewTransitionName = '';
    });
  });

  addEventListener('pagereveal', async (e) => {
    const vt = e.viewTransition;
    if (!vt) return;
    html.classList.add('vt'); // suppresses the CSS entrances; never removed
    const nav = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    if (nav?.type === 'back_forward') html.classList.add('vt-back');
    if (reduce()) return;
    let el = document.querySelector<HTMLElement>('.hero[data-plate]');
    if (!el) {
      const slug = sessionStorage.getItem(KEY);
      sessionStorage.removeItem(KEY);
      if (slug) el = plateForSlug(slug);
    }
    if (!el || !inViewport(el)) return;
    el.style.viewTransitionName = 'rug-hero';
    await vt.ready;
    el.style.viewTransitionName = ''; // bfcache hygiene (MDN)
  });

  addEventListener('pageshow', (e) => {
    if (!e.persisted) return;
    html.classList.remove('is-navigating');
    document.querySelectorAll('.is-leaving').forEach((c) => c.classList.remove('is-leaving'));
    document.querySelectorAll<HTMLElement>('[data-plate]').forEach((p) => {
      p.style.viewTransitionName = '';
    });
  });
}
```

Flows:

- **Index/tag → detail**: click names the clicked card's `.photo`; the new document's `pagereveal`
  names `.hero`. Same name, different elements, different tags — the spec pairs purely by name.
- **Detail → related rug**: `pageswap` prefers the clicked related card's plate over the hero.
- **Detail → index (back link, Back button, wordmark)**: `pageswap` names the hero and stores the
  slug; the index's `pagereveal` reads it and names that card's plate — if it is visible. The back
  link carries `?collection=`, which prepaint applies before first render, and Chrome additionally
  honours `<link rel="expect" href="#sl-ready" blocking="render">` (Layout head) with
  `<span id="sl-ready" hidden></span>` placed **after** the prepaint `<script>` at the end of body,
  so the new state is never captured before prepaint ran. Safari ignores `rel=expect`; a card still
  hidden at capture simply means no morph (root dissolve). Note the trade-off: `rel=expect` at the end
  of body holds Chrome's first paint until the document is parsed on every load — parse only, not
  images; the cached pages are small, so this is milliseconds.
- **Direction**: `vt-back` keys the root's reverse rise; `PerformanceNavigationTiming.type ===
'back_forward'` works in every engine (no Navigation API dependency).

### 8.4 Script initialisation strategy

Fresh document per navigation ⇒ every module runs exactly once at evaluation (`initPrefs`,
`initTabs`, `initVotes`, `initPhotos`, `initGallery`, `initTransitions`). Nothing subscribes to
`astro:page-load`. The two re-entrancy cases are handled explicitly: bfcache (`pageshow` with
`persisted` → clear navigation classes, repaint saved votes, re-place the ink bar) and images
inserted after load (delegated capture-phase listeners in photos.ts). `tabs.ts` switches to
`history.replaceState(history.state, '', url)` — harmless today, and it keeps scroll-restoration
state intact for the browser.

### 8.5 Fallback ladder

| Situation                                    | Result                                                                                                          |
| -------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| Firefox, Safari < 18.2, older Chromium       | plain navigation; `is-navigating` dim + progress bar in the old page; CSS entrances A/O in the new one          |
| Reload, address-bar navigation               | no transition by spec; entrances run                                                                            |
| `prefers-reduced-motion: reduce`             | 120 ms root dissolve, no names, no morph, no entrances                                                          |
| Hero not decoded at capture (cold deep link) | the card morphs into a shimmering plate that reveals a frame later — the `::view-transition-new` pseudo is live |
| Target card hidden or off-screen             | no name → root dissolve only                                                                                    |
| Two elements accidentally named              | the transition is skipped by the browser (fail-safe); the code names at most one element per document           |
| bfcache restore                              | `pagereveal` fires with `viewTransition` null → nothing; `pageshow` clears state                                |

### 8.6 Prefetch policy

**P2, opt-in.** `astro.config.mjs`: `prefetch: { prefetchAll: false, defaultStrategy: 'hover' }` and
`data-astro-prefetch` on `.nm-link` and `.photo-link`. Astro's prefetch script is a normal bundled
client script (allowed by `'self'`/hash; it injects no inline script), and `<link rel="prefetch">`
for same-origin pages is covered by `default-src 'self'`. Benefit is Chrome-only: with memoryCache the
browser receives no `Cache-Control`, so Firefox/Safari cannot reuse the prefetched response and fetch
twice (both route-cache HITs, so cheap but wasted). Do **not** add `Cache-Control` to cached
responses to make it work — that changes the caching contract and can show stale vote counts. Verify
in the built server console that no CSP violation is logged before keeping it.

---

## 9. File-by-file implementation checklist (in order)

CSP rule for every line of new code: no `style=""` attributes (so no `define:vars`, no `set:html`
with styles), no `setAttribute('style', …)`, no `style.cssText`, no inline `<script>` besides
`prepaint.js`, no CDN. Only `el.style.prop = …` / `el.style.setProperty(…)` (CSSOM) from bundled
modules; GSAP writes the same way. Test everything on the built server (`npm run build && npm start`):
CSP is inert in `astro dev`.

| #   | File                                                                  | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | CSP note                                                                                                  | Prio                                |
| --- | --------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------- |
| 1   | `src/styles/tokens.css`                                               | append §2 tokens and the seven `[data-ar]` buckets                                                                                                                                                                                                                                                                                                                                                                                                                           | external/hashed CSS                                                                                       | P0                                  |
| 2   | `src/styles/editorial.css` (new)                                      | §3.2–3.10 index/card overrides, §4 spread, specs, thumbs, lightbox, related, pager, enquiry, placeholder art, ghost cards, `.sr-only`                                                                                                                                                                                                                                                                                                                                        | external CSS                                                                                              | P0                                  |
| 3   | `src/styles/motion.css` (new)                                         | §6.1 skeleton primitive, §7 keyframes/hover/reveal/vote rules, §8.2 view-transition rules, reduced-motion blocks                                                                                                                                                                                                                                                                                                                                                             | external CSS; `@view-transition` needs nothing                                                            | P0                                  |
| 4   | `src/lib/view.ts`                                                     | `Bucket` type + `plateRatio()`; `CardView` gains `ar`, `featured`, `lead?`, `altPhotoUrl?`; `NavTab.description`; `withLeads()`, `siblings()`, `relatedCards()`, `enquiryLinks()`; `navTabs` fills `description`                                                                                                                                                                                                                                                             | server only                                                                                               | P0 (leads/related P1)               |
| 5   | `src/lib/studio.ts` (new)                                             | `STUDIO_WHATSAPP = '525535760978'`, `STUDIO_EMAIL = 'hello@serioludere.com'`; `Footer.astro` reads them                                                                                                                                                                                                                                                                                                                                                                      | —                                                                                                         | P1                                  |
| 6   | `src/scripts/photos.ts`                                               | rewrite per §5.4 (delegated capture listeners, plate states, `aria-busy`, IO gate, `rot` before `loaded`)                                                                                                                                                                                                                                                                                                                                                                    | bundled module; classes + attributes only                                                                 | P0                                  |
| 7   | `src/components/RugPhoto.astro`                                       | props `ar`, `widthCm`, `lengthCm`, `priority`, `hero`, `full`; renders `.ph-art` + `.ph`; `data-plate-img` on the base; `class="rot"` when `rot==='force'`; hero mode renders base + full layers                                                                                                                                                                                                                                                                             | no inline styles                                                                                          | P0                                  |
| 8   | `src/components/RugCard.astro`                                        | `data-slug`, `data-plate`/`data-empty`/`data-alt` on `.photo`, `.price-row`, `lead` class, `eager`/`priority`/`related` props; keep every literal the test asserts                                                                                                                                                                                                                                                                                                           | —                                                                                                         | P0                                  |
| 9   | `src/components/VoteButtons.astro`                                    | no markup change (CSS only in editorial.css)                                                                                                                                                                                                                                                                                                                                                                                                                                 | —                                                                                                         | P0                                  |
| 10  | `src/scripts/votes.ts`                                                | `.just` on click, `.tick` in `paintCounts`, `pageshow(persisted)` repaint                                                                                                                                                                                                                                                                                                                                                                                                    | classes only                                                                                              | P0                                  |
| 11  | `src/components/CollectionNav.astro`                                  | `.ink` span, `.lede` standfirsts (`NavTab.description`)                                                                                                                                                                                                                                                                                                                                                                                                                      | —                                                                                                         | P0                                  |
| 12  | `src/scripts/prepaint.js`                                             | in the `?collection=` block, after the cards loop: toggle `[data-standfirst]` hidden by `data-collection` (4 lines). Its hash is recomputed at build by `astro.config.mjs`; add one assertion to `tests/unit/prepaint.test.ts`                                                                                                                                                                                                                                               | the only inline script; hash-registered                                                                   | P0                                  |
| 13  | `src/scripts/tabs.ts`                                                 | ink placement, standfirst toggle, `#grid-live` sentence, `is-settled`, `replaceState(history.state, …)`, GSAP warm-up + `reflow()` (§7.1), `resize` guard                                                                                                                                                                                                                                                                                                                    | CSSOM `style.transform`/`minHeight`; dynamic `import('gsap')`, `import('gsap/Flip')` → same-origin chunks | P0 (Flip P1)                        |
| 14  | `src/components/RugGrid.astro`                                        | `eager`, `lead`, `error` props; `#grid-live`; empty plate; 503 ghost grid + Try again (§6.5)                                                                                                                                                                                                                                                                                                                                                                                 | —                                                                                                         | P0                                  |
| 15  | `src/components/Layout.astro`                                         | import the two stylesheets after `catalogue.css`; `<link rel="expect" href="#sl-ready" blocking="render">` in head; `<div id="progress" aria-hidden="true">` at body start; `<span id="sl-ready" hidden>` **after** the prepaint script; `<script> import { initTransitions } from '../scripts/transitions.ts'; initTransitions(); </script>`                                                                                                                                | bundled module                                                                                            | P0                                  |
| 16  | `src/scripts/transitions.ts` (new)                                    | §8.3                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | CSSOM `viewTransitionName`, `--nav-h`; sessionStorage                                                     | P0                                  |
| 17  | `src/pages/index.astro`                                               | `withLeads(cards)`, `eager={4}`; no other change                                                                                                                                                                                                                                                                                                                                                                                                                             | —                                                                                                         | P0                                  |
| 18  | `src/pages/tags/[slug].astro`                                         | eyebrow → Catalogue; `.lede` block; `lead={false}`; sticky `#nav`; page `<style>` removed (rules in editorial.css)                                                                                                                                                                                                                                                                                                                                                           | —                                                                                                         | P0                                  |
| 19  | `src/components/Gallery.astro` (new) + `src/scripts/gallery.ts` (new) | §4.3 hero, caption, thumbs, `<dialog>`; swap/lightbox behaviour                                                                                                                                                                                                                                                                                                                                                                                                              | `dialog.showModal()`, `createElement('img')` + `.src`; no inline handlers                                 | P0 (dialog P0, thumbs P0, swipe P1) |
| 20  | `src/components/Specs.astro`, `Pager.astro` (new)                     | §4.2, §4.4                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | —                                                                                                         | P0                                  |
| 21  | `src/components/RelatedRugs.astro` (new)                              | §4.5                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | —                                                                                                         | P1                                  |
| 22  | `src/pages/rugs/[slug].astro`                                         | rebuild per §4.1: eyebrow Catalogue, `nav-detail` with pager, `main.detail` grid, `.info` column, related, 404/503 branches; page `<style>` removed                                                                                                                                                                                                                                                                                                                          | —                                                                                                         | P0                                  |
| 23  | `src/components/Footer.astro`                                         | read `studio.ts` constants; spacing via editorial.css                                                                                                                                                                                                                                                                                                                                                                                                                        | —                                                                                                         | P1                                  |
| 24  | `astro.config.mjs`                                                    | fix the stale comment (the CSP is an HTTP **header** on these on-demand routes, not a `<meta>`); optionally add `"frame-ancestors 'none'"` to `csp.directives` (keep `X-Frame-Options` in middleware). Optional (P2): `prefetch: { prefetchAll: false, defaultStrategy: 'hover' }`; optional (P2): `build: { inlineStylesheets: 'never' }` + `vite: { build: { assetsInlineLimit: 0 } }` for cross-page caching of scripts — not required for CSP because there is no router | no directive changes needed                                                                               | P1 / P2                             |
| 25  | `src/scripts/quickview.ts` (new)                                      | §5.6                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `createElement` + `.src`                                                                                  | P2                                  |
| 26  | `scripts/screenshots.ts`                                              | add `site-detail.png` (first `a.nm-link` href from the index) and `site-mobile.png` (390 × 844)                                                                                                                                                                                                                                                                                                                                                                              | —                                                                                                         | P1                                  |
| 27  | `scripts/qa.ts` (new)                                                 | §10.2 Playwright checks against the built server                                                                                                                                                                                                                                                                                                                                                                                                                             | —                                                                                                         | P1                                  |
| 28  | `docs/ADR.md`                                                         | add **D13 — Design pass**: cross-document View Transitions instead of ClientRouter (CSP), catalogue.css kept as parity record with editorial/motion overrides, D12's "prefers-reduced-motion disables the placeholder/rotate transitions" line and catalogue.css's "No transitions anywhere" comment superseded, lead-first ordering when `featured` is set, standfirst from `Collection.description`, no `meta refresh`, CSP-as-header correction                           | —                                                                                                         | P1                                  |
| 29  | `docs/screenshots/*`                                                  | regenerate after the pass; keep `reference.png`                                                                                                                                                                                                                                                                                                                                                                                                                              | —                                                                                                         | P1                                  |

Order rationale: 1–3 give the visual base with no behaviour change; 4–10 make images and cards
correct; 11–17 finish the index; 18–23 the detail page; 24–29 config, QA and records. After step 17
the index is shippable on its own.

Whitespace note: `compressHTML: true` collapses whitespace between elements — keep the tab
label/count on one line as today; the new `.price-row`, `.specs` and `.pager` use flex/grid so
whitespace is irrelevant.

State vocabulary (so two engineers use the same words):

| Host                                                      | Server attributes                                                   | JS classes                                          |
| --------------------------------------------------------- | ------------------------------------------------------------------- | --------------------------------------------------- |
| `html`                                                    | —                                                                   | `is-navigating`, `vt`, `vt-back`                    |
| `[data-plate]` (`.photo`, `.hero`, `.thumb`, `.lb-stage`) | `data-ar`, `data-empty`, `data-slug` (hero), `data-alt` (card)      | `is-pending`, `is-loaded`, `is-empty` + `aria-busy` |
| `img[data-rug-img]`                                       | `data-rot`, `data-plate-img`                                        | `loaded`, `rot`, `alt`                              |
| `.card`                                                   | `data-card`, `data-collection`, `data-slug`, `hidden`, class `lead` | `is-leaving`                                        |
| `#grid`                                                   | `role=tabpanel`                                                     | `is-flipping`, `is-settled`                         |
| `nav#nav`                                                 | —                                                                   | `has-ink`                                           |
| `.like button`                                            | `aria-pressed`, `aria-busy`                                         | `just`                                              |
| `.rating`                                                 | `data-rating-for`                                                   | `tick`                                              |
| `.standfirst`                                             | `data-standfirst`, `data-collection`, `hidden`                      | —                                                   |

---

## 10. Test plan

### 10.1 Vitest (pure logic, happy-dom for scripts)

`tests/unit/revalidate-view.test.ts` (or a new `tests/unit/design-view.test.ts`):

- `plateRatio`: (300, 400, '0') → `'3-4'`; (100, 400, '0') → `'1-2'`; (400, 100, '0') → `'2-1'`;
  (200, 200, '0') → `'1-1'`; (400, 300, '0') → `'4-3'`; (400, 300, '1') → `'3-4'` (rot wins);
  (undefined, 400, '0') → `'3-4'`; (0, 0, 'force') → `'3-4'`; (135, 190, '1') → `'3-4'`;
  boundary 0.58 → `'2-3'` vs `'1-2'` by the log midpoint.
- `withLeads`: first featured of a ≥ 3-rug collection moves to the front with `lead: true`, only when
  its bucket is landscape/square; collections with < 3 rugs or no featured rug are untouched; relative
  order of everything else is preserved; idempotent.
- `siblings`: index/total in grid order; no `prev` at the start, no `next` at the end; other
  collections ignored.
- `relatedCards`: wraps around after the current rug, excludes self, caps at `n`, `[]` for a
  singleton collection.
- `enquiryLinks`: `wa.me` and `mailto:` URLs encode the name and id; `askPhotos` subject.
- `navTabs`: `description` comes from the canonical collection, empty string when none.

`tests/unit/client-scripts.test.ts`:

- photos.ts: an `<img data-rug-img data-plate-img>` inside `[data-plate]` that fires `load` with
  `naturalWidth > naturalHeight` and `data-rot="1"` → img has `rot` and `loaded`, plate has
  `is-loaded`, `aria-busy="false"`; `error` → img removed, plate `is-empty`; an image complete at init
  with `naturalWidth 0` is removed; an image appended after init is still handled (delegation); an
  `.alt` image without `data-plate-img` never changes the plate.
- tabs.ts: existing three tests unchanged; `replaceState` receives `history.state` as argument 1;
  a click writes "1 rug shown · Kilims" to `#grid-live` and adds `is-settled`; the standfirst of the
  active tab is un-hidden; the plain-toggle path runs when GSAP is absent (Flip is never imported in
  happy-dom — assert no dynamic import is attempted without `pointerenter`).
- votes.ts: existing tests unchanged; a click adds `just` to the clicked button; `paintCounts`
  toggles `tick`; dispatching `pageshow` with `persisted: true` repaints `aria-pressed` from storage.
- prepaint.test.ts: with `?collection=kilims`, `[data-standfirst][data-collection="kilims"]` is
  un-hidden and the other hidden (extend the DOM fixture with two standfirsts).

`tests/integration/components.test.ts` (existing assertions untouched — the literal `class="card"`,
`<div class="photo"…>`, `<div class="ph">photo to come</div>`, `class="like"`, price and rating
strings still match):

- RugCard: `data-plate`, `data-slug="winks"`, `data-ar="3-4"` on `.ph-art`, `.price-row` wraps price
  and rating, `data-empty` when `photoUrl` is undefined, `class="card lead"` when `lead: true`,
  no `data-card` with `related`, `loading="eager"` + `fetchpriority="high"` with `eager`+`priority`.
- CollectionNav: `.ink` present, one `[data-standfirst]` per tab, only the active one not hidden.
- RugGrid: `error` → `.state[role=status]` with a `Try again` link and 8 `.ghost .card`s,
  `aria-hidden="true"`; `state` without error → the empty plate, no ghosts.
- Gallery: hero `data-plate data-ar data-slug`, base + full layers with the right attributes, thumbs
  with `aria-pressed`, `<dialog id="lightbox">`; no thumbs and no `.hero-open` for a single/no photo.
- Specs: rows only for present values, Size `dd` carries `data-dims`, Reference row is the id.
- Pager: `rel="prev"`/`rel="next"`, `.is-off` spans at the ends.

### 10.2 Playwright — `scripts/qa.ts` against the built server (`npm run build && npm start`, `--site=`)

Run in Chromium (installed for the screenshot script). Each check prints PASS/FAIL and exits non-zero on failure.

1. **No CSP violations**: `page.addInitScript` registers `document.addEventListener('securitypolicyviolation', …)`
   (CDP init scripts are not subject to the page CSP) and `page.on('console')` watches for
   "Content Security Policy"; visit `/`, hover the nav (GSAP loads), click a tab (Flip runs), click
   a card, open/close the lightbox, click a thumb, vote, go Back. Expect zero violations.
2. **No CLS**: init script records `PerformanceObserver({ type: 'layout-shift', buffered: true })`
   entries without `hadRecentInput`; after `networkidle` + scroll to bottom on `/` and `/rugs/<first>`,
   the summed value must be < 0.02.
3. **Route cache unchanged**: `x-astro-cache` is `MISS` then `HIT` for `/` and `/rugs/<slug>`; the
   response HTML never contains `style="` (grep the served markup) and never contains `<meta http-equiv`.
4. **Reduced motion**: `page.emulateMedia({ reducedMotion: 'reduce' })`; on `/` computed
   `animation-name` of the first card and of a pending plate's `::after` is `none`; after clicking a
   card, `sessionStorage` handshake still works but no element has a non-empty
   `style.viewTransitionName` at any point (poll during navigation); `gsap` chunk is never requested
   (watch `page.on('request')`).
5. **View transition smoke** (Chromium ≥ 126): `'onpageswap' in window` true; navigate by clicking a
   card and assert the detail `<h1>` text; go Back and assert the index grid restored; no console errors.
6. **Keyboard**: Tab reaches the wordmark → cm/ft → currency → active tab; ArrowRight moves the
   active tab and filters; Tab into the grid lands on the first visible card's name link (one stop
   per card) then its two vote buttons; Enter opens the detail; Tab reaches `.hero-open`, Enter opens
   the dialog with focus on `.lb-close`, ArrowRight changes the counter, Escape closes and focus is
   back on `.hero-open`; the pager links are reachable; focus rings are visible (`outline-style` ≠ none
   on `:focus-visible`).
7. **Screen-reader hooks**: pending plates have `aria-busy="true"` then `"false"`; `#grid-live`
   text after a tab click; ghost grid `aria-hidden`; `dialog[aria-label]`; `.hero-cap` updates.
8. **503 shell**: start the server with an invalid `GOOGLE_SHEET_ID`; `/` answers 503 with
   `cache-control: no-store`, a `.retry` link, 8 ghost cards, no `<meta http-equiv="refresh">`.
9. **Screenshots**: `npm run shots -- --site=…` regenerates `site.png`, `site-kilims.png`,
   `site-detail.png`, `site-mobile.png`; eyeball against `reference.png` for the kept layout language.

### 10.3 Manual (Chrome, Safari 18.2+, Firefox, one iOS device)

- Forward morph from a plain card, from a rotated (`data-rot="1"` landscape file) card, from a lead
  card, from a placeholder card; reverse morph on Back with `?collection=` set; detail → related.
- Firefox: plain navigations, dim + progress bar, entrances, no console errors.
- Safari: forward morph works; reverse morph uses the sessionStorage handshake; `rel=expect` ignored
  without harm.
- iOS Safari: sticky nav with the collapsing URL bar; sticky info column at 200 % zoom (the min-height
  guard turns it off on short viewports); thumbs strip snapping; lightbox swipe.
- Tab switch while a Flip is running (killed and restarted, no stuck inline styles — `[hidden]` still
  hides on the next switch); resize mid-flip (progressed to the end).
- Vote on the detail page, Back → the card's heart is correct (bfcache repaint).
- The plate tint decision: screenshot the grid with and without `.photo { background }` and let the
  owner choose before the pass is closed (default: plate on).

---

## 11. Risks and open verifications

1. Cross-document View Transitions cover ≈ 88 % of users (no Firefox); the plain-navigation path is
   complete on its own — accepted.
2. The 3/4 → `data-ar` morph with `object-fit: contain` on the pseudo-elements must be eyeballed on
   the built server for the landscape buckets; fallback is "no name" (root dissolve), never
   `transition:name`.
3. `rel=expect` is Chrome-only and parse-blocking at the end of body — measure once; move the anchor
   right after `</main>` only if it costs more than a few ms.
4. Ratio buckets predict from dims; a photo scanned in the other orientation without `rotate` set
   letterboxes — a data fix (`rotate = TRUE`), surfaced by the P2 `check-photos` report.
5. GSAP writes through the CSSOM (inferred from CSSPlugin) — confirmed only when the built server's
   console is clean after a Flip.
6. Flip + `[hidden]` in an auto-fill grid: `absolute: true`, min-height tween and `clearProps: 'all'`
   are all required; test a lead card and a resize mid-flip.
7. Lead cards depend on the owner maintaining `featured`; none set ⇒ uniform grid (by design).
8. `=w320` thumbnails and the prefetch script under the CSP are unverified — both P2 and gated on a
   probe.
9. Re-check the CSP/VT assumptions after any Astro upgrade (pinned 7.3.1): CSSOM naming and
   `@view-transition` in an external stylesheet are browser semantics and stable; the `rel=expect` /
   `pagereveal` ordering is the part to re-verify.
