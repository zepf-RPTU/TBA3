# SlBaseTableModule

## Zweck
Abstrakte Basis der SL-Tabellen mit je einer Tabulator-Instanz: hält den `vizMode`-Zustand, den die Formatter lesen, und hängt die gruppierte Tabelle mit dem Zeilentyp-Formatter ein, die beide SL-Tabellen sind. Der Boxplot zeichnet Kasten Q1–Q3, Median und die Tukey-Whisker (die äußersten Werte innerhalb der 1,5·IQR-Zäune) — dieselbe Regel wie in den SL-Diagrammen; „Min / Max“ im Tooltip meint diese Whiskerenden.

## Daten
Keine API-Daten. Die Unterklassen nennen die Felder, die ihre Spalten lesen.

Die Datei exportiert `SL_TABLE_DOCUMENTS`, die Datasets, die jede SL-Tabelle liest: `sl.levelDefinitions`, `sl.teachingQuality`, `sl.selfEfficacyByGroup`, `sl.selfEfficacySchool`, `sl.teachingQualityIndex`, `sl.selfEfficacyIndex` (`SL_DATASETS.*`, gebaut aus `competence-levels.json` bzw. `students-competence-levels.json`). Die Basis deklariert selbst kein `static documents`; die Unterklassen nehmen `SL_TABLE_DOCUMENTS` in ihr `static documents` auf. Die Unterklassen lesen Stufen und Survey-Werte selbst aus dem Store des Kontexts (`context.documents`): `sl.levelDefinitions` direkt, die Survey-Einträge über `findTeachingQuality` / `findSelfEfficacy` (`slSurveyLookup.js`; `null` als Lerngruppe meint die Schule, ein Fach zählt unter seinem Datennamen), und ob eine Survey-Spalte entsteht, über das Dataset `sl.surveyRows` (`SL_DATASETS.SURVEY_ROWS`, in `SL_TABLE_DOCUMENTS`) — dieselbe Frage wie der Balken/Boxplot-Schalter im Kopf.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `vizMode` | `string \| Signal<string>` | `'stacked_bar'` | nein | Der Modus (`'boxplot'` alternativ); als Signal folgt ihm die Tabelle |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `vizMode` | Getter | Der aktuelle Modus, den die Formatter lesen; ein Wechsel ruft verzögert bis sichtbar `redraw()` |
| `_createGroupedTable({className, groupBy, rowClasses, columns, data})` | geschützt | Hängt die Tabelle ein, die beide SL-Tabellen sind: keine Sortierung, `height: 'auto'` (keine Spalte wird ausgeblendet: bei zu wenig Breite scrollt die Tabelle waagerecht), dazu die eingeklappten Zeilengruppen über das Feld `groupBy`, deren Kopfzeile sie auf- und zuklappt; eine Zeile bekommt die CSS-Klasse, die `rowClasses` für ihr `rowData.type` nennt |
