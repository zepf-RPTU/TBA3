# SlSummaryViewModule

## Zweck
Der „Überblick“, die Startview des Schulleitungs-Dashboards: eine Abweichungskarte je Fach×Domäne in einem responsiven Raster mit höchstens drei Karten pro Zeile. Jede Karte zeigt den Schulwert der gewählten Kennzahl neben einem Balken je Referenzmittelwert und je Klasse, als Abweichung vom Schulwert über oder unter einer Nulllinie. Die Karten sind vom besten zum schlechtesten Schulwert geordnet; Fach×Domänen, die die Kennzahl nicht beantworten kann, folgen als Karten mit Begründung statt Balken. Die View besitzt die y-Skala: sie baut alle Zeilen einmal und gibt jedem Host dieselbe `yDomain`, damit Balkenhöhen über Fächer hinweg vergleichbar bleiben.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../packages/module-base/src/modules/baseModule.md)
  - [BaseViewModule](../../common/modules/baseViewModule.md)
    - **SlSummaryViewModule**

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Abweichungskarte, eine je Fach×Domäne (Zeilen und Absenzen) | `ChartHostModule` + `classDeviationConfig` | [classDeviationConfig.md](../../../packages/modules/src/sl/modules/charts/classDeviation/classDeviationConfig.md) | Container-Id `sl-summary-row-<subject>-<domain>` (ohne Domäne `-gesamt`), `glossaryReplacements: { Bereich: rowLabel }`, `title: rowLabel`, `subjectName`, `domainId`; der Body erhält zusätzlich `.summary-row-body` |

Die Karten werden mit `mount(chartData)` gebaut und über `_hydrateChildren` gemeinsam hydriert. Eine Spalte existiert genau dann, wenn es für sie einen Balken gibt — die Spalten einer Karte sind ihre eigenen Einträge, kein gemeinsamer Spaltensatz über alle Karten.

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=school,group` | jede Abweichungskarte (welche Fach×Domänen es gibt; Schulwert und Klassenspalten der Kompetenzstufen-Kennzahlen) |
| `competence-levels` | `comparison=state-average` | jede Abweichungskarte (eine Referenzspalte je Landesschnittzeile, soweit in `comparisonState` aktiv) |
| `items` | `type=school,group`, `comparison=state-average` | jede Abweichungskarte, nur unter der Kennzahl `solution_rate` (Schul-, Klassen- und Landesschnittwert der Lösungsquote) |

Payload: kein App-Payload. Die View liest roh `COMPETENCE_LEVELS`, die Kennzahl aus `appState.getStateValue('summaryMetric')` (Rückfall `DEFAULT_SUMMARY_METRIC_ID`) und die aktiven Referenzmittelwerte aus `comparisonState.getActiveModes()`; `buildSummaryRows` baut daraus über `queries` — eine `CompetenceShareQueries` für die Anteile und eine `SolutionRateQueries` für die Lösungsquote, beide über den Port `slData: slDataFromStore(dataStore)`, der auch `items` liest — einmal `{ metric, rows, absences, yDomain, averages }`, und die View ergänzt `labelLines` (`resolveLabelLineCount` über die Labels aller Karten, damit das Beschriftungsband überall gleich hoch ist). Dieser Gesamt-Payload geht per `mount(chartData)` an jede Karte, die sich ihre Zeile über `subjectName`/`domainId` nimmt; ein Kennzahl- oder Ø-Wechsel baut ihn neu und schickt ihn per `update(chartData)` an alle. Aus ihm stempelt die View außerdem `--summary-row-min-width` (`estimateMinRowWidth` der breitesten Karte) und die Kartenreihenfolge per CSS `order`, sodass kein Wechsel die Hosts neu mountet; ohne eine einzige Fach×Domäne bleibt ein leerer Container mit dem Hinweis aus `sl.summary.messages.empty`.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `summaryMetric` | Kennzahl-Select des Headers (`metricSelect`) | Payload neu bauen, Layout und Reihenfolge neu stempeln, `update(chartData)` an jede Karte |
| `comparisonState` | Seed beim Laden, Ø-Dropdown einer Karte | dito; so bleiben alle Karten synchron |

Bekannte Restlücke: ein Header-Control, das während des Renders (beim Hydrieren der Karten) schreibt, trifft die Beobachter noch nicht; die Karten behalten bis zur nächsten Änderung die Kennzahl ihres ersten Payloads.

## Verdrahtung
Keine Geschwister-Verdrahtung; die Karten reden nur über den App-State (`comparisonState`) miteinander, siehe Zustand.

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Payload bauen, DOM mit einem Platzhalter je Karte anlegen, Layout-Metriken stempeln, Hosts mounten und hydrieren, dann die beiden App-State-Schlüssel beobachten |
