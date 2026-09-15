# SlAppModule

## Zweck
Das Schulleitungs-Dashboard: Ergebnisse einer Schule über Fächer, Domänen und Klassen hinweg, dazu Vergleich, Längsschnitt und Materialseiten. Ergänzt das Basis-Chrome um die Nav-Karten unter jeder View und einen Hinweis, wenn der Server für die Schule keine Ergebnisse liefert.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../common/modules/baseViewModule.md)
    - [BaseAppModule](../common/app/appModule.md)
      - **SlAppModule**

## Views
| Key | Klasse | Icon | Doc |
|---|---|---|---|
| `summary` (Startview) | `SlSummaryViewModule` | `home` | [slSummaryViewModule.md](views/slSummaryViewModule.md) |
| `welcome` | `SlWelcomeViewModule` | `list_alt` | [slWelcomeViewModule.md](views/slWelcomeViewModule.md) |
| `overview` | `SlOverviewViewModule` | `bar_chart` | [slOverviewViewModule.md](views/slOverviewViewModule.md) |
| `comparison` | `SlComparisonViewModule` | `balance` | [slComparisonViewModule.md](views/slComparisonViewModule.md) |
| `longitudinal` | `SlLongitudinalViewModule` | `trending_up` | [slLongitudinalViewModule.md](views/slLongitudinalViewModule.md) |
| `material` | `SlMaterialViewModule` | `description` | [slMaterialViewModule.md](views/slMaterialViewModule.md) |
| `report` | `ReportViewModule` (gemeinsam) | aus `createReportViewConfig` | [reportViewModule.md](../common/views/report/reportViewModule.md) |

Die Nav-Karten folgen derselben Reihenfolge ohne die ans Sidebar-Ende gepinnten Views; Label und Beschreibung einer Karte kommen aus dem letzten Segment des `navigationGlossaryPath`.

## Daten
| Anfrage | Parameter | Dokument | Schlüssel |
|---|---|---|---|
| `getSchoolCompetenceLevels` | `type=school,group`, `comparison=state-average` | `competence-levels.json` | `sl.competenceLevels`; Skalendokument |
| `getSchoolItems` | `type=school,group`, `comparison=state-average` | `items.json` | `sl.items` |
| `getSchoolCompetenceLevels` | `type=students` | `students_competence-levels.json` | `sl.studentsCompetenceLevels` |
| `getSchoolAggregations` | `type=students`, `aggregation=result` | `students_aggregation.json` | `sl.studentsAggregation` |
| `getSchoolCompetenceLevels` | `type=school,students`, `comparison=year` | `history.json` | `sl.longitudinalHistory` |
| – | – | `info_boxes.json` (Repo-Prosa unter `public/data/sl/`, nicht Teil der API) | `sl.infoBoxes` |

Alle fünf Anfragen gehen parallel an `schools/<id>` (`SCHOOL_ENDPOINTS`, `SL_ACQUISITION`), daneben `info_boxes.json` aus dem Repo, für jeden Datensatz dieselbe Datei; scheitert eine, scheitert der Datensatz. Kein `domain`-Filter, kein Items-Split und keine Aufgabenniveau-Skala: jedes Dokument wird ganz gespeichert, Schul-, Klassen- und Landesschnittzeilen trennt erst der `CompetenceLevelIndex` beim Lesen.

Payload: der Datensatz kommt aus `resolveSelectedDataset(SL_DATASET_OPTIONS, 'sl')` (URL); `sl` ist die Simulation unter `public/data/sl/sl/` mit denselben Dateinamen, eine echte Schule öffnet `?scope=schools/<id>` gegen eine laufende API. Abgeleitet statt abgerufen: `SELF_EFFICACY_BY_CLASS`, `SELF_EFFICACY_SCHOOL`, `TEACHING_QUALITY`, `LEVEL_DEFINITIONS`, `COMPETENCE_LEVEL_INDEX`, `DOMAIN_RESULTS`, `CLASS_RESULTS`, `COMPARISON_SELF_EFFICACY`, `COMPARISON_TEACHING_QUALITY`, `COMPARISON_POINTS` (`defineSlDatasets`, schon im Konstruktor deklariert, lazy), dazu `SURVEY_SCALES` über `getSurveyScales`. Einen App-Payload gibt es nicht: die Views lesen den `DataStore`, die Inhaltskarten den Port `slDataFromStore(dataStore)`. `initializeComponents()`: `fetchSlData` → `seedComparisonState` mit den Ids aller gelieferten Landesschnittzeilen (`deriveSummaryAverages`, `state:<id>`) → `super` (Header) → Nav-Karten → ohne eine einzige `competence-levels`-Zeile (`hasSlResults`) der Hinweis unter dem Header. `setExportDataset` läuft im Konstruktor vor jeder Modulregistrierung, weil Export-Ids datensatzbezogen sind.

## Zustand
| Key | Schreibt | Liest |
|---|---|---|
| `viewMode` (`by_subjects`), `displayMode` (`charts`), `vizMode` (`stacked_bar`) | Header-Controls der Übersicht | `SlOverviewViewModule` |
| `summaryMetric` | Header-Control des Überblicks | `SlSummaryViewModule` |
| `comparisonState` | Seed beim Laden, Ø-Dropdowns der Überblick-Karten | `SlSummaryViewModule` |

Nicht im Anfangszustand, sondern erst beim ersten Schreiben angelegt – wer sie vorher liest, bekommt `undefined`, die Header-Controls setzen ihre Defaults selbst: `selectedDomainIndex`, `longitudinalViewMode`, `longitudinalChartType` (Header-Controls des Längsschnitts, dazu `SlLongitudinalViewModule` bei jedem Render mit seinen aktuellen Werten → `SlLongitudinalViewModule`), `materialSubject`, `materialType` (Header-Controls und Info-Box-Links → `SlMaterialViewModule`), `domainOptions` (`SlLongitudinalViewModule` beim Render → `#getLongitudinalDomainOptions` für den Domäne-Select).

## Hooks
| Hook | Zweck |
|---|---|
| Konstruktor | `glossaryData: glossary`, `configure(CONFIG)`, `setExportDataset`, `setViewHeaderConfigs(buildSlViewHeaderConfigs(...))`, `defineSlDatasets(dataStore)` |
| `getInitialState()` | Kopie von `INITIAL_STATE` (siehe Zustand) |
| `getContainerClassPrefix()` | `'sl'` |
| `createFooterElements()` | Container `#sl-shared-nav-cards`, anfangs versteckt |
| `initializeComponents()` | Siehe Daten |
| `beforeShowView(viewType, options)` | Basis (Header), dann `NavCardModule.setCurrentView(viewType)` und Container einblenden |
| `getNavCardConfig()` | Nav-Karten-Katalog mit `onNavigate → showView` |
