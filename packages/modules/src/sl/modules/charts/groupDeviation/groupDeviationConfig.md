# ChartHostModule + groupDeviationConfig

## Zweck
Eine Karte der SL-Schulzusammenfassung pro Fach×Domäne: der Schulwert der gewählten Kennzahl als Kasten, daneben je ein Balken pro Vergleichswert (jede gelieferte Vergleichs-`id`, z. B. ein Landesschnitt) und pro Lerngruppe als Abweichung vom Schulwert um eine Nulllinie. Kann die Kennzahl für diese Kombination nicht beantwortet werden, zeigt die Karte den Grund statt Balken. Ein ⌀-Dropdown im Kartenkopf schaltet die Vergleichswerte aller Karten gemeinsam. Die Balkenfarbe sagt, ob die Abweichung für die Schule günstig oder ungünstig ist, nicht ihre Richtung (bei „unter Mindeststandard“ ist ein steigender Balken schlecht); ein Balken, dessen Beschriftung keine Abweichung zeigt („0,0 PP“, auf die gedruckte Nachkommastelle gerundet), ist bei Lerngruppe und Vergleichswert gleich „Kein Unterschied“ und grau. Eine Legende über dem Plot und eine Tooltip-Zeile „Bewertung“ sagen es in Worten; den Eintrag „Kein Unterschied“ führt die Legende jeder Karte nur, solange irgendeine Karte derselben Auswahl einen solchen Balken zeichnet.

## Design/Idee

Jede fachliche Domäne wird innerhalb einer Kachel abgebildet. Es stehen verschiedene Metriken zur Verfügung (bspw. Anteil der SuS mit KS III oder höher), welche zunächst schulübergreifend gemittelt werden; anschließend wird jede Lerngruppe sowie optional der Landeswert als Abweichung von dieser Nulllinie in Form eines vertikalen Balkens abgebildet; die Farbe zeigt, ob die Abweichung günstig oder ungünstig ausfällt. Es handelt sich um eine starke Vereinfachung der Testergebnisse, welche einen initialen Eindruck vermitteln soll, darüber hinaus jedoch nur mit Vorsicht interpretiert werden darf.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group` | `type`¹ (`school` findet die Schulzeile), `id`¹ der Schulzeile, `name`, `subject.name`¹, `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency`, `.total` (ohne `total`: `.mean`), `properties[booklet]`¹ (kommagetrennt bei mehreren) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne Schulzeile mit `id` hat keine Karte einen Schulwert, und jede sagt statt Balken, dass die Schulzeile fehlt; Zeilen ohne `subject` fallen weg. Der Schulwert kommt aus der Schulzeile des Bereichs selbst, nicht aus den Lerngruppenzeilen: jeder Anteil ist die `frequency` der gewählten Stufen durch das `total` der Zeilen, die Lösungsquote der Schule liest die `result`-Aggregation mit der Schul-`id`. Mischt eine Domäne Testhefte ([Regel](../../../../../docs/datenvertrag.md#globale-lesezugriffe)), zeigt ihre Karte unter „Lösungsquote“ den Grund `mixed-booklets`, die Karten der übrigen Domänen des Fachs nicht.

Warum eine Karte keine Balken hat, sagt ein Satz aus dem Glossar (`sl.summary.deviation.messages`), je Grund aus `ABSENCE_REASONS`: keine Lerngruppenzeilen (`no-group-data`), keine Schulzeile des Bereichs (`no-school`), keine Lerngruppe mit Wert (`no-group-values`), unter „Lösungsquote“ ein Bereich, der in mehreren Testheften bearbeitet wurde (`mixed-booklets`, zuerst geprüft), oder die Kennzahl ist hier nicht berechenbar: dann nennt die Kennzahl ihren eigenen Satz (`unsupportedMessage`: `metric-unsupported-competence-levels`, `metric-unsupported-solution-rate`). `{{Kennzahl}}` füllt die Karte mit dem Namen der gewählten Kennzahl.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` | `domain` | Das Fach gilt als Fach ohne Domänen: eine Karte unter dem Fachnamen; zwei Zeilen derselben Gruppe eines Fachs ohne `domain` weist der Store ab (`DocumentShapeError`) |
| `competence-levels` | `covariates[homeroom]` der Lerngruppenzeile | Spalten heißen nach dem Gruppennamen (`name`) statt nach der Stammklasse |
| `competence-levels` | Vergleichszeilen (`comparison=state-average`) | Keine Vergleichsspalten, kein ⌀-Menü |
| `aggregations` (`type=school,group`, `aggregation=result`, `comparison=state-average`) | `id` (Schulzeile wie die Schul-`id`, Lerngruppenzeilen wie ihre `id` in `competence-levels`), `subject.name`, `domain.id`, `aggregations[type=result]` mit `value` und `.frequency` (Richtig gegen die Summe aller drei); Vergleichswerte über ihre `id` mit dem `Richtig`-`mean`; für ein Fach ohne Domänen-Kompetenzstufen (Mathematik) die Vergleichszeile ohne `domain` | Unter der Kennzahl „Lösungsquote“ zeigt jede Karte den Grund statt Balken |

Dokumente: das Dataset `sl.schoolSummary` (`schoolSummary.js`) über `competence-levels.json` und `aggregations.json`, je Kennzahl und aktiven ⌀-Ids einmal gebaut, sodass alle Karten dieselbe `yDomain`, dasselbe Beschriftungsband und denselben Legendeneintrag „Kein Unterschied“ lesen. Die Kennzahl ist die Option `metricId` (`state.metricId`); die aktiven Vergleichswerte kommen aus `comparisonState.activeModes` (ohne den Port alle gelieferten). Jeder Host wählt seine Zeile über `subjectName` und `domainId`. Der Renderer folgt `metricId` und `comparisonState` und liest je Durchgang `{ row, absence, yDomain, labelLines, neutralKey, metric }` aus dem Dataset der Kennzahl; das ⌀-Menü liest `averages`.

Darstellung: links im Plot steht der Schulkasten (HTML, damit die Beschreibung umbricht), mittig auf der Nulllinie, mit Wert und Beschreibung; ohne Zeile verschwindet er mit der Diagrammfläche.

Datentabelle: die Tabelle ist die `dataTable()` des `GroupDeviationChart`: zuerst die Schule, dann jede gezeichnete Säule (die eingeblendeten Durchschnitte, dann die Lerngruppen) mit dem Wert der Kennzahl in Prozent, der Differenz zur Schule in Prozentpunkten und der Bewertung, die die Farbe trägt. Ohne Zeile (ein Hinweissatz) keine Tabelle.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `subjectName` | `string` | `''` | ja | Fach der Zeile dieses Hosts |
| `domainId` | `string\|null` | – | nein | Domäne der Zeile; `null` für Fächer ohne Domänen |
| `comparisonState` | `ComparisonState` | – | nein | Welche Vergleichswerte die Daten der Karte enthalten (`getSchoolSummary` liest `activeModes`); ohne ihn alle gelieferten |
| `glossaryReplacements` | `{ Bereich }` | – | nein | Füllt den Glossartitel mit dem Zeilenlabel, als Textläufe (`subjectDomainLabelRuns`): das Fach steht schlicht, die Domäne verlinkt den Eintrag zu dieser Domäne dieses Fachs |
| `metricId` | `string \| Signal<string>` | Standardkennzahl | nein | Die Kennzahl; als Signal bewegt ein Wechsel die Balken an Ort und Stelle |
| `showModuleTitle` | `boolean` | `true` | nein | Descriptor-Defaults für den Host |

## Methoden
Keine eigenen.
