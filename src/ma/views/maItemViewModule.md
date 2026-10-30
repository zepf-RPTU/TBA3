# MaItemViewModule

## Zweck
Die Aufgaben-View der Mathe-3-Lerngruppe: links die Aufgabentabelle, rechts das Aufgabenring-Raster der gewählten Gruppierung. Im Modus `chart-only` weicht beides einem großen Raster mit Ring-Auswahl und dem Fokus-Chart des gewählten Rings; im Modus `table-only` bleibt nur die linke Spalte, in der dann ein einklappbares Lösungsquoten-Lollipop über der Tabelle und deren Kompetenzspalten sichtbar werden (Option `showCompetences`).

## Design/Idee

Die Aufgabenansicht liefert vollständige Information rund um die Aufgaben, welche im verwendeten Testheft vorliegen. Hier sollen die Ergebnisse aus inhaltlicher Sicht in Bezug auf den Testgegenstand untersucht werden. Linksseitig zeigt, ähnlich wie in der Lerngruppenansicht, eine Tabelle relevante Informationen zu den Aufgaben des verwendeten Testhefts. Rechts erscheinen erneut die donut charts der Übersichtsansicht, welche Ergebnisse über die Lerngruppe hinweg zusammenfassen. Innerhalb der Ansicht kann zwischen einer zweiteiligen Seitenteilung gewählt werden oder einer solchen, bei der jeweils nur eine der beiden Seiten auf gesamter Fensterbreite angezeigt wird.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Aufgabentabelle | `MaItemTableModule` | [maItemTableModule.md](../../../packages/modules/src/ma/modules/tables/maItemTableModule.md) | `showModuleTitle: true` |
| Lösungsquoten-Lollipop (nur im Modus `table-only` sichtbar) | `ChartHostModule` + `itemSuccessLollipopConfig` | [itemSuccessLollipopConfig.md](../../../packages/modules/src/ma/modules/charts/itemSuccessLollipop/itemSuccessLollipopConfig.md) | – |
| Aufgabenringe (Modus `both`), Chart-only-Raster und Fokus-Chart | siehe `MaLayoutViewBase` | [maLayoutViewBase.md](maLayoutViewBase.md#kinder) | keine markierte Person (kein `student`): die Raster und der Fokus-Chart zeigen die Lerngruppe |

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `items` | – | Aufgabentabelle, Lösungsquoten-Lollipop, Aufgabenringe und Fokus-Chart (die Lerngruppenzeilen, in `ITEM_RECORDS`; die Ringe in `ITEM_RINGS`) |
| `items` | `comparison=school-average,state-average` | Lösungsquoten-Lollipop (die Vergleichszeilen, in `ITEM_COMPARISON_GROUPS`) |
| `aggregations` | `type=items`, `aggregation=result` | Aufgabentabelle (Richtig / Falsch / Unbearbeitet in `ITEM_RECORDS`) |
| `competence-levels` | `type=students` | Aufgabenringe und Fokus-Chart (die Lerngruppengröße: Zahl der Zeilen in `STUDENT_RECORDS`) |

Payload: keiner. Die View liest den Store nicht; Tabelle, Lollipop und Ringe lesen `ITEM_RECORDS` selbst, das Lollipop dazu die Vergleichsmittelwerte aus `ITEM_COMPARISON_GROUPS`. Die Ergebnisse je Person (`aggregations`, `type=students`) stecken in `ITEM_RECORDS`, erreichen hier aber kein Kind: ohne Schüler:innen-Auswahl zeichnen die Ringe nur Lerngruppenwerte.

## Zustand
`layoutMode`, `chartOnlyRingId` und `itemRingGrouping` beobachtet die Basis, siehe [maLayoutViewBase.md](maLayoutViewBase.md#zustand).

## Verdrahtung
Keine Geschwister-Verdrahtung; die Ring-Auswahl des Chart-only-Rasters verdrahtet die Basis, siehe [maLayoutViewBase.md](maLayoutViewBase.md#verdrahtung).

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_splitView()` | Override | Aufgabentabelle und Lollipop erzeugen; Gerüst-Präfix `item`, linke Spalte: Lollipop über der Aufgabentabelle; keine markierte Person |
