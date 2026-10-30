# MaStudentTopBarModule

## Zweck
Eine Kopfleiste über die volle Modulbreite: links der Schüler:innen-Selektor, daneben die einzeilige Info-Tabelle der gewählten Person (Geschlecht, „Richtig“ als „x von N“, Kompetenzstufe, Merkmale); beide mittig, bei zu wenig Platz die Tabelle darunter. Dem App-Signal `currentStudentId` folgt die Leiste über ihre Basis [`StudentSelectCardModule`](../../../common/modules/studentSelectCard/studentSelectCardModule.md).

## Design/Idee

Eine Kopfzeile oberhalb von Tabelle und Diagrammen zeigt den/die ausgewählten Schüler:in und bietet ein Dropdown-Menü, um zwischen SuS zu wechseln. Unabhängig von der ein- oder zweiseitigen Ansicht erstreckt sich die Zeile über die gesamte Breite der Seite.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Schüler:innen-Selektor (erzeugt von der Basis) | `SelectControlModule` | – | `items` aus `MA_DATASETS.STUDENT_RECORDS`, `value`: die gewählte Person, `onChange` → `onStudentSelected` |
| Info-Tabelle | `MaStudentInfoTableModule` | [maStudentInfoTableModule.md](../../../../packages/modules/src/ma/modules/tables/maStudentInfoTableModule.md) | `studentId`, `glossaryKey: 'ma.student.student-row'`, `showModuleCard: false` |

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=students` | `id`¹ (`studentId`: Wert je Eintrag der Personenauswahl und Schlüssel, unter dem die Infotabelle die Person sucht), `properties[firstName]`¹, `properties[lastName]`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht.

Keine optionalen Felder.

Payload: keiner; die Person kommt aus dem Signal `studentId`. Die Karte deklariert `MA_DATASETS.STUDENT_RECORDS` (`static documents`) für die Personenauswahl. `MaStudentInfoTableModule` bekommt das Signal als Option `studentId` und liest seine Zeile selbst; sein Doc nennt die Felder.

## Optionen
Keine eigenen; `studentId`, `onStudentSelected` und `context` sind die der Basis [`StudentSelectCardModule`](../../../common/modules/studentSelectCard/studentSelectCardModule.md).

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderBody()` | Override | Personenauswahl und Info-Tabelle nebeneinander setzen; die Tabelle bekommt das Signal `studentId` und folgt ihm selbst |
