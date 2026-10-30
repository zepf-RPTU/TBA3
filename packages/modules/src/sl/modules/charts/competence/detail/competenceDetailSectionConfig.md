# ChartHostModule + competenceDetailSectionConfig

## Zweck
Der Kompetenzstufen-Detailchart einer Gruppe (ein Fach über alle Lerngruppen, eine Lerngruppe über alle Fächer, oder die Schule): Balken pro Lerngruppe, Schule und Vergleichswert (Landesschnitt und jeder andere gelieferte Vergleich), je Domäne gruppiert, wahlweise mit Unterrichtsqualität als gestapeltem Balken oder Boxplot (`vizMode`). Als Vollchart oder als kompaktes Wasserzeichen (`thumbnail`), beide in derselben Darstellung. Im Vollchart behält jeder Balken eine lesbare Breite und jede Beschriftung ihren Abstand, auch die Fach- bzw. Domänennamen unter der Achse; reicht die Breite dafür nicht, scrollt der SVG-Bereich horizontal. Fächer und Domänen stehen auf der Achse, in der Legende und in den Balkenplätzen in der Reihenfolge der Lieferung, nie alphabetisch und unabhängig davon, welche Fächer die erste Lerngruppe geschrieben hat. Nach Fach gruppiert bildet jede Domäne eines Fachs einen eigenen Balkenblock, gleich wie viele Domänen das Fach hat: zwischen zwei Blöcken eine Lücke, über jedem Block das Kürzel der Domäne, verlinkt auf ihren Glossareintrag, wo es einen gibt.

## Design/Idee

Zusätzlich zur vollständigen Abbildung in der Gesamtübersicht stehen wahlweise die Kompetenzstufenverteilungen als fach- oder lerngruppenspezifischer Teilausschnitt zur Verfügung. Je nach gewählter Aggregationslogik werden alle Lerngruppen innerhalb einer Domäne oder alle Domänen innerhalb einer Lerngruppe gegenübergestellt. Für jede Ansicht wird ein entsprechender Infokasten angezeigt. Seitens der Entwicklungsgruppe ist nicht intendiert, dass Schulleitungen alle Ansichten durchgehen, sondern vielmehr anhand der Übersichten gezielt kritische Teilergebnisse auswählen und diese dann im Detail explorieren. Selbstwirksamkeit und Unterrichtsqualität werden in die Ansichten integriert, können jedoch problemlos entfernt werden.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group` | `type`¹ (`school` findet die Schulzeile), `id`¹ der Schulzeile (Vergleichszeilen: je `id` ein Balken), `name`, `subject.name`¹, `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency`, `.total` (ohne `total`: `.mean`) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Zeilen ohne `subject` fallen weg. Lerngruppen-, Schul- und Landesschnittbalken zeichnen `frequency / total` ihrer eigenen Zeile, nicht `mean`, das der Server auf vier Stellen rundet; eine Zeile ohne `total` (Landesschnitt nur mit Anteilen) ihr `mean`. Den Schulschnitt liest der Chart aus der Schulzeile des Fachs bzw. der Domäne, dieselbe Zahl wie in der Kompetenzstufenübersicht ([competenceChartConfig](../overview/competenceChartConfig.md)); die Schulzeile zählt auch Schüler:innen außerhalb der gelieferten Lerngruppen. Ein Landesschnitt zeichnet auf seiner eigenen Stufenleiter, nicht auf der der Lerngruppen. Der Tooltip liest Anzahl und Gesamtanzahl aus der Zeile des Balkens selbst; ein Landesschnitt ohne eigene Zahlen zeigt keine, er leiht sich nicht die der Schule.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` | Zeile mit `type=school` je Fach×Domäne | Der Schulschnittbalken bleibt leer; die Lerngruppen werden nicht aufsummiert |
| `competence-levels` | `domain` | Das Fach gilt als Fach ohne Domänen: ein Bereich unter dem Fachnamen; zwei Zeilen derselben Gruppe eines Fachs ohne `domain` weist der Store ab (`DocumentShapeError`) |
| `competence-levels` | Vergleichszeilen (`comparison=state-average`) | Keine Vergleichsbalken und kein L-Schalter |
| `competence-levels` (`type=students`) | `properties[tq_mean]` mit `subject.name` und `covariates[group]` (gleich `name` der Lerngruppenzeile) | Keine Spalte „Q“ und kein Schalter Unterrichtsqualität |

