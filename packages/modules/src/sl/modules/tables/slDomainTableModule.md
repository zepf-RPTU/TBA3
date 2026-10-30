# SlDomainTableModule

## Zweck
Die SL-Tabelle nach Fächern: eine Tabulator-Tabelle, gruppiert nach Fach und Domäne, mit je einer Zeile pro geliefertem Vergleichswert (Landesschnitt oder ein anderer Vergleich), der Schule und jeder Lerngruppe. Spalten: Unterrichtsqualität und Selbstwirksamkeit (Boxplot oder gestapelter Balken je `vizMode`), Kompetenzstufenverteilung, Anzahl, Geschlechtsverteilung, Merkmale; dazu verborgene Download-Spalten mit den Anteilen, die die Balken zeigen (`KS <Stufe> (%)`, `Männlich (%)` …; eine Stufe außerhalb der Leiter einer Zeile bleibt leer). Eine Merkmalszelle zeigt an der Schulzeile den Anteil an den Schüler:innen der Schule, an einer Lerngruppenzeile die Anzahl; der Download führt in jeder Zeile die Anzahl und in einer verborgenen Spalte `<Merkmal> (%)` den Anteil an den Schüler:innen der Zeile (leer an einer Vergleichszeile ohne Anzahlen), solange die Spalte des Merkmals sichtbar ist.

## Design/Idee

Neben graphischen Darstellungen stehen zur Abbildung der Daten wahlweise auch Tabellen zur Verfügung. In dieser Variante sind die Ergebnisse fachweise gruppiert und jede Lerngruppe sowie Schule und Vergleichswerte innerhalb einer Zeile zusammengefasst. Die Tabelle verwendet simplifizierte inline-Abbildungen (stacked bar charts/box plots) und einfache Zahlen. Die Ergebnisse werden generell über die Lerngruppe hinweg aggregiert, eine Aufschlüsselung nach individuellen SuS findet innerhalb der Schulleitungsrückmeldung nicht statt. Schulleitungen, die gezielt einzelne SuS aufrufen möchten, müssen auf die fachspezifischen Ergebnisrückmeldungen zugreifen. Neben Leistungsdaten finden Schulleitungen hier auch Informationen zu allgemeinen Merkmalen wie der Geschlechtsverteilung.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group` | `type`¹, `name`, `subject.name`¹, `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency`, `.total` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Die Schulzeile des Dokuments wird nie Lerngruppen- oder Vergleichszeile. Lerngruppenzeilen ohne `name` oder `subject` fallen weg. Die Anzahl ist das `total` der Lerngruppenzeile, die Schulzeile summiert sie aus den Lerngruppen; ein Landesschnitt zeichnet `frequency / total` je Stufe, ohne `total` sein `mean`.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` | `domain` | Das Fach gilt als Fach ohne Domänen: eine Gruppe unter dem Fachnamen; zwei Zeilen derselben Gruppe eines Fachs ohne `domain` weist der Store ab (`DocumentShapeError`) |
| `competence-levels` | Vergleichszeilen (`comparison=state-average`) | Keine Vergleichszeilen in den Gruppen |
| `competence-levels` (`type=students`) | `covariates[group]` (gleich `name` der Lerngruppenzeile), `subject.name`, `domain.id` (wie die Lerngruppenzeile) | Die Person gehört zu keiner Lerngruppe und zählt in Geschlechts- und Merkmalsspalten nicht mit; passt keine Person, zeigen die Geschlechtsspalten 0 und die Merkmalsspalten entfallen. |
| `competence-levels` (`type=students`) | `covariates[gender]` | Die Geschlechtsspalten zeigen 0, der Geschlechtsbalken bleibt leer |
| `competence-levels` (`type=students`) | `properties[tq_mean]` | Die Spalte Unterrichtsqualität entfällt |
| `competence-levels` (`type=students`) | `properties[sp_mean]` | Die Spalte Selbstwirksamkeit entfällt |

Dokumente (`static documents`): `SL_TABLE_DOCUMENTS` (siehe [SlBaseTableModule](slBaseTableModule.md#daten)), die Datasets `sl.traitLabels` (`SL_DATASETS.TRAIT_LABELS`, `readTraitLabels` über `students-competence-levels.json`: der Tooltip eines Merkmal-Spaltenkopfs, dessen Code das Glossar nicht kennt), `sl.domainResults` (`SL_DATASETS.DOMAIN_RESULTS`), `sl.schoolResults` (`SL_DATASETS.SCHOOL_RESULTS`) und `sl.competenceLevelIndex` (`SL_DATASETS.COMPETENCE_LEVEL_INDEX`). Payload: keiner. `sl.domainResults` (`buildDomainResultsFromJson`, `utils/slResultsDerivation.js`) liefert die Ergebnisse aller Lerngruppen; die Vergleichszeilen kommen aus `sl.competenceLevelIndex` (`buildCompetenceLevelIndex` über `competence-levels.json`), dessen `comparisonsFor` sie einmal nach Fach und Domäne gruppiert; ihre Anteile liest `parseCompetenceLevels` (`readLevelPercentages`, dieselbe Regel wie die SL-Diagramme). Die Ergebnisse der Schule aus `sl.schoolResults` sind das Gerüst der Gruppen (je Fach und Domäne eine, in der Reihenfolge der Lerngruppen); die Schulzeile ist das Ergebnis der Schule (`buildSchoolResults`: die Summen der Lerngruppenzeilen, dieselben wie im Abschnitt „Schule“ der Lerngruppentabelle).

## Optionen
Keine eigenen.

## Methoden
Keine eigenen.
