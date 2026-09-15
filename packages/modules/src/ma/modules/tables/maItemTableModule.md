# MaItemTableModule

## Zweck
Die Aufgabenübersichtstabelle der MA-Aufgaben-View: eine Zeile je Aufgabe mit Leitidee, Nummer (mit Aufgaben-Vorschau), Aufgabenname, Aufgabenniveau, Verteilungsbalken (richtig | unbearbeitet | falsch) mit Pilotierungsmarke und der Pilotierungs-Spalte, dazu die geteilten Presets „Stärkste 5“, „Schwächste 5“ und „Hohe Nichtbearbeitung“. Filter je Spalte, Export als CSV/JSON/PDF.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../module-base/src/modules/contentModule.md)
    - [TableModule](../../../common/tables/tableModule.md)
      - [BaseItemTableModule](../../../common/tables/baseItemTableModule.md)
        - **MaItemTableModule**

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `items` | – | `items[].iqbId`, `items[].name`, `items[].exercise.name`, `items[].descriptiveStatistics.mean` (nur die Differenz der Pilotierungs-Spalte) |
| `aggregations` | `type=items`, `aggregation=result` | `id`¹ (die `iqbId` des Items), `aggregations[type=Ergebnis]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `descriptiveStatistics.frequency`, `.total` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `id` findet keine Zeile ihre Zählung: alle Zähler stehen auf 0 und die drei Anteile fehlen (`null`). Der Verteilungsbalken zeigt dann statt der Segmente „Keine Daten“ (`general.messages.no-data-short`), ohne Tooltip und ohne Pilotierungsmarke; die Presets finden für die Zeile keinen Anteil.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `items` | `domain.name` | Leitidee-Spalte leer, Leitideenfilter nur „Alle“ |
| `items` | `items[].parameters.competenceLevel.nameShort` | Niveauspalte „N/A“ ohne Farbe, Niveaufilter leer, die Zeile sortiert ans Ende |
| `items` | `items[].parameters.solutionFrequencyGymnasium`, `…NonGymnasium`, `…PrimarySchool` (der erste vorhandene zählt) | Pilotierungsspalte „—“, keine Referenzlinie im Balken, leere Exportspalten |

Payload: `_doRenderContent({ itemsData })` mit den Datensätzen aus `MA_DATA_KEYS.ITEM_RECORDS`, gebaut von `buildItemArray` (`src/ma/utils/maItemDataAdapter.js`); die Aufgaben-View mappt `itemArray` des App-Payloads darauf. Alle drei Anteile des Balkens (`percentageCorrect`, `percentageIncorrect`, `percentageNotAttempted`) sind Zählungen der Item-Aggregation über ihr `total`; `mean` geht nur in die Differenz der Pilotierungs-Spalte ein. Die Tabelle liest keine Datenoption; `onItemPreview` bekommt `{ number, title, domainLabel, level }` aus der Zeile.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `onItemPreview` | `(task) => void` | – | nein | Vorschau-Button der Nummernspalte; ohne Handler kein Button |
| `enableModuleExport` | `boolean` | `true` | nein | Export-Button im Kartenkopf |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_getColumns(processedData)` | Override | MA-Spaltensatz mit Leitidee, Nummer, Aufgabe, Aufgabenniveau, Verteilung, Pilotierung |
| `_getPresets()` | Override | Die drei geteilten Aufgaben-Presets unter `ma.items.item-table.interface` |
| `onItemPreview(task)` | Callback | `{ number, title, domainLabel, level }` |

Keine öffentlichen Verben über die Basisklasse hinaus.
