# EnStudentTablesModule

## Zweck
Eine Karte für eine Person: im ContentModule-Kopf steht die Personenauswahl (`SelectControlModule`) an der Stelle des Titels, der für Screenreader in der Gliederung bleibt; darunter die Kopf-Tabelle (`EnStudentInfoTableModule`) und die Aufgabenliste (`EnStudentDataTableModule`). Die Kopf-Buttons der Aufgabenliste landen in einer eigenen Leiste innerhalb der Kopf-Aktionen.

## Design/Idee

Die linke Seite der Ansicht wird durch eine Tabelle eingenommen, welche Lerngruppen- und Aufgabentabelle kombiniert. Die Kopfzeile dient der Auswahl einzelner SuS über ein Dropdown anhand des Namens. Die Tabelle enthält die wesentlichen Merkmale sowie die individuellen Testergebnisse in aufgabenbezogener Auflösung.

## Kinder
| Kind | Unit / Config | Doc | Besondere Optionen |
|---|---|---|---|
| Personenauswahl im Kartenkopf (erzeugt von der Basis) | `SelectControlModule` | – | `items` aus `EN_DATASETS.STUDENT_RECORDS`, `value`: die gewählte Person, `onChange` → `onStudentSelected` |
| Kopf-Tabelle | `EnStudentInfoTableModule` | [enStudentInfoTableModule.md](../../../../packages/modules/src/en/modules/tables/enStudentInfoTableModule.md) | `studentId`, `domainMode`, `glossaryKey`: `infoGlossaryKey` |
| Aufgabenliste | `EnStudentDataTableModule` | [enStudentDataTableModule.md](../../../../packages/modules/src/en/modules/tables/enStudentDataTableModule.md) | `studentId`, `domainMode`, `glossaryKey`: `dataGlossaryKey`, `onItemSelected` |

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=students` | `id`¹ (die `studentId` der gezeigten Person: Auswahl, Render der Kinder, Export-Identität), `domain.id`¹ (nur eine Zeile mit einer Domäne von `en.config` legt die Person in der Auswahl an), `properties[firstName]`¹, `properties[lastName]`¹ |
| `aggregations` | `type=students` | `id`¹ (auch eine Person, die nur hier steht, bekommt einen Eintrag), `domain.id`¹ (ebenso), `properties[firstName]`¹, `properties[lastName]`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht.

Keine optionalen Felder.

Payload: keiner. Die Karte deklariert `EN_DATASETS.STUDENT_RECORDS` (`static documents`) und gibt die Datensätze der Personenauswahl der Basis (`_createStudentSelector`); die Felder der beiden Tabellen nennen deren Docs. Ohne `studentId` zeigt die Karte nur die Personenauswahl.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `domainMode` | `string \| Signal<string>` | – | nein | Domänen-Modus (das App-Signal `currentMode`), an beide Tabellen durchgereicht, die ihm selbst folgen |
| `infoGlossaryKey` | `string` | – | ja | `glossaryKey` der Kopf-Tabelle |
| `dataGlossaryKey` | `string` | – | ja | `glossaryKey` der Aufgabenliste |
| `onItemSelected` | `(payload: { itemIds }) => void` | – | nein | Zeilenklick in der Aufgabenliste, durchgereicht |

`studentId`, `onStudentSelected` und `context` sind die der Basis [`StudentSelectCardModule`](../../../common/modules/studentSelectCard/studentSelectCardModule.md); die Karte zeigt eine neu gewählte Person erst, wenn die View sie in das Signal `studentId` schreibt. Die beiden Tabellen bekommen `studentId` und `context` durchgereicht.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderBody()` | Override | Personenauswahl an die Stelle des Titels setzen, Kopf-Tabelle und Aufgabenliste für die aktuelle Person erzeugen |
| `_headerActions()` | Override | Die Toolbar der Aufgabenliste (`tableHeaderActions()`) vor dem Export; deren Signals halten sie aktuell |
| `getExportIdentity()` | Override | Die aktuelle Personen-ID |
| `_getExportType()` | Override | `'table'` |
