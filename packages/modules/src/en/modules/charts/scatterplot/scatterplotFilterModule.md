# ScatterplotFilterModule

## Zweck
Der Suchdialog der Klassen-View: ein modales Overlay mit dem Streudiagramm im Auswahlmodus, einem Zähler „n ausgewählt“ im Untertitel und fünf Schaltflächen: „Alle auswählen“, „Auswahl aufheben“, „Auswahlmodus“, „Auswahl bestätigen“, „Abbrechen“. Alle fünf Beschriftungen kommen aus dem `interface`-Block des Glossareintrags, keine steht im Code. Die bestätigte Auswahl wird zum Filter der Klassentabelle. Das Diagramm zeigt immer beide Domänen, unabhängig vom Domänen-Schalter der App.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../module-base/src/modules/contentModule.md)
    - **ScatterplotFilterModule**

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=students` | `id`¹ (verbindet eine Person über beide Schüler:innen-Dokumente; Schlüssel für Auswahl, „Alle auswählen“ und den bestätigten Filter) |
| `aggregations` | `type=students` | `id`¹, `domain.id`¹, `aggregations[type=Ergebnis]` mit `value` `Richtig`: `descriptiveStatistics.mean` (die Position auf der Achse der Domäne) |
| `aggregations` | `comparison=school-average,state-average` | `name`; Vergleichszeilen zusätzlich `id`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne Schüler:innen-`id` fallen alle Personen auf einen Punkt; ohne `domain.id` gibt es keine Domänen, und das Öffnen wirft (`enConfig.domainIds`); eine Person ohne `Richtig`-Aggregation in einer Domäne erscheint nicht als Punkt. Eine Vergleichszeile ohne `id` lässt `parseStyleAggregation` werfen und bricht damit alle EN-Datensätze.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`type=students`) | `properties[firstName]`, `properties[lastName]` | Der Punkt-Tooltip hat keinen Titel |
| `competence-levels` (`type=students`) | `domain.id` | Beide GER-Zeilen im Tooltip zeigen „N/A“ |
| `competence-levels`, `aggregations` (`type=students`) | `domain.name` | Achsentitel und Tooltip zeigen die Domänen-id |
| `aggregations` (`comparison=…`) | `domain.id` und `aggregations[type=Ergebnis]` mit `value` `Richtig` der Klassenzeile | Kein Klassenmarker |
| `aggregations` (`comparison=…`) | Vergleichszeilen | Keine Vergleichsmarker; ein ⌀-Menü hat der Dialog ohnehin nicht |
| `aggregations` (`comparison=…`) | `type=state` einer Vergleichszeile | Die Gruppe zählt nicht für den Zoom-Ausschnitt |
| `competence-levels` (`comparison=…`) | `properties[equivalenceTable:<booklet>]` der Klassenzeile, genau eine Tabelle | Keine Stufengrenzen und keine Bandbeschriftungen; der Zoom-Knopf erscheint immer |

Payload: `_doRenderContent()` baut nur das Gerüst und braucht keinen Payload. Beim `show()` erzeugt das Modul einen frischen `ChartHostModule` mit `scatterplotConfig` und initialisiert ihn mit `{ studentArray, styleAverages }`, beide aus den Optionen: `studentArray` sind die Datensätze aus `EN_DATA_KEYS.STUDENT_RECORDS` (`buildClassStudentRecords`, `src/en/utils/enStudentDataAdapter.js`), `styleAverages` das Ergebnis von `parseStyleAggregation` (`enStyleAggregationAdapter.js`). Aus der Option `enConfig` liest das Modul `domainIds` und `domainLabels` für `domainTitles`; `comparisonState` geht nur lesend (`getActiveModes`, `isActive`) an den Host. `update({ studentArray, selectedStudentIds })` ersetzt beides für das nächste Öffnen.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `studentArray` | `Array<object>` | `[]` | ja | Schüler:innen, die das Diagramm zeigt |
| `selectedStudentIds` | `Iterable<string>` | leeres Set | nein | Anfangsauswahl beim Öffnen |
| `onConfirm` | `(ids: Set<string>) => void` | – | nein | Bestätigte Auswahl |
| `comparisonState` | `ComparisonState` | – | nein | Wird als schreibgeschützte Sicht durchgereicht (`getActiveModes`, `isActive`), damit der Dialog dieselben Mittelwerte zeigt, aber kein eigenes ⌀-Menü bekommt |
| `enConfig` | `EnConfig` | – | ja | `domainIds` und `domainLabels` für `domainTitles`; `fieldName` für die Punkte, die „Alle auswählen“ wählt |
| `styleAverages` | `ParsedStyleAggregation` | – | ja | Klassen- und Vergleichsmarker des Diagramms (`parseStyleAggregation`) |
| `glossaryKey` | `string` | `en.class.scatterplot` | nein | Titel, Anleitung, Tutorial |
| `showModuleTitle`, `showSubtitle` | `boolean` | `true` | nein | Kopf mit Titel und Anleitung |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `show()` | Aufruf | Overlay einblenden, Diagramm erzeugen; ein Aufruf bei offenem Dialog aktualisiert nur den Zähler |
| `hide()` | Aufruf | Overlay ausblenden, Diagramm zerstören |
| `update({ studentArray?, selectedStudentIds? })` | Aufruf | Daten für das nächste Öffnen ersetzen |
| „Alle auswählen“ | intern | Wählt jede Person, die als Punkt erscheint (`toScatterPoints`); wer in einer Domäne keinen `Richtig`-Anteil hat und darum nicht gezeichnet wird, wird nicht mitgewählt |
| „Auswahlmodus“ | intern | Schaltet die Rahmenauswahl per Finger scharf (`aria-pressed`, `.is-active`) und reicht den Zustand an `setTouchSelectionArmed` weiter; nur sichtbar, wenn das Gerät überhaupt einen groben Zeiger hat (`any-pointer: coarse`), und beim Öffnen erneut an den frisch erzeugten Chart-Host übergeben |
| `destroy()` | Override | `hide()`, Overlay aus dem DOM nehmen |
| `onConfirm(selectedIds)` | Callback | siehe Optionen |
