# ChartHostModule + taskRingFocusConfig

## Zweck
Der Fokus-Ring des Chart-only-Layouts in Aufgaben- und Schüler:innen-View: ein einzelner, großer Aufgabenring zur gewählten Leitidee, darunter zwei Textblöcke („Auffällige Aufgaben“ mit den deutlich unterdurchschnittlich gelösten Aufgaben, „Leitideen und Fähigkeiten“ je Aufgabenniveau). Ein Host bedient nacheinander jede Leitidee; die Auswahl im Raster tauscht den Inhalt in place, der Kartentitel folgt dem Leitideen-Namen.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../module-base/src/modules/contentModule.md)
    - [ChartHostModule](../../../../common/charts/host/chartHostModule.md)
      - **taskRingFocusConfig** — Descriptor

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `items` | – | `type`¹ (`group`), `items[].iqbId`, `items[].name`, `items[].exercise.name`, `domain.id`¹ |
| `aggregations` | `type=items`, `aggregation=result` | `id`¹ (die `iqbId`), `aggregations[type=Ergebnis]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `descriptiveStatistics.frequency`, `.total` (Lösungsquote: äußerer Ring und „Auffällige Aufgaben“) |
| `competence-levels` | `type=students` | jede Zeile (ohne Zeilen bleibt die Karte leer), `id`¹ |
| `aggregations` | `type=students` | `id`¹, `aggregations[type=Ergebnis]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `includedIqbIds`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Eine `items`-Zeile ohne `type=group` gilt als Vergleichszeile; ohne `type` wirft der Start des MA-Dashboards. Ohne `domain.id` zeigt die Karte unter jeder Leitidee das ganze Testheft. Eine Aufgabe, die die Item-Aggregation nicht abdeckt, segmentiert den Ring, zählt aber nicht in die Klassenquote und erscheint nie unter „Auffällige Aufgaben“. Die Werte der gewählten Schüler:in zählen die Ergebnisse aus `includedIqbIds`: ohne `id` in `competence-levels` baut die Schüler:innen-View die Karte nicht, fehlen `id` oder `includedIqbIds` in `aggregations`, steht der Personen-Strich bei 0 %.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `items` | `domain.name` | Der Kartentitel zeigt die Leitideen-`id` |
| `items` | `items[].parameters.competenceLevel.nameShort` | Der innere Ring hat ein einziges unbeschriftetes Segment in neutraler Farbe; „Leitideen und Fähigkeiten“ nennt ein Niveau ohne Namen. Die Niveaus stehen in der Reihenfolge der registrierten Aufgabenniveau-Skala |
| `items` | `items[].parameters.solutionFrequencyGymnasium`, `…NonGymnasium`, `…PrimarySchool` (der erste vorhandene zählt) | Eine Aufgabe ohne Wert (auch `null`) zählt nicht in den Ø; trägt keine Aufgabe der Leitidee einen Wert, fehlen Ø-Strich und Tooltip |
| `competence-levels` (`type=students`) | `properties[firstName]`, `properties[lastName]` | Der Tooltip des Personen-Strichs heißt „Ausgewählte Schüler:innen“ statt des Namens |

Payload: `createRenderer(host, data)` und `onUpdate` erhalten `{ domainItems, studentArray, domain, selectedStudents }`, gebaut von `MaLayoutViewBase._createFocusChart`: `domainItems` sind die Datensätze aus `MA_DATA_KEYS.ITEM_RECORDS` (`buildItemArray`, `src/ma/utils/maItemDataAdapter.js`) mit `domain` gleich der Leitidee, gelesen werden `name`, `exerciseName`, `domain`, `competenceLevel`, `correctCount` und `total` (Ring), `percentageCorrect` („Auffällige Aufgaben“), `pilotierungswert` und `results`; `studentArray` aus `STUDENT_RECORDS` (`buildStudentRecords`) mit `studentId`, `firstName`, `lastName`; `domain` ist ein Eintrag aus `getMaDomains` (`{ domain, domainLabel }`); `selectedStudents` ist `[studentId]` in der Schüler:innen-View und `null` in der Aufgaben-View.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `glossaryKey` | `string` | `glossaryPath` des Descriptors | nein | Titel-/Untertitel-Eintrag je View |
| `showModuleTitle`, `enableModuleExport` | `boolean` | `true` | nein | Descriptor-Defaults für den Host; der Titel wird zur Laufzeit auf den Leitideen-Namen gesetzt |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `update(data)` | Aufruf | Andere Leitidee oder Auswahl in place zeigen (siehe Daten) |
| `getExportIdentity(host)` | Override | `[Leitidee, Einzelperson]`, beides `null`-fähig; unterscheidet die Exporte eines Hosts |

Keine `publicAPI`-Verben und keine Callback-Optionen; die Auswahl kommt vom Raster.
