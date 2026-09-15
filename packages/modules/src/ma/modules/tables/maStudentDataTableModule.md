# MaStudentDataTableModule

## Zweck
Die Aufgabentabelle einer einzelnen Schüler:in in der MA-Schüler:innen-View: eine Zeile je Aufgabe mit Leitidee, Nummer (mit Aufgaben-Vorschau), Aufgabenname, Aufgabenniveau und Ergebnis (✓ richtig, ✗ falsch, ⊘ unbearbeitet). Die Presets „Unter KS“ (nicht gelöste Aufgaben unterhalb der erreichten Kompetenzstufe) und „Über KS“ (gelöste Aufgaben oberhalb) beziehen sich auf die Stufe der gerade gezeigten Person. Ein Personenwechsel tauscht die Zeilen per `replaceData` aus, ohne die Tabelle neu zu bauen.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../module-base/src/modules/contentModule.md)
    - [TableModule](../../../common/tables/tableModule.md)
      - [BaseStudentDataTableModule](../../../common/tables/baseStudentDataTableModule.md)
        - **MaStudentDataTableModule**

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `aggregations` | `type=students` | `id`¹, `aggregations[type=Ergebnis]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `includedIqbIds`¹ (eine Zeile je enthaltener Aufgabe) |
| `items` | – | `items[].iqbId`, `items[].name`, `items[].exercise.name` |
| `competence-levels` | `type=students` | `id`¹ (wählt die Person), `competenceLevels[].nameShort` (erste Stufe: Bezug von „Unter KS“ und „Über KS“) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Die Zeilen entstehen aus `includedIqbIds` und werden über die `id` der Person zugeordnet, die in beiden Schüler:innen-Dokumenten dieselbe sein muss; fehlt eines davon, bleibt die Tabelle leer. Eine `iqbId`, die keine Klassenzeile von `items` führt, fällt weg.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `items` | `domain.name` | Leitidee-Spalte leer, Leitideenfilter nur „Alle“ |
| `items` | `items[].parameters.competenceLevel.nameShort` | Niveauspalte „N/A“ ohne Farbe, Niveaufilter leer; „Unter KS“ und „Über KS“ lassen die Aufgabe aus |

Payload: `_doRenderContent(data)` erhält `{ studentArray, rawStudentArray, studentId }` von `MaStudentTablesModule`: `rawStudentArray` aus `MA_DATA_KEYS.RAW_STUDENT_RECORDS` (`buildRawStudentArray`, `src/ma/utils/maStudentDataAdapter.js`), eine Zeile je Person und Aufgabe mit `ergebnis` `1`/`0`/`-1`, von der Basisklasse nach `studentId` indiziert; aus `studentArray` (`STUDENT_RECORDS`) liest die Tabelle nur `ks` der gezeigten Person. `onItemPreview` bekommt `{ number, title, domainLabel, level }` aus der Zeile.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `externalHeaderActionsContainer` | `HTMLElement` | – | nein | Vom Wrapper gesetzt: Preset- und Spaltenbuttons landen in dessen Titelzeile |
| `onItemPreview` | `(task) => void` | – | nein | Vom Wrapper gesetzt: Vorschau-Button der Nummernspalte; ohne Handler kein Button |

Keine eigenen `setDefaults`; die übrigen Optionen (`appState`, `dataStore`, `glossaryData`, `onNavigate`) kommen aus `_childOptions()` des Wrappers.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_renderForStudent(schuelerId)` | Override | Zeilen der Person aufbereiten, Tabelle bauen oder per `safeReplaceData` austauschen, Presets erneuern |
| `_getPresets()` | Override | „Unter KS“ / „Über KS“ relativ zur erreichten Kompetenzstufe der gezeigten Person |
| `onItemPreview(task)` | Callback | `{ number, title, domainLabel, level }` |

Keine öffentlichen Verben über die Basisklasse hinaus (`clear`, `redraw`).
