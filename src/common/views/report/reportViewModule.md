# ReportViewModule

## Zweck
Die View „Bericht“, in der der Sammelexport angeordnet wird – gemeinsam für EN, MA und SL. Jedes für den Sammelexport markierte Modul wurde beim Markieren als Bild festgehalten; diese View zeigt die Bilder als Karten auf den A4-Seiten, auf denen sie gedruckt werden: `planReportPages()` fasst sie zu Zeilenbändern zusammen und packt die Bänder auf Seiten, und dieselben Bänder gehen beim Export an `pdfComposer.addBands()` – die Vorschau ist das Dokument, Seitenumbrüche eingeschlossen. Karten lassen sich per Pfeil-Buttons oder Drag-Griff umsortieren, in vier Breiten (1/1, 2/3, 1/2, 1/3) setzen und entfernen; die Toolbar bietet Zoomstufen (Seite, Breite, 100 %, 50 %), „Als PDF exportieren“ und „Auswahl leeren“. Bilder statt lebender Module, damit eine Karte nichts von der View braucht, die sie erzeugt hat, und der Bericht einen Reload überlebt.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../modules/baseViewModule.md)
    - **ReportViewModule**

## Kinder
Keine Kindmodule. Die Karten sind vom View selbst gebaute `article.report-card`-Elemente in einem positionierten Container (`.report-pages`), platziert per Inline-Geometrie über den gesamten Seitenstapel; die Seitenblätter (`.report-sheet`) liegen als Ebene dahinter. Knoten werden bei einer Umsortierung nie bewegt, nur ihre Geometrie ändert sich (dekodierte Bilder und Fokus bleiben erhalten). Die Tab-Reihenfolge ist die Einfügereihenfolge; die Auf/Ab-Buttons sind der Tastaturweg, der Drag-Griff der Zeigerweg. Die Karten-Toolbar ist eine Enthüllung, keine Hervorhebung: ein Zeiger mit `:hover` deckt sie beim Überfahren auf, ohne `:hover` tut es ein Tipp auf die Karte (`.is-active`, `#activeId`) – und immer nur bei einer Karte. Die Toolbar ist rund doppelt so breit wie eine halbe Karte und `.report-card` bildet im Ruhezustand keinen Stacking-Kontext, also entschiede bei mehreren aufgedeckten Toolbars die DOM-Reihenfolge, welche einen Tipp abfängt – und die weicht durch `#applyOrder` bewusst von der sichtbaren Reihenfolge ab. Der letzte Toolbar-Button entfernt die Karte aus dem Bericht.

## Daten
Keine API-Daten. `_renderView` ignoriert den App-Payload; `#refresh()` liest den Warenkorb (`exportImageStore.list()`, `exportSelectionManager.getPersistedSelectedIds()`) und das gespeicherte Layout (`loadReportLayout(appId)`, für neue Karten gemischt mit der View-Reihenfolge aus `viewConfig`). Jede Karte zeigt ein `StoredExportImage` (Blob, Quell-View, Datensatz-Label, Aufnahmezeit, Maße); der PDF-Export leert den Warenkorb erst nach erfolgreichem `save()`.

## Zustand
Keine App-State-Schlüssel beobachtet. Statt dessen abonniert die View `exportSelectionManager.on('selectionChanged')` (Refresh, solange nicht suspendiert) und beobachtet die Größe von `.report-scroll` über den `resizeService` (Neulayout der Fit-Zoomstufen); `onResume()` leert den Hinweis und refresht, damit Karten ankommen, die in einer anderen View markiert wurden.

## Verdrahtung
Keine Geschwister-Verdrahtung. Eingaben laufen als delegierte Klicks über `data-report-zoom`, `data-report-action` (`export`, `clear`) und `data-report-card-action` (`up`, `down`, `span`, `remove`); das Ziehen läuft über Pointer-Events (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`) am Griff `.report-card-handle`; Entfernen und Leeren gehen über `exportSelectionManager.deselect`/`clearSelection`, deren `selectionChanged` den Refresh auslöst.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `viewConfig` | `{[view]: {label?}}` | `{}` | nein | `viewConfig`-Map der App (von `getViewModuleOptions`): View-Labels für die Kartenbeschriftung und Sidebar-Reihenfolge als Anfangsreihenfolge neuer Karten |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Toolbar, Hinweis, Leerzustand und Seitencontainer bauen, Listener anmelden, ersten Refresh abwarten |
| `onResume()` | Override | Hinweis leeren und Warenkorb neu lesen |
| `destroy()` | Override | Laufenden Drag abbrechen, Object-URLs freigeben, Karten- und Blattlisten leeren, aufgedeckte Karte vergessen, dann Basis |
