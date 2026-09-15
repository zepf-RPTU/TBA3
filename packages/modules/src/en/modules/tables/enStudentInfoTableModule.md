# EnStudentInfoTableModule

## Zweck
Die einzeilige Kopf-Tabelle einer Schüler:in in der EN-Schüler:innen-View: Geschlecht, Merkmale, je Domäne eine Verteilungsleiste (richtig | unbearbeitet | falsch) und die GER-Stufe, im Domänen-Modus zusätzlich die Prozentwerte der Stil-Kategorien dieser Domäne. Die Tabelle wird einmal gebaut; ein Personenwechsel tauscht die Zeile, der Domänen-Schalter blendet Spalten um.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../module-base/src/modules/contentModule.md)
    - [TableModule](../../../common/tables/tableModule.md)
      - [BaseStudentInfoTableModule](../../../common/tables/baseStudentInfoTableModule.md)
        - **EnStudentInfoTableModule** — über Mixin `withDomainMode`

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=students` | `id`¹ (findet die gezeigte Person), `competenceLevels[].nameShort` der ersten Stufe (GER-Spalten) |
| `aggregations` | `type=students` | `id`¹, `domain.id`¹, `aggregations[type=Ergebnis]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `descriptiveStatistics.frequency`, `.total` (Verteilungsleisten; nach `value` gelesen, in beliebiger Reihenfolge) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `domain.id` gibt es nicht genau zwei Domänen, und der Konstruktor wirft (`assertExactlyTwoDomains`); ohne `id` findet die Tabelle die Person nicht und bleibt leer. Fehlt einer der drei `Ergebnis`-Einträge, bleibt nur sein Segment leer; die anderen Anteile beziehen sich weiter auf `total`, ohne `total` bleibt die Leiste leer.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`type=students`) | `domain.id` | Beide GER-Spalten zeigen „N/A“ |
| `competence-levels` (`type=students`; auch `aggregations`) | `covariates[gender]` | Spalte „Geschlecht“ zeigt „N/A“ |
| `aggregations` (`type=students`) | `aggregations[type=Hör-/Lesestil]` (Kategorien aus der ersten Zeile, Werte der Person) | Keine Stilspalten im Domänen-Modus; fehlt nur der Wert der Person, zeigt die Zelle „N/A“ |
| `competence-levels`, `aggregations` (`type=students`) | `domain.name` | Spaltenköpfe nennen die Domänen-id |

Payload: `_doRenderContent({ studentArray, rawStudentArray, studentId })`, ebenso `render(...)` bei einem Personenwechsel. `studentArray` sind die Datensätze aus `EN_DATA_KEYS.STUDENT_RECORDS` (`buildClassStudentRecords`, `src/en/utils/enStudentDataAdapter.js`); gelesen werden `studentId`, `gender`, `traits`, je Domäne `{prefix}ResultCounts` (die `Ergebnis`-Häufigkeiten nach `value`, mit `total`), `{dataKey}CompLevel` und das Objekt der Stil-Prozente. `rawStudentArray` prüft die Tabelle nur auf Vorhandensein. Aus `enConfig` liest sie `domainIds`, `domainLabels`, `fieldName`, `domainFieldPrefix` und `styleCategories`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `enConfig` | `EnConfig` | – | ja | Domänen, Feldnamen, Stil-Kategorien; muss genau zwei Domänen haben |
| `domainMode` | `string` | `'all'` | nein | Anfangsmodus (Mixin) |
| `glossaryKey` | `string` | – | ja | Titel und Tutorial |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setState({ mode })` | Aufruf | Domänen-Modus, vom Wrapper per `setDomainMode` gepusht |
| `render({ studentArray, rawStudentArray, studentId })` | Aufruf | Andere Person anzeigen; die Tabelle bleibt bestehen (`replaceData`) |
| `clear()` | Override | Tabelle leeren und den Einmal-Aufbau zurücksetzen |
