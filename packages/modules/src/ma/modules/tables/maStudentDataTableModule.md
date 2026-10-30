# MaStudentDataTableModule

## Zweck
Die MA-Aufgabentabelle einer einzelnen Schüler:in: eine Zeile je Aufgabe mit Nummer (mit Aufgaben-Vorschau), Aufgabenname, Aufgabenniveau, Ergebnis (✓ richtig, ✗ falsch, ⊘ unbearbeitet), Leitidee und je Kompetenztyp der Aufgaben einer Spalte (Allgemeine Kompetenz, Anforderungsbereich), Letztere nur bei `showCompetences`. Die Presets „Unter KS“ (nicht gelöste Aufgaben unterhalb der erreichten Kompetenzstufe) und „Über KS“ (gelöste Aufgaben oberhalb) beziehen sich auf die Stufe der gerade gezeigten Person.

## Design/Idee

Eine Abwandlung der Aufgabentabelle, bei der die Aufgaben des verwendeten Testhefts inklusive zentraler Aufgabenmerkmale gelistet werden. Anders als in der Aufgabenansicht zeigt diese Tabelle jedoch nur die Lösungen der/des ausgewählten Schüler:in.

Auch für die individuelle Aufgabentabelle der/des ausgewählten Schüler:in stehen oberhalb der Spalten-Header die üblichen Buttons zum Filtern und Modifizieren der Tabelle zur Verfügung.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `aggregations` | `type=students` | `id`¹, `aggregations[type=result]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `includedIqbIds`¹ (eine Zeile je enthaltener Aufgabe) |
| `items` | – | `items[].iqbId`, `items[].name`, `items[].exercise.name`, `domain.name` (Leitidee-Spalte und -filter), `items[].parameters.competenceLevel.nameShort`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Die Zeilen entstehen aus `includedIqbIds` der Aggregationszeilen mit der `id` der Person (Option `studentId`); ohne solche Zeilen bleibt die Tabelle leer. Eine `iqbId`, die keine Lerngruppenzeile von `items` führt, fällt weg.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `items` | `items[].parameters.competences[].type`, `.name`, `.id` (außer `type=style`) | Ohne Einträge keine Kompetenzspalten. Je `type` eine Spalte nach der Leitidee (Titel = `type`, Zelle = die `name`-Werte der Aufgabe untereinander, im Export mit „, “ verbunden), ihr Listenfilter bietet die Werte nach `id` geordnet; ein Eintrag ohne `type` oder `name` fällt weg |
| `competence-levels` (`type=students`) | `id`, `competenceLevels[0].id` und `properties[itemLevelSpan:<id>]` der Person (die Aufgabenniveau-Plätze ihrer erreichten Stufe) | „Unter KS“ und „Über KS“ bleiben leer |

Dokumente: `static documents` nennt die Datasets `ma.studentItemRows` (je Person ihre Zeilen, eine je Aufgabe), `ma.studentRecords` und `ma.competenceGroupings` (die Kompetenzspalten), alle aus `MA_DATASETS`. Aus `ma.studentRecords` liest die Tabelle nur die Aufgabenniveau-Spanne der erreichten Stufe der gezeigten Person; die Presets vergleichen das Aufgabenniveau jeder Zeile mit dieser Spanne. Die Nummernspalte bietet die Aufgabenvorschau, wenn der Kontext `itemPreview` setzt (`{ number, title }` aus der Zeile); sonst keinen Button.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `showCompetences` | `boolean \| Signal<boolean>` | `true` | nein | Ob die Kompetenzspalten sichtbar sind, als Signal oder fester Wert; jede Änderung setzt sie neu, auch über eine Wahl im Spaltenmenü hinweg |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_readStudent(studentId)` | Override | Die Aufgabenzeilen der Person aus `ma.studentItemRows`; `reachedSpanOf` nennt für jede Zeile die Aufgabenniveau-Spanne ihrer erreichten Kompetenzstufe aus `ma.studentRecords` |
| `_tableSpec()` | Override | Aufgaben-, Ergebnis- und Klassifikationsspalten, die Kompetenzspalten sichtbar nach `showCompetences`, nach Aufgabennummer sortiert |