Store: der Descriptor nennt in `documents` die Datasets `sl.competenceLevelIndex` (aus `competence-levels.json`) und `sl.teachingQualityIndex` (`sl.teachingQuality` aus `students-competence-levels.json`, nach Lerngruppe und Fach geschlüsselt). `createRenderer(host)` wählt mit `selectCompetenceSlice` (`slCompetenceSlices.js`) aus dem Index die Chart-Gruppe: mit `groupName` die Domänen dieser Lerngruppe, mit `subjectName` die Domänen dieses Fachs, mit keinem von beiden alle Domänen der Schule; passt keine Domäne, entsteht kein Renderer. Die Gruppe sind die `domainBuckets` (`groupsBySubjectDomain`, die rohen Lerngruppenzeilen je Fach×Domäne); der Renderer erhält alle, auch wenn es nur einer ist, dazu den Index selbst (`index`), aus dem er je Fach×Domäne die Schulzeile (`schoolFor`) und die Vergleichszeilen (`comparisonsFor`) liest. Alle Zeilen einer Domäne stehen auf der Stufenleiter ihrer vollständigsten Zeile. `sl.teachingQuality` (`buildTeachingQualityByGroupSubject`) zählt je Lerngruppe über `covariates[group]` gleich dem `name` der Lerngruppenzeile, je Person über `id`, `groupName: 'Schule'` für den Schulschnitt. Aus den Optionen liest der Renderer `groupName`, `showOnlySchoolData`, `averagesHidden` und `vizMode`; als Vorschaubild erhält er `thumbnail: true` und keine Legende.

Datentabelle: die `dataTable()` des `CompetenceDetailRenderer` gibt bis zu zwei Tabellen:

- `Kompetenzstufen`: eine Zeile je gezeichnetem Balken in Zeichenfolge (Bereich, Gruppe, Anzahl, je eingeblendeter Stufe Anteil und Anzahl); Stufen außerhalb der Leiter des Fachs und Balken ohne Schüler:innen bleiben leer, ein Vergleichswert nur mit Anteilen zeigt keine Anzahl.
- `Unterrichtsqualität (kogn. Aktivierung)`, solange gezeichnet: eine Zeile je Gruppen-Slot, Bereich ist das Fach (die Unterrichtsqualität gilt je Fach); im Boxplot die Kennwerte des Tooltips, sonst je Band Anteil, Anzahl und Mittelwert.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `subjectName` | `string\|null` | – | nein | Das Fach: wählt dessen Domänen |
| `groupName` | `string\|null` | – | nein | Die Lerngruppe: wählt deren Domänen; hat Vorrang vor `subjectName` |
| `showOnlySchoolData` | `boolean` | `false` | nein | Nur das Schulaggregat zeichnen |
| `averagesHidden` | `boolean` | `false` | nein | Die Vergleich-Schalter (Landesschnitt und jeder andere Vergleich, neben Lerngruppenbalken auch der Schulschnitt) starten aus; ein Umschalten der Betrachter:in bleibt beim Neuzeichnen erhalten |
| `vizMode` | `string \| Signal<string>` | – | ja | Unterrichtsqualität als `'stacked_bar'` oder `'boxplot'`; als Signal teilen es Host (`state.vizMode`) und Renderer; ein Wechsel zeichnet in place neu |
| `glossaryKey`, `glossaryReplacements` | `string`, `object` | – | nein | Titel je Panel |

## Methoden
Keine eigenen.
