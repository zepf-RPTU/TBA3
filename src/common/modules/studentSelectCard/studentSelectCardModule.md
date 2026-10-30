# StudentSelectCardModule

## Zweck
Basis einer Karte, die eine Person nach der anderen hinter einer Personenauswahl zeigt. Die Basis hält die gezeigte Person, baut die Personenauswahl und stellt sie bei einem Wechsel um; die Unterklasse baut ihr Layout und gibt ihren Tabellen das Signal, dem sie selbst folgen.

## Design/Idee

Eine Kopfzeile über den Tabellen, in der einzelne SuS anhand des Namens über ein Dropdown-Menü ausgewählt werden können. Sollte die Lehrkraft auf anderem Wege in die Schüler:innenansicht gelangen (bspw. durch Auswahl im Scatterplot), wird die Auswahl entsprechend auf dieses Auswahlmenü übertragen.

Die Karte folgt dem App-State, nicht ihrer eigenen Auswahl: sie bekommt das Signal `currentStudentId` als Option `studentId`, eine Wahl im Selektor meldet nur die ID nach außen (`onStudentSelected`), und erst der Wechsel des Signals – auch der eigene – stellt Auswahl und Tabellen um. So zeigen Auswahl und Tabellen nie zwei verschiedene Personen, gleich wer den Wechsel auslöst (Gruppentabelle, Detailansicht, Selektor). Eine verborgene Tabelle stellt sich erst um, sobald sie wieder sichtbar ist (Option `studentId` der Tabellen-Basen).

## Daten
Keine API-Daten. Die Einträge der Personenauswahl kommen aus den Personendatensätzen, die die Unterklasse übergibt (`toStudentSelectItems(records)`: `studentId` als Wert, „Nachname, Vorname“ als Beschriftung, nach Namen sortiert). Die Tabellen bekommen das Signal als Option `studentId` und lesen ihre Dokumente selbst.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `studentId` | `ReadonlySignal<string\|null>` | – | ja | Die gewählte Person, das App-Signal `currentStudentId`; die Karte folgt ihm |
| `onStudentSelected` | `(studentId: string) => void` | – | nein | Auswahl im Selektor (nicht bei einem Wechsel über das Signal) |
| `context` | `AppContext` | aus `_childOptions()` | ja | Kontext der App, an die Tabellen weitergegeben; sein Dokumentspeicher (`context.documents`) liefert der Unterklasse die Personenliste |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `state` | Getter | `{ studentId }`, das Signal der Option |
| `_createStudentSelector(records, containerClass)` | geschützt | Die Personenauswahl (`SelectControlModule`) auf der aktuellen Person |
