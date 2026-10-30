# ChartHostModule + itemLollipopConfig

## Zweck
Das EN-Lollipop-Diagramm der Aufgaben: je Aufgabe ein Lollipop mit der Lösungsquote der Lerngruppe, eingefärbt nach Aufgabenniveau, dazu Marker der Vergleichsgruppen (Landesschnitt, Schulschnitt, …). Das Diagramm spiegelt immer genau die Zeilen, die die Aufgabentabelle gerade zeigt oder ausgewählt hat; das Diagramm selbst filtert nichts. Die Niveau-Legende nennt jede Farbe der Aufgabenniveaus, ohne zu schalten: Niveaus, die eine Farbe teilen (A1.1 und A1.2 malen beide in der Farbe von A1), stehen in einem Eintrag, jedes mit eigenem Glossarlink.

Zeigt die Tabelle Aufgaben aus beiden Domänen (Modus „Alle“), stapelt das Diagramm je Domäne einen Streifen in der Domänenreihenfolge des Datensatzes, jeder mit eigener Achse und dem Domänennamen darüber; die Aufgaben stehen in Tabellenreihenfolge und teilen über alle Streifen einen Abstand. Unter einem Streifen trägt die Achse die Aufgabennummer ohne Präfix (`1.1`), Tooltip und Datentabelle behalten das „H-01“ der Tabelle. Bleibt nur eine Domäne, zeichnet das Diagramm einen Streifen über die ganze Höhe, ohne Überschrift und mit den Nummern wie in der Tabelle. Die Legende steht zentriert über dem Plot.

## Design/Idee

Die in der Lerngruppe erzielten mittleren Lösungshäufigkeiten pro Aufgabe werden anhand vertikaler Lollipops visualisiert; das jeweilige Aufgabenniveau bzw. die Schwierigkeit der Aufgaben ist farblich codiert. Schul- und Landesmittelwerte können zusätzlich ein- oder ausgeblendet werden. Die Graphik folgt der Tabelle: Sie zeigt die dort ausgewählten bzw. gefilterten Aufgaben. Die Darstellung ist von Seiten der entwickelnden Lehrkräfte nicht ganz zu Ende gedacht und schafft insbesondere in der initialen Ansicht eher Unordnung; Übersichtlichkeit entsteht, indem bspw. ein kleinerer Ausschnitt der Aufgaben über die Tabelle selektiert wird. Die Darstellung soll u.a. dabei helfen, Lösungshäufigkeiten hinsichtlich ihrer Schwierigkeit adäquat zu beurteilen sowie solche Aufgaben zu identifizieren, in denen etwa die Lerngruppe hinter den Erwartungswerten zurückgeblieben ist.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `items` | – | `items[].iqbId`, `items[].name`, `items[].descriptiveStatistics.mean`, `domain.id`¹, `domain.name`, `items[].parameters.competenceLevel.nameShort`¹ |
| `items` | `comparison=school-average,state-average` | Vergleichszeilen: `id`¹, `type`¹, `name`, je Item `items[].iqbId` und `items[].descriptiveStatistics.mean` (Vergleichsmarker) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `domain.id` an einer Zeile von `items.json` weist der Store das Dokument ab (`DocumentShapeError`).

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `items` | `items[].parameters.competences[type=style].name` | Keine Tooltip-Zeile „Stile“ |
| `items` (`comparison=…`) | Vergleichszeilen | Keine Vergleichsmarker, kein ⌀-Menü |
| `aggregations` (`type=items`) | `id` und `aggregations[type=result]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` (`descriptiveStatistics.frequency`, `.total`) | Ohne Datensatz für das Item zeigt der Tooltip für alle Ergebniszeilen „–“; ein fehlender Eintrag zählt 0 |
| `aggregations` (`type=items`) | `aggregations[type=result].value` aller Zeilen (welche Ergebniszeilen der Tooltip zeigt, immer in der Reihenfolge `Richtig`, `Falsch`, `Unbearbeitet`) | Tooltip ohne Ergebniszeilen, Achsentitel ohne Glossar-Verweis |

Dokumente: Der Descriptor nennt in `documents` die Datasets `en.itemRecords` (`EN_DATASETS.ITEM_RECORDS`), `en.itemComparisonGroups` (`EN_DATASETS.ITEM_COMPARISON_GROUPS`) und `items-aggregations.json`. `en.itemComparisonGroups` sind die Vergleichszeilen von `items.json`, auch eine, die `aggregations` nicht führt. Gezeichnet wird erst ab dem ersten `applySync` der Aufgabentabelle, der den Host neu rendert; die IDs löst `getRecordsByIds` gegen `en.itemRecordsById` (`EN_DATASETS.ITEM_RECORDS_BY_ID`, der Index von `en.itemRecords` nach `iqbId`) auf. Die Stielhöhe ist `meanPercentage` (`items[].descriptiveStatistics.mean`, dieselbe Statistik wie die Vergleichsmarker), und der Tooltip nennt sie zuerst als „Lösungsquote“; die drei Ergebniszeilen des Tooltips sind die Anteile aus der Item-Aggregation, jede über ihren Ergebniscode gelesen.

Datentabelle: die Tabelle baut die `itemDataTable()` des `ItemLollipopChartRenderer`: eine Zeile je gezeichneter Teilaufgabe in der Reihenfolge der Aufgabentabelle, mit `Teilaufgabe` (wie die Aufgabentabelle sie nennt, `displayName`), `Aufgabenniveau`, `Lösungsquote` (`meanPercentage`) und je eingeblendeter Vergleichsgruppe ihrem Mittel (`meanMap`); ein fehlendes Mittel bleibt leer.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `domainMode` | `string \| Signal<string>` | `'all'` | nein | Domänen-Modus, als Signal oder fester Wert; er beschriftet die Aufgaben |
| `glossaryKey` | `string` | `en.item.lollipop` | nein | Titel und Tutorial |
| `showModuleTitle` | `boolean` | `true` | nein | Descriptor-Defaults für den Host |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `applySync(data)` | Aufruf | `{ ids }` übernehmen (die zu zeichnenden Aufgaben, in Anzeigereihenfolge), beschriftet nach dem Host-Zustand `mode` (aus der Option `domainMode`); schreibt den Host-Zustand `items`, den das Diagramm teilt: der erste Aufruf baut es (`rebuildOn`), jeder weitere zeichnet es neu; dieselben IDs mit gleichem Modus ändern nichts |
| `getExportIdentity()` | Override | Der Domänen-Modus der Tabelle (`all` oder Domänen-ID) |
