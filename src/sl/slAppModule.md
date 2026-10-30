# SlAppModule

## Zweck
Das Schulleitungs-Dashboard: Ergebnisse einer Schule über Fächer, Domänen und Lerngruppen hinweg, dazu Gruppenvergleich, Entwicklung und Materialseiten. Ergänzt das Basis-Chrome um die Nav-Karten unter jeder View und einen Hinweis, wenn der Server für die Schule keine Ergebnisse liefert.

## Design/Idee

Die Schulleitungs-Rückmeldung kombiniert verschiedene fachübergreifende Ansichten und Tools, in denen die Ergebnisse der Testung nacheinander in unterschiedlichen Aggregationen und Schwerpunkten aufbereitet werden und exploriert werden können:

- Eine Übersichtsseite, die fachweise die Ergebnisse aller Lerngruppen eines Jahrgangs auf einzelne Metriken herunterbricht (bspw. Anteil SuS auf oder oberhalb KS III) und mit Schul- und Landeswert gegenüberstellt.
- Eine alternative Übersichtsseite, die fachweise die Kompetenzstufenverteilung aller Lerngruppen eines Jahrgangs abbildet und dabei Schul- bzw. Landeswerten gegenüberstellt. Ein Infokasten liefert vorformulierte Ergebnisinterpretationen.
- Eine mehrschichtige Übersicht aller Fächer und Lerngruppen in tabellarischer sowie graphischer Form zur intensiven Sichtung fach- und/oder lerngruppenspezifischer Ergebnisse.
- Ein Tool zum direkten, benutzerdefinierten zweiseitigen Vergleich.
- Eine gegenüberstellende Visualisierung der Ergebnisse vergangener Jahrgänge.
- Ein Platzhalter zur direkten Einbindung von Material zur weiteren Schul- und Unterrichtsentwicklung.

Alle Elemente jeglicher Ansichten sind dabei über zahlreiche niedrigschwellige Interface-Elemente anpassbar; die entwickelnden Schulleitungen priorisierten eine umfassende Abbildung der wichtigsten Informationen bei bevorzugt darstellenden Visualisierungen ohne viel Text. Gleichzeitig werden ausgewählte Ergebnisse nach Möglichkeit automatisiert interpretiert und verbalisiert. Die Ergebnisse sind dabei mit verschiedenen Fragestellungen bzw. Foki zusammengefasst, ohne jedoch den Schulleitungen ein verbindliches Vorgehen zu suggerieren. Wo immer möglich liefern Tooltips das zum Verständnis notwendige Wissen direkt an Ort und Stelle. Die Ansichten liefern die Instrumente zur Exploration, forcieren jedoch keine bestimmte Lesart.

## Views
| Key | Klasse | Icon | Doc |
|---|---|---|---|
| `summary` (Startview) | `SlSummaryViewModule` | `home` | [slSummaryViewModule.md](views/slSummaryViewModule.md) |
| `matrix` | `SlMatrixViewModule` | `category` | [slMatrixViewModule.md](views/slMatrixViewModule.md) |
| `details` | `SlDetailsViewModule` | `bar_chart` | [slDetailsViewModule.md](views/slDetailsViewModule.md) |
| `comparison` | `SlComparisonViewModule` | `balance` | [slComparisonViewModule.md](views/slComparisonViewModule.md) |
| `longitudinal` | `SlLongitudinalViewModule` | `trending_up` | [slLongitudinalViewModule.md](views/slLongitudinalViewModule.md) |
| `material` | `SlMaterialViewModule` | `description` | [slMaterialViewModule.md](views/slMaterialViewModule.md) |
| `report` | `ReportViewModule` (gemeinsam) | aus `REPORT_VIEW_CONFIG` | [reportViewModule.md](../common/views/report/reportViewModule.md) |

Die Nav-Karten folgen derselben Reihenfolge ohne die ans Sidebar-Ende gepinnten Views; eine Karte heißt wie ihre View in der Sidebar, die Beschreibung kommt aus demselben Glossareintrag (`navigationGlossaryPath`).

