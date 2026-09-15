# ChartHostModule + groupComparisonConfig

## Zweck
Die Gegenüberstellung zweier Gruppen in der SL-Vergleichs-View als Bevölkerungspyramide: links und rechts je eine Gruppe (Geschlecht, Klasse oder Fach), gemessen an Kompetenzstufen, Lösungsanteilen (Punkte), Selbstwirksamkeit oder Unterrichtsqualität. Der Descriptor baut die Auswahlleiste (Selects) über dem Chart-Body und meldet jede Änderung der Zusammenfassung an die View.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../module-base/src/modules/contentModule.md)
    - [ChartHostModule](../../../../common/charts/host/chartHostModule.md)
      - **groupComparisonConfig** — Descriptor

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group` | `name`, `subject.name`¹, `competenceLevels[].nameShort` (Stufenfolge je Fach×Domäne) |
| `competence-levels` | `type=students` | `covariates[group]`¹ (gleich `name` der Klassenzeile), `covariates[gender]`¹ (`male`, `female`, `diverse`), `subject.name`¹, `competenceLevels[].nameShort` (die Stufe der Person) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Eine Schüler:innen-Zeile zählt nur, wenn `covariates[group]`, `subject.name` und `domain.id` mit einer Klassenzeile übereinstimmen; sonst zeigt der Kompetenzstufen-Vergleich keine Daten. Ohne `covariates[gender]` fehlt die Person nur in der Kategorie Geschlecht (die voreingestellte Kategorie bleibt ohne Gruppen, wenn niemand eine Angabe hat); in Klasse und Fach zählt sie mit, für alle vier Diagrammtypen.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` | `domain.id`, `domain.name` | Die Auswahl „Fach/Domäne“ bietet je Fach einen Eintrag ohne Domäne; eine Person zählt dort mehrfach |
| `aggregations` (`type=students`, `aggregation=result`) | `aggregations[type=Ergebnis]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `descriptiveStatistics.frequency`, dazu `subject.name`, `domain.id`, `covariates[group]`, `covariates[gender]` | Kein Diagrammtyp „Lösungsquote“; eine Zeile ohne Fach oder Klasse fällt weg, eine ohne Geschlecht fehlt nur in der Kategorie Geschlecht |
| `aggregations` (`type=students`, `aggregation=result`) | `id` | Alle Personen einer Klasse, eines Fachs und einer Domäne fallen zu einem Wert zusammen |
| `competence-levels` (`type=students`) | `properties[sp_mean]` | Kein Diagrammtyp „Selbstwirksamkeit“ |
| `competence-levels` (`type=students`) | `properties[tq_mean]` | Kein Diagrammtyp „Unterrichtsqualität“ |
| `competence-levels` (`type=students`) | `id` | Selbstwirksamkeit zählt je Klasse, Unterrichtsqualität je Klasse und Fach nur eine Person |

Payload: `createRenderer(host, data)` erhält `{ domainResults, comparisonSP, comparisonTQ, comparisonPoints }` aus der Vergleichs-View. `domainResults` ist das Dataset `DOMAIN_RESULTS` (`buildDomainResultsFromJson`, `src/sl/slResultsDerivation.js`), gelesen `fach`, `domaene`, `domaenenbezeichnung`, `stats.ksOrder`, `stats.scaleId` und je Person `summedResults[]` mit `gender`, `stammklasse` und der Stufe; `comparisonSP` und `comparisonTQ` sind `COMPARISON_SELF_EFFICACY` / `COMPARISON_TEACHING_QUALITY` (`src/sl/slSurveyDerivation.js`), `comparisonPoints` ist `COMPARISON_POINTS` (`buildComparisonPoints`). Aus den Optionen liest der Descriptor `onComparisonSummaryChanged`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `onComparisonSummaryChanged` | `(summary, chart) => void` | – | nein | Neue Zusammenfassung nach jeder Auswahl oder Neuzeichnung |
| `showModuleTitle`, `enableModuleExport` | `boolean` | `true` | nein | Descriptor-Defaults für den Host |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `onComparisonSummaryChanged(summary, chart)` | Callback | siehe Optionen; `summary.metricMode` wählt den Kasten-Text |
| `getExportIdentity()` | Override | Die aktuellen Werte aller Selects, jede Auswahl ist ein eigenes Exportziel |
| `prepareLayout`, `onCleanup` | Lifecycle-Hooks | Bauen bzw. entfernen die Auswahlleiste über dem Body |

Keine `publicAPI`: die Selects steuern den Chart direkt (`onControlsChanged` rendert die Leiste neu und ruft `syncExportControls()`).
