# MaOverviewViewModule

## Zweck
Die Übersicht der Mathe-3-Klasse: links die Verteilung der Klasse auf die Kompetenzstufen, rechts ein Raster aus Aufgabenringen je Leitidee. Ein Klick auf ein Segment der Verteilung hebt in den Ringen die Schüler:innen dieser Stufe hervor; das Ø-Dropdown im Kopf der Verteilung blendet Vergleichsmittelwerte in sie ein.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - **MaOverviewViewModule**

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Kompetenzstufen-Verteilung | `ChartHostModule` + `maKsDistributionConfig` | [maKsDistributionConfig.md](../../../packages/modules/src/ma/modules/charts/ksDistribution/maKsDistributionConfig.md) | `collapsible: false`, `isHorizontal: false` |
| Aufgabenringe | `ChartHostModule` + `taskRingGridConfig` | [taskRingGridConfig.md](../../../packages/modules/src/ma/modules/charts/taskRing/taskRingGridConfig.md) | `defaultInnerRingVisible: false` |

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `comparison=school-average,state-average` | Kompetenzstufen-Verteilung (das rohe Dokument mit Klassen- und Vergleichszeilen) |
| `items` | – | Aufgabenringe (die Klassenzeilen, in `ITEM_RECORDS`; die Leitideen in `DOMAINS`) |
| `competence-levels` | `type=students` | Aufgabenringe (`STUDENT_RECORDS`: die Klassengröße und die Stufe je Person, nach der ein Segment-Klick filtert) |
| `aggregations` | `type=students` | Aufgabenringe, nur bei gewählter Stufe (Ergebnisse je Person in `ITEM_RECORDS`) |

Payload: `_renderView` liest aus dem App-Payload `getData()` `itemArray` und `studentArray`, die Leitideen liefert `getMaDomains(dataStore)`, das Skalendokument `dataStore.getRawData(MA_DATA_KEYS.COMPETENCE_LEVELS_CLASS)`. Die Verteilung wird mit dem rohen Dokument hydriert; die Ringe erhalten `{ itemArray, studentArray, domains }`. Beide Hosts hydrieren parallel.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `comparisonState` (über `observeActiveComparisons`) | Ø-Dropdown im Chart-Kopf der Verteilung (`comparisonModeControl`) | Verteilung `setActiveModes(activeModes)` |

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Verteilung `onLevelSelected(level)` | Ringe `setKsLevelFilter(level)` |

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | DOM bauen, Vergleichszustand beobachten, beide Hosts konstruieren und parallel hydrieren |
| `destroy()` | Override | Host-Referenzen lösen, dann Basis |
