# MaStudentViewModule

## Zweck
Die Schüler:innen-View der Mathe-3-Lerngruppe: oben eine Leiste mit Personenauswahl und Infotabelle über die volle Breite, links die Datentabelle der gewählten Person, rechts ihre Aufgabenringe der gewählten Gruppierung. Im Modus `chart-only` zeigen ein großes Raster und der Fokus-Chart die Ergebnisse dieser einen Person; im Modus `table-only` bleiben Leiste und Tabelle, deren Kompetenzspalten nur dann sichtbar sind (Option `showCompetences`).

## Design/Idee

Die Schüler:innenansicht verbindet Inhalte der Lerngruppenansicht sowie der Aufgabenansicht und wendet diese für einzelne SuS an; so werden neben den allgemeinen Merkmalen und Leistungsdaten aufgabenspezifisch Ergebnisse in tabellarischer und graphischer Form abgebildet, es stehen sowohl eine ein- als auch eine zweiseitige Ansicht zur Verfügung. Auch wenn der Fokus der Vergleichsarbeiten nicht auf der individuellen Schülerleistung liegt, wollte die Entwicklungsgruppe dennoch ein Tool integrieren, welches eine individualisierte Sicht ermöglicht und sich beispielsweise auch als Grundlage für Schüler- bzw. Elterngespräche nutzen lässt. Linksseitig liegt eine Tabelle mit umfassenden Informationen, rechtsseitig eine angepasste Version der donut charts, bei denen zusätzlich zur Lerngruppenleistung auch der/die Einzelschüler:in abgebildet ist.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Kopfleiste | `MaStudentTopBarModule` | [maStudentTopBarModule.md](../modules/maStudentTopBar/maStudentTopBarModule.md) | `studentId` (das Signal `currentStudentId`), `onStudentSelected` → App-State |
| Schüler:innenübersicht | `MaStudentDataTableModule` | [maStudentDataTableModule.md](../../../packages/modules/src/ma/modules/tables/maStudentDataTableModule.md) | `showModuleTitle: true`, `glossaryKey: 'ma.student.student-item-table'` (Titel und Tour-Text), `showCompetences` (berechnetes Signal: `layoutMode` ist `table-only`), `studentId` (das Signal `currentStudentId`, dem sie selbst folgt) |
| Aufgabenringe (Modus `both`), Chart-only-Raster und Fokus-Chart | siehe `MaLayoutViewBase` | [maLayoutViewBase.md](maLayoutViewBase.md#kinder) | `gridGlossaryKey: 'ma.student.item-ring-grid'` für beide Raster; alle drei markieren `currentStudentId` (Option `student`) und folgen einem Personenwechsel selbst, auch verborgen |

## Daten
| Endpunkt | Parameter | Geht an |
|---|---|---|
| `competence-levels` | `type=students` | Kopfleiste (Personenauswahl und Infotabelle, aus `STUDENT_RECORDS`), Schüler:innenübersicht (Kompetenzstufe der Person), Aufgabenringe (Lerngruppengröße, Name im Tooltip) |
| `aggregations` | `type=students` | Kopfleiste („x von N“ in `STUDENT_RECORDS`), Schüler:innenübersicht (Ergebnis je Aufgabe in `STUDENT_ITEM_ROWS`), Aufgabenringe (Ergebnisse der Person in `ITEM_RECORDS`) |
| `items` | – | Schüler:innenübersicht (Aufgabenangaben in `STUDENT_ITEM_ROWS`), Aufgabenringe (die Lerngruppenzeilen, in `ITEM_RECORDS`; die Ringe in `ITEM_RINGS`) |

Payload: nur Identität und Auswahl. Die Person ist `currentStudentId` aus dem App-State, die View hält keine eigene Kopie. Kopfleiste und Schüler:innenübersicht bekommen das Signal als Option `studentId`, die drei Ring-Hosts als Option `student` (über `_splitView()`); ihre Dokumente lesen alle selbst.

## Zustand
| Key | Schreibt | Empfänger-Verb |
|---|---|---|
| `currentStudentId` | Kopfleiste dieser View, `_openStudent` der Lerngruppentabelle, der Start der App | Kein Handler: Kopfleiste, Schüler:innenübersicht und die drei Ring-Hosts bekommen das Signal und folgen ihm selbst |

`layoutMode`, `chartOnlyRingId` und `itemRingGrouping` beobachtet die Basis, siehe [maLayoutViewBase.md](maLayoutViewBase.md#zustand).

## Verdrahtung
| Produzent.Callback | Konsument.Verb |
|---|---|
| Kopfleiste `onStudentSelected(studentId)` | `_selectStudent` schreibt `currentStudentId` |

Die Ring-Auswahl des Chart-only-Rasters verdrahtet die Basis, siehe [maLayoutViewBase.md](maLayoutViewBase.md#verdrahtung).

## Optionen
Keine eigenen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_splitView()` | Override | Kopfleiste und Schüler:innenübersicht erzeugen; Gerüst-Präfix `student`, Kopfleiste als `top`, linke Spalte: Schüler:innenübersicht, `gridGlossaryKey: 'ma.student.item-ring-grid'`, `student: currentStudentId` |
