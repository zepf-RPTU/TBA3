# TBA3 Standards Reference

Quick-reference for all standardized patterns. Use this when building new modules, views, charts, or CSS to avoid introducing ad-hoc solutions.

---

## Table of Contents

- [1. Project Structure & File Naming](#1-project-structure--file-naming)
- [3. CSS Architecture](#3-css-architecture)
  - [3.1 Import Order](#31-import-order)
  - [3.2 Font Sizes](#32-font-sizes)
  - [3.3 Design Scales](#33-design-scales)
  - [3.4 View Header Layout](#34-view-header-layout)
  - [3.5 Z-Index Scale](#35-z-index-scale)
  - [3.6 Breakpoints](#36-breakpoints)
  - [3.7 Color System](#37-color-system)
  - [3.8 Accessibility](#38-accessibility)
- [4. Standardized CSS Classes](#4-standardized-css-classes)
  - [4.1 Layout Structure](#41-layout-structure)
  - [4.2 ContentModule Slots](#42-contentmodule-slots)
  - [4.3 Header Action Toolbar](#43-header-action-toolbar)
  - [4.4 Table System](#44-table-system)
  - [4.5 Layout Mode State](#45-layout-mode-state)
  - [4.6 Interactive States](#46-interactive-states)
  - [4.7 Stacked Bar Charts](#47-stacked-bar-charts)
  - [4.8 Progress Bars](#48-progress-bars)
  - [4.9 Tooltips](#49-tooltips)
  - [4.10 Glossary Popups](#410-glossary-popups)
  - [4.11 Mode Switch](#411-mode-switch)
  - [4.12 Sidebar](#412-sidebar)
  - [4.13 Export Components](#413-export-components)
  - [4.14 Chart Container](#414-chart-container)
  - [4.15 Chart Legends](#415-chart-legends)
  - [4.16 Chart Layout, Axes, Grid, And Empty States](#416-chart-layout-axes-grid-and-empty-states)
  - [4.17 Button Taxonomy](#417-button-taxonomy)
- [5. JS Architecture](#5-js-architecture) — hierarchy, lifecycle and coordination live in `architecture.md`; only the contracts below are kept here
  - [5.4 ChartHostModule Config](#54-charthostmodule-config)
  - [5.5 TableModule](#55-tablemodule)
  - [5.7 App Module](#57-app-module)
  - [5.8 ChartRenderer Lifecycle](#58-chartrenderer-lifecycle)
- [6. Naming Conventions (JS)](#6-naming-conventions-js)
- [7. Coordination](#7-coordination)
- [8. Services & DI](#8-services--di)
- [9. Resource Tracking](#9-resource-tracking)
- [10. Reactive State](#10-reactive-state)
- [11. DOM Conventions](#11-dom-conventions)
- [12. Data Conventions](#12-data-conventions)
- [13. Tooling & Linting](#13-tooling--linting)
- [14. Anti-Patterns to Avoid](#14-anti-patterns-to-avoid)

---

## 1. Project Structure & File Naming

The standing sources for project structure and file naming are
[architecture.md](architecture.md) — §1 for the top-level map and the annotated
`src/common/` map, the later sections for module boundaries, the JS module architecture and
lifecycle — and `tools/check-structure.mjs` for the rules that are actually enforced. This doc focuses on **CSS / visual standards**
(§3–§4) and terse **JS build-time conventions** (§5 onward).

---

## 3. CSS Architecture

All visual values come from CSS custom properties on `:root`. **Never use raw hex, px, spacing, or font-family values inline.** Always reference tokens from `src/styles/foundation/variables.css`.

### 3.0 View Placement Ownership

Top-level routed view placement belongs to the matching view stylesheet.

- JS view modules create semantic region wrappers such as chart, table, detail, filter, or aside regions.
- The view's own sheet (`<view>ViewModule.css` beside the view, layer `views`) assigns those regions to concrete grid rows, columns, or flex positions.
- A view sheet should not become a catch-all for reusable module skins, legends, or other non-placement surfaces; those belong beside the module that emits them (layer `modules`) or in `src/styles/`.
- Shared CSS may provide shells and structural primitives such as `view-base`, `view-section`, and `table-container`.
- Shared CSS must not decide where top-level routed view regions are placed.

Canonical example:
- [src/en/views/enItemViewModule.js](../src/en/views/enItemViewModule.js) creates chart, table, and detail regions.
- [src/en/views/enItemViewModule.css](../src/en/views/enItemViewModule.css) places those regions explicitly in the grid.

### 3.1 Import Order

Every app `main.css` (`src/{en,ma,sl}/main.css`) declares `@layer vendor, foundation, common, modules, views;` and then imports:

1. `src/styles/foundation/variables.css` — shared design tokens
2. `src/sl/variables.css` — SL's own tokens (SL only)
3. `@tba3/modules/styles/competence-levels.css`
4. `foundation/typography.css` — heading scale
5. `foundation/responsive.css` — fluid root font-size
6. `foundation/interactive.css` — interactive state utilities
7. `foundation/controls.css`, `foundation/buttons.css` — native control and button taxonomies
8. `foundation/layout-reset.css`
9. `src/styles/skeleton.css` — the cold-start skeleton (1–9 into `foundation`)
10. Shared shells and primitives into `common`: `view-layout.css`, `header-module.css`, `@tba3/modules/styles/modal-backdrop.css`, `notice-callout.css`, `preview-media.css`, `@tba3/modules/styles/{glossary-popup,html-legend-panel,stacked-bar,table-host}.css`, `export-capture.css`
11. The table stack (below)
12. One shared view sheet into `views`: `src/styles/welcome-splash.css` (EN, MA), `src/sl/charts-row.css` (SL)

Unit-owned sheets (module, chart config, view) are not listed; each unit imports its own.

Table stack:
- Tabulator and Quill CSS are imported into the `vendor` layer by the three dashboard entry sheets (`chooser.css` imports neither), `@tba3/modules/styles/table-base.css` and `table-header-layout.css` into `common`. The filter menu and progress-bar sheets are unit-owned (`tables/internal/tableFilterMenu.css`, `tables/progressBarColumn.css`, layer `common`) and arrive with their modules.
- An app's table overrides live beside its table module (`enItemTableModule.css`, `maStudentTablesModule.css`, `slBaseTableModule.css`) in the `modules` layer and win by layer, not by load order.

> **Note:** There is no `css/` tree: shared sheets live flat under `src/styles/` (plus `foundation/`), each app's entry sheet is `src/{app}/main.css`, and every unit-owned sheet sits beside its unit.

### 3.2 Font Sizes

**Strict 3-token system** — authoring uses three base tokens.

| Token | Value | Usage |
|-------|-------|-------|
| `--fs-sm` | `max(0.8125rem, 12px)` | Tables, dense labels, captions, badges, tooltips. The px floor is deliberate: the root is fluid (§3.6) and sits at 13px on a tablet, where the rem alone would be under 11px |
| `--fs-base` | `1rem` | Body text, buttons, inputs, descriptions, default chart typography |
| `--fs-lg` | `1.25rem` | Section intros, featured text, large labels, `h4` |

Headings use fixed sizes from `typography.css`: `h1` `--fs-h1` (2.125rem), `h2` `--fs-h2` (1.875rem), `h3` `--fs-module-title` (1.45rem), `h4` `--fs-lg`. Negative tracking (`-0.025em`) applies to `h1`/`h2` and the sidebar wordmark only, `h3` gets `-0.01em`, smaller headings none. `h5` and `h6` inherit the shared heading reset/color rules but do not define project-specific sizes.

Weights: `--fw-bold` (700) for every intentional emphasis, `--fw-semibold` (600) for secondary emphasis in charts and tables (axis captions, a highlighted footer row). D3 code sets weights as `var(--fw-…)` too; only canvas measurement (`textMeasurement.js`) takes a numeric weight, because `ctx.font` cannot resolve a custom property.

Line-heights: `--lh-icon` (1) for icon-only boxes and single-line badges, `--lh-ui` (1.3) for headings and controls, `--lh-text` (1.5) for anything that wraps to three or more lines. Prose surfaces cap their measure at 60–70ch (welcome greeting, tour card, info box, help view, summary empty state).

Text entry on a coarse pointer is floored at 16px (`controls.css`, `@media (pointer: coarse)`) so iOS Safari does not zoom into a focused field.

Chart policy:
- Chart SVG roots default to `--fs-base`.
- `src/styles/foundation/responsive.css` remains the only scaling mechanism; charts must not add independent responsive font math.
- Visible SVG chart text should inherit from the SVG root. When D3 or another generator injects font attributes, normalize those attributes at the renderer boundary instead of adding CSS selector nets.
- Chart-specific text-size exceptions use the token names `sm`, `base`, or `lg` and resolve to `--fs-sm`, `--fs-base`, or `--fs-lg`; do not use raw px chart font sizes.
- JS may resolve chart text tokens only for measurement or geometry calculations that require a concrete px value.

Font family (only one): `--font-family-main`, the system stack, set once on `body`. Charts, legends and tooltips inherit it; `themeService.js` reads the same token for chart text measurement. Do not introduce a second stack — a chart-only family matched the UI face on Windows and rendered a different one everywhere else.

### 3.3 Design Scales

**Spacing:** `--space-xs` 4px · `--space-sm` 8px · `--space-md` 16px · `--space-lg` 24px

Use primitive spacing tokens for tiny component geometry and to define the reduced shared spacing contract. New CSS should prefer the reviewed core tokens below instead of expanding the older alias families.

| Token family | Use |
|--------------|-----|
| `--layout-gap`, `--layout-gap-relaxed`, `--layout-gap-loose` | Shared internal stack/row/grid gaps |
| `--layout-pad`, `--card-pad`, `--card-pad-loose` | Shared body and card padding values |
| `--control-gap`, `--list-indent` | Tight control spacing and list indentation |
| `--view-padding`, `--header-padding` | Compound view/header shell padding contracts |
| `--notice-padding`, `--overlay-margin` | Shared callout and overlay shell spacing hooks |
| `--content-panel-padding` | Shared panel padding contract |

Retired aliases such as `--content-gap*`, `--content-card-padding*`, `--view-gap`, `--module-body-padding*`, and `--content-list-indent` should not be reintroduced. The migration-only spacing alias bridge in the shared token layer is now fully removed.

ContentModule header and subtitle padding are no longer shared `:root` tokens. That inset contract now lives in [packages/module-base/src/modules/contentModule.css](../packages/module-base/src/modules/contentModule.css) via module-scoped custom properties on `.module-container`, so module-owned overrides stay local to the ContentModule surface.

For internal wrappers, prefer `.layout-stack`, `.layout-row`, `.layout-row--wrap`, `.layout-grid`, and `.layout-grid--auto` from [src/styles/view-layout.css](../src/styles/view-layout.css). These helpers may define display, direction, wrap behavior, and gap via local custom-property overrides, but they must not own routed view placement or generic padding.

Shared inline placeholder and under-construction notices should compose `.notice-callout`, `.notice-callout-icon`, `.notice-callout-copy`, and `.notice-callout-message` from [src/styles/notice-callout.css](../src/styles/notice-callout.css). App CSS may keep semantic modifiers such as a secondary copy line or a mark-color override, but it should not restate the shared shell geometry, padding, border, or icon sizing.

Preview visuals emitted by the shared nav-card builder should compose `.preview-media` from [src/styles/preview-media.css](../src/styles/preview-media.css). Keep size, background, border, grid-row placement, and owner-specific artwork local to the owning stylesheet.

Routed view CSS still owns placement. Use `gap: var(--layout-gap)` or another explicit core token on the view-owned grid/flex selector instead of introducing specialized shared view-gap utilities or hard-coded `0.5rem` values.

**Border Radius:** `--radius-sm` 4px · `--radius-md` 8px · `--radius-lg` 12px

**Shadows:** `--shadow-sm` / `--shadow-md` / `--shadow-lg` (small → medium → large elevation) · `--shadow-focus` (focus ring, `0 0 0 3px var(--primary-color)`)

**Touch targets:** `--touch-target-min` 44px — the minimum box for a control a fingertip has to hit. Absolute px on purpose, unlike every other size token here: the rem scale resolves against the fluid root font-size, so a rem-based 44px is only 44px near a 1920px viewport and lands around 35px on a tablet. Consumed under `@media (pointer: coarse)` (see §3.8), and unconditionally by the one control that exists only for touch (`.glossary-popup-close`).

### 3.4 View Header Layout

One layout, identical in EN, MA and SL — owned entirely by
[src/styles/header-module.css](../src/styles/header-module.css)
and [src/common/modules/header/headerModule.js](../src/common/modules/header/headerModule.js):

```
[ title ]                     [ controls ]          [ notes | info ]
left, grid column 1           centered, col 2       right end, col 3
[ subtitle ..................................................... ]
row 2, spanning all three columns
```

The header container *is* the grid (`minmax(0,1fr) auto minmax(0,1fr)`). Columns 1 and 3 are
equal fractions, so the control cluster stays centered on the header no matter how wide the
title grows or how many action buttons a view shows. That symmetry also caps column 1 at
roughly a third of the header, which is too narrow for the long SL subtitles — so the subtitle
takes its own full-width row underneath instead of sharing the title column. A view without a
subtitle renders no second row. Every child pins its own `grid-row`/`grid-column`, so the DOM
order in `_doRender()` is the reading order, not the visual order.

At and below `1280px` the symmetry would starve the title (the actions column holds two icon
buttons yet is as wide as the title column), so the header drops to two columns and the
controls take their own row, left-aligned:

```
[ title ]                                           [ notes | info ]
[ controls ..................................................... ]
[ subtitle ..................................................... ]
```

Rules:
- **Titles left, actions right, controls centered.** There are no layout variants and no
  app-local header CSS. Do not re-declare `.header-module*` layout in an app's sheets.
- **Controls are declarative.** Add them to the view's entry in the app's
  `build*ViewHeaderConfigs()` (`src/{en,ma,sl}/*HeaderControls.js`, handed to
  `setViewHeaderConfigs()`) as `{ type, id, options }`, not as DOM built by a view or chart config. Use the shared
  container classes — `header-module-select` (+ `--wide`), `header-module-mode-switch`,
  `header-module-button-group` — rather than app-local names.
- **Control labels carry no trailing colon**, and segmented controls (`modeSwitch`,
  `buttonGroup`) carry no label at all — the buttons name themselves. Selects keep a label,
  since a collapsed dropdown only shows its current value.
- **Title icons come from `viewConfig`.** `HeaderOrchestrator.#resolveTitleIcon()` reads the
  view's own `viewConfig` entry for every app: `icon` names the Material Symbols glyph
  (`packages/module-base/src/utils/icons.js`).
- **Only notes and info live in the actions cluster.**
- **Subtitles come from the glossary and nowhere else.** `subtitle` on the view's
  `glossaryPath` entry is the only thing that sets a header subtitle, resolved in
  `resolveHeaderGlossaryConfig()` (`headerOrchestrator.js`). Do not declare a static
  `subtitle` in a `build*ViewHeaderConfigs()` entry or set one at
  runtime. A view with no `glossaryPath` — or whose entry has no `subtitle` — renders no
  subtitle. To add or change one, edit the view's own `<view>.glossary.json`
  fragment (§12 Glossary).

`ContentModule` card headers follow the same rule: title left, actions right, unconditionally.
The one module-local control strip that sits outside a header is a justified exception, ruled
in §4.3 Header Action Toolbar.

### 3.5 Z-Index Scale

| Z-Index | Component |
|---------|-----------|
| `2` / `3` | `.report-card` while revealed (hover, focus, `.is-active`, drag) / `.report-card-toolbar` — local to the report's page stack, not the shell scale |
| `10` | `.content-module-header` |
| `101` | `.header-module-actions` |
| `1000` | `.sidebar`, header-action dropdowns, `.batch-export-toolbar` (`--z-shell`) |
| `9999` | `.sl-detail-overlay`, `.tutorial-tour-overlay` |
| `10000` | `.tooltip` |
| `10001` | `.glossary-popup` |

### 3.6 Breakpoints

Root `font-size` is fluid (`responsive.css`): `clamp(0.8125rem, 0.7rem + 0.24vw, 1.125rem)`, so every `rem` token scales with the viewport and browser zoom still applies. What it resolves to:

| Viewport width | Root font-size |
|----------------|---------------|
| `768px` | `13.0px` |
| `1024px` | `13.7px` |
| `1280px` | `14.3px` |
| `1920px` | `15.8px` |
| `≥ 2800px` | `18px` (cap) |

Sizes that must not follow the root carry a px floor (`--fs-sm`) or are px outright (`--touch-target-min`).

Structural breakpoints are viewport media queries on three canonical tiers (`responsive.css` names them; new responsive CSS conforms to them rather than adding a width of its own):

| Tier | What changes |
|------|--------------|
| `≤ 1280px` | Multi-column views stack into full-height cards (`--stacked-card-height`, which subtracts `--stacked-card-peek` so the next card's header stays visible past the fold); `.view-base` becomes a size container for `cqh`; the view header drops to two columns with the controls on their own row (§3.4); SL scrolls the whole page. |
| `≤ 1024px` | Chart legend panels move below their chart (`html-legend-panel.css`); the SL summary lowers its chart floor. |
| `≤ 768px` | Reflow tier (WCAG 1.4.10): header and card action clusters wrap, segmented groups wrap inside them, the export toolbar and the scatterplot filter stack. |

Direction-dependent geometry uses logical properties (`margin-inline-start`, `inset-inline-end`, `border-start-start-radius`, `text-align: start`). Physical `left`/`right` stay only where the geometry is physical: boxes a service positions from measured coordinates (tooltip, glossary popup, tour card, report cards), `translateX(-50%)` centring, and the export capture's off-screen park.

### 3.7 Color System

Colors are organized by purpose:

| Group | Key Tokens |
|-------|-----------|
| **Theme** | `--primary-color`, `--primary-hover`, `--secondary-color`, `--primary-color-light` |
| **Text** | `--text-color`, `--text-secondary`, `--text-muted`, `--text-on-primary` |
| **Backgrounds** | `--color-background`, `--color-background-secondary`, `--color-background-hover`, `--color-card-background` |
| **Borders** | `--color-border`, `--color-border-light`, `--color-border-medium` |
| **Semantic** | `--success-color`, `--error-color` |
| **Table** | `--table-row-bg`, `--table-row-hover-bg`, `--table-header-bg` |
| **Charts** | `--chart-domain0-color`, `--chart-domain1-color`, `--chart-grid-color` |
| **Comparison** | `--student-performance-color`, `--class-average-color`, `--school-average-color`, `--state-average-color` |
| **Results** | `--result-correct`, `--result-incorrect`, `--result-not-attempted` |

Derived colors use `color-mix()` from `--primary-color`:
```css
--primary-color-light: color-mix(in srgb, var(--primary-color, #3b82f6) 10%, var(--color-background));
```
Changing `--primary-color` re-themes all derived values.

All three apps share one `--primary-color: #3b82f6` (`src/styles/foundation/variables.css`); no app overrides it. `src/sl/variables.css` holds only SL's own tokens (semantic chart colours, rating bands, group and row colours). `themeService.js` falls back to `#4a69bb` only when the property is unset.

#### Competence-level (Kompetenzstufen) colors

These are **not** CSS variables. The scale varies by state — `A1–C1`, `A1.1/A1.2/…`,
`k.h.N., KS 1 … KS 5`, `Ia/Ib/II–V` — so the band count is only known once
`competence-levels.json` has loaded. `packages/modules/src/common/services/competenceLevelPalette.js`
registers the scale at load time, `competenceLevelColors.js` beside it generates a ramp for
its band count, and each
renderer stamps the resolved color on its element as `--ks-band-color`; the paint rules
live in `@tba3/modules/styles/stacked-bar.css`.

The ramp has one step per **band**. Levels sharing a band (`Ia`/`Ib`, `A1.1`/`A1.2`) are
separated by lightness: the highest keeps the band's color and each step down darkens by
`SUB_BAND_STEP`. Every level paints one plain solid fill — no hatch, stripe or pattern —
and lines and lollipop stems are drawn solid; colour is the only channel a band has.

Four themes, picked in the sidebar and toggled by `data-ks-theme` on `<html>`: `default`
(validated diverging ramp, green at the centre band of whatever ladder the payload
declares — the ramp is resampled to the band count and knows no KMK standard), `grayscale`,
`colorblind` (Okabe-Ito), and `data`
("Landesvorgabe") — the state's own colors, offered only when the payload carries them.

**Every generated theme has two sets of stops, one per colour scheme** (`RAMP_STOPS.light`
/ `RAMP_STOPS.dark` in `packages/modules/src/common/services/colorRamp.js`), and the palette picks the set
from `data-color-scheme` on `<html>` — the attribute `colorSchemeService.js` writes from
the sidebar's System / Hell / Dunkel choice. The dark set is its own validated ramp, not a
runtime inversion: each chromatic stop is the light stop lifted in OKLCH lightness with hue
and chroma kept, measured with the dataviz validator
(`node <dataviz skill>/scripts/validate_palette.js "<stops>" --mode dark --surface "#1e2430"`,
`--ordinal` for grayscale) until every stop clears 3:1 on the dark card surface and sits
inside the dark lightness band, with band separation no worse than the light ramp's — the
bar is "the same profile as light, on the dark surface". Okabe-Ito keeps its published hues and only lifts the blue
that fell to 3.0:1; the grayscale ramp is re-lit dim→bright so step 5 stays the emphatic
end, and those five are also the dark `--gray-1…5`. The surface each scheme paints on is
`SURFACES` beside the stops and must equal that scheme's `--color-card-background`. Sub-band
shading steps *away from the surface* — darker on white, lighter on dark — so it can only
raise contrast.

Those colors arrive on the **value-group**, as `properties[].key = "levelColor:<level id>"`
keyed on `competenceLevels[].id`, and from nowhere else. `items.json` does put a hex
literal in an item level's own `description`, but that colour never reaches a scale:
`collectItemScaleLevels` drops item colours deliberately, so item marks are painted from
the reporting ramp and match the student charts beside them. A shipped color
that does not clear `MIN_SURFACE_CONTRAST` against the **active scheme's** chart surface
falls back to the generated ramp for that band — NRW prescribes `#ffffff` for `KS 1`,
which paints nothing on white and is perfectly visible on the dark surface, so the gate is
applied when the palette is resolved, not when the payload is registered.

Everything that paints a band uses `--ks-band-color`, stamped per element — there is no
global set of band variables. That includes the decorative MA thumbnails (nav card,
sidebar, view title): they carry no data of their own, so they illustrate the leading
registered scale, but they are drawn as SVG by `src/common/modules/bandThumbnail.js`
with one stamped node per band rather than a gradient with a fixed number of stops.

### 3.8 Accessibility

Applied consistently across components:

- `@media (prefers-contrast: high)` — visible borders, no text-shadow
- `@media (prefers-reduced-motion: reduce)` — disables transitions/animations
- `:focus-visible` — box-shadow ring via `--shadow-focus`
- Semantic `cursor` changes (`help` for glossary, `pointer` for interactives)
- `@media (pointer: coarse)` — raises hit areas to `--touch-target-min` (icon buttons, nav rows, tab strips, dropdown options, table column titles)
- `@media (hover: hover)` — gates a reveal that needs a hovering pointer, always paired with an ungated twin (`:focus-visible`, a state class) so the affordance still exists without one
- `@media (hover: none)` — the touch-only fallback for such a reveal, where one is wanted at all
- `@media not (any-pointer: coarse)` — hides a control that exists *only* for touch; `any-pointer` rather than `hover`, because a hybrid device reports `hover: hover` and still has a touchscreen

**Which axis to gate on.** CSS media queries answer *what this device has* and are fixed for the page; `event.pointerType` answers *what the user is doing right now* and changes mid-session on a hybrid. A hidden control whose JS gate is per-interaction must therefore not be gated on `hover`/`pointer` — a touchscreen laptop reports `hover: hover` / `pointer: fine` and would lose the control while the gate that needs it stays live. Gate device capability in CSS, interaction modality in JS, and when the two must agree, gate the CSS on `any-pointer`.

---

## 4. Standardized CSS Classes

### 4.1 Layout Structure

| Class | Purpose |
|-------|---------|
| `.main-content` | Root app container (`margin-left: 60px` for sidebar) |
| `.view-base` | View root — flex-column, tinted bg, semantic `--view-padding` / `--layout-gap` spacing |
| `.view-section` | Structural wrapper for layout regions inside views |
| `.module-container` | Card shell (bg, border, radius, flex-column) |
| `.module-container.collapsed` | Hides subtitle/body/actions |

### 4.1a Preview Media

| Class | Purpose |
|-------|---------|
| `.preview-media` | Shared centered visual slot for nav-card preview icons/charts |

`src/styles/preview-media.css` owns the shared centering, flex-shrink, and border-radius contract for preview visuals. App CSS should own only the media's size, background, border, placement, and feature-specific artwork.

### 4.2 ContentModule Slots

| Class | Purpose |
|-------|---------|
| `.content-module-header` | Title bar — flex row |
| `.content-module-header.collapsible` | Click-to-collapse variant |
| `.content-module-title` | `h3` inside header |
| `.content-module-header-actions` | Right-aligned toolbar slot |
| `.content-module-subtitle` | Description below header |
| `.content-module-body` | Scrollable content area |
| `.content-module-chevron` | Collapse arrow; `.expanded` rotates 90° |

ContentModule owns the shared slot contract for `.content-module-header`, `.content-module-title`, `.content-module-subtitle`, and `.content-module-body`. Feature CSS should not target those slot selectors directly; use feature-local wrappers or feature-local classes instead. The explicit shared exception is `@tba3/modules/styles/table-host.css`, which composes the `.content-module-body.has-table` table-host variant.

### 4.2a Notice Callout

| Class | Purpose |
|-------|---------|
| `.notice-callout` | Shared inline notice / under-construction shell |
| `.notice-callout-icon` | Leading icon slot sized by `--notice-icon-size` |
| `.notice-callout-copy` | Optional stacked text wrapper for multi-line notices |
| `.notice-callout-message` | Primary notice text |

`src/styles/notice-callout.css` owns the shared callout shell used by MA help notices, EN item-detail placeholders, SL material under-construction states, and similar module-local notes. Keep semantic wrapper classes only when they still carry owner-local meaning or modifiers; do not duplicate the shell in app CSS.

### 4.3 Header Action Toolbar

| Class | Purpose |
|-------|---------|
| `.btn.btn--icon` | Shared compact toolbar/icon button surface |
| `.btn--size-toolbar-xs` | Shared smaller compact-action side length |
| `.btn.btn--icon.is-active` | Toggle active state |
| `.header-action-dropdown-wrapper` | Shared relative shell for helper-driven dropdown controls |
| `.header-action-dropdown` | Positioned dropdown menu |
| `.header-action-dropdown.show` | Visible state |
| `.header-action-dropdown--scrollable` | Max-height scrollable variant |
| `.header-action-menu-item-content` | Shared inner row shell for dropdown items |
| `.header-action-menu-item-leading` | Optional leading slot; hidden when empty |
| `.header-action-menu-item-label` | Shared label slot for dropdown items |

For `ChartHostModule`-backed charts, mount HTML header actions into `host.headerActionsContainer` and prefer the shared builders in `packages/modules/src/common/charts/host/chartHeaderControls.js` (`ensureHeaderActionButton()`, `ensureHeaderActionCheckboxDropdown()`) instead of per-chart DOM setup. Keep chart-specific state mutation local to the chart/config; the shared helper should only own DOM reuse, ARIA wiring, and dropdown toggling.
When a chart header button has no owner-local CSS, use a stable `data-chart-action="..."` selector for behavior lookup instead of introducing a feature class just to find the button again.

The ⌀ comparison control (toggling which reference series are visible) goes through `ensureComparisonModeDropdown(host, comparisonState, getModes)` in `packages/modules/src/common/charts/host/comparisonModeControl.js`: it builds the dropdown with `ensureHeaderActionCheckboxDropdown()` into `host.headerActionsContainer`, removes it when `getModes()` returns nothing, and builds none when the comparison state has no `setActive`. Controls one view drives across several hosts are not chart-header controls: the SL longitudinal view's three switches are declared in `slHeaderControls.js` as app-state writes the view observes.

A module-local strip mounted inside the chart card is an exception, allowed only when the controls must participate in body layout rather than header layout. The SL group comparison chart uses that pattern — a wrapped select strip inserted directly above `.content-module-body` by `groupComparisonConfig.js` — and it is a **justified** case, for three reasons. Its six selects (`chartType`, `subjectIndex`, `scopeFilter`, `category`, `group1`, `group2`) measure themselves and each hold an `11.25rem` preferred-width floor, which the single-line, non-wrapping `.content-module-header` cannot carry alongside a title and the export/info/notes cluster. App-header controls earn their keep where one view drives several chart hosts (longitudinal: three hosts, three controls); `comparisonViewModule` owns exactly one host, so there is nothing to share and the app header would be hosting a single module's chrome. And `.content-module-body` is `overflow: auto`, so controls placed inside it would scroll away with the chart — the body-layout participation this exception exists for.

Button and control groups should reuse existing families before adding local skins: `.btn.btn--icon` for square icon utilities, `.mode-button` composed with `.btn` inside a `.btn-group--segmented` for segmented text choices, `.legend-pill` composed with `.btn` for HTML legend toggles, and export buttons through the export wrapper. Keep spacing semantic-token-based and group-owned (`--btn-group-gap`, `--layout-gap*`, `--control-gap`, `--control-strip-*`); avoid one-off margins between sibling buttons unless the surrounding layout is genuinely unique.
When a compact action needs a stable lookup hook but no owner-local styling, prefer `data-header-action-button="..."`, `data-header-action-control="..."`, or `data-chart-action="..."` instead of introducing a feature class.
The same rule applies to owner-local module buttons once styling is gone: use dedicated hooks like `data-batch-export-action` or `data-table-preset-button` rather than keeping styling-era classes on the button element.
When a compact action needs the smaller shared side length, add `.btn--size-toolbar-xs` instead of a feature-local `--btn-height-toolbar` override.
Segmented owners should prefer shared `--btn-segmented-*` tokens for min-width, white-space, borders, and active/hover surface tuning before adding direct button declarations.
Category 3 currently spans three deliberate shared families: segmented text choices (`.mode-button`, the segmented buttons of the `buttonGroup` header control, and the remaining preset/material data-hook flows on shared segmented buttons), pill toggles (`.legend-pill`), and toolbar-style icon tabs (`.info-box-section-btn`). Standardization work in this category should stay inside the segmented family and should not collapse pills or icon tabs into it.
The `buttonGroup` header control has no module of its own: `HeaderModule` builds it as a `ModeSwitchModule` (`headerModule.js`) with the `header-module-button-group` container and `button-group-row` row classes, which have a shared CSS contract in `src/styles/header-module.css`. `@tba3/module-base/modules/header/segmentedButtonBuilder.js` owns shared segmented row/button DOM assembly for `ModeSwitchModule` and `TablePresetManager`. If the button-group container pattern later spreads beyond header-owned surfaces, promote that CSS contract into a broader common stylesheet rather than duplicating it ad hoc.

### 4.3a Shared Native Controls

Native `<select>` controls are a separate shared family from button-triggered dropdown menus.

| Class | Purpose |
|-------|---------|
| `.control-field` | Shared vertical field wrapper for labeled controls |
| `.control-field--inline` | Shared inline field wrapper for header/detail controls |
| `.control-label` | Shared label styling for control labels |
| `.control-select` | Shared native select surface and interaction contract |

`src/styles/foundation/controls.css` owns the shared native control contract. `SelectControlModule`, `StudentSelectorModule`, and the SL group comparison controls all compose the shared base classes directly. Owner stylesheets should keep width, layout, and token overrides local via `--control-*` variables instead of restating border, radius, hover, focus, or disabled behavior.

When styling native selects, prefer shared `--control-*` tokens over generic interaction utilities such as `.interactive`, `.hover-border`, or `.hover-color`. Those interaction states now belong to `.control-select` itself.

### 4.4 Table System

| Class | Purpose |
|-------|---------|
| `.table-container` | Inner Tabulator host inside table modules |
| `.content-module-body.has-table` | Flex column for table hosting |
| `.info-table-section` | Natural-height student info table region |
| `.data-table-section` | Flexible student data table region |
| `.table-preset-container` | Flex row of filter buttons |
| `[data-table-preset-button="true"]` | Preset filter behavior hook on a shared segmented button |
| `[data-table-preset-action="reset"]` | Reset behavior hook on a shared segmented button |
| `.cell-wrap-text` | Tabulator cell text wrapping |

`@tba3/modules/styles/table-host.css` owns the shared table-host contract (`.table-container`, `.content-module-body.has-table`, `.info-table-section`, `.data-table-section`). `packages/modules/src/common/tables/internal/tablePresetManager.css` keeps the preset-button container rules, and `@tba3/modules/styles/table-base.css` keeps Tabulator visual overrides.

### 4.5 Layout Mode State

These state classes are emitted by MA layout views, but the matching view stylesheet owns the actual placement rules.

| Class | Purpose |
|-------|---------|
| `.layout-mode-both` | View-defined split placement is active |
| `.layout-mode-table-only` | View-defined table-only placement is active |
| `.layout-mode-chart-only` | View-defined chart-only placement is active |

### 4.6 Interactive States

**Layer 1 — Composable primitives:**

| Class | Effect |
|-------|--------|
| `.interactive` | Cursor pointer + transition |
| `.hover-border` | Border on hover |
| `.hover-color` | Text/icon color on hover |
| `.disabled-soft` | Opacity only (keeps events for tooltips) |

**Layer 2 — Bundled presets:**

| Class | Combines |
|-------|---------|
| `.interactive-card` | hover background + lift + press + focus-visible ring |
| `.interactive-subtle` | hover background + focus-visible ring |

Override `--interactive-hover-bg` or `--interactive-hover-color` per element to customize. `interactive-button`, `hover-bg`, `hover-shadow`, and `focus-ring` are retired from the shared runtime contract unless a new generic non-button surface proves they are needed again.

### 4.7 Stacked Bar Charts

| Class | Purpose |
|-------|---------|
| `.stacked-bar-container` | Flex row container |
| `.stacked-bar-segment` | Individual bar segment |
| `.stacked-bar-label` | Text label inside segment |
| `.stacked-bar-group` `.bar-segment` | SVG bar group and segment rect (`barChartRenderer.js`) |
| `.bar-segment.highlighted` | Highlighted SVG segment (stroke) |
| `.competency-level` | Competence-band paint from the stamped `--ks-band-color` (`.stacked-bar-segment` and `.bar-segment`) |
| `.level-<token>` / `.segment-<field>` | Per-level selector and test hooks set by JS; no CSS paints them |

Default stacked-bar label sizing stays owned by `@tba3/modules/styles/stacked-bar.css`. When a stacked bar is rendered inside `.chart-container`, the container overrides the label token to `--fs-base`, so chart/detail surfaces inherit chart typography without changing table defaults.

SVG segment labels are tiered: `createSVGStackedBar` asks the `labelFormatter` for the long form (`{ withShare: true }` → `A2 · 32 %`), measures it against the segment, then tries two lines in a tall vertical segment (`{ lines: true }` → `['A2', '32 %']`), then the short form. Every competence bar uses `levelShareLabelFormatter` from `stackedBarUtils.js`; a formatter that ignores the tier keeps its one label.

### 4.8 Progress Bars

| Class | Purpose |
|-------|---------|
| `.percentage-bar-container` | 18px bar background |
| `.bar-stack` | Flex row |
| `.bar-correct` | Green segment |
| `.bar-incorrect` | Red segment |
| `.bar-not-attempted` | Gray segment |

### 4.9 Tooltips

| Class | Purpose |
|-------|---------|
| `.tooltip` | Hidden base tooltip (appended to `<body>`) |
| `.tooltip.tooltip-chart` | Chart tooltip variant |
| `.tooltip.visible` | Shown state |
| `.tooltip.interactive` | Pointer events when visible |
| `.tooltip-title` | Bold header with underline |
| `.tooltip-row` `.label` + `.value` | Data row |
| `.tooltip-divider` | Section separator |

Chart-created cursor tooltips use the `.tooltip-chart` variant directly. Delegated tooltips triggered from inside `.chart-container` are promoted to the same variant at runtime because the shared popup element is appended to `<body>`.

### 4.10 Glossary Popups

| Class | Purpose |
|-------|---------|
| `.glossary-term` | Dotted-underline annotation (`cursor: help`) |
| `.glossary-popup` | Rich popup container |
| `.glossary-popup.visible` | Shown state |
| `.glossary-popup-title` | Bold header |
| `.glossary-popup-body` | HTML content |
| `.glossary-popup-close` | Dismiss button, rendered only into tap-opened popups; sized from `--touch-target-min` unconditionally |

### 4.11 Mode Switch

| Class | Purpose |
|-------|---------|
| `.mode-switch` | Flex-column container |
| `.mode-switch-buttons` | Flex row |
| `.mode-button` | Toggle button |
| `.mode-button.is-active` | Active state |

### 4.12 Sidebar

| Class | Purpose |
|-------|---------|
| `.sidebar` | Fixed left, 60px collapsed, 250px expanded |
| `.sidebar.is-expanded` | Expanded by a tap; set by `SidebarModule`, never by a mouse click |
| `.sidebar-nav-button` | Nav item |
| `.sidebar-nav-button.is-active` | Active nav |
| `.sidebar-nav-icon` | Always visible icon |
| `.sidebar-nav-text` | Nav label, revealed with the rail |

The rail is a disclosure, and every reveal it performs exists three times over: `:hover` inside `@media (hover: hover)`, plus two ungated twins — `:has(:focus-visible)` for a keyboard, and `.is-expanded` for a tap. All three must list the same elements, so a newly revealed element needs adding to each. `.sidebar ~ .main-content` keeps its static 60px offset throughout: the expanded rail overlays the content rather than reflowing the dashboard.

Sidebar current-view buttons are navigation state, not toggle state. Keep `.is-active` paired with `aria-current="page"` on the current view button; do not use `aria-pressed` for this state. Both are owned by `SidebarModule.setActiveView()`.
The same current-view rule applies to `NavCardModule` preview items: the current destination should carry `aria-current="page"` and should not keep the clickable `role="button"` / `tabindex` pair.

### 4.13 Export Components

| Class | Purpose |
|-------|---------|
| `.module-export-button-wrapper` | Export + batch buttons wrapper (module-owned) |
| `[data-header-action-button="export-trigger"]` | Single-download trigger inside the wrapper |
| `.header-action-dropdown-option` | Shared header dropdown item style for export and non-export menus |
| `[data-header-action-button="batch-select"]` | Batch selection toggle using the shared toolbar selected state |
| `.batch-export-toolbar` | Fixed bottom toolbar |
| `.batch-export-toolbar.visible` | Slide-up animation |
| `.export-capture-stage[data-exporting]` | Off-screen clone host used while a module is rasterized (`src/common/export/exportCapture.js`) |
| `.export-print-table` / `.tabulator-print-table` | Tabulator HTML output substituted for the live table inside the capture clone |
| `.report-view` / `.report-toolbar` / `.report-scroll` / `.report-pages` / `.report-sheet` | Report view root, its toolbar (`[data-report-action="export|clear"]`), the scroll shell, the page stack (`[data-columns]`) and one A4 sheet (`src/common/views/report/reportViewModule.js`) |
| `.report-card[data-span]` | One captured module in the report; width from `data-span`, order from `data-reportOrder`, page from `data-page`, half from `data-align`; `.is-active` when selected |
| `[data-report-card-action="drag|span|up|down|remove"]` | Card toolbar controls; the `span` buttons carry `data-span` + `aria-pressed` |

`packages/module-base/src/modules/contentModule.css` owns `.module-export-button-wrapper` because ContentModule owns export placement in the module header action slot. `packages/module-base/src/modules/header/headerActionDropdown.css` owns only the generic dropdown wrapper/menu layout. `src/styles/export-capture.css` owns the stage and the `[data-exporting]` overrides (unclipped bodies, motion off, print-table sizing); it may target `.module-container` / `.content-module-body` because it is shared CSS. `src/common/views/report/reportViewModule.css` owns the report view and its cards (deliberately not `.module-container` cards — they are images with a control strip, and must not be picked up by `resolveCaptureRoot()`).

### 4.14 Chart Container

| Class | Purpose |
|-------|---------|
| `.chart-container` | Full-size box with padding and chart typography shell |
| `.chart-container svg` | SVG fills container and inherits chart font family/size/color |

`packages/modules/src/common/charts/renderers/chartRenderer.css` owns `.chart-container`. It is the common typography boundary for hosted charts: `font-size: var(--fs-base)` (the family is inherited from `body`) and the chart-context stacked-bar label override live there, so app-specific chart CSS should inherit from this shell instead of redefining chart font sizes.

### 4.15 Chart Legends

Charts use three explicit legend modes. All SVG legends are measured; responsive behavior is expressed as a measured layout policy rather than a separate legend type.

| Mode | Use when | Standard pieces |
|------|----------|-----------------|
| SVG measured | The legend is a static or state-reflecting key inside the SVG. | `this.legend` (`LegendRenderer`): `createLegend()`, `measureLegendSize()`; the renderer's `initializeSVG({ legendConfigs })`, and `legendIndex` or measured slot positioning. Use `resolveMeasuredLegendLayout()` for candidate layouts, `resolveAdaptiveLegendLayout()` for bottom/top overflow, and stacked `legendConfigs` plus `resolveStackedLegendLayout()` and `createLegendStack()` for multiple legend blocks in one slot. |
| HTML panel | The legend is also a control surface, such as toggle pills or side-panel visibility controls. | `renderer.htmlLegend` (`HtmlLegendController`: sections → pills, persisted visibility state, `minVisible`, master / toggle-all), the DOM primitives in `charts/legend/htmlLegendPanel.js`, `.chart-with-legend-panel`, `.chart-svg-area`, `.chart-legend-panel`, and shared legend pill CSS. |
| None / embedded | Axes, labels, tooltips, controls, or chart geometry already explain the encoding. | Document the rationale; do not add empty placeholder legends. |

Legend pills are quiet chips (`@tba3/modules/styles/html-legend-panel.css`): surface fill, 1 px hairline, semibold ink, the swatch as the only colour; active is the selected-row contract (primary tint plus an inset accent edge), inactive a dashed hairline in secondary ink. A chip never wraps inside a word — the panel grows to its widest chip (`max-content`, capped).

Pill `data-type` is the state group and `data-value` the key. Visibility state, last-visible-item floors and master/child sync live in the controller; how a hidden key leaves the SVG stays in the owning renderer (its `onChange` applier).

The consolidated chart standardization reference — family inventory and accepted exceptions — is §§4.14-4.16 of this document.

### 4.16 Chart Layout, Axes, Grid, And Empty States

Shared chart mechanics live in `packages/modules/src/common/charts/chartDefaults.js`, `packages/modules/src/common/charts/chartAxisUtils.js`, and `packages/modules/src/common/charts/renderers/chartRenderer.js`. Use these helpers for repeated policy; keep chart-specific geometry in the owning renderer.

| Concern | Standard pieces | Use |
|---------|-----------------|-----|
| Layout presets | `chartLayoutPreset()`, `mergeChartLayout()`, `CHART_LAYOUT_PRESETS` | Start from `noLegend`, `paddedNoLegend`, `compactNoAxis`, `bottomLegend`, `rightLegend`, or `squareBottomLegend`, then pass only meaningful overrides. |
| Percent axes | `createPercentAxis()`, `measurePercentAxisSpace()`, `formatPercentTick()`, `getPercentTicks()` | Use for 0-100% axes, percent tick labels, and percent-axis margin measurement. Prefer `step` on `createPercentAxis()` over local `tickValues` arrays when the axis should use a standard 10% or 20% grid. |
| Rating axes | `createRatingAxis()`, `measureRatingAxisSpace()`, `formatRatingTick()`, `getRatingTicks()` | Use for 1-5 rating scales and teaching-quality/self-efficacy axes. |
| Category axes | `measureCategoryAxisSpace()` | Use for label-based axis margin measurement, even when the actual D3 category axis remains local. |
| Edge labels | `measureEdgeTickReserve()`, `measurePercentEdgeTickReserve()`, and `AXIS_DEFAULTS.edgeTickBuffer` | Reserve side/top space for first/last tick labels and hover markers without local magic numbers. Use the percent-specific helper for the common `100%` reserve. |
| Tick density | `getResponsiveTickCount()` and `AXIS_TICK_COUNTS` | Use shared compact/dense tick-count policy instead of local height ternaries. |
| Grid lines | `this.grid.createGridLines()` (`GridRenderer`) | Use shared dash, opacity, color, and domain-removal behavior for standard background grid lines. |
| Empty states | `showNoDataMessage()`, `renderNoDataOverlay()`, `clearNoDataOverlay()` | Use full-container messages for missing chart data and SVG overlays for filtered in-chart empty states. |

Accepted exceptions stay explicit: threshold scatterplots, radar/spider geometry, MA task rings, SL group-comparison pyramids, and SL competency-detail teaching-quality overlays may keep local geometry. They should still reuse shared formatters, layout presets, no-data helpers, or axis factories where this does not distort the chart semantics.

### 4.17 Button Taxonomy

Shared button primitives and group contracts live in `src/styles/foundation/buttons.css`,
imported after `src/styles/foundation/interactive.css`. Shared header-action dropdown
shell/layout lives in `packages/module-base/src/modules/header/headerActionDropdown.css`, a unit sheet
that `headerActionDropdown.js` imports into `@layer common`. New button work composes the shared classes
below and keeps feature-level token overrides, shell/layout, and surrounding structure in
the owning module or view stylesheet.

The vocabulary is deliberately small. It is the whole of it — there is no wider taxonomy to
reach for, and a role that is not listed here is expressed by composing these classes plus
token overrides, not by inventing a new `.btn--*` name.

| Shared class | Role |
|--------------|------|
| `.btn` | The base surface every button carries. Nothing else paints a button background |
| `.btn--icon` | Icon-only square utility (header actions, export triggers, toggles, overlay close) |
| `.btn--text` | Text-first button with optional leading icon (sidebar nav, menu rows) |
| `.btn--item` | List-row button inside a dropdown or picker |
| `.btn--primary` | The one emphasised action in a group |
| `.btn--size-control` | Standard workflow/modal action size |
| `.btn--size-toolbar-xs` | Reduced compact toolbar/icon side length |
| `.btn-group` | Row wrapper; owns the gap between siblings |
| `.btn-group--segmented` | Mutually exclusive controls, joined radii |
| `.btn-group--wrap` | Wrapping variant of `.btn-group` |
| `.btn-stack` | Vertical modal/sidebar action stack |

The compact toolbar/icon size contract is intentionally small: the default
`--btn-height-toolbar` plus the named `--btn-height-toolbar-xs` and
`--btn-height-toolbar-lg` steps. One-off larger treatments size locally in the owning
stylesheet. Retired aliases such as `--btn-compact-side`, `--btn-height-toolbar-sm`,
`--btn-height-toolbar-md`, and the former shared `--btn-height-toolbar-xl` step stay
deleted unless a new shared size step proves necessary.

**Local variation goes through tokens, never through a competing surface rule.** Because
the cascade is layered (§4.1), a sheet outside `foundation` cannot beat `buttons.css` on
specificity, so a feature that needs a different look sets the live custom properties on
its own class instead: `--btn-fill`, `--btn-hover-fill`, `--btn-active-fill`,
`--btn-active-hover-fill`, `--btn-disabled-opacity`, `--btn-radius`, `--btn-padding-block`,
`--btn-padding-inline`, `--btn-gap`, `--btn-group-gap`, `--btn-icon-size`, and the three
`--btn-height-toolbar*` steps. That list is exhaustive; a token not defined in
`buttons.css` sets nothing.

Owner-local classes compose with `.btn` rather than replacing it — `.mode-button` for
segmented text choices and `.legend-pill` for HTML legend toggles are the two families
that carry owner meaning on top of the shared surface. Group layout belongs on the group
wrapper, not on individual buttons, and spacing stays on semantic tokens
(`--btn-group-gap`, `--layout-gap*`, `--control-gap`, `--control-strip-*`) rather than
one-off margins between siblings.

Canonical runtime state classes are the `is-*` forms for non-native state: `.is-active`,
`.is-selected`, and `.is-inactive`. Real disabled state uses the native `disabled`
attribute, not `.is-disabled` or `.disabled`; `.disabled-soft` in
`src/styles/foundation/interactive.css` mutes a non-button surface that must keep its
events (e.g. for tooltips). Toggles keep
`aria-pressed`; checkbox dropdown items keep `role="menuitemcheckbox"` and `aria-checked`.

When a button needs a stable lookup hook but no owner-local styling, use a data attribute
rather than a feature class: `data-header-action-button`, `data-header-action-control`,
`data-chart-action`, `data-batch-export-action`, or `data-table-preset-button`.

Every button glyph is a Material Symbols icon through `@tba3/module-base/utils/icons.js`
(structure-check rule `icon-sources`). The one exception is the Ø averages mark on the
comparison-mode button, a typographic sign the icon set has no glyph for, rendered as
`<span class="btn-glyph">Ø</span>` — a convention, not a licence for other buttons to grow
text glyphs.

Do not treat decorative preview visuals as button-taxonomy candidates. Circular or square
shapes used by nav-card previews, inline preview icons, or chart layout shells stay in
their owning feature stylesheets unless they become actual shared button surfaces.

Header-action dropdown behavior and menu-item rendering go through
`@tba3/module-base/modules/header/headerActionDropdown.js`: `ensureHeaderActionDropdownControl()`
for generic dropdown shells, `ensureHeaderActionCheckboxDropdownControl()` for
checkbox-style dropdown controls, `ensureHeaderActionButtonControl()` for a plain action
button, and `renderHeaderActionMenuItems()` for menu items. Chart-host controls use
`ensureHeaderActionButton()` / `ensureHeaderActionCheckboxDropdown()` from
`packages/modules/src/common/charts/host/chartHeaderControls.js`, which delegate to the same helpers.

Simple action rows and checkbox rows share the same inner row shell. Keep the semantic
split intact: simple rows stay `role="menuitem"`, checkbox rows stay
`role="menuitemcheckbox"` with `aria-checked` and a populated leading slot. Treat the
remaining differences as deliberate ownership, not drift: export rows stay on the
simple-action branch and close on select, and long table column lists may add
`.header-action-dropdown--scrollable`.

---

## 5. JS Architecture

The class hierarchy, the module and view lifecycle (`mount → hydrate → …`, the view
render template with `_renderView` / `_hydrateChildren`), state observation and sibling
wiring are documented once in [architecture.md](architecture.md) §2–§4; each module's
own API is in the `<unitFile>.md` beside it. This section keeps only the contracts that
have no other home. Subsection numbers are stable because code cites them; 5.1–5.3 and
5.6 were folded into `architecture.md`.

### 5.4 ChartHostModule Config

```js
export const myChartConfig = {
    createRenderer(host, data) { return new MyChart(host.id, data, { scopeId: host.id }); },
    prepareLayout(host, charts, data) { ... },    // optional — before the first measurement
    onRendered(host, charts, data) { ... },       // optional — after it (read off the drawn chart)
    onUpdate(host, charts, data) { ... },         // optional
    onCleanup(host) { ... },                       // optional
    publicAPI: { myMethod(host, arg) {} },         // optional — the verbs the owning view calls
    defaultOptions: { someDefault: true },         // optional
    getExportIdentity(host) { ... },               // optional — what the host currently shows (architecture.md §6)
    glossaryPath: 'en.class.my-chart'              // optional
};
```

  - Mount title-bar controls into `host.headerActionsContainer`, not into the chart SVG.
  - KS-family charts share the highlighted-level host state through `packages/modules/src/common/charts/ksDistribution/ksHighlightContract.js` (`ensureHighlightedLevelState`, `normalizeHighlightedLevel`) rather than each config normalizing it again. Only the MA class-view ks-bar exposes a host-level `updateHighlight()` verb, because only there does a sibling (the class table) drive the highlight back.

### 5.5 TableModule

```js
createTable({ containerId, columns, data, initialSort, options, presets })
```
- Uses `applyReactiveState` mixin
- Override `_onTableReady()`, `_onStateChanged()` on TableModule itself
- Intermediate subclasses (`BaseClassTableModule`, `BaseItemTableModule`, etc.) define `_getColumns()`
- String-based Tabulator formatters (HTML strings, not DOM elements)
- `escapeHtml()` required for user data in HTML strings
- Column visibility: use `_applyColumnVisibilityChanges(columns, getShouldShow)` to avoid redundant Tabulator redraws (the per-column toggle is TableModule-private); pass `tableMeta: { excludeFromColumnVisibilityMenu: true }` to shared column builders for columns that should not appear in the standardized visibility menu (e.g., hidden sort-target columns). TableModule strips `tableMeta` before Tabulator initialization.
- Glossary opt-out: pass `tableMeta: { skipGlossaryAnnotation: true }` to shared column builders when a column should bypass glossary annotation wrapping. TableModule consumes and strips that metadata before creating the Tabulator column definition.

### 5.7 App Module

```js
// Each viewConfig entry owns its own loader, so there is one registry per app.
const CONFIG = {
    headerContainerId, defaultView, sidebarConfig,
    viewConfig: {
        [viewType]: {
            containerId, buttonId, icon, label, skeleton?,
            load: () => import('./views/xxViewModule.js').then(m => m.XxViewModule)
        }
    }
};
// xxHeaderControls.js — header copy comes from the glossary entry at glossaryPath
export function buildXxViewHeaderConfigs(ctx) {
    return { [viewType]: { glossaryPath, showInfoButton?, controls } };
}

class XxAppModule extends BaseAppModule {
    constructor(id, container, options) {
        super(id, container, options);
        this.configure(CONFIG);
        // EN makes this call in initializeComponents(), once the dataset names its domains
        this.setViewHeaderConfigs(buildXxViewHeaderConfigs(this._buildHeaderControlContext({ ... })));
    }
}
```

ChartHost config files should be easy to scan in the same order everywhere:
local constants/helpers first, then a `CONFIG DESCRIPTOR` section containing
`glossaryPath`, `defaultOptions`, renderer creation (`createRenderer` or a
preset-specific `createChart`), optional layout preparation, update handling,
public API, and cleanup/export hooks. Complex configs may keep
a feature-local controller above the descriptor; do not force a controller into
simple configs just for symmetry.

Concrete `ContentModule` and `TableModule` subclasses should follow the same
findability pattern as the common bases: constructor/defaults, event handlers,
base-hook implementations, lifecycle/update, export/public API, and private
helpers. Keep behavior hooks named after their base-class contract instead of
inventing parallel lifecycle names.

Feature CSS must not target ContentModule slot selectors directly. Add an
owner-local wrapper or body class from the owning module when local layout needs
to differ; the shared exceptions remain `content-module.css` itself and the
table-host composition in `table-host.css`.

Run `node tools/check-structure.mjs` after structural module/CSS/doc cleanup. The
guardrail checks objective drift only; its rules are listed in
[architecture.md](architecture.md) §9, each under its rule id in `tools/check-structure.mjs`.

### 5.8 ChartRenderer Lifecycle

```text
constructor(containerId, options)   options.scopeId defaults to containerId
create()     → clearContainer → validateData → refresh → autoResize
_render()    → calculateDimensions (getResponsiveChartDimensions) → renderChart [ABSTRACT] → normalizeSvgTypography
refresh()    → _render (no data change)
destroy()    → resources.destroy() → resizeService.removeByScope → tooltipAbortController.abort() → clearContainer
```

Typography contract inside `ChartRenderer`:
- `getChartFontSize()` resolves the live CSS value from the chart container.
- `getChartTextMeasureSize()` is the shared helper for measurement-only text sizing, defaulting to `--fs-base`.
- Visible SVG text inherits from the chart SVG root. `normalizeSvgTypography()` removes library-injected SVG font attributes after render so D3 defaults do not shrink chart text.
- Token-sized chart text exceptions use `sm`, `base`, or `lg` and are applied explicitly to the affected selection with helpers such as `normalizeSvgTypography(selection, { textSize })` or `applyChartTextSize(selection, size)`.
- `calculateDimensions()` returns geometry-oriented dimensions and `geometryScale`; chart text-size tiers are not part of the dimensions contract.
- `createTooltip()` creates chart-scoped tooltip instances using the `.tooltip-chart` variant.

Legend contract on `this.legend` (`LegendRenderer`, `charts/renderers/internal/legendRenderer.js`), the renderer's legend collaborator:
- `createLegend()` remains the default SVG legend renderer.
- `measureLegendSize()` and `canDistributeLegendItemsEvenly()` are the primitive measurement helpers.
- Measurement and rendering resolve one shared geometry (`resolveLegendGeometry()` in `charts/renderers/internal/svgLegendLayout.js`): `measureLegendSize()` returns its `size`, `createLegend()` draws at its anchor and item positions, so the two cannot drift apart.
- Variable-width horizontal legends using `layout.itemGap` may provide `textWidth`, but shared measurement and rendering both fall back to measured label widths when it is omitted.
- `resolveMeasuredLegendLayout()` chooses the first measured candidate that satisfies width/height constraints, falling back to the least-overflowing candidate.
- `resolveAdaptiveLegendLayout()` is the shared measured overflow policy for legends that try horizontal distribution before vertical fallback.
- `resolveStackedLegendLayout()` and `createLegendStack()` handle multiple SVG legend blocks sharing one measured slot.
- `ChartRenderer`'s own `initializeSVG({ legendConfigs })` and `computeLayout()` also accept stacked legend descriptors so shared layout reservation does not need renderer-local width/height hints.
- `resolveLegendLayoutForSlot()` applies measured layout slots when charts need custom legend placement.

Layout, axis, and empty-state contract inside `ChartRenderer`:
- `initializeSVG({ axisOverrides, legendConfigs })` remains the standard SVG setup path.
- `renderAxisTitle()` emits the standard `axis-label` class and bold weight by default while respecting explicit overrides.
- Use `chartLayoutPreset()` for recurring padding/legend/axis defaults and pass chart-specific `axisOverrides` only for measured results.
- Use `this.grid.createGridLines()` (`GridRenderer`, `charts/renderers/internal/gridRenderer.js`) for standard D3-axis grid lines.
- Use `showNoDataMessage()` for full-container empty states and `renderNoDataOverlay()` / `clearNoDataOverlay()` for SVG-filtered empty states.

---

## 6. Naming Conventions (JS)

| Pattern | Convention | Examples |
|---------|-----------|---------|
| **Class names** | PascalCase | `BaseModule`, `ChartHostModule` |
| **Private fields** | `#field` (true JS private) | `#id`, `#container`, `#destroyed` |
| **Protected methods** | `_underscore` prefix | `_doRender()`, `_doRenderContent()` |
| **Abstract methods** | `_underscore` + throws Error | `_doRender()`, `_getColumns()` |
| **Lifecycle hooks** | `_on*` prefix | `_onTableReady()`, `_onStateChanged()` |
| **Constants** | `SCREAMING_SNAKE_CASE` in frozen objects | `DATA_SYNC_ACTIONS.FILTER`, `EN_DATA_KEYS.STUDENT_RECORDS` |
| **Config objects** | `ALL_CAPS` for module-level | `CONFIG`, `EN_ACQUISITION` |
| **Exports** | named | `export { BaseModule }`, `export class NavCardModule` |
| **Singletons** | camelCase exported const | `export const tooltipService = ...` |
| **File basename** | matches its principal export, app-prefixed where the basename would otherwise repeat across apps | `enClassTableModule.js`, `longitudinalKsShareConfig.js`, `apiClient.js` |

### 6.1 Header-Suffix Policy

`src/common/modules/header/` mixes four suffixes for near-neighbours. Which one a new
file takes is decided by what the thing *is*, not by where it sits:

| Suffix | Means | Examples |
|--------|-------|----------|
| `*Module` | A `BaseModule` subclass: owns a DOM subtree, has a lifecycle, is registered as a child. | `modeSwitchModule.js`, `selectControlModule.js`, `studentSelectorModule.js` |
| `*Control` | A declared header-control unit: carries its own `injectState`/`onChange` and is dispatched by `HeaderOrchestrator`. Binds state; renders nothing itself. | `modeSwitchControl.js`, `datasetSelectorControl.js`, `comparisonModeControl.js` |
| `*Builder` | A stateless factory returning a DOM node. No state, no lifecycle, no registration. | `segmentedButtonBuilder.js`, `toggleIconButtonBuilder.js` |
| `*Controller` | Owns behaviour over a DOM subtree it does not itself create (a collaborator split out of a module). | `tableFilterController.js`, `htmlLegendController.js`, `taskRingGridController.js` |

This is a policy for new and renamed files, not a mandate to mass-rename: a `*Control`
beside its `*Module` (`modeSwitchControl.js` / `modeSwitchModule.js`) is the two halves
of one widget, correctly named, and stays as it is.

---

## 7. Coordination

There is no event bus. The two shapes — observed app state and direct sibling wiring —
and the theme verb are specified in [architecture.md](architecture.md) §4. The
idiom for a producer leaf:
```js
// producer (table)
this.triggerCallback('dataSync', { visibleIds, selectedIds, mode });
// view
onDataSync: (data) => /** @type {any} */ (this.#chartModule)?.applySync(data)
```

---

## 8. Services & DI

| Service | Import | Injection |
|---------|--------|-----------|
| `tooltipService` | `services/tooltipService.js` | Singleton import — **ChartRenderer only**; `BaseModule` has no tooltip API, and the delegated modes are wired once by `BaseAppModule` |
| `resizeService` | `services/resizeService.js` | `options.resizeService` or singleton |
| `exportService` | `export/exportService.js` | Host-registered via `modules/moduleRuntime.js` (default: no-op) |
| `decorateText` | `modules/moduleRuntime.js` | Host-registered (default: identity). tba3 registers `glossaryAnnotator.annotateHTML` in `bootstrapDashboardApp` |
| `themeService` | `services/themeService.js` | Direct import (pure functions) |
| `DataStore` | `services/dataStore.js` | Instance per app |
| `dropdownManager` | `@tba3/module-base/modules/header/dropdownManager.js` | Started once by the host with `initDropdownManager()` |
| `notify` / `notifyFailure` | `services/notificationService.js` | Direct import (module functions) |

**Pattern**: a service the module owns outright resolves from a constructor option with
a singleton default; one that stands for an *optional host capability* is read from the
runtime registry, so a consumer that registers nothing gets a no-op instead of the whole
subsystem in its import graph:
```js
this.#resizeService = options.resizeService ?? defaultResizeService;   // owned
this.#exportService = moduleRuntime().exportService;                   // host capability
```

**Failure reaches the reader once, and only when it is ours.** `notifyFailure`
logs the exception and raises one persistent toast; a repeat of the same sentence
returns the toast already standing rather than stacking another, so a failure that
fires per resize event cannot bury the page. The global handlers
(`installGlobalErrorNotifications`, installed by the bootstrap once `init()`
resolved) report `unhandledrejection` and any `error` event **that carries an
Error object**. An `ErrorEvent` with `error === null` is the browser reporting
itself — `ResizeObserver loop completed with undelivered notifications` during a
window drag, a cross-origin `Script error.` — and stays in the console.

A service that invokes caller-supplied callbacks must `await` them. `resizeService`
does: its consumers redraw asynchronously (`ChartRenderer._render()`), and a
`try/catch` around an un-awaited async call catches nothing — the rejection escapes
to `unhandledrejection`, where one chart's failure is announced as a page failure.

---

## 9. Resource Tracking

**Mandatory.** Never use raw `setTimeout`, `addEventListener`, or `requestAnimationFrame`.

```js
this.resources.trackDomListener(el, 'click', handler);
this.resources.trackTimeout(callback, 300);
this.resources.trackAnimationFrame(callback);
this.resources.trackSubscription(unsubscribeFn);
this.resources.trackDisposable(objectWithDestroy);
// All cleaned up automatically on destroy()
```

`this.resources` is `BaseModule`'s. `ChartRenderer` keeps its own tracker private (`#resources`, no getter), so a renderer subclass has no `this.resources`.

---

## 10. Reactive State

```js
// Applied via: applyReactiveState(this, initialState)
// Adds: _state, setState(partial), getState(key?)
// Triggers: _onStateChanged(changedKeys, prevState) on actual changes
// Diffing: referential equality per key
```

Used by `TableModule` and `ChartRenderer`.

**Table mode state mixin** (class factory):
```js
class MyTable extends withTableModeState(BaseTable, {
    stateKey: 'mode',
    initialValue: (opts) => opts.domainMode || 'all',
    applyHookName: '_applyModeChange'
}) { }
// The owning view pushes changes: this.observeState('currentMode', mode => table.setState({ mode }));
```

---

## 11. DOM Conventions

- **Container resolution**: string → `getElementById` / `querySelector`; element → used directly
- **Element defaults to container**: `if (!this.#element) this.#element = this.#container`
- **ID transfer**: ContentModule moves container's `id` to `.content-module-body`
- **Container validation**: `validateContainer({ assignId: true })` — TableModule/ChartHostModule default to `assignId: true`
- **Show/hide**: Toggle `style.display` only; propagate to children. No state class — active/selected state is owned by whoever renders the control
- **Destroy**: `this.#element.remove()` in `BaseModule.destroy()` — idempotent
- **Small DOM helpers**: use `packages/module-base/src/utils/domBuilder.js` for low-level `createElement()`, `appendChildren()`, and `createPlaceholder()` scaffolding; do not introduce broad declarative layout schemas.
- **Body-mounted overlays**: keep Escape-key handling and body scroll locking local to the overlay module unless a larger shared overlay contract appears; track overlay listeners through `ResourceTracker`.
- **Modal dialogs**: an overlay that claims `aria-modal` opens through `openModalDialog()` in `packages/module-base/src/utils/modalFocus.js` (composed by `SingletonOverlay`, or called directly): dialog role and name, every other body child `inert` except the tooltip layer and the toast region, focus moved in and returned to the trigger on close. `inert` does not wrap Tab — past the last control focus leaves for the browser chrome, as with a native `<dialog>`; `tests/e2e/modal-focus.spec.js` guards this.
- **Failures after bootstrap**: never `alert()`. `notifyFailure(glossaryPath, context, error)` logs the exception and shows the glossary sentence as a persistent toast (`role="alert"`, closable); `notify(text)` is the transient variant. Failures before `init()` resolves stay with the bootstrap's inline `role="alert"`. The bootstrap installs `unhandledrejection` / `error` handlers into the same channel.
- **`innerHTML` contract**: a string that carries data is escaped with `escapeHtml()` before it meets a markup sink; a sink that takes markup says so in its JSDoc (`setSubtitle()`), one that takes text escapes itself (`setTitle()`). A label that needs an icon appends `createIcon()` beside `textContent` — no markup prefixes. Glossary popups escape a payload entry's *title*; its *body* is HTML by design (`competenceLevelGlossary.js` composes the scale ladders from `<ul>`) and is trusted because the API base is held to the page's origin or loopback.

---

## 12. Data Conventions

### JSON file structure
- All data files are **arrays of objects**
- Common shape: `{ id, name, domain: { id, name }, subject: { id, name }, covariates, properties }`
- Statistics: `{ descriptiveStatistics: { total, mean, frequency, standardDeviation? } }`
- Competence levels: `{ name, nameShort, descriptiveStatistics }`

### Per-class scenario folders
- EN: `public/data/en/8a_mid/`, `8b_good/`, `8c_bad/`
- MA: `public/data/ma/3a_mid/`, `3b_good/`, `3c_bad/`
- EN, 6 files each: `aggregation.json`, `competence-levels.json`, `items.json`, `items_aggregation.json`, `students_aggregation.json`, `students_competence-levels.json`; MA the same without `aggregation.json`, which MA never requests

### Glossary
The tree is assembled at import time by `src/{en,ma,sl}/{en,ma,sl}Glossary.js` from
two bases — `packages/modules/src/common/glossary/glossary.json` and
`src/common/app/shellGlossary.json` — plus one `<owner>.glossary.json` per module.
`glossary.json` keeps only what has no single owner — the per-app term vocabulary
(`en.shared`, `ma.shared`, `sl.shared`) and `general.buttons` / `general.messages`; the
shell glossary keeps what only tba3's shell reads; everything else lives beside the module
that owns it, mounted at its dot-path by the barrel (a package card's through
`<app>GlossaryFragments.js`). `tools/check-structure.mjs` fails the build when a declared path
stops resolving, and `node tools/dump-glossary.mjs` prints the assembled tree.

- Nested keys: `{app}.{view}.{element}` → role-named fields, each named for the one slot
  it renders in: `title`, `subtitle`, `body`, `label`, `tooltip`, `description` (nav-card
  line), `tutorial` (tour card), `note` (authoring-only, never rendered)
- Shared terms: `shared.element_texts` → `{ title, body, aliases }`
- **`interface` sub-entries carry both halves of a control's text**: `label` is the
  label the user reads, `tooltip` its tooltip. Both resolve from the glossary — a
  button label must not be hardcoded in JS beside a glossary-resolved tooltip. Text shared
  by every table (the preset `Reset` button) lives under `general.buttons.element_texts`,
  not once per table.

**API base**: `getApiBaseUrl()` (`services/apiClient.js`) resolves same-origin `api/`; the `?api=` override is accepted only over `http:`/`https:` to the page's own origin or a loopback host (`localhost`, `127.0.0.1`, `[::1]`, any port) and throws otherwise — the glossary renders the payload text as HTML.

---

## 13. Tooling & Linting

- **Build**: Vite (`vite.config.js`, four HTML pages, `api/` answered by the fixture API plugin for the demo folders and otherwise proxied to an optional API server); runtime libraries (d3, Tabulator, Quill, jspdf, html-to-image) are npm dependencies imported where used — no vendored copies, no globals.
- **Formatters**: oxfmt for JS (`.oxfmtrc.json`); Prettier for CSS and JSON (`.prettierrc.json`, `.prettierignore`). Markdown and HTML are deliberately unformatted — emphasis-style rewrites and table realignment cost more review noise than they save. `npm run fmt` runs both, `fmt:check` is the gate. `.editorconfig` (UTF-8, LF, four spaces) and `.gitattributes` (`eol=lf`) agree with them.
- **Linters**: oxlint over `src/`, `packages/*/index.js`, `packages/*/src/`, `config/`, `tools/`, `tests/`, `docs/.vitepress`, `vite.config.js`; `@eslint/css` over `src/**/*.css`, `packages/*/src/**/*.css` and `packages/*/styles/**/*.css`. Allowed unused vars: `_`-prefixed.
- **Typecheck**: `tsc` over `src/`, `packages/*/index.js` and `packages/*/src/**/*.js` (`config/tsconfig.typecheck.json`; `tests/` is not included): `checkJs` with `strictNullChecks`, `strict` off, zero suppressions. The decision on record: `noImplicitAny` is not pursued (thousands of implicit-any parameters in d3 render code, no reading value for the diff). An options argument documented as `@param {object}` is invisible to the checker; when touching such a function, replace it with a `@typedef` listing the real fields and expect the configured `strictNullChecks` to surface nullability in its callers.
- **Unused code**: `knip --exports --dependencies` (`knip.json`; the entries are the three app modules, the bootstrap, `tools/**/*.mjs`, `tools/hooks/*`, `tests/**/*.js`, `config/*.{mjs,js}` and `docs/.vitepress/**`) fails `npm run check` on an export no other file imports and on an import no `package.json` entry backs. Drop the `export` keyword rather than adding an ignore.
- **Environment**: `.nvmrc` (`22`, matching the Dockerfile), `.npmrc` `engine-strict=true` against `engines.node`.
- **Coverage**: measured on demand (`npm run test:coverage`, v8, `include: ['src/**/*.js', 'packages/*/src/**/*.js']`), deliberately ungated — most of `src/` is render code that e2e covers, so a floor would push tests toward the wrong layer.
- **Gate**: `npm run check` = structure check + knip (`check:unused`) + fixture drift + docs index + Klassenhierarchie drift (`check:docs-hierarchy`) + lint + `fmt:check` + Vitest + `tsc` + build + wiki build; the pre-push hook in `tools/hooks/` runs it. E2E (`npm run test:e2e`, needs Chrome; runs against the built demo fixtures) is not in the gate.

---

## 14. Anti-Patterns to Avoid

| Don't | Do Instead |
|-------|-----------|
| Raw hex/px/font/spacing values in CSS | Use design tokens (`--fs-sm`, `--layout-gap`, `--card-pad`, `--color-border`) |
| `font-size` outside the 3-token system | Use `--fs-sm`, `--fs-base`, or `--fs-lg` |
| Raw `setTimeout` / `addEventListener` | Use `this.resources.trackTimeout()` / `trackDomListener()` |
| DOM element Tabulator formatters | String-based HTML formatters |
| Unescaped user data in HTML strings | `escapeHtml()` |
| `alert()` for a failure the reader must know about | `notifyFailure()` — exception to the console, glossary sentence to the toast |
| A markup string as a label to get an icon in | `textContent` plus `createIcon()` |
| `@param {object} options` on a new options bag | A `@typedef` naming the fields |
| An `aria-modal` overlay that manages its own focus | `openModalDialog()` |
| A leaf reading `appState` or the bus for a mode / selection | Seed from an option, report through a callback option; the view observes state and wires siblings |
| Override `_doRender()` in ContentModule subclass | Override `_doRenderContent()` |
| Forget `super.destroy()` | Always call it **last** in destroy overrides |
| Create a new service instance | Use existing singleton or DI via options |
| Ad-hoc z-index values | Follow the z-index scale |
| Intermediate wrapper divs for layout | Mount directly to container; use flex/grid on the container |
| Add a shared view helper for one call site | Keep child lookup/registration local until reuse is proven |
| Local hard-coded percent/rating axis formatters | Use `chartAxisUtils.js` percent/rating helpers |
| Repeated local chart layout objects for common cases | Use `chartLayoutPreset()` with focused overrides |
| Manual standard grid-line styling in renderers | Use `this.grid.createGridLines()` |
| Inline chart no-data HTML where shared messaging fits | Use `showNoDataMessage()` or `renderNoDataOverlay()` |
