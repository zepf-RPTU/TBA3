# EnGroupViewModule

## Zweck
Die Lerngruppenansicht: oben das Stil-Chart (Hör-/Lesestile als Lollipop über das Lerngruppenaggregat), darunter die Lerngruppentabelle mit allen Schüler:innen. Die Tabelle filtert das Chart über ihren Sync; ihr Toolbar-Button „Scatterplot-Suche“ öffnet ein Modal, in dem Schüler:innen im Scatterplot ausgewählt werden und die Auswahl als externer Filter auf die Tabelle zurückfließt. Dem Domänen-Schalter des Headers folgen Tabelle und Chart selbst.

## Design/Idee

Im Kern der Lerngruppenansicht steht eine beliebig erweiter- und anpassbare Tabelle. Ergebnisse können vollständig und übersichtlich abgebildet werden; dabei stehen gängige Tools zum Sortieren und Filtern zur Verfügung. Die entwickelnden Lehrkräfte wollten keine Vorauswahl der Ergebnisse treffen, sondern stattdessen die individuelle und zielgerichtete Auswahl und Exploration der Ergebnisse so intuitiv und niedrigschwellig wie möglich machen. Aus Sicht der auswertenden Einrichtungen kann die Tabelle leicht gekürzt oder um zusätzliche, landeseigene Merkmale (etwa die Halbjahresnote) ergänzt werden. Über die Kopfleiste lassen sich die Ergebnisse nach Hör- und Leseverstehen aufteilen oder gemeinsam zeigen. Der Graph oberhalb der Tabelle betitelt erstmals die Stile „global“, „selektiv“ und „detailliert“ und meldet die Mittelwerte der in der Tabelle angezeigten bzw. ausgewählten SuS.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Stil-Chart (nur mit Stilen in den Daten: ohne `EN_DATASETS.CONFIG.styleCategories` entsteht er nicht) | `ChartHostModule` + `styleGroupChartConfig` | [styleGroupChartConfig.md](../../../packages/modules/src/en/modules/charts/style/styleGroupChartConfig.md) | `showModuleTitle: true`, `glossaryReplacements: { Domänen }` (die Domänennamen aus `EN_DATASETS.CONFIG` als Liste, je Name verlinkt über `enDomainListRuns`), `collapsible: true` (eingeklappt behält die Karte ihren Kopf, die Tabelle nimmt die Höhe), `domainMode` (das Signal `currentMode`) |
| Lerngruppentabelle | `EnGroupTableModule` | [enGroupTableModule.md](../../../packages/modules/src/en/modules/tables/enGroupTableModule.md) | `glossaryReplacements: { Domänen }` (wie der Stil-Chart), `domainMode`, `showModuleTitle: true`, Callbacks `onOpenScatterSearch`, `onDataSync`, `onStudentSelected` |
| Scatterplot-Filter (Modal) | `ScatterplotFilterModule` | [scatterplotFilterModule.md](../../../packages/modules/src/en/modules/charts/scatterplot/scatterplotFilterModule.md) | Im eigenen `<dialog>` auf `document.body`, lazy beim ersten Öffnen erzeugt und **nicht** im Baum der View (daher kein Notiz-Ziel; das Modal hat eine eigene zentrierte Tour-Karte); `onConfirm`; jedes Öffnen `open(selectedStudentIds)`; beim Abbau der View entfernt. Hostet intern `scatterplotConfig` |

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=students` | Lerngruppentabelle und Scatterplot-Filter (in `STUDENT_RECORDS`); das Stil-Chart löst die IDs des Syncs gegen `STUDENT_RECORDS` auf |
| `aggregations` | `type=students` | Lerngruppentabelle, Stil-Chart und Scatterplot-Filter (in `STUDENT_RECORDS`); alle drei auch über `EN_DATASETS.CONFIG` (Domänen, Stil-Kategorien) |
| `aggregations` | `comparison=school-average,state-average` | Stil-Chart und Scatterplot-Filter (in `STYLE_AVERAGES`: Lerngruppenwerte, Lerngruppenname, Vergleichsgruppen) |
| `competence-levels` | `comparison=school-average,state-average` | Scatterplot-Filter über `EN_DATASETS.CONFIG` (Äquivalenztabellen der Lerngruppenzeile) |

Payload: keiner; die View liest aus dem Store nur `EN_DATASETS.CONFIG`, für das Titel-Token `{{Domänen}}` des Stil-Charts. Der erste Sync der Tabelle zeichnet das Chart. Ohne Schüler:innen zeigt das Chart seinen eigenen Leerzustand.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `currentMode` | Domänen-Schalter im Header (`domain-switch`) | Kein Handler: Tabelle und Chart bekommen das Signal als Option `domainMode` und folgen ihm selbst |

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Tabelle `onDataSync({ ids })` | Chart `applySync(data)` |
| Tabelle `onStudentSelected(studentId)` | View `_openStudent(studentId)` |
| Tabelle `onOpenScatterSearch()` | View öffnet das Filter-Modal (`open(ids)`) mit der Auswahl der Tabelle (`externalStudentIds`) |
| Modal `onConfirm(selectedIds)` | Tabelle `applyExternalStudentFilter(ids)`; eine leere Auswahl löscht den Filter, das Chart folgt über den Tabellen-Sync |

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Chart und Tabelle erzeugen und ins Template der View setzen |
| `tourExtras` | Getter, Override | `en.group.filter` (am Such-Button der Tabelle) und `en.group.scatterplot` (zentriert) |
