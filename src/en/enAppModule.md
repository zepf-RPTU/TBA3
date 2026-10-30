# EnAppModule

## Zweck
Das Englisch-8-Dashboard: Ergebnisse einer Lerngruppe in den beiden Domänen der Daten (etwa Hören und Lesen) auf den GER-Stufen, von der Lerngruppenübersicht über Lerngruppen- und Aufgabenansicht bis zur einzelnen Schüler:in, dazu der gemeinsame Bericht. Ergänzt das Basis-Chrome um den Lerngruppen-Selektor und den Domänen-Schalter im Header und die datengetriebene EN-Config (`EN_DATASETS.CONFIG`: Domänen, Stil-Kategorien, Ergebnistypen, Äquivalenztabellen), die erst nach dem Laden des Datensatzes steht.

## Design/Idee

Die Englisch-Rückmeldung kombiniert verschiedene Ansichten, in denen die Ergebnisse der Testung nacheinander in unterschiedlichen Aggregationen und Schwerpunkten aufbereitet werden.

- Ein freundlicher Willkommens-Bildschirm begrüßt und bietet einen Überblick über benannte Inhalte.
- Die Übersicht stellt das gesamte Lerngruppenergebnis graphisch dar und stellt es in Bezug zu Schul- und Landesschnitt.
- Die Lerngruppenübersicht bildet die Testergebnisse auf Lerngruppenebene tabellarisch ab, mit zentralen Kennwerten für alle SuS.
- Die Aufgabenübersicht listet alle Aufgaben des verwendeten Testhefts in tabellarischer Form und liefert ebenfalls pro Aufgabe zentrale Kennwerte.
- Die Schüler:innenansicht bietet die detaillierten Ergebnisse ausgewählter SuS.
- Zuletzt stellt der Bericht ausgewählte Inhalte für den PDF-Export zusammen.

Alle Elemente jeglicher Ansichten sind dabei über zahlreiche niedrigschwellige Interface-Elemente anpassbar; die entwickelnden Lehrkräfte priorisierten eine umfassende Abbildung der wichtigsten Informationen bei bevorzugt darstellenden Visualisierungen ohne viel Text. Die Ergebnisse sind dabei mit verschiedenen Fragestellungen bzw. Foki zusammengefasst, ohne jedoch den Lehrkräften ein verbindliches Vorgehen zu suggerieren. So ermöglicht die Startseite bzw. die Menüführung ein sequenzielles wie auch ein frei gesteuertes Vorgehen – ein Kompromiss aus selbstbestimmter Sichtung bei gleichzeitigem „an die Hand nehmen“. Wo immer möglich liefern Tooltips das zum Verständnis notwendige Wissen direkt an Ort und Stelle. Die Interpretation der Ergebnisse wird jedoch weitestgehend den Lehrkräften selbst überlassen; die Ergebnisse liefern die Instrumente zur Exploration, forcieren jedoch keine bestimmte Lesart.

## Views
| Key | Klasse | Icon | Doc |
|---|---|---|---|
| `welcome` (Startview) | `WelcomeSplashViewModule` (gemeinsam) | `home` | [welcomeSplashViewModule.md](../common/views/welcomeSplashViewModule.md) |
| `overview` | `EnOverviewViewModule` | `bar_chart` | [enOverviewViewModule.md](views/enOverviewViewModule.md) |
| `group` | `EnGroupViewModule` | `groups` | [enGroupViewModule.md](views/enGroupViewModule.md) |
| `item` | `EnItemViewModule` | `list_alt` | [enItemViewModule.md](views/enItemViewModule.md) |
| `student` | `EnStudentViewModule` | `person` | [enStudentViewModule.md](views/enStudentViewModule.md) |
| `report` | `ReportViewModule` (gemeinsam) | aus `REPORT_VIEW_CONFIG` | [reportViewModule.md](../common/views/report/reportViewModule.md) |

Die Namen der Views (Sidebar und Nav-Karten) stehen unter `en.nav-cards.element_texts.nav-<key>`; die Kopfzeilen tragen die längeren Titel ihrer View-Fragmente.

## Daten
| Anfrage | Parameter | Dokument | Schlüssel |
|---|---|---|---|
| `getGroupCompetenceLevels` | `type=group,students`, `domain=en`, `comparison=school-average,state-average` | `competence-levels.json` (Lerngruppe, Vergleiche) | Dateiname; Skalendokument |
| | | `students-competence-levels.json` (Schüler:innen) | Dateiname |
| `getGroupItems` | `domain=en`, `comparison=school-average,state-average` | `items.json` | Dateiname; Dokument der Aufgabenniveau-Skala |
| `getGroupAggregations` | `type=group,students,items`, `domain=en`, `comparison=school-average,state-average` | `aggregations.json` (Lerngruppe, Vergleiche) | Dateiname |
| | | `students-aggregations.json` (Schüler:innen) | Dateiname |
| | | `items-aggregations.json` (Items) | Dateiname |

Die Anfragen sind `GROUP_REQUESTS.en` über `groups/<id>`; die abgeleiteten Datensätze sind die Schlüssel in `EN_DATASETS` (`@tba3/modules/en-domain`).

Die Spec-Option `comparisonIds` ist `EN_DATASETS.COMPARISON_IDS`, die Vergleichs-IDs aus drei Quellen, jede einmal:
- `competence-levels.json`: `comparisonIds` im Paket, mit MA geteilt.
- `aggregations.json`: `comparisonGroups` aus `EN_DATASETS.STYLE_AVERAGES`.
- `items.json`: `EN_DATASETS.ITEM_COMPARISON_GROUPS`, jede Gruppe mit `id`, `type`, `name`, Ordinal und Mittelwerten je Item, auch eine, die `aggregations.json` nicht führt.

So startet auch eine Vergleichssäule sichtbar, die nur `competence-levels.json` führt.

Payload: der Datensatz kommt aus `EN_DATASET.options` (URL `?scope=`); die Fixtures liegen unter `public/data/en/`, jede andere Lerngruppe öffnet `?scope=groups/<id>` gegen eine laufende API.
## Zustand
| Key | Schreibt | Liest |
|---|---|---|
| `currentMode` (`'all'`) | Domänen-Schalter `domain-switch` im Header von `group`, `item`, `student` (`Alle` plus eine Domäne je Eintrag) | `EnGroupViewModule`, `EnItemViewModule`, `EnStudentViewModule` |
| `currentStudentId` (`null`, nach dem Laden die erste Person aus `STUDENT_RECORDS`) | `_openStudent` aus Übersicht (Scatterplot), Lerngruppentabelle und Aufgaben-Detail; in der Schüler:innenansicht der Selektor und das Detailpanel | `EnStudentViewModule` |

Der Lerngruppen-Selektor (`dataset-selector`, nur auf `welcome`) schreibt keinen State, sondern navigiert per URL zu einem anderen Datensatz (voller Reload).

## Hooks
| Hook | Zweck |
|---|---|
| `static defaultOptions` | `glossaryData: glossary`, `dataset: EN_DATASET`, `views: VIEWS`, `defaultView`, `initialState: INITIAL_STATE`, `headerControls: buildEnViewHeaderControls`, `comparisonIds: EN_DATASETS.COMPARISON_IDS` (siehe Daten), `headerTokens` (`{{Fach}}` = `EN_DATASETS.CONFIG.subjectName`, das Fach der Daten, für den Titel der Willkommensansicht), `students: {records: EN_DATASETS.STUDENT_RECORDS, view: 'student'}`; Element `tba-en-app` |
