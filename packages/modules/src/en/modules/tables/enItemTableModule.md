# EnItemTableModule

## Zweck
Die EN-Aufgabentabelle: eine Zeile je Item mit Nummer (im Modus `all` mit Domänen-Präfix `H-01`), Aufgabe, Aufgabenniveau, der Verteilungsleiste der Lerngruppe, dem Pilotierungswert und den Stilen. Zeilen sind mehrfach auswählbar. Der Domänen-Schalter setzt einen persistenten Filter (`_setPersistentFilter`) auf die Domänen-ID der Zeile. Die Tabelle meldet angezeigte Zeilen und Auswahl als ID-Listen (`onDataSync`, `onItemSelected`).

## Design/Idee

Die Tabelle stellt die Ergebnisse der Lerngruppe auf Aufgabenebene umfassend und erschöpfend dar. Aus der Sorge, den individuellen Bedürfnissen von Lehrkräften mit keiner Vorauswahl vollständig gerecht werden zu können, entschied sich die Entwicklungsgruppe stattdessen für eine Abbildung aller Daten, welche aber in der weiteren Betrachtung schnell und einfach auf individuelle Interessen zugeschnitten werden kann. Filtern und Sortieren funktioniert wie in gängigen Softwarelösungen, außerdem können Spalten der Tabelle ausgeblendet werden. Die Tabelle soll der Lehrkraft u.a. helfen, Erwartungen abzugleichen, auffällige Aufgaben zu identifizieren oder erzielte Ergebnisse schnell in Bezug zu den objektiven Erwartungen, etwa Lösungshäufigkeiten aus Pilotstudien oder dem allgemeinen Niveau der Aufgaben, zu setzen. Geplant war außerdem eine direkte Verlinkung der Aufgaben bzw. des zugehörigen Materials selbst; die Entwicklungsgruppe ging davon aus, dass über die Betrachtung der eigentlichen Testaufgabe den meisten Lehrkräften ein schneller Zugang zu den zugrundeliegenden Inhalten gelingt und didaktische Implikationen abgeleitet werden können. Die Anbindung von Material konnte allerdings im Zuge des Projekts nicht abgeschlossen werden; die Schaltfläche „Aufgabe ansehen“ öffnet bislang nur eine Vorschau mit Platzhaltern.

Auswahl, Filter und Sortierung gehen als ID-Listen hinaus, die Empfänger lösen die Datensätze selbst auf. Beide Meldungen hängen an einem Hook (`_onDisplayedRowsChanged`): nach dem Aufbau und nach jeder Sortier-, Auswahl- oder Filteränderung bekommt `onDataSync` die ausgewählten Zeilen, sonst alle angezeigten, in Anzeigereihenfolge (eine Sortierung ordnet also auch eine Auswahl neu), `onItemSelected` die Auswahl; ein Filter hat die Auswahl schon geleert und meldet so eine leere.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `items` | – | `items[].iqbId`, `items[].name`, `items[].exercise.name`, `items[].descriptiveStatistics.mean`, `domain.id`¹, `domain.name`, `items[].parameters.competenceLevel.nameShort`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `domain.id` an einer Zeile von `items.json` weist der Store das Dokument ab (`DocumentShapeError`). Der Domänenfilter vergleicht die `domain.id` der Zeile mit dem Modus.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `aggregations` (`type=items`) | `id` (die `iqbId` des Items), `aggregations[type=result]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `descriptiveStatistics.frequency`, `.total` | Ohne Datensatz für das Item oder ohne `total` leere Verteilungsleiste und Anzahlen 0; ein fehlender Eintrag zählt 0 (sein Segment 0 %) |
| `items` | `items[].parameters.competences[type=style].name` | Stilspalte leer, Stilfilter nur „Alle“; ein Eintrag ohne `name` fällt weg |
| `items` | `items[].parameters.solutionFrequencyGymnasium`, `…NonGymnasium`, `…PrimarySchool` (der erste vorhandene zählt) | Pilotierungsspalte „–“, keine Referenzlinie im Balken, leere Exportspalten |
| `aggregations` (`type=students`) | `aggregations[type=style].value` aller Zeilen, in der Reihenfolge ihres ersten Auftretens | Keine Stilspalte: Stile liefern nur Domänen, die sie kennen (Hören, Lesen) |

Dokumente: `static documents` nennt die Datasets `en.itemRecords` (`EN_DATASETS.ITEM_RECORDS`; `style` ist dort schon in Kategorienreihenfolge sortiert) und `en.config` (`EN_DATASETS.CONFIG`). Payload: keiner; `_readItems()` liest die Datensätze aus `en.itemRecords`; aus `en.config` liest sie `styleCategories`. Die Verteilungsleiste liest alle drei Anteile aus der Item-Aggregation (`correctCount / total` usw.), damit ihre Segmente dieselben Antworten aufteilen; ohne Antworten zum Item sind alle drei `null`, und die Leiste bleibt leer. `items[].descriptiveStatistics.mean` trägt nur das Δ zur Pilotierung. Die Nummernspalte bietet die Aufgabenvorschau, wenn der Kontext `itemPreview` setzt (`{ number, title }` aus der Zeile); sonst keinen Button.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `domainMode` | `string \| Signal<string>` | `'all'` | nein | Domänen-Modus: ein Modus-Signal, dem die Tabelle über ihren `DomainModeController` folgt, oder ein fester Wert; gebaut wird für den Anfangswert |
| `onDataSync` | `(data) => void` | – | nein | `{ ids }`: die ausgewählten sichtbaren Zeilen, sonst alle sichtbaren, in Anzeigereihenfolge |
| `onItemSelected` | `(payload: { itemIds }) => void` | – | nein | `{ itemIds }`: die ausgewählten Zeilen in Auswahlreihenfolge |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `static selectableRows` | Override | `true`: mehrere Zeilen wählbar, die Auswahl öffnet die Aufgabendetails |
| `_readItems()` | Override | Die Datensätze aus `en.itemRecords` |
| `_onDisplayedRowsChanged({ rows, selected })` | Override | Ruft `onDataSync` und `onItemSelected` mit den angezeigten Zeilen und der Auswahl |
| `getExportIdentity()` | Override | Der Domänen-Modus |
