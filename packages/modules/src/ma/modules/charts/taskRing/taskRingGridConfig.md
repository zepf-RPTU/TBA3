# ChartHostModule + taskRingGridConfig

## Zweck
Das Raster der Aufgabenringe („Donuts“) im MA-Dashboard: ein Ring pro Leitidee plus „Alle Aufgaben“, optional mit innerem Ring für das Aufgabenniveau. In der Übersicht zeigt es die Klasse, in Aufgaben- und Schüler:innen-View die aktuelle Auswahl hervorgehoben; in der Schüler:innen-View steht ein Host jeweils für eine Person.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../module-base/src/modules/contentModule.md)
    - [ChartHostModule](../../../../common/charts/host/chartHostModule.md)
      - **taskRingGridConfig** — Descriptor

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `items` | – | `type`¹ (`group`), `items[].iqbId`, `domain.id`¹ (ein Ring je Leitidee) |
| `aggregations` | `type=items`, `aggregation=result` | `id`¹ (die `iqbId`), `aggregations[type=Ergebnis]` mit `value=Richtig` und `descriptiveStatistics.frequency`, `.total` (Lösungsquote der Klasse, äußerer Ring) |
| `competence-levels` | `type=students` | `id`¹, `competenceLevels[].nameShort` (erste Stufe; der KS-Filter der Übersicht vergleicht sie) |
| `aggregations` | `type=students` | `id`¹, `aggregations[type=Ergebnis]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `includedIqbIds`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Eine `items`-Zeile ohne `type=group` gilt als Vergleichszeile; ohne `type` wirft der Start des MA-Dashboards. Ohne `domain.id` zeigt jeder Leitideen-Ring das ganze Testheft. Eine Aufgabe, die die Item-Aggregation nicht über ihre `id` abdeckt, segmentiert den Ring, zählt aber nicht in die Klassenquote. Die Werte einer Auswahl (Schüler:in, KS-Filter) zählen die Ergebnisse aus `includedIqbIds`, über die `id` beider Schüler:innen-Dokumente zugeordnet; fehlt eines davon, zeigt die Auswahl 0 % gelöst oder gar keinen Personen-Strich.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `items` | `domain.name` | Der Leitideen-Ring trägt die Leitideen-`id` als Titel |
| `items` | `items[].parameters.competenceLevel.nameShort` | Der innere Ring hat ein einziges unbeschriftetes Segment in neutraler Farbe |
| `items` | `items[].parameters.solutionFrequencyGymnasium`, `…NonGymnasium`, `…PrimarySchool` (der erste vorhandene zählt) | Eine Aufgabe ohne Wert (auch `null`) zählt nicht in den Ø; trägt keine Aufgabe des Rings einen Wert, fehlen Ø-Strich und Tooltip |
| `competence-levels` (`type=students`) | `properties[firstName]`, `properties[lastName]` | Der Tooltip des Personen-Strichs heißt „Ausgewählte Schüler:innen“ statt des Namens |

Payload: `createRenderer(host, data)` und `onUpdate` erhalten `{ itemArray, studentArray, domains, selectedStudents?, selectedDomain? }`: `itemArray` aus `MA_DATA_KEYS.ITEM_RECORDS` (`buildItemArray`, `src/ma/utils/maItemDataAdapter.js`) mit `domain`, `competenceLevel`, `correctCount`, `total`, `pilotierungswert` und `results`; `studentArray` aus `STUDENT_RECORDS` (`buildStudentRecords`) mit `studentId`, `firstName`, `lastName`, `ks`; `domains` aus `getMaDomains(dataStore)`, ein `{ domain, domainLabel }` je Klassenzeile von `items`. Übersicht und Aufgaben-View schneiden den Ausschnitt beim Hydrieren aus dem App-Payload, Schüler:innen-View und Chart-only-Layout bauen das Objekt selbst (`remountChartHost`); `selectedStudents` sind Schüler:innen-IDs, `selectedDomain` kommt aus `chartOnlyDomainId`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `enableDomainSelection` | `boolean` | `false` | nein | Klick auf einen Ring wählt die Leitidee |
| `onDomainSelected` | `(domainId: string) => void` | – | nein | Ring-Klick bzw. Vorauswahl; ohne Handler wird die Leitidee nicht gemeldet |
| `defaultInnerRingVisible` | `boolean` | `true` | nein | Die Übersicht startet mit `false` (innerer Ring ausgeblendet) |
| `glossaryKey` | `string` | `glossaryPath` des Descriptors | nein | Titel-/Untertitel-Eintrag je View |
| `showModuleTitle`, `enableModuleExport` | `boolean` | `true` | nein | Descriptor-Defaults für den Host |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setKsLevelFilter(level)` | Aufruf | Schüler:innen einer Kompetenzstufe in allen Ringen hervorheben, `null` löscht; die Hervorhebung überlebt einen Neuaufbau (Farbschema-Wechsel, Resize), weil `createRenderer` einen Payload ohne `selectedStudents` als „nicht geändert“ liest |
| `updateSelectedStudentsOptimized(selectedStudents)` | Aufruf | Nur die Hervorhebung erneuern; liefert `false`, wenn ein Neuaufbau nötig ist |
| `getSelectedDomain()` | Aufruf | Gewählte Leitidee oder `null` |
| `selectDomain(domainId)` | Aufruf | Wählt die Leitidee wie ein Ring-Klick, meldet sie aber nicht über `onDomainSelected`; liefert `false`, wenn sie schon gewählt oder nicht wählbar ist |
| `onDomainSelected(domainId)` | Callback | siehe Optionen |
| `getExportIdentity(host)` | Override | Die eine gewählte Schüler:innen-ID, sonst `null` |
