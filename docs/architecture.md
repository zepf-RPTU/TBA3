# TBA3 Architecture

The single authoritative overview of how the dashboards fit together: the module
hierarchy, the lifecycle, state observation and sibling wiring, the app shell, export,
services and data flow. It describes responsibilities and flow at "orient a new
engineer" altitude and links to source for the exact API; it deliberately does **not**
reproduce method signatures the code already expresses.

**Related, more detailed docs** (this file links out rather than duplicating):

- `<unitFile>.md` beside every module unit under `src/` — the per-module API doc (see §2 "Modul-Dokumentation"). The app docs (`src/{en,ma,sl}/{en,ma,sl}AppModule.md`) are the entry point to each view tree: they list the views, each view doc lists its children and wiring.
- `docs/standards-reference.md` — CSS/visual standards, chart typography/legend/axis rules, naming, anti-patterns.
- `docs/tutorial-tour-system.md`, `docs/sl-info-box-placeholders.md` — German authoring guides for tour and info-box copy.
- `docs/module-index.md` — generated: every module unit with its kind, source, doc and the docs that use it (`node tools/docs-sidebar.mjs`; `npm run check` fails when stale).
- **The wiki** (`npm run docs:dev`, built into `dist/docs/` by `npm run docs:build`) renders all of the above in place — VitePress over the repo root (`docs/.vitepress/config.mjs`), the sidebar generated from the app docs' *Views* tables and the view docs' *Kinder* tables, local full-text search, and a dead-link check that fails the build.

The hash router has no separate doc; `src/common/app/viewRouter.js` and §3 below are the source.

## 1. System overview

TBA3 is a static suite (vanilla JS ES modules, built with Vite) visualizing German VERA
standardized-test data. It serves three independent dashboards from the chooser
`index.html`:

- **EN** (`en/index.html`) — Englisch 8, GER levels A1–C1, domains Hören/Lesen. Views: welcome, overview, class, item, student, report.
- **MA** (`ma/index.html`) — Mathe 3, KS levels. Views: welcome, overview, class, item, student, report, help.
- **SL** (`sl/index.html`) — Schulleitung (cross-class school-leadership view). Views: summary (default), welcome, overview, comparison, longitudinal, material, report.

`npm run dev` serves the source, `npm run build` writes the four pages to `dist/` (hashed
assets, one CSS file per page, lazy view chunks). Runtime libraries (d3, Tabulator,
Quill, jspdf, html-to-image) are npm dependencies imported where used; nothing is
loaded as a global. The frontend is static and self-contained: the datasets it lists are
the hand-made demo fixtures under `public/data/`. A real dataset is opened through
`?scope=<level>/<id>` against an API reached same-origin under `/api/` — an API server
on port 8000, proxied by dev, preview and nginx, or, for the fixture folders themselves, the fixture API plugin that dev and preview
mount ahead of the proxy (`config/fixtureApiPlugin.js`). UI and domain vocabulary are
German.

**Site base.** `vite.config.js` sets `base` from `TBA3_BASE` (default `/`), and the wiki
build (`docs/.vitepress/config.mjs`) mounts one level below it at `<base>docs/`. Every
runtime URL to a site path — the fixtures, SL's `info_boxes.json`, the `api/` base — goes
through `siteUrl()` (`apiClient.js`), which resolves `import.meta.env.BASE_URL + path`
against `document.baseURI`; that is why the base has to be absolute and why nothing else
in `src/` may build a root-absolute URL. Unset, the output is what dev, preview, the e2e
suite and the nginx image serve from `/`; the GitHub Pages workflow sets
`TBA3_BASE=/<repo>/` because a project page is served from that sub-path.

**Bootstrap flow.** Each dashboard HTML shows a cold-start skeleton (`#app-skeleton`,
styled by `src/styles/skeleton.css`, the last `foundation` import of the app's `main.css`,
which the page links as its only stylesheet), then
imports `src/common/app/bootstrapDashboardApp.js` and
passes its app class (`EnAppModule` / `MaAppModule` / `SlAppModule`). Bootstrap
instantiates the app against `.main-content`, calls `app.init()`, and owns removing the
skeleton; a failure renders an inline error instead of throwing — including
`apiClient`'s "server not reachable" message when a `?scope=` dataset was selected and
no API answered. `init()` then builds the view containers, resolves the initial view
(deep-linked from the URL hash, else `defaultView`), kicks that view's dynamic `import()`
so it downloads in parallel with the data fetch, runs the subclass's
`initializeComponents()` (dataset acquisition, header, sidebar), starts the router, shows
the initial view, and — once that view is actually revealed — prefetches the other views'
module graphs.

### Repository layout

A folder is named for the code that owns what it holds:

```text
en/ ma/ sl/        one index.html each — the three dashboard shells and Vite's page inputs. Folders, not en.html: the chooser links `en/`, every static server resolves that to the index, and every relative reference inside is one `../` away from src/, which keeps an {en,ma,sl} subtree at the same depth.
index.html         the dashboard chooser.
src/                see below.
src/styles/        the shared sheets: foundation/ (tokens, reset, typography, the control/button taxonomies) and, flat, the multi-owner shells and primitives (header-module, view-layout, …). A sheet for DOM that package code emits ships with that package: `@tba3/modules/styles/` (token defaults, stacked bars, legends, the Tabulator overrides, the modal backdrop) and module-base's unit sheets (icons, the header-action dropdown, the tab strip). Entry-imported into the `foundation`, `common` and `views` layers; every single-owner sheet lives beside its unit as <unitFile>.css (see "CSS" below).
src/{en,ma,sl}/main.css   the app entry sheets: layer order + layered imports; src/sl/variables.css holds SL's own tokens, src/sl/charts-row.css a row layout three SL views share. src/chooser.css is the chooser's entry sheet.
public/            copied into dist/ as-is: the demo fixtures (data/{en,ma}/<dataset id>/, data/sl/sl/) and SL's info-box prose under data/, and the welcome background under assets/. Real datasets are fetched from the API at runtime, never copied here.
packages/module-base/  the framework-free card kit (`@tba3/module-base`): BaseModule, ContentModule, the module runtime and the leaf utilities they need. Zero runtime dependencies, guarded by the structure check.
packages/modules/        the VERA layer (`@tba3/modules`) another VERA dashboard installs instead of rebuilding: the domain vocabulary, the glossary, the data-driven colour palette, every chart and every table. No runtime dependency of its own (`d3` and `tabulator-tables` are optional peers), and guarded by `package-boundary` — nothing inside it may reach back into `src/`.
vite.config.js     the page inputs, the site base (TBA3_BASE), the dev/preview ports, the fixture API plugin and the /api/ proxy to an optional API server; NOTICE is emitted into dist/ from here.
tests/unit/        mirrors src/ path for path; support/ holds the harnesses; cross-app/ the tests whose subject spans two apps.
tests/e2e/         the e2e suite: flat specs prefixed by app (en-, ma-, sl-) or unprefixed when cross-app; support/ holds the Vitest fixtures (test.js), the build + preview setup (servers.js), the axe sweep and the shared boot helpers.
tools/             the structure check, the glossary dump, the SL history fixture generator, the vitest launcher and the pre-push hook (installed by `npm install` via the prepare script).
config/            the ESLint (CSS only), Vitest and tsconfig files, the fixture API plugin and the ambient types; oxlint and oxfmt read .oxlintrc.json / .oxfmtrc.json at the root.
docs/              hand-maintained references and authoring guides.
```

Every `@import`, `<link>`, unit-test path and doc link is a hard reference; a move
updates all of them in the same change, never through a forwarding stub.

### CSS: layered cascade, sheets beside their units

