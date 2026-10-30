# TBA3 Architecture

How the dashboards fit together. This document stays at orientation altitude: method
signatures, options and verbs are in the source and the unit docs, and each subsystem's
mechanics in the header of the file that owns it.

**Related docs:**

- `<unitFile>.md` beside every module unit — the per-module API doc (§2 "Modul-Dokumentation"). The app docs (`src/{en,ma,sl}/{en,ma,sl}AppModule.md`) are the entry point to each view tree: they list the views, each view doc lists its children and wiring.
- `packages/modules/docs/datenvertrag.md` — German: what each dashboard requires of the data it loads, per endpoint and document, and how a malformed document fails.
- `docs/standards-reference.md` — CSS/visual standards, chart rules, naming, JS conventions, anti-patterns.
- `docs/tutorial-tour-system.md`, `packages/modules/docs/sl-info-box-placeholders.md` — German authoring guides for tour and info-box copy.
- `docs/endpoint-fields.md`, `docs/module-index.md` — generated from the unit docs.
- **The wiki** (`npm run docs:dev`) renders all of the above in place.

## 1. System overview

TBA3 is a static suite (vanilla JS ES modules, built with Vite) visualizing German VERA
test data: three independent dashboards — **EN** (Englisch 8), **MA** (Mathe 3, also
VERA 8 scales), **SL** (Schulleitung) — and the chooser `index.html`. Runtime libraries
(d3, Tabulator, Quill, jspdf, html-to-image) are npm dependencies imported where used;
nothing is loaded as a global. The demo datasets are fixtures under `public/data/`; a
real dataset is opened with `?scope=<level>/<id>` against the API under `/api/`. Every
runtime URL to a site path goes through `siteUrl()` (`apiClient.js`), so the site works
under any base (`TBA3_BASE`); nothing else in `src/` builds a root-absolute URL.

**Bootstrap.** Each dashboard page shows a cold-start skeleton and calls
`bootstrapDashboardApp` with its app class and dashboard id (`en`/`ma`/`sl`). That id is
the one place the suite says which dashboard it is: the app builds its **context**
(`createAppContext`) around it, and every id, storage key, glossary namespace and file
name derives from `context.appId`. The context is everything one dashboard owns that its
modules read — the package's `ModuleContext` (document store, glossary, competence-level
palette) plus the export state and the host `runtime`. None of it is
module-level state: views and cards receive it as the `context` option, renderers and
helpers as an argument.

**Shell first.** The app renders its shell (header, sidebar, router) and starts every
document loading without awaiting it, the way a route loader works. Views that read no
data show at once; a view that reads data waits under its placeholder until every
request of the dataset has landed and `onDataReady()` has run the start-up that needs the
data (the ⌀ toggles, the first student, the header tokens). Boot failures render inline,
never as an uncaught throw; a dataset that fails to load is named once by the app, above
views that stay usable.

### Layers

Three layers, enforced by dependency-cruiser (§9):

- **`packages/module-base/`** (`@tba3/module-base`) — the card kit: `BaseModule`,
  `ContentModule`, the module runtime, state, resource tracking, icons, trusted HTML,
  header-action dropdowns. Never imports `@tba3/modules`.
- **`packages/modules/`** (`@tba3/modules`) — the VERA layer another VERA dashboard
  installs instead of rebuilding: domain vocabulary, glossary, the data-driven palette,
  the `DocumentStore` and schemas, every chart and every table, each subject's cards
  under `src/{en,ma,sl}/`. Never imports `src/`. `d3` and Tabulator are optional peers
  only its chart and table entries load.
- **`src/`** — what composes a dashboard: `src/common/` (app shell, export, header,
  sidebar, notes, tour, dataset acquisition, report view) and per-app `src/{en,ma,sl}/`
  (app module, header-control catalog, glossary barrel, views, app-specific composites).
  Apps never import each other; `common/` never imports an app.

The dividing line: `@tba3/modules` holds every VERA card and what it needs, including
where its data comes from; `src/` holds the shell, the views, export, the app
configuration and the composites that wire package cards to app widgets (the student
selector, the item preview). A package card reads its data from the store it is handed
and takes an app capability as an option, a callback or a port (`comparisonState`),
never by import. A unit that is not a VERA card stays in `src/` until a second consumer
needs it.

Folders are named for the code that owns what they hold; shared code is one folder deep
under `src/common/` (`app/`, `export/`, `modules/`, `services/`, `views/`), and
`packages/modules/src/` mirrors that split.

