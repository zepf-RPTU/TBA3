# ChartHostModule + maKsDistributionConfig

## Zweck
Die Kompetenzstufenverteilung der MA-Übersicht: ein gestapeltes Balkendiagramm der Klasse mit den Vergleichsgruppen (Schule, Land, weitere) aus demselben Dokument, umschaltbar zwischen vertikal und horizontal. Ein Segment-Klick hebt die Stufe hervor und lässt das Aufgabenring-Raster daneben die Schüler:innen dieser Stufe markieren; das ⌀-Dropdown im Modulkopf schaltet Vergleichsgruppen ein und aus.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../module-base/src/modules/contentModule.md)
    - [ChartHostModule](../../../../common/charts/host/chartHostModule.md)
      - **maKsDistributionConfig** — Descriptor

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `comparison=school-average,state-average` | `type`¹ (`group` ist die Klasse, jede andere Zeile eine Vergleichsgruppe), `name` (Balkenschlüssel und Achsenbeschriftung, je Zeile eindeutig), `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency`, `.total`; Vergleichszeilen zusätzlich `id`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Die Klasse ist die Zeile mit `type=group`, gleich wo sie im Dokument steht; ohne sie gibt es keinen Primärbalken. Eine Vergleichszeile ohne `id` lässt `competenceLevelComparisonIds` beim Start werfen, und das MA-Dashboard zeigt nur die Fehlermeldung. Anteile sind `frequency / total`, nicht `mean`, das der Server auf vier Stellen rundet; eine Zeile mit `total` 0 hat keine Anteile. Der Tooltip zeigt je Segment die `frequency` der eigenen Zeile, auch bei Vergleichszeilen. Zwei Zeilen mit gleichem `name` brechen das Zeichnen mit einem Fehler ab, weil die Balken nach Namen angeordnet sind und der eine über dem anderen läge.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`comparison=…`) | Vergleichszeilen | Nur der Klassenbalken, kein ⌀-Dropdown |

Payload: `createRenderer(host, data)` erhält das Dokument `competence-levels` der Klasse unverändert (`MA_DATA_KEYS.COMPETENCE_LEVELS_CLASS`, von der Übersicht direkt übergeben). Der Renderer parst es mit `parseCompetenceLevels` (`competenceLevelAdapter.js`): die Stufenfolge kommt aus der Zeile mit den meisten Stufen, der Primärbalken ist die Zeile mit `type=group` (`findClassGroup`), die Vergleichsgruppen im ⌀-Dropdown sind alle anderen Zeilen (`isComparisonValueGroup`). Ohne Stufen in irgendeiner Zeile bleibt die Karte leer. Die anfangs sichtbaren Vergleiche liest der Renderer aus `comparisonState.getActiveModes()`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `comparisonState` | `ComparisonState` | – | nein | Vergleichszustand für Dropdown, Startauswahl und Sichtbarkeit |
| `isHorizontal` | `boolean` | `false` | nein | Startausrichtung; ein Toggle wird in `configState` gemerkt und überlebt einen Neuaufbau |
| `enableOrientationToggle` | `boolean` | `true` | nein | Ausrichtungs-Button im Modulkopf |
| `enableSegmentClick` | `boolean` | `true` | nein | Segment-Klick erlaubt (nur `false` schaltet ab) |
| `onLevelSelected` | `(level: string\|null) => void` | – | nein | Segment-Klick; ohne Handler wird die Stufe nicht gemeldet |
| `collapsible`, `showModuleTitle`, `enableModuleExport` | `boolean` | `true` | nein | Descriptor-Defaults; die Übersicht übergibt `collapsible: false` |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setActiveModes(activeModes)` | Aufruf | Aktive Vergleichs-IDs als Renderer-State setzen; No-op bei unveränderter Liste |
| `toggleOrientation()` | Aufruf | Zwischen vertikal und horizontal wechseln |
| `onLevelSelected(level)` | Callback | siehe Optionen |