Precedence is decided by cascade layers, not by import order. Every entry sheet
(`src/{en,ma,sl}/main.css`, `src/chooser.css`) opens with
`@layer vendor, foundation, common, modules, views;` and imports Tabulator/Quill into
`vendor`, the tokens/reset/taxonomies into `foundation`, the shared module shells and
table/chart primitives into `common`, and one shared view sheet into `views`
(`welcome-splash.css` in EN, MA and the chooser, `charts-row.css` in SL). A
unit's own stylesheet is `<unitFile>.css` beside its `.js` (and `.md`, `.glossary.json`),
the layer-order statement followed by exactly one `@layer` block in any of the five
layers — `modules` (module, chart config, ViewBase, app shell), `views` (view), `common`
for the shell-level units other sheets build on (`contentModule.css`, `sidebarModule.css`,
`tooltipService.css`, `tableFilterMenu.css`, …) and `foundation` for `icons.css` — the statement is repeated in
every sheet because Vite links a shared chunk's CSS before the entry sheet and the first
`@layer` statement seen fixes the order — and pulled in by `import './<unitFile>.css'` from that file
alone — Vite bundles it and code-splits it with lazy views. Because layers ignore
specificity across layer boundaries, a sheet outside `foundation` must not paint a
`.btn`'s `background-color` directly; it sets `--btn-fill` / `--btn-hover-fill` /
`--btn-active-fill` and lets `buttons.css` paint. The runtime `<style>` the MA task-ring
grid injects stays unlayered on purpose (it must win). `tools/check-structure.mjs`
enforces all of this (`css-ownership`).

### Where shared code lives

Per-app code is `src/{en,ma,sl}/` — the app module, constants, the dataset catalog, the
header-control catalog, the glossary barrel, `views/`, `modules/` (the app's own
composites — cards that wire package cards to app widgets such as the student selector or
the task preview — each in its own folder with its doc and glossary fragment) and `utils/`
(adapters and pure helpers). The app's **charts and tables** moved out to `@tba3/modules`,
along with the helpers they read; what stays is the configuration they are handed as options. Everything shared is one folder deep under
`src/common/`, each named for what it holds:

```text
src/
└── common/
    ├── app/         the app shell: BaseAppModule (appModule.js) plus its runtime — appState, viewRouter, viewLifecycle, viewSkeleton, bootstrapDashboardApp, classSearchParams
    ├── export/      the capture → compose → download pipeline plus ExportService and the batch cart
    ├── modules/     BaseViewModule, the sidebar, the band thumbnails, and the header, navCard, notes, overlays and tutorial widgets
    ├── services/    the collaborators that are tba3's own: DataStore, dataset acquisition, API client, notifications
    └── views/       view bases shared by more than one app: the EN/MA welcome splash, TextModule, and report/ (the batch-export report view)
```

The VERA layer moved out to `packages/modules/src/common/`, which mirrors this tree exactly
so the relative imports between its own files never had to change:

```text
packages/modules/src/
├── common/
    ├── charts/      the whole D3 layer: chart-shared drawing helpers, comparison series and the comparison-state port
    │   ├── host/    ChartHostModule and its collaborators (header controls, the ⌀ comparison-mode control, comparisonSync)
    │   ├── ksDistribution/  the EN/MA stacked KS-distribution family: its renderer base, config preset and highlight contract
    │   ├── legend/  the HTML legend panel + controller (app-facing)
    │   └── renderers/  ChartRenderer and its subclasses; internal/ is renderer-private (layout, measurement, typography, grid, SVG legend)
    ├── domain/      VERA vocabulary and rules: terms, levels, competenceScale, competenceStandardRanks, bookletOrder, comparisonGroupLabels, itemMeans, itemResultCounts, pilotierung, traitRegistry, apiValueMaps
    ├── glossary/    the glossary as one feature: assembly, text access, keys, the annotator, the payload-driven competence-level entries
    ├── services/    the colour layer plus the tooltip and anchored-popup singletons: competence-level palette + colour ramp, theme colours, the KS theme and colour-scheme switches, the palette-repaint port
    ├── tables/      the Tabulator layer: TableModule, the four base table modules, the mode-state mixin, column factories, formatters, presets, export columns; internal/ is TableModule-private
    └── utils/       the two generic helpers a chart reaches (numberFormat, scrollRegion)
└── en/ ma/ sl/     each subject's cards — chart descriptors (modules/charts/**), concrete tables (modules/tables/**), the EN item detail, the SL info boxes and Materialien — with their own docs and glossary fragments, the map that mounts those fragments (`<app>GlossaryFragments.js`), the vocabulary they label with (enTerms, maTerms, slVizModes) and the adapters that shape a payload for them (utils/)
```

A `common/` level inside a package with nothing to be common *with* reads oddly, and is
deliberate: the internal layout optimises for zero import churn as more of the tree
follows, and the external names are curated in the `exports` map instead.

The dividing line between the two: `@tba3/modules` holds every VERA card — charts and
tables — and what they need; `src/` holds what composes a dashboard: the shell, the views,
data acquisition, export, the app configuration, and the composites that wire package cards
to app widgets. A package card that needs an app capability (the task preview, the MA task
pools, the SL documents) takes it as an option, a callback or a port (`comparisonState`,
`SlData`) instead of importing it.

`tests/unit/` mirrors the tree a module *came from*, so a test sits at the same path under
`tests/unit/` that the module has under `src/` — a file that moved into a package keeps its
place there and imports it by package specifier, as `icons.test.js` and
`traitRegistry.test.js` do.

## 2. Module hierarchy

Everything on screen is a module. Two roots: `BaseModule` (all modules) and, for D3
charts, the standalone `ChartRenderer` (NOT a `BaseModule` subclass). A few
page-lifetime helpers are plain classes the app *has* (see §5).

```text
BaseModule                        packages/module-base/src/modules/baseModule.js
├── ContentModule                 — opt-in title/subtitle/body shell + glossary + export control
│   ├── ChartHostModule           — config-driven chart host (final; no chart subclasses)
│   ├── TableModule               — Tabulator wrapper + presets + filter menu + reactive state
│   │   ├── BaseClassTableModule        — EN/MA class tables (MA directly; EN via withDomainMode)
│   │   ├── BaseItemTableModule         — EN/MA item tables
│   │   ├── BaseStudentDataTableModule  — EN/MA student data tables
│   │   ├── BaseStudentInfoTableModule  — EN/MA student info tables
│   │   └── SlBaseTableModule           — SL multi-Tabulator tables (class + domain, via withTableModeState)
│   ├── TextModule                — titled HTML block from a glossary entry
│   ├── NavCardModule             — navigation card grid
│   ├── package cards             — EnItemDetailModule, ScatterplotFilterModule, InfoBoxModule,
│   │                               MaterialSelectionModule (packages/modules/src/{en,sl}/modules/)
│   └── app composites            — En/MaStudentTablesModule, MaStudentTopBarModule (src/{en,ma}/modules/)
├── BaseViewModule                — state observation, suspend/resume flush, render cover, notes/tour hooks
│   ├── BaseAppModule             — per-app coordinator (src/common/app/appModule.js)
│   ├── WelcomeSplashViewModule   — the EN/MA landing view (greeting + nav cards); each app subclasses it with content only
│   ├── ReportViewModule          — the shared batch-export report view
│   ├── MaLayoutViewBase          — the MA item and student views (resizable split-pane layout modes)
│   └── every other *ViewModule   — extends BaseViewModule directly
└── HeaderModule, ModeSwitchModule, SelectControlModule, StudentSelectorModule,
    MaGlossarySearchModule, SlDetailOverlayModule — header widgets and body-mounted modules

ChartRenderer                     packages/modules/src/common/charts/renderers/chartRenderer.js
├── BarChartRenderer
│   └── BaseKsDistributionChartRenderer   (packages/modules/src/common/charts/ksDistribution/)
└── LollipopChartRenderer
```

### Base classes (purpose)

- **`BaseModule`** — the stable facade for every module: identity, lifecycle,
  data/options, the recursive `onThemeChanged()` verb, child registration with
  cascading cleanup, visibility, settle waiting (`whenSettled`,
  `whenSubtreeSettled`) and a `ResourceTracker` (`this.resources`) that auto-frees DOM
  listeners, timers, animation frames and subscriptions on `destroy()`. Its internal
  concerns live in collaborators under `modules/internal/` (`ModuleChildRegistry`);
  the public API stays on `BaseModule`. It carries no tooltip API: a module's tooltips
  are the delegated `data-tooltip-*` and `[data-glossary-key]` paths the app shell wires
  once, and the cursor-following tooltip belongs to `ChartRenderer`.
