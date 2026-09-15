# MaStudentViewModule

## Zweck
Die Schüler:innen-View der Mathe-3-Klasse: oben eine Leiste mit Personenauswahl und Infotabelle über die volle Breite, links die Datentabelle der gewählten Person, rechts ihre Aufgabenringe je Leitidee. Im Modus `chart-only` zeigen ein großes Raster und der Fokus-Chart die Ergebnisse dieser einen Person; im Modus `table-only` bleibt nur die Tabelle.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - [MaLayoutViewBase](maLayoutViewBase.md)
      - **MaStudentViewModule**

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Kopfleiste | `MaStudentTopBarModule` (besitzt den gemeinsamen `StudentSelectorModule` → [studentSelectorModule.md](../../common/modules/header/studentSelectorModule.md) und `MaStudentInfoTableModule` → [maStudentInfoTableModule.md](../../../packages/modules/src/ma/modules/tables/maStudentInfoTableModule.md)) | [maStudentTopBarModule.md](../modules/maStudentTopBar/maStudentTopBarModule.md) | `totalItems`, `sortByName: true`, `onStudentSelected` → App-State |
| Schülerübersicht | `MaStudentTablesModule` (Komposit über `MaStudentDataTableModule` → [maStudentDataTableModule.md](../../../packages/modules/src/ma/modules/tables/maStudentDataTableModule.md)) | [maStudentTablesModule.md](../modules/maStudentTables/maStudentTablesModule.md) | `showModuleTitle: true`, `glossaryKey: 'ma.student.student-item-table'` (Titel und Tour-Text), `onSelectionChanged` |
| Aufgabenringe der Person (Modus `both`) | `ChartHostModule` + `taskRingGridConfig` | [taskRingGridConfig.md](../../../packages/modules/src/ma/modules/charts/taskRing/taskRingGridConfig.md) | `glossaryKey: 'ma.student.item-donuts'`; bei jedem Personenwechsel über `remountChartHost` getauscht oder per `updateTaskRingHostIfReusable` in Platz aktualisiert (`cleanupDelay` 50 ms, eine wartende Anfrage wird nachgezogen) |
| Chart-only-Raster und Fokus-Chart | siehe `MaLayoutViewBase` | [maLayoutViewBase.md](maLayoutViewBase.md#kinder) | beide auf `[currentStudentId]` eingeschränkt; das Raster folgt einem Personenwechsel per `updateSelectedStudentsOptimized` |

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=students` | Kopfleiste (Personenauswahl und Infotabelle, aus `STUDENT_RECORDS`), Schülerübersicht (Kompetenzstufe der Person), Aufgabenringe (Klassengröße, Name im Tooltip) |
| `aggregations` | `type=students` | Kopfleiste (Zahl der richtigen Aufgaben in `STUDENT_RECORDS`), Schülerübersicht (Ergebnis je Aufgabe in `RAW_STUDENT_RECORDS`), Aufgabenringe (Ergebnisse der Person in `ITEM_RECORDS`) |
| `items` | – | Kopfleiste (Aufgabenzahl `totalItems`), Schülerübersicht (Aufgabenangaben in `RAW_STUDENT_RECORDS`), Aufgabenringe (die Klassenzeilen, in `ITEM_RECORDS`; die Leitideen in `DOMAINS`) |

Payload: `_renderView` liest aus dem App-Payload `getData()` `studentArray`, `rawStudentArray` und `itemArray`. Kopfleiste und Schülerübersicht erhalten `{ studentArray, rawStudentArray, studentId, totalItems }` (`totalItems` = `itemArray.length`); die Startperson ist `currentStudentId` aus dem App-State, sonst die erste in `studentArray`. Nach dem Hydrieren beider erhalten die Ringe `{ itemArray, studentArray, domains, selectedStudents: [studentId] }`; Chart-only-Raster und Fokus-Chart baut `MaLayoutViewBase` für `[currentStudentId]`.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `currentStudentId` | Kopfleiste dieser View, `_openStudent` der Klassentabelle | Kopfleiste `setStudent(id)` (No-op, wenn sie selbst die Quelle war) und Schülerübersicht `setSelectedStudentId(id)` |

`layoutMode` und `chartOnlyDomainId` beobachtet die Basis, siehe [maLayoutViewBase.md](maLayoutViewBase.md#zustand); der Fokus-Chart wird hier auf `[studentId]` eingeschränkt (`_onDomainSelectedInChartOnly`).

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Kopfleiste `onStudentSelected(studentId)` | `appState.updateState({ currentStudentId })` |
| Schülerübersicht `onSelectionChanged(studentId)` | Ring-Host für die Person aus dem dann aktuellen App-Payload `getData()` neu bauen (`#createSingleStudentCharts`, auch für eine nachgezogene Anfrage) und die Chart-only-Auswahl nachziehen (`#syncChartOnlyStudentSelection`) |
| Chart-only-Raster `onDomainSelected(domainId)` | `MaLayoutViewBase` → `appState.updateState({ chartOnlyDomainId })` |

## Optionen
Keine eigenen; `focusGlossaryKey` ist fest `'ma.student.task-ring-focus'`.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_getLayoutConfig()` | Override | `{ focusChartContainerId: 'student-taskRingFocus', contentContainerSelector: '.student-view-content' }` |
| `_renderView()` | Override | Gerüst mit Kopfleiste als `topChildren` bauen, Beobachter anmelden, Kopfleiste und Schülerübersicht hydrieren, dann die Ringe der Startperson bauen |
| `_onChartOnlyModeEntered()` | Override | Nur mit gewählter Person: Chart-only-Raster (`student-taskRing-chart-only`) und Fokus-Chart für `[currentStudentId]` aufbauen |
| `_onDomainSelectedInChartOnly(domain)` | Override | `_createFocusChart(domain, [currentStudentId])` |
| `_getLayoutTableModule()` | Override | Schülerübersicht (`MaStudentTablesModule`) |