### CSS: layered cascade, sheets beside their units

Precedence is decided by five cascade layers, `vendor, foundation, common, modules,
views`, not by import order. Every sheet repeats the layer statement, because Vite links
a shared chunk's CSS before the entry sheet and the first statement seen fixes the
order. A unit's own stylesheet is `<unitFile>.css` beside its `.js`, holds one `@layer`
block and is imported only by that file, so Vite splits it with lazy views; shared sheets
are imported by the entry sheets (`src/{en,ma,sl}/main.css` via `src/styles/app.css`). A
sheet for DOM that package code emits ships with that package. Details:
`standards-reference.md`, CSS Architecture.

## 2. Module hierarchy

Everything on screen is a module. Two roots: `BaseModule` (all modules) and, for D3
charts, the standalone `ChartRenderer` (not a `BaseModule`).

```text
BaseModule                        packages/module-base/src/modules/baseModule.js
├── ContentModule                 — opt-in title/subtitle/body shell + glossary + export control
│   ├── ChartHostModule           — config-driven chart host (final; no chart subclasses)
│   ├── TableModule               — Tabulator wrapper + presets + filter menu + deferral gate
│   │   ├── Base{Group,Item,StudentData,StudentInfo}TableModule — the EN/MA table bases
│   │   └── SlBaseTableModule     — SL domain and group tables
│   ├── StudentSelectCardModule   — a student selector over the student tables
│   │   └── app composites        — the EN student tables, the MA student top bar
│   └── card leaves               — navigation cards, package cards
├── BaseAppModule                 — per-app coordinator (src/common/app/appModule.js)
├── BaseViewModule                — state observation, hide/show flush, render cover, notes/tour hooks
│   ├── MaLayoutViewBase          — the MA item and student views (split-pane layout modes)
│   └── every other view          — the shared welcome and report views, each app's *ViewModule
└── shell widgets                 — header, controls, menus and body-mounted overlays

ChartRenderer                     packages/modules/src/common/charts/renderers/chartRenderer.js
├── shared renderers              — CompetenceLevelDistributionChart, StripBarChart,
│                                   ItemLollipopChartRenderer (base of the EN and MA lollipops)
└── chart-specific renderers
```

The tree shows the shared bases only; every unit's base is the Basis column of the
generated `docs/module-index.md`.

### Base classes (purpose)

- **`BaseModule`** — every module is a light-DOM custom element: it extends Lit's
  `ReactiveElement` and renders into itself. The DOM is the module tree: a module's
  children are the module elements inside it, and removing an element tears its subtree
  down. It owns identity, the options, the reactive `data` property, the lifecycle (§3),
  visibility, settle waiting and a `ResourceTracker` (`this.resources`).
- **`ContentModule`** — the card: an opt-in title/subtitle bar, the body subclasses
  render into (`_renderBody(data)`), collapse and the export control. Its copy comes from
  the glossary (§8).
- **`BaseAppModule`** — the per-app coordinator. A subclass supplies a declarative spec
  (its `static defaultOptions`: views, dataset, header controls, initial state) and at
  most `initializeComponents()` (the shell) and `onDataReady()` (what reads the data).
  The base *has* its collaborators — router, view lifecycle, app state, document store,
  header orchestrator, sidebar, notes drawer, tour — rather than doing everything itself.

Collaborators stay app-agnostic: they never import `src/en|ma|sl`.

**Deliberately *not* extracted** — do not re-attempt without a concrete bug the split
ownership caused: the scatter zoom controller and the SL group-comparison control model
(they drive the chart's private render state; only the pure math was separable),
`TableModule.createTable` and `ChartRenderer`'s text/dims helpers (coupled to their
internals), a per-table lifecycle record in `TableModule` (it would relocate, not
concentrate), a single owner for Reset / presets / filters / limit / shadow sort (the
protocol between the collaborators is pinned by a test instead), and a `RenderCover`
owner for the view render cover.

**Deliberately *not* unified across apps:** MA's and SL overview's panel/layout-mode
switching (one 3-way mode vs. two orthogonal modes; they share only "write the mode where
CSS can read it"), the nav-card CSS (SL's compact row shares two declarations with the
welcome skin), and the three `index.html` shells (they differ only in per-app lines, and
there is no templating step).

### Charts are config-driven, not subclassed