- **`BaseViewModule`** — adds `observeState` / `observeActiveComparisons`, the
  suspend/resume flush, the render cover (§3), `_hydrateChildren`, container queries,
  `navigate`, and the two hooks the app shell calls back into: `getNotesLinkTargets()`
  (which children the notes drawer may link to — by default every child with its own
  title bar) and `customizeTourSteps(steps)` (adjust the derived walkthrough).
- **`ContentModule`** — an opt-in title/subtitle wrapper (`showModuleTitle: true`)
  sourced from glossary data. The glossary is the only source of that copy: a
  `title:`/`subtitle:` option never overrides an entry, `setTitle()` is for data-driven
  names only, and a key without a title renders `MISSING FROM GLOSSARY`
  (enforced by `tools/check-structure.mjs`, rule `glossary-copy-ownership`).
  Subclasses override `_doRenderContent(data)` (not `_doRender`) and render into
  `this.contentContainer`. The wrapper builds once; the container's DOM `id` transfers
  to `.content-module-body` so chart renderers still find their target. It also owns
  collapse/expand and the local header toolbar the export control mounts into. Feature
  CSS must not target `.content-module-*` slots (enforced).
- **`ChartHostModule`** — final, config-driven chart host. A chart type is a **config
  descriptor object**, not a subclass (below). Manages the renderer set, scope-based
  tooltip/resize cleanup, header-mounted controls (`chartHeaderControls.js`, the ⌀
  `comparisonModeControl`) and the default export descriptor.
- **`TableModule`** — Tabulator wrapper. Owns `createTable`, reactive `_state` read by
  formatters, preset management, and delegates cohesive concerns to collaborators under
  `tables/internal/` (`#eventSuppression`, `#visibilityQueue`, `#redrawScheduler`,
  `#presetManager`, `#tableFilters`, `#headerGeometry`, the column-visibility menu).
  **Column filtering is a header-action menu, not a header row**: columns still declare
  `headerFilter` / `headerFilterParams` / `headerFilterFunc`, but `createTable` /
  `updateColumns` extract those into descriptors (`tableFilterMetadata.js`) and strip
  them before Tabulator sees them. The values live in `TableFilterController`, are edited
  through the filter dropdown and applied as one programmatic filter the preset manager
  treats as persistent. Subclasses reach them only through `_setTableFilterValue`;
  no module calls Tabulator's `*HeaderFilter*` APIs. Clearing all filters at once is the
  preset `Reset` button's job. EN and MA share the four `Base*TableModule`s; SL's
  multi-table views use `SlBaseTableModule`, which owns the multi-Tabulator lifecycle.
- **`BaseAppModule`** — the per-app coordinator. Subclasses supply `viewConfig`, lazy
  view imports, initial state, the per-view header configs
  (`setViewHeaderConfigs(build*ViewHeaderConfigs(ctx))`, with `ctx` from the base's
  `_buildHeaderControlContext(extras)`) and `initializeComponents()`;
  control state is declarative (`stateKey`/`injectState` in `*HeaderControls.js`). It *has*
  collaborators rather than doing everything itself: `#router` (`ViewRouter`),
  `#appState` (`AppState`), `#dataStore`, `#sidebar` (`SidebarModule` — nav sidebar,
  KS theme picker), `#headerOrchestrator` (`HeaderOrchestrator` — owns the
  `HeaderModule`, per-view header configs, control building, glossary resolution, the
  render-skip cache), `#viewLifecycle` (`ViewLifecycle` — the view state machine:
  container/module slots, lazy initialization, the transition lock with its single-slot
  navigation queue, rollback after a failed switch, theme-stale tracking; `currentView`
  itself stays in app state because
  header controls read it through `getStateValue`), `#notesController` and
  `#tutorialController` (§5). Subclasses customise a transition through
  `beforeShowView(viewType, options)` and `afterShowView(viewType, { previousView })`
  only — both run at dispatch time, so a queued navigation reaches them with its own
  options. No app overrides `showView()`; `initializeView()` stays on the app because it
  is where the app's own dependencies are applied to a new view.
- **Intermediate view bases** — `WelcomeSplashViewModule` (the EN/MA landing view; the
  app subclasses add content only) and `MaLayoutViewBase` (the MA item and student views:
  layout modes both / table-only / chart-only, the task-ring focus chart lifecycle). Every
  other view, all of SL included, extends `BaseViewModule` directly.

### Collaborators the base *has*, not *is*

The shared bases keep a small inherited surface by handing cohesive concerns to
collaborators — `BaseModule` → `modules/internal/`, `ChartRenderer` → `this.legend` /
`this.grid` (`renderers/internal/`) and `this.htmlLegend` (`charts/legend/`),
`TableModule` → `tables/internal/`, `BaseAppModule` → the runtime in `app/` plus
`SidebarModule` and `HeaderOrchestrator`. Collaborators stay app-agnostic (they never
import `src/en|ma|sl`). Leaf-renderer clusters were split the same way (scatter
jitter/zoom-math/selection, item-lollipop legend planner, group-comparison control
model).

**Deliberately *not* extracted — do not re-attempt without a concrete bug the split
ownership caused:**

- the scatter **zoom controller** (mutates the chart's own scales and drives its private
  render helpers — only the pure zoom math was separable) and the group-comparison
  **stateful control model** (`this.state` is read throughout the render path — only the
  pure decision logic was separable);
- `TableModule.createTable` (tightly coupled to Tabulator construction) and
  `ChartRenderer`'s text/dims helpers (coupled to the measurement internals and the
  dimension cache);
- a **per-table lifecycle record** in `TableModule`: after `TableHeaderGeometry` took the
  container/floors/realign state, what remains per table is the settle slot and the
  built flag (`#builtTables` + `_isTableBuilt`); a record would relocate, not
  concentrate;
- a **single interaction-state owner** for Reset / presets / filters / limit /
  progress-bar shadow sort: the protocol between `TableModule`, `TablePresetManager`,
  `TableFilterController` and `progressBarSorting` is pinned against a fake table in
  `tests/unit/common/tables/tablePresetProtocol.test.js`, so an owner would move three
  collaborators behind four verbs without removing anything;
- a **`RenderCover` owner** for the view render cover (`data-view-rendering`,
  `aria-busy`, the skeleton overlay, the reveal promise), written from `BaseViewModule`
  and `ViewLifecycle` and coordinated by idempotent `show/hideViewSkeleton`. The one
  deletion it promised — `whenViewRevealed`'s rAF poll — is not the cover's to remove:
  the poll exists for a `showView()` that only *queued* mid-transition, where the target
  container is neither current nor covered and DOM-identical to a revealed view. Pinned
  by "makes whenViewRevealed() wait for a queued navigation to reach the screen" in
  `tests/unit/common/app/viewLifecycle.test.js`.

**Deliberately *not* unified across apps** (the cross-app unification programme of
2026-08-27 shipped 16 shared homes; these four rows were re-verified and left per app):

- **Nav-card config from `viewConfig`** — SL derives its cards from `viewConfig`; EN and
  MA list theirs by hand, because `viewConfig` carries no card visual (icon or band
  thumbnail) and no per-card `viewMode` (MA). A shared builder would need a per-app
  mapping table — the same data in a second shape.
- **Panel / layout-mode switching** — MA (`MaLayoutViewBase`: one 3-way mode,
  hide-during-transition, chart-only creation hook) and SL overview (two orthogonal modes →
  four panels, lazy per-panel init, no transition hiding because charts must measure
  before render) share exactly one step, "write the mode where CSS can read it".
- **Nav-card CSS** — EN and MA share one welcome skin (`welcomeSplashViewModule.css`);
  SL's cards (`slAppModule.css`) are a compact bottom row that shares two declarations
  with it, not worth a base file.
