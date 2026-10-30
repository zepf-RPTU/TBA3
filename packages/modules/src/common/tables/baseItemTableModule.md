# BaseItemTableModule

## Zweck
Gemeinsames Gerüst der Aufgabenübersichtstabellen: eine Zeile pro Aufgabe, Sortierung nach Aufgabennummer, Mehrfeld-Sortierung der Lösungsbalken und der Pilotierungsspalte. Stellt außerdem die drei gemeinsamen Presets „Stärkste 5“, „Schwächste 5“ und „Hohe Nichtbearbeitung“ bereit.

## Daten
Keine API-Daten. Die Unterklassen nennen die Felder, die ihre Spalten lesen, einschließlich derer, die diese Basis in Spalten, Sortierung, Filtern und Presets liest.

`_renderBody()` nimmt keinen Payload: es holt die Aufgabendatensätze über den Hook `_readItems()` aus dem `DocumentStore` und baut die Tabelle aus den Spalten (`_getColumns(resultColumns)`) mit einer Zeile je Datensatz. Die Unterklasse nennt in `static documents`, was ihr Lesehook braucht.

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_getColumns(resultColumns)` | Override (abstrakt) | Alle Spalten: die beschreibenden, dazwischen die gemeinsamen Ergebnisspalten (Verteilung, Pilotierung und ihre Exportspalten), die die Basis übergibt |
| `_readItems()` | Override (abstrakt) | Aufgabendatensätze aus `documents`, einer je Aufgabe |
| `_getPresets()` | Override | Die drei gemeinsamen Presets `best-five`, `worst-five`, `incomplete` |
