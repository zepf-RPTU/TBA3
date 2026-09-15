# BaseStudentInfoTableModule

## Zweck
Gemeinsames Gerüst der einzeiligen Steckbrief-Tabellen von EN und MA in der Schüler:innen-View: Name, Kompetenzstufe, Merkmale und Kennzahlen der gewählten Person. Ohne Presets, ohne Zeilenauswahl; beim Personenwechsel werden die Daten in place ersetzt, nur bei Fehlschlag wird die Tabelle neu gebaut.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../module-base/src/modules/contentModule.md)
    - [TableModule](tableModule.md)
      - **BaseStudentInfoTableModule**
        - [EnStudentInfoTableModule](../../en/modules/tables/enStudentInfoTableModule.md) — über Mixin `withDomainMode`
        - [MaStudentInfoTableModule](../../ma/modules/tables/maStudentInfoTableModule.md)

## Daten
Keine API-Daten. Die Unterklassen nennen die Felder, die ihre Spalten lesen, einschließlich derer, die diese Basis in Spalten, Sortierung, Filtern und Presets liest.

`_doRenderContent({ studentArray, rawStudentArray, studentId })` erhält die Schüler:innen-Datensätze, die Ergebniszeilen und die gewählte Person. Nach `_onBeforeRender(data)` sucht `_renderInfoTable` die Person per `studentId` in `studentArray` (nicht gefunden leert die Tabelle) und baut ihre Zeile mit `_buildTableData`; ohne `studentId` leert `clear()` die Tabelle.

## Optionen
Wie Basis.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `clear()` | Aufruf | Tabelle zerstören und Body leeren |
| `_renderInfoTable(studentId)` | Helfer | Daten bauen und Tabelle ersetzen oder anlegen |
| `_getColumns()`, `_buildTableData(studentData, studentId)` | Override (abstrakt) | Spalten; Zeilenarray (üblicherweise eine Zeile) |
| `_onBeforeRender(data)` | Override (Hook) | Standard no-op |
| `_studentArray`, `_rawStudentArray`, `_currentStudentId` | Felder | Datensätze; Rohzeilen; gewählte Person |
