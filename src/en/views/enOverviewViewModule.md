# EnOverviewViewModule

## Zweck
Die Übersicht der Englisch-8-Klasse: in der Mitte das Scatterplot der Schüler:innen (Hören gegen Lesen), links die GER-Stufenverteilung für Hören, rechts die für Lesen. Ein Klick auf einen Punkt im Scatterplot öffnet die Schüler:innenansicht; die Ø-Umschalter der Chart-Köpfe blenden Vergleichsmittelwerte in alle drei Charts ein.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - **EnOverviewViewModule**

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Verteilung Hören (links) | `ChartHostModule` + `enKsDistributionConfig` | [enKsDistributionConfig.md](../../../packages/modules/src/en/modules/charts/ksDistribution/enKsDistributionConfig.md) | `glossaryKey: 'en.overview.ks-distribution.h'`, `yAxisSide: 'left'`, `enableSegmentClick: false` |
| Scatterplot | `ChartHostModule` + `scatterplotConfig` | [scatterplotConfig.md](../../../packages/modules/src/en/modules/charts/scatterplot/scatterplotConfig.md) | `enConfig`, `domainTitles` (Domänen-Id → Label), `startZoomed: true`, `onStudentSelected` |
| Verteilung Lesen (rechts) | `ChartHostModule` + `enKsDistributionConfig` | [enKsDistributionConfig.md](../../../packages/modules/src/en/modules/charts/ksDistribution/enKsDistributionConfig.md) | wie links, `yAxisSide: 'right'`, `glossaryKey: 'en.overview.ks-distribution.l'` |

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=students` | Scatterplot (in `STUDENT_RECORDS`) |
| `aggregations` | `type=students` | Scatterplot (in `STUDENT_RECORDS`; Domänen über `enConfig`) |
| `aggregations` | `comparison=school-average,state-average` | Scatterplot (als `styleAverages`: Klassenmarker, Vergleichsmarker) |
| `competence-levels` | `comparison=school-average,state-average` | Verteilung Hören und Verteilung Lesen (das rohe Dokument, je Domäne gefiltert); Scatterplot über `enConfig` (Äquivalenztabellen) |

Payload: `_renderView` liest `getDataset(EN_DATA_KEYS.STUDENT_RECORDS)`; das Scatterplot erhält `{ studentArray, styleAverages: getEnStyleAverages(dataStore) }` und entfällt ohne Datensätze. Die Verteilungen erhalten `getRawData(EN_DATA_KEYS.COMPETENCE_LEVELS_CLASS)`, gefiltert auf die erste bzw. zweite Domäne aus `enConfig.domainIds`, welche IDs der Payload auch vergibt; die Glossar-Schlüssel `en.overview.ks-distribution.h`/`.l` hängen an dieser Position. Alle drei Hosts hydrieren parallel in einem Batch.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `comparisonState` (über `observeActiveComparisons`) | Ø-Dropdowns in den Chart-Köpfen (`comparisonModeControl`) | Scatterplot, linke und rechte Verteilung `setActiveModes(activeModes)` |

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Scatterplot `onStudentSelected(studentId)` | View `_openStudent(studentId)` (schreibt `currentStudentId`, navigiert zu `student`) |

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Schüler:innendatensätze lesen, DOM bauen, Vergleichszustand beobachten, drei Hosts konstruieren und parallel hydrieren |
