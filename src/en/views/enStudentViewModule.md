# EnStudentViewModule

## Zweck
Die Schüler:innenansicht: links die Schülerübersicht (Auswahl der Schüler:in im Kartenkopf, darunter Info- und Datentabelle), rechts das Stil-Chart der gewählten Schüler:in als Spider und das Aufgaben-Detailpanel. Die gewählte Schüler:in ist App-State: der Selektor der Übersicht und das Schüler:innenraster des Detailpanels schreiben ihn, andere Views schreiben ihn und navigieren hierher; die View folgt ihm und stellt Chart und Tabellen um.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - **EnStudentViewModule**

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Spider-Chart | `ChartHostModule` + `styleChartConfig` | [styleChartConfig.md](../../../packages/modules/src/en/modules/charts/style/styleChartConfig.md) | `showModuleTitle: true`, `enConfig`, `domainMode` (Seed aus `currentMode`); nur registriert, wenn bei der Konstruktion `studentStyleAggregation` und eine `currentStudentId` vorliegen |
| Schülerübersicht | `EnStudentTablesModule` | [enStudentTablesModule.md](../modules/enStudentTables/enStudentTablesModule.md) | `showModuleTitle: true`, `title: 'Schülerübersicht'`, `domainMode`, `infoGlossaryKey`, `dataGlossaryKey`, Callbacks `onItemSelected`, `onStudentSelected`; besitzt selbst den `StudentSelectorModule` (→ [studentSelectorModule.md](../../common/modules/header/studentSelectorModule.md)) im Kopf sowie `EnStudentInfoTableModule` (→ [enStudentInfoTableModule.md](../../../packages/modules/src/en/modules/tables/enStudentInfoTableModule.md)) und `EnStudentDataTableModule` (→ [enStudentDataTableModule.md](../../../packages/modules/src/en/modules/tables/enStudentDataTableModule.md)) |
| Aufgaben-Detail | `EnItemDetailModule` | [enItemDetailModule.md](../../../packages/modules/src/en/modules/enItemDetail/enItemDetailModule.md) | `showModuleTitle: true`, `onStudentSelected`; wie in der Aufgabenansicht |

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=students` | Schülerübersicht (Personenauswahl, Kopf-Tabelle, Presets der Aufgabenliste, aus `STUDENT_RECORDS`); Startperson und Legendenname des Spider |
| `aggregations` | `type=students` | Spider (das rohe Dokument als `studentData`); Schülerübersicht (Kopf-Tabelle aus `STUDENT_RECORDS`, Aufgabenliste aus `buildStudentItemRecords`); Aufgaben-Detail (Löser:innen-Listen in `ITEM_RECORDS`); alle über `enConfig` (Domänen, Stil-Kategorien, Ergebnistypen) |
| `items` | – | Schülerübersicht (Aufgabenliste aus `buildStudentItemRecords`, Stile aus `ITEM_RECORDS`); Aufgaben-Detail (Datensatz aus `ITEM_RECORDS` über `onItemSelected`) |
| `aggregations` | `type=items`, `aggregation=result` | Aufgaben-Detail (Zähler in `ITEM_RECORDS`) |
| `aggregations` | `comparison=school-average,state-average` | Spider (als `styleAverages`: Klassen- und Vergleichsserien) |

Payload: `_renderView` legt per `setData` ab: `studentArray` (`getDataset(EN_DATA_KEYS.STUDENT_RECORDS)`), `itemArray` (`getDataset(EN_DATA_KEYS.ITEM_RECORDS)`) und `studentStyleAggregation` (`getRawData(EN_DATA_KEYS.STYLE_AGGREGATION)`). Die Startperson ist `currentStudentId` aus dem App-State, sonst die erste in `studentArray`. Hydriert wird in einem Batch: Spider mit `{ studentData: studentStyleAggregation, studentId, displayName: 'Nachname, Vorname', useWidth: false, comparisonModes: enConfig.comparisonModeIds, useSpiderChart: true }`, Übersicht mit `{ studentArray, rawStudentArray, itemArray, studentId }`, Detailpanel mit `{}`. `rawStudentArray` baut `buildStudentItemRecords` aus den Rohdaten `ITEMS`, `STYLE_AGGREGATION` und `ITEM_AGGREGATION` für eine Person, bei jedem Personenwechsel neu; ohne Person bleiben Spider und Übersicht konstruiert, aber ungefüllt.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `currentStudentId` | Selektor der Übersicht und Schüler:innenraster des Detailpanels (`#selectStudent` → `updateState`), andere Views über `_openStudent` | Spider `setStudent({ studentId, displayName })` (kein neuer Payload, die Stil-Aggregation liegt seit dem Mount vor); Übersicht `updateStudent(studentId, data)` mit neu gebautem `rawStudentArray` |
| `currentMode` | Domänen-Schalter im Header (`domain-switch`) | Übersicht `setDomainMode(mode)`, Spider `setDomainMode(mode)` |
| `comparisonState` (über `observeActiveComparisons`) | Ø-Dropdown im Chart-Kopf (`comparisonModeControl`) | Spider `setActiveModes(activeModes)` |

Die Beobachter werden erst nach dem Hydrieren angemeldet; ein Wert gleich der schon gezeigten Schüler:in wird ignoriert.

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Übersicht `onStudentSelected(studentId)` | View `updateState({ currentStudentId })` (keine Navigation, man ist schon hier) |
| Detailpanel `onStudentSelected(studentId)` | View `updateState({ currentStudentId })` |
| Übersicht `onItemSelected(payload)` (von der Datentabelle durchgereicht) | Detailpanel `onItemSelected(payload)` |

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Datensätze lesen und ablegen, DOM bauen, Startschüler:in bestimmen, drei Kinder konstruieren, parallel hydrieren, dann Beobachter anmelden |
