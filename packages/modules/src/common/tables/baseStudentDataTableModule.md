# BaseStudentDataTableModule

## Zweck
Gemeinsames Gerüst der Einzelergebnis-Tabellen von EN und MA in der Schüler:innen-View: die Aufgabenzeilen genau einer Person, indiziert nach `studentId`, mit Leerung, wenn niemand gewählt ist. Die Unterklasse rendert die Tabelle selbst (`_renderForStudent`). Stellt die Prädikate „Unter KS“ und „Über KS“ für die Niveau-Presets bereit.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../module-base/src/modules/contentModule.md)
    - [TableModule](tableModule.md)
      - **BaseStudentDataTableModule**
        - [EnStudentDataTableModule](../../en/modules/tables/enStudentDataTableModule.md) — über Mixin `withDomainMode`
        - [MaStudentDataTableModule](../../ma/modules/tables/maStudentDataTableModule.md)

## Daten
Keine API-Daten. Die Unterklassen nennen die Felder, die ihre Spalten lesen, einschließlich derer, die diese Basis in Spalten, Sortierung, Filtern und Presets liest.

`_doRenderContent({ rawStudentArray, studentId })` erhält die Ergebniszeilen der Klasse (eine je Person und Aufgabe) und die gewählte Person. Nach `_onBeforeRender(data)` zeichnet `_renderForStudent(studentId)`, ohne `studentId` leert `clear()` die Tabelle; `_prepareStudentRows` gruppiert die Zeilen nach `studentId` und baut den Index bei neuem `rawStudentArray` neu auf.

## Optionen
Wie Basis.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `clear()` | Aufruf | Tabelle zerstören, Preset-Zustand zurücksetzen, Body leeren |
| `_prepareStudentRows(studentId, retainedColumns)` | Helfer | Zeilen der Person |
| `_renderForStudent(studentId)` | Override (abstrakt) | Spalten bauen und `createTable` rufen |
| `_onBeforeRender(data)` | Override (Hook) | Standard no-op |
| `_rawStudentArray`, `_currentStudentId` | Felder | Rohzeilen; gewählte Person |
