# EnStudentDataTableModule

## Zweck
Die Aufgabenliste einer einzelnen Schüler:in in der EN-Schüler:innen-View: je Item Nummer (mit Domänen-Präfix im Modus `all`), Aufgabe, Stile, Aufgabenniveau und das Ergebnis als Symbol. Der Domänen-Schalter tauscht die Zeilen gegen die der gewählten Domäne. Zwei Presets zeigen, welche Aufgaben unterhalb der erreichten GER-Stufe nicht gelöst bzw. oberhalb davon gelöst wurden; beide sind vorübergehend deaktiviert (`ASSUMPTION-EN-LEVEL-PRESETS-DISABLED`). Ein Zeilenklick öffnet die Aufgabe in der Detailkarte.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../module-base/src/modules/contentModule.md)
    - [TableModule](../../../common/tables/tableModule.md)
      - [BaseStudentDataTableModule](../../../common/tables/baseStudentDataTableModule.md)
        - **EnStudentDataTableModule** — über Mixin `withDomainMode`

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `items` | – | `items[].iqbId`, `items[].name`, `items[].exercise.name`, `domain.id`¹ (Gruppierung für den Domänen-Modus) |
| `aggregations` | `type=students` | `id`¹, `aggregations[type=Ergebnis]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `includedIqbIds`¹ (nach `value` gelesen, in beliebiger Reihenfolge) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `includedIqbIds` oder ohne Schüler:innen-`id` hat die Person keine Zeilen, und die Tabelle bleibt leer; ohne `domain.id` fehlt das Item. Ergebnissymbol und Ergebnisfilter kennen jeden `value`, den irgendeine Zeile liefert, in der festen Reihenfolge `Richtig`, `Falsch`, `Unbearbeitet`; die Presets vergleichen mit dem Code von `Richtig`.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `items` | `domain.name` | Im Modus `all` Nummern ohne Domänen-Präfix |
| `items` | `items[].position` | Teilaufgaben einer Aufgabe in Payload-Reihenfolge |
| `items` | `items[].parameters.competenceLevel.nameShort` | Niveauspalte „N/A“ ohne Farbe; das Item fällt aus beiden Presets |
| `items` | `items[].parameters.competences[type=Hör-/Lesestil].name` | Stilspalte leer, Stilfilter nur „Alle“ |
| `aggregations` (`type=students`) | `aggregations[type=Hör-/Lesestil].value` der ersten Zeile | Stile in Payload-Reihenfolge, die Stilsortierung wirkt nicht |
| `competence-levels` (`type=students`) | `id` und `domain.id` der Person | Ohne erreichte GER-Stufe bleiben beide Presets leer |

Payload: `_doRenderContent({ studentArray, rawStudentArray, itemArray, studentId })`, ebenso `render(...)` bei einem Personenwechsel. `rawStudentArray` kommt aus `buildStudentItemRecords` (`src/en/utils/enItemDataAdapter.js`) für die gezeigte Person, die Basis zieht daraus `domain`, `domainLabel`, `exercise`, `name`, `ergebnis`, `iqbId`, `competenceLevel`; `itemArray` aus `EN_DATA_KEYS.ITEM_RECORDS` liefert `style` je `iqbId` und den Datensatz für `onItemSelected({ item })`; `studentArray` aus `EN_DATA_KEYS.STUDENT_RECORDS` die erreichte Stufe (`{dataKey}CompLevel`) für die Presets. Der Domänen-Modus wählt die Zeilen nach `domain`, also `domain.id`. Aus `enConfig` liest die Tabelle `styleCategories`, `resultTypes` und `fieldName`; die Presets vergleichen `ergebnis` mit `RESULT_VALUES[RESULT_CORRECT]`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `enConfig` | `EnConfig` | – | ja | Stil-Kategorien, Ergebnistypen, Feldnamen der GER-Stufe |
| `domainMode` | `string` | `'all'` | nein | Anfangsmodus (Mixin) |
| `onItemSelected` | `(payload: { item }) => void` | – | nein | Zeilenklick |
| `onItemPreview` | `(task) => void` | – | nein | Vorschau-Button der Nummernspalte; ohne Handler kein Button |
| `glossaryKey` | `string` | – | ja | Titel und Tutorial; die Preset-Texte liegen fest unter `en.student.student-item-table.interface` |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setState({ mode })` | Aufruf | Domänen-Modus, vom Wrapper per `setDomainMode` gepusht |
| `render({ studentArray, rawStudentArray, itemArray, studentId })` | Aufruf | Andere Person anzeigen |
| `onItemSelected({ item })` | Callback | siehe Optionen |
| `onItemPreview(task)` | Callback | `{ number, title, domainLabel, level, styles }` |
