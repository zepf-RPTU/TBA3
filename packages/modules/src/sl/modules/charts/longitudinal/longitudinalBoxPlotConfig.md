# ChartHostModule + longitudinalBoxPlotConfig

## Zweck
Der SL-Boxplot der beiden Umfragemaße über die Jahrgänge: je Jahrgang eine Box der Unterrichtsqualität (oben) und eine der Selbstwirksamkeit (unten) für den gewählten Bereich (Fach×Domäne), die Boxen eines Maßes an den Medianen verbunden.

## Design/Idee

Im Falle der Boxplot-Darstellung werden Unterrichtsqualität und Selbstwirksamkeit von fünf aufeinanderfolgenden Jahrgängen zusammen in einem Graphen dargestellt; er ersetzt die beiden einzelnen Verlaufsdarstellungen.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group,students`, `comparison=state-average,year` | Zeitreihe (Zeilen mit `properties[testPeriod]`): `type`¹ (nur `student`-Zeilen), `id`¹, `subject.name`¹, `properties[tq_mean]`¹, `properties[sp_mean]`¹, `properties[testPeriod]`¹; die `school`-Zeilen des aktuellen Jahres bestimmen die Bereiche und benennen sie (`domain.name`); eine `student`-Zeile zählt in ihrem Jahr zum Bereich ihres `subject.name` und ihrer `domain.id` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Die Karte setzt eine Zeitreihe mit `tq_mean` und `sp_mean` voraus (`sl.historySurveyScales`). Der Boxplot behält nur Jahre, in denen beide Maße Werte haben.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`school`-Zeilen des aktuellen Jahres, `student`-Zeilen) | `domain.id` | Je Fach nur ein Bereich; eine `student`-Zeile ohne `domain.id` steht für das ganze Fach und zählt zu jedem seiner Bereiche |

Store: der Descriptor nennt in `documents` `sl.longitudinalSubjectDomains` und `sl.longitudinalSurveyBoxes` (`SL_DATASETS.LONGITUDINAL_SURVEY_BOXES`, über `sl.longitudinalIndex`, `indexHistory` in `sl/utils/slHistory.js`). `createRenderer(host)` gibt dem Renderer die Zeitreihe als `computed` über `state.domainIndex`: das Dataset, mit dem `domainIndex` gelesen, baut mit `buildSurveyBoxTimeline` aus dem Index je Jahr die Box-Statistik von `tq_mean` der Schüler:innen des Bereichs und `sp_mean` der ganzen Schule, einmal je Store und Bereich beim ersten Zeigen. Die Box ist die gemeinsame Figur der SL-Boxplots (`boxPlotFigure.js`); ihr Tooltip nennt Jahr, Maß und die Box-Statistik. Ein Legendenfeld neben dem Plot ordnet die Farben den Maßen zu und erklärt die Box (`boxPlotKey`).

Datentabelle: die Tabelle ist die `dataTable()` des `LongitudinalBoxPlotChart`: eine Zeile je Jahr und Kennzahl, das älteste zuerst, mit den Kennwerten des Tooltips (Anzahl, Median, Mittelwert, Standardabweichung, Q1, Q3, Min und Max der Whisker; im Export mit zwei Nachkommastellen).

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `showModuleTitle`, `showSubtitle` | `boolean` | `true` | nein | Descriptor-Defaults aus `LONGITUDINAL_DEFAULT_OPTIONS` |
| `domainIndex` | `number \| Signal<number>` | – | ja | Der Bereich; der Host behält ihn als `state.domainIndex` (`longitudinalInitialState`); die Boxen sind je Jahrgang verknüpft und bewegen sich zum neuen Bereich |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `getExportIdentity()` | Override | `domain<index>` |
