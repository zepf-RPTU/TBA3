# EnStudentTablesModule

## Zweck
Die Karte „Schülerübersicht“ der EN-Schüler:innen-View: ein ContentModule-Kopf, dessen Titel-Slot durch die Personenauswahl (`StudentSelectorModule`) ersetzt ist, darunter die Kopf-Tabelle (`EnStudentInfoTableModule`) und die Aufgabenliste (`EnStudentDataTableModule`). Die Kopf-Buttons der Aufgabenliste landen in einer eigenen Leiste innerhalb der Kopf-Aktionen. Eine Instanz zeigt nacheinander jede Person; der Wechsel rendert nur die Kind-Tabellen neu.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../packages/module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../packages/module-base/src/modules/contentModule.md)
    - **EnStudentTablesModule**

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=students` | `id`¹ (die `studentId` der gezeigten Person: Auswahl, Render der Kinder, Export-Identität) |
| `aggregations` | `type=students` | `id`¹ (auch eine Person, die nur hier steht, bekommt einen Eintrag) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `id` hat die Startperson keine `studentId`; die Kind-Tabellen werden erzeugt, aber nie initialisiert, und die Export-Identität bleibt leer.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`type=students`; auch `aggregations`) | `properties[lastName]`, `properties[firstName]` | Die Personenauswahl zeigt „, “ und sortiert nicht nach Namen |

Payload: `_doRenderContent({ studentArray, rawStudentArray, itemArray, studentId })`. `studentArray` (Datensätze aus `EN_DATA_KEYS.STUDENT_RECORDS`) füllt die Personenauswahl und geht mit `rawStudentArray` (`buildStudentItemRecords` für die Person) und `studentId` unverändert an `EnStudentInfoTableModule` und `EnStudentDataTableModule`, deren Docs die Felder nennen; `itemArray` (`EN_DATA_KEYS.ITEM_RECORDS`) bekommt nur `EnStudentDataTableModule`; `enConfig` holt das Modul für beide mit `getEnConfig(dataStore)`. `updateStudent(studentId, appData)` erwartet dasselbe Objekt mit neu gebautem `rawStudentArray`, setzt die Auswahl ohne Rückruf, rendert beide Tabellen und ruft danach `syncExportControls`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `dataStore` | `DataStore` | aus `_childOptions()` | ja | `getEnConfig` für die Kinder |
| `domainMode` | `string` | – | nein | Anfangsmodus, an beide Tabellen durchgereicht |
| `infoGlossaryKey` | `string` | – | ja | `glossaryKey` der Kopf-Tabelle |
| `dataGlossaryKey` | `string` | – | ja | `glossaryKey` der Aufgabenliste |
| `onItemSelected` | `(payload: { item }) => void` | – | nein | Zeilenklick in der Aufgabenliste, durchgereicht |
| `onStudentSelected` | `(studentId) => void` | – | nein | Neue Person in der Auswahl |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setDomainMode(mode)` | Aufruf | `setState({ mode })` auf beiden Tabellen |
| `updateStudent(studentId, appData)` | Aufruf | Andere Person anzeigen, ohne die Karte neu zu bauen |
| `onStudentSelected(studentId)` | Callback | Auswahl in der Personenliste, nur bei tatsächlichem Wechsel |
| `onItemSelected(payload)` | Callback | siehe Optionen |
| `getExportIdentity()` | Override | Die aktuelle Personen-ID |
| `getExportControlDefinition()` | Override | Exportziel vom Typ `table` |
