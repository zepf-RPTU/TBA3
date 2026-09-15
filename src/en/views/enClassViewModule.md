# EnClassViewModule

## Zweck
Die Klassenansicht: oben das Stil-Chart (Hör-/Lesestile als Lollipop über das Klassenaggregat), darunter die Klassentabelle mit allen Schüler:innen. Die Tabelle filtert das Chart über ihren Sync; ihr Toolbar-Button „Scatterplot-Suche“ öffnet ein Modal, in dem Schüler:innen im Scatterplot ausgewählt werden und die Auswahl als externer Filter auf die Tabelle zurückfließt. Der Domänen-Schalter des Headers stellt die Tabelle um, das Chart folgt über ihren Sync.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - **EnClassViewModule**

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Stil-Chart | `ChartHostModule` + `styleChartConfig` | [styleChartConfig.md](../../../packages/modules/src/en/modules/charts/style/styleChartConfig.md) | `showModuleTitle: true`, `enConfig`, `domainMode` (Seed aus `currentMode`), `studentStore` |
| Klassentabelle | `EnClassTableModule` | [enClassTableModule.md](../../../packages/modules/src/en/modules/tables/enClassTableModule.md) | `enConfig`, `domainMode`, `showModuleTitle: true`, `studentStore`, Callbacks `onOpenScatterSearch`, `onScatterFilterReset`, `onDataSync`, `onStudentSelected` |
| Scatterplot-Filter (Modal) | `ScatterplotFilterModule` | [scatterplotFilterModule.md](../../../packages/modules/src/en/modules/charts/scatterplot/scatterplotFilterModule.md) | Auf `document.body`, lazy beim ersten Öffnen erzeugt und **nicht** als Kind registriert (ein registriertes Modal würde bei jedem View-Wechsel wieder aufgehen); `classId: currentClassId`, `studentArray`, `selectedStudentIds`, `onConfirm`; bei erneutem Öffnen `update({ studentArray, selectedStudentIds })`; in `destroy()` zerstört. Hostet intern `scatterplotConfig` |

Chart und Tabelle teilen den vom View besessenen `studentStore` (`createIdStore('studentId')`), sodass der Tabellen-Sync nur `studentId`-Arrays trägt.

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=students` | Klassentabelle und Scatterplot-Filter (in `STUDENT_RECORDS`); das Stil-Chart über die Tabellenzeilen im `studentStore` |
| `aggregations` | `type=students` | Klassentabelle, Stil-Chart und Scatterplot-Filter (in `STUDENT_RECORDS`); alle drei auch über `enConfig` (Domänen, Stil-Kategorien) |
| `aggregations` | `comparison=school-average,state-average` | Stil-Chart und Scatterplot-Filter (als `styleAverages`: Klassenwerte, Klassenname, Vergleichsgruppen) |
| `competence-levels` | `comparison=school-average,state-average` | Scatterplot-Filter über `enConfig` (Äquivalenztabellen der Klassenzeile) |

Payload: `_renderView` liest `getDataset(EN_DATA_KEYS.STUDENT_RECORDS)` und hält es als unveränderten Bestand; `enConfig` (`getEnConfig`) und `styleAverages` (`getEnStyleAverages`) gehen als Optionen an Stil-Chart und Filter-Modal. Hydriert wird in zwei Batches, weil das Stil-Chart seinen Render bis zum ersten Sync der Tabelle aufschiebt: erst das Chart mit `{ studentData, displayName: 'Klassenübersicht', useWidth: true }`, dann die Tabelle mit `{ studentArray }`; ohne Schüler:innen wird das Chart nur gemountet und zeigt einen Leerzustand. Das Modal bekommt `studentArray` beim ersten Öffnen als Option, danach über `update({ studentArray, selectedStudentIds })`.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `currentMode` | Domänen-Schalter im Header (`domain-switch`) | Tabelle `setState({ mode })`; das Chart folgt über den Tabellen-Sync, der `mode` mitträgt |
| `comparisonState` (über `observeActiveComparisons`) | Ø-Dropdown im Chart-Kopf (`comparisonModeControl`) | Chart `setActiveModes(activeModes)` |

Beide Kinder werden bei der Konstruktion mit `domainMode` aus `currentMode` geseedet.

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Tabelle `onDataSync({ visibleIds, selectedIds?, mode })` | Chart `applySync(data)` |
| Tabelle `onStudentSelected(studentId)` | View `_openStudent(studentId)` |
| Tabelle `onOpenScatterSearch()` | View öffnet das Filter-Modal (`show()`) |
| Tabelle `onScatterFilterReset()` | View leert die eigene Auswahl (`#selectedStudentIds`), die Tabelle hat ihren Filter schon selbst gelöscht |
| Modal `onConfirm(selectedIds)` | Tabelle `applyExternalStudentFilter(ids)` bzw. bei leerer Auswahl `clearExternalStudentFilter()`; das Chart folgt über den Tabellen-Sync |

## Optionen
Keine eigenen. Liest `currentClassId` (von `EnAppModule.getViewModuleOptions`) für das Modal.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Schüler:innendatensätze lesen, DOM bauen, Beobachter anmelden, Chart und Tabelle konstruieren und in zwei Batches hydrieren |
| `customizeTourSteps(steps)` | Override | Die abgeleiteten Schritte plus `en.class.filter` und `en.class.scatterplot` |
| `destroy()` | Override | Lazy erzeugtes Modal zerstören, dann Basis |
