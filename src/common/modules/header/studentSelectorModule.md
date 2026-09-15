# StudentSelectorModule

## Zweck
Auswahlliste der Schüler:innen einer Klasse („Nachname, Vorname“, ohne Id), dedupliziert nach `studentId` und standardmäßig nach Namen sortiert. Meldet die Auswahl mit Id, vorheriger Id, Anzeigename und Datensatz. Steht eingebettet in den Schüler:innen-Karten (`EnStudentTablesModule`, `MaStudentTopBarModule`); der Header hat keinen solchen Steuerelement-Typ.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../packages/module-base/src/modules/baseModule.md)
  - **StudentSelectorModule**

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=students` | `id`¹ (wird `studentId`: Wert der Option, Schlüssel für Deduplizierung und Auswahl) |
| `aggregations` | `type=students` | `id`¹ (nur EN: auch eine Person, die nur hier steht, bekommt einen Eintrag) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `id` fallen beim Deduplizieren nach `studentId` alle Personen auf einen Eintrag.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`type=students`; EN auch `aggregations`) | `properties[lastName]`, `properties[firstName]` | Der Adapter setzt leere Strings; ohne beide Felder zeigt die Option „, “ und die Sortierung nach Namen wirkt nicht |

Payload: kein Render-Payload. Die Liste kommt aus der Option `students` bzw. `setStudents(students)` mit den Schüler:innen-Datensätzen der App (`buildClassStudentRecords`, `src/en/utils/enStudentDataAdapter.js`; `buildStudentRecords`, `src/ma/utils/maStudentDataAdapter.js`); gelesen werden `studentId`, `lastName` und `firstName`. Ohne gültige `defaultStudentId` wird die erste Person gewählt.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `students` | `Array<object>` | `[]` | ja | Schüler:innen-Datensätze |
| `defaultStudentId` | `string` | `null` | nein | Anfangs gewählt |
| `sortByName` | `boolean` | `true` | nein | Nach Nachname, dann Vorname sortieren |
| `label` | `string` | `'Schüler:in:'` | nein | Label vor dem Select, per `for` gebunden – der zugängliche Name des Selects |
| `containerClass`, `selectClass`, `labelClass` | `string` | `''` | nein | Zusätzliche besitzerlokale Klassen |
| `onSelectionChanged` | `(eventData) => void` | – | nein | Callback `selectionChanged` |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setStudents(students)` | Aufruf | Liste ersetzen und Select neu befüllen |
| `setStudent(studentId)` | Aufruf | Auswahl programmatisch setzen, ohne Callback; unbekannte Id wird mit Warnung ignoriert |
| `onSelectionChanged({ studentId, previousStudentId, displayName, student, source })` | Callback | Auswahl geändert (`source` ist die Modul-Id) |
