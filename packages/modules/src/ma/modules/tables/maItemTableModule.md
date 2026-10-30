# MaItemTableModule

## Zweck
Die MA-Aufgabenübersichtstabelle: eine Zeile je Aufgabe mit Nummer (mit Aufgaben-Vorschau), Aufgabenname, Aufgabenniveau, Verteilungsbalken (richtig | unbearbeitet | falsch) mit Pilotierungsmarke, der Pilotierungs-Spalte, Leitidee und je Kompetenztyp der Aufgaben einer Spalte (Allgemeine Kompetenz, Anforderungsbereich), Letztere nur bei `showCompetences`, dazu die geteilten Presets „Stärkste 5“, „Schwächste 5“ und „Hohe Nichtbearbeitung“.

## Design/Idee

Die Tabelle stellt die Ergebnisse der Lerngruppe auf Aufgabenebene umfassend und erschöpfend dar. Aus der Sorge, den individuellen Bedürfnissen von Lehrkräften mit keiner Vorauswahl vollständig gerecht werden zu können, entschied sich die Entwicklungsgruppe stattdessen für eine Abbildung aller Daten, welche aber in der weiteren Betrachtung schnell und einfach auf individuelle Interessen zugeschnitten werden kann. Filtern und Sortieren funktioniert wie in gängigen Softwarelösungen, außerdem können Spalten der Tabelle ausgeblendet werden. Die Tabelle soll der Lehrkraft u.a. helfen, Erwartungen abzugleichen, auffällige Aufgaben zu identifizieren oder erzielte Ergebnisse schnell in Bezug zu den objektiven Erwartungen, etwa Lösungshäufigkeiten aus Pilotstudien oder dem allgemeinen Niveau der Aufgaben, zu setzen. Geplant war außerdem eine direkte Verlinkung der Aufgaben bzw. des zugehörigen Materials selbst; die Entwicklungsgruppe ging davon aus, dass über die Betrachtung der eigentlichen Testaufgabe den meisten Lehrkräften ein schneller Zugang zu den zugrundeliegenden Inhalten gelingt und didaktische Implikationen abgeleitet werden können. Die Anbindung von Material konnte allerdings im Zuge des Projekts nicht abgeschlossen werden; die Schaltfläche „Aufgabe ansehen“ öffnet bislang nur eine Vorschau mit Platzhaltern.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `items` | – | `items[].iqbId`, `items[].name`, `items[].exercise.name`, `items[].descriptiveStatistics.mean` (nur die Differenz der Pilotierungs-Spalte), `domain.name` (Leitidee-Spalte und -filter), `items[].parameters.competenceLevel.nameShort`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `aggregations` (`type=items`, `aggregation=result`) | `id` (die `iqbId` des Items), `aggregations[type=result]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `descriptiveStatistics.frequency`, `.total` | Die Zeile findet keine Zählung: alle Zähler stehen auf 0 und die drei Anteile fehlen (`null`). Der Verteilungsbalken zeigt statt der Segmente „Keine Daten“ (`general.messages.no-data-short`), ohne Tooltip und ohne Pilotierungsmarke; die Presets finden für die Zeile keinen Anteil |
| `items` | `items[].parameters.competences[].type`, `.name`, `.id` (außer `type=style`) | Ohne Einträge keine Kompetenzspalten. Je `type` eine Spalte nach der Leitidee (Titel = `type`, Zelle = die `name`-Werte der Aufgabe untereinander, im Export mit „, “ verbunden), ihr Listenfilter bietet die Werte nach `id` geordnet; ein Eintrag ohne `type` oder `name` fällt weg |
| `items` | `items[].parameters.solutionFrequencyGymnasium`, `…NonGymnasium`, `…PrimarySchool` (der erste vorhandene zählt) | Pilotierungsspalte „–“, keine Referenzlinie im Balken, leere Exportspalten |

Dokumente: `static documents` nennt die Datasets `ma.itemRecords` und `ma.competenceGroupings` (die Kompetenztypen und ihre Werte, aus denen die Kompetenzspalten entstehen), beide aus `MA_DATASETS`. Alle drei Anteile des Balkens sind Zählungen der Item-Aggregation über ihr `total`; `mean` geht nur in die Differenz der Pilotierungs-Spalte ein. Einen Payload liest die Tabelle nicht. Die Nummernspalte bietet die Aufgabenvorschau, wenn der Kontext `itemPreview` setzt (`{ number, title }` aus der Zeile); sonst keinen Button.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `showCompetences` | `boolean \| Signal<boolean>` | `true` | nein | Ob die Kompetenzspalten sichtbar sind, als Signal oder fester Wert; jede Änderung setzt sie neu, auch über eine Wahl im Spaltenmenü hinweg |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_readItems()` | Override | Die Aufgaben-Datensätze `ma.itemRecords` aus dem Store |
| `_getColumns(resultColumns)` | Override | Nummer, Aufgabe, Aufgabenniveau, die Ergebnisspalten (Verteilung, Pilotierung), Leitidee, die Kompetenzspalten |
