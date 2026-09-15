# MaAppModule

## Zweck
Das Mathe-3-Dashboard: eine Klasse mit Kompetenzstufen, Leitideen und Aufgabenringen, dazu Aufgaben-, Schüler:innen-, Berichts- und Hilfe-View. Ergänzt das Basis-Chrome um den Layout-Modus, der aus einer Navigation (`viewMode` der Nav-Karten) übernommen wird, und den Rücksprung-Link der Hilfe.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../common/modules/baseViewModule.md)
    - [BaseAppModule](../common/app/appModule.md)
      - **MaAppModule**

## Views
| Key | Klasse | Icon | Doc |
|---|---|---|---|
| `welcome` (Startview) | `MaWelcomeViewModule` | `home` | [maWelcomeViewModule.md](views/maWelcomeViewModule.md) |
| `overview` | `MaOverviewViewModule` | `bar_chart` | [maOverviewViewModule.md](views/maOverviewViewModule.md) |
| `class` | `MaClassViewModule` | `groups` | [maClassViewModule.md](views/maClassViewModule.md) |
| `item` | `MaItemViewModule` | `list_alt` | [maItemViewModule.md](views/maItemViewModule.md) |
| `student` | `MaStudentViewModule` | `person` | [maStudentViewModule.md](views/maStudentViewModule.md) |
| `report` | `ReportViewModule` (gemeinsam) | aus `createReportViewConfig` | [reportViewModule.md](../common/views/report/reportViewModule.md) |
| `help` | `MaHelpViewModule` | `menu_book` | [maHelpViewModule.md](views/maHelpViewModule.md) |

`item` und `student` erben von der Zwischenbasis [MaLayoutViewBase](views/maLayoutViewBase.md); `report` und `help` sind ans Sidebar-Ende gepinnt. Sidebar-Titel `VERA`, Header-Container `ma-shared-header`. Die Namen der Views (Sidebar und Nav-Karten) stehen unter `ma.nav-cards.element_texts.nav-<key>`: `Willkommen`, `Übersicht`, `Klasse`, `Aufgaben`, `Schüler:in`, `Bericht`, `Hilfe`.

## Daten
| Anfrage | Parameter | Dokument | Schlüssel |
|---|---|---|---|
| `getGroupCompetenceLevels` | `domain=ma`, `comparison=school-average,state-average` | `competence-levels.json` | `ma.competenceLevelsClass`; Skalendokument |
| `getGroupItems` | `domain=ma`, `comparison=school-average,state-average` | `items.json` | `ma.items` (nur die Klassenzeilen); Dokument der Aufgabenniveau-Skala |
| `getGroupCompetenceLevels` | `type=students`, `domain=ma` | `students_competence-levels.json` | `ma.studentsCompetenceLevels` |
| `getGroupAggregations` | `type=students`, `domain=ma` | `students_aggregation.json` | `ma.studentsAggregation` |
| `getGroupAggregations` | `type=items`, `aggregation=result`, `domain=ma` | `items_aggregation.json` | `ma.itemAggregation` |

Alle fünf Anfragen gehen parallel an `groups/<id>` (`GROUP_ENDPOINTS`, `MA_ACQUISITION`); scheitert eine, scheitert der Datensatz. `aggregation.json` ruft MA nie ab (MA hat keine Stil-Dimension), und die Fixtures bringen die Datei auch nicht mit. Die Vergleichszeilen von `items.json` werden nicht gespeichert, sondern nach `type` zu `schoolAverages`, `stateAverages` und `otherAverages` (`buildItemComparisonAverages`); eine Vergleichszeile ohne `id`, `type` oder `name` lässt `initializeComponents()` werfen, ebenso eine Vergleichszeile von `competence-levels.json` ohne `id` (`competenceLevelComparisonIds`, `src/ma/utils/maComparisonGroups.js`).

Payload: der Datensatz kommt aus `resolveSelectedDataset(MA_DATASET_OPTIONS, '3a_mid')` (URL); `3a_mid`/`3b_good`/`3c_bad` sind VERA-3-Fixtures unter `public/data/ma/` mit denselben Dateinamen, eine echte VERA-8-Testheft-Gruppe öffnet `?scope=groups/<id>` gegen eine laufende API. Abgeleitet statt abgerufen: `ITEM_RECORDS`, `STUDENT_RECORDS`, `RAW_STUDENT_RECORDS`, `DOMAINS` (`defineMaDatasets`, lazy; `initializeComponents()` berechnet die ersten drei eifrig). Danach seedet `initializeComponents()` `comparisonState` mit den Vergleichs-Ids aus `competence-levels.json` und denen der Item-Mittelwerte, liest `ksLevels` (`getScaleLevels`) und `classKsThresholds` (`resolveClassKsThresholds`, Klassenzeile `type=group`) und setzt `setData({ studentArray, itemArray, rawStudentArray, nrItems, ksLevels, classKsThresholds, schoolAverages, stateAverages, otherAverages })` vor `super` (Header). `setExportDataset` läuft im Konstruktor vor jeder Modulregistrierung, weil Export-Ids datensatzbezogen sind.

## Zustand
| Key | Schreibt | Liest |
|---|---|---|
| `currentStudentId` | `MaStudentTopBarModule` über die Schüler:innen-View, `_openStudent` (Klassentabelle) | `MaStudentViewModule` |
| `layoutMode` (`both`) | Layout-Umschalter im Header, `beforeShowView` aus `options.viewMode` | `MaItemViewModule`, `MaStudentViewModule` (über `MaLayoutViewBase`) |
| `chartOnlyDomainId` (`null`) | Ring-Klick im Chart-only-Raster der Aufgaben- oder Schüler:innen-View | beide Layout-Views (über `MaLayoutViewBase`) |
| `comparisonState` | Seed beim Laden, Ø-Dropdowns in den Chart-Köpfen (`comparisonModeControl`) | `MaOverviewViewModule`, `MaItemViewModule` über `observeActiveComparisons` |

## Hooks
| Hook | Zweck |
|---|---|
| Konstruktor | `glossaryData: glossaryMa`, `configure(CONFIG)`, `setExportDataset`, `setViewHeaderConfigs(buildMaViewHeaderConfigs(...))`, `defineMaDatasets(dataStore)` |
| `initializeComponents()` | Siehe Daten |
| `getViewModuleOptions(viewType)` | Basis plus `glossaryData` und `currentClassId` (Id des Datensatzes; von keiner MA-View gelesen) |
| `getInitialState()` | Kopie von `INITIAL_STATE` (siehe Zustand) |
| `getContainerClassPrefix()` | `'ma'` |
| `beforeShowView(viewType, options)` | `options.viewMode` → `layoutMode` schreiben, dann Basis; hier statt in `showView`, damit eine wartende Navigation ihren eigenen Modus anwendet |
| `afterShowView(viewType, context)` | Basis, dann bei `help` `setPreviousView(context.previousView)` |
