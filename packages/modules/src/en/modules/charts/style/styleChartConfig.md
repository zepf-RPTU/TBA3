# ChartHostModule + styleChartConfig

## Zweck
Eine Karte für die Teilkompetenzen (Stil-Kategorien) im EN-Dashboard mit zwei Darstellungen: ein Spinnendiagramm in der Schüler:innen-View bei Modus `all` (beide Domänen auf einem Netz, die Person gegen Klasse und Vergleichsgruppen), sonst ein horizontales Lollipop-Diagramm (Klassen-View immer, Schüler:innen-View je Domäne). Beide Renderer leben in eigenen Host-Divs im Kartenkörper und werden bei einem Moduswechsel nur ein- oder ausgeblendet, nicht neu gebaut.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../module-base/src/modules/contentModule.md)
    - [ChartHostModule](../../../../common/charts/host/chartHostModule.md)
      - **styleChartConfig** — Descriptor

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `aggregations` | `type=students` | `id`¹, `domain.id`¹, `aggregations[type=Hör-/Lesestil]` mit `value` und `descriptiveStatistics.mean` (Kategorien aus der ersten Zeile, Werte je Person) |
| `aggregations` | `comparison=school-average,state-average` | `name` der Klassenzeile (Legende, Tooltip), `domain.id`¹; Vergleichszeilen zusätzlich `id`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `domain.id` gibt es nicht genau zwei Domänen, und das Diagramm wirft (`assertExactlyTwoDomains`); ohne Schüler:innen-`id` zeigt die Schüler:innen-View keine Werte der Person, und die Klassen-View fasst alle Personen zu einem Datensatz zusammen. Eine Vergleichszeile ohne `id` lässt `parseStyleAggregation` werfen und bricht damit alle EN-Datensätze.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels`, `aggregations` (`type=students`) | `domain.name` | Legende, Speichen und Zeilen nennen die Domänen-id, das Domänenkürzel ist deren erster Buchstabe |
| `competence-levels` (`type=students`; auch `aggregations`) | `properties[lastName]`, `properties[firstName]` | Schüler:innen-View: der Legendeneintrag der Person lautet „, “ |
| `aggregations` (`type=students`) | `aggregations[type=Hör-/Lesestil]` der gewählten Person, je Kategorie mit `descriptiveStatistics.mean` | Für eine fehlende Kategorie keine Pille und kein Punkt auf der Speiche (der Ring verbindet die Nachbarn), Tooltip „N/A“ |
| `aggregations` (`type=students`) | `aggregations[type=Hör-/Lesestil]` einer Person (Klassen-View) | Die Person zählt in den Kategorien, die ihr fehlen, nicht zum Klassenwert; hat in der Auswahl niemand irgendeinen Wert, gilt der Klassenwert aus `aggregations` (`comparison=…`); fehlt eine Kategorie allen, hat ihre Zeile keine Klassenpille |
| `aggregations` (`comparison=…`) | `aggregations[type=Hör-/Lesestil]` der Klassenzeile, je Kategorie | Schüler:innen-View: die Klassenserie hat an dieser Stelle keine Pille bzw. keinen Punkt, Tooltip „N/A“ |
| `aggregations` (`comparison=…`) | Vergleichszeilen | Keine Vergleichsserien, ⌀-Menü leer |
| `aggregations` (`comparison=…`) | `aggregations[type=Hör-/Lesestil]` einer Vergleichszeile, je Kategorie | Für eine fehlende Kategorie kein Marker bzw. kein Punkt, Tooltip „N/A“ |

Payload: `createRenderer(host, data)` erhält `{ studentData, studentId, displayName, useWidth, comparisonModes, useSpiderChart }`. Klassen-View: `studentData` sind die Datensätze aus `EN_DATA_KEYS.STUDENT_RECORDS` (`buildClassStudentRecords`); gezeichnet wird erst ab `applySync`, aus den über `studentStore` aufgelösten Zeilen der Klassentabelle und `calculateStyleAveragesForStudents` (`enStyleAggregation.js`). Schüler:innen-View: `studentData` ist das rohe `EN_DATA_KEYS.STYLE_AGGREGATION`, gelesen von `buildStyleCategoryPerformance`. Die Option `styleAverages` (`parseStyleAggregation`) liefert Klassenwerte, Klassenname und Vergleichsgruppen; aus `enConfig` liest das Diagramm `domainIds`, `domainLabels`, `styleCategories` und `comparisonModeIds`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `enConfig` | `EnConfig` | – | ja | Stil-Kategorien, Domänen, Vergleichsgruppen |
| `styleAverages` | `ParsedStyleAggregation` | – | ja | Klassen- und Vergleichsmittelwerte, Klassenname und Vergleichsgruppen (`parseStyleAggregation`); daraus auch die Einträge des ⌀-Menüs |
| `comparisonState` | `ComparisonState` | aus `_childOptions()` | nein | Welche Vergleichsgruppen sichtbar sind; ohne ihn sind alle sichtbar, und es gibt kein ⌀-Menü |
| `domainMode` | `string` | `'all'` | nein | Anfangsmodus, wenn die View bei aktivem Domänen-Modus geöffnet wird |
| `studentStore` | `{ setAll, getByIds }` | – | ja für `applySync` | Löst die ID-Listen der Klassentabelle auf; nur die Klassen-View übergibt ihn |
| `glossaryKey` | `string` | – | ja | Titel und Tutorial je View |
| `showModuleTitle` | `boolean` | `false` | nein | Descriptor-Default; beide Views setzen `true` |
| `enableModuleExport` | `boolean` | `true` | nein | Export-Button |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setDomainMode(mode)` | Aufruf | Domänen-Modus; nur im Spinnen-Modus wird der Renderer gewechselt, das Klassen-Lollipop folgt der Tabelle |
| `setActiveModes(activeModes)` | Aufruf | Serien der Vergleichsgruppen im sichtbaren Diagramm ein- oder ausblenden |
| `applySync(data)` | Aufruf | `{ visibleIds, selectedIds?, mode }` der Klassentabelle (Lollipop-Modus) |
| `setStudent({ studentId, displayName? })` | Aufruf | Das Spinnendiagramm auf eine andere Person zeigen (Schüler:innen-View) |
| `getExportIdentity()` | Override | `[studentId, mode]`, Person und Modus zusammen |
