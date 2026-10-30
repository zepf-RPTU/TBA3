# ChartHostModule + itemRingFocusConfig

## Zweck
Der Fokus-Ring: ein einzelner Aufgabenring zum gewählten Ring (Option `ringId`; eine Leitidee oder, in einer anderen Gruppierung, ein Wert eines Kompetenztyps), darunter „Leistung“ (über alle Aufgaben des Rings gepoolt: Lösungsquote der Lerngruppe wie im äußeren Ring, bei einer Auswahl daneben deren Quote wie in der Mitte, Richtig, Falsch, Unbearbeitet, Gesamt Antworten, Pilotierung als Mittel der pilotierten Aufgaben mit Differenz), „Auffällige Teilaufgaben“ (höchstens fünf Aufgaben mehr als 20 Prozentpunkte unter der Lösungsquote der Lerngruppe, die der Ring zeigt, die schwächste zuerst) und die Tabelle „Teilaufgaben nach Aufgabenniveau“, das Gegenstück zum inneren Ring: je Niveau die Zahl der Aufgaben und die Lösungsquote der Lerngruppe, bei einer Auswahl daneben die der Auswahl. Zuletzt die Schüler:innen unter bzw. auf oder über der Lösungsquote der Lerngruppe, je mit ihrer eigenen Quote über die Aufgaben des Rings (je Gruppe nach Quote aufsteigend; umschaltbar, Standard ist die kleinere Gruppe). Ein Host bedient nacheinander jeden Ring; ein neuer `ringId` tauscht den Inhalt in place, der Kartentitel folgt dem Ringtitel, der Untertitel nennt wie unter jedem Ringtitel im Raster die Zahl ihrer Teilaufgaben („12 Teilaufgaben“). Die Mitte des Rings zeigt nur die Lösungsquote. Der Ring nimmt ein Drittel der Kartenhöhe ein, mindestens so viel, dass die Niveau-Beschriftungen in den inneren Ring passen (dieselbe Untergrenze wie im Raster), höchstens die Kartenbreite; darunter scrollen die Textblöcke.

## Design/Idee

In der einseitigen Ansicht, bei der ausschließlich die donut charts dargestellt werden, können zusätzlich einzelne Ringe ausgewählt werden. Der ausgewählte Ring wird nebenliegend in einem Info-Kasten vergrößert und mit detaillierten Informationen angereichert: die Leistung der Lerngruppe samt Pilotierungswert, auffällige Teilaufgaben, in denen die Lerngruppe deutlich hinter ihrem eigenen Mittel zurückbleibt, eine Aufschlüsselung nach Aufgabenniveau sowie die SuS unter bzw. ab dem Lerngruppenwert. Denkbar wäre aus Sicht der Entwicklungsgruppe außerdem die Benennung von Aufgaben, die von keinem oder allen SuS gelöst wurden.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `items` | – | `type`¹ (`group`), `items[].iqbId`, `items[].name`, `items[].exercise.name`, `items[].position`¹ (Reihenfolge der Teilaufgaben einer Aufgabe), `domain.id`¹, `domain.name`, `items[].parameters.competenceLevel.nameShort`¹ (die Niveaus in der Reihenfolge der registrierten Aufgabenniveau-Skala) |
| `competence-levels` | `type=students` | `id`¹ (Auswahl, Abgleich mit der `id` der Aggregationszeilen), `properties[firstName]`¹, `properties[lastName]`¹ (Namensliste, Zeile „Lösungsquote `<Name>`“, Tooltip des Personen-Strichs) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Eine `items`-Zeile ohne `type=group` gilt als Vergleichszeile.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `items` | `items[].descriptiveStatistics.frequency` (gelöst) und `.total` (Antworten der Lerngruppe) | Ohne `frequency` stehen äußerer Ring und Lerngruppenquoten des inneren Rings auf 0 %, „Auffällige Teilaufgaben“ bleibt leer. Eine Aufgabe ohne `total` segmentiert den Ring, zählt aber nicht in die Lerngruppenquote und erscheint nie unter „Auffällige Teilaufgaben“; hat keine Aufgabe des Rings ein `total`, zeigt der äußere Ring keinen gelösten Anteil und die Mitte „–“ |
| `competence-levels` (`type=students`) | jede Zeile | Nur mit Auswahl: ohne Zeilen bleibt die Karte leer. Ohne Auswahl (keine Option `student`) lesen nur die Namensliste und ihre Quoten die Schüler:innen |
| `aggregations` (`type=students`) | `id`, `aggregations[type=result]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `includedIqbIds` (`Richtig` zählt als gelöst) | Kein Personen-Strich (die Mitte zeigt „–“), die Namensliste sagt in beiden Gruppen, dass keine Ergebnisse vorliegen (`messages.no-student-results`). Eine Aufgabe, zu der niemand ein Ergebnis hat, zählt für die Auswahl und die Quoten der Namensliste nicht mit |
| `aggregations` (`type=items`, `aggregation=result`) | `id` (die `iqbId` des Items), `aggregations[type=result]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `descriptiveStatistics.frequency`, `.total` | „Richtig“, „Falsch“, „Unbearbeitet“ und „Gesamt Antworten“ stehen auf 0 |
| `items` | `items[].parameters.competences[].type`, `.name`, `.id` (außer `type=style`) | Nur in einer Gruppierung nach Kompetenztyp (siehe `itemRingGridConfig`): ohne Einträge gibt es sie nicht, die Karte zeigt Leitideen |
| `items` | `items[].parameters.solutionFrequencyGymnasium`, `…NonGymnasium`, `…PrimarySchool` (der erste vorhandene zählt) | Eine Aufgabe ohne Wert zählt nicht in den Pilotierungswert; trägt keine Aufgabe des Rings einen Wert, fehlen Pilotierungs-Strich und Tooltip |

