# ChartHostModule + simpleCompetenceLevelBarConfig

## Zweck
Der einzeilige MA-Kompetenzstufen-Balken: ein horizontal gestapelter Balken mit dem Anteil (und der Anzahl) der Schüler:innen je Kompetenzstufe der Lerngruppe. Ein Klick auf ein Segment meldet dessen Stufe (`onLevelToggled`); hervorgehoben ist, was `updateHighlight` setzt, nie die Klickstufe von selbst. Die Karte ist klappbar und startet aufgeklappt.

## Design/Idee

Eine vereinfachte Version des Balkendiagramms der Übersichtsansicht, welche ausschließlich die eigene Lerngruppe zeigt. Die Graphik dient als Ergänzung zur darunterliegenden Tabelle und interagiert mit dieser; so können SuS einer Kompetenzstufe durch Anklicken des zugehörigen Bereichs im Schaubild automatisch innerhalb der Tabelle gefiltert werden.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | – | `type`¹ (die Lerngruppenzeile ist die mit `type=group`); von ihr `name` (Zeilenbeschriftung, Tooltip-Titel), `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.mean` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne Lerngruppenzeile bleibt der Balken leer (Hinweis „keine Daten“ statt Diagramm). Mit `total` rechnet der Balken die Anteile aus `frequency / total`, nicht aus `mean`, das der Server auf vier Stellen rundet; eine Lerngruppe mit `total` 0 hat keine Anteile.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` | `competenceLevels[].descriptiveStatistics.total`, `.frequency` der Lerngruppenzeile | Ohne `total` Segmentbreite aus `mean`, Tooltip ohne Anzahl, die Beschriftung zeigt `frequency` (fehlt sie, 0); mit `total`, aber ohne `frequency` steht die Stufe auf 0 % |

Dokumente: der Descriptor nennt in `documents` `competence-levels.json`. `createRenderer` nimmt die Zeile mit `type=group`, formt sie mit `parseCompetenceLevels` (`competenceLevelAdapter.js`) zu Segmenten je Kompetenzstufe und reicht diese an einen `StripBarChart` (`common/charts/stripBar/`). Jedes Segment trägt seine Anzahl (Beschriftung `III · 36 % (9)`) und seinen Tooltip: die Lerngruppe als Titel, darunter Stufe, Anteil und Anzahl.

Datentabelle: die Tabelle ist die `dataTable()` des `StripBarChart`: eine Zeile, die Lerngruppe (`rowLabel`), mit je Stufe Anteil und Anzahl (`15,4 % (4)`).

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `onLevelToggled` | `(level: string) => void` | – | nein | Segment-Klick mit der Stufe des Segments; der Balken hebt erst hervor, was `updateHighlight` zurückmeldet |
| `collapsible` | `boolean` | `true` | nein | Karte klappbar |
| `showModuleTitle` | `boolean` | `true` | nein | Descriptor-Defaults für den Host |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `updateHighlight(levels)` | Aufruf | Die hervorgehobenen Stufen setzen, leer löscht; schreibt das Host-Signal `highlightedLevels`, das der Balken teilt: das lebende Diagramm zeichnet neu, ein neu gebautes startet damit |
