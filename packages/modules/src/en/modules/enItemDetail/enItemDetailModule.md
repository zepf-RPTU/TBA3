# EnItemDetailModule

## Zweck
Die Detailkarte zu einer Aufgabe im EN-Dashboard: Nummer, Bezeichnung, Domäne und Aufgabenniveau, die Erfolgsquote mit den Zählern richtig / nicht gelöst / nicht bearbeitet, dazu die Namen der Schüler:innen, die die Aufgabe gelöst bzw. nicht gelöst haben (umschaltbar, Standard ist die kleinere Gruppe). In der Aufgaben-View zeigt sie die Mehrfachauswahl der Tabelle als Tab-Leiste im Untertitel-Slot, in der Schüler:innen-View die zuletzt angeklickte Zeile. Ein Klick auf einen Namen wählt diese Person aus.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../module-base/src/modules/contentModule.md)
    - **EnItemDetailModule**

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `items` | – | `items[].iqbId`, `items[].name`, `items[].exercise.name`, `domain.id`¹ |
| `aggregations` | `type=items`, `aggregation=result` | `id`¹ (die `iqbId` des Items), `aggregations[type=Ergebnis]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `descriptiveStatistics.frequency` |
| `aggregations` | `type=students` | `id`¹, `domain.id`¹, `aggregations[type=Ergebnis]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` (nach `value` gelesen, in beliebiger Reihenfolge) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `domain.id` am Item erreicht es die Karte nicht; ohne `id` am Ergebnisdokument stehen alle Zähler und die Erfolgsquote auf 0; ohne Schüler:innen-`id` führt ein Namensklick nirgendwohin. Gelöst hat, wer im `Richtig`-Eintrag steht.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `items` | `domain.name` | Zeile „Domäne“ zeigt „N/A“, Tabs ohne Domänen-Präfix |
| `items` | `items[].parameters.competenceLevel.nameShort` | Zeile „Aufgabenniveau“ zeigt „N/A“ |
| `aggregations` (`type=students`) | `aggregations[type=Ergebnis].includedIqbIds` | Beide Namenslisten leer (0 / 0), die Karte zeigt die Leer-Meldung der Gelöst-Liste |
| `aggregations` (`type=students`) | `properties[lastName]`, `properties[firstName]` | Das Namensraster zeigt die Schüler:innen-`id` |

Payload: kein Render-Payload; die Aufgabe kommt über `onItemSelected({ items, mode })` (Aufgaben-View, Zeilen der Aufgabentabelle) oder `onItemSelected({ item })` (Schüler:innen-View, Datensatz aus der Datentabelle). Beides sind Datensätze aus `EN_DATA_KEYS.ITEM_RECORDS` (`buildItemArray`, `src/en/utils/enItemDataAdapter.js`); gelesen werden `iqbId`, `name`, `exercise.name`, `domainLabel`, `competenceLevel`, `correctCount`, `incorrectCount`, `notAttemptedCount`, `solvers[]` und `nonSolvers[]`.
## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `onStudentSelected` | `(studentId: string) => void` | – | nein | Klick auf einen Namen im Raster |
| `glossaryKey` | `string` | – | ja | Titel, Tutorial und Leer-Meldung je View (siehe Glossar) |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `onItemSelected(payload)` | Aufruf | `{ items, mode }` oder `{ item }` anzeigen; der aktive Tab folgt `resolveActiveId` (neu hinzugekommene Aufgabe gewinnt) |
| `onStudentSelected(studentId)` | Callback | siehe Optionen |
| `getExportIdentity()` | Override | `iqbId` der aktiven Aufgabe, jede Aufgabe ist ein eigenes Exportziel |
| `getExportControlDefinition()` | Override | `null` ohne Auswahl, sonst Typ `item-detail` |
| `onThemeChanged()` | Override | Beim Wechsel des KS-Farbschemas neu rendern: die Niveaustufen-Marke trägt ihre Bandfarbe inline (`--ks-band-color` aus `createGerLevelHtml`) und bliebe sonst in der alten Palette |
