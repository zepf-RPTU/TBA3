# ChartHostModule + groupComparisonConfig

## Zweck
Die SL-Gegenüberstellung zweier Gruppen als Bevölkerungspyramide: links und rechts je eine Gruppe (Geschlecht, Lerngruppe oder Fach), gemessen an Kompetenzstufen, Lösungsanteilen (Punkte), Selbstwirksamkeit oder Unterrichtsqualität. Der Descriptor füllt die Bedienleiste des Hosts (`bodyControls`) mit den Auswahlfeldern (Selects) und legt die Auswahl in den Host-Zustand (`selection`), der von außen beobachtbar ist.

## Design/Idee

Anhand mehrerer Dropdownmenüs oberhalb der Graphik können Diagrammtyp, Fach bzw. Domäne, Vergleichsebene und vor allem die gewünschte Kategorie (z.B. Geschlecht) samt der beiden zu vergleichenden Gruppen ausgewählt werden. Die Darstellung erfolgt als Bevölkerungspyramide: Die Verteilungen der beiden gewählten Gruppen stehen sich als horizontale Balken links und rechts einer gemeinsamen Mittelachse gegenüber.

Eine Bevölkerungspyramide nach dem üblichen Muster: die Zeilenbeschriftungen (Kompetenzstufe, Lösungsquoten-Spanne, Bewertungsband) stehen in einer gemessenen Mittelspalte, links wächst Gruppe 1, rechts Gruppe 2 je auf einer eigenen 0–100-%-Achse nach außen. Benennen die Stufenfolgen zweier Fächer eine Zeile verschieden, teilt sich die Spalte: links der Name für Gruppe 1, rechts der für Gruppe 2. Am Ende jedes Flügels steht der Anteil, über jedem Flügel der Gruppenname mit `n`.

Die Auswahl hält nur, was in den gezeichneten Zeilen vorkommt: Ändert sich Diagrammtyp, Fach/Domäne oder Vergleichsebene, fällt eine Lerngruppe als Vergleichsebene, die dort keine Zeilen hat, auf die Schule zurück, die Kategorie auf eine dort gültige, und das Paar bleibt nur, solange beide Gruppen dort Zeilen haben; sonst gelten die Vorgaben der Kategorie (Weiblich/Männlich, unter Fach das gewählte Fach bzw. Fach/Domäne und das erste andere).

In der Kategorie Fach ist eine Gruppe bei den Kompetenzstufen ein Paar aus Fach und Domäne („Deutsch: Lesen“, „Englisch: Hören“; ein Fach ohne Domänen wie Mathematik heißt nur nach dem Fach): Jede Domäne hat ihre eigene Stufenfolge, und eine Lerngruppe kann nur einige Domänen eines Fachs bearbeitet haben (ein Deutsch-Testheft deckt zwei ab). Angeboten werden die Paare mit Zeilen in der Vergleichsebene, in Payload-Reihenfolge; Wert ist der Schlüssel `Fach|domain.id` (`subjectDomainKey`), den Namen tragen Auswahlfeld, Flügelkopf, Tooltip, Datentabelle und Kasten. Die Lösungsquote vergleicht ganze Fächer, je Person über alle Domänen des Fachs summiert, Unterrichtsqualität ebenso je Fach.