- **`index.html` / `main.css` preamble** — the shells differ in six lines and there is no
  templating step to emit a shared preamble from; SL interleaves its own `variables.css`
  between the common tokens and `competence-levels.css`, so a shared foundation bundle
  would move its overrides later in the cascade.

### Charts are config-driven, not subclassed

A chart type is a config descriptor (`*Config.js`) handed to a `ChartHostModule`, which
drives a renderer from `packages/modules/src/common/charts/renderers/` (or an app-local subclass of one).
To add or change a chart, edit/add a descriptor — do **not** introduce a chart subclass.
Descriptors expose a `CONFIG DESCRIPTOR` section (enforced) with `createRenderer` and
optional `onUpdate` / `prepareLayout` / `onRendered` / `onCleanup` / `publicAPI` /
`defaultOptions` / `glossaryPath` / `getExportIdentity`. Complex charts keep a feature-local controller
(the MA task-ring grid, the SL competency overview/detail), but the exported descriptor
keeps that shape. Extract a new shared renderer base only when ≥2 concrete renderers
genuinely share behavior; `ksDistributionConfigPreset.js` is the one shared *config*
preset (EN and MA KS distribution).

The render cycle brackets the first measurement with two optional hooks:
`prepareLayout(host, charts, data)` runs before it (layout-affecting DOM work),
`onRendered(host, charts, data)` after it — for anything that can only be read off a
drawn chart, such as a minimum height the chart computes for itself. Use the hook
rather than wrapping `chart.create`.

Renderers are held in an array. `createRenderer` may return one, several, or `null`
(deferred creation). A config that creates a renderer later swaps the set with
`host.replaceChart(renderer)` or appends with `host.addChart(renderer)` — `replaceChart`
destroys what the host already tracks, `addChart` does not, which is what lets one host
keep two renderers alive and toggle between them (`en/…/style/styleChartConfig.js`).
Every render pass destroys the tracked renderers *before* `createRenderer` runs, so a
config that keeps its own references must release them at the top of each pass and
rebuild from the state it holds — the payload the host passes in is the one the view
last handed it, not what the config has since derived from sync calls.

### Modul-Dokumentation

Every module unit — an exported class extending a `*Module`/`*ViewBase` class or a chart
`*Config.js` descriptor — documents itself in a German `<unitFile>.md` beside its source.
The sections depend on the unit's kind, told apart by what it extends (the checker reads
the base class, not the subclass name):

- Content units (everything else): Zweck, Design/Idee, Klassenhierarchie, Daten, Optionen, Methoden.
- Views (extending `BaseViewModule`, another `*ViewModule` or a `*ViewBase`): Zweck,
  Design/Idee, Klassenhierarchie, Kinder (child units with doc links), Daten, Zustand
  (observed app-state keys → child verbs), Verdrahtung (sibling callback → verb wires),
  Optionen, Methoden.
- Apps (extending `BaseAppModule` or another `*AppModule`): Zweck, Design/Idee,
  Klassenhierarchie, Views (in `viewConfig` order, with doc links), Daten, Zustand
  (initial-state keys, who writes and reads), Hooks.

The headings are required in that order. Design/Idee reads `TODO` until the design
rationale is written. The body of Klassenhierarchie is generated by
`node tools/docs-hierarchy.mjs` from the unit scan: the ancestors from `BaseModule` down,
the unit itself, and its direct subclasses (for `ChartHostModule`, the descriptors it
hosts). `npm run check:docs-hierarchy` fails when it is stale, so it is never edited by
hand.

Daten states which parts of the API spec (`tba3-spec.yml`) the unit depends on, in the
format `packages/modules/docs/datenvertrag.md` defines. A content unit gives a **Benötigt**
table (endpoint kind, query parameters, fields; ¹ marks a field the spec leaves optional
but the unit cannot do without) and an **Optional genutzt** table (optional field, the
visible effect without it), then one `Payload:` line naming what the unit receives. A view
gives an `Endpunkt | Parameter | Geht an` routing table, an app its concrete requests
(`Anfrage | Parameter | Dokument | Schlüssel`). A unit that reads no API data says
`Keine API-Daten.` The gate checks this format, not the field paths.

`BaseModule`, the root, documents as a content unit; `BaseViewModule` and `BaseAppModule`
document as view and app. A file that exports units of several kinds needs the union of
their headings.

A unit doc describes only surface that is actually reachable. An option, verb or
payload key with a row in the `.md` and no caller anywhere is not documentation —
it is a dead branch that reads as a supported feature, and the next reader writes
code against nothing. Delete the implementation and the row in the same change.
Before deleting, search with at least two spellings: the bare identifier, the
`option:` literal, `getOption('…')`, `?.verb(`. Several apparent corpses turn out
to be reachable through one of the other forms.

Those files are the authoritative per-module API docs; this document stays at
orientation altitude and JSDoc stays per symbol. Base classes (`baseModule.md`,
`baseViewModule.md`, `appModule.md`, `contentModule.md`, `tableModule.md`, the four
`base*TableModule.md`, `chartHostModule.md`, `headerModule.md`) carry the complete
inherited surface once; a leaf reaches its base through its Klassenhierarchie and lists
only its own delta. A chart config's doc describes the descriptor (the options it reads,
its `publicAPI`, the `data` it receives) — the host is documented once in
`chartHostModule.md`. Presence, headings and their order are enforced.

## 3. Lifecycle and patterns

**Module lifecycle** (all `BaseModule` subclasses):

```text
constructor(id, container, options)   stores options; setDefaults() fills missing keys; registerCallback()
  → mount(data)      [sync]   validates container, sets element, stores data
  → hydrate(data)    [async]  runs _doRender() (or ContentModule's _doRenderContent), sets initialized
  → init(data)       [async]  = mount() + hydrate()
  → update(data)     [async]  stores data; subclasses override it to re-render
  → show() / hide()           toggles visibility, cascades to registered children
  → destroy()                 idempotent teardown; call super.destroy() LAST in overrides
```

Subclasses implement `_doRender(data)` (or `_doRenderContent` for `ContentModule`,
`_renderView` for views); `render()` is a `BaseModule` wrapper that validates the
container first.

**View render template.** `_doRender` is final for views. It covers the container
(`beginViewRender` — `data-view-rendering`, `aria-busy`, the skeleton overlay from
`viewSkeleton.js`), awaits the view's `_renderView(data)`, then `revealView()` uncovers
once the subtree settles. A view implements `_renderView` only and never calls the cover
pair; a throw inside `_renderView` leaves the view covered for `initializeView()` to
destroy. `BaseAppModule` overrides `_doRender` itself — the app shell has no cover.

Inside `_renderView`, children go through `_hydrateChildren([[module, mountData?],
…])`: it registers and mounts every entry *before* any of them
hydrates, so a sync one child fires from its render reaches its siblings. A
hydrate-order dependency (EN's style/lollipop charts must be prepared before the table
fires its first `onDataSync`) is two calls, one per batch. Null entries are skipped; a
child mounted early (to put a class on its shell, set a title, place the MA pool
selector) is not mounted or registered twice. `_renderView` does **not** need
`setData(data)` — `hydrate()` already stored it. Observe app state from `_renderView`,
not the constructor: state written before the render is read directly with
`getStateValue`, so the first render already reflects it.

**View switching.** `ViewLifecycle.showView` suspends the current view (`suspend()`:
observers record the latest value per key), lazily imports and initializes the target
(`initializeView`), runs the app's `beforeShowView`/`afterShowView`, activates sidebar
and URL, and resumes the target (`resume()` flushes the recorded values, then
`onResume()`). A `showView` that arrives mid-transition is queued in a single slot; a
failed switch rolls back to the previous view. The router (`ViewRouter`) mirrors
`showView` into the hash and routes back/forward and manual edits into `showView`.

**Recurring patterns:**

- **Private members** use JS `#field` / `#method`. Child modules are registered via
  `this.registerChildModule(...)` so cleanup cascades; null child refs before
  `super.destroy()`.
- **Options-based DI** — services (tooltip, resize, export) are resolved from `options`
  with singleton defaults, so tests inject fresh instances.
