# BaseStudentInfoTableModule

## Zweck
Gemeinsames Gerüst der einzeiligen Steckbrief-Tabellen: Name, Kompetenzstufe, Merkmale und Kennzahlen der gewählten Person. Ohne Presets, ohne Zeilenauswahl, ohne Sortierung (`columnDefaults: { headerSort: false }`).

## Daten
Keine API-Daten. Die Unterklassen nennen die Felder, die ihre Spalten lesen, einschließlich derer, die diese Basis in Spalten, Sortierung, Filtern und Presets liest.

Kein Payload: die gewählte Person kommt als Option `studentId`. Die Basis sucht sie in den Zeilen des Hooks `_readStudentRecords()` und zeigt ihre Zeile (Tabulator zeigt und exportiert nur die definierten Spalten); ohne Person oder Treffer leert `clear()` die Tabelle. Die Unterklasse nennt in `static documents`, was ihr Lesehook braucht.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `studentId` | `ReadonlySignal<string\|null> \| string \| null` | `null` | nein | Die gezeigte Person: das App-Signal `currentStudentId`, dem die Tabelle folgt, oder eine feste ID |

Die Tabelle folgt dem Signal wie `BaseStudentDataTableModule` (`followStudent`).

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_getColumns()` | Override (abstrakt) | Spalten |
| `_readStudentRecords()` | Override (abstrakt) | Die Zeilen aus `documents`, eine je Person |
| `static layout` | Override | Das Tabulator-Layout; Standard `fitColumns` (die ganze Kartenbreite auf die Spalten verteilt) |
| `_createIdentityColumns(traitLabels)` | Helfer | Geschlecht und Merkmale, die ersten Spalten jeder Steckbrief-Tabelle; `traitLabels` ist das `TRAIT_LABELS`-Dataset des Fachkatalogs |
