# MaStudentTablesModule

## Zweck
Der Wrapper „Schülerübersicht“ (Titel aus `ma.student.student-item-table`) in der linken Spalte der MA-Schüler:innen-View: eine ContentModule-Karte mit Titelzeile, in deren Kopf die Toolbar-Buttons der eingebetteten Aufgabentabelle (`MaStudentDataTableModule`) landen. Eine Instanz bedient nacheinander jede Person; `setSelectedStudentId` tauscht die Tabellenzeilen in place und meldet den Wechsel nach außen, damit die View ihre Ringe nachzieht.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../packages/module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../packages/module-base/src/modules/contentModule.md)
    - **MaStudentTablesModule**

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=students` | `id`¹ (die `studentId` der gezeigten Person: Bedingung für den Render des Kindes und Export-Identität) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `id` hat die Startperson keine `studentId`; das Modul rendert die Aufgabentabelle dann nie, und die Export-Identität bleibt leer.

Keine optionalen Felder.

Payload: `_doRenderContent(data)` erhält `{ rawStudentArray, studentArray?, studentId }`; die View mountet zusätzlich mit `totalItems` (hier ungenutzt). `rawStudentArray` (`buildRawStudentArray`) und `studentArray` (`buildStudentRecords`, beide `src/ma/utils/maStudentDataAdapter.js`) gehen unverändert an `MaStudentDataTableModule`, dessen Doc die Felder nennt. Jeder Kind-Render ruft `syncExportControls`, damit die Export-Identität der Person folgt.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `onSelectionChanged` | `(studentId: string) => void` | – | nein | Nach `setSelectedStudentId` mit einer neuen ID |
| `appState`, `dataStore`, `glossaryData`, `onNavigate` | – | aus `_childOptions()` | nein | Werden an die Aufgabentabelle weitergegeben |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setSelectedStudentId(schuelerId)` | Aufruf | Person wechseln; rendert das Kind neu und löst `onSelectionChanged` aus (No-op für die gezeigte ID) |
| `redraw()` | Aufruf | Spaltenbreiten der Aufgabentabelle neu berechnen (Layout-Wechsel) |
| `onSelectionChanged(studentId)` | Callback | siehe Optionen |
| `getExportControlDefinition()` | Override | Exportziel vom Typ `table` |
| `getExportIdentity()` | Override | Die aktuelle `studentId`, jede Person ist ein eigenes Exportziel |
