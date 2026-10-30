# EnOverviewViewModule

## Zweck
Die Übersicht der Englisch-8-Lerngruppe: in der Mitte das Scatterplot der Schüler:innen (die beiden Domänen der Daten gegeneinander), links die GER-Stufenverteilung der ersten Domäne, rechts die der zweiten. Ein Klick auf einen Punkt im Scatterplot öffnet die Schüler:innenansicht; die Ø-Umschalter der Chart-Köpfe blenden Vergleichsmittelwerte in alle drei Charts ein.

## Design/Idee

Die Übersichtsansicht stellt die Ergebnisse der gesamten Lerngruppe in insgesamt drei Graphen dar; die wesentlichen Testergebnisse sollen dabei ohne jeglichen Text auf einen Blick erkennbar und abschätzbar werden. Die Trennung nach Hör- und Leseverstehen (links/rechts) wird hier erstmalig sichtbar, zieht sich aber durch den weiteren Verlauf der Ansichten.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Verteilung erste Domäne (links) | `ChartHostModule` + `enCompetenceLevelDistributionConfig` | [enCompetenceLevelDistributionConfig.md](../../../packages/modules/src/en/modules/charts/competenceLevelDistribution/enCompetenceLevelDistributionConfig.md) | `domainId` = erste Id aus `EN_DATASETS.CONFIG.domainIds`, `glossaryReplacements: { Domäne }` (der Name aus `EN_DATASETS.CONFIG.domainLabels`, verlinkt über `resolveDomainEntryKey(domainId)`), `yAxisSide: 'left'` |
| Scatterplot | `ChartHostModule` + `scatterplotConfig` | [scatterplotConfig.md](../../../packages/modules/src/en/modules/charts/scatterplot/scatterplotConfig.md) | `glossaryReplacements: { Domänen }` (die Domänennamen aus `EN_DATASETS.CONFIG` als Liste, je Name verlinkt über `enDomainListRuns`), `onStudentSelected` |
| Verteilung zweite Domäne (rechts) | `ChartHostModule` + `enCompetenceLevelDistributionConfig` | [enCompetenceLevelDistributionConfig.md](../../../packages/modules/src/en/modules/charts/competenceLevelDistribution/enCompetenceLevelDistributionConfig.md) | wie links mit der zweiten Id, `yAxisSide: 'right'` |

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=students` | Scatterplot (in `STUDENT_RECORDS`) |
| `aggregations` | `type=students` | Scatterplot (in `STUDENT_RECORDS`; Domänen über `EN_DATASETS.CONFIG`) |
| `aggregations` | `comparison=school-average,state-average` | Scatterplot (in `STYLE_AVERAGES`: Lerngruppenmarker, Vergleichsmarker) |
| `competence-levels` | `comparison=school-average,state-average` | beide Verteilungen (`competence-levels.json`, je Domäne gefiltert); Scatterplot über `EN_DATASETS.CONFIG` (Äquivalenztabellen) |

Payload: keiner. Die View liest nur `EN_DATASETS.CONFIG` (`domainIds`, `domainLabels`) für die Optionen der Kinder; jede Karte liest ihre Dokumente selbst. Beide Verteilungen lesen den einen Eintrag `en.overview.competence-level-distribution` (Descriptor-`glossaryPath`); weder Code noch Glossar-Schlüssel nennen eine Domänen-Id.

## Zustand
Keine App-State-Schlüssel beobachtet.

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Scatterplot `onStudentSelected(studentId)` | View `_openStudent(studentId)` |

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Drei Hosts erzeugen und links, mittig, rechts in die View setzen |
