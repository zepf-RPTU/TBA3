# SlGroupTableModule

## Zweck
Die SL-Tabelle nach Lerngruppen: eine Tabulator-Tabelle, gruppiert nach Abschnitt, zuerst „Schule“ mit dem Aggregat aller Lerngruppen, dann eine Gruppe `Lerngruppe <Name>` je Lerngruppe, nach Namen sortiert; die Gruppen starten zugeklappt, ein Klick auf die Kopfzeile klappt sie auf. In jeder Gruppe eine Zeile pro Fach; Domänen stehen gestapelt in der Zelle (Name und Kompetenzstufenbalken je Domäne). Den Namen nennt die Zeile eines Fachs, das die Schule in mehreren Domänen geschrieben hat, auch wenn die Lerngruppe nur eine davon schrieb; ein Fach, das die Schule als Ganzes schrieb, zeigt in der Domänen-Spalte „–“. Unterrichtsqualität je Fach und eine Fußzeile Selbstwirksamkeit je Abschnitt teilen sich eine Spalte, als Boxplot oder gestapelter Balken je `vizMode`. Die Merkmale-Spalten sind die Vereinigung über alle Abschnitte; ein Abschnitt ohne ein Merkmal zeigt es mit 0. Spaltenmenü, Filter und Export gelten für die ganze Tabelle.

## Design/Idee

Neben graphischen Darstellungen stehen zur Abbildung der Daten wahlweise auch Tabellen zur Verfügung. In dieser Variante sind die Ergebnisse nach Lerngruppen (und der Schule) gruppiert und jedes Fach innerhalb einer Zeile zusammengefasst; die Domänen eines Fachs stehen innerhalb der Zelle übereinander. Die Tabelle verwendet simplifizierte inline-Abbildungen (stacked bar charts/box plots) und einfache Zahlen. Die Ergebnisse werden generell über die Lerngruppe hinweg aggregiert, eine Aufschlüsselung nach individuellen SuS findet innerhalb der Schulleitungsrückmeldung nicht statt. Schulleitungen, die gezielt einzelne SuS aufrufen möchten, müssen auf die fachspezifischen Ergebnisrückmeldungen zugreifen. Neben Leistungsdaten finden Schulleitungen hier auch Informationen zu allgemeinen Merkmalen wie der Geschlechtsverteilung.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group` | `type`¹, `name`, `subject.name`¹, `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency`, `.total` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Schul- und Landesschnittzeilen liest die Tabelle nicht, auch nicht die `id` der Schulzeile; Lerngruppenzeilen ohne `name` oder `subject` fallen weg. Die Balken zeichnen die `frequency` je Stufe. Die Anzahl einer Fachzeile mit einer einzigen Domäne ist das `total` der Lerngruppenzeile, im Abschnitt „Schule“ die Summe dieser `total` über die Lerngruppen; ein nach Domänen geteiltes Fach hat keine Zeile, die seine Anzahl nennt, und zählt deshalb die verschiedenen Schüler:innen (Lerngruppe und `id`) über alle Domänen im Schüler:innen-Dokument.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` | `domain` | Das Fach gilt als Fach ohne Domänen: eine Fachzeile je Lerngruppe; zwei Zeilen derselben Gruppe eines Fachs ohne `domain` weist der Store ab (`DocumentShapeError`) |
| `competence-levels` (`type=students`) | `covariates[group]` (gleich `name` der Lerngruppenzeile), `subject.name`, `domain.id` (wie die Lerngruppenzeile) | Die Person gehört zu keiner Lerngruppe und zählt weder in M/W/D und Merkmalen noch in der Anzahl eines nach Domänen geteilten Fachs; passt keine Person, zeigen M/W/D 0 und die Merkmale-Spalten entfallen. |
| `competence-levels` (`type=students`) | `covariates[gender]` | Die Spalten M, W, D zeigen 0 |
| `competence-levels` (`type=students`) | `properties[tq_mean]` | Die Fachzeilen bleiben in der Spalte Unterrichtsqualität leer; fehlt auch `sp_mean`, entfällt die Spalte |
| `competence-levels` (`type=students`) | `properties[sp_mean]` | Keine Fußzeile Selbstwirksamkeit; fehlt auch `tq_mean`, entfällt die Spalte |

Dokumente (`static documents`): `SL_TABLE_DOCUMENTS` (siehe [SlBaseTableModule](slBaseTableModule.md#daten)) und die Datasets `sl.traitLabels` (`SL_DATASETS.TRAIT_LABELS`, `readTraitLabels` über `students-competence-levels.json`: der Tooltip eines Merkmal-Spaltenkopfs, dessen Code das Glossar nicht kennt), `sl.resultSections` (`SL_DATASETS.RESULT_SECTIONS`) und `sl.schoolResults` (`SL_DATASETS.SCHOOL_RESULTS`). Payload: keiner. `sl.resultSections` liefert die Abschnitte: zuerst die Schule aus `sl.schoolResults` (`buildSchoolResults`: die Summen der Lerngruppen, dieselben wie die Schulzeile der Domänentabelle; Unterrichtsqualität und Selbstwirksamkeit der Schule stehen unter der Lerngruppe `null`), dann je Lerngruppe ihre Ergebnisse aus `sl.groupResults` (`buildGroupResultsFromJson` über `sl.domainResults`, `buildDomainResultsFromJson` in `utils/slResultsDerivation.js`). `sl.schoolResults` sagt außerdem, welche Fächer die Schule in mehreren Domänen geschrieben hat.

Export: die verborgene Spalte `Lerngruppe` (`Schule` oder der Name) trägt jede Zeile, weil CSV und JSON keine Gruppenköpfe kennen. Die Gender-Exportspalten liegen in der Spaltengruppe „Geschlechtsverteilung“ und heißen darum im Export `Geschlechtsverteilung – Männlich` usw.; sie tragen die Anzahlen der Zellen. Die Merkmale exportieren ihre Anzahlen und je Merkmal eine verborgene Spalte `<Merkmal> (%)` mit dem Anteil an den Schüler:innen der Zeile, solange die Spalte des Merkmals sichtbar ist. Die Anteile, die die Balken zeichnen (`fieldShare`), exportiert je Domäne und Kompetenzstufe eine eigene Zahlenspalte `<Domäne> – KS <Stufe> (%)` (ohne benannte Domäne `KS <Stufe> (%)`), in der Reihenfolge, in der die Zeilen sie zuerst tragen; eine Zeile ohne diese Domäne oder Stufe lässt die Zelle leer.

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderBody()` | Override | Die Tabelle aus Schule und Lerngruppen bauen; ohne Ergebnisse bleibt sie leer |
