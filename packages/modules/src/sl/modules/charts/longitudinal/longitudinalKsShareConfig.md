# ChartHostModule + slKsDistributionConfig

## Zweck
Der Entwicklungs-Chart der Kompetenzstufen-Anteile in der SL-View „Entwicklung“: je Jahrgang der Anteil der Schüler:innen pro Kompetenzstufe als Parallelkoordinaten, für den im Header gewählten Bereich (Fach×Domäne). Wahlweise gestapelt. Bleibt auch im Boxplot-Modus der View eine Parallelkoordinaten-Darstellung.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../module-base/src/modules/contentModule.md)
    - [ChartHostModule](../../../../common/charts/host/chartHostModule.md)
      - **slKsDistributionConfig** — Descriptor

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,students`, `comparison=year` | `type`¹ (nur `school`-Zeilen), `subject.name`¹, `properties[testPeriod]`¹, `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency`, `.total` |
| `competence-levels` | `type=school,group` | Klassenzeilen mit `name`, `subject.name`¹ und `competenceLevels[].nameShort`: sie bestimmen, welche Bereiche (Fach, Domäne) eine Karte bekommen und in welcher Stufenfolge |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Eine Zeile ohne `properties[testPeriod]` (Konvention der API, nicht im Schema) fällt aus der Zeitreihe; ein Jahr ohne `total` ebenso. Der Anteil ist `frequency / total`, `mean` liest das Diagramm nicht.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`comparison=year`) | `properties[simulated]` | Jedes Jahr gilt als gemessen; sichtbar nur im Tooltip, der jedes Jahr „(aktuell)“ nennt |
| `competence-levels` (`comparison=year`) | `domain.id` | Die Zeile passt nur zu einem Fach ohne Domänen; bei einem nach Domänen geteilten Fach bleibt die Zeitreihe leer |

Payload: `createRenderer(host, data)` erhält `{ domainResults, domainArray, history }` aus `#getChartData` der Entwicklungs-View. Gelesen werden `history` (gebaut von `buildKsHistory`, `historyAdapter.js`) und aus `domainArray[domainIndex]` nur `fach`, `domaene`, `stats.ksOrder` und `stats.scaleId`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `showModuleTitle`, `enableModuleExport`, `showSubtitle` | `boolean` | `true` | nein | Descriptor-Defaults aus `baseLongitudinalOptions()`; die View setzt `showSubtitle: false` |
| `yMax` | `number\|null` | `null` | nein | Obergrenze der y-Achse in Prozent, von der View für alle drei Karten gleich gesetzt (`computeSharedYMax`); ohne sie richtet sich die Achse nach den eigenen Werten, gestapelt gilt immer 100 |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setDomainIndex(index)` | Aufruf | Bereich wechseln; aktualisiert die Linien in place (`updateData`), bei Skalen- oder Jahrgangswechsel voller Rerender; `syncExportControls()` |
| `setStacked(flag)` | Aufruf | Gestapelte Ansicht ein/aus, per `chart.setState({ isStacked })` |
| `getExportIdentity()` | Override | `domain<index>`, ein Exportziel pro Bereich |