A chart type is a config descriptor (`*Config.js`)
handed to `ChartHostModule.createChart(id, config, options)`, which drives one or more
renderers. To add or change a chart, edit or add a descriptor — never a chart subclass.
Complex charts keep a feature-local controller behind the same descriptor shape. The
descriptor contract is in `chartHostModule.md`. Extract a new shared renderer base only
when two or more concrete renderers genuinely share behaviour; descriptors share
functions, not presets.

Only the host creates and destroys renderers. A renderer draws from its state signals
with keyed joins into the SVG already on screen, so a redraw patches marks in place and
a focused mark keeps focus.

### Modul-Dokumentation

Every module unit — an exported class extending a `*Module`/`*ViewBase` class, or a chart
`*Config.js` descriptor — documents itself in a `<unitFile>.md` beside its source. The
shell widgets under `src/common/modules/header/` and `src/common/modules/controls/` (the
view header and its controls) are exempt: they read no data and sit in no view tree, so
their file header is their documentation.

The gate requires only what the docs generators read: an H1 naming the unit, `## Daten`
(the endpoint-field page), and for a view `## Kinder` and for an app `## Views` (child
docs linked, which build the wiki sidebar and the module index). Every other section is
the author's choice. The suite's own docs follow one layout, in German:

- Content units: Zweck, Design/Idee, Daten, Optionen, Methoden.
- Views: Zweck, Design/Idee, Kinder (child units with doc links), Daten, Zustand
  (observed app-state keys → child verbs), Verdrahtung (sibling callback → verb wires),
  Optionen, Methoden.
- Apps: Zweck, Design/Idee, Views (in `viewConfig` order, with doc links), Daten, Zustand
  (initial-state keys, who writes and reads), Hooks.

A base class (one another module extends) leaves out Design/Idee: its design is its
subclasses'. Daten cites the API spec in the
format `datenvertrag.md` defines (`Keine API-Daten.` when the unit reads none). A unit doc
lists only reachable surface: an option, verb or payload key with no caller is deleted
together with its row. Base-class docs carry the inherited surface once; a leaf documents
only its delta and reaches its base through the Basis column of `docs/module-index.md`. A
chart config documents its descriptor; the host is documented once in
`chartHostModule.md`. Presence, the H1, the generator-read headings and the Daten table
format are enforced (`module-doc`).

## 3. Lifecycle and patterns

**Module lifecycle.** `X.create(id, options)` builds an unconnected element; options are
fixed from the first connect on, and what changes over a module's life is a reactive
property (`data`, `payload`, …). The first connect runs `_setup()` once; every reactive
property change runs the content pass (`_renderContent`). `updateComplete` settles once
the own pass, `_contentSettled()` and every child have; `contentComplete` once the
subtree's passes have run. Removing the element tears the module down a microtask later
(`_teardown()`, then `resources.destroy()`); a torn-down module never renders again.
Subclasses implement `_setup()`, `_renderBody(data)` (`ContentModule`) or `_renderView()`
(views), `_contentSettled()` and `_teardown()` (calling `super._teardown()`) — never the
Lit lifecycle hooks `BaseModule` keeps final, and no public instance fields
(`tba3/module-element-contract`). The full table is in `baseModule.md`.

**Views.** A view implements only `_renderView()`: it creates its children with
`X.create(id, this._childOptions({...}))` and places them in one lit template. The base
covers the view (skeleton, `aria-busy`) until its subtree has settled. A view gets no
data payload; its cards read the `DocumentStore` themselves.

**Navigation** is `showView()`, which hides the current view, covers the target, writes
the navigation's state patch, renders the header (for a data view, its controls only once
the data has landed), then lazily imports and initializes the target, shows it and
resolves once switched; a navigation mid-transition is queued, and a failed switch rolls
back. The hash router only mirrors it. `ViewLifecycle` owns all of it — the containers,
the router, the switch and the prefetch — so the app only mounts and starts it.

**A student view without a student.** `BaseViewModule` renders the app's student view
(`students.view`) of a group without students as the `general.messages.no-students`
sentence; no view checks for it itself.

**Recurring patterns:**

- **Page listeners belong to the app.** Whatever listens on `window`, `document` or
  `body` for the page's life is started by, or handed to, `BaseAppModule` and released
  with it. Everything else goes through `this.resources`.
- **Runtime services** — what a product puts around a card (export, text decoration)
  arrives as `context.runtime`; without a host, `ContentModule` falls back to no-ops, so a
  card renders on its own.
