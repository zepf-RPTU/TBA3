# BaseGroupTableModule

## Zweck
Gemeinsames Gerüst der Lerngruppenübersichtstabellen: eine Zeile pro Schüler:in, Sortierung nach Nachname, Geschlechts- und Merkmalsfilter, der ID-Link zur Person und die Presets „Stärkste 5“ / „Schwächste 5“ (`createGroupRankPresets`). Die Unterklasse liefert die übrigen Spalten.

## Daten
Keine API-Daten. Die Unterklassen nennen die Felder, die ihre Spalten lesen, einschließlich derer, die diese Basis in Spalten, Sortierung, Filtern und Presets liest.

`_renderBody()` ruft `_reloadRows()`: es holt die Zeilen, eine je Schüler:in, über den Hook `_readStudentRecords()` aus dem `DocumentStore`; die Spalten kommen aus `_getColumns()`. Die Unterklasse nennt in `static documents`, was ihr Lesehook braucht.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `onStudentSelected` | `(studentId: string) => void` | – | nein | Klick auf den ID-Link einer Zeile |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_getColumns()` | Override (abstrakt) | Spalten |
| `_readStudentRecords()` | Override (abstrakt) | Die Zeilen aus `documents`, eine je Person |
| `_reloadRows()` | Helfer | Datensätze und Spalten neu lesen und über `setRows` zeigen, etwa wenn die Spalten einem Zustand folgen |
| `_createIdentityColumns(linkTooltip, traitLabels)` | Helfer | ID-Link (Klick → `onStudentSelected`), Name, Vorname(n), Geschlecht und Merkmale, die letzten beiden filterbar (Namen als Klartext, ohne Glossar); `traitLabels` ist das `TRAIT_LABELS`-Dataset des Fachkatalogs |
| `createGroupRankPresets(scoreField, scoreOf?)` | Export | „Stärkste 5“ / „Schwächste 5“ (`best-five`, `worst-five`) nach `scoreField`; ohne Wert zählt niemand dazu |