- **Callback registration** — `registerCallback(name, fn)` / `triggerCallback(name, …)`
  for external coordination (`onSelectionChanged`, `onDataSync`, …).
- **App state access** — `AppState` (`src/common/app/appState.js`) is the app-owned state
  collaborator: a keyed state bag (`getStateValue` / `updateState` / `observe`) plus the
  comparison verbs (`seedComparisonState`, `setComparisonMode`,
  `getActiveComparisons`). `BaseAppModule` builds it in `configure()` and exposes it as
  `this.appState`; every view receives it as the **`appState`** option and observes the
  keys it needs (§4). A view or a chart config never holds the app coordinator, and
  `AppState` has no `publish`: modes are not events. Children are constructed with
  `this._childOptions(extras)` (`BaseModule`, extended by `BaseViewModule`): the one
  canonical bundle of `appState`, `comparisonState`, `onNavigate`, `dataStore` and
  `glossaryData`, so no view hand-picks a subset — a non-module utility takes the keys
  it reads by name instead (`infoBoxModule.#resolveBlockLinks`).
- **Comparison state is a port, not the app state** — the chart layer never depended on
  `AppState` itself: measured, its whole need is two verbs plus one push channel, and
  average *values* always arrive as payload or options. `comparisonState.js` names that
  as `{getActiveModes, isActive, setActive, subscribe}`; `appComparisonState.js` is
  tba3's adapter over `AppState`, built once per app and threaded like any other child
  option. Every chart config and renderer reads the port — the older second route, where
  EN handed `appState` in the render *payload*, is gone. The state is seeded once per
  dataset with `appState.seedComparisonState(ids)` (all three apps; every comparison group
  the dataset delivers starts shown — EN seeds its competence-level groups and item
  comparison groups together) and pushed into charts that hold `activeModes`
  through each view's `observeActiveComparisons` → the chart's `setActiveModes` verb
  (`comparisonSync`). **No state at all is not an empty list:** a host that supplies no
  `comparisonState` gets `activeModes: null`, which every consumer of it reads as "draw
  every mode the payload carries". An empty list is an opinion and hides them. A state
  without `setActive` is read-only, and builds no ⌀ menu — which is how the scatterplot
  filter modal shows the page's averages without offering to change them.
- **Header controls** — per-app catalogs (`src/{en,ma,sl}/*HeaderControls.js`) declare
  controls as self-contained definitions (`type`/`id`/`options` plus `injectState` and
  `onChange`) through the shared factories in `src/common/modules/header/`
  (`datasetSelectorControl`, `modeSwitchControl`); `HeaderOrchestrator` strips the
  callbacks off the clone before `HeaderModule` renders it, so the render-skip signature
  sees plain data. The no-op republish guard lives in the factories once, for every app.
- **Reactive state** — `applyReactiveState(this, this.getInitialState())`
  (`@tba3/module-base/utils/reactiveStateMixin.js`) patches `_state` / `setState` / `getState`
  onto `ChartRenderer` and `TableModule`; `setState` fires `_onStateChanged` only on real
  per-key changes, enabling targeted (not full) re-renders.
- **Mixins** — two kinds: *function mixins* (`applyReactiveState`) patch an instance, and
  *class-factory mixins* (`withTableModeState`) return a subclass. `enWithDomainMode`
  binds the EN Domäne switch to `_state.mode` once for the four EN tables;
  `withTableModeState` directly wraps `SlBaseTableModule` for the SL class and domain
  tables. Layers use `super`-delegation rather than shadowing.
- **Module file scan order** (for `ContentModule`/`TableModule` subclasses):
  constructor/defaults → event handlers → base-hook implementations → lifecycle/update →
  export/public API → private helpers.

## 4. State observation and data synchronization

There is no event bus (removed 2026-08-30). Three mechanisms remain: the
theme verb, observed app state, and direct sibling wiring. The rule they share: a leaf
module (table, chart host) is seeded from explicit options and driven through plain
verbs, never through a bus, an event map or `appState`; a producer leaf reports through
a callback option the owning view wires to the sibling's verb. That is what keeps a leaf
constructible standalone.

### Theme refresh is a plain verb

A KS theme switch (`ksThemeService.applyKsTheme`, sets `data-ks-theme` on `<html>`,
persists to `localStorage`) and a colour-scheme switch (`colorSchemeService.applyColorScheme`,
sets the resolved `data-color-scheme` — `light`/`dark` — on `<html>`; the stored choice may
be `system`, which follows `prefers-color-scheme` live; the competence-level palette
resolves its ramps per scheme from the same attribute) both invalidate the theme colour
cache and call the active view's `onThemeChanged()` (`viewLifecycle.refreshThemeInCurrentView`, which also
remembers hidden views that missed it); `BaseModule.onThemeChanged` forwards
recursively to registered children, so composites pass it through to their
grandchildren. `ChartHostModule` overrides it to rebuild its renderer(s) against the
invalidated colour cache, `TableModule` to redraw so cell formatters re-run — both call
`super.onThemeChanged()` so their own children still catch up. The decorative band
thumbnails belong to no view, so nothing in that cascade reaches them: the palette
services announce the change through `paletteRepaint.js`, and `bootstrapDashboardApp`
is what registers `repaintBandThumbnails` as the handler. A host that registers none
simply has nothing painted outside its views — the services never name the renderer.

### Mode state is observed, not broadcast

Everything a header control switches or selects (EN `currentMode`, MA `layoutMode` and the
chart-only Leitidee `chartOnlyDomainId` that a ring click writes, SL `viewMode` / `displayMode` / `vizMode` / `summaryMetric` / `selectedDomainIndex` /
`longitudinalViewMode` / `longitudinalChartType` / `materialSubject` / `materialType`)
and the ⌀ toggles' `comparisonState` is app state, not an event. The control's
`onChange` only writes the key (`modeSwitchControl` declares no event type;
`AppState.setComparisonMode` only writes); the view that renders the value observes it
with `BaseViewModule.observeState(key, handler)` (or `observeActiveComparisons`) —
`AppState.observe` delivers only on an actual change — and the handler calls plain verbs
on its children: `table.setState({ mode })`, a chart config's `publicAPI` (`setVizMode`,
`setDomainMode`, `setActiveModes`, `setDomainIndex`, …), or `host.update(data)` when the
view rebuilds the payload. Children are seeded from an explicit option (`domainMode`,
`vizMode`) and never read app state for a mode — which is what lets them be constructed
standalone. `observeState` follows
suspend/resume: a hidden view keeps the latest value per key and applies it on
`resume()`; a view built after the write seeds itself from `getStateValue` (the material
view after an info-box link).

### Student selection is observed state

`currentStudentId` follows the same rule. Whatever is clicked — a class-table id link, a
scatterplot point, a name in the item detail's student grid, the MA header selector, the
MA student top bar, the EN student-view selector — reaches the owning view through a
callback option (`onStudentSelected`) and the view writes
`appState.updateState({ currentStudentId })`. A click that also means "open that
student" calls `this.navigate('student')` right after the write (`_openStudent`; state
first, so a student view built by the navigation seeds itself from `getStateValue`). The
student views `observeState('currentStudentId')` and re-point their children
(`setStudent` on the spider host, `updateStudent` on the tables, the MA top bar's
`setStudent`, a no-op for the id it already shows). No source tags: intent lives with
the click, not with a subscriber inspecting who sent it.

### Table ↔ chart sync (direct sibling wiring)