- **Typed options** — each class that reads its own option keys declares an `XOptions`
  typedef extending its parent's; defaults are the class's `static defaultOptions`.
- **Controllers, not mixins** — behaviour a module is composed of is a Lit-style reactive
  controller created in `_setup()` (`TableModeController`, `DomainModeController`).

**Reactive state.** One shape everywhere: a record of `@preact/signals-core` signals,
`createState({ key: initial })`, read as `state.key.value`, written as
`state.key.value = x` or batched with `writeState(state, patch)`. A write of the value a
key already holds notifies nobody. A key given a signal keeps it, so state is shared
rather than copied: a view hands a child the app's signal as an option, a chart host keeps
it in its state and its renderers share it — one copy, nothing forwards. `BaseAppModule`
owns the app state (one signal per key; the shell's keys are in `appModule.md`) and hands
it to every view as `appState`. A view or chart config never holds the app coordinator,
and `_childOptions()` carries only the shared bundle (`context`, `viewKey`, and from a view
the `comparisonState` port); anything else a child renders it is handed explicitly (§4).

**Comparison state is a port, not app state.** Which averages a chart shows is
`comparisonState`, one per app, threaded to every view and chart; renderers follow it
themselves. Its contract is in `comparisonState.js`.

## 4. State observation and data synchronization

The rule: a leaf module (table, chart host) is seeded from explicit options and driven
through plain verbs, never through `appState`; a producer leaf reports through a callback
option the owning view wires to the sibling's verb. That is what keeps a leaf
constructible standalone.

### A theme switch repaints through the cascade

A competence-level theme or colour-scheme switch redraws nothing: every colour a mark,
cell or swatch paints is a `var()` (a stylesheet token, or a palette token the switch
recomputes on `<html>`), and a scheme-dependent token is one `light-dark()` declaration,
which follows the `color-scheme` that `data-color-scheme` sets. So a subtree can paint
in one scheme whatever the page shows: paper (the report sheets, every capture made for
PDF or the report, §6) is light through `data-color-scheme="light"`. How a mark is painted: `standards-reference.md`, Color System.

### App state is watched, not broadcast

Everything a header control switches or selects — modes, the selected student, the ⌀
toggles — is state, not an event. A control or a selection (`_selectStudent`) only writes
the key; a click that also opens a view writes first and navigates second, so the view
the navigation builds seeds itself from `.value`. A child that renders the key is handed
its signal (or a plain value) and follows it in an effect; work only the view can do
(re-pointing children, navigation) goes through `watch(signal, handler)`, which delivers
only changes and holds them while the view is hidden.

### Table ↔ chart sync (direct sibling wiring)

A table and the chart or detail panel it drives are children of the same view, which
wires them directly: the producer's `on*` callback option calls the consumer's verb
through a lazy closure (`onDataSync: (d) => this.#chart?.applySync(d)`), so construction
order is irrelevant. Sync payloads carry ids only, and the consumer resolves them against
the dataset it declares. In a bidirectional pair one side owns the state and reports it,
the other only asks, so no loop guard is needed. Each view's wires are listed in its
doc's Verdrahtung table.

## 5. The app shell

Besides views, `BaseAppModule` owns page-lifetime helpers that outlive every view, each
destroyed with the app:

- **Header** — `HeaderModule`, driven by `HeaderOrchestrator`, renders the requested
  view's title, controls and actions inside one effect over app state; header copy comes
  from the glossary.
- **Sidebar** — view navigation and two settings menus, colour scheme and
  competence-level theme, each a pick-one header-action menu opening beside the rail.
- **Notes drawer** — a Quill editor in a non-modal drawer, imported on first use; one
  notebook per dashboard and dataset in `localStorage`, unencrypted (`notesStore.js` says
  why), edited by one tab at a time (a Web Lock).
- **Tour** — steps derived from the active view's module tree; authoring guide:
  `docs/tutorial-tour-system.md`.
- **Overlays** — every modal is the native `<dialog>` via `ModalDialog`; destructive
  confirmations go through `confirmDialog`; non-modal layers and anchored menus are
  popovers. Stacking: `standards-reference.md`, Z-Index Scale; Escape: its DOM Conventions.
- **Batch export toolbar** (§6).

**Minimum size and reflow (the one known WCAG AA gap).** The shell has a minimum size
(`standards-reference.md`, Breakpoints); below it the page scrolls both ways instead of
reflowing. That fails WCAG 1.4.10 (Reflow, AA) at a
320px-wide viewport, which is what 400 % zoom on a 1280px screen gives. It is accepted on
purpose: the views are dense two-dimensional dashboards, cards of charts and wide tables
read side by side, and a single-column phone layout would be a separate product. Text
still enlarges fully (WCAG 1.4.4, the root font-size of the same section), and everything else is held to Level AA. One borderline Level A case is
accepted beside it: the SL Überblick deviation bars tell günstig/ungünstig by fill
colour alone in the picture (1.4.1); the verdict is in each bar's accessible name, its
tooltip and its "Als Tabelle anzeigen" table.

## 6. Export system

Per-card export, a batch cart and a report view, over one capture pipeline in
`src/common/export/`.

- **Every titled card with something to export is exportable.** A module whose card has a
  title bar and whose `_getExportType()` names `'table'`, `'visual'` or `'chart'` gets the
  export control automatically, and the menu follows the type; `enableModuleExport: false`
  opts out. A new chart or table exports without a line of its own.
- **One id per exportable thing, not per module.** The id (`buildExportTargetId`, composed
  by the app's export service from what the card hands it) keys the cart entry, the
  stored capture and the report card at once. It combines the module id, the module's
  identity (`getExportIdentity()`: `null`, or what an instance re-pointed
  in place currently shows) and the dataset. Identity comes from data, never display text,
  and display variants (mode, highlight, comparison toggle, filters) are not identity:
  re-ticking replaces the capture. An e2e spec fails any two cards that share an id.
- **Capture** clones the card off-screen and rasterizes it on paper (§4). What a card
  holds is the module's business: the pipeline calls three walkers that `BaseModule` keeps
  final, each running the module's own hook and its children's walker, and the capture
  walker rolls back once if a step throws (`baseModule.md`).
- **Batch cart** — per tab, surviving reloads; ticking a card captures it right there and
  stores the image (IndexedDB, `exportImageStore.js`). `ExportCart` owns the rest of the
  tab's report in one sessionStorage record: which targets are ticked, in what order, how
  wide. Dropping a tick drops its image and its place, so a card ticked again starts
  fresh. The report view lays the captured images out on A4 pages and never cuts a card.
  Report cards are snapshots taken at tick time, not live modules.
- **Considered: render at report time.** BI report builders mostly store a ticked visual's
  state and render it at export, which gives vector output and cards that reflow. TBA3
  keeps raster snapshots because, without a render server, every ticked card's view would
  have to be remounted off-screen with its tick-time header state, across views that may
  not exist yet (a view mounts on its first visit and is then kept, hidden, when left) and
  datasets that switch by a full reload.

## 7. Services

The injected services and their injection pattern (owned singleton vs. host capability
via `context.runtime`) are tabulated in `standards-reference.md`, Services & DI; every service's file
header documents its mechanics.

**Persisted records.** A record the shell keeps in Web Storage goes through `jsonStorage`:
one JSON record per key, without a version; a missing or unparsable record reads as
absent. A single pick (colour scheme, competence-level theme) is a plain string through
`storedChoice`, and the export tab id is kept by `exportTab.js`.

**Errors stay in the browser.** Failures reach the reader as toasts and the developer
through the console. There is deliberately no remote error sink: the dashboards show
school performance data, a stack trace can carry it, and sending it anywhere is a GDPR
processing decision for the operator, not a default of the code.

## 8. Data flow

**Datasets.** Each app lists its demo fixtures (folders under `public/data/{en,ma,sl}/`,
identified by scope ids of their own); any other `?scope=` is fetched from the API. The
fixtures' numbers are made up, but their shape mirrors the server's. Do not add a JSON
export folder for a dataset the server can serve — add its scope.

**Acquisition.** Each app declares its API requests once; the `DocumentStore` in its
context fetches each request at most once (a failed fetch is sent again by the next
ensure, a malformed answer never), validates every document as it lands (a malformed one
fails the load closed, `datenvertrag.md`) and freezes it. Fixture folder and
API resolve to the same documents under the same names, so nothing downstream knows which
answered. A card declares what it reads (`static documents`, `documents` on a chart
descriptor) and its host ensures that before every render, so a card mounted on its own
sends exactly the requests behind its documents, and N cards share one request each. The
app starts everything up front (`ensureAll()`, not awaited) and gates its data views on
it, so inside an app a card's ensure finds its documents landed. Repo-owned prose (the
glossary, SL's info boxes) is never fetched from the API.

**Derived data.** Cards shape their own data: a view passes identity and selection only
(a student id, a pool, a Leitidee).

**Every derivation is a dataset, and the store is the one cache**: `dataset(name, {inputs,
params?, build})` declares it, `getDataset(key, ...args)` reads it, built once per store
and arguments. A value keyed by a selection (a metric, a Fach, the group-comparison pair)
is a dataset with `params`. A build reads only its declared inputs plus the context's
glossary and palette, so a card that names one key in its `documents` is ensured
everything behind it and stays usable on its own (mechanics: `documentStore.js`). No
module keeps a cache, `WeakMap` or identity field over store documents; what derives from
the palette's registered scales is memoised in `CompetenceLevelPalette.memo`, which every
registration clears. The store lives as long as the page and a dataset switch reloads
it, so nothing needs invalidating.

Each subject's catalog in the package (`enDatasets.js`, `maDatasets.js`, `slDatasets.js`)
holds the datasets over its documents; a dataset over a card's own logic (the group
comparison's rows, the Materialien context, the share and rate queries) sits beside that
logic and is exported as its key, since the catalog is part of the card-free vocabulary
(`domain-boundary`).

**Competence scales and colours are payload-driven.** A dataset carries its reporting
scale and its item scale; they are registered with the app's palette as the documents
land, and cut scores come from the payload too. Never hardcode a level count, a
vocabulary or a cut score — MA must work for both VERA 3 and VERA 8. Threshold
assumptions that await an authoritative API carry an `ASSUMPTION-<id>` in the comment
beside the code.

**Glossary: one tree, assembled from co-located fragments.** Every module's German copy
(`title`, `subtitle`, `body`, `tutorial`, `interface`, …) lives in a
`<owner>.glossary.json` beside the module that owns it. Each app's barrel
(`src/{en,ma,sl}/{en,ma,sl}Glossary.js`) takes the package's `glossary.json` and tba3's
`shellGlossary.json` as bases and mounts the fragments over them (package cards' fragments
through the package's `<app>GlossaryFragments.js`); every consumer walks that one tree, and
assembly throws if two owners claim one entry. Setting UI copy from code is a lint error
(`tba3/glossary-copy-ownership`); short data vocabulary (column and legend titles, tooltip
row labels) stays in code via `TERM_CONSTANTS`. A Domäne is linked by Fach and id, never by
its name as free text. Competence-level explanations are not in the glossary: they come
from the payload.

## 9. Quality gates and tooling

**Structural rules** live where their scope puts them: per-file JS rules in oxlint
(`config/oxlintPlugin.mjs`, the `tba3` plugin), per-file CSS rules in ESLint
(`config/eslint.config.mjs`), and in `tools/check-structure.mjs` the cross-file rules plus
the per-file ones no linter reaches (CSS comments, `scheme-tokens`, `no-knip-skip-tag`).
Each rule's doc comment and message state what it requires. How the cross-file rules read
the repository is in `tools/lib/repo.mjs`; each rule is tested on one passing and one
failing in-memory tree (`tests/unit/tools/checkStructure.test.js`), and
`tools/lib/unitDocs.mjs` is the one parser of the unit docs. The scope is `src/` plus each
npm workspace package's `files`.

**Import boundaries** are dependency-cruiser rules (`config/dependency-cruiser.mjs`, every
one an error, each with a comment saying why): the layer rules of §1, package
boundaries and declared dependencies, packages reached only through their `@tba3/*`
entries, d3-free entries, and layer-private `internal/` folders.

**`npm run check`** runs the whole gate in parallel: structure, dependency boundaries,
knip (unused files, exports, dependencies, cycles; `--production` fails an export only
tests use), fixture and generated-docs drift, oxlint and ESLint at zero warnings, oxfmt,
`tsc` in strict mode, Vitest (Node and real-browser projects), the Vite build and the
wiki build. The pre-push hook is the gate: what reaches the public `main` has passed it,
so its CI deploys Pages at once and runs the check and the e2e suite beside the deploy,
on Linux, and for pull requests.

**End-to-end** tests (`npm run test:e2e`, outside the check) are Playwright against `vite
preview`: axe gates and a thin per-dashboard smoke layer; there are no pixel baselines,
so a chart refactor is checked by diffing its SVG markup before and after. Run them after
visual or lifecycle changes.

**Delivery.** One Content-Security-Policy (`config/csp.mjs`: Trusted Types, no inline
script or style, no `style` attribute) is sent as an nginx header and written into each
page as a `<meta>` at build, so the e2e suite runs under it and fails on any violation.

## 10. Deep modules to keep

These modules hide much behaviour behind a small interface. Leave them as they are, and use
them as the model when another module's interface grows: a change that splits one of them
or widens its surface needs a reason the module itself cannot absorb.

- **Card kit.**
  - `BaseModule`: superseding content passes, microtask teardown, inert capture copies and
    batched visibility, behind `create`, `_setup`, `_renderBody`/`_renderView`, `_teardown`
    and three waits.
  - `ContentModule`'s card shell.
  - `ResizeService`, `ResourceTracker`, `state.js`, `waitForLayout`, `followAnchor`,
    `headerActionDropdown`, `trusted`/`trustedHtml`/`cssVars`, `viewSkeleton`.
- **App shell.**
  - The `BaseAppModule` spec: a handful of keys and two hooks; EN and MA are pure
    configuration.
  - `BaseViewModule.watch` with the hide/show flush.
  - `_childOptions` with the comparison port.
  - `_openStudent`/`_selectStudent`.
  - `ViewLifecycle.showView`'s state machine.
  - `HeaderOrchestrator` with `stateChoiceControl` and `datasetSelectorControl`.
  - `NotesController`, `TutorialController`/`buildTourSteps`.
  - `createDatasetLoader` (three adapters), `apiClient`.
- **Export.** `ExportCart`, `captureExportRoot`, `pdfPagePlan`/`pdfComposer`, `exportTab`,
  the geometry half of `reportLayout.js`.
- **Charts.**
  - The `ChartHostModule` render cycle.
  - `ChartRenderer`: one required hook plus three common ones.
  - `htmlLegendPanel` with `chartContainerLayout`.
  - `chartInteractionUtils`/`MarkKeyboard` behind their facade.
  - `chartAxisUtils`, `chartDataTable`/`dataTableCells`, the `comparisonState` port.
  - `StripBarChart`, `CompetenceLevelDistributionChart`, `ItemLollipopChartRenderer` (the
    base owns the marks, subclasses own the layout).
  - `drawItemRing`, `ringStatistics`, `calculateFlexLayout`, `ScatterSelectionController`.
  - `StyleLollipopChart`, `buildDomainStyles`, `styleSpiderGeometry`.
  - SL: `lineChartConfig`, `boxPlotFigure`, `CHART_TYPE_CONFIG`, `getSchoolSummary`,
    `computeBarLayout` (its clearance loop is load-bearing), `drawCompetenceBar`.
- **Tables.**
  - `TableModule` as a whole: a small surface (`setRows`, `deferUntilReady`,
    `tableHeaderActions`) over a great deal of behaviour.
  - `TablePresetManager`, `TableFilterController`, `processColumnDefinitions`,
    `TableHeaderGeometry`, `TableModeController` (three adapters), `tabulatorBuild.js`.
  - `BaseItemTableModule`, `SlBaseTableModule`.
  - `createSurveyMeasureColumns`/`createTraitColumns`, and `createProgressBarColumns`,
    which bundle a visual column with the export columns behind it.
- **Data.**
  - `DocumentStore` with its schemas, `splitAnswer` and `deepFreeze`.
  - `dataset()` catalog keys, parameterised ones included.
  - The `RequestLoader` seam (three adapters), `createModuleContext`,
    `createDatasetRegistration`.
  - `tooltipService`, `GlossaryAnnotator`, `assembleGlossary`, `paletteTokens`.
  - The EN/MA data adapters.
- **SL data.**
  - `resolveInfoBox` over `InfoBoxTextResolver`, the `CompetenceShareQueries` share core,
    `SolutionRateQueries`.
  - `MATERIAL_SUBJECT_CONTEXT` with `MATERIAL_PAGES`.
  - `buildCompetenceLevelIndex`, `SL_DATASETS`.
- **Tooling.**
  - `moduleUnits.mjs`, `cssSheets.mjs`, `sourcePatterns.mjs`, `generatedFile.mjs`,
    `ramp-check.mjs`.
  - `config/csp.mjs`, `config/dependency-cruiser.mjs`.
  - `documentsInHand`, `createTestContext`, `fixtureApi.js`, the e2e `test.js` CSP guard.
