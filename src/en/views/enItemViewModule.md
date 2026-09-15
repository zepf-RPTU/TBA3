# EnItemViewModule

## Zweck
Die Aufgabenansicht: das Aufgaben-Lollipop (Lösungshäufigkeit je Item mit Vergleichsmarken), die Aufgabentabelle (flach oder nach Aufgaben gruppiert) und das Aufgaben-Detailpanel. Die Tabelle bestimmt über ihren Sync, welche Items das Lollipop zeigt; eine gewählte Zeile öffnet das Item im Detailpanel, dessen Schüler:innenraster in die Schüler:innenansicht führt.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - **EnItemViewModule**

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Aufgaben-Lollipop | `ChartHostModule` + `itemLollipopConfig` | [itemLollipopConfig.md](../../../packages/modules/src/en/modules/charts/itemLollipop/itemLollipopConfig.md) | `enConfig`, `itemStore` |
| Aufgabentabelle | `EnItemTableModule` | [enItemTableModule.md](../../../packages/modules/src/en/modules/tables/enItemTableModule.md) | `enConfig`, `domainMode` (Seed aus `currentMode`), `showModuleTitle: true`, `itemStore`, Callbacks `onDataSync`, `onItemSelected`, `onItemPreview` (→ `itemPreviewOverlay`) |
| Aufgaben-Detail | `EnItemDetailModule` | [enItemDetailModule.md](../../../packages/modules/src/en/modules/enItemDetail/enItemDetailModule.md) | `showModuleTitle: true`, `onStudentSelected` |

Chart und Tabelle teilen den vom View besessenen `itemStore` (`createIdStore('iqbId')`), sodass der Tabellen-Sync nur `iqbId`-Arrays trägt.

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `items` | – | Aufgabentabelle und Aufgaben-Lollipop (die Klassenzeilen, in `ITEM_RECORDS`); das Aufgaben-Detail bekommt sie als Tabellenzeilen über `onItemSelected` |
| `items` | `comparison=school-average,state-average` | Aufgaben-Lollipop (die Vergleichszeilen, als `itemComparisonGroups`) |
| `aggregations` | `type=items`, `aggregation=result` | Aufgabentabelle und Aufgaben-Lollipop (in `ITEM_RECORDS`) |
| `aggregations` | `type=students` | Aufgaben-Detail (Löser:innen-Listen in `ITEM_RECORDS`); Tabelle und Lollipop über `enConfig` |
| `competence-levels` | `type=students` | Tabelle und Lollipop über `enConfig` |

Payload: `_renderView` liest `getDataset(EN_DATA_KEYS.ITEM_RECORDS)` und `itemComparisonGroups` aus dem App-Payload `getData()`. Hydriert wird in zwei Batches, weil das Lollipop seinen Render bis zum ersten Sync der Tabelle aufschiebt: erst das Chart mit `{ itemsData, itemComparisonGroups }`, dann Tabelle (`{ itemsData }`) und Detailpanel (`{}`).

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `currentMode` | Domänen-Schalter im Header (`domain-switch`) | nur Tabelle `setState({ mode })`; das Lollipop folgt über `onDataSync` |
| `comparisonState` (über `observeActiveComparisons`) | Ø-Dropdown im Chart-Kopf (`comparisonModeControl`) | Lollipop `setActiveModes(activeModes)` |

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Tabelle `onDataSync(data)` | Lollipop `applySync(data)` (nur Ids, trägt `groupMode`) |
| Tabelle `onItemSelected(payload)` | Detailpanel `onItemSelected(payload)` |
| Detailpanel `onStudentSelected(studentId)` | View `_openStudent(studentId)` |

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Item-Datensätze lesen, DOM bauen, Beobachter anmelden, drei Kinder konstruieren und in zwei Batches hydrieren |
