# BaseClassTableModule

## Zweck
Gemeinsames Gerüst der Klassenübersichtstabellen von EN und MA: eine Zeile pro Schüler:in, Sortierung nach Nachname, Geschlechts- und Merkmalsfilter, Zeilenauswahl und Filterung als Hooks für die Chart-Synchronisation. Die Unterklasse liefert Spalten und Merkmalsextraktion.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../module-base/src/modules/contentModule.md)
    - [TableModule](tableModule.md)
      - **BaseClassTableModule**
        - [EnClassTableModule](../../en/modules/tables/enClassTableModule.md) — über Mixin `withDomainMode`
        - [MaClassTableModule](../../ma/modules/tables/maClassTableModule.md)

## Daten
Keine API-Daten. Die Unterklassen nennen die Felder, die ihre Spalten lesen, einschließlich derer, die diese Basis in Spalten, Sortierung, Filtern und Presets liest.

`_doRenderContent({ studentArray })` erhält die Schüler:innen-Datensätze aus dem Adapter der App. Die Basis ruft `_onBeforeRender(data)`, reicht die Datensätze durch `_preprocessData` an die Tabelle und baut die Filterlisten für Geschlecht und Merkmale aus den unverarbeiteten Datensätzen.

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_getColumns(filterParams)`, `_getTraitsAsTextFn()` | Override (abstrakt) | Spalten, Merkmalsfunktion |
| `_onBeforeRender(data)`, `_preprocessData(rows)`, `_getTableOptions()`, `_getPresets()`, `_onSelectionChanged(rows)`, `_onDataFiltered(rows, filters)`, `_onAfterTableCreated()` | Override (Hooks) | Standard: no-op, Identität, `{ selectableRows: true, selectableRowsPersistence: false }`, keine Presets |
| `_currentStudentArray`, `_selectedStudents` | Felder | Aktuelle Zeilen; ausgewählte Zeilen oder `null` (Filtern setzt zurück) |
