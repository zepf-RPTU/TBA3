# ChartHostModule + competenceChartConfig

## Zweck
Die Kompetenzstufenverteilung der ganzen Schule: alle Fächer, Domänen und Lerngruppen der Schule nebeneinander als gestapelte Balken, mit Vergleichswerten (Landesschnitt und jeder andere gelieferte Vergleich) und HTML-Legende. Zu Beginn zeigt der Chart nur den Schulschnittbalken; Vergleichswerte und Lerngruppen schaltet die Legende dazu. Wächst die Breite über den Container hinaus, scrollt der SVG-Bereich horizontal.

## Design/Idee

Eine Darstellung der Kompetenzstufenverteilung im klassischen stacked bar chart, angewendet auf alle Lerngruppen und Domänen zzgl. Schulmittelwert und Landeswert. Bei vier Parallelklassen und fünf getesteten Domänen (zwei Sprachen plus Mathematik) entstehen bereits 30 verschiedene Balken. Das Interface der Graphik erlaubt, Inhalte (bspw. Fächer, Lerngruppen oder Vergleichswerte) ein- und auszublenden, um die Komplexität zu reduzieren; zu Beginn ist je Domäne nur der Schulwert eingeblendet. Eine tiefergreifende Auseinandersetzung mit den Ergebnissen soll in den darauffolgenden Ansichten geschehen; diese Ansicht dient der initialen Identifikation von Erfolgen und/oder Herausforderungen.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group` | `type`¹ (`school` findet die Schulzeile), `id`¹ der Schulzeile (Vergleichszeilen: je `id` ein Balken), `name`, `subject.name`¹, `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency`, `.total` (ohne `total`: `.mean`) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Zeilen ohne `subject` fallen weg. Die Balken zeichnen `frequency / total`, nicht `mean`, das der Server auf vier Stellen rundet; eine Vergleichszeile ohne `total` ihr `mean`. Eine Lerngruppe mit `total` 0 oder ohne `total` zeigt statt eines Balkens den Hinweis auf fehlende Teilnahme, eine Vergleichszeile ohne jeden Anteil fällt weg. Der Tooltip jedes Balkens — Lerngruppe, Schulschnitt, Landesschnitt — liest Anzahl und Gesamtanzahl aus der eigenen Zeile (`frequency`, `total`), nicht aus der Schulzeile, neben der der Balken steht.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` | `domain` | Das Fach gilt als Fach ohne Domänen: eine Balkengruppe unter dem Fachnamen; zwei Zeilen derselben Gruppe eines Fachs ohne `domain` weist der Store ab (`DocumentShapeError`) |
| `competence-levels` | Vergleichszeilen (`comparison=state-average`) | Keine Vergleichsbalken und kein L-Schalter |
| `competence-levels` | Schulzeile (`type=school`) je Fach und Domäne | Der Schulschnittbalken bleibt leer; die Lerngruppen werden nicht aufsummiert |

Store: der Descriptor nennt in `documents` das Dataset `sl.competenceLevelIndex` (`SL_DATASETS.COMPETENCE_LEVEL_INDEX`, `buildCompetenceLevelIndex` über `competence-levels.json`). `createRenderer(host)` liest daraus die schon getrennten Schul-, Lerngruppen- und Vergleichszeilen. Der Renderer baut seine Balken aus den Zeilen des Detailcharts für die ganze Schule (`prepareCompetenceDetailChartData`), sodass Übersicht und Detailchart dieselben Zahlen zeigen.

Datentabelle: die Tabelle ist die `dataTable()` des `CompetenceOverviewRenderer`: eine Zeile je Balken, den die Pillen zeigen (Fächer × Vergleich/Lerngruppen; anfangs nur der Schulschnitt), mit Bereich, Gruppe, Anzahl und je eingeblendeter Stufe Anteil und Anzahl. Eine Lerngruppe, die das Fach nicht geschrieben hat, und eine Stufe außerhalb der Leiter des Fachs bleiben leer; ein Vergleichswert, der nur Anteile liefert, zeigt in Tabelle und Tooltip Anteile ohne Anzahl. Hat keine Lerngruppe Ergebnisse, fehlt der Legendenblock Lerngruppen.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `glossaryKey` | `string` | – | ja | Titel und Untertitel |

## Methoden
Keine eigenen.