A table and the chart (or detail panel) it drives are always children of the same view,
so the view wires them directly. The producer exposes a callback **option** —
`onDataSync(data)` on the EN class and item tables, `onItemSelected(payload)` on the EN
item and student-data tables, `onLevelSelected(level)` on the MA KS bar and KS
distribution hosts, `onKsFilterCleared()` on the MA class table,
`onDomainSelected(domainId)` on the chart-only task-ring host — and the consumer exposes
a **verb**: a chart config's `publicAPI.applySync(host, data)` /
`setKsLevelFilter(host, level)` / `updateHighlight(host, level)`, the detail panel's
`onItemSelected(payload)`, the MA class table's `setKsLevelFilter(level)`. The view
passes lazy closures (`onDataSync: (d) => this.#chart?.applySync(d)`), so construction
order is irrelevant; where a chart defers its first render to the table's first sync,
the view still hydrates the chart in its own batch first, because the config's
`prepare` must have run. Payloads carry ids only (`{ visibleIds, selectedIds?, mode }`)
and the records are resolved through a store the view owns and hands both sides
(`en/utils/enIdStore.js`). The bidirectional MA pair (KS bar ↔ class table) needs no
loop guard: the table's filter never calls back, and `updateHighlight` never clicks.

## 5. The app shell

Besides views, `BaseAppModule` owns a set of page-lifetime helpers. They are plain
classes the app *has* — dependencies injected, listeners on the app's resource tracker —
not `BaseModule` subclasses, because they outlive every view.

- **Header** (`modules/header/`): `HeaderModule` renders the title cluster, the view
  controls and the action buttons (info/tour, notes, export). `HeaderOrchestrator`
  resolves the glossary-driven header text — an entry's `subtitle` is the only source
  of a view's subtitle — and the control labels, builds the per-view control definitions
  with live app state injected, and dispatches changes back to the declaring control.
  `dropdownManager` / `headerActionDropdown` (both in `@tba3/module-base`) coordinate the
  header-action menus — `bootstrapDashboardApp` starts the coordinator with
  `initDropdownManager()`, which installs the outside-click and Escape listeners;
  `ModeSwitchModule`, `SelectControlModule`, `StudentSelectorModule` are the widgets the
  control definitions instantiate.
- **Sidebar** (`SidebarModule`): the view navigation (from `viewConfig`, with
  `viewConfig.icon` as a Material Symbols name) and the KS colour-theme picker
  (Standard, Graustufen, Farbenblind-sicher, Landesvorgabe — the last only when the
  payload carries colours).
- **Notes drawer** (`modules/notes/`): `NotesController` hosts a Quill editor in a
  slide-in drawer; one notebook per dashboard split into user-created pages, persisted
  to `localStorage` (`tba3_notes_<app>`). Chips inserted from the drawer link to a module
  in any view (`ModuleLinkBlot`): clicking one switches to that view and highlights the
  module (`scrollHighlight`). Link targets come from each live view's
  `getNotesLinkTargets()`; a view not opened yet this session lists none (the off-screen
  prewarm that used to render it was deleted 2026-08-28).
- **Tour** (`modules/tutorial/`): the header info button starts a `TutorialController`
  walkthrough — a spotlight ring and callout card per step. Steps are derived from the
  active view's module tree (`tourStepBuilder`: the header, then every registered module
  with `tutorial` copy, in document order), adjusted by the view's
  `customizeTourSteps`, and resolved through `glossaryTutorial` so they are annotated
  and template-replaced once. Authoring guide: `docs/tutorial-tour-system.md`.
- **Overlays** (`modules/overlays/`): `SingletonOverlay` is the shared
  mount/visibility/Escape-close primitive *composed* by `NotesController`,
  `TutorialController` and `ItemPreviewOverlay` (the single-task preview with its media
  placeholders). SL's `SlDetailOverlayModule` is a `BaseModule` mounted to `document.body`
  and deliberately not registered as a view child.
- **Skeleton** (`app/viewSkeleton.js`): idempotent `showViewSkeleton` /
  `hideViewSkeleton`, an absolutely positioned sibling of the view container, asserted by
  the app for the lazy-import window and re-asserted by `beginViewRender()`.
- **Batch export toolbar** (§6), initialized once from `BaseAppModule`.

## 6. Export system

Export provides per-module export buttons plus a batch selection cart and a report
view, backed by one capture pipeline in `src/common/export/`.

- **Opt-in via `ContentModule`.** A module becomes exportable by overriding
  `getExportControlDefinition()` — its own precondition, then
  `this._buildExportControlDefinition(type)` for the `{id, title, type, container}`
  descriptor every module builds the same way; `ContentModule` mounts the shared control
  in its local header toolbar. `ChartHostModule` and `TableModule` return a default
  descriptor when `enableModuleExport: true`, so most configs just flip that flag.
  Modules do not ship actions: `ExportService` picks the menu from `type` — `'table'` →
  CSV/JSON/PDF, everything else → PDF/PNG/JPG (`exportActions.js`).
- **One id per exportable thing, not per module** (`exportTargetId.js`). The `id` is the
  cart key, the IndexedDB key and the report-card key at once, so two targets sharing an
  id share one tick and one capture. `buildExportTargetId(moduleId, identity)` is the
  only place ids are built; it composes `module-<module id>`, the identity, and the
  dataset.
  - **Identity** comes from `ContentModule#getExportIdentity()` — `null` (a module that
    shows one thing for its lifetime) or what it currently shows. Override it wherever
    one instance is re-pointed in place: a selected student (`styleChartConfig`, both
    `*StudentTablesModule`s), an item (`EnItemDetailModule`), a Leitidee or domain
    (`taskRingFocusConfig`, the longitudinal configs, the EN mode-driven tables), a task
    pool (`MaClassTableModule`), an InfoBox section, a material selection, a group
    comparison. `ChartHostModule` takes it from the descriptor's `getExportIdentity(host)`.
    Always from data, never display text — a tick outlives a glossary edit. Display
    variants (viz mode, KS highlight, comparison toggle, filters) are deliberately *not*
    identity: they are one card, and re-ticking replaces its capture.
  - **Resync obligation:** the id is only re-read when `syncExportControls()` runs
    (after `_doRenderContent`, and on `setTitle`). Any in-place update that changes the
    identity without re-rendering must call it, or the checkbox keeps ticking the
    previous entity.
  - **Dataset:** switching dataset is a full reload while the cart survives it, so every
    id carries the dataset (`exportDataset.js`, set by each app module from its resolved
    dataset), and the capture records its label for the report caption.
  - `ExportSelectionManager` warns when a ticked id re-registers under a different title
    — the safety net for identity nobody declared.
- **Capture** (`exportCapture.js`) — the module card (`container` → closest
  `.module-container`: title + subtitle + body) is cloned into an off-screen
  `.export-capture-stage[data-exporting]` sibling; controls are removed, collapsed cards
  expanded, Tabulator tables swapped for their full `getHtml('active')` output (the live
  table is virtual-DOM), and the clone rasterized with **html-to-image**. html-to-image
  inlines computed styles for HTML nodes but deep-clones `<svg>` subtrees untouched, so
  the stage first writes the computed SVG presentation properties inline on every chart
  element — otherwise CSS-painted content such as the competence bands
  (`fill: var(--ks-band-color)`) rasterizes black. No web font is embedded (icons are
  inline SVG, text uses system fonts); the live DOM is never mutated across a paint.
- **Output** — PNG/JPG straight from the canvas; PDF via **jsPDF** (`pdfComposer.js`:
  A4, portrait by default, landscape only for clearly wide content that fits one page, a
  taller single-module capture sliced across pages; the report path never slices).
  CSV/JSON come from Tabulator's download module (`;` delimiter; the CSV gets one UTF-8 BOM
  prepended to the joined tables, Tabulator's own `bom` stays off; honours filters,
  sort, column visibility; number formatting in `tables/downloadNumberFormat.js`). File
  names: `tba3-{app}-{view}-{title}-{yyyyMMdd-HHmm}.{ext}` (`exportFiles.js`).
- **Libraries** — html-to-image and jsPDF are npm dependencies that `exportLibs.js`
  imports dynamically on first export; the build splits them into their own chunks,
  never on the critical path.
- **`ExportService`** (singleton) builds the button UI, runs the chosen action with a
  busy state and loud failure (`notifyFailure`: console + persistent toast), and wires batch registration
  synchronously. The view key an export record carries is read from the hash when the
  user exports or ticks (`getCurrentViewKey` in `app/viewRouter.js`), never at
  registration — a view's modules register before the router has synced the hash.
