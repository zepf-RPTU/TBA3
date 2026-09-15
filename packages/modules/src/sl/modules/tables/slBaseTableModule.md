# SlBaseTableModule

## Zweck
Abstrakte Basis der beiden SL-Tabellen: hält die gemeinsamen Renderdaten (Stufendefinitionen, Unterrichtsqualität, Selbstwirksamkeit), führt den Lebenszyklus mehrerer Tabulator-Instanzen pro Render (Zerstören, vizMode-Redraw, Zeilentyp-Formatter), baut verschachtelte Tabellenabschnitte mit eigenem Exportbutton und beantwortet das Survey-Gate (gibt es Zeilen für Unterrichtsqualität bzw. Selbstwirksamkeit, sonst entfällt die Spalte).

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../module-base/src/modules/contentModule.md)
    - [TableModule](../../../common/tables/tableModule.md)
      - **SlBaseTableModule**
        - [SlClassTableModule](slClassTableModule.md) — über Mixin `withTableModeState`
        - [SlDomainTableModule](slDomainTableModule.md) — über Mixin `withTableModeState`

## Daten
Keine API-Daten. Die Unterklassen nennen die Felder, die ihre Spalten lesen, einschließlich derer, die diese Basis in Spalten, Sortierung, Filtern und Presets liest.

`_storeCommonRenderData(data)` legt aus dem Payload der Unterklasse `levelDefinitions` (Dataset `LEVEL_DEFINITIONS`, `buildLevelDefinitions`), `teachingQuality` (`TEACHING_QUALITY`, `className: 'Schule'` für das Schulaggregat), `selfEfficacyByClass` und `selfEfficacySchool` (`SELF_EFFICACY_BY_CLASS` / `SELF_EFFICACY_SCHOOL`) ab. `_getTeachingQuality(className, subjectName)` sucht in `teachingQuality`; das Survey-Gate `_hasTeachingQualityData()` / `_hasSelfEfficacyData()` fragt über `hasSurveyRows`, ob die Survey-Datasets Zeilen haben. `_applyVizModeChange` liest keine Daten, die Formatter lesen `this._state.vizMode` bei jedem Redraw.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `vizMode` | `string` | `'stacked_bar'` | nein | Startwert des `vizMode`-State der Unterklassen (`'boxplot'` alternativ) |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_getActiveTables()` | abstrakt | Alle Tabulator-Instanzen der Unterklasse |
| `_applyVizModeChange(vizMode)` | Hook des Mixins | `redraw(true)` auf jeder fertig gebauten Tabelle |
| `_createHeaderToolbarButtons()` | Override | Weder Spaltenmenü noch Tabellenfilter, sobald mehr als eine Tabelle aktiv ist |
| `destroy()` | Override | Abschnitts-Exportbuttons und alle Tabellen entsorgen |
| `_destroyActiveTables()`, `_destroyTableSections()` | geschützt | Aufräumen vor einem Rerender |
| `_createTableHost({ id, className })` | geschützt | Ein Tabellen-Host direkt im Inhalt |
| `_createTableSection({ title, hostId, collapsible, startCollapsed, … })` | geschützt | Abschnittskarte mit Titel; liefert `{ section, headerActions, host }` |
| `_createTableSectionExportButton({ headerActions, id, title, container })` | geschützt | Exportbutton im Abschnittskopf |
| `_createRowTypeFormatter(typeConfig)` | geschützt | Tabulator-`rowFormatter`, `rowData.type` → CSS-Klasse |
| `_getTeachingQuality(className, subjectName)` | geschützt | Eintrag aus `teachingQuality` |
| `_hasTeachingQualityData()`, `_hasSelfEfficacyData()` | geschützt | Survey-Gate über `hasSurveyRows` |
