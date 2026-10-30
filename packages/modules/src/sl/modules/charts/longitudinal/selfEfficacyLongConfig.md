# ChartHostModule + selfEfficacyLongConfig

## Zweck
Der SL-Entwicklungs-Chart der Selbstwirksamkeit: je Jahrgang der Anteil der Schüler:innen pro Antwortband (1 bis 5, gebucketet) als Liniendiagramm, wahlweise gestapelt.

## Design/Idee

Eine separate Darstellung der Selbstwirksamkeit von fünf aufeinanderfolgenden Jahrgängen als Linien, wahlweise darstellbar als gestapelte Flächen. In der Boxplot-Darstellung tritt an ihre Stelle ein gemeinsamer Graph von Unterrichtsqualität und Selbstwirksamkeit (siehe [longitudinalBoxPlotConfig](longitudinalBoxPlotConfig.md)).

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group,students`, `comparison=state-average,year` | Zeitreihe (Zeilen mit `properties[testPeriod]`, aktuelles Jahr und Vorjahre): `type`¹ (nur `student`-Zeilen), `id`¹, `properties[sp_mean]`¹, `properties[testPeriod]`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Die Karte setzt `student`-Zeilen mit `sp_mean` voraus. Eine Zeile ohne `properties[testPeriod]` (Konvention der API, nicht im Schema) fällt aus der Zeitreihe. Eine Zahl außerhalb 1–5 lässt das Dokument scheitern.

**Optional genutzt**
Keine optionalen Felder.

Store: `LONGITUDINAL_DOCUMENTS` wie in [longitudinalCompetenceLevelShareConfig](longitudinalCompetenceLevelShareConfig.md#daten). Die Karte zeichnet `selfEfficacy`: `sp_mean` über `buildSurveyHistory` als ein Mittelwert je Person und Jahr, ohne Filter nach Fach, in die vier Bänder der 1–5-Skala verteilt (`calculateRatingDistribution`); Farbe, Beschriftung und Reihenfolge der Bänder kommen aus `RATING_SERIES` (`slRatingAppearance.js`). Die y-Obergrenze teilen sich alle drei Parallelkoordinaten-Karten (siehe dort). Die x-Achse sind alle Jahre der Zeitreihe (`years` von `sl.longitudinalTimelines`); ein Jahr ohne Werte ist eine Lücke in jeder Linie, ohne Punkt und ohne Tooltip. Die Karte setzt `sp_mean` in der Zeitreihe voraus (`sl.historySurveyScales`, `detectHistorySurveyScales`).

Datentabelle: die `dataTable()` des `LongitudinalLineChart`: eine Zeile je Jahr der x-Achse, eine Spalte je Bewertungsband (`1-2 (niedrig)` …), gestapelt oder nicht dieselbe; ein Jahr ohne Werte bleibt leer.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `showModuleTitle`, `showSubtitle` | `boolean` | `true` | nein | Descriptor-Defaults aus `LONGITUDINAL_DEFAULT_OPTIONS` |
| `isStacked` | `boolean \| Signal<boolean>` | – | ja | Gestapelt oder Linien; als Signal teilen es Host (`state.isStacked`) und Renderer |

## Methoden
Keine eigenen.

Kein Bereich: Selbstwirksamkeit ist fachunabhängig. Kein `getExportIdentity`: ein Host, eine Darstellung.
