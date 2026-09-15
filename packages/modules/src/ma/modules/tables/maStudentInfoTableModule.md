# MaStudentInfoTableModule

## Zweck
Die einzeilige Info-Tabelle zur gewählten Schüler:in in der MA-Kopfleiste: Geschlecht, „Richtig (von N)“, Kompetenzstufe und Merkmale, ohne Sortierung, Filter oder Presets. Ein Personenwechsel ersetzt die Zeile per `replaceData`. Die Spalten entstehen nur beim ersten Aufbau der Tabelle; der Kopf „Richtig (von N)“ behält das N dieses Aufbaus, ein später geänderter `totalItems` erreicht ihn nicht.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../module-base/src/modules/contentModule.md)
    - [TableModule](../../../common/tables/tableModule.md)
      - [BaseStudentInfoTableModule](../../../common/tables/baseStudentInfoTableModule.md)
        - **MaStudentInfoTableModule**

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=students` | `id`¹ (findet die Person), `competenceLevels[].nameShort` (erste Stufe: Kompetenzstufe der Person) |
| `aggregations` | `type=students` | `id`¹, `aggregations[type=Ergebnis]` mit `value=Richtig` und `descriptiveStatistics.frequency` (je Person über alle Zeilen summiert) |
| `items` | – | `items[]` (ihre Zahl ist N in „Richtig (von N)“) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `id` in `competence-levels` findet die Tabelle keine Person und bleibt leer; ohne passende `id` in `aggregations` steht „Richtig“ auf 0.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`type=students`) | `covariates[gender]` mit `male`, `female`, `diverse` | Spalte „Geschlecht“ zeigt „N/A“ |
| `competence-levels` (`type=students`) | `covariates[trait]` | Spalte „Merkmale“ zeigt „—“ mit Tooltip `general.messages.no-traits` |

Payload: `_doRenderContent(data)` erhält `{ studentArray, rawStudentArray, studentId, totalItems }` von `MaStudentTopBarModule`: die eine Zeile entsteht aus `gender`, `summedResult`, `ks` und `traits` des Datensatzes mit `studentId` in `studentArray` (`MA_DATA_KEYS.STUDENT_RECORDS`, `buildStudentRecords`, `src/ma/utils/maStudentDataAdapter.js`); `totalItems` ist die Länge von `ITEM_RECORDS`. `rawStudentArray` liest die Tabelle nicht, ohne es zeichnet die Basisklasse aber nichts.

## Optionen
Keine eigenen `setDefaults`; `glossaryKey` sowie `appState`, `dataStore`, `glossaryData`, `onNavigate` kommen über `_childOptions()` der Kopfleiste. `totalItems` reist ausschließlich im Payload, nicht als Option.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `_getColumns()` | Override | Geschlecht, „Richtig (von N)“, Kompetenzstufe, Merkmale, alle ohne Sortierung und Filter |
| `_buildTableData(studentData)` | Override | Genau eine Zeile `{ gender, summedResult, ks, traits }` |

Keine öffentlichen Verben über die Basisklasse hinaus (`clear`) und keine Callback-Optionen.
