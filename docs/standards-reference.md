# TBA3 Standards Reference

CSS and visual standards (§1–§2) and terse JS conventions (§3 onward). Project structure, module boundaries and lifecycle are in [architecture.md](architecture.md); the enforced rules are in `tools/check-structure.mjs`.

---

## 1. CSS Architecture

All visual values come from CSS custom properties on `:root`. **Never use raw hex, px, spacing, or font-family values inline.** Always reference tokens from `src/styles/foundation/variables.css`.

### 1.1 View Placement Ownership

Top-level routed view placement belongs to the matching view stylesheet.

- JS view modules create semantic region wrappers such as chart, table, detail, filter, or aside regions.
- The view's own sheet (`<view>ViewModule.css` beside the view, layer `views`) assigns those regions to concrete grid rows, columns, or flex positions.
- A view sheet should not become a catch-all for reusable module skins, legends, or other non-placement surfaces; those belong beside the module that emits them (layer `modules`) or in `src/styles/`.
- Shared CSS may provide shells and structural primitives such as `view-base`, `view-section`, and `table-container`.
- Shared CSS must not decide where top-level routed view regions are placed.

Canonical example:
- [src/en/views/enItemViewModule.js](../src/en/views/enItemViewModule.js) creates chart, table, and detail regions.
- [src/en/views/enItemViewModule.css](../src/en/views/enItemViewModule.css) places those regions explicitly in the grid.

### 1.2 Layers and Entry Sheets

Every app `main.css` (`src/{en,ma,sl}/main.css`) declares `@layer vendor, foundation, common, modules, views;`, imports `src/styles/app.css` (the shared sheets, each into its layer) and then only its own sheets.

The token defaults (`@tba3/module-base/styles/tokens.css`, then `@tba3/modules/styles/tokens.css`) come before tba3's deltas (`foundation/variables.css`), then typography, responsive, the module-base taxonomies, layout reset and skeleton, all into `foundation`; the shared shells (module-base's `layout.css` and `notice-callout.css` among them) and the table stack go into `common`, Tabulator into `vendor`.

The app sheets then add: `src/sl/variables.css` — SL's own tokens, into `foundation` after the shared ones (SL only) — and one shared view sheet into `views`: `src/styles/welcome-splash.css` (EN, MA), `src/sl/charts-row.css` (SL).

Unit-owned sheets (module, chart config, view) are not listed; each unit imports its own.

Table stack:
- `@tba3/modules/styles/table-base.css` and `table-header-layout.css` into `common`. The filter menu and progress-bar sheets are unit-owned (`tables/internal/tableFilterMenu.css`, `tables/progressBarColumn.css`, layer `common`) and arrive with their modules.
- An app's table overrides live beside its table module (`enStudentTablesModule.css`, `maStudentTopBarModule.css`, `slBaseTableModule.css`) in the `modules` layer and win by layer, not by load order.

### 1.3 Font Sizes

**Strict token system** — authoring uses three base tokens; ESLint (`config/eslint.config.mjs`, `no-restricted-syntax`) fails any `font-size` that reads anything but a `--fs-*` token, `inherit`, or one of the runtime-computed sizes the config lists by name.

| Token | Value | Usage |
|-------|-------|-------|
| `--fs-sm` | `max(0.8125rem, 12px)` | Tables, dense labels, captions, badges, tooltips. The px floor is deliberate: a user default under 16px would put the rem alone under 11px |
| `--fs-base` | `1rem` | Body text, buttons, inputs, descriptions, default chart typography |
| `--fs-lg` | `1.25rem` | Section intros, featured text, large labels, `h4` |
| `--fs-header-control` | `0.875rem` | The view header's controls (mode switches, selects): a step under body text so the view title keeps its room |

Headings use fixed sizes from `typography.css`: `h1` `--fs-h1` (2.125rem), `h2` `--fs-h2` (1.875rem), `h3` `--fs-module-title` (1.45rem), `h4` `--fs-lg`. Negative tracking (`-0.025em`) applies to `h1`/`h2` only, `h3` gets `-0.01em`, smaller headings none. `h5` and `h6` inherit the shared heading reset/color rules but do not define project-specific sizes.

Weights: `--fw-bold` (700) for every intentional emphasis, `--fw-semibold` (600) for secondary emphasis in charts and tables (axis captions, a highlighted footer row). D3 code sets weights as `var(--fw-…)` too; only canvas measurement (`textMeasurement.js`) takes a numeric weight, because `ctx.font` cannot resolve a custom property.

Line-heights: `--lh-icon` (1) for icon-only boxes and single-line badges, `--lh-ui` (1.3) for headings and controls, `--lh-text` (1.5) for anything that wraps to three or more lines. Prose surfaces cap their measure at 60–70ch (welcome greeting, tour card, info box, help view, summary empty state).

Text entry on a coarse pointer is floored at 16px (`controls.css`, `@media (pointer: coarse)`) so iOS Safari does not zoom into a focused field.

Chart policy:
- Chart SVG roots default to `--fs-base`.
- `src/styles/foundation/responsive.css` remains the only scaling mechanism; charts must not add independent responsive font math.
- Visible SVG chart text should inherit from the SVG root. When D3 or another generator injects font attributes, normalize those attributes at the renderer boundary instead of adding CSS selector nets.
- Chart-specific text-size exceptions use the token names `sm` or `base` and resolve to `--fs-sm` or `--fs-base`; do not use raw px chart font sizes.
- JS may resolve chart text tokens only for measurement or geometry calculations that require a concrete px value.

Font family (only one): `--font-family-main`, the system stack, set once on `body`. Charts, legends and tooltips inherit it; `themeService.js` reads the same token for chart text measurement. Do not introduce a second stack — a chart-only family matched the UI face on Windows and rendered a different one everywhere else.

### 1.4 Design Scales

**Spacing:** `--space-xs` 0.25rem · `--space-sm` 0.5rem · `--space-md` 1rem · `--space-lg` 1.5rem

Use primitive spacing tokens for tiny component geometry and to define the reduced shared spacing contract.

| Token family | Use |
|--------------|-----|
| `--layout-gap`, `--layout-gap-relaxed`, `--layout-gap-loose` | Shared internal stack/row/grid gaps |
| `--layout-pad`, `--card-pad`, `--card-pad-loose` | Shared body and card padding values |
| `--control-gap`, `--list-indent` | Tight control spacing and list indentation |
| `--view-padding`, `--header-padding` | Compound view/header shell padding contracts |
| `--notice-padding` (composed from `--notice-padding-block` / `--notice-padding-inline`), `--overlay-margin` | Shared callout and overlay shell spacing hooks; the axes are separate so a control can pull itself back into the padding |
| `--content-panel-padding` | Shared panel padding contract |

ContentModule header and subtitle padding are module-scoped custom properties on `.module-container` in [packages/module-base/src/modules/contentModule.css](../packages/module-base/src/modules/contentModule.css), not `:root` tokens.

For internal wrappers, prefer `.layout-stack`, `.layout-row`, `.layout-row--wrap`, `.layout-grid`, and `.layout-grid--auto` from module-base [styles/layout.css](../packages/module-base/src/styles/layout.css). These helpers may define display, direction, wrap behavior, and gap via local custom-property overrides, but they must not own routed view placement or generic padding.

Shared inline placeholder and under-construction notices should compose `.notice-callout`, `.notice-callout-icon`, `.notice-callout-copy`, and `.notice-callout-message` from module-base [styles/notice-callout.css](../packages/module-base/src/styles/notice-callout.css). App CSS may keep semantic modifiers such as a secondary copy line or a mark-color override, but it should not restate the shared shell geometry, padding, border, or icon sizing.

Preview visuals emitted by the shared nav-card builder should compose `.preview-media` from [src/styles/preview-media.css](../src/styles/preview-media.css). Keep size, background, border, grid-row placement, and owner-specific artwork local to the owning stylesheet.

Routed view CSS still owns placement. Use `gap: var(--layout-gap)` or another explicit core token on the view-owned grid/flex selector instead of introducing specialized shared view-gap utilities or hard-coded `0.5rem` values.

**Border Radius:** `--radius-xs` 2px · `--radius-sm` 4px · `--radius-md` 8px · `--radius-lg` 12px

**Shadows:** `--shadow-sm` / `--shadow-md` / `--shadow-lg` (small → medium → large elevation)

**Focus ring:** `--focus-ring` (`var(--focus-ring-width) solid var(--primary-color)`, 3px), always drawn as an `outline` so forced colours keep it; `--focus-ring-offset` (2px) is the gap of an outer ring that keeps clear of its element

**Motion:** `--motion-duration-fast` 150ms (hover, fades) · `--motion-duration-base` 300ms (slides, layout, data changes) · `--motion-ease-standard` (cubic in-out). Every CSS transition reads them — controls, buttons and charts alike — so UI and chart move at one pace; a literal duration is the exception (the skeleton loop, the notes highlight pulse). The chart zoom's 750ms is the charts' own (`MOTION.SLOW_MS`). The chart JS mirrors them as `MOTION` / `MOTION_EASE` (§2.20), and a unit test keeps the two equal.

**Touch targets:** `--touch-target-min` 44px — the minimum box for a control a fingertip has to hit. Absolute px on purpose, unlike every other size token here: the rem scale resolves against the root font-size (15px), so a rem-based 44px would land around 41px. Consumed under `@media (pointer: coarse)` (see §1.9), and unconditionally by the one control that exists only for touch (`.glossary-popup-close`).

### 1.5 View Header Layout

One layout, identical in EN, MA and SL — owned entirely by
[src/styles/header-module.css](../src/styles/header-module.css)
and [src/common/modules/header/headerModule.js](../src/common/modules/header/headerModule.js):

```
[ title ]                     [ controls ]          [ notes | info ]
left, grid column 1           col 2                 right end, col 3
[ subtitle ..................................................... ]
row 2, spanning all three columns
```

The header container *is* the grid (`minmax(min-content,1fr) auto minmax(0,1fr)`). Columns 1
and 3 share the room beside the controls, which sit centred while the title fits its half; the
title column never narrows below the title's longest word, so a title breaks between words,
never inside one ("Materiali|en"), and pushes the controls off-centre instead. The long SL
subtitles take their own full-width row underneath. A view without a subtitle renders no second
row. Every child pins its own `grid-row`/`grid-column`, so the DOM order in `render()` is the
reading order, not the visual order.

When one row cannot hold title, controls and actions, the header drops to two columns and the
controls take their own row, left-aligned (`.header-module--stacked`). `HeaderModule` measures
it in the one-row layout itself, after every render and on every resize of the header: the
control list must show all its controls and no cell may run into the next. A view with few
controls keeps one row where a view with many stacks, at the same width:

```
[ title ]                                           [ notes | info ]
[ controls ..................................................... ]
[ subtitle ..................................................... ]
```

Rules:
- **Titles left, actions right, controls centered.** There are no layout variants and no
  app-local header CSS. Do not re-declare `.header-module*` layout in an app's sheets.
- **Controls are declarative.** Add them to the view's list in the app's
  `build*ViewHeaderControls()` (`src/{en,ma,sl}/*HeaderControls.js`, the app spec's
  `headerControls` entry) as `{ type, id, options }`, not as DOM built by a view or chart
  config. Two types exist, `modeSwitch` (a segmented `.btn-group--segmented` row) and
  `select` (the shared `header-module-select` field class, + `--wide`); every control
  carries the DOM id `<headerId>-<id>` (`sl-shared-header-metric-select`).
- **Control labels carry no trailing colon**, and segmented controls (`modeSwitch`)
  carry no label at all — the buttons name themselves. Selects keep a label,
  since a collapsed dropdown only shows its current value.
- **A control's start value is the app's initial state.** A control declares no default;
  when the stored value is not one of its items, it shows its first item.
- **Title, icon and tour button come from `viewConfig`.** `HeaderOrchestrator` reads the
  view's own `viewConfig` entry for every app: `headerGlossaryPath` names the header's
  glossary entry, `icon` the Material Symbols glyph (`packages/module-base/src/utils/icons.js`),
  and `tour: true` shows the walkthrough button.
- **Only notes and info live in the actions cluster.**
- **Subtitles come from the glossary and nowhere else.** `subtitle` on the view's
  `headerGlossaryPath` entry is the only thing that sets a header subtitle, resolved in
  `resolveHeaderGlossaryCopy()` (`headerOrchestrator.js`). Do not set one at runtime. A view
  whose entry has no `subtitle` renders no subtitle. To add or change one, edit the view's own `<view>.glossary.json`
  fragment (§10 Glossary).

`ContentModule` card headers follow the same rule: title left, actions right, unconditionally.
A chart type's own control strip sits in the card body (§2.5 Header Action Toolbar).

### 1.6 Z-Index Scale

| Z-Index | Component |
|---------|-----------|
| `2` / `3` | `.report-card` while revealed (hover, focus, `.is-active`, drag) / `.report-card-toolbar` — local to the report's page stack, not the shell scale |
| `10` | `.content-module-header` (`--z-module-content`) |
| `100` | `.sl-shared-header-container`, sticky (`--z-overlay`) |
| `101` | `.header-module-actions` (`--z-overlay` + 1) |
| `1000` | `.sidebar`, `.batch-export-toolbar` (`--z-shell`) |
| `1001` / `1002` | `.app-skeleton` / `.skip-link` (`--z-shell` + 1 / + 2): above the rail while the app boots |

Above the scale sits the browser's top layer, which takes no z-index and stacks by the order things opened in: the modal `<dialog>`s (the item preview, the SL detail overlay, the scatterplot filter — `showModal()`, dimmed by their `::backdrop`) and the `popover="manual"` surfaces (the tour, the notes drawer, the toast region). Nothing on the page can paint over them, and a popover opened later paints over an earlier one. A modal makes everything outside it inert, so a surface that must stay usable while one is open is opened inside it (the toast region moves in, `notificationService.js`).

