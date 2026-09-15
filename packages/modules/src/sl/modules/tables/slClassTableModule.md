# SlClassTableModule

## Zweck
Die Tabellen der SL-Übersicht „nach Klassen“: ein aufklappbarer Abschnitt „Schule“ mit dem Aggregat aller Klassen und ein Abschnitt je Klasse, jeder mit eigener Tabulator-Instanz und eigenem Exportbutton. Eine Zeile pro Fach; Domänen stehen gestapelt in der Zelle (Name und Kompetenzstufenbalken je Domäne). Unterrichtsqualität je Fach und eine Fußzeile Selbstwirksamkeit teilen sich eine Spalte, als Boxplot oder gestapelter Balken je `vizMode`.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../module-base/src/modules/contentModule.md)
    - [TableModule](../../../common/tables/tableModule.md)
      - [SlBaseTableModule](slBaseTableModule.md)
        - **SlClassTableModule** — über Mixin `withTableModeState`

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group` | `type`¹ (`group` macht eine Zeile zur Klasse), `name`, `subject.name`¹, `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency`, `.total` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Als Klasse zählt nur eine Zeile mit `type=group`; ohne `type` gibt es keinen Klassenabschnitt, und der Abschnitt „Schule“ bleibt ohne Tabelle. Schul- und Landesschnittzeilen liest die Tabelle nicht, auch nicht die `id` der Schulzeile; Klassenzeilen ohne `name` oder `subject` fallen weg. Die Balken zeichnen die `frequency` je Stufe. Die Anzahl einer Fachzeile mit einer einzigen Domäne ist das `total` der Klassenzeile, im Abschnitt „Schule“ die Summe dieser `total` über die Klassen; ein nach Domänen geteiltes Fach hat keine Zeile, die seine Anzahl nennt, und zählt deshalb die verschiedenen Schüler:innen (Klasse und `id`) über alle Domänen im Schüler:innen-Dokument.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` | `domain.id`, `domain.name` | Ein nach Domänen geteiltes Fach zeigt je Klasse nur die erste Domäne; der Abschnitt „Schule“ summiert alle Domänen in einen Balken |
| `competence-levels` (`type=students`) | `covariates[group]` (gleich `name` der Klassenzeile), `subject.name`, `domain.id` (wie die Klassenzeile) | Die Person gehört zu keiner Klasse und zählt weder in M/W/D und Merkmalen noch in der Anzahl eines nach Domänen geteilten Fachs; passt in einer Tabelle keine Person, zeigen dort M/W/D 0 und die Merkmale-Spalten entfallen. Ohne `covariates[group]` bleiben zusätzlich Unterrichtsqualität und die Fußzeile Selbstwirksamkeit der Klassen leer |
| `competence-levels` (`type=students`) | `id` | M/W/D und Merkmale zeigen 0, die Anzahl eines nach Domänen geteilten Fachs ebenso; Unterrichtsqualität und Selbstwirksamkeit fassen je Klasse nur einen Wert |
| `competence-levels` (`type=students`) | `covariates[gender]` mit `male`, `female`, `diverse` | Die Spalten M, W, D zeigen 0 |
| `competence-levels` (`type=students`) | `properties[tq_mean]` | Die Fachzeilen bleiben in der Spalte Unterrichtsqualität leer; fehlt auch `sp_mean`, entfällt die Spalte |
| `competence-levels` (`type=students`) | `properties[sp_mean]` | Keine Fußzeile Selbstwirksamkeit; fehlt auch `tq_mean`, entfällt die Spalte |

Payload: `_doRenderContent(data)` erhält `{ classArray, levelDefinitions, teachingQuality, selfEfficacyByClass, selfEfficacySchool }` aus der Übersichts-View. `classArray` ist das Dataset `CLASS_RESULTS` (`buildClassResultsFromJson` über `DOMAIN_RESULTS`, `buildDomainResultsFromJson` in `src/sl/slResultsDerivation.js`), gelesen je Ergebnis `fach`, `domaene`, `fachbezeichnung`, `domaenenbezeichnung`, `stammklasse`, `stammklasse_id`, `stats.ksCounts`, `stats.nrStudents` (das `total` der Klassenzeile), `stats.scaleId` und `summedResults` (`studentId`, `stammklasse`, `gender`, `traits`); den Abschnitt „Schule“ summiert die Tabelle selbst aus den Klassen. Stufen und Survey-Werte kommen über `SlBaseTableModule`. Den Modus liest das Mixin aus der Option `vizMode`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `enableModuleExport` | `boolean` | `true` | nein | Exportbutton im Kartenkopf; die Abschnitte haben zusätzlich eigene |
| `vizMode` | `string` | `'stacked_bar'` | nein | Startwert des `vizMode`-State (Mixin `initialValue`) |
| `glossaryKey` | `string` | – | ja (von der View) | Titel, Untertitel, Tour |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setState({ vizMode })` | Aufruf | Boxplot oder Balken; das Mixin verzögert bis sichtbar und ruft `_applyVizModeChange` (Redraw aller Tabellen) |
| `_getActiveTables()` | Override | Schultabelle plus alle Klassentabellen |
