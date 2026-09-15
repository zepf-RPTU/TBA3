# SlDomainTableModule

## Zweck
Die Tabelle der SL-Übersicht „nach Fächern“: eine Tabulator-Tabelle, gruppiert nach Fach und Domäne, mit je einer Zeile pro geliefertem Vergleichswert (Landesschnitt), der Schule und jeder Klasse. Spalten: Unterrichtsqualität und Selbstwirksamkeit (Boxplot oder gestapelter Balken je `vizMode`), Kompetenzstufenverteilung, Anzahl, Geschlechtsverteilung, Merkmale; dazu verborgene Download-Spalten mit den Zahlen hinter den Balken.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../module-base/src/modules/contentModule.md)
    - [TableModule](../../../common/tables/tableModule.md)
      - [SlBaseTableModule](slBaseTableModule.md)
        - **SlDomainTableModule** — über Mixin `withTableModeState`

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group` | `type`¹ (`group` macht eine Zeile zur Klasse, `state` findet die Landesschnitte), `name`, `subject.name`¹, `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency`, `.total` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Als Klasse zählt nur eine Zeile mit `type=group`; ohne `type` gibt es keine Klassenzeile und keine Tabelle. Die Schulzeile des Dokuments wird nie Klassen- oder Vergleichszeile, mit oder ohne `id`. Klassenzeilen ohne `name` oder `subject` fallen weg. Die Anzahl ist das `total` der Klassenzeile, die Schulzeile summiert sie aus den Klassen; ein Landesschnitt zeichnet `frequency / total` je Stufe.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` | `domain.id`, `domain.name` | Ein nach Domänen geteiltes Fach bildet eine einzige Gruppe, in der jede Klasse und jeder Landesschnitt einmal je Domäne steht |
| `competence-levels` | Zeilen mit `type=state` (`comparison=state-average`) | Keine Landesschnitt-Zeilen in den Gruppen |
| `competence-levels` (`type=students`) | `covariates[group]` (gleich `name` der Klassenzeile), `subject.name`, `domain.id` (wie die Klassenzeile) | Die Person gehört zu keiner Klasse und zählt in Geschlechts- und Merkmalsspalten nicht mit; passt keine Person, zeigen die Geschlechtsspalten 0 und die Merkmalsspalten entfallen. Ohne `covariates[group]` entfällt zusätzlich die Spalte Unterrichtsqualität, und Selbstwirksamkeit steht nur an den Schulzeilen |
| `competence-levels` (`type=students`) | `covariates[gender]` mit `male`, `female`, `diverse` | Die Geschlechtsspalten zeigen 0, der Geschlechtsbalken bleibt leer |
| `competence-levels` (`type=students`) | `properties[tq_mean]` | Die Spalte Unterrichtsqualität entfällt |
| `competence-levels` (`type=students`) | `properties[sp_mean]` | Die Spalte Selbstwirksamkeit entfällt |
| `competence-levels` (`type=students`) | `id` | Unterrichtsqualität und Selbstwirksamkeit fassen je Klasse (und Fach) nur einen Wert |

Payload: `_doRenderContent(data)` erhält `{ allDomainResults, levelDefinitions, competenceLevelsData, teachingQuality, selfEfficacyByClass, selfEfficacySchool }` aus der Übersichts-View. `allDomainResults` ist das Dataset `DOMAIN_RESULTS` (`buildDomainResultsFromJson`, `src/sl/slResultsDerivation.js`), gelesen `fach`, `domaene`, `fachbezeichnung`, `domaenenbezeichnung`, `stammklasse`, `stammklasse_id`, `subjectCode`, `stats` (`nrStudents`, `ksCounts`, `genderCounts`, `traitCounts`, `scaleId`) und `summedResults[].traits`; `competenceLevelsData` ist das rohe `competence-levels`-Dokument, aus dem die Tabelle die Schul-`id` und die Landesschnitt-Zeilen selbst liest (`buildCompetenceLevelIndex`, `findComparisonEntriesForSubjectDomain`). Stufen und Survey-Werte kommen über `SlBaseTableModule`; den Modus liest das Mixin aus der Option `vizMode`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `enableModuleExport` | `boolean` | `true` | nein | Exportbutton im Kartenkopf |
| `vizMode` | `string` | `'stacked_bar'` | nein | Startwert des `vizMode`-State (Mixin `initialValue`) |
| `glossaryKey` | `string` | – | ja (von der View) | Titel, Untertitel, Tour |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setState({ vizMode })` | Aufruf | Boxplot oder Balken; das Mixin verzögert bis sichtbar und ruft `_applyVizModeChange` (Redraw) |
| `_getActiveTables()` | Override | `[domainTable]` |