The anchored surfaces are popovers in the top layer too, so none of them takes a z-index: the header-action menus are `popover="auto"` (light dismiss), the glossary popups `popover="manual"` (opening one closes no open menu; `tooltipService` dismisses them: a click outside the stack closes it, a click in a lower level closes the levels above it, and Escape and scroll as before), the delegated label is `popover="hint"` (it never closes an open menu or glossary popup), and the cursor tooltip is `popover="manual"`. Floating UI places them (`strategy: 'fixed'`, the top layer's containing block being the viewport). An anchored popup whose anchor sits in an open modal `<dialog>` is moved into that dialog before it opens (`anchoredPopup.js`), since outside it would be inert.

### 1.7 Breakpoints

Root `font-size` is `93.75%` (`responsive.css`): 15px at the browser's default 16px, a share of whatever the user set. It has no viewport term: browser zoom shrinks the CSS viewport, so a `vw` share would cancel part of every zoom step (WCAG 1.4.4). Every `rem` token, text and spacing alike, follows the root and zoom 1:1; the sidebar rail is in rem for the same reason.

Sizes that must not follow the root carry a px floor (`--fs-sm`) or are px outright (`--touch-target-min`, `--pointer-target-min`).

The shell never gets smaller than `1024 × 600` CSS px (`--shell-min-width` / `--shell-min-height` on `body`, `layout-reset.css`). Below that the page scrolls in both directions instead of squeezing the layout further. Modal dialogs respect the floor too: their panels size from `--shell-width` / `--shell-height`, so below the floor a modal keeps its floor-sized layout and the viewport-sized `<dialog>` scrolls it. Viewport-fixed chrome (sidebar rail, tour card, notes drawer, toasts) stays pinned to the viewport.

Structural reflow has one viewport breakpoint, defined once as `@custom-media --stacked-layout (width <= 1280px) or (height < 690px)` in `src/styles/foundation/breakpoints.css` and resolved by Lightning CSS at build: `vite.config.js` (`tba3-breakpoints`) imports the definition into every sheet, so a sheet just queries `@media (--stacked-layout)`. New responsive CSS uses this breakpoint or a fit test against measured content, never a width of its own (§12):

| Tier | What changes |
|------|--------------|
| `--stacked-layout` (`≤ 1280px` wide or `< 690px` high) | Multi-column views stack into full-height cards (`--stacked-card-height`, which subtracts `--stacked-card-peek` so the next card's header stays visible past the fold); `.view-base` becomes a size container for `cqh`; SL scrolls the whole page. The view header's two-row switch is measured, not this breakpoint (§1.5). The height edge exists because the fit-to-viewport layout splits the height between rows of cards: below 690px it squashes charts flat at any width, while from 1281px wide every view still fits side by side (viewport review 2026-10-29). |

Direction-dependent geometry uses logical properties (`margin-inline-start`, `inset-inline-end`, `border-start-start-radius`, `text-align: start`). Physical `left`/`right` stay only where the geometry is physical: boxes a service positions from measured coordinates (tooltip, glossary popup, tour card, report cards), `translateX(-50%)` centring, and the export capture's off-screen park.

### 1.8 Color System

Colors are organized by purpose:

| Group | Key Tokens |
|-------|-----------|
| **Theme** | `--primary-color`, `--primary-hover`, `--secondary-color`, `--primary-color-light` |
| **Text** | `--text-color`, `--text-secondary`, `--text-muted`, `--text-on-primary` |
| **Backgrounds** | `--color-background`, `--color-background-page`, `--color-background-secondary`, `--color-background-hover`, `--color-background-muted`, `--color-card-background` |
| **Borders** | `--color-border`, `--color-border-light`, `--color-border-medium` |
| **Result text** | `--result-correct-text`, `--result-incorrect-text`, `--color-accent-text` |
| **Table** | `--table-row-bg`, `--table-row-hover-bg`, `--table-header-bg` |
| **Charts** | `--chart-domain0-color`, `--chart-domain1-color`, `--chart-grid-color` |
| **Comparison** | `--student-performance-color`, `--group-average-color`, `--school-average-color`, `--state-average-color` |
| **Results** | `--result-correct`, `--result-incorrect`, `--result-not-attempted` |
| **Benchmark** | `--benchmark-color` (a reference value that is not an average: the Pilotierung marker) |

Richtig/falsch default to the Okabe-Ito pair (`#009e73` / `#d55e00`), which stays apart under protan and deutan vision, and the gender trio to Okabe-Ito `#009e73` / `#2873b2` / `#e69f00` (the blue lifted from Okabe-Ito's `#0072b2` to clear 3:1 on the dark card), whose pairs keep CVD ΔE ≥ 8. There is no separate colour-blind theme: the default colours are the colour-blind-safe ones. Schule, the Lerngruppe and Land are three greys apart by OKLab ΔE ≥ 15 in each scheme, not by shape alone.

Derived colors use `color-mix()` from `--primary-color`:
```css
--primary-color-light: color-mix(in srgb, var(--primary-color, #3b82f6) 10%, var(--color-background));
```
Changing `--primary-color` re-themes all derived values.

All three apps share one `--primary-color: #3b82f6` (`@tba3/module-base/styles/tokens.css`); neither `src/styles/foundation/variables.css` nor an app overrides it. `src/sl/variables.css` holds only SL's own tokens (semantic chart colours, rating bands, group and row colours).

**Colours are CSS.** A renderer paints chrome and every fixed series colour with its token — a class, or `.style('fill', 'var(--token)')` — never a colour it read into JS. SVG presentation attributes do not resolve `var()`, so a mark's paint is a style or a class, and it is set on the selection, not inside a d3 transition. A colour that has to be computed (a competence level, a shade, a label's ink on a fill) is a published palette token (`paletteToken`, `packages/modules/src/common/services/paletteTokens.js`), painted the same way (why a switch then redraws nothing: architecture.md §4). A token that differs between the colour schemes is one `light-dark(<light>, <dark>)` declaration, never a rule keyed on the scheme (`scheme-tokens`). Paper is light through its colour scheme (architecture.md §4), so its colours stay tokens rather than white and grey literals; a PNG/JPG follows the screen. Every token package code paints with has a default in `@tba3/module-base/styles/tokens.css` or `@tba3/modules/styles/tokens.css` (`token-defaults`).

#### Competence-level (Kompetenzstufen) colors

These are **not** CSS variables. The scale varies by state — `A1–C1`, `A1.1/A1.2/…`,
`k.h.N., KS 1 … KS 5`, `Ia/Ib/II–V` — so the ladder is only known once
`competence-levels.json` has loaded. `packages/modules/src/common/services/competenceLevelPalette.js`
registers the scale at load time, `competenceLevelColors.js` beside it paints each of its
levels (`getLevelColors` in `colorRamp.js`), `themeService.getCompetenceAppearance` publishes
each level's colour as a palette token (`--competence-level-<scale>-<level>`), and each
renderer stamps that `var()` on its element as `--competence-level-band-color`; the paint
rules live in `@tba3/modules/styles/stacked-bar.css`.

The ramp has one step per **level**, whatever the level is called: `Ia` and `Ib`, `A1.1`
and `A1.2`, `KS 1a` and `KS 1b` are two steps each. No level name is parsed. Every level
paints one plain solid fill — no hatch,
stripe or pattern — and lines and lollipop stems are drawn solid; colour is the only
channel a level has in the plot. The key gives each level a second way in: the item
lollipops' Niveau key is a block of toggle pills (`itemCompetenceLevelLegendBlock`), so a
reader isolates one level instead of matching hues; a chart that draws a second scale in
the same hues (the SL Unterrichtsqualität bars) keys it in a block of its own
(`buildRatingKeyBlock`).

That holds under forced colours and in print too. Every element that carries data
colour — band fills and segments, legend swatches and symbols, the result bars, the
item-ring arcs, lollipop stems and heads, scatter points, average markers, spider points
and areas, the EN style pills, timeline dots and box-plot figures — takes
`DATA_MARK_CLASS` (`common/services/dataMark.js`) where it is made, and the one rule in
`dataMark.css` opts it out of the forced palette (`forced-color-adjust: none`) and asks
print to keep its backgrounds (`print-color-adjust: exact`). The properties inherit, so
the class on a group covers its marks (the in-bar labels keep their ink). The GER chip is
the one exception: its colour is a `::before`, so `competence-levels.css` opts that out
itself. Under forced colours each filled mark also takes a `CanvasText` edge from its
family's sheet, so neighbouring marks stay apart in any system palette; a mark whose
colour is its stroke (a stem, a line or hollow swatch, a box-plot figure) keeps that
stroke. No texture is added for either mode. Hit targets (`.chart-hit`) opt out too, so a
forced palette never fills them over the marks. Chromium leaves SVG fills unforced either
way (its UA sheet gives SVG `preserve-parent-color`), so there the edge is the visible
change; `tests/e2e/forced-colors.spec.js` pins it.

Three themes, picked in the sidebar and toggled by `data-competence-level-theme` on `<html>`: `default`,
`grayscale`, and `data` ("Landesvorgabe") — the state's own colors, offered only when the
payload carries them. The default ramp passes the colour-vision-deficiency gate below, so
it is the colour-blind-safe choice too.

**The default ramp is diverging and centred on the `medium` level (D-1).** A warm arm
below the centre (amber, red, then maroon), green at the centre and a cool arm above it
(teal, blue, then navy). The centre is the scale's lowest level that the payload tags
`standardBand:<id>` = `medium`, the same boundary `ge_medium` names; a scale that tags none
(an item scale, a fixture without tags) is centred on its middle level, the upper one when
the count is even. Each level takes the stop at its distance from the centre, so one level
below `medium` is always amber, however long the ladder: `KS 2` paints the same on the
Deutsch ladder (`k.h.N., KS 1 … KS 5`) and the Mathematik one (`… KS 1a, KS 1b …`). The
path has four stops per arm (`DEFAULT_PATHS`, whose inner five are `RAMP_STOPS.default`), each about
0.09 (light) / 0.085 (dark) in OKLab lightness further from the surface, so the levels are
ordered by lightness as well as by hue. An arm longer than four levels is sampled along
that arm in CIELAB; no gate covers it, and no shipped ladder needs it.

**Every generated theme has two sets of stops, one per colour scheme** (`RAMP_STOPS.light`
/ `RAMP_STOPS.dark` in `packages/modules/src/common/services/colorRamp.js`, and `DEFAULT_PATHS` likewise), and the palette publishes
both as one `light-dark()` pair per token, which each element resolves by its
`color-scheme` — on the page, the one `data-color-scheme` on `<html>` sets from the
sidebar's System / Hell / Dunkel choice. The dark set is its own validated ramp, not a
runtime inversion. On both, the green centre is the stop nearest the surface: the lightest
stop on white, the darkest on `#1e2430`.

**The gates are measured, not eyeballed.** `node tools/ramp-check.mjs` prints them, and
`tests/unit/tools/rampCheck.test.js` fails the suite when one breaks:

| Gate | Applies to | Threshold |
|---|---|---|
| In-arm OKLab ΔL, centre → ends | the default ramp's nine-stop path, per scheme | ≥ 0.06 |
| WCAG contrast against `--color-card-background` | every stop of the default path and the SL rating bands, per scheme; the light grayscale ramp's light end | ≥ 3:1 |
| Adjacent OKLab ΔE ×100 under protan, deutan and tritan (Machado 2009, severity 1.0) | the default path and the SL rating bands, per scheme | ≥ 8 |
| Adjacent OKLab ΔL, one direction | the grayscale ramp sampled to 3–7 levels, per scheme | ≥ 0.06 |

A scale with at most four levels on either side of its centre paints a contiguous window of
the path, so its adjacent pairs are adjacent pairs of the path: the one gate covers every
level count from 3 to 9 at every centre position.

Normal-vision ΔE and the dark grayscale ramp's light end (2.54:1, above the 2:1 ordinal
floor) are reported only, with the `Level · share` segment labels as the secondary
encoding. So is the closest non-neighbouring pair of the default path per deficiency: on
dark both arms lighten towards near-white, so a scale reaching three or more levels out on
both sides paints its two ends alike (protan ΔE 6.4 at seven levels, 0.5 at nine). No
hue-coherent dark path clears 8 there, so those ends rely on their labels; the shipped
scales reach at most three below and two above medium. The grayscale ramp is sequential, not centred: it is sampled to the level count,
exact at five levels. The tool measures against `SURFACES` beside the stops, which
must equal each scheme's half of `--color-card-background`
(`colorRampCssParity.test.js`).

The grayscale ramp is the five `--gray-1…5`, each a `light-dark()` pair: on white every step clears 3:1, and on dark it is re-lit dim→bright so step 5 stays the emphatic end.

**The SL rating bands are the ramp's arms.** `--sl-rating-low/medium/good/excellent` are
the theme's stops 0, 1, 3 and 4, every stop but the centre (red, amber, teal, blue), per scheme (`getRatingStops`). A rating has no neutral
band, since its split at 3.0 falls between medium and good. So low and medium read warm,
good and excellent read cool, in the same low→high order as the competence levels beside them. They
are published palette tokens (`slRatingAppearance.js`), so no stylesheet declares them.

Those colors arrive on the **value-group**, as `properties[].key = "levelColor:<level id>"`
keyed on `competenceLevels[].id`, and from nowhere else. Item levels ship no colour, so
item marks are painted from the reporting ramp and match the student charts beside them.
A shipped color
that does not clear `MIN_SURFACE_CONTRAST` against the **active scheme's** chart surface
falls back to the generated ramp for that band. `#ffffff` paints nothing on white and is
visible on the dark surface, so the gate is applied when the palette is resolved, not when
the payload is registered.

Everything that paints a band uses `--competence-level-band-color`, stamped per element — there is no
global set of band variables.

### 1.9 Accessibility

- `@media (prefers-contrast: more)` — stronger edges where a surface or mark relies on a faint one: the glossary popup's border in `--text-color`, and the stacked-bar segments' CanvasText outline, a query shared with `forced-colors: active` (`stacked-bar.css`). `high` is not a value of the feature and never matches
- `@media (prefers-reduced-motion: reduce)` — disables transitions/animations; D3 chart transitions run in JS, so they honour the same setting through `motionDuration()` / `animate()` (§2.20)
- `:focus-visible` — `outline: var(--focus-ring)`. Outer (offset 0) by default; inset (`calc(-1 * var(--focus-ring-width))`) where neighbours or a clipping parent would cut an outer ring: sortable table headers, scroll regions, menu rows. Chart marks, item rings and table group toggles keep a `--focus-ring-offset` gap (2px), since their ring follows a bounding box
- Semantic `cursor` changes (`help` for glossary, `pointer` for interactives)
- `@media (pointer: coarse)` — raises hit areas to `--touch-target-min` (icon buttons, labelled `.btn--text` buttons, nav rows, tab strips, dropdown options, table column titles)
- `@media (hover: hover)` — gates a reveal that needs a hovering pointer, always paired with an ungated twin (`:focus-visible`, a state class) so the affordance still exists without one
- `@media (hover: none)` — the touch-only fallback for such a reveal, where one is wanted at all
- `@media not (any-pointer: coarse)` — hides a control that exists *only* for touch; `any-pointer` rather than `hover`, because a hybrid device reports `hover: hover` and still has a touchscreen

**Which axis to gate on.** CSS media queries answer *what this device has* and are fixed for the page; `event.pointerType` answers *what the user is doing right now* and changes mid-session on a hybrid. A hidden control whose JS gate is per-interaction must therefore not be gated on `hover`/`pointer` — a touchscreen laptop reports `hover: hover` / `pointer: fine` and would lose the control while the gate that needs it stays live. Gate device capability in CSS, interaction modality in JS, and when the two must agree, gate the CSS on `any-pointer`.

---

## 2. Standardized CSS Classes

### 2.1 Layout Structure

| Class | Purpose |
|-------|---------|
| `.main-content` | Root app container (offset by `--sidebar-rail-width` beside the sidebar) |
| `.view-base` | View root — flex-column, tinted bg, semantic `--view-padding` / `--layout-gap` spacing |
| `.view-section` | Structural wrapper for layout regions inside views |
| `.module-container` | Card shell (bg, border, radius, flex-column) |
| `.module-container.collapsed` | Hides subtitle/body/actions |

### 2.2 Preview Media

| Class | Purpose |
|-------|---------|
| `.preview-media` | Shared centered visual slot for nav-card preview icons/charts |

`src/styles/preview-media.css` owns the shared centering, flex-shrink, and border-radius contract for preview visuals. App CSS should own only the media's size, background, border, placement, and feature-specific artwork.

### 2.3 ContentModule Slots

| Class | Purpose |
|-------|---------|
| `.content-module-header` | Title bar — flex row |
| `.content-module-header.interactive-subtle` | Click-to-collapse header (`collapsible: true`); its keyboard control is `.content-module-toggle`, the chevron as a `<button>` with `aria-expanded`, named by the title |
| `.content-module-title` | `h2` inside header (the view title is the page's `h1`), sized `--fs-module-title` |
| `.content-module-header-actions` | Right-aligned toolbar slot |
| `.content-module-subtitle` | Description below header |
| `.content-module-body` | Scrollable content area |
| `.content-module-chevron` | Collapse arrow; rotated 90° unless the card is `.collapsed` |

Feature CSS does not target these slot selectors (ESLint); the one exception is `@tba3/modules/styles/table-host.css` for `.content-module-body.has-table`.

### 2.4 Notice Callout

| Class | Purpose |
|-------|---------|
| `.notice-callout` | Shared inline notice / under-construction shell |
| `.notice-callout-icon` | Leading icon slot sized by `--notice-icon-size` |
| `.notice-callout-copy` | Optional stacked text wrapper for multi-line notices |
| `.notice-callout-message` | Primary notice text |
| `.notice-callout[role='alert']` | The failure form (`role: 'alert'`): card surface, `--color-error` edge and a cancel glyph instead of the amber notice; a persistent toast (`.toast--persistent`) takes the same paint |

module-base `styles/notice-callout.css` owns the shared callout shell for inline, module-local notes. Build the markup with `noticeCallout({message, detail, ariaLabel, role, className})` from `@tba3/module-base` (a lit template; `message` is plain text, `detail` a template); do not hand-write it. Keep semantic wrapper classes only when they still carry owner-local meaning or modifiers; do not duplicate the shell in app CSS.

### 2.5 Header Action Toolbar

| Class | Purpose |
|-------|---------|
| `.btn.btn--icon` | Shared compact toolbar/icon button surface |
| `.btn--size-toolbar-xs` | Shared smaller compact-action side length |
| `.btn.btn--icon.is-active` | Toggle active state |
| `.header-action-dropdown-wrapper` | Shared shell for helper-driven dropdown controls: the trigger and its menu |
| `.header-action-dropdown` | The menu: a `popover="auto"` its trigger invokes (`popoverTargetElement`), placed under the trigger by Floating UI |
| `.header-action-dropdown:popover-open` | Open state; the shell hides only the closed menu, so a panel sets its own `display` |
| `.header-action-dropdown--scrollable` | Long-list variant: a minimum width and a stable scrollbar gutter (every dropdown caps at the viewport and scrolls); pairs with `.styled-scrollbar` |
| `.styled-scrollbar` | The slim scrollbar (`scrollbar-width: thin` plus `scrollbar-color`) of table bodies, Material pages and scrollable menus |
| `.header-action-menu-item-content` | Shared inner row shell for dropdown items |
| `.header-action-menu-item-leading` | Optional leading slot; hidden when empty |

Header actions are templates, never DOM a caller patches: a card returns them from `_headerActions()` and `ContentModule` renders them in its toolbar, before the export control. A `ChartHostModule`-backed chart returns its own from the config's `headerActions(host)`. Build them with the shared templates in `packages/module-base/src/modules/header/headerActionDropdown.js` (`headerActionButton()`, `headerActionDropdown()`, `headerActionCheckboxDropdown()`, `headerActionRadioDropdown()`) instead of per-chart markup. A toggle passes its state as `pressed`, a checkbox (the export cart's tick) as `checked`, an action that runs for a while holds the trigger with `busy`, and an action that acts on a chart's plot alone (an orientation, a zoom) passes `inactive: host.showsTable`, so it stays in place, focusable and `aria-disabled`, while the card shows its data table, each read from a signal: the toolbar re-renders whenever a signal it read changes (for a chart host: its state, `host.chart` and a renderer's own signals, such as the competence-level chart's `isHorizontal`); state that is no signal asks for a render with `requestUpdate()`. Keep chart-specific state mutation local to the chart/config.
Each template takes the control's `name`, which it stamps as `data-header-action-button="<name>"`; tour steps and captures find controls by it, so no feature class is needed to look one up.

The ⌀ comparison control (toggling which reference series are visible) is `comparisonModeDropdown(host, getModes)` in `packages/modules/src/common/charts/host/comparisonModeControl.js`, which every chart host renders first: it is `nothing` when `getModes()` returns no mode or when the comparison state has no `setActive`. Controls one view drives across several hosts are not chart-header controls: the SL longitudinal view's three switches are declared in `slHeaderControls.js` as app-state writes the view observes.

A chart type's own controls that must take part in body layout go in the descriptor's `bodyControls`, a non-scrolling strip inside the card body that wraps over as many lines as the card needs, which the single-line card header cannot do.

Button families, sizes and lookup hooks: §2.21.

### 2.6 Shared Native Controls

Native `<select>` controls are a separate shared family from button-triggered dropdown menus.

| Class | Purpose |
|-------|---------|
| `.control-field` | Shared vertical field wrapper for labeled controls |
| `.control-field--inline` | Shared inline field wrapper for header/detail controls |
| `.control-label` | Shared label styling for control labels |
| `.control-select` | Shared native select surface and interaction contract |

`packages/module-base/src/styles/controls.css` owns the shared native control contract. Every native select composes the shared base classes directly. Owner stylesheets should keep width, layout, and token overrides local via `--control-*` variables instead of restating border, radius, hover, focus, or disabled behavior.

When styling native selects, prefer shared `--control-*` tokens over generic interaction utilities such as `.hover-border`. Those states belong to `.control-select`.

### 2.7 Table System

| Class | Purpose |
|-------|---------|
| `.table-container` | Inner Tabulator host inside table modules |
| `.content-module-body.has-table` | Flex column for table hosting |
| `.table-preset-container` | Flex row of filter buttons |
| `.cell-wrap-text` | Tabulator cell text wrapping |

Column alignment follows content: text and labels (names, IDs, item numbers, level labels, traits, styles, group and domain names) lead, and say so with `hozAlign: 'left'`; numbers and graphics (counts, shares, "x von N", bars, box plots, result icons) are centred, which is every column's default. No column is right-aligned. A chart's data table (`chartDataTable.css`) follows the same rule: figure columns centred, text columns (`.chart-data-table-text`) and row heads from the start. A header mirrors its cells through the `header-align-*` class the processor derives from `hozAlign`; CSS that lays out a cell's content (`.traits-container`, `.multi-value-cell`, `.sl-cell-label`) must not override that alignment.

`@tba3/modules/styles/table-host.css` owns the shared table-host contract (`.table-container`, `.content-module-body.has-table`). `packages/modules/src/common/tables/internal/tablePresetManager.css` keeps the preset-button container rules, and `@tba3/modules/styles/table-base.css` keeps Tabulator visual overrides.

### 2.8 Layout Mode State

These state classes are emitted by MA layout views, but the matching view stylesheet owns the actual placement rules.

| Class | Purpose |
|-------|---------|
| `.layout-mode-both` | View-defined split placement is active |
| `.layout-mode-table-only` | View-defined table-only placement is active |
| `.layout-mode-chart-only` | View-defined chart-only placement is active |

### 2.9 Interactive States

`.hover-border` adds a border on hover. Bundled presets:

| Class | Combines |
|-------|---------|
| `.interactive-card` | hover background + lift + press + focus-visible ring |
| `.interactive-subtle` | hover background + focus-visible ring |

Override `--interactive-hover-bg` per element to customize.

### 2.10 Stacked Bar Charts

| Class | Purpose |
|-------|---------|
| `.stacked-bar-container` | Flex row container |
| `.stacked-bar-segment` | Individual bar segment |
| `.stacked-bar-label` | Text label inside segment |
| `.stacked-bar-group` `.bar-segment` | SVG bar group and segment rect (`stackedBarBuilder.js`) |
| `.bar-segment.highlighted` | Highlighted SVG segment (stroke) |
| `.competence-level` | Competence-band paint from the stamped `--competence-level-band-color` (`.stacked-bar-segment` and `.bar-segment`) |
| `.level-<token>` / `.segment-<field>` | Per-level selector and test hooks set by JS; no CSS paints them |

Default stacked-bar label sizing stays owned by `@tba3/modules/styles/stacked-bar.css`. When a stacked bar is rendered inside `.chart-container`, the container overrides the label token to `--fs-base`, so chart/detail surfaces inherit chart typography without changing table defaults.

SVG segment labels are tiered: `createSVGStackedBar` asks the `labelFormatter` for the long form (`{ withShare: true }` → `A2 · 32 %`), fits it to the segment (`fitValueLabel`, §2.20), then tries two lines in a tall vertical segment (`{ lines: true }` → `['A2', '32 %']`), then the short form. Every competence bar uses `levelShareLabelFormatter` from `stackedBarUtils.js`; a formatter that ignores the tier keeps its one label.

### 2.11 Progress Bars

| Class | Purpose |
|-------|---------|
| `.stacked-bar-container.percentage-bar-container` | The shared stacked-bar track (§2.10), 18px inline; the second class scopes the result fills and the benchmark token |
| `.stacked-bar-segment` | Each result segment, a direct child of the container |
| `.bar-benchmark-marker` | Benchmark line over the bar |
| `--result-correct` / `--result-incorrect` / `--result-not-attempted` | The fill each `.stacked-bar-segment` gets inline; no per-result class |

### 2.12 Tooltips

| Class | Purpose |
|-------|---------|
| `.tooltip` | Base tooltip, a popover appended to `<body>`: the delegated label (`popover="hint"`) and the cursor tooltip (`.mark-tooltip`, `popover="manual"`) |
| `.tooltip:popover-open` | Shown state; it fades in from `@starting-style` |
| `.tooltip.is-interactive` | Pointer events when shown (as on `.mark-tooltip`): the delegated rich label, whose glossary terms the pointer reaches. A text label stays click-through, since it sits over the menu its trigger opens. A delegated label also opens on its trigger's keyboard focus (`:focus-visible`) and closes when focus leaves |
| `.tooltip-title` | Bold header with underline |
| `.tooltip-subtitle` | Line under the header |
| `.tooltip-row` `.label` + `.value` | Data row |
| `.tooltip-divider` | The footer rows, under a separator |

The page has one cursor tooltip (`cursorTooltip`, `#cursor-tooltip`), made on first use and shown for one mark at a time: the pointer and the keyboard show one at a time, and the mark that showed it last owns it. It stands above its mark and follows it, and takes the pointer (WCAG 1.4.13), so it hides only after a grace period once the pointer has left both mark and tooltip; Escape hides it until the pointer leaves the mark. It holds escaped text only. The element is `aria-hidden`: the focused mark carries the same text as its accessible name (§2.20).

**One datum, one wired element.** A tooltip belongs to the element that stands for the datum: the per-datum `<g>` (a `mouseenter` on a `<g>` covers its children, and the `area` hover dims all of them — an item-ring level, a ring tick with its icon, an average marker with its dot) or a hit area the figure returns (`drawBoxPlotFigure`'s `hitArea`, hover `band`). Wiring the parts one by one gives a datum several tab stops and a tooltip that flickers as the pointer crosses between them. A datum whose marks are small or several is its hit band (`ChartRenderer#joinHitBands`): one transparent band over the datum's slot, reaching halfway to each neighbour, in a layer over every mark; it tints with the `band` look and restyles the marks it stands for through `linked`. A lollipop item — stem, head, its comparison markers, the style chart's student pill — is one (`joinLollipopHits`, which grows the stem and head), as are a group-deviation column (a near-zero bar is 1 px) and a longitudinal year (its tooltip lists every series that year). The spider's spokes are wedges the same way, each listing every series on its spoke. A thin line too small to aim at gets a transparent hit shape of at least `MARK_DEFAULTS.minHitSizePx` (24) over it: the item ring tick's hit stroke. No mark under a hit target is wired. Points packed closer than that target (the scatter's jittered cloud) get no hit shapes, which would overlap and let the one painted last take the pointer: the chart picks the point nearest the pointer (`ChartRenderer#wireNearestPoints`, a Delaunay lookup within half the minimum size) and calls that point's hover, tooltip and click, and the points themselves take the keyboard.

**Content.** A chart's `getTooltipContent` returns a structured `TooltipContent` (`packages/modules/src/common/services/cursorTooltip.js`), never markup: `{ title, subtitle, rows, footer }`, each row `{ label, value }` with the value already formatted. `cursorTooltip.buildHTML()` renders it and escapes every part, so names and labels from the data go in as they are. A falsy entry in `rows` or `footer` is skipped, so a conditional row reads `condition && row`; a `null`/`undefined`/`''` value prints `MISSING_VALUE`. `cursorTooltip.toPlainText()` flattens the same content into a mark's `aria-label`.

Vocabulary rules:

- **Title and subtitle.** The title is the thing hovered; the secondary part of a name (the domain of an item, the group of a bar) goes into `subtitle`, never joined onto the title with a separator.
- **Labels come from `TERM_CONSTANTS`** (`packages/modules/src/common/domain/terms.js`): `STUDENT_COUNT`, `SHARE`, `SOLUTION_RATE`, `MEAN`, `RATING`, `YEAR`, `SCHOOL`, `COMP_LEVEL`, `ITEM_COMPETENCE_LEVEL`; EN adds `EN_TERMS`. No builder hardcodes a label string.
- **Counts name what they count.** `Anzahl Schüler:innen: 12` (`STUDENT_COUNT` + `formatCount`), or `12 von 20` (`formatCountOf`) when there is a total.
- **The rate of correct answers is the `Lösungsquote`**, in tooltips, axes and glossary alike.
- **Missing versus absent.** A value the data does not carry shows `–` (`MISSING_VALUE`); a row for something that does not exist (no comparison group, no total) is left out.
- **Student names read "First Last"** in a tooltip (`formatStudentFullName`, `common/domain/studentIdentity.js`); lists and selections keep "Last, First" (`formatStudentName`).
- **SL rows are shared.** Every SL box plot takes its tooltip from `boxPlotTooltip(stats, { title, subtitle, count, min, max })` (`packages/modules/src/sl/utils/slBoxPlotStats.js`); every share of a band — a rating band, a Kompetenzstufe, a pyramid row of any measure — from `shareRows({ label, value, share, count, total })` (`packages/modules/src/common/charts/shareRows.js`).

### 2.13 Glossary Popups

| Class | Purpose |
|-------|---------|
| `.glossary-term` | Dotted-underline annotation (`cursor: help`) and a `role="button"` tab stop (`tabindex="0"`, `aria-expanded` while its popup is open): keyboard focus (`:focus-visible`) resting on it for the hover delay (500 ms) opens its popup, so tabbing past opens nothing; Enter or Space opens it at once; focus leaving the stack closes it; a click-focused term keeps the hover path. A term in a popup body or a table cell is no tab stop (the column header keeps it), and Escape returns focus held inside a popup to the page term the stack opened from. Inside a control that takes focus itself (a legend pill, a sortable column header, a toggle-all legend heading) a term is no tab stop; a pill or header holding one carries `data-glossary-focus`, and keyboard focus resting on it for the hover delay (500 ms) opens the term's popup. In a chart SVG a term stays out of the arrow-key mark walk and its focus ring is an accent underline and accent ink |
| `.glossary-popup` | Rich popup container, a `popover="manual"` opened with its term as `source` |
| `.glossary-popup:popover-open` | Shown state; a click outside the stack closes it, one in a lower level closes the levels above (`tooltipService`) |
| `.glossary-popup-title` | Bold header |
| `.glossary-popup-close` | Dismiss `.btn--icon`, rendered only into tap-opened popups; sized from `--touch-target-min` unconditionally |

### 2.14 Mode Switch

| Class | Purpose |
|-------|---------|
| `.mode-button` | Toggle button |
| `.mode-button.is-active` | Active state |

### 2.15 Sidebar

| Class | Purpose |
|-------|---------|
| `.sidebar` | Fixed left, `--sidebar-rail-width` (4.25rem) collapsed, 250px expanded |
| `.sidebar.is-expanded` | Expanded by a tap; set by `SidebarModule`, never by a mouse click |
| `.sidebar-nav-button` | Nav item |
| `.sidebar-nav-button.is-active` | Active nav |
| `.sidebar-nav-icon` | Always visible icon |
| `.sidebar-nav-text` | Nav label, revealed with the rail |
| `.sidebar-settings-trigger` | A settings row: a nav-styled trigger opening its radio menu beside the rail |
| `.sidebar-settings-chevron` | The settings row's chevron, revealed with the rail |

The rail is a disclosure, and every reveal it performs exists four times over: `:hover` and `:has(:popover-open)` inside `@media (hover: hover)` (the second holds the rail open while the pointer crosses from a settings row to its menu), plus two ungated twins — `:has(:focus-visible)` for a keyboard, and `.is-expanded` for a tap. All four must list the same elements, so a newly revealed element needs adding to each. `.sidebar ~ .main-content` keeps its static `--sidebar-rail-width` offset throughout: the expanded rail overlays the content rather than reflowing the dashboard.

Sidebar current-view buttons are navigation state, not toggle state. Keep `.is-active` paired with `aria-current="page"` on the current view button; do not use `aria-pressed` for this state. Both are owned by `SidebarModule.setActiveView()`.
The same current-view rule applies to `NavCardModule` preview items: the current destination should carry `aria-current="page"` and should not keep the clickable `role="button"` / `tabindex` pair.

### 2.16 Export Components

| Class | Purpose |
|-------|---------|
| `.module-export-button-wrapper` | Export + batch buttons wrapper; a JS hook (`src/common/export/exportService.js`), no styles of its own |
| `[data-header-action-button="export-trigger"]` | Single-download trigger inside the wrapper |
| `.header-action-dropdown-option` | Shared header dropdown item style for export and non-export menus |
| `[data-header-action-button="batch-select"]` | Batch selection toggle using the shared toolbar selected state |
| `.batch-export-toolbar` | Fixed bottom toolbar |
| `.batch-export-toolbar.visible` | Slide-up animation |
| `.export-capture-stage` | Off-screen clone host used while a module is rasterized (`src/common/export/exportCapture.js`) |
| `.tabulator-print-table` | Tabulator HTML output substituted for the live table inside the capture clone |
| `.report-view` / `.report-toolbar` / `.report-scroll` / `.report-pages` / `.report-sheet` | Report view root, its toolbar (zoom, export and clear), the scroll shell, the page stack and one A4 sheet (`src/common/views/report/reportViewModule.js`) |
| `.report-card[data-report-item-id]` | One captured module in the report; page from `data-page`, half from `data-align`, its width preset the `aria-pressed` span button; `.is-active` when selected |
| `[data-report-card-action="drag|span|up|down|remove"]` | Card toolbar controls; the `span` buttons carry `data-span` + `aria-pressed` |

`packages/module-base/src/modules/header/headerActionDropdown.css` owns only the generic dropdown wrapper/menu layout. `src/styles/export-capture.css` owns the stage and its overrides (unclipped bodies, motion off, print-table sizing); it may target `.module-container` / `.content-module-body` because it is shared CSS. `src/common/views/report/reportViewModule.css` owns the report view and its cards (deliberately not `.module-container` cards — they are images with a control strip, and are never an export target's `container`).

### 2.17 Chart Container

| Class | Purpose |
|-------|---------|
| `.chart-container` | Full-size box with padding and chart typography shell |
| `.chart-container svg` | SVG fills container and inherits chart font family/size/color |

`packages/modules/src/common/charts/renderers/chartRenderer.css` owns `.chart-container`. It is the common typography boundary for hosted charts: `font-size: var(--fs-base)` (the family is inherited from `body`) and the chart-context stacked-bar label override live there, so app-specific chart CSS should inherit from this shell instead of redefining chart font sizes.

### 2.18 Chart Legends

Every legend is HTML: the renderer's `chartKey()`, which the base draws through `chartKeyTemplate` (`htmlLegendPanel.js`), in one of three modes. Where the key goes (`legend: 'top'|'auto'|'side'`) is the renderer class's default, set in its constructor; a descriptor does not name it.

| Mode | Use when | Standard pieces |
|------|----------|-----------------|
| Key | The legend is a static or state-reflecting key of the chart's colours and marks. | The renderer overrides `chartKey()`, returning its blocks (`ChartKeyBlock`: `{ items, title? }`) of `ChartKeyItem`s (`charts/legend/htmlLegendPanel.js`); the base draws it on a first draw or a refresh, before the plot area is measured. The config passes the host body and the renderer option `legend`; the base splits the body into plot area and panel at `create()` (`charts/legend/chartContainerLayout.js`): `legend: 'top'` puts the key in a centred, wrapping row over the plot, first in the DOM so it is read before the marks, `legend: 'auto'` beside the plot while the plot left beside it stays at least as wide as tall, and over it otherwise: the renderer places it in each measure pass from the key's widest entry and the card's box (`placeKeyBeside`), in the DOM as on screen. |
| HTML panel | The legend is also a control surface, such as toggle pills or side-panel visibility controls. | `chartKey()` blocks with a `group`: each entry a pill (optional `swatch`, `isChild`, `initiallyHidden`), the block's `columns`, `masterLabel` and `toggleAll`; the base keeps which series are off across redraws, redraws on a click and answers `isSeriesShown(key, group)`; the lit-html templates in `charts/legend/htmlLegendPanel.js`, the `.chart-with-legend-panel` / `.chart-svg-area` / `.chart-legend-panel` scaffold the base builds for `legend: 'side'` (`charts/legend/chartContainerLayout.js`) (`.chart-legend-dense` on an ancestor for a nowrap row), and shared legend pill CSS. |
| None / embedded | Axes, labels, tooltips, controls, or chart geometry already explain the encoding. | Document the rationale; do not add empty placeholder legends. |

Legend pills are quiet chips (`@tba3/modules/styles/html-legend-panel.css`): surface fill, 1 px hairline, semibold ink, the swatch as the only colour; active is the selected-row contract (primary tint plus an inset accent edge), inactive a dashed hairline in secondary ink with its swatch dimmed to `--legend-hidden-opacity`. Every categorical colour chip is `.legend-swatch` (0.75rem, `--radius-xs`, hairline border), in pills and in `.legend-swatch-list` keys alike. A chip never wraps inside a word — the panel grows to its widest chip (`max-content`, capped).

A display-only entry may carry no symbol, colour or swatch; it is then a line of text, for a key that explains marks rather than colours. Display blocks lie in a wrapping row over or beside the plot, and stack in a `legend: 'side'` panel. Every SL box plot shows the same reading key in its panel (`boxPlotKey`, `sl/modules/charts/shared/boxPlotKey.js`): the measures' colours when it draws more than one, then what box, median, ◇, whiskers and ○ stand for.

A key entry leads with the colour chip for `rect` and with the chart's own mark in miniature for every other symbol (`legendMarkTemplate`, an inline `svg.legend-mark` drawn by `renderLegendSymbol()`, sized by `legendSymbolBox()`); comparison series keep their marker (`comparisonMarkerLegendItem()`). An entry with a `key` is faded (`.is-hidden`, `--legend-hidden-opacity`) while the chart's `visibilityState` hides it; a comparison toggle redraws the key, so charts pass neither selections nor an opacity. A key title is only given for a key with several groups, or one whose entries are bare values (`Niveau`).

A pill toggles the series its entry's `key` names within the block's `group`; a key is unique within its group. The toggle state and the master/child rule (a master or toggle-all heading turns every entry off while any is on, else all on) live in the renderer base; how a hidden series leaves the SVG stays in the owning renderer's `renderChart`, which reads `isSeriesShown`. So does the empty state: a chart whose pills leave nothing drawn calls the protected `renderAllHiddenOverlay()`, since only it knows how its toggles combine into marks.

### 2.19 Numbers

The UI is German, so every number a reader sees is written the German way, and one
module writes them: `packages/modules/src/common/utils/numberFormat.js`.

| Shape | Helper | Output |
|-------|--------|--------|
| A percentage, from the number as shown (0–100) | `formatPercent(value, digits?)` | `62,1 %` — comma decimal, no-break space before the sign |
| A percentage, from a share (0–1) | `formatShare(share, digits?)` | `62,1 %` |
| A difference between two percentages | `formatPercentPoints(delta, digits?)` | `+3,7 PP`, always signed |
| A count | `formatCount(value)` | `1.234` |
| A count out of a total | `formatCountOf(count, total)` | `12 von 20` |
| A plain decimal (a rating statistic) | `formatDecimal(value, digits?)` | `3,45`, two digits by default |
| Anything else numeric | `getNumberFormat(options, locale?)` | a memoised `Intl.NumberFormat`, `de-DE` by default |

Every helper prints `MISSING_VALUE` (`–`) for `null`, `undefined` or `NaN`, so a missing value never reads as `0,0 %`.

Rules:

- **Never assemble a percentage by hand.** `` `${x.toFixed(1)}%` `` prints an
  English decimal to a German reader.
- **The helpers return plain text, never entities.** The same string has to work in
  an SVG text node, an `aria-label` and a CSV, where `&nbsp;` would show up literally.
  `materialFormat.js` wraps them for the Materialien pages, which do want markup.
- **Digits follow the surface.** A percentage in a tooltip has one decimal (the helpers' default); a label on or beside a mark and a percent-axis tick have none (`formatPercent(x, 0)`, the ticks `createPercentAxis()` draws); a rating statistic (mean, median, spread) has two (`formatDecimal`), and a rating-axis tick one.
- **A difference between two percentages is percentage points.**
- **Store numbers, format at the render edge.** A record field holding `"70.0%"`
  has to be parsed back before anything can plot or sort it, and a German decimal
  silently truncates under `parseFloat`.
- **Downloads are not display.** A column whose cell is formatted text gives the
  export its figure through `accessorDownload` and `formatDownloadNumber`
  (`tables/downloadNumberFormat.js`); the unit belongs in the column header.
- The info boxes are the one locale-aware exception: `info-boxes.json` may carry a
  `meta.locale`, so their resolver formats against that locale rather than `de-DE`.

### 2.20 Chart Layout, Axes, Marks, And Interaction

Shared chart mechanics live in `packages/modules/src/common/charts/chartDefaults.js`, `packages/modules/src/common/charts/chartAxisUtils.js`, and `packages/modules/src/common/charts/renderers/chartRenderer.js`. Use these helpers for repeated policy; keep chart-specific geometry in the owning renderer.

| Concern | Standard pieces | Use |
|---------|-----------------|-----|
| Layout | the renderer's `layout` option (`ChartLayout` in `chartAxisUtils.js`) | Pass a literal holding only what differs from the defaults (no legend, no axis space, 4 px padding floor), e.g. `{ legends: [{ position: 'auto' }], padding: { top: 10 } }`. |
| Axis look | `appendAxisGroup()`, `appendAxisBaseline()`, `chartRenderer.css` | One standard: no tick marks, labels `AXIS_DEFAULTS.tickPaddingPx` off the plot. A value axis draws no line (`appendAxisGroup(g, cls)`); a category axis keeps its baseline (`{ baseline: true }`, or `appendAxisBaseline()` under hand-placed labels, which carry the `axis-tick-label` class). Ink is CSS only: tick labels `--text-secondary`, baseline `--chart-axis-color` (3:1), titles `--text-color`. Charts set no axis fills or strokes. |
| Percent axes | `createPercentAxis()`, `measurePercentAxisSpace()`, `percentTickValues()` | One density rule: 10 % ticks, or 20 %/50 % when the axis is too short for `AXIS_DEFAULTS.minTickSpacingPx`. Pass `tickValues` only to merge chart-specific ticks (scatter thresholds). |
| Rating axes | `createRatingAxis()`, `measureRatingAxisSpace()` | Ticks at every whole point of the scale domain. |
| Category axes | `createCategoryAxis()`, `wrapBandAxisTickLabels()`, `measureLabelBlockHeight()` | Free-text labels follow the `chartLabelFit` policy (two lines, middle ellipsis); measure the reserve from the lines that are drawn. |
| Axis titles | `renderAxisTitle()` with `axisTitleText` in the measurement | Every numeric value axis has a title, drawn outside the axis, semibold. `span` centres a title on one scale of a stacked axis; `accent` colours one scale of a dual-scale chart. |
| Edge labels | `measurePercentEdgeTickReserve()` (`useHeight` for a vertical axis), `measureRatingEdgeTickReserve()`, and `AXIS_DEFAULTS.edgeTickBufferPx` | Reserve side/top space for first/last tick labels and hover markers without local magic numbers. |
| Grid lines | `appendGridLines()` | Every numeric value axis draws gridlines from the axis object it renders, behind the marks. |
| Reference lines | `appendReferenceLine(parent, {x1, x2, y1, y2}, className)` | A guide that is not data: an average, a group boundary, a centre. It sets geometry and class only, on the line of the same classes a redraw finds again (one per class set and parent; a chart drawing two of a kind gives each its own `className`); the look is CSS on `.chart-container` tokens (`--chart-reference-dash` `4 4`, `--chart-reference-width` 1 px, `--chart-axis-color`). It draws the dashed guide (`REFERENCE_LINE_CLASS.reference`); the other `REFERENCE_LINE_CLASS` entries are set directly: `separator` a solid rule (`.chart-separator`), `accent` a heavier `4 2` guide whose domain colour the caller sets inline (scatter thresholds). |
| Empty states | `noDataMessage()`, `renderNoDataOverlay(message)`, `renderAllHiddenOverlay()` | See *Chart messages* below. |

**Marks.** `chartDefaults.js` holds what every mark shares: `MARK_DEFAULTS` (`outlineWidthPx` 2, the surface outline parting a head or point from what it overlaps; `lineWidthPx` 2, a data line; `minHitSizePx` 24, the narrowest pointer target; `dragThresholdPx` 5; the growth factors `hoverScale` `{ head: 1.3, stem: 1.5 }`), `BAR_MAX_THICKNESS_PX` (72; `bandBar(scale)` caps a band's bar at it and centres it) and `AVERAGE_MARKER` (`sizePx` 6, `strokeWidthPx` `{ filled: 1, hollow: 2 }`, read by `markerPaintForIndex`). Bars and segments are fill-opacity 1; a group or series is told apart by colour, side or shape, never by a weaker fill. A marker's size is a diamond's half-extent, and `markerPath(shape, sizePx)` (`markerSymbols.js`) draws every shape (and the tooltip key's circle) as a `d3-shape` symbol of area 2·size², so a square, a triangle and a cross weigh the same as the diamond of that size; `markerHalfExtent(shape, sizePx)` is how far each reaches sideways, for a label or a legend box beside it. Each average marker is one `<g>` (`joinAverageMarkers`) holding its shape and centre dot; the legend and the charts size through the same functions. Lollipop heads and stems scale with the container through `lollipopMarkSizes(geometryScale)` (`lollipopMarks.js`); every lollipop item gets at least `LOLLIPOP_MIN_PITCH_PX` (20), and a chart that cannot give it scrolls (`fitContentWidth`). A tooltip row that names a comparison group carries the group's marker as its key (`comparisonTooltipKey`), which both tooltip paths draw before the label, at the tooltip's own key size. The competence-level and self-efficacy charts share one band frame (`bandChartFrame.js`): the name axis measured, wrapped and drawn in either orientation, the band padding, and the competence-level lie/stand rule's standing and lying slots computed from the same layout. Lollipop heads never shrink below the circle of a comparison marker's area, and the minimum pitch is two of the largest heads side by side.

**competence-level distribution orientation.** `CompetenceLevelDistributionChart` decides it: the groups lie down when the widest line of their names (wrapped over two lines) would not fit under a standing bar but every name fits beside its lying row (`standingSlot`, `lyingSlot`); otherwise the bars stand. It judges every group the payload carries, so a comparison toggle never flips the chart. A config may pass `isHorizontal` to override it; MA's header toggle does, EN has none.

**Average markers.** A comparison average is drawn by `joinAverageMarkers(chart, container, data, options)` (`packages/modules/src/common/charts/averageMarkers.js`): a keyed join of the shape and its centre dot, painted by `markerPaintForIndex`, its opacity written as a style (the property `setElementVisibility` writes), pointer events and tooltip off while hidden. It takes the renderer as an argument, so any `ChartRenderer` can use it; the lollipops draw at the default size, the scatterplot at its larger `AVERAGE_MARKER_SIZE_PX`. Where a marker and the class's own mark can coincide, the smaller one draws on top, so neither disappears behind the other: comparison markers over a lollipop head or pill (never smaller than a marker), the class's vertex over the spider's comparison markers, the class triangle over the scatterplot's equal-area markers. Hit bands sit above every mark.

**Value labels.** The number or level printed on or beside a mark follows one policy (`packages/modules/src/common/charts/chartValueLabels.js`):

- **Visibility is pixel fit.** `fitValueLabel(chart, tiers, box)` returns the first tier (longest first; a `string[]` is one tier over several lines) whose measured text fits the mark's box less `VALUE_LABEL.padPx` a side, or null, and then there is no label. No share thresholds; a mark whose box changes (a legend toggle's re-layout) re-fits on the redraw (`createSVGStackedBar` fits every pass).
- **Ink is contrast, not a per-chart colour.** `valueLabelInk(fill, { opacity })` returns white or dark, whichever contrasts more with the fill composited at its opacity over each scheme's surface (`inkOn` and `DARK_INK` in `services/colorRamp.js`); with no fill beneath, the chart text ink.
- **Placement sets the type.** Inside a mark `base` bold; outside, `VALUE_LABEL.gapPx` from the mark, `sm` regular in the text ink. `appendValueLabel()` draws one label and `styleValueLabels()` styles a selection a chart joins itself; both set `.value-label` and `pointer-events: none`.
- **Mixed backgrounds take a halo.** A label that crosses a gridline or a neighbouring mark passes `halo: true`: `.value-label--halo` rings the glyphs in the card surface (`paint-order: stroke`), right in either scheme without a redraw.
- **HTML bars fit by layout.** The DOM stacked bars (`createDOMStackedBar`, and the material panel's vertical stack) cannot measure, so `stacked-bar.css` decides: a label shows only where it fits whole (an empty `::before` holds the first flex line, and a label too wide — or, in a vertical stack, too tall — wraps into a line the segment clips). A resize re-decides it without the formatter. A bar's benchmark line is its own `marker` option, and the labelled segment it crosses keeps its label clear of it. The gap between fills follows the SVG rule (`insetStackedSegment`): half a gap off both sides of every fill wider than the gap, outer ends included.

**Hover.** `wireTooltipEvents` takes `hoverEffect` as one of three presets (`HOVER_PRESETS`, `renderers/internal/chartInteractionUtils.js`), or an effect object for a look the presets do not cover:

| Preset | Marks | Effect |
|--------|-------|--------|
| `area` | bars, segments, arcs, boxes | dims to `HOVER_OPACITY` (0.8) |
| `point` | circles | grows `r` by `MARK_DEFAULTS.hoverScale.head`, animated at `MOTION.FAST_MS`; a lollipop's stem grows with it (`STEM_HOVER`, wired by `joinLollipopHits`) |
| `band` | a transparent hit rect over a figure | a faint tint (`--chart-hover-band`) |

Hover writes a property and `leave` resets it to `null`, so a mark's resting look never lives in `opacity` or in the attribute a hover writes. The HTML stacked bars dim through `--chart-hover-opacity`, and a unit test keeps it equal to `HOVER_OPACITY`. A look that spans more than the hovered mark goes through `linked`.

**Chart messages.** A chart with nothing to draw, or that failed to draw, shows one look: `renderChartMessage(container, { text, kind, rect })` (`packages/modules/src/common/charts/chartMessage.js`) appends a `div.chart-message` with `role="status"`. The whole-card form leads with an icon; `.chart-message--inline` is the sentence alone, laid over `layout.chart` of a chart whose frame stays drawn; `.chart-message--error` colours a failure. Renderers reach it through:

| When | Call | Text |
|------|------|------|
| `validateData()` fails | the base replaces the chart with `noDataMessage()` | `general.messages.no-data`, or the reason an overridden `noDataMessage()` gives |
| Rendering threw | the base replaces the chart with the error message | `general.messages.chart-error` |
| Every series is toggled off | `renderAllHiddenOverlay()` | `general.messages.all-hidden` |
| The chart's own selection leaves no marks | `renderNoDataOverlay(message)` | `general.messages.no-data-short`, or the chart type's `noDataMessage` |

Every render pass clears the overlay before `renderChart()`, so a renderer only lays it when it applies.

**Motion.** `motionPreference.js` holds `MOTION` (`FAST_MS` 150 hover and fades, `BASE_MS` 300 layout and data, `SLOW_MS` 750 zoom) and `MOTION_EASE` (`d3.easeCubic`), mirrored by the `--motion-*` CSS tokens (§1.4). The transition idiom:

- A chain that only sets attributes or styles calls `animate(selection, { durationMs, name })`, which hands back the bare selection when the resolved duration is 0.
- A chain that needs `.on('end')`, `.remove()`, `attrTween` or a shared `d3.transition()` builds it: `.transition(name).duration(motionDuration(ms)).ease(MOTION_EASE)`.
- The duration is resolved once, at the leaf that starts the transition; code passing a duration along leaves it unresolved. `motionDuration()` returns 0 under `prefers-reduced-motion`.
- A comparison toggle fades the marks carrying the group's `comparisonSeriesClass` over `MOTION.BASE_MS`. Chart CSS transitions use `--motion-duration-*` and `--motion-ease-standard`.

**Accessibility.** Modelled on the Highcharts accessibility module:

- **The SVG is named after its card.** `createSVGElement()` sets `aria-labelledby` to the card's title (`findOwningModuleTitle`) and `aria-describedby` to the card's subtitle. A chart that is one of several in a card overrides `accessibleName()`. No SVG `<title>`: browsers show it as a native tooltip over the whole chart. The SVG is `role="img"` until a mark is focusable, then `role="group"`, because an `img` hides its children from assistive tech.
- **Every tooltip mark is focusable.** `wireTooltipEvents` gives each mark `tabindex="-1"` and an `aria-label` from `cursorTooltip.toPlainText(getTooltipContent(d))`. Focus runs the hover effect and shows the cursor tooltip (§2.12); Enter and Space call `onClick`, Escape hides the tooltip. A mark its `isVisible` guard hides is skipped, and `setElementVisibility()` sets `aria-hidden` with the fade.
- **One tab stop per chart.** `ChartRenderer` keeps a roving tabindex (WAI-ARIA APG, `renderers/internal/markKeyboard.js`): one shown mark holds `tabindex="0"`, the arrow keys walk the shown marks in DOM order, Home and End jump to the ends.
- **Opting out.** The renderer option `focusableMarks: false` keeps a whole chart out of the tab order when the control around it is the keyboard target (a selectable item-ring grid cell, which is a button). The renderer option `thumbnail: true` (a host with `thumbnail: true`) wires no marks at all: the chart is a picture inside a control.
- The focus ring is `svg [tabindex]:focus-visible` in `chartRenderer.css`.
- **Every chart offers its data as a table** (WCAG 1.1.1/1.3.1, the W3C complex-image pattern: Highcharts' "View data table", the OWID "Table" tab). A chart type implements `dataTable()` on its renderer (the base returns `null`, no table); the host adds the "Als Tabelle anzeigen" toggle, which shows a `<table>` in place of the plot, and CSV/JSON beside the image export (chartHostModule.md). The table lists exactly what the chart draws now, read from the same rows its tooltips are: a comparison or pill toggled off leaves it, and a value the source does not deliver is an empty cell, never 0 or a dash. Build the cells with `charts/dataTableCells.js` (`figureCell`, `shareCountCell`, `percentColumn`, `shareCountColumn`); a column whose figures show two decimals exports them with `digits: 2`. A chart that draws two kinds of figures returns one titled table per kind. A chart drawn by several renderers builds its table in the descriptor (`dataTable: (host) => …`). Every renderer draws into `host.chartArea`, never `contentContainer`: every host but a thumbnail splits its body into chart area and table area. The one exemption is the MA item-ring focus card, whose body already lists its figures as HTML tables, so its renderer returns no table.

Accepted exceptions stay explicit: threshold scatterplots, radar/spider geometry, MA item rings, SL group-comparison pyramids, and SL competence-detail teaching-quality overlays may keep local geometry. They should still reuse shared formatters, layout presets, no-data helpers, or axis factories where this does not distort the chart semantics.

### 2.21 Button Taxonomy

Shared button primitives and group contracts live in `packages/module-base/src/styles/buttons.css`,
imported after `packages/module-base/src/styles/interactive.css`. Shared header-action dropdown
shell/layout lives in `packages/module-base/src/modules/header/headerActionDropdown.css`, a unit sheet
that `headerActionDropdown.js` imports into `@layer common`. New button work composes the shared classes
below and keeps feature-level token overrides, shell/layout, and surrounding structure in
the owning module or view stylesheet.

A role not listed here is composed from these classes plus token overrides; no new
`.btn--*` name.

| Shared class | Role |
|--------------|------|
| `.btn` | The base surface every button carries. Nothing else paints a button background |
| `.btn--icon` | Icon-only square utility (header actions, export triggers, toggles, overlay close) |
| `.btn--text` | Text-first button with optional leading icon (sidebar nav, menu rows) |
| `.btn--item` | List-row button inside a dropdown or picker |
| `.btn--primary` | The one emphasised action in a group |
| `.btn--danger` | Beside `.btn--primary`: swaps its fill for the confirming button of a destructive action (`confirmDialog`) |
| `.btn--size-control` | Standard workflow/modal action size |
| `.btn--size-toolbar-xs` | Reduced compact toolbar/icon side length |
| `.btn-group` | Row wrapper; owns the gap between siblings |
| `.btn-group--segmented` | Joined buttons: each keeps its own frame, fill and height; neighbours overlap by 1px, inner corners square. The group draws nothing and has no height of its own |
| `.btn-group--wrap` | Wrapping variant of `.btn-group` |
| `.btn-stack` | Vertical modal/sidebar action stack |

The compact toolbar/icon sizes are `--btn-height-toolbar` and the steps
`--btn-height-toolbar-xs` and `--btn-height-toolbar-lg`. A one-off larger treatment is
sized in the owning stylesheet.

**Local variation goes through tokens, never through a competing surface rule.** Because
the cascade is layered (§1.2), a sheet outside `foundation` cannot beat `buttons.css` on
specificity, so a feature that needs a different look sets the live custom properties on
its own class instead: `--btn-fill`, `--btn-hover-fill`, `--btn-active-fill`,
`--btn-active-hover-fill`, `--btn-disabled-opacity`, `--btn-radius`, `--btn-padding-block`,
`--btn-padding-inline`, `--btn-icon-size`, and the three
`--btn-height-toolbar*` steps.

Owner-local classes compose with `.btn` rather than replacing it — `.mode-button` for
segmented text choices and `.legend-pill` for HTML legend toggles are the two families
that carry owner meaning on top of the shared surface. Group layout belongs on the group
wrapper, not on individual buttons, and spacing stays on semantic tokens
(`--layout-gap*`, `--control-gap`) rather than one-off margins between siblings.

Canonical runtime state classes are the `is-*` forms for non-native state: `.is-active`,
`.is-selected`, and `.is-inactive`. Real disabled state uses the native `disabled`
attribute, not `.is-disabled` or `.disabled`. Toggles keep
`aria-pressed`; checkbox dropdown items keep `role="menuitemcheckbox"` and `aria-checked`,
single-choice items `role="menuitemradio"` and `aria-checked`.

A data attribute on a button exists for a production reader — a stylesheet, a delegated
handler, the export capture — never for a test: `data-header-action-button` is there
because `exportCapture.js` strips the header actions by it. A test finds an element
through what production renders anyway: its id, its owner class, its role and accessible
name, `href`, `aria-pressed` / `aria-current`.

Every button glyph is a Material Symbols icon through `packages/module-base/src/utils/icons.js`
(structure-check rule `icon-sources`). The one exception is the Ø averages mark on the
comparison-mode button, a typographic sign the icon set has no glyph for, rendered as
`<span class="btn-glyph">Ø</span>` — a convention, not a licence for other buttons to grow
text glyphs.

Header-action dropdown behavior and menu-item rendering go through
`packages/module-base/src/modules/header/headerActionDropdown.js`: `headerActionDropdown()`
for generic dropdown shells (`after` adds siblings inside its wrapper, as the export
control's batch checkbox), `headerActionCheckboxDropdown()` for checkbox-style dropdown
controls, `headerActionRadioDropdown()` for a pick-one menu (the item-ring grouping: picking
closes the menu and reports the choice), `headerActionButton()` for a plain action button, and
`renderHeaderActionMenuItems()` for menu items. The open trigger's look comes from its
`aria-expanded`, which only the popover's `beforetoggle` writes, so a re-render while a
menu is open leaves it open.

Simple action rows and checkbox rows share the same inner row shell. Keep the semantic
split intact: simple rows stay `role="menuitem"`, checkbox rows stay
`role="menuitemcheckbox"` with `aria-checked` and the shared checkbox glyph
(`renderCheckboxIcon`, the `check_box` / `check_box_outline_blank` cross-fade the batch-export
checkbox uses too) in the leading slot, so ticked and unticked labels share one edge; radio
rows stay `role="menuitemradio"` with `aria-checked` and the `radio_button_checked` /
`radio_button_unchecked` glyph in the same slot. A simple row may name an `icon` for the same slot and a `description`, a smaller second
line under the label (the export menu says there what each format holds). In a checkbox menu, consecutive
items with the same `group` render under one section label (a `role="group"` list it
names), and `getActions`/`onAction` add plain action rows above the checkboxes, behind a
`role="separator"`; the menu re-renders in place after an action as after a toggle. A panel
that is not a menu builds the same rows from `headerActionMenuItem(item, null, onActivate)`
and `headerActionMenuSeparator()` (the table filter panel's "Alle Filter zurücksetzen"). Treat the
remaining differences as deliberate ownership, not drift: export rows stay on the
simple-action branch and close on select, and the long table column and filter lists add
`.header-action-dropdown--scrollable` for a stable scrollbar gutter.
A control with a `name` is stamped `data-header-action-button` and found by it. A dropdown holding form controls rather than items (the table filter panel) passes `role: 'group'`; its trigger is then a disclosure button, `aria-expanded` without `aria-haspopup`, while a menu trigger carries `aria-haspopup="menu"`. Rows, section labels and a panel body all inset by the dropdown's `--menu-inset-inline`.

---

## 3. JS Architecture

The class hierarchy, the module and view lifecycle (`create → connect → _setup →
_renderContent → … → _teardown`, the view render template with `_renderView`), state observation and sibling
wiring are documented once in [architecture.md](architecture.md) §2–§4; each module's
own API is in the `<unitFile>.md` beside it. This section keeps only the contracts that
have no other home.

- **File order** (`ContentModule`/`TableModule` subclasses): constructor/defaults → event handlers → base-hook implementations → lifecycle/update → export/public API → private helpers.
- **JSDoc and comments**: every `@param`/`@property`/`@returns` needs a type, and a description only when it says what name and type do not — a unit, what `null` means, who owns it, a side effect. An inline `//` comment says only why, never what the code already says.
- **No caller lists**: comments and JSDoc never name who uses or calls a unit ("used by X", "for cards that …", "also used by …"); find-references answers that. State the unit's own contract, or the constraint a caller imposes as a requirement without the caller's name. A pointer to a single source of truth ("requests are defined in `datasetEndpoints.js`") and `@see`/`{@link}` to a base class or protocol are fine.

### 3.1 ChartHostModule Config

The descriptor contract is in [chartHostModule.md](../packages/modules/src/common/charts/host/chartHostModule.md) (Optionen). A config file reads in one order: local constants and helpers, then a `CONFIG DESCRIPTOR` section with `glossaryPath`, `defaultOptions`, renderer creation, optional layout preparation, update handling, public API, and cleanup/export hooks. A complex config may keep a feature-local controller above the descriptor.

A competence-level-family segment click only reports its level (`onLevelClicked`, `CompetenceLevelDistributionChart#drawBars`); the owner decides what it selects and writes the highlighted levels (`highlightedLevels`). The MA overview keeps one level (a click on the highlighted one clears it). The MA group-view competence-level bar is a `StripBarChart` (`onSegmentClick`, `highlightedKeys`): its click asks the group table to toggle the level, and the descriptor exposes a host-level `updateHighlight(levels)` verb, because only there does a sibling (the group table) drive the highlight back.

### 3.2 TableModule

Hooks and behaviour: [tableModule.md](../packages/modules/src/common/tables/tableModule.md). Column rules:

- String-based Tabulator formatters (HTML strings, not DOM elements)
- `escapeHtml()` required for user data in HTML strings
- Column visibility: use `_applyColumnVisibility(getShouldShow)`, which applies every change inside one blocked redraw and never touches menu-excluded columns (`getShouldShow` returning `undefined` leaves a column as the user set it); pass `tableMeta: { excludeFromColumnVisibilityMenu: true }` to shared column builders for columns that should not appear in the standardized visibility menu (e.g., hidden sort-target columns). TableModule strips `tableMeta` before Tabulator initialization.
- Glossary opt-out: pass `tableMeta: { skipGlossaryAnnotation: true }` to shared column builders when a column should bypass glossary annotation wrapping. TableModule consumes and strips that metadata before creating the Tabulator column definition.
- Glossary-keyed header: `tableMeta: { headerGlossaryKey }` links the whole header title to one entry instead of annotating its words, under the same gate (an initialized glossary, no header opt-out). A column never sets its own `titleFormatter` for this. A column that sets no `title` takes the entry's short `label` as its title (`processColumnDefinitions`), so the header, the column menu and the export say what the glossary says; Verteilung and Richtig work this way.

### 3.3 App Module

```js
// Each view entry owns its own loader, so there is one registry per app. Its ids
// (`<app>-<view>-container`, `<view>ViewButton`, `<app>.nav-cards.element_texts.nav-<view>`)
// and its header entry (`<app>.<view>.header`, which must carry a title) follow from the
// app id and the view key.
const VIEWS = {
    [viewType]: {
        icon, headerGlossaryPath?, tour?, skeleton?, needsData?, sidebarPinBottom?, navCard?,
        load: () => import('./views/xxViewModule.js').then(m => m.XxViewModule)
    },
    welcome: WELCOME_VIEW_CONFIG,
    [REPORT_VIEW_KEY]: REPORT_VIEW_CONFIG,
};
// xxHeaderControls.js — built once, before the documents land: a control whose items
// come from the data reads ctx.documents in `resolveItems` (EN's Domäne switch, SL's selects).
export function buildXxViewHeaderControls(ctx) {
    return { [viewType]: [control, …] }; // only views that have controls
}

class XxAppModule extends BaseAppModule {
    // The app spec; bootstrap adds `appId`.
    static defaultOptions = {
        glossaryData: xxGlossary,
        dataset: XX_DATASET,
        views: VIEWS,
        defaultView: 'welcome',
        initialState: INITIAL_STATE, // the app's own keys; the shell adds the view and student keys
        headerControls: buildXxViewHeaderControls,
        comparisonIds: XX_DATASETS.COMPARISON_IDS, // every one starts shown
        students: { records: XX_DATASETS.STUDENT_RECORDS, view: 'student' },
    };
}

customElements.define('tba-xx-app', XxAppModule);
```

### 3.4 ChartRenderer Lifecycle

```text
constructor(container, options)     container: an element; its id, else the enclosing module's, prefixes the chart's own node ids
create()     → clearContainer → refresh → autoResize (the container is aria-busy while a resize redraw is pending)
measureIfStale() → calculateDimensions; false for an unchanged size. drawMeasured() → validateData → renderChart [ABSTRACT, synchronous]. A host's show and the resize observer call both, every chart's measure before any draw
refresh()    → a state or data change, animated (`drawDurationMs`), drawn from the box the last measure read (measures again only when the key's entries changed); a hidden chart only goes stale; during a pass, one more pass once it returns
destroy()    → resources.destroy() (its resize observation and listeners go with it) → the cursor tooltip hidden if one of its marks owns it → removeDrawing (its SVG root, message and content scroll region only)
```

Typography contract inside `ChartRenderer`:
- `resolveChartTextSize(size)` resolves a text token to px (default `base`), falling back to the chart container's live font size. `measureTexts()` takes the same `textSize`, or an explicit `fontSizePx`.
- Visible SVG text inherits from the chart SVG root. The `font-size`/`font-family` attributes d3-axis stamps on its groups are overridden by `chartRenderer.css` (`.chart-container .chart-axis` → `inherit`), so D3 defaults never shrink chart text, however often an axis is redrawn.
- `createSVGElement()` sets `this.svg` and `initializeSVG()` sets `this.g`; a renderer does not assign them itself. Every pass after the first draws into the SVG already on screen: `createSVGElement()` reuses the root this renderer drew (resized in place) and `initializeSVG()` its plot group `g.chart-plot`; only without one is the container cleared (a message state, the first draw) and a new root appended and named; the marks' arrow keys are bound once on the HTML container (`MarkKeyboard.wire`), since a focus listener on an `<svg>` puts the root itself in Chrome's tab order (§2.20). `createSVGElement({ parent })` appends into an element inside the container the caller has already cleared. `clearContainer()` is for the message states, never a redraw. `destroy()` removes only what the renderer drew (`removeDrawing()`, which a subclass that draws HTML beside its SVG extends): the host destroys a replaced renderer just before the new one's `create()`, and the container may by then hold the new one's frame. What a draw decides from the container's size and a header control shows lives in a signal of the renderer's own (the competence-level chart's `isHorizontal`), which the control reads.
- The draw pass is idempotent: persistent groups are found again (`selectOrAppend`, `appendAxisGroup`, `appendGridLines`, `renderAxisTitle` keyed by side or `key`), marks join by a stable domain key (`selection.data(d, key).join(…)`), so a redraw with the same data changes nothing and a focused mark keeps focus. `drawDurationMs` is `MOTION.BASE_MS` in a pass `refresh()` started and 0 on resize; transitions go through `animate()`.
- Token-sized chart text exceptions use `sm` or `base` and are applied explicitly to the affected selection with `applyChartTextSize(selection, size)` (`charts/chartTypography.js`). Glossary-aware SVG text is written with `this.context.glossary.renderTextSegments(selection, text)` (the app context the chart config hands the renderer as its `context` option).
- `calculateDimensions()` returns the measured container box and `geometryScale` (a fortieth of the shorter side); mark sizes derived from it belong to the chart family that draws them (`lollipopMarkSizes()`), and chart text-size tiers are not part of the dimensions contract.
- A renderer reaches the cursor tooltip only through the base: `wireTooltipEvents()` shows it, and `hideTooltip()` hides it for an interaction that takes the pointer (the scatter marquee). `getTooltipContent` callbacks return `TooltipContent` (§2.12), which the tooltip service renders.
- `wireTooltipEvents()` wires hover, tooltip, click and keyboard focus in one call (§2.20).

Layout, axis, and empty-state contract inside `ChartRenderer`:
- `initializeSVG(axisOverrides)` is the SVG setup path.
- `renderAxisTitle()` always emits the `axis-label` class at semibold weight; `measureAxisSpace()` measures the title at the same weight.
- Pass the static padding/aspect-range config as the `layout` literal, and chart-specific `axisOverrides` only for measured results.
- A full-container empty state comes from `validateData()` failing; `renderNoDataOverlay(message)` marks an empty plot inside a drawn frame; both render a `.chart-message` (§2.20). A renderer whose empty state has a reason overrides `noDataMessage()`; the base shows it whenever `validateData()` fails, so `renderChart()` never re-checks emptiness.

---

## 4. Naming Conventions (JS)

| Pattern | Convention | Examples |
|---------|-----------|---------|
| **Class names** | PascalCase | `BaseModule`, `ChartHostModule` |
| **Private fields** | `#field` (true JS private); a module has no public instance fields | `#options`, `#resources`, `#tornDown` |
| **Protected methods** | `_underscore` prefix | `_renderContent()`, `_renderBody()` |
| **Abstract methods** | `_underscore` + throws Error | `_renderBody()`, `_renderView()`, `_getColumns()` |
| **Element tags** | `tba-` + the kebab-cased class name without `Module`, defined beside the class; concrete modules only, never a base another module extends | `customElements.define('tba-en-group-table', EnGroupTableModule)`, `tba-chart-host` |
| **Lifecycle hooks** | `_on*` prefix | `_onDisplayedRowsChanged()`, `_onTableReset()` |
| **Constants** | `SCREAMING_SNAKE_CASE` in frozen objects | `MARK_DEFAULTS.hoverScale`, `EN_DATASETS.STUDENT_RECORDS` |
| **Config objects** | `ALL_CAPS` for module-level | `CONFIG`, `EN_DATASET` |
| **Quantities** | A number's unit ends its name: `Ms`/`_MS` for time, `Px`/`_PX` for lengths, else the unit it is in (`Em`, `Mm`, `Deg`, `Percent`, `PP`, `Ratio` for a 0–1 fraction, `Units` for SVG drawing units). A name holding a timer handle ends in `Timer`. Keys a library reads keep the library's name. Box geometry and fields that mirror a DOM or SVG property (`width`, `height`, `x`, `y`, `strokeWidth`, a DOMRect-like `{width, height}`, a renderer's `this.width`) keep the platform's name and are px. `tba3/unit-suffix` enforces time names and UPPER_CASE length constants | `durationMs`, `POPUP_GAP_PX`, `gapPx`, `BAND_PADDING_RATIO`, `#hoverTimer` |
| **Exports** | named | `export { BaseModule }`, `export class NavCardModule` |
| **Singletons** | camelCase exported const | `export const tooltipService = ...` |
| **File basename** | matches its principal export, app-prefixed where the basename would otherwise repeat across apps | `enGroupTableModule.js`, `longitudinalCompetenceLevelShareConfig.js`, `apiClient.js` |

### 4.1 Header-Suffix Policy

The header code (`src/common/modules/header/`, `src/common/modules/controls/`) and its
near-neighbours mix four suffixes. Which one a new file takes is decided by what the thing
*is*, not by where it sits:

| Suffix | Means | Examples |
|--------|-------|----------|
| `*Module` | A `BaseModule` subclass: a custom element that owns its DOM subtree and has a lifecycle. | `modeSwitchModule.js`, `selectControlModule.js` |
| `*Control` | A declared header-control unit: carries its own `injectState`/`onChange` and is dispatched by `HeaderOrchestrator`. Binds state; renders nothing itself. (`comparisonModeControl.js` is no such unit: it renders the ⌀ dropdown in a chart host's card header.) | `stateChoiceControl.js`, `datasetSelectorControl.js` |
| `*Builder` | A stateless factory returning a DOM node. No state, no lifecycle, no registration. | `domBuilder.js`, `stackedBarBuilder.js` |
| `*Controller` | Owns behaviour over a DOM subtree it does not itself create (a collaborator split out of a module). | `tableFilterController.js`, `tableModeController.js`, `itemRingGridController.js` |

### 4.2 API Vocabulary

The data's vocabulary is fixed upstream, in `packages/modules/docs/tba3-spec.yml`. An
identifier, file, CSS class, dataset key or package subpath that names a spec concept uses
the spec's term, in the casing its kind requires (§4):

| Spec term | Client spelling | Never |
|-----------|-----------------|-------|
| `competence-level` | `competenceLevel`; `studentCompetenceLevel` / `itemCompetenceLevel` where one scope holds both | `competency`, `ks`, `niveau`, `itemLevel` |
| `item` | `item` | `task`, `subtask`, `question` |
| `exercise` | `exercise` | `task` |
| `value-group` | `valueGroup`, `…ValueGroup` types | `…Row` for a payload entry; `row` is a table or chart row |
| `covariates` | `covariate` when reading the payload | |
| `group`, `student`, `school`, `state`, `subject`, `domain` | the same | `class`, `pupil`, a German field name |

- **`competenceLevel(s)` is the spec's level object(s).** A record field that holds a
  level's `nameShort` is `competenceLevelName`.
- **Client-only concepts keep their names**: `trait` (a covariate the client offers as a
  student characteristic — every trait is a covariate, not every covariate a trait),
  `pool`, `booklet`, and `comparison` (the value groups) beside `average` (the means drawn
  for them). Bare `level` is the short form inside a scope already named for competence
  levels.
- **A client record field with no spec term is English**: `subjectDomain` (one Fach, or
  one Fach × Domäne pair), `resultCode` (a `RESULT_CODE` number), `pilotSolutionFrequency`
  (the first present of the spec's `solutionFrequency…` parameters), `correctCount` (a
  student's solved items), `studentResults` (the per-student records of an SL result).
- **A collection of value groups of one type takes the type noun**: `groups`, `schools`,
  `students`, `comparisons` (`CompetenceLevelIndex`, `HistoryIndex`); a value group of any
  type is `valueGroup`.
- **Documents** are named `<bucket>-<spec schema name>.json`, the bucket prefix omitted for
  the request's own rows: `aggregations.json`, `students-aggregations.json`,
  `items-aggregations.json`. Two exceptions, both kebab-case: `prior-years.json` (the
  earlier years of the competence-levels answer, the only schema that has them) and site
  files the API does not answer (`info-boxes.json`).
- **A payload literal is named once**, in `common/domain/apiValueMaps.js`: value-group
  types are `VALUE_GROUP_TYPE`, `properties` keys `PROPERTY_KEY`, `covariates` types
  `COVARIATE_TYPE`. Only the prefixed property keys and the `trait` / `homeroom`
  covariates are constants beside their one reader. A tool under `tools/` imports these
  constants rather than repeating the literals; tests keep literals, since they are the
  payload.
- **An aggregation's `type` is an English code, its `value` the payload's own word.** The
  types are `result` (`AGG_TYPE_RESULT`) and `style` (`AGG_TYPE_STYLE`; also the `type`
  of an item's `parameters.competences[]`, which the client joins to it), both in
  `common/domain/apiValueMaps.js`. The values stay German, as
  the API's language convention has it — `Richtig` / `Falsch` / `Unbearbeitet` (`RESULT`),
  `global` / `detailliert` / `selektiv` — and the tables, tooltips and exports print them.
- **A document name is typed.** What a card or chart declares it reads is a
  `DocumentList` (`common/data/documentStore.js`): `DocumentName | DatasetKey`, so a
  mistyped file name fails `tsc`. `static documents` is declared in `@tba3/module-base`,
  which cannot name these types, so each override carries `@type {DocumentList}`; an
  override without it is checked only at runtime, where `documentOf` throws.
- **German UI text is not an identifier.** "Aufgabe", "Kompetenzstufe", "Aufgabenniveau"
  and "Leitidee" stay as they are, and so do glossary values. A glossary term key for a
  German UI word is that word in lowercase (`kompetenzstufe`, `lösungsquote`); a payload
  code used as a key keeps the payload's spelling (`m`, `ZO`), and other keys are
  unaffected.
- **No gate.** Nothing fails on a "Never" spelling; the rule is kept in review.

---

## 5. Coordination

Observed app state, direct sibling wiring and the theme switch are specified in
[architecture.md](architecture.md) §4. The idiom for a producer leaf:
```js
// producer (table)
this.options.onDataSync?.({ ids, mode });
// view
onDataSync: (data) => /** @type {any} */ (this.#chartModule)?.applySync(data)
```

---

## 6. Services & DI

| Service | Import | Injection |
|---------|--------|-----------|
| `cursorTooltip` | `services/cursorTooltip.js` | Singleton import, behind `ChartRenderer`'s tooltip wiring (§3.4); `BaseModule` has no tooltip API |
| `tooltipService` | `services/tooltipService.js` | Singleton import — the delegated tooltips and glossary popups are wired once by `BaseAppModule` (`tooltipService.init(context.glossary)`) and taken down with it through its `resources` (`tooltipService.dispose()`) |
| `resizeService` | `services/resizeService.js` | Singleton import from `@tba3/module-base`; its release goes to the owner's tracker (§7) |
| `exportService` | `export/exportService.js` | `options.context.runtime.exportService` — the app's `context.runtime` carries `createExportService(context)` (default runtime: no-op); it names each target from the card's `moduleId` and `identity` and the context's export dataset |
| `decorateText` | `modules/moduleRuntime.js` | `options.context.runtime.decorateText` (default: identity). tba3's `context.runtime` decorates through the app's `context.glossary.annotateHTML` (`createAppContext`) |
| `themeService` | `services/themeService.js` | Direct import (pure functions) |
| App context | `src/common/app/appContext.js` | Instance per app, built by the app module (`createAppContext`) and threaded as the `context` option (document store, glossary data and annotator, palette, host runtime, app id, export dataset and cart); renderers and helpers take the piece they read as an argument |
| `DocumentStore` | `@tba3/modules/documents` | Instance per app, built by the context (`createModuleContext`, inside `createAppContext`) and threaded as `context.documents`; a card names its documents and reads them itself |
| `notify` / `notifyFailure` | `services/notificationService.js` | Direct import (module functions); the caller hands in the app's glossary for a persistent toast or a failure sentence |

**Pattern**: a service the module owns outright is the shared singleton; one that stands
for an *optional host capability* is read from the context's `runtime`, so a consumer
that passes none gets a no-op instead of the whole subsystem in its import graph:
```js
import { resizeService } from '@tba3/module-base';               // owned
const runtime = this.options.context?.runtime ?? DEFAULT_RUNTIME; // host capability
```

**Failure reaches the reader once, and only when it is ours.** `notifyFailure`
logs the exception and raises one persistent toast; a repeat of the same sentence
returns the toast already standing rather than stacking another, so a failure that
fires per resize event cannot bury the page. The global handlers
(`installGlobalErrorNotifications(glossary)`, installed by the bootstrap before the app
connects, its disposer handed to the app's resource tracker) report `unhandledrejection` and any `error` event **that carries an
Error object**. An `ErrorEvent` with `error === null` is the browser reporting
itself — `ResizeObserver loop completed with undelivered notifications` during a
window drag, a cross-origin `Script error.` — and stays in the console.

A service that invokes caller-supplied callbacks must `await` them. `resizeService`
does: a consumer may redraw asynchronously, and a
`try/catch` around an un-awaited async call catches nothing — the rejection escapes
to `unhandledrejection`, where one chart's failure is announced as a page failure.

---

## 7. Resource Tracking

**Mandatory.** Never use raw `setTimeout`, `addEventListener`, or `requestAnimationFrame`.

```js
this.resources.trackDomListener(el, 'click', handler);
this.resources.trackTimeout(callback, 300);
this.resources.trackAnimationFrame(callback);
this.resources.trackSubscription(unsubscribeFn);
this.resources.trackSubscription(resizeService.observe(el, onResize)); // the module-base singleton
this.resources.trackSubscription(() => objectWithDestroy.destroy());
// All cleaned up automatically when the module tears down: listeners through the tracker's
// AbortSignal, subscriptions last-tracked-first.
```

`this.resources` is `BaseModule`'s. `ChartRenderer` keeps its own tracker private (`#resources`, no getter), so a renderer subclass has no `this.resources`.

---

## 8. Reactive State

```js
import { createState, writeState } from '@tba3/module-base';
this.state = createState({ studentId: null, mode: options.domainMode ?? 'all' }); // a given signal is shared
this.state.studentId.value;                    // read (tracked inside an effect)
this.state.studentId.value = 'x';              // write one key
writeState(this.state, { studentId: 'x' });    // write several, batched
this.effect(() => { this.state.mode.value; untracked(() => this.redraw()); }); // BaseModule: runs now + on change, disposed on teardown
```

Semantics: [architecture.md](architecture.md) §3, Reactive state.

**Controllers** (Lit's `ReactiveController` contract; no mixins):
```js
class MyTableModule extends TableModule {
    static properties = { studentId: { attribute: false } }; // merged with the inherited `data`

    /** @type {TableModeController<string>} */
    #mode;

    constructor() {
        super();
        this.studentId = null; // a declared property; setting it runs the content pass
    }

    // Registers itself: hostConnected at connect, hostDisconnected at disconnect. Built in
    // `_setup()`, the first point the options are set.
    _setup() {
        super._setup();
        this.#mode = new TableModeController(this, {
            mode: this.options.vizMode, key: 'vizMode', apply: (mode) => this._applyVizMode(mode),
        });
    }
}

customElements.define('tba-my-table', MyTableModule);
// The parent builds it with its options fixed, places it, then drives it through properties:
const table = MyTableModule.create('my-table', this._childOptions({ vizMode }));
render(html`${table}`, this);
table.studentId = id;
```

---

## 9. DOM Conventions

- **The module is its element**: a light-DOM custom element with an id (`X.create(id, options)`; connecting one without an id throws). A parent places it in a lit template or with `append()` / `replaceWith()`; there is no container to resolve. A view replaces its placeholder `div` and takes its id and class; the app replaces the page's `<main>` placeholder.
- **IDs**: a `ContentModule` keeps its id on the element; its `.content-module-body` has none, and code naming nodes after a module reads `owningModuleId(element)`.
- **Show/hide**: `show()` / `hide()` toggle the `hidden` attribute (`[data-tba-module][hidden]` is `display: none !important`) and run `refreshVisibility()`, which tells the subtree. No state class — active/selected state is owned by whoever renders the control
- **Teardown**: removing the element tears the subtree down (architecture.md §3); a move reconnects in time
- **Small DOM helpers**: use `createElement()` from `@tba3/module-base` (native `append()` for the rest); do not introduce broad declarative layout schemas.
- **Modal dialogs**: an overlay that covers the page is a native `<dialog>` opened with `showModal()`, through `ModalDialog` (`@tba3/modules/overlays`): the browser gives it the top layer, the `::backdrop`, an inert page behind it, focus moved in and returned to the trigger on close, and Escape; `ModalDialog` adds the name from a glossary entry, the ✕ (its owner places it) and the close on a backdrop click. The shell styles are `.modal-dialog` / `.modal-panel` / `.modal-close` (`@tba3/modules/styles/modal-dialog.css`). Past the last control Tab leaves for the browser chrome; `tests/e2e/modal-focus.spec.js` guards the keyboard behaviour. A popup that must be usable inside an open modal is mounted inside the `<dialog>` — anything outside it is inert. There is no scroll lock: `html` is the scroller below the shell minimum (`layout-reset.css`).
- **Non-modal overlays** (the notes drawer, the tour, the toast region) are `popover="manual"`: the top layer without an inert page or light dismiss. The drawer and the tour close only on their own controls and on Escape; a toast leaves on its own or on its ✕.
- **Escape closes the innermost open thing only**: a handler that dismissed something (a menu, a popup, a tooltip, a rename, a drag) calls `event.preventDefault()`, which a modal `<dialog>` reads as no close request; an open `popover="auto"` is closed by the browser first. A label never opens on the focus a closing menu or dialog hands back to its trigger, so the next Escape reaches the surface. A manual popover gets no Escape from the browser and checks `isUnclaimedEscape(event)` (`@tba3/modules/overlays`) before closing — the notes drawer from a keydown inside it, the tour from `window`. A new dismissible surface follows the same rule.
- **Failures after bootstrap**: never `alert()`. `notifyFailure(glossary, glossaryPath, context, error)` logs the exception and shows the glossary sentence as a persistent toast (`role="alert"`, closable); `notify(text)` is the transient variant (`notify(text, { persistent: true, glossary })` keeps it). Failures before the app's first content pass resolves (`contentComplete`) stay with the bootstrap's inline `role="alert"`. The bootstrap installs `unhandledrejection` / `error` handlers into the same channel.
- **HTML contract**: markup reaches the document only through `setTrustedHTML()` / `trustedFragment()` from `@tba3/module-base`, or inside a lit-html template through its `trusted()` directive (lit's `unsafeHTML`/`unsafeSVG` are barred; a string interpolated into `` html`…` `` renders as text; run-time custom properties go through the `cssVars()` directive, never `styleMap`, whose first render writes a `style` attribute the CSP blocks) — the page's Trusted Types policy `tba3`, enforced by the browser under the CSP and by the lint rule `tba3/no-raw-html-sink`; clearing is `replaceChildren()`. The helpers clean nothing: a string that carries data is escaped with `escapeHtml()` before it meets them; a sink that takes markup says so in its JSDoc (`setSubtitle()`, which also takes a lit template), one that takes text escapes itself (`setTitle()`). A label that needs an icon appends `createIcon()` beside `textContent` — no markup prefixes. HTML from the API is cleaned once, where it enters: `competenceScalePayload.js` runs level and scale prose through `sanitizeHtml()` (`@tba3/modules/sanitize`, DOMPurify) down to `p, b, strong, em, i, ul, li, br`, so a glossary popup escapes a payload entry's *title* and shows its *body* as HTML. Table formatters still return strings; `processColumnDefinitions` hands Tabulator the parsed `trustedFragment`. Strings a library writes itself (Tabulator's built-in formatters, Quill) pass the page's `default` policy, which sanitizes them (`src/common/app/trustedTypes.js`).
- **No `style` attribute in markup**: the CSP (`config/csp.mjs`) forbids it. A value computed at run time rides in the markup as custom properties (`cssVarsAttr()` from `@tba3/module-base`), which every trusted write sets through CSSOM once the markup is parsed; glossary copy uses classes.

---

## 10. Data Conventions

### JSON file structure
- All data files are **arrays of objects**
- Common shape: `{ id, name, domain: { id, name }, subject: { name }, covariates, properties }`
- Statistics: `{ descriptiveStatistics: { total, mean, frequency, standardDeviation? } }`
- Competence levels: `{ name, nameShort, descriptiveStatistics }`

### Per-group scenario folders
- EN: `public/data/en/8a_mid/`, `8b_good/`, `8c_bad/`
- MA: `public/data/ma/3a_mid/`, `3b_good/`, `3c_bad/`
- One file per request, 3 each: `competence-levels.json` (group, comparison and student rows), `items.json`, `aggregations.json` (EN: group, comparison, student and item rows; MA: student and item rows)

### Glossary
How the tree is assembled: [architecture.md](architecture.md) §8. Field rules:

- Nested keys: `{app}.{view}.{element}` → role-named fields, each named for the one slot
  it renders in: `title`, `subtitle`, `body`, `label`, `tooltip`, `description` (nav-card
  line), `tutorial` (tour card). No authoring-only fields: a field nothing renders does not
  exist; authoring notes belong in the module's `.md`
- Shared terms: `shared.element_texts` → `{ title, body, aliases, domains }`. `domains` lists
  the payload Domänen the entry explains, each `{ subject, id }` (`subject.name`,
  `domain.id`; EN, one Fach, gives `{ id }` only). A Domäne's name is never an alias: one name
  (`Lesen`) is a Domäne of several Fächer, and a short one matches inside other words
  (`gelesen`, `gehören`). Copy that labels data names a Domäne through a `{{token}}` filled
  from the payload, never literally. A Domäne in copy links the entry that claims its id
  (`resolveDomainEntryKey`, with the Fach in SL), never a term its name would match
- **`interface` sub-entries carry both halves of a control's text**: `label` is the
  label the user reads, `tooltip` its tooltip. Both resolve from the glossary — a
  button label must not be hardcoded in JS beside a glossary-resolved tooltip. Text shared
  by every table (the toolbar's Reset button) lives under `general.buttons.element_texts`,
  not once per table.

**API base**: `getApiBaseUrl()` (`services/apiClient.js`) resolves same-origin `api/`; the `?api=` override is accepted only over `http:`/`https:` to the page's own origin or a loopback host (`LOOPBACK_HOSTS` in `config/csp.mjs`, any port) and throws otherwise, since the glossary renders the payload's text as HTML.

---

## 11. Tooling & Linting

- **Build**: Vite (`vite.config.js`, four HTML pages, `api/` proxied to an optional API server; the demo datasets load from their folders under `public/data/`); runtime libraries: architecture.md §1.
- **Formatter**: oxfmt for JS, CSS and JSON (`.oxfmtrc.json`, which also holds the ignore list). Markdown and HTML are deliberately unformatted — emphasis-style rewrites and table realignment cost more review noise than they save. `npm run fmt` writes, `fmt:check` is the gate. `.editorconfig` (UTF-8, LF, four spaces) and `.gitattributes` (`eol=lf`) agree with them.
- **Linters, unused code, import boundaries, gate**: [architecture.md](architecture.md) §9.
- **Typecheck**: TypeScript 7's native `tsc` over `src/`, `packages/*/index.js`, `packages/*/src/**/*.js`, `config/`, `tools/` and `vite.config.js`, and the tests — `tests/` and `packages/*/test/` — in one config (`config/tsconfig.typecheck.json`; shared fakes and fixtures in the `support/` folders carry the types the tests build on): `checkJs` with `strict: true`, plus `noImplicitOverride` (every override carries `@override`), `noImplicitReturns` and `noFallthroughCasesInSwitch`; zero suppressions (`@ts-ignore`, `@ts-expect-error`, `@ts-nocheck`). The JSDoc type `object` is the real `object` type, so a property read on a value documented as `{object}` fails: an options bag or payload row gets a `@typedef` naming its fields (beside the code that owns the shape, imported elsewhere via `import('…').Name`), a map keyed by data gets `{[key: string]: T}`. Payload rows use the schema-inferred types (`common/data/schemas/`); `DocumentStore.get(name)` returns a document's schema type and `getDataset(KEY)` the builder's type, through each app's `DatasetKey<T>`-typed keys. Module options are typed per class (`XOptions`, see architecture.md §3) and app state per app (`EnState`, `MaState`, `SlState`; `BaseViewModule<TState>`). `any` is left only where honest: d3 parent/datum type parameters, Tabulator row data (`RowData`), and heterogeneous JSON (the glossary tree). Tabulator is typed by `@types/tabulator-tables`; what TBA3 reads beyond it (the build/teardown flags, a column's internal min-width) is declared in `config/tabulator.d.ts`. `ChartHostModule` is generic over its renderer, options, payload, controller and state (`ChartHostModule<TChart, TOptions, TData, TController, TState>`; its config adds the `publicAPI` verbs, `ChartHostConfig<TChart, TOptions, TData, TController, TApi, TState>`, and `createChart` returns the host typed with them, so no view casts it; a config's `*Host` typedef is the host plus its `*Verbs`, for fields that hold one). `typescript-eslint`, which `eslint-plugin-jsdoc` builds on, still needs the TypeScript 6 compiler API; npm installs that copy nested under the plugin.
- **Environment**: `.nvmrc` (`24`, matching the Dockerfile), `.npmrc` `engine-strict=true` against `engines.node`.
- **Coverage**: measured on demand (`npm run test:coverage`, v8, `include: ['src/**/*.js', 'packages/*/src/**/*.js']`), deliberately ungated — most of `src/` is render code that e2e covers, so a floor would push tests toward the wrong layer.

---

## 12. Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|-----------|
| Raw hex/px/font/spacing values in CSS | Use design tokens (`--fs-sm`, `--layout-gap`, `--card-pad`, `--color-border`) |
| A guessed width, count or ratio that switches a mode (layout, orientation, wrap, legend placement) | A fit test against the measured content it protects; a page-wide reflow uses `@media (--stacked-layout)` (§1.7), never a width of its own |
| A number in code restating a token or another constant (`12` for `--fs-sm`) | Read the token (`resolveChartTextSizePx()`) or derive from the constant |
| `font-size` outside the token system | Use `--fs-sm`, `--fs-base`, or `--fs-lg` (enforced by ESLint) |
| Raw `setTimeout` / `addEventListener` | Use `this.resources.trackTimeout()` / `trackDomListener()` |
| DOM element Tabulator formatters | String-based HTML formatters |
| Unescaped user data in HTML strings | `escapeHtml()` |
| `el.innerHTML = …`, `insertAdjacentHTML`, d3 `.html(markup)` | a lit-html template (`trusted()` for vouched markup), `setTrustedHTML()`; `replaceChildren()` to clear |
| lit-html `unsafeHTML()` / `unsafeSVG()` | `trusted()` from `@tba3/module-base` |
| A selector or id string to reach a module or a node inside one | The element itself, kept by whoever created it, or reached inside its owner (`requireEl(this, '#…')`) |
| `style="…"` in a markup string | A `data-*` attribute painted through CSSOM after insertion, or a class |
| `alert()` for a failure the reader must know about | `notifyFailure()` — exception to the console, glossary sentence to the toast |
| A markup string as a label to get an icon in | `textContent` plus `createIcon()` |
| `@param {object} options` on an options bag | A `@typedef` naming the fields |
| A `<div>` overlay with `aria-modal`, `inert` juggling or its own focus trap | A `<dialog>` through `ModalDialog` |
| A leaf reading `appState` for a mode / selection | Seed from an option, report through a callback option; the view observes state and wires siblings |
| Override `_renderContent()` in a ContentModule or view subclass | Implement `_renderBody()` / `_renderView()` |
| Override `connectedCallback`, `disconnectedCallback`, `update`, `updated` or another Lit hook in a module | `_setup()`, `_renderContent()` / `_renderBody()`, `_teardown()` (`tba3/module-element-contract`) |
| A public class field on a module (`items = []`) | A `#private` field, or a declared `static properties` entry initialized in the constructor |
| Pushing data through a verb (`module.update(data)`, `module.render(data)`) | Set the reactive property (`module.data = data`); `refreshContent()` reruns the pass without one |
| A fresh options object on every change, or setting `options` after connect | Options are fixed at connect — set them once in `create()`; what changes is a reactive property |
| `new XModule()` without id and options | `XModule.create(id, options)` (`ChartHostModule.createChart(id, config, options)`) |
| Forget `super._teardown()` | Always call it in `_teardown()` overrides |
| Create a new service instance | Use existing singleton or DI via options |
| Ad-hoc z-index values | Follow the z-index scale |
| Intermediate wrapper divs for layout | Place children directly in the module element; use flex/grid on it |
| Add a shared view helper for one call site | Keep child lookup local until reuse is proven |
| Local hard-coded percent/rating axis formatters | Use `chartAxisUtils.js` percent/rating helpers |
| `` `${x.toFixed(1)}%` `` anywhere | `formatPercent()` / `formatShare()` / `formatPercentPoints()` (§2.19) |
| A record field holding a formatted number | Store the number; format where it is shown |
| A `layout` literal restating defaults (zero axis maps, padding under the 4 px floor) | Pass only what differs |
| Manual grid lines or axis ink in renderers | Use `appendGridLines()`; ink comes from `chartRenderer.css` |
| Inline chart no-data HTML where shared messaging fits | Fail `validateData()` or use `renderNoDataOverlay()` (§2.20) |
| A per-chart hover, label colour, marker size or transition duration | The shared presets and tokens of §2.20 |
| A tooltip built as an HTML string, or a hardcoded row label | `TooltipContent` rows labelled from `TERM_CONSTANTS` (§2.12) |
