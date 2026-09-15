# BaseItemTableModule

## Zweck
Gemeinsames Gerüst der Aufgabenübersichtstabellen von EN und MA: eine Zeile pro Aufgabe, Sortierung nach Aufgabennummer, Mehrfeld-Sortierung der Lösungsbalken und der Pilotierungsspalte, wiederaufbaubare Tabelle für Optionen, die Tabulator nur beim Bau annimmt (EN-Aufgabengruppierung). Stellt außerdem die drei gemeinsamen Presets „Stärkste 5“, „Schwächste 5“ und „Hohe Nichtbearbeitung“ bereit.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../module-base/src/modules/contentModule.md)
    - [TableModule](tableModule.md)
      - **BaseItemTableModule**
        - [EnItemTableModule](../../en/modules/tables/enItemTableModule.md) — über Mixin `withDomainMode`
        - [MaItemTableModule](../../ma/modules/tables/maItemTableModule.md)

## Daten
Keine API-Daten. Die Unterklassen nennen die Felder, die ihre Spalten lesen, einschließlich derer, die diese Basis in Spalten, Sortierung, Filtern und Presets liest.

`_doRenderContent({ itemsData })` erhält die Aufgabendatensätze aus dem Adapter der App, legt sie per `setData` ab und reicht sie durch `_preprocessItemData` an die Tabelle (`_createItemTable`).

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_createItemTable(rows, filterSourceData?)` | Helfer | Tabelle (neu) bauen; `filterSourceData` liefert die Werte der Filterlisten, wenn die Zeilen ein Baum sind |
| `_getColumns(processedData)` | Override (abstrakt) | Spalten |
| `_preprocessItemData(items)`, `_getTableOptions()`, `_getPresets()`, `_onAfterTableCreated()` | Override (Hooks) | Standard: Identität, `{ selectableRows: false }`, keine Presets, no-op |
