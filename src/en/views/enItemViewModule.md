# EnItemViewModule

## Zweck
Die Aufgabenansicht: das Aufgaben-Lollipop (Lösungshäufigkeit je Item mit Vergleichsmarken), die Aufgabentabelle (eine Zeile je Item) und das Aufgaben-Detailpanel. Die Tabelle bestimmt über ihren Sync, welche Items das Lollipop zeigt; eine gewählte Zeile öffnet das Item im Detailpanel, dessen Schüler:innenraster in die Schüler:innenansicht führt.

## Design/Idee

Die Aufgabenansicht liefert vollständige Information rund um die Aufgaben, welche im verwendeten Testheft vorliegen. Hier sollen die Ergebnisse aus inhaltlicher Sicht in Bezug auf den Testgegenstand untersucht werden. Kern ist, ähnlich wie in der Lerngruppenansicht, eine Tabelle, die alle relevanten Informationen abbilden, filtern und sortieren kann. Ergänzt wird die Tabelle durch eine einfache Darstellung der mittleren Lösungshäufigkeiten innerhalb der Lerngruppe sowie eine Info-Box, welche zu ausgewählten Aufgaben zusätzliche Informationen liefert.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Aufgaben-Lollipop | `ChartHostModule` + `itemLollipopConfig` | [itemLollipopConfig.md](../../../packages/modules/src/en/modules/charts/itemLollipop/itemLollipopConfig.md) | `glossaryReplacements: { Domänen }` (die Domänennamen aus `EN_DATASETS.CONFIG` als Liste, je Name verlinkt über `enDomainListRuns`), `collapsible: true` (eingeklappt behält die Karte ihren Kopf, Tabelle und Detail nehmen die Höhe), `domainMode` (das Signal `currentMode`) |
| Aufgabentabelle | `EnItemTableModule` | [enItemTableModule.md](../../../packages/modules/src/en/modules/tables/enItemTableModule.md) | `glossaryReplacements: { Domänen }` (wie der Lollipop), `domainMode` (das Signal `currentMode`), `showModuleTitle: true`, Callbacks `onDataSync`, `onItemSelected` |
| Aufgaben-Detail | `EnItemDetailModule` | [enItemDetailModule.md](../../../packages/modules/src/en/modules/enItemDetail/enItemDetailModule.md) | `showModuleTitle: true`, `onStudentSelected` |

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `items` | – | Aufgabentabelle und Aufgaben-Lollipop (die Lerngruppenzeilen, in `ITEM_RECORDS`); das Aufgaben-Detail löst die IDs aus `onItemSelected` selbst gegen `ITEM_RECORDS` auf |
| `items` | `comparison=school-average,state-average` | Aufgaben-Lollipop (die Vergleichszeilen, in `ITEM_COMPARISON_GROUPS`) |
| `aggregations` | `type=items` | Aufgabentabelle und Aufgaben-Lollipop (in `ITEM_RECORDS`); das Lollipop zusätzlich die Ergebnistypen (`readResultTypes` über `items-aggregations.json`) |
| `aggregations` | `type=students` | Aufgaben-Detail (Löser:innen-Listen in `ITEM_RECORDS`); Tabelle über `EN_DATASETS.CONFIG` |
| `competence-levels` | `type=students` | Tabelle über `EN_DATASETS.CONFIG` |

Payload: keiner; die View liest aus dem Store nur `EN_DATASETS.CONFIG` (die Domänen) für das Titel-Token `{{Domänen}}` des Lollipops. Das Lollipop zeichnet erst ab dem ersten Sync der Tabelle.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `currentMode` | Domänen-Schalter im Header (`domain-switch`) | Kein Handler: Tabelle und Lollipop bekommen das Signal als Option `domainMode` und folgen ihm selbst |

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Tabelle `onDataSync(data)` | Lollipop `applySync(data)` (nur Ids) |
| Tabelle `onItemSelected({ itemIds })` | Detailpanel `onItemSelected({ itemIds })` |
| Detailpanel `onStudentSelected(studentId)` | View `_openStudent(studentId)` |

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Drei Kinder erzeugen und im 2×2-Raster der View platzieren |
