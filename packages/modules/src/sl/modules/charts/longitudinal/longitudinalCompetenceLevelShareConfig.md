# ChartHostModule + longitudinalCompetenceLevelShareConfig

## Zweck
Der SL-Entwicklungs-Chart der Kompetenzstufen-Anteile: je Jahrgang der Anteil der Schüler:innen pro Kompetenzstufe als Liniendiagramm, für den gewählten Bereich (Fach×Domäne, `domainIndex`). Wahlweise gestapelt; einen Boxplot-Modus hat er nicht.

## Design/Idee

Die Darstellung der schulweiten Kompetenzstufenverteilung in der ausgewählten Domäne in fünf aufeinanderfolgenden Jahrgängen als Linien oder gestapelte Flächen.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group,students`, `comparison=state-average,year` | Zeitreihe (Zeilen mit `properties[testPeriod]`, aktuelles Jahr und Vorjahre): `type`¹ (nur `school`-Zeilen), `subject.name`¹, `properties[testPeriod]`¹, `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency`, `.total` (ohne `total`: `.mean`) |
| | | `school`-Zeilen des aktuellen Jahres (`properties[testPeriod]`): sie bestimmen, welche Bereiche (Fach, Domäne) es gibt, und die Skala des Bereichs: die registrierte Skala, auf die ihre Stufen auflösen; sie gilt für jedes Jahr (Annahme `ASSUMPTION-SL-HISTORY-SAME-LADDER`) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Eine Zeile ohne `properties[testPeriod]` (Konvention der API, nicht im Schema) fällt aus der Zeitreihe; ein Jahr, in dem keine Stufe einen Anteil hat, ist eine Lücke.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`comparison=year`) | `domain.id` | Die Zeile zählt nur zu einem Bereich ohne Domäne; in einem nach Domänen geteilten Fach fehlt ihr Jahr (Lücke) |

Store: der Descriptor nennt in `documents` `LONGITUDINAL_DOCUMENTS` (`longitudinalConfigHelpers.js`), also die Datasets `sl.longitudinalSubjectDomains` (die Bereiche der Zeitreihe, `buildLongitudinalSubjectDomains`), `sl.longitudinalTimelines` (alle Linien-Zeitreihen, `buildLongitudinalTimelines`) und `sl.longitudinalMaxShare`. Beide Zeitreihen-Datasets lesen den Index `sl.longitudinalIndex` (`indexHistory`, `sl/utils/slHistory.js`), der die Zeilen des aktuellen Jahres aus `competence-levels.json` und `students-competence-levels.json` plus die Vorjahre aus `prior-years.json` einmal je Store nach Schul- und Schülerzeilen gruppiert und je Zeile Jahr und Umfragewerte auflöst. Die Karte zeichnet `bySubjectDomain[domainIndex].competenceLevelShares` (`buildCompetenceLevelHistory`) und liest aus `subjectDomains[domainIndex]` `competenceLevelNames` (Skala, Zeichen- und Stapelfolge) und `scaleId` (Farbrampe). Die x-Achse sind alle Jahre der Zeitreihe (`years` von `sl.longitudinalTimelines`, `index.years`), auch eines, das nur ein anderer Bereich oder nur die Umfrage trägt; ein Jahr ohne Ergebnis des Bereichs ist eine Lücke in jeder Linie, ohne Punkt und ohne Tooltip. Die Karte zeichnet die Stufen dieser Skala, die mindestens ein Jahr führt; eine solche Stufe, die ein Jahr nicht führt, hat dort niemand erreicht: 0 % in Linie, Tooltip, Endbeschriftung und Datentabelle. Eine Stufe, die nur ein früheres Jahr führt und die nicht auf der Skala liegt, zeichnet die Karte nicht (keine Linie, keine Tabellenspalte). Die y-Obergrenze in Prozent teilen sich alle drei Parallelkoordinaten-Karten: `lineChartConfig` gibt dem Renderer `sl.longitudinalMaxShare` (`buildLongitudinalMaxShare`, der größte Anteil über alle Zeitreihen und Bereiche), und der rundet ihn auf den nächsten beschrifteten Tick auf (`percentAxisMax`: die Schrittweite, die die Achse bei ihrer Höhe zeichnet), ohne Daten auf 100; gestapelt gilt immer 100.

Datentabelle: die `dataTable()` des `LongitudinalLineChart`: eine Zeile je Jahr der x-Achse, eine Spalte je Stufe in Zeichenfolge, gestapelt oder nicht dieselbe; sie liest die Werte wie der Chart: eine Stufe, die ein Jahr nicht führt, steht mit 0 %, ein Jahr ohne Ergebnis des Bereichs bleibt leer.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `showModuleTitle`, `showSubtitle` | `boolean` | `true` | nein | Descriptor-Defaults aus `LONGITUDINAL_DEFAULT_OPTIONS` |
| `domainIndex` | `number \| Signal<number>` | – | ja | Der Bereich; der Host behält ihn als `state.domainIndex` (`longitudinalInitialState`); Linien, Punkte und Endbeschriftungen sind je Stufe verknüpft und bewegen sich zum neuen Bereich, Weggefallenes blendet aus |
| `isStacked` | `boolean \| Signal<boolean>` | – | ja | Gestapelt oder Linien; als Signal teilen es Host (`state.isStacked`) und Renderer |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `getExportIdentity()` | Override | `domain<index>`, ein Exportziel pro Bereich |