Alle vier Diagrammtypen liefern dasselbe Zeilenmodell (`measureLabel`, `rows`, `groups`), sodass ein Zeichenweg alle bedient. Ein Wechsel von Gruppe 1/2 zeichnet nicht neu, sondern bewegt Balken, Anteile und Kopfzeilen per geschlüsseltem Join zu den neuen Werten; bei reduzierter Bewegung springt er.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group` | `name`, `subject.name`¹, `competenceLevels[].nameShort` (Stufenfolge je Fach×Domäne), `properties[booklet]`¹ der Lerngruppenzeilen |
| `competence-levels` | `type=students` | `covariates[group]`¹ (gleich `name` der Lerngruppenzeile), `subject.name`¹, `competenceLevels[].nameShort` (die Stufe der Person) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Eine Schüler:innen-Zeile zählt nur, wenn `covariates[group]`, `subject.name` und `domain.id` mit einer Lerngruppenzeile übereinstimmen; sonst zeigt der Kompetenzstufen-Vergleich keine Daten. Eine Person ohne `covariates[gender]` zählt in Lerngruppe und Fach mit, für alle vier Diagrammtypen. „Lösungsquote“ bleibt in der Auswahl, ist aber gesperrt, wenn die Lerngruppen des verglichenen Paars in der gewählten Domäne (unter der Kategorie Fach: im ganzen Fach) zwei oder mehr Testhefte nennen; beurteilt wird das Paar, das ein Wechsel zur Lösungsquote vergleicht. Steht der Diagrammtyp schon darauf, zeigt der Chart `messages.points-mixed-booklets` statt der Pyramide, und der Kasten nennt keine Werte.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` | `domain` | Die Auswahl „Fach/Domäne“ und die Kategorie Fach bei Kompetenzstufen bieten je Fach einen Eintrag ohne Domäne; zwei Zeilen derselben Gruppe eines Fachs ohne `domain` weist der Store ab (`DocumentShapeError`) |
| `competence-levels` (`type=students`) | `covariates[gender]` (`male`, `female`, `diverse`) | Die Person fehlt nur in der Kategorie Geschlecht; hat niemand eine Angabe, bleibt die Kategorie ohne Gruppen |
| `aggregations` (`type=students`, `aggregation=result`) | `aggregations[type=result]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `descriptiveStatistics.frequency`, dazu `subject.name`, `domain.id`, `covariates[group]`, `covariates[gender]` | Kein Diagrammtyp „Lösungsquote“; eine Zeile ohne Fach oder ohne Antworten (alle drei `frequency` 0) fällt weg, eine ohne Geschlecht fehlt nur in der Kategorie Geschlecht |
| `competence-levels` (`type=students`) | `properties[sp_mean]` | Kein Diagrammtyp „Selbstwirksamkeit“ |
| `competence-levels` (`type=students`) | `properties[tq_mean]` | Kein Diagrammtyp „Unterrichtsqualität“ |

Store: der Descriptor nennt in `documents` drei Datasets aus `groupComparisonChartTypes.js`: `COMPARISON_SOURCES` (`sl.groupComparisonSources` über `sl.domainResults`, `sl.comparisonSelfEfficacy`, `sl.comparisonTeachingQuality` und `sl.comparisonPoints`, die Fach/Domänen-Liste mit den Ergebnissen je Eintrag), `COMPARISON_ROWS` (die Zeilen einer Auswahl, mit der Auswahl gelesen) und `POINTS_MIXED_BOOKLETS`. Der Descriptor gibt dem Chart die Quellen und je eine Funktion für die Zeilen und das Testheft-Urteil einer Auswahl, die das Dataset mit der Auswahl liest, einmal je Store und Auswahl gebaut — dieselben Zeilen, die der Kasten zusammenfasst. Den Store selbst sieht der Chart nicht. Jeder Diagrammtyp ist eine Zeile von `CHART_TYPE_CONFIG` (Messfamilie, was der Fach/Domänen-Select wählt, die Gruppe der Kategorie Fach, Quelle, Zeilen, Aufbereitung); die Gruppen-Selects bieten die Werte, die in den gezeichneten Zeilen vorkommen (bei Lerngruppe also nur Lerngruppen mit Daten im gewählten Fach/Domäne). `sl.domainResults` (aus `competence-levels.json`, `students-competence-levels.json` und den Stufendefinitionen) liefert die Ergebnisse je Fach×Domäne und Person; `sl.comparisonSelfEfficacy` und `sl.comparisonTeachingQuality` kommen aus `students-competence-levels.json`, `sl.comparisonPoints` aus `students-aggregations.json`. Ob ein Paar unter „Lösungsquote“ Testhefte mischt, entscheidet `POINTS_MIXED_BOOKLETS` einmal je Store und Auswahl über die Testhefte der Lerngruppen in `sl.competenceLevelIndex` (eine seiner Eingaben), je gewählter Domäne, unter der Kategorie Fach je Fach; Chart, Auswahlfeld und Kasten lesen dasselbe Urteil. Die Beschriftungen der Auswahlfelder und der Platzhalter „Nicht fachspezifisch“ einer Messgröße ohne Fach stehen im Glossar (`sl.comparison.comparison-plot.interface`, `subjectIndex-none`).

Datentabelle: die Tabelle ist die `dataTable()` des `GroupComparisonChart`: eine Zeile je Band der Pyramide, oben zuerst, und je Gruppe Anteil und Anzahl; eine Gruppe ohne Mitglieder hat keine Anteile. Steht statt der Pyramide ein Hinweis, gibt es keine Tabelle.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `showModuleTitle` | `boolean` | `true` | nein | Descriptor-Defaults für den Host |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `initialState(host)` | Descriptor-Hook | `controls` und `selection`, beide `computed` über `host.chart`: das Auswahlmodell (`getControlModel()`) und die Auswahl `{ chartType, subjectIndex, category, scopeFilter, group1, group2 }` des lebenden Charts (`chart.selection`); vor dem ersten Renderer `[]` bzw. `null` |
| `getExportIdentity()` | Override | Die aktuellen Werte aller Selects (unter Kategorie Fach bei Kompetenzstufen die Fach/Domänen-Schlüssel, `subjectDomainKey`), jede Auswahl ist ein eigenes Exportziel |
| `bodyControls(host)` | Descriptor-Hook | Je Auswahlfeld des Modells im Host-Zustand `controls` ein beschriftetes Select (lit `repeat`, nach Id geschlüsselt: ein Select behält Knoten und Fokus über jede Änderung); Beschriftung aus dem Glossar, Optionen aus den Daten |

Keine `publicAPI`: die Selects steuern den Chart direkt. Aus `controls` rendern Leiste und Export-Identität; `selection` ist von außen beobachtbar (`watch`) und gilt ab dem Schreiben; die Zusammenfassung einer Auswahl ist das Dataset `GROUP_COMPARISON_SUMMARY`. Die Leiste steht, sobald der Host den Renderer hält.