Dokumente: der Descriptor nennt in `documents` die Datasets `ma.itemRings`, `ma.itemRecords` und `ma.studentRecords` (`MA_DATASETS`). `ma.itemRings` sind „Gesamt“ (`total`) und die Gruppierungen mit ihren Ringen, je Ring `{ id, title, iqbIds, isEmpty }`. Ring und „Auffällige Teilaufgaben“ zählen aus `items[].descriptiveStatistics`, die Zeilen von „Leistung“ aus `items-aggregations.json`. Der Descriptor schneidet die Aufgaben des gezeigten Rings heraus, einmal je Ring, und legt sie in den Host-Zustand `items`; Renderer und Untertitel lesen beide diese Liste.

Die Karte folgt drei Signal-Optionen: `ringGrouping`, `ringId` (eine `id` eines Rings der Gruppierung, nie „Gesamt“) und `student` (ohne die Option: die Lerngruppe). Ein unbekannter, leerer oder fehlender Ring zeigt wie das Raster den ersten Ring mit Aufgaben (`resolveShownRing`). Hat die Gruppierung keinen Ring, zeigt die Karte statt des Rings `ma.item.item-ring-focus.messages.no-rings` („Keine Aufgabenringe verfügbar“).

Keine Datentabelle (die eine Ausnahme der Regel, dass jedes Chart seine Daten als Tabelle anbietet, `docs/standards-reference.md` unter „Chart Layout, Axes, Marks, And Interaction“): Die Karte führt ihre Zahlen schon als HTML — die Leistung, die Tabelle der Aufgabenniveaus des inneren Rings und die Schülerlisten —, ein Umschalter hätte nichts zu zeigen, was nicht schon dasteht.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `showModuleTitle` | `boolean` | `true` | nein | Descriptor-Defaults für den Host; Titel und Untertitel setzt der Descriptor zur Laufzeit (Ringtitel, Zahl seiner Items) |
| `ringGrouping` | `ReadonlySignal<string>` | – | ja | Die Gruppierung der Ringe; eine unbekannte zeigt die Leitideen |
| `ringId` | `ReadonlySignal<string\|null>` | – | nein | Der gezeigte Ring; ohne der erste Ring mit Aufgaben |
| `student` | `ReadonlySignal<string\|null>` | – | nein | Die Person, die der Ring markiert; ohne die Lerngruppe |
| `onStudentSelected` | `(studentId: string) => void` | – | nein | Klick auf einen Namen der Namensliste; ohne die Option tut der Klick nichts |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `createController(host)` | Hook | Folgt `ringGrouping`, `ringId` und `student`, sobald die Karte gezeichnet hat, und zeigt einen anderen Ring oder eine andere Auswahl in place (Host-Zustand `ring`/`items`/`selectedStudents`); der Ring bewegt nur, was sich ändert, ein anderer Ring setzt die gewählte Gruppe der Namensliste zurück. Den ersten Stand liest `createRenderer` |
| `getExportIdentity(host)` | Override | `[Ring-id, Einzelperson]`, beides `null`-fähig; unterscheidet die Exporte eines Hosts |
