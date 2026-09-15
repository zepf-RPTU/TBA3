# EnClassTableModule

## Zweck
Die Klassentabelle des EN-Dashboards: eine Zeile je Schüler:in mit ID, Name, Geschlecht, Merkmalen, je Domäne einer Verteilungsleiste (richtig | unbearbeitet | falsch) und der GER-Stufe, dazu im Domänen-Modus die Prozentwerte der Stil-Kategorien. Der Domänen-Schalter blendet Spalten um, ohne die Tabelle neu zu bauen. Die Tabelle treibt das Stil-Lollipop daneben: sie meldet ihre sichtbaren bzw. ausgewählten Zeilen als ID-Listen, und ihr Kopf trägt den Such-Button, der den Streudiagramm-Dialog öffnet.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../module-base/src/modules/contentModule.md)
    - [TableModule](../../../common/tables/tableModule.md)
      - [BaseClassTableModule](../../../common/tables/baseClassTableModule.md)
        - **EnClassTableModule** — über Mixin `withDomainMode`

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=students` | `id`¹ (wird `studentId`: Tabellenindex, ID-Link, Streudiagramm-Filter, Sync), `competenceLevels[].nameShort` der ersten Stufe (GER-Spalten) |
| `aggregations` | `type=students` | `id`¹, `domain.id`¹, `aggregations[type=Ergebnis]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `descriptiveStatistics.frequency`, `.total` (Verteilungsleisten; nach `value` gelesen, in beliebiger Reihenfolge) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `domain.id` gibt es nicht genau zwei Domänen, und der Konstruktor wirft (`assertExactlyTwoDomains`); ohne `id` fallen alle Personen eines Dokuments in eine Zeile. Fehlt einer der drei `Ergebnis`-Einträge, bleibt nur sein Segment leer; die anderen Anteile beziehen sich weiter auf `total`, ohne `total` bleibt die Leiste leer.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`type=students`) | `domain.id` | Beide GER-Spalten zeigen „N/A“ |
| `competence-levels` (`type=students`; auch `aggregations`) | `properties[lastName]`, `properties[firstName]` | Namensspalten leer, die Anfangssortierung nach Nachname wirkt nicht |
| `competence-levels` (`type=students`; auch `aggregations`) | `covariates[gender]` | Spalte „Geschlecht“ leer |
| `aggregations` (`type=students`) | `aggregations[type=Ergebnis]` mit `value` `Richtig` (`descriptiveStatistics.frequency`) | Die beiden Presets (stärkste und schwächste fünf) sortieren die Person mit 0 |
| `aggregations` (`type=students`) | `aggregations[type=Hör-/Lesestil]` (Kategorien aus der ersten Zeile, Werte je Person) | Keine Stilspalten im Domänen-Modus; fehlt nur der Wert einer Person, zeigt ihre Zelle „N/A“ |
| `competence-levels`, `aggregations` (`type=students`) | `domain.name` | Spaltenköpfe nennen die Domänen-id |

Payload: `_doRenderContent({ studentArray })` mit den Datensätzen aus `EN_DATA_KEYS.STUDENT_RECORDS` (`buildClassStudentRecords`, `src/en/utils/enStudentDataAdapter.js`). `_preprocessData` formt daraus die `d0*`/`d1*`-Zeilen (`deriveDomainResultFields`, `avgSummedResult`) und schreibt sie in den `studentStore`; die Basis sortiert anfangs nach `lastName` und baut die Filter für `gender` und `traits` aus den unverarbeiteten Datensätzen. Aus `enConfig` liest die Tabelle `domainIds`, `domainLabels`, `fieldName`, `domainFieldPrefix` und `styleCategories`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `enConfig` | `EnConfig` | – | ja | Domänen, Feldnamen, Stil-Kategorien; muss genau zwei Domänen haben |
| `domainMode` | `string` | `'all'` | nein | Anfangsmodus (Mixin) |
| `studentStore` | `{ setAll, getByIds }` | – | ja | Wird mit den Tabellenzeilen gefüllt, damit der Sync nur IDs trägt |
| `onDataSync` | `(data) => void` | – | nein | Sichtbare/ausgewählte IDs für das Stil-Diagramm |
| `onStudentSelected` | `(studentId) => void` | – | nein | Klick auf den ID-Link |
| `onOpenScatterSearch` | `() => void` | – | nein | Klick auf den Such-Button im Kopf |
| `onScatterFilterReset` | `() => void` | – | nein | Der Reset-Button hat den Streudiagramm-Filter gelöscht |
| `enableModuleExport` | `boolean` | `true` | nein | Export-Button |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setState({ mode })` | Aufruf | Domänen-Modus aus dem App-State (`currentMode`) |
| `applyExternalStudentFilter(studentIds)` | Aufruf | Persistenter Filter auf `studentId`; überlebt Presets und Neuaufbau, leere Menge löscht |
| `clearExternalStudentFilter()` | Aufruf | Streudiagramm-Filter entfernen |
| `onDataSync(data)` | Callback | `{ visibleIds, selectedIds?, mode }` |
| `onStudentSelected(studentId)` | Callback | siehe Optionen |
| `onOpenScatterSearch()` | Callback | siehe Optionen |
| `onScatterFilterReset()` | Callback | siehe Optionen |
| `getExportIdentity()` | Override | Der Domänen-Modus |
