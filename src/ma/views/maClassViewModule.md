# MaClassViewModule

## Zweck
Die Klassen-View der Mathe-3-Klasse: oben ein einklappbarer Kompetenzstufen-Balken, darunter die Klassentabelle aller Schüler:innen. Ein Aufgabenpool-Dropdown im Untertitel der Tabelle schränkt sie auf `Gesamt` oder eine einzelne Leitidee ein; ein Klick auf ein Balkensegment filtert die Tabelle auf diese Stufe, ein Klick auf eine Zeile öffnet die Schüler:innen-View.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - **MaClassViewModule**

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Kompetenzstufen-Balken | `ChartHostModule` + `simpleKsBarConfig` | [simpleKsBarConfig.md](../../../packages/modules/src/ma/modules/charts/ksBar/simpleKsBarConfig.md) | `startCollapsed: true`, `deferHydrationUntilExpand: true`, `onLevelSelected` |
| Klassentabelle | `MaClassTableModule` | [maClassTableModule.md](../../../packages/modules/src/ma/modules/tables/maClassTableModule.md) | `showModuleTitle: true`, `pool` (aktiver Aufgabenpool); bei mehr als einem Pool `showSubtitle: true` mit einem leeren Host-Div, in das die View nach dem Mount das Dropdown und den Hinweis setzt; `onKsFilterCleared`, `onStudentSelected` |

Das Dropdown selbst ist kein Modul: die View hört per Delegation auf `change` an `select[data-pool-select]` und ruft `setActivePool(pool, scopedData)` an der Tabelle, bis die gerenderte Auswahl der letzten entspricht (schnelle Wechsel werden zusammengefasst, nie überlappend).

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | – | Kompetenzstufen-Balken (das rohe Dokument; gezeichnet wird die Klassenzeile, `type=group`); Klassentabelle über `ksLevels` und `classKsThresholds` des App-Payloads |
| `competence-levels` | `type=students` | Klassentabelle (`STUDENT_RECORDS`) |
| `aggregations` | `type=students` | Klassentabelle (Zähler in `STUDENT_RECORDS`; auf einer Leitidee neu gezählt aus den Ergebnissen je Aufgabe in `ITEM_RECORDS`) |
| `items` | – | Klassentabelle (Aufgabenzahl `nrItems`; die Aufgabenpools aus `ITEM_RECORDS` und `DOMAINS`) |

Payload: `_renderView` liest aus dem App-Payload `getData()` `itemArray`, `studentArray`, `nrItems`, `ksLevels` und `classKsThresholds`; die Pools baut `buildTaskPools(itemArray, getMaDomains(dataStore))` bei jedem Render neu (Start: `all`). Der Balken wird mit `dataStore.getRawData(MA_DATA_KEYS.COMPETENCE_LEVELS_CLASS)` hydriert. Die Tabelle erhält `{ studentArray, nrItems, ksLevels, classKsThresholds }` aus `scopeStudentData`: für `Gesamt` die Klassenrekorde unverändert, für eine Leitidee die per `buildScopedStudentRecords` über deren `iqbIds` neu gezählten Zeilen und deren `nrItems`. `ksLevels` und `classKsThresholds` sind Testheft-Fakten und werden nie pool-bezogen.

## Zustand
Keine App-State-Schlüssel beobachtet; die View schreibt `currentStudentId` nur indirekt über `_openStudent`.

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Balken `onLevelSelected(level)` | Tabelle `setKsLevelFilter(level)` |
| Tabelle `onKsFilterCleared()` | Balken `updateHighlight(null)` |
| Tabelle `onStudentSelected(studentId)` | `_openStudent(studentId)` (App-State `currentStudentId` + Navigation zu `student`) |

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Pools bauen, DOM bauen, Dropdown-Delegation anmelden, Balken und Tabelle konstruieren; Tabelle von Hand mounten, Pool-Dropdown in den Untertitel setzen, dann beide hydrieren |
