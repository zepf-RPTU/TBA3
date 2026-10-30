# MaGroupViewModule

## Zweck
Die Lerngruppen-View der Mathe-3-Lerngruppe: oben ein einklappbarer Kompetenzstufen-Balken, darunter die Lerngruppentabelle aller Schüler:innen, die ihr eigenes Aufgabenpool-Menü trägt; ein Klick auf ein Balkensegment filtert die Tabelle auf diese Stufe, ein Klick auf eine Zeile öffnet die Schüler:innen-View.

## Design/Idee

Im Kern der Lerngruppenansicht steht eine beliebig erweiter- und anpassbare Tabelle. Ergebnisse können vollständig und übersichtlich abgebildet werden; dabei stehen gängige Tools zum Sortieren und Filtern zur Verfügung. Die entwickelnden Lehrkräfte wollten keine Vorauswahl der Ergebnisse treffen, sondern stattdessen die individuelle und zielgerichtete Auswahl und Exploration der Ergebnisse so intuitiv und niedrigschwellig wie möglich machen. Aus Sicht der auswertenden Einrichtungen kann die Tabelle leicht gekürzt oder um zusätzliche, landeseigene Merkmale (etwa die Halbjahresnote) ergänzt werden. Der Graph oberhalb der Tabelle liefert noch einmal die Kompetenzstufenverteilung der Lerngruppe, kann aber bei Bedarf ein- oder ausgeblendet werden. Tabelle und Graphik interagieren.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Kompetenzstufen-Balken | `ChartHostModule` + `simpleCompetenceLevelBarConfig` | [simpleCompetenceLevelBarConfig.md](../../../packages/modules/src/ma/modules/charts/competenceLevelBar/simpleCompetenceLevelBarConfig.md) | `onLevelToggled` |
| Lerngruppentabelle | `MaGroupTableModule` | [maGroupTableModule.md](../../../packages/modules/src/ma/modules/tables/maGroupTableModule.md) | `showModuleTitle: true`, `onCompetenceLevelFilterChanged`, `onStudentSelected` |

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | – | Kompetenzstufen-Balken (das rohe Dokument; gezeichnet wird die Lerngruppenzeile, `type=group`); Lerngruppentabelle (in `GROUP_COMPETENCE_LEVEL_THRESHOLDS`) |
| `competence-levels` | `type=students` | Lerngruppentabelle (`STUDENT_RECORDS`) |
| `aggregations` | `type=students` | Lerngruppentabelle (Zähler und N je Person in `STUDENT_RECORDS`; auf einer Leitidee die Zeile der Person mit dieser `domain.id`, roh aus `students-aggregations.json`) |
| `items` | – | Lerngruppentabelle (ihr Pool-Menü: die Aufgabenpools aus `ITEM_RINGS` und `ITEM_RECORDS`; die Aufgabenzahl einer Leitidee im Untertitel) |

Payload: keiner. Die View liest den Store nicht. Balken und Tabelle lesen ihre Dokumente selbst.

## Zustand
Keine App-State-Schlüssel beobachtet.

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Balken `onLevelToggled(level)` | Tabelle `toggleCompetenceLevelFilter(level)` |
| Tabelle `onCompetenceLevelFilterChanged(levels)` | Balken `updateHighlight(levels)` |
| Tabelle `onStudentSelected(studentId)` | `_openStudent(studentId)` |

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderView()` | Override | Balken und Tabelle erzeugen und verdrahten |
