# ChartHostModule + teachingQualityConfig

## Zweck
Der SL-Entwicklungs-Chart der Unterrichtsqualität: je Jahrgang der Anteil pro Antwortband als Liniendiagramm für den gewählten Bereich (Fach×Domäne), wahlweise gestapelt.

## Design/Idee

Eine separate Darstellung der Unterrichtsqualität von fünf aufeinanderfolgenden Jahrgängen als Linien, wahlweise darstellbar als gestapelte Flächen. In der Boxplot-Darstellung tritt an ihre Stelle ein gemeinsamer Graph von Unterrichtsqualität und Selbstwirksamkeit (siehe [longitudinalBoxPlotConfig](longitudinalBoxPlotConfig.md)).

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group,students`, `comparison=state-average,year` | Zeitreihe (Zeilen mit `properties[testPeriod]`, aktuelles Jahr und Vorjahre): `type`¹ (nur `student`-Zeilen), `id`¹, `subject.name`¹, `properties[tq_mean]`¹, `properties[testPeriod]`¹; `domain.name` der `school`-Zeilen des aktuellen Jahres benennt den Bereich |
| | | `school`-Zeilen des aktuellen Jahres (`properties[testPeriod]`) mit `subject.name`¹: sie bestimmen die Bereiche |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Die Karte setzt `student`-Zeilen mit `tq_mean` voraus. Eine `student`-Zeile zählt in ihrem Jahr, wenn ihr `subject.name` das Fach des Bereichs ist und ihre `domain.id` seine Domäne; ohne `properties[testPeriod]` (Konvention der API, nicht im Schema) fällt sie aus der Zeitreihe. Eine Zahl außerhalb 1–5 lässt das Dokument scheitern.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`school`-Zeilen des aktuellen Jahres, `student`-Zeilen) | `domain.id` | Je Fach nur ein Bereich; eine `student`-Zeile ohne `domain.id` steht für das ganze Fach und zählt zu jedem seiner Bereiche |

Store: `LONGITUDINAL_DOCUMENTS` wie in [longitudinalCompetenceLevelShareConfig](longitudinalCompetenceLevelShareConfig.md#daten). Die Karte zeichnet `bySubjectDomain[domainIndex].teachingQuality`: `tq_mean` der Schüler:innen des Bereichs je Jahr (`subjectName`, `domainId`) über `buildSurveyHistory` als ein Mittelwert je Person und Jahr, in die vier Bänder der 1–5-Skala verteilt, mit `RATING_SERIES` (`slRatingAppearance.js`) als Farbe, Beschriftung und Reihenfolge. Die y-Obergrenze teilen sich alle drei Parallelkoordinaten-Karten (siehe dort). Die x-Achse sind alle Jahre der Zeitreihe (`years` von `sl.longitudinalTimelines`); ein Jahr ohne Werte ist eine Lücke in jeder Linie, ohne Punkt und ohne Tooltip. Die Karte setzt `tq_mean` in der Zeitreihe voraus (`sl.historySurveyScales`, `detectHistorySurveyScales`).

Datentabelle: die `dataTable()` des `LongitudinalLineChart`: eine Zeile je Jahr der x-Achse, eine Spalte je Bewertungsband, gestapelt oder nicht dieselbe; ein Jahr ohne Werte bleibt leer.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `showModuleTitle`, `showSubtitle` | `boolean` | `true` | nein | Descriptor-Defaults aus `LONGITUDINAL_DEFAULT_OPTIONS` |
| `domainIndex` | `number \| Signal<number>` | – | ja | Der Bereich; der Host behält ihn als `state.domainIndex` (`longitudinalInitialState`) |
| `isStacked` | `boolean \| Signal<boolean>` | – | ja | Gestapelt oder Linien; als Signal teilen es Host (`state.isStacked`) und Renderer |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `getExportIdentity()` | Override | `domain<index>` |
