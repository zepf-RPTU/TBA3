# MaAppModule

## Zweck
Das Mathe-3-Dashboard: eine Lerngruppe mit Kompetenzstufen, Leitideen und Aufgabenringen, dazu Aufgaben-, Schüler:innen-, Berichts- und Hilfe-View. Die Nav-Karten öffnen Aufgaben- und Schüler:innen-View im reinen Diagramm-Layout.

## Design/Idee

Die Mathe-Rückmeldung kombiniert verschiedene Ansichten, in denen die Ergebnisse der Testung nacheinander in unterschiedlichen Aggregationen und Schwerpunkten aufbereitet werden.

- Ein freundlicher Willkommens-Bildschirm begrüßt und bietet einen Überblick über benannte Inhalte.
- Die Übersicht stellt das gesamte Lerngruppenergebnis graphisch dar und stellt es in Bezug zu Schul- und Landesschnitt.
- Die Lerngruppenübersicht bildet die Testergebnisse auf Lerngruppenebene tabellarisch ab, mit zentralen Kennwerten für alle SuS.
- Die Aufgabenübersicht listet alle Aufgaben des verwendeten Testhefts in tabellarischer Form und liefert ebenfalls pro Aufgabe zentrale Kennwerte.
- Die Schüler:innenansicht bietet die detaillierten Ergebnisse ausgewählter SuS.
- Die Hilfe-Seite bündelt Glossar und häufige Fragen.
- Zuletzt stellt der Bericht ausgewählte Inhalte für den PDF-Export zusammen.

Alle Elemente jeglicher Ansichten sind dabei über zahlreiche niedrigschwellige Interface-Elemente anpassbar; die entwickelnden Lehrkräfte priorisierten eine umfassende Abbildung der wichtigsten Informationen bei bevorzugt darstellenden Visualisierungen ohne viel Text. Die Ergebnisse sind dabei mit verschiedenen Fragestellungen bzw. Foki zusammengefasst, ohne jedoch den Lehrkräften ein verbindliches Vorgehen zu suggerieren. So ermöglicht die Startseite bzw. die Menüführung ein sequenzielles wie auch ein frei gesteuertes Vorgehen – ein Kompromiss aus selbstbestimmter Sichtung bei gleichzeitigem „an die Hand nehmen“. Wo immer möglich liefern Tooltips das zum Verständnis notwendige Wissen direkt an Ort und Stelle. Die Interpretation der Ergebnisse wird jedoch weitestgehend den Lehrkräften selbst überlassen; die Ergebnisse liefern die Instrumente zur Exploration, forcieren jedoch keine bestimmte Lesart.

## Views
| Key | Klasse | Icon | Doc |
|---|---|---|---|
| `welcome` (Startview) | `WelcomeSplashViewModule` (gemeinsam) | `home` | [welcomeSplashViewModule.md](../common/views/welcomeSplashViewModule.md) |
| `overview` | `MaOverviewViewModule` | `bar_chart` | [maOverviewViewModule.md](views/maOverviewViewModule.md) |
| `group` | `MaGroupViewModule` | `groups` | [maGroupViewModule.md](views/maGroupViewModule.md) |
| `item` | `MaItemViewModule` | `list_alt` | [maItemViewModule.md](views/maItemViewModule.md) |
| `student` | `MaStudentViewModule` | `person` | [maStudentViewModule.md](views/maStudentViewModule.md) |
| `report` | `ReportViewModule` (gemeinsam) | aus `REPORT_VIEW_CONFIG` | [reportViewModule.md](../common/views/report/reportViewModule.md) |
| `help` | `MaHelpViewModule` | `menu_book` | [maHelpViewModule.md](views/maHelpViewModule.md) |

`item` und `student` erben von der Zwischenbasis [MaLayoutViewBase](views/maLayoutViewBase.md); `report` und `help` sind ans Sidebar-Ende gepinnt. Die Namen der Views (Sidebar und Nav-Karten) stehen unter `ma.nav-cards.element_texts.nav-<key>`.

## Daten
| Anfrage | Parameter | Dokument | Schlüssel |
|---|---|---|---|
| `getGroupCompetenceLevels` | `type=group,students`, `domain=ma`, `comparison=school-average,state-average` | `competence-levels.json` (Lerngruppe, Vergleiche) | Dateiname; Skalendokument |
| | | `students-competence-levels.json` (Schüler:innen) | Dateiname |
| `getGroupItems` | `domain=ma`, `comparison=school-average,state-average` | `items.json` | Dateiname; Dokument der Aufgabenniveau-Skala |
| `getGroupAggregations` | `type=students,items`, `domain=ma`, `aggregation=result` | `students-aggregations.json` (Schüler:innen) | Dateiname |
| | | `items-aggregations.json` (Items) | Dateiname |

Die Basis baut aus `MA_DATASET` den `DocumentStore` über `groups/<id>` (`GROUP_REQUESTS.ma`); die abgeleiteten Datensätze sind die Schlüssel in `MA_DATASETS` (`@tba3/modules/ma-domain`). Eine Lerngruppenzeile der Aggregation fragt MA nicht an (MA hat keine Stil-Dimension). Sind alle Dokumente da, zeigt die Basis jede Vergleichsgruppe aus `MA_DATASETS.COMPARISON_IDS`: die Vergleichs-Ids aus `competence-levels.json` und die der Vergleichszeilen von `items.json`, jede einmal.

Payload: der Datensatz kommt aus `MA_DATASET_OPTIONS` (URL `?scope=`); die VERA-3-Fixtures liegen unter `public/data/ma/`, jede andere Lerngruppe öffnet `?scope=groups/<id>` gegen eine laufende API.

## Zustand
| Key | Schreibt | Liest |
|---|---|---|
| `currentStudentId` | `MaStudentTopBarModule` über die Schüler:innen-View, `_openStudent` (Lerngruppentabelle), der Start der App (erste Person aus `STUDENT_RECORDS`) | `MaStudentViewModule` |
| `layoutMode` (`both`) | Layout-Umschalter im Header, `statePatch` einer Navigation (Nav-Karten) | `MaItemViewModule`, `MaStudentViewModule` (über `MaLayoutViewBase`) |
| `itemRingGrouping` (`leitidee`) | Gruppierungsmenü jedes Ringrasters | jedes Ringraster (Option `ringGrouping`), beide Layout-Views (über `MaLayoutViewBase`) |
| `chartOnlyRingId` (`null`) | Ring-Klick im Chart-only-Raster der Aufgaben- oder Schüler:innen-View; ein Gruppierungswechsel setzt ihn zurück | beide Layout-Views (über `MaLayoutViewBase`) |

## Hooks
| Hook | Zweck |
|---|---|
| `static defaultOptions` | MAs Spec: Glossar, Datensatz, Views (Kopf-Einträge `ma.<view>.header`), Startview `welcome`, eigene State-Keys, Header-Controls, Vergleichs-Ids und Schüler:innen (`students.view: 'student'`); Element `tba-ma-app` |
