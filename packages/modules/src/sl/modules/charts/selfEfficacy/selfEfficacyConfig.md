# ChartHostModule + selfEfficacyConfig

## Zweck
Die Selbstwirksamkeit pro Lerngruppe und für die Schule, als gestapelter Balken über die Antwortbänder von 0 bis 100 %, oder als Boxplot der Schüler:innen-Mittelwerte (`vizMode`). Drei Formen aus einem Descriptor: horizontal mit HTML-Legende für alle Lerngruppen, als einzelne Zeile, sobald `groupName` oder `showOnlySchoolData` sie wählt (der Balken dann ohne Achsen, der Boxplot liegend), und kompakt als Wasserzeichen (`thumbnail`).

## Design/Idee

Das fiktive Maß “Selbstwirksamkeit” wird in der Übersicht wie eine eigenständige Domäne behandelt. In der Aggregation nach Lerngruppen erhält sie einen eigenen Graphen innerhalb der jeweiligen Detailansichten; in der Aggregation nach Fächern ist die Selbstwirksamkeit innerhalb einer eigenen Detailansicht zusammengefasst. Die entwickelnden Schulleitungen betonten mehrfach die Wichtigkeit, neben fachspezifischen Kompetenzen auch allgemeine psychometrische Variablen in die evaluativen Überlegungen miteinzubeziehen. Dennoch handelt es sich hier um ein vollständig optionales Feature, welches ohne jegliche (technische) Einbußen aus den Rückmeldungen entfernt werden kann.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=students` | `properties[sp_mean]`¹, `covariates[group]`¹ (gleich `name` der Lerngruppenzeile), `id`¹ (eine Person je Lerngruppe und `id`) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `sp_mean` gibt es keine Zeilen; die Karte setzt sie voraus. Eine Zahl außerhalb 1–5 lässt das Dokument scheitern.

Keine optionalen Felder.

Store: der Descriptor nennt in `documents` die Datasets `sl.selfEfficacyByGroup`, `sl.selfEfficacySchool` und `sl.selfEfficacyIndex` (`buildSelfEfficacyByGroup`, `buildSelfEfficacySchool` in `sl/utils/slSurveyDerivation.js`, beide aus `students-competence-levels.json`; `groupName: 'Schule'` für die Schule). `createRenderer(host)` wählt die Zeilen `{ groupName, count, distribution, statistics }` über die Optionen: mit `groupName` die eine Zeile dieser Lerngruppe (`findSelfEfficacy`, Lerngruppen-Layout), mit `showOnlySchoolData` die Schulzeile, mit keinem von beiden alle Lerngruppenzeilen und die Schulzeile. Fehlt die gewählte Zeile, entsteht kein Renderer. Eine einzelne Zeile im Balkenmodus (außer als Vorschaubild) zeichnet ein `StripBarChart` (`common/charts/stripBar/`): jedes Antwortband als Segment mit seinem Namen, Anteil und seiner Anzahl (`gut · 41 % (12)`), im Tooltip Spanne, Anteil, Anzahl und der Mittelwert der Gruppe. Der Stapelbalken liest `distribution` (die Antwortbänder) und den Mittelwert aus `statistics`, der Boxplot `statistics` und `count`; aus den Optionen `vizMode` und `thumbnail`. Der Boxplot zeigt außer als Vorschaubild im Legendenfeld die Lesehilfe der SL-Boxplots (`boxPlotKey`). Außer als Vorschaubild beschriften beide Renderer immer: der Boxplot die Lerngruppennamen an seiner Kategorienachse, der Stapelbalken jedes Segment mit seinem Anteil, wo er hineinpasst.

Datentabelle: je nach Renderer: der Streifen (`StripBarChart`) eine Zeile, die gewählte Gruppe oder die Schule, mit je Band Anteil und Anzahl; der Boxplot eine Zeile je Gruppe mit den Kennwerten des Tooltips (im Export mit zwei Nachkommastellen); der gestapelte Balken eine Zeile je Gruppe, deren Pille an ist, mit Anzahl, je Band Anteil und Anzahl und dem Mittelwert.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `groupName` | `string\|null` | – | nein | Nur die Zeile dieser Lerngruppe zeichnen; hat Vorrang vor `showOnlySchoolData` |
| `showOnlySchoolData` | `boolean` | `false` | nein | Nur die Schulzeile zeichnen |
| `vizMode` | `string \| Signal<string>` | – | ja | `'stacked_bar'` oder `'boxplot'`; der Host behält es als `state.vizMode`; ein Wechsel baut neu (`rebuildOn`: die Renderer-Klasse wechselt), auch während des ersten Renders |

## Methoden
Keine eigenen.
