# SlLongitudinalViewModule

## Zweck
Die „Entwicklung“: mehrjährige Zeitreihen der Kompetenzstufenanteile, der Unterrichtsqualität und der Selbstwirksamkeit als Chart-Karten in einer Zeile. Jede Karte entsteht nur, wenn ihr Datenausschnitt existiert. Der Header wählt die Domäne, die normale oder gestapelte Ansicht und den Diagrammtyp; im Boxplot-Modus zeigt die View statt der beiden Umfragekarten die Boxplot-Karte beider Skalen, mit doppelter Breite.

## Design/Idee

Zentraler Wunschgegenstand der entwickelnden Schulleitungen war die Gegenüberstellung mehrerer Jahrgänge. Auch wenn die Lernstandserhebungen/Vergleichsarbeiten keinen längsschnittlichen Vergleich zulassen und aufeinanderfolgende Jahrgänge unabhängige und damit schwer vergleichbare Gruppen darstellen, wurde der zeitliche Verlauf als wichtiger evaluativer Indikator erachtet. Die Ansicht zeigt Unterrichtsqualität, Selbstwirksamkeit sowie die Kompetenzstufenverteilung einer im Kopfmenü ausgewählten Domäne für die gesamte Schule über fünf aufeinanderfolgende Messzeitpunkte. Alle Verläufe können als einfache Linien oder als gestapelte Flächen angezeigt werden; für Unterrichtsqualität und Selbstwirksamkeit steht außerdem eine gemeinsame Boxplot-Darstellung zur Verfügung.

Der Boxplot ist ein gemeinsamer Chart beider Skalen und ersetzt die beiden Umfragekarten. Mit nur einer Skala zeichnete er einen halben Chart und versteckte die Karte, die noch Daten hat; deshalb gibt es Karte und Umschalter nur mit beiden Skalen, und beide fragen dieselbe Probe.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Unterrichtsqualität (Liniendiagramm, im Boxplot-Modus versteckt) | `ChartHostModule` + `teachingQualityConfig` | [teachingQualityConfig.md](../../../packages/modules/src/sl/modules/charts/longitudinal/teachingQualityConfig.md) | nur mit `tq_mean` (`hasTeachingQuality`) |
| Selbstwirksamkeit (Liniendiagramm, im Boxplot-Modus versteckt) | `ChartHostModule` + `selfEfficacyLongConfig` | [selfEfficacyLongConfig.md](../../../packages/modules/src/sl/modules/charts/longitudinal/selfEfficacyLongConfig.md) | nur mit `sp_mean` (`hasSelfEfficacy`) |
| Boxplot beider Skalen (nur im Boxplot-Modus sichtbar) | `ChartHostModule` + `longitudinalBoxPlotConfig` | [longitudinalBoxPlotConfig.md](../../../packages/modules/src/sl/modules/charts/longitudinal/longitudinalBoxPlotConfig.md) | nur mit `tq_mean` und `sp_mean` |
| Kompetenzstufenanteile (immer sichtbar) | `ChartHostModule` + `longitudinalCompetenceLevelShareConfig` | [longitudinalCompetenceLevelShareConfig.md](../../../packages/modules/src/sl/modules/charts/longitudinal/longitudinalCompetenceLevelShareConfig.md) | nur mit mindestens einem Bereich in `LONGITUDINAL_SUBJECT_DOMAINS` |

Alle Hosts zeigen ihren Glossar-Untertitel und werden ohne Payload gebaut. Die Verfügbarkeitsprobe der beiden Umfragekarten ist das Dataset `sl.historySurveyScales`: eine Karte entsteht, wenn `history` für ihre Skala mindestens ein Jahr mit Werten trägt. Ihr `offersBoxPlot` (beide Skalen) entscheidet über die Boxplot-Karte und den Diagrammtyp-Umschalter des Headers.

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=school,group,students`, `comparison=state-average,year` | alle Karten über `history` (Dataset `LONGITUDINAL_INDEX`: die Zeilen des aktuellen Jahres und die Vorjahre aus `prior-years.json`; die Kompetenzstufenanteile aus den `school`-Zeilen, Unterrichtsqualität und Selbstwirksamkeit aus den `student`-Zeilen, deren `tq_mean`/`sp_mean` nur die Demo-Fixture liefert); ob die Unterrichtsqualitäts- und die Selbstwirksamkeitskarte entstehen |
| | | alle Karten über `subjectDomains` (Dataset `LONGITUDINAL_SUBJECT_DOMAINS`, `buildLongitudinalSubjectDomains(history)`: welche Bereiche die `school`-Zeilen des jüngsten Jahres abdecken, und ihre Stufenfolge); Domäne-Select des Headers |
| | | ob die Kompetenzstufenkarte entsteht (`LONGITUDINAL_SUBJECT_DOMAINS` nicht leer) |

Payload: keiner. Die Karten lesen `LONGITUDINAL_SUBJECT_DOMAINS` und `LONGITUDINAL_TIMELINES` selbst (jede nimmt ihre Reihe aus den Zeitreihen) und teilen ein y-Maximum über alle Zeitreihen und Bereiche (`LONGITUDINAL_MAX_SHARE`), damit eine Linie bei 20 % in jeder Karte gleich hoch liegt. Der Wert eines Eintrags der Domänenauswahl ist die Position des Bereichs in `subjectDomains`. Die Hosts bekommen `selectedDomainIndex` und `longitudinalViewMode` als Signale und folgen ihnen selbst.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `selectedDomainIndex` | Domäne-Select des Headers (`domainSelect`) | Als Option `domainIndex` an alle Hosts; Unterrichtsqualität, Boxplot und Kompetenzstufenanteile folgen ihm selbst |
| `longitudinalViewMode` (`normal` / `stacked`) | Header-Umschalter (`viewToggle`) | Als abgeleitetes Signal `isStacked` (`computed`) an alle Hosts; die drei Liniendiagramme folgen ihm selbst |
| `longitudinalChartType` (`lines` / `boxplot`) | Header-Umschalter (`chartTypeToggle`, nur mit beiden Skalen angeboten) | Die beiden Umfragekarten oder die Boxplot-Karte `show()` / `hide()`; ohne Boxplot-Karte bleiben die Umfragekarten |

## Verdrahtung
Keine Geschwister-Verdrahtung; die Hosts hängen nur am App-State.

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Je vorhandenem Datenausschnitt einen Host erzeugen und in die Kartenzeile setzen; der Diagrammtyp des Headers bestimmt, welche sichtbar sind |
