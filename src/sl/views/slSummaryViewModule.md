# SlSummaryViewModule

## Zweck
Der „Überblick“, die Startview des Schulleitungs-Dashboards: eine Abweichungskarte je Fach×Domäne in einem responsiven Raster mit höchstens zwei Karten pro Zeile. Jede Karte zeigt den Schulwert der gewählten Kennzahl neben einem Balken je Referenzmittelwert und je Lerngruppe, als Abweichung vom Schulwert über oder unter einer Nulllinie. Die Karten stehen in der Reihenfolge der Daten, ohne Sortierung; Fach×Domänen, die die Kennzahl nicht beantworten kann, stehen an ihrem Platz als Karten mit Begründung statt Balken. Die Karten teilen eine y-Skala.

## Design/Idee

Die übersichtliche Darstellung der Ergebnisse aller Lerngruppen und Fächer innerhalb einer Seite stellt eine wiederkehrende Herausforderung innerhalb der Schulleitungsrückmeldung dar, wurde von der Entwicklungsgruppe jedoch explizit gewünscht. Diese Ansicht stellt einen späten Entwurf dar, bei dem die Testergebnisse in jedem Fach bzw. jeder Domäne auf einen einzelnen metrischen Wert heruntergebrochen werden, so dass eine sparsame Gegenüberstellung aller Lerngruppen sowie der Schule als Ganzes im Vergleich zum Landeswert erfolgen kann. Die Vergleichsmetrik wird in der Kopfzeile ausgewählt; die darunterliegenden Kacheln zeigen pro Domäne den mittleren Schulwert und die jeweiligen Differenzen zu den einzelnen Lerngruppenwerten sowie dem Land. Die reduzierte Komplexität soll es Schulleitungen erlauben, schnell einen ersten Eindruck darüber zu gewinnen, welche Lerngruppen und/oder Fächer im kriterialen bzw. sozialen Vergleich gut oder weniger gut abschneiden.

Das Raster hat keinen Breakpoint für die Spaltenzahl: wie breit eine Karte mindestens sein muss, hängt davon ab, wie viele Balken sie zeichnet (Lerngruppen plus sichtbare Mittelwerte), also misst die View und das Raster rechnet. Höchstens zwei Karten pro Zeile und eine Höchstbreite je Karte, weil die Balken die ganze Kartenbreite einnehmen und eine breitere Karte sie nur auseinanderzieht; eine kurze letzte Zeile behält die Spaltenbreite, damit der Balkenabstand in jeder Karte gleich ist. Die Zeilen teilen die Höhe gleichmäßig, weil alle Karten gegen eine gemeinsame Skala zeichnen: eine höhere Karte ließe dieselbe Abweichung größer aussehen.

Der Kartensatz hängt nicht von der Kennzahl ab: auch eine Fach×Domäne, die die Kennzahl nicht beantworten kann, behält ihre Karte. So bleiben die Hosts bei einem Kennzahlwechsel eingehängt und zeichnen nur neu.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Abweichungskarte, eine je Fach×Domäne (Zeilen und Absenzen) | `ChartHostModule` + `groupDeviationConfig` | [groupDeviationConfig.md](../../../packages/modules/src/sl/modules/charts/groupDeviation/groupDeviationConfig.md) | `glossaryReplacements: { Bereich }` (das Zeilenlabel als Textläufe aus `subjectDomainLabelRuns`, die Domäne über `resolveDomainEntryKey(domainId, subjectName)` verlinkt), `title: rowLabel`, `subjectName`, `domainId` |

Die Karten bekommen das App-Signal `summaryMetric` als Option `metricId` und stehen gemeinsam im Template der View. Jede Karte hat ihre eigenen Spalten, eine je vorhandenem Balken; es gibt keinen gemeinsamen Spaltensatz.

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=school,group` | jede Abweichungskarte (welche Fach×Domänen es gibt; Schulwert und Lerngruppenspalten der Kompetenzstufen-Kennzahlen) |
| `competence-levels` | `comparison=state-average` | jede Abweichungskarte (eine Referenzspalte je Vergleichs-`id`, soweit in `comparisonState` aktiv) |
| `aggregations` | `type=school,group`, `aggregation=result`, `comparison=state-average` | jede Abweichungskarte, nur unter der Kennzahl `solution_rate` (Schul-, Lerngruppen- und Landesschnittwert der Lösungsquote) |

Payload: nur Auswahl. Die Kennzahl liest die View aus `appState.summaryMetric.value`, die aktiven Referenzmittelwerte aus `comparisonState.activeModes`, und holt für beides `getSchoolSummary(documents, { metricId, comparisonState })` aus `@tba3/modules/charts/group-deviation`: dasselbe Dataset, das jede Karte selbst liest. Daraus setzt die View je Eintrag von `cards` (jede Fach×Domäne in Payload-Reihenfolge) eine Karte, setzt die Mindestbreite des Rasters (`summaryMinRowWidth(summary)`, neu bei jedem Wechsel von Kennzahl oder Vergleichen) und gibt jeder Karte das Signal; die Karte nimmt sich ihre Zeile über `subjectName`/`domainId`. Ohne eine einzige Fach×Domäne bleibt ein leerer Container mit dem Hinweis aus `sl.summary.messages.empty`.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `summaryMetric` | Kennzahl-Select des Headers (`metricSelect`) | Mindestbreite neu stempeln; die Karten folgen dem Signal (Option `metricId`) selbst |
| `comparisonState` | Seed beim Laden, Ø-Dropdown einer Karte | dito; jede Karte liest den Vergleichszustand beim Render selbst, so bleiben alle synchron |

## Verdrahtung
Keine Geschwister-Verdrahtung; die Karten folgen `comparisonState` und `summaryMetric`.

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Zusammenfassung lesen, je Fach×Domäne einen Host ins Raster setzen, Mindestbreite stempeln, danach `summaryMetric` und `comparisonState.activeModes` beobachten (je ein Neustempeln) |
