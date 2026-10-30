# ReportViewModule

## Zweck
Die View „Bericht“, in der der Sammelexport angeordnet wird. Jedes für den Sammelexport markierte Modul wurde beim Markieren als Bild festgehalten; diese View zeigt die Bilder als Karten auf den A4-Seiten, auf denen sie gedruckt werden: `planReportPages()` fasst sie zu Zeilenbändern zusammen und packt die Bänder auf Seiten, und dieselben Bänder gehen beim Export an `pdfComposer.addBands()`. Karten lassen sich per Pfeil-Buttons oder Drag-Griff umsortieren, in vier Breiten (1/1, 2/3, 1/2, 1/3) setzen und entfernen; die Toolbar bietet Zoomstufen (Seite, Breite, 100 %, 50 %), „Als PDF exportieren“ und „Auswahl leeren“. Bilder statt lebender Module, damit eine Karte nichts von der View braucht, die sie erzeugt hat, und der Bericht einen Reload überlebt.

## Design/Idee

Obgleich die Rückmeldungen primär als digitale und interaktive Oberfläche konzipiert sind, bestanden die Lehrkräfte auf der Notwendigkeit, analoge bzw. statische Dokumente zur Weiterarbeit bzw. Kommunikation zur Verfügung zu haben. Die Berichtsfunktion erlaubt es, alle innerhalb der Rückmeldung verwendeten Inhalte und Module für den gesammelten Export innerhalb eines PDFs zusammenzustellen. Das Interface erlaubt bei der Zusammenstellung verschiedener Inhalte zusätzlich rudimentäre Anpassungen des Layouts. Ziel ist die niedrigschwellige Bereitstellung einer benutzerdefinierten „offline“-Rückmeldung oder aber die Extraktion ausgewählter Darstellungen zum Zweck der schulischen Weiterarbeit, als Begleitmaterial für Gespräche oder für die Einbindung in schulinterne Präsentationen.

Die Vorschau ist das Dokument: Vorschau und PDF lesen dieselben Bänder aus `reportLayout.js`, deshalb gibt es keine zweite Geometrie, die abweichen könnte. Die View ändert die Reihenfolge, auf einem Weg für Pfeil-Buttons und Drag; `ReportCardDrag` kennt nur den Zeiger und verschiebt über den Host. Reihenfolge und Breiten gehören dem Warenkorb: `context.exportCart.readReport()` liefert den Bericht, `arrange()` speichert jede Änderung. Ob Warenkorb und Bildspeicher übereinstimmen, klärt `readReport()`; die View zeigt nur, was zurückkommt. Meldungen (PDF gespeichert, verworfene Markierungen) laufen als Toasts, nicht über eine eigene Zeile.

## Kinder
Keine Kindmodule. Die View ist ein lit-html-Template über ihrem Zustand (Einträge, Zoom, aktive und gezogene Karte, berechnete Geometrie); jede Änderung rendert neu und patcht das Vorhandene. Die Karten (Listeneinträge, `role=listitem`) stehen in Einfügereihenfolge, geschlüsselt nach Id und Aufnahmezeit (eine Neuaufnahme ist eine neue Karte); beim Umsortieren ändert sich nur ihre Platzierung, sodass Bilder, Fokus und ein laufendes Ziehen erhalten bleiben. Die Tab-Reihenfolge ist die Einfügereihenfolge; die Auf/Ab-Buttons sind der Tastaturweg, der Drag-Griff der Zeigerweg. Die Karten-Toolbar ist im Ruhezustand verdeckt: ein Zeiger deckt sie beim Überfahren auf, ohne Hover ein Tipp auf die Karte, immer nur bei einer Karte. Der letzte Toolbar-Button entfernt die Karte aus dem Bericht.

## Daten
Keine API-Daten. `_renderView` bekommt keinen Payload und liest den `DocumentStore` nicht; jeder Refresh liest den Bericht des Warenkorbs (`context.exportCart.readReport(viewOrder)`: jede Markierung mit Breite und Bild, in Berichtsreihenfolge; dabei löscht der Warenkorb Bilder ohne Markierung und verwirft Markierungen ohne Bild – die View meldet deren Zahl als bleibenden Toast; neue Karten reiht er in der View-Reihenfolge aus `viewConfig` an). Reihenfolge und Breiten liegen mit den Markierungen in einem Datensatz dieses Tabs im `sessionStorage`, sodass ein zweiter Tab ihn nicht überschreibt und Entfernen oder Leeren die Anordnung mitnimmt. Jede Karte zeigt ein `StoredExportImage` (Blob, Quell-View, Datensatz-Label, Aufnahmezeit, Maße).

## Zustand
Keine App-State-Schlüssel beobachtet. Statt dessen folgt die View dem Warenkorb-Signal `context.exportCart.selection` über `watch()` (Refresh bei jeder Änderung; solange die View suspendiert ist, stellt `watch` die Änderung zurück und liefert sie beim Fortsetzen, damit Karten ankommen, die in einer anderen View markiert wurden) und beobachtet die Größe ihres Scrollbereichs über den `resizeService` (Neulayout der Fit-Zoomstufen).

## Verdrahtung
Keine Geschwister-Verdrahtung. Intern:

- Toolbar: Zoomstufen, PDF-Export (`exportReportPdf()` aus `reportLayout.js`, aus denselben Bändern wie die Vorschau, mit den gespeicherten Bildern) und „Auswahl leeren“ (nach Bestätigung `context.exportCart.clear`).
- Karten-Buttons (nach oben, nach unten, Breite, Entfernen) wirken über `context.exportCart.arrange` bzw. `remove`. Oben/Unten sind am Rand `aria-disabled` statt `disabled`, damit der Fokus auf der bewegten Karte bleibt, und eine Statuszeile (`role="status"`) nennt die neue Position; nach dem Entfernen erhält der Entfernen-Button der nachrückenden Karte den Fokus.
- Ziehen am Griff (nur Zeiger, `aria-hidden`) wertet `ReportCardDrag` (`reportCardDrag.js`) aus: ein Abbruch setzt die Karte zurück, Loslassen speichert.

Jede Änderung des Warenkorbs (`selection`) löst den Refresh aus.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `viewConfig` | `{[view]: {label}}` | – | ja | `viewConfig`-Map der App (die Basis gibt sie jeder View mit): View-Labels für die Kartenbeschriftung (ohne Label, wenn die App die View nicht mehr hat) und Sidebar-Reihenfolge als Anfangsreihenfolge neuer Karten |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Toolbar, Leerzustand und Seitencontainer bauen, Listener anmelden, ersten Refresh abwarten |
