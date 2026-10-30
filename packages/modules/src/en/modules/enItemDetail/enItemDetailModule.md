# EnItemDetailModule

## Zweck
Die Statistikkarte zu einer Aufgabe im EN-Dashboard: eine Zeile benennt die Aufgabe („H-1.1 – Bezeichnung“), darunter „Leistung“ (Lösungsquote, Richtig, Falsch, Unbearbeitet, Gesamt Schüler:innen, Pilotierung mit Differenz) und die Namen der Schüler:innen, die die Aufgabe gelöst bzw. nicht gelöst haben (umschaltbar, Standard ist die kleinere Gruppe). Domäne, Aufgabenniveau und Stile zeigt die Tabellenzeile, den Inhalt der Aufgabe die Aufgabenvorschau – die Karte wiederholt beides nicht. Mehrere Aufgaben zeigt sie als Tab-Leiste im Untertitel-Slot, eine einzelne ohne Tabs. Ein Klick auf einen Namen wählt diese Person aus.

## Design/Idee

Der seitlich platzierte Kasten neben der Tabelle bietet Platz für zusätzliche Informationen zur jeweils ausgewählten Aufgabe. Hier war aus Sicht der entwickelnden Lehrkräfte ursprünglich geplant, erweiterte Aufgabeninformationen, etwa aus dem Aufgabenbrowser des ISQ einzubinden. Bislang zeigt der Kasten die Leistungsdaten der Lerngruppe zur Aufgabe (Lösungsquote, richtig/falsch/unbearbeitet, Pilotierungswert). Hervorzuheben ist eine Auflistung der SuS, die die ausgewählte Aufgabe korrekt bzw. nicht korrekt beantwortet haben – auf diesem Weg sollen Lehrkräfte ebenfalls in der Lage sein, ggf. eine differenzierte Betrachtung der eigenen Lerngruppe abzuleiten.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `items` | – | `items[].iqbId`, `items[].name`, `items[].exercise.name`, `domain.id`¹, `domain.name` |
| `aggregations` | `type=students` | `properties[firstName]`¹, `properties[lastName]`¹ (das Namensraster) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `domain.id` an einer Zeile von `items.json` weist der Store das Dokument ab (`DocumentShapeError`).

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `aggregations` (`type=items`) | `id` (die `iqbId` des Items), `aggregations[type=result]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `descriptiveStatistics.frequency`, `.total` | „Richtig“, „Falsch“, „Unbearbeitet“ und „Gesamt Schüler:innen“ stehen auf 0, „Lösungsquote“ zeigt „–“; ohne `total` ebenso „Gesamt Schüler:innen“ 0 und „–“, ein fehlender Eintrag zählt 0 |
| `aggregations` (`type=students`) | `id`, `aggregations[type=result]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` (nach `value` gelesen, in beliebiger Reihenfolge) | Keine Namenslisten. Gelöst hat, wer im `Richtig`-Eintrag steht |
| `items` | `items[].parameters.solutionFrequencyGymnasium`, `…NonGymnasium`, `…PrimarySchool` (der erste vorhandene zählt) | Keine Zeile „Pilotierung“ |
| `aggregations` (`type=students`) | `aggregations[type=result].includedIqbIds` | Beide Namenslisten leer (0 / 0); beide sagen `messages.no-student-data` statt ihrer eigenen Leer-Meldung |

Texte: Überschrift und Zeilen von „Leistung“, den Namen des Gruppenumschalters und den zugänglichen Namen eines Namensknopfs liest die Karte aus dem gemeinsamen Glossar (`general.result-rows`, `general.student-groups`). Aus ihrem eigenen (`enItemDetail.glossary.json`, unter `en.item-detail`) kommen die Knöpfe des Gruppenumschalters (`interface.solved-group` / `interface.unsolved-group`), die Überschriften und Leer-Meldungen der Namenslisten sowie „nicht bearbeitet“ (`messages.not-attempted-flag`, auch die Legende unter der Liste: „* nicht bearbeitet“) aus `messages`.

Dokumente: `static documents` nennt das Dataset `en.itemRecordsById` (`EN_DATASETS.ITEM_RECORDS_BY_ID`, der Index nach `iqbId` über `en.itemRecords`). Payload: keiner; die Auswahl kommt als `onItemSelected({ itemIds })`; die Tabs folgen ihrer Reihenfolge. Die Karte löst die IDs beim Render selbst gegen diesen Index auf (`getRecordsByIds`); eine unbekannte ID fällt weg.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `onStudentSelected` | `(studentId: string) => void` | – | nein | Klick auf einen Namen im Raster |
| `glossaryKey` | `string` | – | ja | Titel, Tutorial und Leer-Meldung dieser Instanz (siehe Glossar) |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `onItemSelected({ itemIds })` | Aufruf | Die Aufgaben dieser IDs anzeigen (leer räumt die Karte), in Titelzeile und Tabs mit Domänen-Präfix (`H-01`), gleich in welchem Modus die Tabelle steht; der aktive Tab folgt `resolveActiveId` (neu hinzugekommene Aufgabe gewinnt) |
| `getExportIdentity()` | Override | `iqbId` der aktiven Aufgabe, jede Aufgabe ist ein eigenes Exportziel |
| `_getExportType()` | Override | `null` ohne Auswahl, sonst `'visual'` |
