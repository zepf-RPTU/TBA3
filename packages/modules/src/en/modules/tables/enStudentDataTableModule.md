# EnStudentDataTableModule

## Zweck
Die EN-Aufgabenliste einer einzelnen Schüler:in: je Item Nummer (mit Domänen-Präfix im Modus `all`), Aufgabe, Aufgabenniveau, das Ergebnis als Symbol und die Stile. Der Domänen-Schalter filtert auf die gewählte Domäne. Zwei Presets zeigen, welche Aufgaben unterhalb der erreichten GER-Stufe nicht gelöst bzw. oberhalb davon gelöst wurden, jeweils gegen die Stufe der Person in der Domäne der Zeile. Ein Zeilenklick meldet die Aufgabe (`onItemSelected`).

## Design/Idee

Eine Abwandlung der Aufgabentabelle, bei der die Aufgaben des verwendeten Testhefts inklusive zentraler Aufgabenmerkmale gelistet werden. Anders als in der Aufgabenansicht zeigt diese Tabelle jedoch nur die Lösungen der/des ausgewählten Schüler:in.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `items` | – | `items[].iqbId`, `items[].name`, `items[].exercise.name`, `domain.id`¹ (Gruppierung für den Domänen-Modus), `domain.name`, `items[].parameters.competenceLevel.nameShort`¹, `items[].position`¹ |
| `aggregations` | `type=students` | `id`¹, `domain.id`¹ (eine Zeile ohne Domäne von `en.config` trägt keine Ergebnisse bei), `aggregations[type=result]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `includedIqbIds`¹ (nach `value` gelesen, in beliebiger Reihenfolge) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `includedIqbIds` hat die Person keine Zeilen, und die Tabelle bleibt leer. Ohne `domain.id` an einer Zeile von `items.json` weist der Store das Dokument ab (`DocumentShapeError`). Der Ergebnisfilter bietet immer alle drei Ergebnisse (✓/✗/⊘); die Presets vergleichen mit dem Code von `Richtig`.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `items` | `items[].parameters.competences[type=style].name` | Stilspalte leer, Stilfilter nur „Alle“ |
| `aggregations` (`type=students`) | `aggregations[type=style].value` aller Zeilen, in der Reihenfolge ihres ersten Auftretens | Keine Stilspalte: Stile liefern nur Domänen, die sie kennen (Hören, Lesen) |
| `competence-levels` (`type=students`) | `id` und `domain.id` der Person, `competenceLevels[0].id` und `properties[itemLevelSpan:<id>]` ihrer Zeile (die Aufgabenniveau-Plätze der erreichten GER-Stufe) | Ohne diese Spanne bleiben beide Presets leer |

Dokumente: `static documents` nennt die Datasets `en.itemRecords` (`EN_DATASETS.ITEM_RECORDS`), `en.studentRecordsById` (`EN_DATASETS.STUDENT_RECORDS_BY_ID`) und `en.config` (`EN_DATASETS.CONFIG`). `_readStudent(studentId)` baut mit `buildStudentItemRows` (`enItemDataAdapter.js`) aus `en.itemRecords` und den Ergebniscodes der Person (`itemResults` ihres Datensatzes in `en.studentRecordsById`) die Zeilen; ein Zeilenklick meldet `onItemSelected({ itemIds })`. Aus demselben Datensatz kommt außerdem je Domäne die Aufgabenniveau-Spanne der erreichten Stufe (`domains[domainId].competenceLevelItemSpan`, `readItemLevelSpan`), gegen die die Presets das Aufgabenniveau jeder Zeile vergleichen (`compareItemCompetenceLevelToReportedSpan`). Der Domänen-Modus ist ein persistenter Filter auf `domain`, also `domain.id`; die Tabelle trägt alle Zeilen der Person. Aus `en.config` liest die Tabelle `styleCategories`. Die Nummernspalte bietet die Aufgabenvorschau, wenn der Kontext `itemPreview` setzt (`{ number, title }` aus der Zeile); sonst keinen Button.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `domainMode` | `string \| Signal<string>` | `'all'` | nein | Domänen-Modus: ein Modus-Signal, dem die Tabelle über ihren `DomainModeController` folgt, oder ein fester Wert; gebaut wird für den Anfangswert |
| `onItemSelected` | `(payload: { itemIds }) => void` | – | nein | Zeilenklick, die `iqbId` der Zeile |
| `glossaryKey` | `string` | – | ja | Titel und Tutorial; die Preset-Texte liegen fest unter `en.student.student-item-table.interface` |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `static selectableRows` | Override | `1`: eine Zeile wählbar |
| `_readStudent(studentId)` | Override | Die Item-Zeilen der Person aus `en.itemRecords` und ihren `itemResults` (`buildStudentItemRows`); `reachedSpanOf` liest je Zeile die Spanne der Stufe, die die Person in der Domäne der Zeile erreicht hat, damit die Stufen-Presets in jedem Domänen-Modus stimmen |
| `_tableSpec()` | Override | Item-Spalten, Ergebnis und Stile; ein Zeilenklick gibt die Aufgabe an `onItemSelected` |
