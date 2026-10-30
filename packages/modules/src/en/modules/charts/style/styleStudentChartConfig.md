# ChartHostModule + styleStudentChartConfig

## Zweck
Die EN-Teilkompetenzen-Karte (Stil-Kategorien) einer Schüler:in: bei Modus `all` ein Spinnendiagramm (beide Domänen auf einem Netz, die Person gegen Lerngruppe und Vergleichsgruppen), je Domäne ein horizontales Lollipop-Diagramm. Ein Wechsel zwischen `all` und einer Domäne baut die Karte mit dem anderen neu auf (`rebuildOn`), ein Wechsel zwischen zwei Domänen zeichnet das Lollipop neu.

## Design/Idee

Eine äquivalente Ansicht wird innerhalb der Schüler:innenansicht verwendet. Bei gleichzeitiger Betrachtung beider Domänen werden die mittleren Lösungshäufigkeiten pro Stil und pro Domäne als spider plot visualisiert; die Abbildung soll aus Sicht der Entwicklungsgruppe charakteristische Profil-Muster erzeugen, anhand derer schnell konkrete Stärken und Schwächen offenkundig werden und wiederkehrende „Typen“ erkannt und ggf. einander zugeordnet werden können.

Mit [styleGroupChartConfig](styleGroupChartConfig.md) gemeinsam genutzt werden das ⌀-Menü, der Lollipop-Aufbau, der Leerzustand und die Mindesthöhe der Karte (`styleChartShared.js`); sie gilt nur, solange das Lollipop zeigt (`applyLollipopMinHeight`), und bleibt für die Rückkehr von der Spinne gemerkt. Die y-Achse des Lollipops nennt nur die Stile; die Domäne steht als Buchstabe (H/L) am Anfang jedes Stiels.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `aggregations` | `type=students` | `id`¹, `domain.id`¹, `domain.name`, `aggregations[type=style]` mit `value` und `descriptiveStatistics.mean` (Kategorien aus allen Zeilen in der Reihenfolge ihres ersten Auftretens, Werte je Person), `properties[firstName]`¹, `properties[lastName]`¹ |
| `aggregations` | `comparison=school-average,state-average` | `name` der Lerngruppenzeile (Legende, Tooltip), `domain.id`¹; Vergleichszeilen zusätzlich `id`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Zu `domain.id` siehe die Zwei-Domänen-Regel in [datenvertrag.md](../../../../../docs/datenvertrag.md#anfragen-je-dashboard).

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `aggregations` (`type=students`) | `aggregations[type=style]` der gewählten Person, je Kategorie mit `descriptiveStatistics.mean` | Für eine fehlende Kategorie keine Pille und kein Punkt auf der Speiche (der Ring verbindet die Nachbarn), Tooltip „–“ |
| `aggregations` (`comparison=…`) | `aggregations[type=style]` der Lerngruppenzeile, je Kategorie | Die Lerngruppenserie hat an dieser Stelle keine Pille bzw. keinen Punkt, Tooltip „–“ |
| `aggregations` (`comparison=…`) | Vergleichszeilen | Keine Vergleichsserien, kein ⌀-Menü |
| `aggregations` (`comparison=…`) | `aggregations[type=style]` einer Vergleichszeile, je Kategorie | Für eine fehlende Kategorie kein Marker bzw. kein Punkt und keine Tooltip-Zeile der Gruppe |

Dokumente: Der Descriptor nennt in `documents` die Datasets `en.studentRecords` (`EN_DATASETS.STUDENT_RECORDS`), `en.studentRecordsById` (`EN_DATASETS.STUDENT_RECORDS_BY_ID`), `en.styleAverages` (`EN_DATASETS.STYLE_AVERAGES`) und `en.config` (`EN_DATASETS.CONFIG`). Die Person kommt als Option `studentId`. Gezeichnet werden die Stil-Anteile der Person aus ihrem Datensatz in `en.studentRecordsById`, gelesen von `buildStyleCategoryPerformance`; der Legendeneintrag der Person ist „Nachname, Vorname“ aus demselben Datensatz; ist `en.studentRecords` leer, zeigt die Karte den Leerzustand. `en.styleAverages` liefert Lerngruppenwerte, Lerngruppenname und Vergleichsgruppen; aus `en.config` liest das Diagramm `domainIds`, `domainLabels` und `styleCategories`. Der Domänenname verlinkt den Glossareintrag seiner Domänen-Id (`resolveDomainEntryKey`).

Datentabelle: im Lollipop wie bei `styleGroupChartConfig`, mit einer Spalte `Schüler:in` vor der Lerngruppe; im Netz (Modus `all`) die `dataTable()` des `StyleSpiderChart`: eine Zeile je Speiche in Winkelfolge (Stil, Domäne), mit Schüler:in, Lerngruppe und je eingeblendeter Vergleichsgruppe; eine Speiche ohne Wert einer Reihe bleibt dort leer.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `domainMode` | `string \| Signal<string>` | `'all'` | nein | Domänen-Modus: ein Modus-Signal oder ein fester Modus, als Host-Zustand `mode` geteilt; `all` zeigt die Spinne, eine Domäne ihr Lollipop. Der Wechsel zwischen Spinne und Lollipop baut die Karte neu auf (`rebuildOn`), der zwischen zwei Domänen zeichnet das Lollipop selbst neu |
| `studentId` | `string \| Signal<string\|null>` | `null` | nein | Die gezeigte Person: ein Signal ihrer ID oder eine feste ID; ohne sie zeichnen Spinne und Lollipop nur Lerngruppe und Vergleichsgruppen. Als Host-Zustand `studentId`, einmal als `computed` gegen `en.studentRecordsById` aufgelöst; jeder Renderer zeichnet sich bei einem Wechsel selbst neu |
| `glossaryKey` | `string` | – | ja | Titel und Tutorial |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `getExportIdentity()` | Override | `[studentId, mode]`, Person und Modus zusammen |
