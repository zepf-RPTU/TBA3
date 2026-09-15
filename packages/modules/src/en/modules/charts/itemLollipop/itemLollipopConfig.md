# ChartHostModule + itemLollipopConfig

## Zweck
Das Lollipop-Diagramm der Aufgaben-View: je Aufgabe (oder je Aufgabengruppe im Task-Modus) ein Lollipop mit der Lösungsquote der Klasse, eingefärbt nach Aufgabenniveau, dazu Marker der Vergleichsgruppen (Landesschnitt, Schulschnitt, …). Das Diagramm spiegelt immer genau die Zeilen, die die Aufgabentabelle gerade zeigt oder ausgewählt hat; das Diagramm selbst filtert nichts.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../module-base/src/modules/contentModule.md)
    - [ChartHostModule](../../../../common/charts/host/chartHostModule.md)
      - **itemLollipopConfig** — Descriptor

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `items` | – | `items[].iqbId`, `items[].name`, `items[].exercise.name`, `items[].descriptiveStatistics.mean`, `domain.id`¹ |
| `items` | `comparison=school-average,state-average` | Vergleichszeilen: `id`¹, `type`, `name` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `domain.id` fehlt das Item in `ITEM_RECORDS` und damit im Diagramm; eine Vergleichszeile ohne `id`, `name` oder `type` lässt `buildItemComparisonGroups` werfen, und die App startet nicht.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `items` | `domain.name` | Im Modus `all` stehen die Nummern ohne Domänen-Präfix |
| `items` | `items[].parameters.competenceLevel.nameShort` | Stiel und Kopf in der Markenfarbe und durchgezogen, das Item fehlt in der Niveau-Legende, Tooltip „N/A“ |
| `items` | `items[].parameters.competences[type=Hör-/Lesestil].name` | Tooltip-Zeile „Stil“ zeigt „N/A“ |
| `items` (`comparison=…`) | Vergleichszeilen | Keine Vergleichsmarker, kein ⌀-Menü |
| `aggregations` (`type=items`, `aggregation=result`) | `id` und `aggregations[type=Ergebnis]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` (`descriptiveStatistics.frequency`, `.total`) | Ohne Datensatz für das Item zeigt der Tooltip für alle drei Ergebniszeilen „N/A“; ein fehlender Eintrag zählt 0 |
| `aggregations` (`type=students`) | `aggregations[type=Ergebnis].value` aller Zeilen (welche Ergebniszeilen der Tooltip zeigt, immer in der Reihenfolge `Richtig`, `Falsch`, `Unbearbeitet`) | Tooltip ohne Ergebniszeilen, Achsentitel ohne Glossar-Verweis |

Payload: `createRenderer(host, data)` erhält `{ itemsData, itemComparisonGroups }` (die View schneidet es aus ihrem Payload): `itemsData` sind die Datensätze aus `EN_DATA_KEYS.ITEM_RECORDS` (`buildItemArray`, `src/en/utils/enItemDataAdapter.js`), `itemComparisonGroups` baut `buildItemComparisonGroups` im `EnAppModule` aus den Vergleichszeilen von `items`: jede Gruppe mit `id`, `type`, `name`, Ordinal und `meanMap`, auch eine, die `aggregations` nicht führt. Gezeichnet wird erst beim ersten `applySync` der Aufgabentabelle; die IDs werden über `itemStore.getByIds` in deren Zeilen aufgelöst, im Task-Modus Aufgabenzeilen mit `competenceLevelsRaw`, `itemCount` und `_children`. Die Stielhöhe ist `meanPercentage` (`items[].descriptiveStatistics.mean`, dieselbe Statistik wie die Vergleichsmarker); die drei Ergebniszeilen des Tooltips sind die Anteile aus der Item-Aggregation, jede über ihren Ergebniscode gelesen. Vergleichsgruppen, ihre Toggle-IDs und die Einträge des ⌀-Menüs kommen aus `itemComparisonGroups`; aus `enConfig` liest der Renderer nur `resultTypes` und `correctResultType`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `itemStore` | `{ setAll, getByIds }` | – | ja | Löst die ID-Listen aus `applySync` in Datensätze auf; wird ungeprüft gelesen |
| `enConfig` | `EnConfig` | – | ja | Ergebnistypen für den Tooltip (`resultTypes`, `correctResultType`) |
| `comparisonState` | `ComparisonState` | – | nein | Aktive Vergleichsgruppen für das ⌀-Menü und den Startzustand; kommt über `_childOptions()` der View |
| `glossaryKey` | `string` | `en.item.lollipop` | nein | Titel und Tutorial |
| `showModuleTitle`, `enableModuleExport` | `boolean` | `true` | nein | Descriptor-Defaults für den Host |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `applySync(data)` | Aufruf | `{ visibleIds, selectedIds?, groupMode, mode }` der Tabelle übernehmen; erzeugt das Diagramm beim ersten Aufruf, danach `setState({ items })` |
| `setActiveModes(activeModes)` | Aufruf | Marker der Vergleichsgruppen ein- oder ausblenden |
| `getExportIdentity()` | Override | Der Domänen-Modus der Tabelle (`all` oder Domänen-ID) |
