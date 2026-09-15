# EnAppModule

## Zweck
Das Englisch-8-Dashboard: Ergebnisse einer Klasse in den Domänen Hören und Lesen auf den GER-Stufen, von der Klassenübersicht über Klassen- und Aufgabenansicht bis zur einzelnen Schüler:in, dazu der gemeinsame Bericht. Ergänzt das Basis-Chrome (zu dem auch der Notizen-Button gehört) um den Klassen-Selektor und den Domänen-Schalter im Header und die datengetriebene EN-Config (Domänen, GER-Stufen, Vergleichsgruppen), die erst nach dem Laden des Datensatzes steht.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../common/modules/baseViewModule.md)
    - [BaseAppModule](../common/app/appModule.md)
      - **EnAppModule**

## Views
| Key | Klasse | Icon | Doc |
|---|---|---|---|
| `welcome` (Startview) | `EnWelcomeViewModule` | `home` | [enWelcomeViewModule.md](views/enWelcomeViewModule.md) |
| `overview` | `EnOverviewViewModule` | `bar_chart` | [enOverviewViewModule.md](views/enOverviewViewModule.md) |
| `class` | `EnClassViewModule` | `groups` | [enClassViewModule.md](views/enClassViewModule.md) |
| `item` | `EnItemViewModule` | `list_alt` | [enItemViewModule.md](views/enItemViewModule.md) |
| `student` | `EnStudentViewModule` | `person` | [enStudentViewModule.md](views/enStudentViewModule.md) |
| `report` | `ReportViewModule` (gemeinsam) | aus `createReportViewConfig` | [reportViewModule.md](../common/views/report/reportViewModule.md) |

Namen (Sidebar und Nav-Karten, aus `en.nav-cards.element_texts.nav-<key>`): `Willkommen`, `Übersicht`, `Klasse`, `Aufgaben`, `Schüler:in`, `Bericht`; die Kopfzeilen tragen die längeren Titel ihrer View-Fragmente. Skeletons `stack`, `triple`, `rows`, `rows`, `split`, `grid`. Die Sidebar trägt den Titel `VERA`. Jede View erhält per `getViewModuleOptions` zusätzlich `glossaryData` und `currentClassId`. Die gemeinsame `_openStudent(id)` schreibt `currentStudentId` und navigiert zu `student`.

## Daten
| Anfrage | Parameter | Dokument | Schlüssel |
|---|---|---|---|
| `getGroupCompetenceLevels` | `domain=en`, `comparison=school-average,state-average` | `competence-levels.json` | `en.competenceLevelsClass`; Skalendokument |
| `getGroupItems` | `domain=en`, `comparison=school-average,state-average` | `items.json` | `en.items` (nur die Klassenzeilen); Dokument der Aufgabenniveau-Skala |
| `getGroupAggregations` | `domain=en`, `comparison=school-average,state-average` | `aggregation.json` | `en.aggregation` |
| `getGroupCompetenceLevels` | `type=students`, `domain=en` | `students_competence-levels.json` | `en.competenceLevels` |
| `getGroupAggregations` | `type=students`, `domain=en` | `students_aggregation.json` | `en.styleAggregation` |
| `getGroupAggregations` | `type=items`, `aggregation=result`, `domain=en` | `items_aggregation.json` | `en.itemAggregation` |

Alle sechs Anfragen gehen parallel an `groups/<id>` (`GROUP_ENDPOINTS`, `EN_ACQUISITION`); scheitert eine, scheitert der Datensatz. Achtung Namensinversion: `students_competence-levels.json` landet unter `COMPETENCE_LEVELS`, `competence-levels.json` unter `COMPETENCE_LEVELS_CLASS`. Die Vergleichszeilen von `items.json` werden nicht gespeichert, sondern zu `itemComparisonGroups` im App-Payload (`setData`, gebaut von `buildItemComparisonGroups`): jede Gruppe mit `id`, `type`, `name`, Ordinal und Mittelwerten je Item, auch eine, die `aggregation.json` nicht führt. Deren IDs gehen mit in `seedComparisonState`.

Payload: der Datensatz kommt aus `resolveSelectedDataset(EN_DATASET_OPTIONS, '8a_mid')` (URL); `8a_mid`/`8b_good`/`8c_bad` sind Fixtures unter `public/data/en/` mit denselben Dateinamen, eine echte Klasse öffnet `?scope=groups/<id>` gegen eine laufende API. Abgeleitet statt abgerufen: `STYLE_AVERAGES`, `CONFIG`, `STUDENT_RECORDS`, `ITEM_RECORDS` (`defineEnDatasets`, lazy; `initializeComponents()` berechnet `STUDENT_RECORDS` und `ITEM_RECORDS` eifrig). `setExportDataset` läuft vor jeder Modulregistrierung, weil Export-Ids datensatzbezogen sind.

## Zustand
| Key | Schreibt | Liest |
|---|---|---|
| `currentMode` (`'all'`) | Domänen-Schalter `domain-switch` im Header von `class`, `item`, `student` (`Alle` plus eine Domäne je Eintrag) | `EnClassViewModule`, `EnItemViewModule`, `EnStudentViewModule` |
| `comparisonState` (`{}`, in `initializeComponents` per `seedComparisonState` mit allen gelieferten Vergleichsgruppen auf `true` gesetzt) | Ø-Dropdowns in den Chart-Köpfen (`comparisonModeControl` → `setComparisonMode`) | `EnOverviewViewModule`, `EnClassViewModule`, `EnItemViewModule`, `EnStudentViewModule` über `observeActiveComparisons` |
| `currentStudentId` (`null`) | `_openStudent` aus Übersicht (Scatterplot), Klassentabelle und Aufgaben-Detail; in der Schüler:innenansicht der Selektor und das Detailpanel | `EnStudentViewModule` |

Der Klassen-Selektor (`class-selector`, nur auf `welcome`) schreibt keinen State, sondern navigiert per URL zu einem anderen Datensatz (voller Reload).

## Hooks
| Hook | Zweck |
|---|---|
| Konstruktor | `glossaryData: glossary`, `configure(CONFIG)`, `setExportDataset(currentDataset)`, `defineEnDatasets(dataStore)` |
| `getInitialState()` | `buildInitialState()` (siehe Zustand) |
| `getContainerClassPrefix()` | `'en'` |
| `getViewModuleOptions(viewType)` | Basis plus `glossaryData` und `currentClassId` |
| `initializeComponents()` | Siehe Daten; setzt `setViewHeaderConfigs(buildEnViewHeaderConfigs(ctx, getEnConfig(dataStore)))` vor `super` |
