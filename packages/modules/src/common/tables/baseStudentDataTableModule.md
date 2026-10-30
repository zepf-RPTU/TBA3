# BaseStudentDataTableModule

## Zweck
Gemeinsames Gerüst der Einzelergebnis-Tabellen: die Aufgabenzeilen genau einer Person, mit Leerung, wenn niemand gewählt ist oder die Person keine Zeilen hat. Die Unterklasse liefert die Zeilen und die Tabellen-Spezifikation. Stellt die Niveau-Presets „Unter KS“ und „Über KS“ bereit (`_getPresets()`).

## Daten
Keine API-Daten. Die Unterklassen nennen die Felder, die ihre Spalten lesen, einschließlich derer, die diese Basis in Spalten, Sortierung, Filtern und Presets liest.

Kein Payload: die gewählte Person kommt als Option `studentId`. `_renderBody` holt ihre Ergebniszeilen (eine je Aufgabe) und ihre erreichte Stufe über den Hook `_readStudent(studentId)` aus dem `DocumentStore`, in einem Rückgabewert `{ rows, reachedSpanOf }`: die Basis merkt sich `reachedSpanOf` für die Stufen-Presets, bevor die Zeilen erscheinen. Ohne Person oder ohne Zeilen leert `clear()` die Tabelle; sonst gehen die Zeilen mit der Tabelle aus `_tableSpec()` an `setRows`. Die Unterklasse nennt in `static documents`, was ihr Lesehook braucht.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `studentId` | `ReadonlySignal<string\|null> \| string \| null` | `null` | nein | Die gezeigte Person: das App-Signal `currentStudentId`, dem die Tabelle folgt, oder eine feste ID |

Die Tabelle folgt dem Signal über einen `TableModeController` (`followStudent`, Schranke wie unter `TableModule` Modi): ein Wechsel läuft den Inhaltsdurchlauf neu, ein Wechsel auf keine Person lässt die Tabelle stehen.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_readStudent(studentId)` | Override (abstrakt) | `{ rows, reachedSpanOf }` einer Person aus `documents`, `null` für eine unbekannte: die Ergebniszeilen und je Zeile die Aufgabenniveau-Spanne (`itemLevelSpan`) der erreichten Stufe |
| `_tableSpec()` | Override (abstrakt) | Die Tabelle der Zeilen: `{ columns, initialSort?, options?, onRowClick? }` |
| `_getPresets()` | Override | „Unter KS“ (nicht gelöst, Aufgabenniveau unter der erreichten Stufe) und „Über KS“ (gelöst, darüber), gegen das `reachedSpanOf` der gezeigten Person, gelesen, wenn der Filter läuft |
| `getExportIdentity()` | Override | Die Person der Option `studentId`: eine Instanz bedient alle, jede bekommt ihr eigenes Exportziel |