- **Batch cart** — `ExportSelectionManager` tracks the registry plus a persisted
  selection cart (`tba3_export_selections_<app>`, one per dashboard — target ids are only
  unique within an app). **The cart is a basket for one browsing session, not a durable
  document**: `tba3_export_session_<app>` in `sessionStorage` marks that this tab has
  already run this dashboard; on the first load without it the cart and its images are
  discarded, on every later load of the same tab (F5, the dataset-switch reload, hub →
  app → back) they are restored. A second tab of the same dashboard is a new session and
  clears the shared cart (the first tab sees it through the `storage` listener), and a
  saved report PDF clears it too. `ExportSelectionUI` adds the batch checkbox and, on
  tick, **captures the module right there** and stores the PNG in `ExportImageStore`
  (IndexedDB `tba3-export-images`, keyed per app, in-memory fallback with one warning);
  the item is selected only once the image is stored, and the manager owns the pairing
  so `deselect()` / `clearSelection()` drop the images too. The report view deselects
  orphans whose image was lost and says so. `BatchExportToolbar` only opens the report
  and clears the cart.
- **Report view** (`src/common/views/report/`): `ReportViewModule` is declared once in
  `reportViewConfig.js` (`REPORT_VIEW_KEY`, `createReportViewConfig(appPrefix)`,
  `REPORT_HEADER_CONFIG`) and spread into each app's `viewConfig`, pinned to the sidebar
  bottom. It **shows the stored images on the A4 pages they will be printed on**:
  `planReportPages()` (`reportLayout.js`) wraps the cards into row bands on a 12-column
  grid and packs the bands onto portrait pages (`pdfComposer.planBandPages()`); the view
  converts millimetres to preview pixels. Width presets (1/1, 2/3, 1/2, 1/3), reordering
  by buttons or pointer drag, and a zoom control (fit-page default, fit-width, 100 %,
  50 %); sheets pack into as many columns as the window has room for. Layout is
  persisted per app in `tba3_report_layout_v1`; zoom is session-only. Export feeds the
  same bands to `pdfComposer.addBands()`, composing one canvas per band only when its
  page is written. **A card is never cut**: a band that does not fit moves to the next
  page, and a band taller than a page is scaled onto a page of its own. Cards are
  images, not live modules — a snapshot of theme/header state at tick time.

## 7. Services

Shared services live in `src/common/services/` (`DataStore`, `datasetAcquisition`,
`apiClient`), `packages/modules/src/common/services/` (the competence-level and colour
layer, `themeService`, `ksThemeService`, `TooltipService`, `anchoredPopup`) and
`packages/module-base/src/services/` (`ResizeService`), and are injected via options-based DI.

| Service | Role |
|---------|------|
| **`DataStore`** (instance per app) | Raw-document storage + derived-dataset cache: `setRawData`/`getRawData`, `defineDatasets`/`getDataset` (the per-app catalogs, computed once per store), `getOrCompute`. Populated by `datasetAcquisition` during init and handed to views. |
| **`datasetAcquisition`** (module fns) | The one path from a dataset descriptor to a populated store (§8). |
| **`apiClient`** (module fns) | `fetchJson` for repo files, `fetchApiJson` against the API under `api/` (same-origin default, `?api=` override, loud "server not reachable"). |
| **`competenceScalePayload`** + **`competenceLevelPalette`** + **`competenceLevelColors`** + **`colorRamp`** | The data-driven level registry in three layers: the payload reader folds a document's rows into scales and level entries (pure), the registry holds the registered scales and answers ordinal, glossary key and KMK standard rank per level, and the colour layer generates a ramp per theme for the band count and resolves each level's colour on the active scheme. |
| **`themeService`** / **`ksThemeService`** | Resolve CSS custom properties to JS colours through a TTL-cached, **namespaced** palette (`chrome` / `chart` / `sl` / `rating` / `button` / `gender` / `result` / `ks`) — add a CSS variable *and* its key together; `getCompetencyColor(level, scaleId)` bridges to the palette. `ksThemeService` switches and persists the KS theme, `colorSchemeService` the light/dark surface (§4). |
| **`TooltipService`** (singleton) + **`anchoredPopup`** | Unified tooltip lifecycle, delegated text/HTML tooltips and glossary popups (`docs/standards-reference.md` §4.9), built on the stateless element-anchored popup primitive. |
| **`ResizeService`** (singleton) | Shared `ResizeObserver` management with scope-based cleanup. |
| **`ExportService`** (singleton, `src/common/export/`) | Export control UI + batch registration (§6). |

## 8. Data flow

