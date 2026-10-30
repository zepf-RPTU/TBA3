# MaOverviewViewModule

## Zweck
Die Übersicht der Mathe-3-Lerngruppe: links die Verteilung der Lerngruppe auf die Kompetenzstufen, rechts ein Raster aus Aufgabenringen der gewählten Gruppierung. Ein Klick auf ein Segment der Verteilung hebt in den Ringen die Schüler:innen dieser Stufe hervor; das Ø-Dropdown im Kopf der Verteilung blendet Vergleichsmittelwerte in sie ein.

## Design/Idee

Die Übersichtsansicht stellt die Ergebnisse der gesamten Lerngruppe in zwei Graphen dar; die wesentlichen Testergebnisse sollen dabei ohne jeglichen Text auf einen Blick erkennbar und abschätzbar werden. Linksseitig wird die Kompetenzstufenverteilung der Lerngruppe in klassischen stacked bar charts („Kompetenzbänder“) gezeigt, rechtsseitig erfolgt eine erste fachlich-inhaltliche Differenzierung der Ergebnisse anhand der Leitideen, wahlweise aber bspw. auch nach allgemeinen mathematischen Kompetenzen oder dem Anforderungsbereich.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Kompetenzstufen-Verteilung | `ChartHostModule` + `maCompetenceLevelDistributionConfig` | [maCompetenceLevelDistributionConfig.md](../../../packages/modules/src/ma/modules/charts/competenceLevelDistribution/maCompetenceLevelDistributionConfig.md) | `onLevelSelected` |
| Aufgabenringe | `ChartHostModule` + `itemRingGridConfig` | [itemRingGridConfig.md](../../../packages/modules/src/ma/modules/charts/itemRing/itemRingGridConfig.md) | `defaultInnerRingVisible: false`, `ringGrouping` (App-State `itemRingGrouping`) |

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `comparison=school-average,state-average` | Kompetenzstufen-Verteilung (das rohe Dokument mit Lerngruppen- und Vergleichszeilen) |
| `items` | – | Aufgabenringe (die Lerngruppenzeilen, in `ITEM_RECORDS`; die Ringe in `ITEM_RINGS`) |
| `competence-levels` | `type=students` | Aufgabenringe (`STUDENT_RECORDS`: die Lerngruppengröße und die Stufe je Person, nach der ein Segment-Klick filtert) |
| `aggregations` | `type=students` | Aufgabenringe, nur bei gewählter Stufe (Ergebnisse je Person in `ITEM_RECORDS`) |

Payload: keiner. Die View liest den Store nicht; die Verteilung liest `competence-levels.json`, die Ringe `ITEM_RECORDS`, `STUDENT_RECORDS` und `ITEM_RINGS` selbst.

## Zustand
Keine App-State-Schlüssel beobachtet.

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Verteilung `onLevelSelected(level)` | Ringe `setCompetenceLevelFilter(level)` |

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Beide Charts erzeugen, den Segment-Klick verdrahten und nebeneinander setzen |
