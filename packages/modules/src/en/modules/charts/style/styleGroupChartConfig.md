# ChartHostModule + styleGroupChartConfig

## Zweck
Die EN-Teilkompetenzen-Karte (Stil-Kategorien) einer Personenmenge: ein horizontales Lollipop-Diagramm über die Schüler:innen, die `applySync` übergibt. Hat die Auswahl keinen Stilwert, zeigt die Karte den Platzhalter.

## Design/Idee

Neben den Domänen des Hör- und Leseverstehens stellen die zugehörigen Stile „global“, „selektiv“ und „detailliert“ eine der zentralen Kompetenzbeschreibungen innerhalb der Rückmeldung dar. Lehrkräfte sollen sparsam und aufgabenübergreifend die konkreten Stärken und Schwächen einer Lerngruppe bzw. einzelner SuS erfassen können. Die Stile wurden von den entwickelnden Lehrkräften als Schlüsselmerkmal identifiziert. Die zugehörige Graphik dieser Ansicht meldet die mittleren Lösungshäufigkeiten der Lerngruppe (bzw. der in der Tabelle gefilterten oder ausgewählten SuS) in Bezug auf Aufgaben, die den jeweiligen Stilen zugeordnet werden können. Damit wird ein Profil der Lerngruppe gezeichnet, welches ggf. erste didaktische Implikationen liefern soll.

Die Karte hat keine eigene Auswahl: die Personen kommen über `applySync`, der Modus aus `domainMode`. Vor dem ersten `applySync` zeichnet sie nichts. Mit [styleStudentChartConfig](styleStudentChartConfig.md) gemeinsam genutzt werden ⌀-Menü, Lollipop-Aufbau, Leerzustand und Mindesthöhe (`styleChartShared.js`: der Lollipop meldet die Höhe, unter der seine Zeilen nicht mehr passen, beim Messen, sobald sie sich ändert, und vor dem Zeichnen (die Höhe der Legende liest er mit der Containergröße); danach misst er den Container neu, sodass der erste Durchgang schon in der gewachsenen Karte zeichnet und kein zweiter nach der Verzögerung des Resize-Observers folgt. `writeLollipopMinHeight` merkt sie sich samt Kopfzeile an der Karte und setzt sie als deren `min-height`). Der Lollipop legt in jedem Modus ein Band je Stil an, bemessen für beide Domänen: die y-Achse nennt immer nur die Stile, und ein Domänenwechsel verschiebt weder die Achse noch ändert er die Mindesthöhe. Eine einzelne Domäne zeichnet ihre Zeile in der Bandmitte; jede Zeile trägt am Stielanfang den Buchstaben ihrer Domäne (H/L). Beim Wechsel gleiten die bleibenden Zeilen an ihren Platz, die der anderen Domäne blenden ein oder aus.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `aggregations` | `type=students` | `id`¹, `domain.id`¹, `domain.name`, `aggregations[type=style]` mit `value` und `descriptiveStatistics.mean` (Kategorien aus allen Zeilen in der Reihenfolge ihres ersten Auftretens, Werte je Person) |
| `aggregations` | `comparison=school-average,state-average` | `name` der Lerngruppenzeile (Legende, Tooltip), `domain.id`¹; Vergleichszeilen zusätzlich `id`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Zu `domain.id` siehe die Zwei-Domänen-Regel in [datenvertrag.md](../../../../../docs/datenvertrag.md#anfragen-je-dashboard).

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `aggregations` (`type=students`) | `aggregations[type=style]` einer Person | Die Person zählt in den Kategorien, die ihr fehlen, nicht zum Lerngruppenwert; hat in der Auswahl niemand irgendeinen Wert, zeigt die Karte den Leerzustand; fehlt eine Kategorie allen, hat ihre Zeile keine Lerngruppenpille |
| `aggregations` (`comparison=…`) | Vergleichszeilen | Keine Vergleichsserien, kein ⌀-Menü |
| `aggregations` (`comparison=…`) | `aggregations[type=style]` einer Vergleichszeile, je Kategorie | Für eine fehlende Kategorie kein Marker und keine Tooltip-Zeile der Gruppe |

Dokumente: Der Descriptor nennt in `documents` die Datasets `en.studentRecordsById` (`EN_DATASETS.STUDENT_RECORDS_BY_ID`), `en.styleAverages` (`EN_DATASETS.STYLE_AVERAGES`) und `en.config` (`EN_DATASETS.CONFIG`). `applySync` löst die IDs der Lerngruppentabelle gegen `en.studentRecordsById` auf und mittelt ihre Stilwerte für beide Domänen (`calculateStyleAveragesForStudents`). `en.styleAverages` liefert Lerngruppenname und Vergleichsgruppen; aus `en.config` liest das Diagramm `domainIds`, `domainLabels` und `styleCategories`. Der Domänenname verlinkt den Glossareintrag seiner Domänen-Id (`resolveDomainEntryKey`).

Datentabelle: die Tabelle ist die `dataTable()` des `StyleLollipopChart`: eine Zeile je Stil (im Modus `all` je Stil und Domäne), mit dem Wert der Lerngruppe und je eingeblendeter Vergleichsgruppe ihrem; eine Zeile ohne Wert in irgendeiner Spalte zeichnet nichts und fehlt, ein fehlender Wert bleibt leer.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `domainMode` | `string \| Signal<string>` | `'all'` | nein | Domänen-Modus: ein Modus-Signal oder ein fester Modus; als Host-Zustand `mode` mit dem Lollipop geteilt |
| `glossaryKey` | `string` | – | ja | Titel und Tutorial |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `applySync(data)` | Aufruf | `{ ids }` der zu zeigenden Schüler:innen; dieselben IDs wie beim letzten Aufruf ändern nichts |
| `getExportIdentity()` | Override | `[mode]` |