**Dataset descriptors.** Each app's dataset list (`EN_DATASET_OPTIONS`,
`MA_DATASET_OPTIONS`, `SL_DATASET_OPTIONS` in `src/{en,ma,sl}/*Constants.js`) lists the
hand-made demo fixtures, each a `folder` under `public/data/{en,ma,sl}/`. A descriptor
carries exactly one source, `folder` or `scope`; a `scope` such as `groups/<id>` /
`schools/<id>` is fetched from the API and only ever comes from the URL.
`classSearchParams.js` reads the selection off the URL: an ad-hoc `?scope=` wins over
`?class=`, which wins over the default. The request templates behind a scope live in
`datasetEndpoints.js`, a leaf module the fixture API plugin (`config/fixtureApiPlugin.js`)
reads too: in dev and preview it answers `?scope=groups/<fixture folder>` (with the
app's `domain=`) and `?scope=schools/sl` off `public/data/`, so the API branch runs
without a server; any other scope falls through to the `/api/` proxy.

**Acquisition.** Each app declares an acquisition spec once — which documents it needs,
where each lands in the store, which document carries the competence-level scales, and
whether `items.json` is split into value-group buckets. `datasetAcquisition.acquireDataset`
resolves folder or scope into the same documents under the same names
(`competence-levels.json`, `items.json`, `items_aggregation.json`,
`students_competence-levels.json`, `students_aggregation.json`, `aggregation.json`; SL
adds `history.json`), so nothing downstream knows which answered. **Do not add a JSON export folder for a dataset the server can serve — add its
scope.** Repo-owned prose (the glossary, `public/data/sl/info_boxes.json`) is never fetched
from the API. There is deliberately no error handling in acquisition: a rejection
reaches `bootstrapDashboardApp`'s inline error untouched.

**Derived data.** Views read raw documents and transform them into child-specific
shapes before rendering; shape transformations belong in services/adapters, not
duplicated per view. EN and MA declare their derived datasets in one catalog each
(`enDatasets.js`, `maDatasets.js` — key, inputs, builder — registered per `DataStore`
via `defineDatasets`), with per-app adapters under `src/{en,ma}/utils/`. EN's
data-derived configuration (domains, levels, style categories, comparison groups) is a
per-instance `buildEnConfig()` result, never a module-level mutable registry
(`*Constants.js` files are checked for that anti-pattern). SL's `slDataService` acquires
the documents, indexes the flat competence-level rows once, and declares the derived
datasets built by `slResultsDerivation.js` (ladders, per-class domain results, point
scores) and `slSurveyDerivation.js` (Selbstwirksamkeit / Unterrichtsqualität
aggregates); every key is named in `slDataKeys.js`. The SL longitudinal view's earlier
years arrive in `history.json` already generated and flagged
(`properties[simulated]`), read by `historyAdapter.js`; the demo copy is regenerated by
`tools/gen-sl-history-fixture.mjs` and drift-checked in `npm run check`. No dashboard
code synthesizes runtime data.

**Competence scales and colours.** A dataset carries two
scales: the reporting scale (students, aggregates), which varies by state (A1–C1,
A1.1/A1.2/…, "k.h.N., KS 1 … KS 5", Ia/Ib/II–V, MiStd/RegStd/OptStd), and the item
scale (Aufgabenniveau). `competenceLevelPalette` registers both at load and
`competenceLevelColors` generates a ramp for the band count; renderers stamp the resolved colour per element as
`--ks-band-color` — there is deliberately no fixed `--ks-level-N` variable set. Levels
sharing a band are separated by lightness, never by a stripe or pattern. The state's own
colours (the "Landesvorgabe" theme) come from `properties['levelColor:<level id>']` or a
hex literal in a level's `description`. Raw-score cut scores (Äquivalenztabelle) are
data-driven the same way: `properties['equivalenceTable:<bookletId>']`, parsed by
`domain/competenceScale.js` — nothing in `src/` hardcodes a cut score. `domain/` holds
the rest of the VERA vocabulary and rules: level rendering and the item-scale bridge
(`levels.js`), KMK standard ranks, booklet item order, per-item comparison means and
result counts, the Pilotierung benchmark, trait covariates, and the API value maps.
Threshold/benchmark assumptions that await an authoritative API carry a stable
`ASSUMPTION-<id>` in the comment beside the code that makes them (enforced: a `TODO` must
cite one).

**Glossary: one tree, assembled from co-located fragments.** Every module's German help
text (`title`, `subtitle` — the only source of a view header's subtitle — `body`,
`tutorial`, `interface`, `element_texts`) lives in a `<owner>.glossary.json`
beside the module that owns it. Each app's barrel (`src/{en,ma,sl}/{en,ma,sl}Glossary.js`)
assembles two bases — the package's `glossary.json` and tba3's `src/common/app/shellGlossary.json`
— and mounts the fragments over them (`glossaryAssembly.js`), producing the single tree every
consumer walks: `ContentModule.loadInfoFromGlossary`, `HeaderOrchestrator`, `tourStepBuilder`,
`glossaryAnnotator`. Where a package card's fragment mounts is the package's call: the barrel
spreads `packages/modules/src/<app>/<app>GlossaryFragments.js` in whole and mounts only tba3's own
view fragments itself. The package's `glossary.json` keeps the per-subject term vocabulary
(`{app}.shared.element_texts`, compiled by `glossaryAnnotator.init` into one alias regex for
free-text annotation) and the `general.*` entries package cards read; the shell glossary keeps
what only tba3's shell reads (tour cards, report, notes, sidebar, export and splash copy).
Assembly throws if two owners claim one entry. Competence-level explanations are not in the
glossary at all: they come from the payload and are registered as annotator entries at
load (`competenceLevelGlossary.js`). Control text is glossary-driven on both halves: an
`interface` sub-entry's `label` is the button label and its `tooltip` the tooltip.
`node tools/dump-glossary.mjs` prints the assembled tree as canonical JSON — diff two
dumps to prove a move changed nothing.

## 9. Quality gates and tooling

- **`node tools/check-structure.mjs`** (dependency-free) enforces the hard rules: no
  feature CSS on the shared shell slots; every sheet under `src/` co-located with and
  imported by its unit, and the whole cascade layered (`css-ownership`); a `CONFIG DESCRIPTOR` marker in every chart
  config; no legacy SL overview names; `TODO`/`FIXME`/`HACK` must cite an `ASSUMPTION-*`;
  no comment under `src/` may reference a document (`comment-doc-references` — pointers
  rot and nothing resolves them at build time; runtime strings are exempt); no banner
  naming a bare language construct (`banner-label-noise`, a denylist — markers of the
  mandated file scan order stay); an 8-line ceiling on the file header of any unit that
  has a sibling `.md` (`unit-header-ceiling`); no mutable module-level state in
  `*Constants.js`; no UI copy set
  from code and every glossary path resolving in the assembled tree; one icon source
  (Material Symbols through `utils/icons.js` — no icon font, emoji or hand-written
  `<svg>` outside that registry, `packages/module-base/src/utils/icons.js`; the Ø averages mark on the comparison-mode button is
  the one deliberate non-icon, a typographic sign the set has no glyph for, and it is a
  convention rather than something the checker enforces); a German `<unitFile>.md` with
  the fixed headings beside every module unit; each workspace package self-contained —
  every relative import resolves inside it, every bare one is declared in its own
  `package.json`, and no file imports its own package by name (`package-boundary`); the
  import closures of `baseModule.js`, `contentModule.js` and `chartHostModule.js` free of
  `src/common/export/`, `viewRouter.js`, `glossaryAnnotator.js`, `d3` and
  `tabulator-tables` (`module-base-boundary`); every custom property a `@tba3/modules`
  sheet reads defaulted, and every default in `packages/modules/styles/tokens.css` still
  naming a property tba3's foundation sheets declare (`modules-token-defaults`); `src/` and
  the HTML entry points importing `@tba3/*` only through the specifiers the packages'
  `exports` maps name outright (`app-public-imports`).
- **`npm run check`** = structure check + knip (`check:unused`, `knip --exports
  --dependencies`: unused exports, unused or undeclared dependencies) + SL history fixture
  drift check + module-index drift check (`node tools/docs-sidebar.mjs --check`,
  `docs/module-index.md` matches the unit scan) + Klassenhierarchie drift check
  (`node tools/docs-hierarchy.mjs --check`) + oxlint (`src/`, `packages/`,
  config, tools, tests; JSDoc enforced by `eslint-plugin-jsdoc` run as an oxlint JS
  plugin) + ESLint over every `.css` under `src/`, `packages/*/src/` and `packages/*/styles/` +
  `oxfmt --check` and `prettier --check` (JS, and CSS/JSON; text files are LF via
  `.gitattributes`) + Vitest (`tests/unit/**`, a Node project for pure logic
  and a browser project in real Chromium for files marked `// @vitest-browser`) +
  `tsc` over `config/tsconfig.typecheck.json` + the Vite build + the wiki build. The
  pre-push hook in `tools/hooks/` runs it.
- **Wiki** (`docs/.vitepress/config.mjs`, `tools/docs-sidebar.mjs`): VitePress renders
  the Markdown where it lives — the unit docs beside their sources and `docs/` — with a
  sidebar walked from the docs' own link tables (app → *Views* → *Kinder*), the shared
  bases under `src/common`, and local search. VitePress fails `npm run docs:build`
  on a broken relative link by default, so no `ignoreDeadLinks` opt-out is set. The unit scan the sidebar and the structure
  check share lives in `tools/lib/moduleUnits.mjs`. Inline code is rendered `v-pre`
  because the docs quote `{{…}}` placeholders that Vue would otherwise evaluate. Every
  top-level `##` section is folded into a `<details open>` with the h2 as its summary
  (`docs/.vitepress/foldSections.mjs`), and the theme (`docs/.vitepress/theme/`) opens the
  enclosing section before the router scrolls to a hash inside a collapsed one.
- **Unit tests** mirror `src/`; `tests/unit/support/` holds the harnesses — a chart
  harness with a spy renderer, a table harness over Tabulator fakes, a DOM shell, and
  the glossary and competence-scale fixtures (tests that assert what a user reads bring
  the annotator up first). Protocol tests pin the decisions in §2 ("deliberately not
  extracted").
- **End-to-end** (`npm run test:e2e`, not wired into `npm run check` but run by
  `.github/workflows/ci.yml`): a second Vitest config (`config/vitest.e2e.config.mjs`)
  whose Node specs under `tests/e2e/` drive Google Chrome through the `playwright`
  library; its global setup builds and serves `vite preview` on 8765 and needs nothing
  else — every dataset it opens is a committed fixture, and `dataset-scope.spec.js`
  covers the `?scope=` / API path through the fixture API plugin. The specs are a thin
  per-dashboard smoke layer, not visual coverage —
  smoke-test all three dashboards in a browser after visual or lifecycle changes. A spec
  that clicks a header control right after a sidebar nav button goes through `clickNav`
  (`tests/e2e/support/app.js`): Playwright leaves the pointer on the rail, which stays
  hover-expanded over the narrow-tier header row at the suite's 1280px viewport.
- **Delivery**: `Dockerfile` builds `dist/` into an nginx image whose `/api/` location
  resolves its upstream per request (`docker/nginx.conf`), so the public `compose.yaml`
  boots nginx alone and `/api/` answers 502 until a container named `api` joins it.
  `dist/NOTICE` carries the third-party notices the minified bundles strip.
