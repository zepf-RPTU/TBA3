# MaStudentInfoTableModule

## Zweck
Die einzeilige MA-Info-Tabelle zur gewählten Schüler:in: Geschlecht, Merkmale, „Richtig“ (Zelle „x von N“, N sind die Aufgaben im Testheft der Person, Unbearbeitet eingeschlossen) und Kompetenzstufe, ohne Sortierung, Filter oder Presets. Die Spalten sind so breit wie ihr Inhalt (`static layout = 'fitDataFill'`), damit die Tabelle schmal bleibt.

## Design/Idee

Ein einzeiliger Ausschnitt aus der Lerngruppentabelle, welcher die Merkmale und das Gesamtergebnis der/des ausgewählten Schüler:in zeigt.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=students` | `id`¹ (findet die Person) |

¹ In der Spezifikation optional, für dieses Modul Pflicht.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `aggregations` (`type=students`) | `id`, `aggregations[type=result]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `descriptiveStatistics.frequency` (je Person über alle Zeilen summiert) | „Richtig“ zeigt 0 ohne N |
| `competence-levels` (`type=students`) | `competenceLevels[0].nameShort` (die Stufe der Person) | Spalte „Kompetenzstufe“ zeigt „–“ |
| `competence-levels` (`type=students`) | `covariates[gender]` | Zelle „Geschlecht“ leer |
| `competence-levels` (`type=students`) | `covariates[trait]` | Spalte „Merkmale“ zeigt „–“ mit Tooltip `general.messages.no-traits` |

Dokumente: `static documents` nennt die Datasets `ma.studentRecords`, das `_readStudentRecords()` liest, und `ma.traitLabels` (die Payload-Beschriftung der Merkmale, die das Glossar nicht kennt), beide aus `MA_DATASETS`.

## Optionen
Keine eigenen; `studentId` ist die der Basis [baseStudentInfoTableModule.md](../../../common/tables/baseStudentInfoTableModule.md).

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_readStudentRecords()` | Override | Die Schüler:innen-Datensätze `ma.studentRecords` aus dem Store |
| `_getColumns()` | Override | Geschlecht, Merkmale, „Richtig“, Kompetenzstufe, alle ohne Sortierung und Filter |
