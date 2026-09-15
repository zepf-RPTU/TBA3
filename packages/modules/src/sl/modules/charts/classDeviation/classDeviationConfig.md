# ChartHostModule + classDeviationConfig

## Zweck
Eine Karte der SL-View „Überblick“ pro Fach×Domäne: der Schulwert der gewählten Kennzahl als Kasten, daneben je ein Balken pro Vergleichswert (Landesschnitt-Einträge) und pro Klasse als Abweichung vom Schulwert um eine Nulllinie. Kann die Kennzahl für diese Kombination nicht beantwortet werden, zeigt die Karte den Grund statt Balken. Ein ⌀-Dropdown im Kartenkopf schaltet die Vergleichswerte aller Karten gemeinsam.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../module-base/src/modules/contentModule.md)
    - [ChartHostModule](../../../../common/charts/host/chartHostModule.md)
      - **classDeviationConfig** — Descriptor

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=school,group` | `type`¹ (`school` findet die Schulzeile, `state` die Landesschnitte), `id`¹ der Schulzeile, `name`, `subject.name`¹, `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency`, `.total` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne Schulzeile mit `id` hat keine Karte einen Schulwert, und jede sagt statt Balken, dass die Schulzeile fehlt; Zeilen ohne `subject` fallen weg. Der Schulwert kommt aus der Schulzeile des Bereichs selbst, nicht aus den Klassenzeilen: jeder Anteil ist die `frequency` der gewählten Stufen durch das `total` der Zeilen, die Lösungsquote der Schule liest die `items`-Zeile mit der Schul-`id`.

Warum eine Karte keine Balken hat, sagt ein Satz aus dem Glossar (`sl.summary.deviation.messages`), je Grund aus `ABSENCE_REASONS` (`slSchoolSummaryMetrics.js`): keine Klassenzeilen (`no-class-data`), keine Schulzeile (`no-school-row`), keine Klasse mit Wert (`no-class-values`), oder die Kennzahl ist hier nicht berechenbar: dann nennt die Kennzahl ihren eigenen Satz (`unsupportedMessage` in `slSchoolSummaryMetricRegistry.js`: `metric-unsupported-competence-levels`, `metric-unsupported-solution-rate`). `{{Kennzahl}}` füllt die Karte mit dem Namen der gewählten Kennzahl.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` | `domain.id`, `domain.name` | Ein nach Domänen geteiltes Fach wird eine Karte unter dem Fachnamen, deren Werte alle Domänen zusammenfassen |
| `competence-levels` | `covariates[homeroom]` der Klassenzeile | Spalten heißen nach dem Gruppennamen (`name`) statt nach der Stammklasse |
| `competence-levels` | Zeilen mit `type=state` (`comparison=state-average`) | Keine Landesschnitt-Spalten, kein ⌀-Menü |
| `competence-levels` | `id` der `state`-Zeilen | Alle `state`-Zeilen ohne `id` werden ein Eintrag im ⌀-Menü (unter dem Namen der ersten) und eine Spalte, deren Wert alle `state`-Zeilen des Bereichs zusammenfasst, auch die mit `id` |
| `items` (`type=school,group`, `comparison=state-average`) | `id` (Schulzeile wie die Schul-`id`, Klassenzeilen wie ihre `id` in `competence-levels`), `subject.name`, `domain.id`, `items[].descriptiveStatistics.frequency`, `.total`; Landesschnitte über `type=state` und `id` | Unter der Kennzahl „Lösungsquote“ zeigt jede Karte den Grund statt Balken |

Payload: `createRenderer(host, data)` und `onUpdate` erhalten `{ metric, rows, absences, yDomain, averages, labelLines }` von der Überblick-View: `buildSummaryRows` (`slSchoolSummaryMetrics.js`) rechnet über `CompetenceShareQueries` (Anteile) und `SolutionRateQueries` (Lösungsquote; beide über den Port, den die View mit `slDataFromStore(dataStore)` selbst baut) aus `competence-levels` und `items`, die View ergänzt `labelLines`. Jeder Host wählt seine Zeile über die Optionen `subjectName` und `domainId`; der Renderer erhält `{ row, absence, yDomain, labelLines, metric }`, das ⌀-Menü `averages` und die Option `comparisonState`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `subjectName` | `string` | `''` | ja | Fach der Zeile dieses Hosts |
| `domainId` | `string\|null` | `null` | nein | Domäne der Zeile; `null` für Fächer ohne Domänen |
| `comparisonState` | `ComparisonState` | – | nein | Das ⌀-Dropdown liest und schreibt den Vergleichszustand; ohne ihn erscheint es nicht |
| `glossaryReplacements` | `{ Bereich }` | – | nein | Füllt den Glossartitel mit dem Zeilenlabel |
| `showModuleTitle`, `enableModuleExport` | `boolean` | `true` | nein | Descriptor-Defaults für den Host |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `update(data)` | Aufruf | Neuer Gesamt-Payload nach Kennzahl- oder ⌀-Wechsel, voller Rerender |
| ⌀-Dropdown | Callback (Vergleichszustand) | `comparisonState.setActive`, keine Callback-Option |
