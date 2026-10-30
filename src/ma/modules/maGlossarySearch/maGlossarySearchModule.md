# MaGlossarySearchModule

## Zweck
Eine durchsuchbare Glossarliste: ein beschriftetes Suchfeld über allen Glossareinträgen der App mit Titel und Erklärtext, darunter je Begriff eine auf- und zuklappbare Karte (natives `<details>`/`<summary>`) mit Titel und Erklärtext, alphabetisch nach Titel. Gefiltert wird live beim Tippen über den sichtbaren Text von Titel und Erklärtext und die weiteren Namen des Begriffs (`aliases`: „Niveaustufe“ findet das Aufgabenniveau), Groß-/Kleinschreibung spielt keine Rolle. Beschriftung und Platzhalter kommen aus `ma.help.glossary`; die Trefferzahl sagt eine Live-Region an. Die Karten werden einmal gebaut, die Suche blendet sie nur aus und ein, sodass aufgeklappte Karten aufgeklappt bleiben; ohne Treffer erscheint „Keine Einträge gefunden.“ mit einem Knopf, der die Suche zurücksetzt (`clear`).

## Design/Idee

Eine Suchleiste, um Einträge innerhalb des angelegten Glossars zu suchen. Dabei handelt es sich um eine exemplarische, aber keinesfalls erschöpfende oder allgemeingültige Auswahl an Informationen und Fachbegriffen. Die entwickelnden Lehrkräfte legten jedoch Wert darauf, dass alle zum Verständnis der Ergebnisse notwendigen Informationen niedrigschwellig innerhalb der Rückmeldung aufzusuchen und zu erreichen sind.

## Daten
Keine API-Daten. Die Einträge kommen aus `context.glossary.getEntries()`; gezeigt werden nur die mit `title` und `body`.

## Optionen
Keine eigenen.

## Methoden
Keine eigenen.