## Daten
| Anfrage | Parameter | Dokument | Schlüssel |
|---|---|---|---|
| `getSchoolCompetenceLevels` | `type=school,group,students`, `comparison=state-average,year` | `competence-levels.json` (Schule, Lerngruppen, Landesschnitte) | Dateiname; Skalendokument |
| | | `students-competence-levels.json` (Schüler:innen) | Dateiname |
| | | `prior-years.json` (die Vorjahre: Zeilen mit einem anderen `testPeriod` als die erste Zeile der Antwort, die das aktuelle Jahr trägt) | Dateiname |
| `getSchoolAggregations` | `type=school,group,students`, `aggregation=result`, `comparison=state-average` | `aggregations.json` (Schule, Lerngruppen, Landesschnitte) | Dateiname |
| | | `students-aggregations.json` (Schüler:innen) | Dateiname |
| `INFO_BOXES_REQUEST` | – | `info-boxes.json` (Repo-Prosa unter `public/data/sl/`, nicht Teil der API) | Dateiname; Vorlagen der Info-Boxen |

Die Basis baut aus `SL_DATASET` den `DocumentStore`; die abgeleiteten Datensätze sind die Schlüssel in `SL_DATASETS` (`@tba3/modules/sl-domain`). Die Anfragen von `SL_DATASET` sind die beiden Anfragen an `schools/<id>` (`SCHOOL_REQUESTS`) plus `INFO_BOXES_REQUEST` (`site`-Pfad; fehlt die Datei, scheitert der Datensatz). Jede SL-View braucht Daten, auch die Startview `summary`. Kein `domain`-Filter und keine Aufgabenniveau-Skala: Schul-, Lerngruppen- und Vergleichszeilen trennt erst der `CompetenceLevelIndex` beim Lesen. Die Lösungsquote liest `aggregations.json`: Schule und Lerngruppen zählen `Richtig` gegen alle drei `result`-Häufigkeiten, ein Landesschnitt trägt nur den `Richtig`-Anteil.

Payload: der Datensatz kommt aus `SL_DATASET.options` mit Standard `'schools/sl'` (URL `?scope=`); `schools/sl` ist der Demo-Datensatz unter `public/data/sl/sl/` mit einer Datei je Anfrage, jede andere Schule öffnet `?scope=schools/<id>` gegen eine laufende API. Die Header-Controls lesen Store und Palette aus dem Kontext, den die Basis ihnen gibt.

## Zustand
| Key | Schreibt | Liest |
|---|---|---|
| `detailsGrouping` (`by_subjects`), `displayMode` (`charts`), `vizMode` (`stacked_bar`) | Header-Controls der Details | `SlDetailsViewModule` |
| `selectedDomainIndex` (`0`), `longitudinalViewMode` (`normal`), `longitudinalChartType` (`lines`) | Header-Controls der Entwicklung | `SlLongitudinalViewModule` |
| `summaryMetric` | Header-Control des Überblicks | `SlSummaryViewModule` |
| `materialType`, `materialSubject` | Header-Controls der Materialien, Materiallinks in Details und Gesamtbild (`statePatch` der Navigation) | `SlMaterialViewModule` |

Ein Control ohne passenden gespeicherten Wert zeigt seinen ersten wählbaren Eintrag; `materialSubject` setzt erst `onDataReady()` (siehe Hooks).

Vergleichszustand der Basis (`comparisonState`): die Ø-Dropdowns der Überblick-Karten schreiben ihn; `SlSummaryViewModule` folgt `comparisonState.activeModes`.

## Hooks
| Hook | Zweck |
|---|---|
| `static defaultOptions` | Die Spec der App: Datensatz, Views, Startview `summary`, Anfangszustand, Header-Controls und Vergleichs-Ids (siehe Daten); Element `tba-sl-app` |
| `initializeComponents()` | Nach dem Header der Basis: die Nav-Karten-Zeile unter den Views |
| `onDataReady()` | Nach der Basis: das erste Fach des Datensatzes in `materialSubject`, wenn das gewählte keines seiner Fächer ist, und der Hinweis ohne Ergebnisse (`hasSlResults`) |
