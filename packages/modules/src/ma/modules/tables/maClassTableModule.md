# MaClassTableModule

## Zweck
Die Klassenübersichtstabelle der MA-Klassen-View: eine Zeile je Schüler:in mit ID-Link, Name, Geschlecht, „Richtig (von N)“, Verteilungsbalken (richtig | unbearbeitet | falsch), Kompetenzstufe und Merkmalen, dazu die Presets „Stärkste 5“, „Schwächste 5“ und „1 Punkt über/unter Schwellenwert“. Die Tabelle lässt sich in place auf einen Aufgabenpool (Gesamt oder eine Leitidee) umschalten; auf einer Leitidee entfallen die Kompetenzstufen-Spalte und die Schwellenwert-Presets, weil Kompetenzstufen nur für das ganze Testheft definiert sind.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../module-base/src/modules/contentModule.md)
    - [TableModule](../../../common/tables/tableModule.md)
      - [BaseClassTableModule](../../../common/tables/baseClassTableModule.md)
        - **MaClassTableModule**

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=students` | `id`¹ (ID-Link und Schlüssel der Zählungen), `competenceLevels[].nameShort` (die erste Stufe ist die der Person) |
| `aggregations` | `type=students` | `id`¹, `aggregations[type=Ergebnis]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `descriptiveStatistics.frequency` (je Person über alle Zeilen summiert), `includedIqbIds`¹ (Leitideen-Pools) |
| `items` | – | `items[]` (ihre Zahl ist N in „Richtig (von N)“), `items[].iqbId` (Leitideen-Pools) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Die Zählungen werden über die `id` zugeordnet: fehlt sie, zeigt keine Zeile ihre eigene Zählung, und ID-Spalte und Link bleiben leer. Auf einem Leitideen-Pool zählt die Tabelle über `includedIqbIds` neu; ohne sie steht jede Zeile auf 0 richtig mit leerem Balken.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`type=students`) | `properties[firstName]`, `properties[lastName]` | Name und Vorname leer, die Standardsortierung nach Nachname greift nicht, der Tooltip des ID-Links lautet „Einzelergebnisse anzeigen“ statt „Einzelergebnisse von `<Name>`“ |
| `competence-levels` (`type=students`) | `properties[equivalenceTable:<booklet>]`, genau eine Tabelle | Die ±Schwellenwert-Presets messen die Person an den Schwellen der Klassenzeile |
| `competence-levels` (`comparison=…`) | `properties[equivalenceTable:<booklet>]` der Zeile mit `type=group`, genau eine Tabelle mit `maxScore` gleich `itemCount` | „1 Punkt über/unter Schwellenwert“ fehlen, auch wenn Schüler:innen-Zeilen eigene Schwellen tragen: die Presets vergleichen `summedResult`, die Zahl gelöster Aufgaben, und das ist nur bei einem Punkt je Aufgabe dieselbe Skala wie die der Schwellen |
| `competence-levels` (`type=students`) | `covariates[gender]` mit `male`, `female`, `diverse` | Zelle „Geschlecht“ leer; die Person fällt aus jeder Auswahl des Geschlechtsfilters außer „Alle“ |
| `competence-levels` (`type=students`) | `covariates[trait]` | Zelle „Merkmale“ zeigt „—“ mit Tooltip `general.messages.no-traits`; der Merkmalsfilter führt die Person unter „Keine“, die Sortierung stellt sie ans Ende |
| `items` | `domain.id` | Jeder Leitideen-Pool umfasst das ganze Testheft |

Payload: `_doRenderContent(data)` erhält `{ studentArray, nrItems, ksLevels, classKsThresholds }` aus `scopeStudentData` der Klassen-View: `studentArray` aus `MA_DATA_KEYS.STUDENT_RECORDS` (`buildStudentRecords`, `src/ma/utils/maStudentDataAdapter.js`), auf einem Leitideen-Pool von `buildScopedStudentRecords` über die `results` der Aufgabendatensätze neu gezählt; `nrItems` ist die Aufgabenzahl des Pools; `ksLevels` ist die Stufenfolge der Klassenzeile (`type=group`) von `competence-levels` (`getScaleLevels`) und ordnet nur das Filtermenü; `classKsThresholds` liefert `resolveClassKsThresholds` (`src/ma/utils/maClassKsThresholds.js`), `null` ohne passende Tabelle der Klassenzeile; `null` schaltet die ±Schwellenwert-Presets ab. `setActivePool(pool, { studentArray, nrItems })` bringt dieselben Felder für einen anderen Pool; von der Option `pool` liest die Tabelle nur `id` und `type`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `enableModuleExport` | `boolean` | `true` | nein | Export-Button im Kartenkopf |
| `pool` | `MaTaskPool` | `null` (= Gesamt) | nein | Aktiver Aufgabenpool beim Aufbau; später über `setActivePool` |
| `onKsFilterCleared` | `() => void` | – | nein | Tabellen-Reset oder Pool-Wechsel hat den Kompetenzstufen-Filter verworfen |
| `onStudentSelected` | `(studentId: string) => void` | – | nein | Klick auf den ID-Link einer Zeile |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setKsLevelFilter(level)` | Aufruf | Kompetenzstufen-Spalte auf eine Stufe filtern, `null` löscht; auf einer Leitidee ignoriert |
| `setActivePool(pool, { studentArray, nrItems })` | Aufruf | Spalten, Zeilen und Presets in place auf den Pool umstellen; Filtermenüs bleiben, Preset und KS-Filter fallen |
| `onKsFilterCleared()` | Callback | siehe Optionen |
| `onStudentSelected(studentId)` | Callback | siehe Optionen |
| `getExportIdentity()` | Override | `pool.id` (bzw. `pool.type`), jeder Pool ist ein eigenes Exportziel |
