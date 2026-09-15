# EnItemTableModule

## Zweck
Die Aufgabentabelle der EN-Aufgaben-View: eine Zeile je Item mit Nummer (im Modus `all` mit Domänen-Präfix `H-01`), Aufgabe, Aufgabenniveau, Stilen, der Verteilungsleiste der Klasse und dem Pilotierungswert. Ein Kopf-Button schaltet in den Task-Modus, der die Items nach Aufgabe gruppiert (Tabulator `dataTree`, aggregierte Elternzeilen). Der Domänen-Schalter wirkt als Tabulator-Filter auf die Domänen-ID der Zeile. Die Tabelle treibt das Item-Lollipop (ID-Listen) und die Detailkarte (ausgewählte Zeilen).

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../module-base/src/modules/contentModule.md)
    - [TableModule](../../../common/tables/tableModule.md)
      - [BaseItemTableModule](../../../common/tables/baseItemTableModule.md)
        - **EnItemTableModule** — über Mixin `withDomainMode`

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `items` | – | `items[].iqbId`, `items[].name`, `items[].exercise.name`, `items[].descriptiveStatistics.mean`, `domain.id`¹ |
| `aggregations` | `type=items`, `aggregation=result` | `id`¹ (die `iqbId` des Items), `aggregations[type=Ergebnis]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `descriptiveStatistics.frequency`, `.total` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `domain.id` zeichnet die Tabelle nichts; der Domänenfilter vergleicht die `domain.id` der Zeile mit dem Modus.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `items` | `domain.name` | Keine Domänen-Präfixe in der Nummernspalte; unter „Alle“ stehen die Domänen gemischt |
| `items` | `items[].parameters.competenceLevel.nameShort` | Niveauspalte „N/A“ ohne Farbe, Niveaufilter leer, die Zeile sortiert ans Ende |
| `items` | `items[].parameters.competences[type=Hör-/Lesestil].name` | Stilspalte leer, Stilfilter nur „Alle“; ein Eintrag ohne `name` fällt weg |
| `items` | `items[].parameters.solutionFrequencyGymnasium`, `…NonGymnasium`, `…PrimarySchool` (der erste vorhandene zählt) | Pilotierungsspalte „—“, keine Referenzlinie im Balken, leere Exportspalten |
| `aggregations` (`type=students`) | `aggregations[type=Hör-/Lesestil].value` der ersten Zeile | Stile in Payload-Reihenfolge, die Stilsortierung wirkt nicht |

Payload: `_doRenderContent({ itemsData })` mit den Datensätzen aus `EN_DATA_KEYS.ITEM_RECORDS`, gebaut von `buildItemArray` (`src/en/utils/enItemDataAdapter.js`); aus der Option `enConfig` liest die Tabelle `styleCategories`. Die Verteilungsleiste liest alle drei Anteile aus der Item-Aggregation (`correctCount / total` usw.), damit ihre Segmente dieselben Antworten aufteilen; ohne Antworten zum Item sind alle drei `null`, und die Leiste bleibt leer. `items[].descriptiveStatistics.mean` trägt nur das Δ zur Pilotierung. Im Task-Modus mittelt die Elternzeile die Anteile der Items, die einen haben.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `enConfig` | `EnConfig` | – | ja | Stil-Kategorien |
| `domainMode` | `string` | `'all'` | nein | Anfangsmodus (Mixin) |
| `itemStore` | `{ setAll, getByIds }` | – | ja | Wird mit den Tabellenzeilen gefüllt, damit der Sync nur IDs trägt |
| `onDataSync` | `(data) => void` | – | nein | Sichtbare/ausgewählte IDs für das Lollipop |
| `onItemSelected` | `(payload) => void` | – | nein | Auswahl für die Detailkarte |
| `onItemPreview` | `(task) => void` | – | nein | Vorschau-Button der Nummernspalte; ohne Handler kein Button |
| `enableModuleExport` | `boolean` | `true` | nein | Export-Button |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setState({ mode })` | Aufruf | Domänen-Modus aus dem App-State (`currentMode`) |
| `onDataSync(data)` | Callback | `{ visibleIds, selectedIds?, groupMode, mode }` |
| `onItemSelected(payload)` | Callback | `{ items, mode }` oder `{ item }` |
| `onItemPreview(task)` | Callback | `{ number, title, domainLabel, level, styles }` |
| `getExportIdentity()` | Override | Der Domänen-Modus |
