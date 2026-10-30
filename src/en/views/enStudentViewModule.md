# EnStudentViewModule

## Zweck
Die Schüler:innenansicht: links die Schüler:innenübersicht (Auswahl der Schüler:in im Kartenkopf, darunter Info- und Datentabelle), rechts das Stil-Chart der gewählten Schüler:in als Spider und das Aufgaben-Detailpanel.

## Design/Idee

Die Schüler:innenansicht verbindet Inhalte der Lerngruppenansicht sowie der Aufgabenansicht und wendet diese für einzelne SuS an; so werden neben den allgemeinen Merkmalen und Leistungsdaten aufgabenspezifisch Ergebnisse in tabellarischer und graphischer Form abgebildet. Anhand der Stile (global, selektiv, detailliert) wird ein visuelles Profil angezeigt, welches auf einen Blick die Stärken und Schwächen der SuS zeigen soll und gleichzeitig einen Bezug zur Lerngruppe herstellt. Auch wenn der Fokus der Vergleichsarbeiten nicht auf der individuellen Schülerleistung liegt, wollte die Entwicklungsgruppe dennoch ein Tool integrieren, welches eine individualisierte Sicht ermöglicht und sich beispielsweise auch als Grundlage für Schüler- bzw. Elterngespräche nutzen lässt. Linksseitig liegt eine Tabelle mit umfassenden Informationen, rechtsseitig liegt eine Visualisierung der Lösungshäufigkeit pro Stil (siehe [styleStudentChartConfig](../../../packages/modules/src/en/modules/charts/style/styleStudentChartConfig.md)) sowie eine Info-Box wie in der Aufgabenansicht (siehe [EnItemDetailModule](../../../packages/modules/src/en/modules/enItemDetail/enItemDetailModule.md)).

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Spider-Chart (nur mit Stilen in den Daten: ohne `EN_DATASETS.CONFIG.styleCategories` entsteht er nicht) | `ChartHostModule` + `styleStudentChartConfig` | [styleStudentChartConfig.md](../../../packages/modules/src/en/modules/charts/style/styleStudentChartConfig.md) | `showModuleTitle: true`, `collapsible: true` (eingeklappt behält die Karte ihren Kopf, das Aufgaben-Detail nimmt die Spalte), `domainMode` (das Signal `currentMode`), `studentId` (das Signal `currentStudentId`) |
| Schüler:innenübersicht | `EnStudentTablesModule` | [enStudentTablesModule.md](../modules/enStudentTables/enStudentTablesModule.md) | `showModuleTitle: true`, `glossaryKey: 'en.student.student-tables'` (Titel), `domainMode`, `studentId`, `infoGlossaryKey`, `dataGlossaryKey`, Callbacks `onItemSelected`, `onStudentSelected`; besitzt selbst die Schüler:innen-Auswahl im Kopf und beide Tabellen |
| Aufgaben-Detail | `EnItemDetailModule` | [enItemDetailModule.md](../../../packages/modules/src/en/modules/enItemDetail/enItemDetailModule.md) | `showModuleTitle: true`, `onStudentSelected`; wie in der Aufgabenansicht |

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=students` | Schüler:innenübersicht (Personenauswahl, Kopf-Tabelle, Presets der Aufgabenliste, aus `STUDENT_RECORDS`) |
| `aggregations` | `type=students` | Spider (Stil-Anteile und Legendenname aus `STUDENT_RECORDS`); Schüler:innenübersicht (Kopf-Tabelle aus `STUDENT_RECORDS`, Aufgabenliste aus den `itemResults` in `STUDENT_RECORDS`); Aufgaben-Detail (Löser:innen-Listen in `ITEM_RECORDS`); alle über `EN_DATASETS.CONFIG` (Domänen, Stil-Kategorien, Ergebnistypen) |
| `items` | – | Schüler:innenübersicht (Aufgabenliste aus `ITEM_RECORDS`, `buildStudentItemRows`); Aufgaben-Detail (löst die IDs aus `onItemSelected` selbst gegen `ITEM_RECORDS` auf) |
| `aggregations` | `type=items` | Aufgaben-Detail (Zähler in `ITEM_RECORDS`) |
| `aggregations` | `comparison=school-average,state-average` | Spider (in `STYLE_AVERAGES`: Lerngruppen- und Vergleichsserien) |

Payload: nur die Identität. Die Person ist `currentStudentId` aus dem App-State, die View hält keine eigene Kopie; Übersicht und Spider bekommen sie als Option `studentId`.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `currentStudentId` | Selektor der Übersicht und Schüler:innenraster des Detailpanels (`onStudentSelected` → `_selectStudent`), andere Views über `_openStudent` | Kein Handler: Übersicht und Spider bekommen das Signal als Option `studentId` und folgen ihm selbst |
| `currentMode` | Domänen-Schalter im Header (`domain-switch`) | Kein Handler: Übersicht und Spider bekommen das Signal als Option `domainMode` und folgen ihm selbst |

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Übersicht `onStudentSelected(studentId)` | View schreibt `currentStudentId` (`_selectStudent`, ohne Navigation) |
| Detailpanel `onStudentSelected(studentId)` | View schreibt `currentStudentId` (`_selectStudent`) |
| Übersicht `onItemSelected({ itemIds })` (von der Datentabelle durchgereicht) | Detailpanel `onItemSelected({ itemIds })` |

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Drei Kinder erzeugen und ins zweispaltige Raster setzen |
