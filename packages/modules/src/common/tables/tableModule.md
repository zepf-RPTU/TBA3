# TableModule

## Zweck
Basis aller Tabellenkarten: erzeugt Tabulator-Tabellen in der Karte, verwaltet Presets (Schnellfilter-Buttons), den Spaltensichtbarkeits- und den Filter-Dropdown in der Toolbar, reaktiven Zustand (`setState`/`getState`), das Unterdrücken von Tabulator-Ereignissen, Redraws beim Sichtbarwerden sowie das Settle-Versprechen für die Skeleton-Freigabe der View. Konkrete Tabellen erben von den vier `Base*TableModule` oder von `SlBaseTableModule`.

## Design/Idee
Reaktiver Zustand: `TableModule` verwendet denselben `reactiveStateMixin` (`applyReactiveState`) wie der `ChartRenderer`, also `setState()`/`getState()` mit Änderungserkennung. Unterklassen ergänzen ihre Keys nach `super()` + `setDefaults()` in `this._state` (etwa `Object.assign(this._state, { vizMode: VIZ_MODES.STACKED_BAR })`); Formatter lesen den Zustand direkt über `this._state`, und `setState()` verteilt die geänderten Keys an `_onStateChanged(changedKeys)`. EN- und SL-Tabellen verdrahten Ereignis → Zustand → aufgeschobener Hook nicht von Hand, sondern über den Mixin `withTableModeState` (`stateKey`, `initialValue`, `applyHookName`): SL schaltet so `vizMode`, EN den Domänen-Modus `mode`.

Build-Guard: Während `createTable()` bleibt `isInitialBuild` wahr, bis das `tableBuilt`-Ereignis gefeuert und der erste Redraw abgeschlossen ist. Handler für `dataFiltered`/`dataSorted` prüfen das Flag (`if (this.isInitialBuild) return;`), damit der Aufbau keine Sync-Ereignisse doppelt auslöst.

Die Export-Steuerung gehört ContentModule, nicht TableModule; `TableModule` liefert nur die Typ-Angabe `table`.

## Klassenhierarchie
- [BaseModule](../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../module-base/src/modules/contentModule.md)
    - **TableModule**
      - [BaseClassTableModule](baseClassTableModule.md)
      - [BaseItemTableModule](baseItemTableModule.md)
      - [BaseStudentDataTableModule](baseStudentDataTableModule.md)
      - [BaseStudentInfoTableModule](baseStudentInfoTableModule.md)
      - [SlBaseTableModule](../../sl/modules/tables/slBaseTableModule.md)

## Daten
Keine API-Daten. `createTable({ containerId, columns, data, … })` nimmt Zeilen als Array von Objekten; `headerFilter*`-Angaben der Spalten landen nicht im Spaltenkopf, sondern als Descriptoren im Filter-Dropdown. Welche Felder die Zeilen tragen, nennen die Unterklassen.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `enableModuleExport` | `boolean` | `false` | nein | Export-Button (Typ `table`: CSV/JSON/PDF über den ExportService) |
| `externalHeaderActionsContainer` | `HTMLElement` | – | nein | Toolbar einer umschließenden Karte, in die Presets und Dropdowns wandern (EN/MA-Schüler:innen-Tabellen) |
| `showModuleTitle` | wie Basis | `false` | nein | Ohne Titelzeile gibt es keine Toolbar, Presets werden dann mit Warnung übersprungen |

`createTable`-Spec: `options.disablePresets` unterdrückt die Preset-Buttons; ein einzelnes `Preset` mit `disabled: true` bleibt sichtbar, wird aber gedimmt mit `aria-disabled` gerendert und ignoriert Klicks. Alle übrigen `options` gehen an Tabulator (Standard: `fitColumns`, `selectableRows: true`, `columnCalcs: 'both'`, Platzhalter aus dem Glossareintrag `general.messages.no-data`).

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `createTable(spec)` | Aufruf | Tabelle bauen; liefert die Instanz oder `null` bei ungültiger Spec |
| `updateColumns(columns)` | Aufruf | Spaltensatz in place tauschen, Filterwerte abgleichen, Redraw |
| `safeReplaceData(data, { beforeReplace?, afterReplace? })` | Aufruf | `replaceData` mit Preset-Schonung; bei Fehler Tabelle zerstören und `false` liefern |
| `attachStandardEventHandlers({ onSelectionChanged, onDataFiltered })` | Aufruf | Standardpaar `rowSelectionChanged`/`dataFiltered` anbinden; vor `onDataFiltered` wird die Zeilenauswahl verworfen |
| `redraw()`, `show()`, `hide()` | Aufruf | Redraw sofort; `show()` führt aufgeschobene Operationen aus und zeichnet nur bei geänderter Breite oder Inhalt neu |
| `deferOperationUntilVisible(key, op)` | Aufruf | Operation ausführen oder bis `show()` aufschieben |
| `withSuppressedTableEvents(names, op, { release? })`, `isTableEventSuppressed(name)`, `handleTreeToggleRowClick(row, { onLeafClick? })` | Aufruf | Ereignisse während programmatischer Änderungen stummschalten |
| `setState(partial)`, `getState(key?)` | Aufruf | Reaktiver Zustand; Änderungen rufen `_onStateChanged(changedKeys, prevState)` |
| `animateTemporaryElementClass(el, cls, ms)` | Aufruf | Kurzzeitige Klasse für Klick-Feedback |
| `whenSettled()` | Aufruf | Erfüllt, sobald jeder gestartete Build samt Redraw abgeschlossen ist |
| `onThemeChanged()` | Aufruf | Redraw, dann Basis |
| `destroy()` | Aufruf | Toolbar-Listener, Tabulator-Instanz, Settle-Slots abbauen, dann Basis |
| `table`, `isInitialBuild`, `headerActionsContainer` | Getter/Setter | Aktuelle Tabelle; Build-Phase (in `dataFiltered`-Handlern prüfen); externe oder eigene Toolbar |
| `getExportControlDefinition()` | Override | `_buildExportControlDefinition('table')` bei `enableModuleExport` |
| `validateContainer()` | Override | `assignId: true` |
| `_onStateChanged(keys, prev)`, `_onTableReady()`, `_onTableReset()`, `_getPersistentFilters()`, `_createHeaderToolbarButtons()` | Override (Hooks) | Redraw als Standard; Tabelle fertig gebaut; Reset-Button gedrückt; Filter, die einen Reset überleben; zusätzliche Toolbar-Buttons |
| `_updatePresets(presets)`, `_clearPresetState()`, `_setTableFilterValue(field, value)`, `_applyColumnVisibilityChanges(cols, fn)`, `_isColumnVisibilityLocked(field)`, `_isTableBuilt(table)` | Helfer | Für Unterklassen |
