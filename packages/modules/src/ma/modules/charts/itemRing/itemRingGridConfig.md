# ChartHostModule + itemRingGridConfig

## Zweck
Das Raster der Aufgabenringe („Donuts“) im MA-Dashboard: „Gesamt“ plus ein Ring je Leitidee oder, nach Wahl im Gruppierungsmenü der Titelzeile, je Wert eines Kompetenztyps der Aufgaben (Allgemeine Kompetenz, Anforderungsbereich), optional mit innerem Ring für das Aufgabenniveau. Die Gruppierung kommt als Signal (`ringGrouping`); der Untertitel nennt sie („Gruppiert nach Leitidee“). Eine Aufgabe mit mehreren Werten eines Typs steht in jedem ihrer Ringe. Ohne Auswahl zeigt es die Lerngruppe, mit Auswahl (Option `student` oder `setCompetenceLevelFilter`) die Auswahl hervorgehoben. Ein Auswahlwechsel zeichnet die Ringe in die bestehenden hinein: nur geänderte Marken bewegen sich, der Personen-Strich dreht sich auf dem kürzeren Weg an seine neue Stelle. Eine Auswahl aller Schüler:innen gilt als keine Auswahl: Ring und Mitte zeigen dann die Lerngruppenwerte, ohne Personen-Strich. Der Umschalter des inneren Rings zeichnet die Ringe ohne Überblendung neu. Das Raster wählt Spalten, Zellen- und Textgröße für seine Box und verteilt die Ringe gleichmäßig auf die wenigsten Spalten (6 Ringe stehen 3 + 3, nicht 4 + 2); eine unvollständige letzte Zeile steht mittig. Ein Resize zeichnet die bestehenden Ringe ohne Animation in ihre neuen Zellen, ohne Neuaufbau; Auswahl und Innenring-Schalter bleiben. Die Titel stehen einzeilig, solange jeder passt, sonst zweizeilig. Unter jedem Titel steht die Zahl der Teilaufgaben des Rings; ein Ring ohne Aufgaben ist ein nicht wählbarer Platzhalter (Ring, „–“, „0 Teilaufgaben“).

Tastatur: das Raster ist ein einziger Tab-Stopp; ↓, → und Pos1 führen von dort in den ersten Ring, Ende in den letzten, ↑/↓ wechseln den Ring, ←/→ gehen durch die Markierungen eines Rings; auf auswählbaren Ring-Buttons wechseln auch ←/→ den Ring.

## Design/Idee

Neben der Abbildung der Kompetenzstufen wünschten die entwickelnden Lehrkräfte eine grobe fachlich-inhaltliche Differenzierung der Ergebnisse, um einen ersten Eindruck bezüglich inhaltlicher Stärken und Schwächen auf Lerngruppenebene zu erhalten. Die verwendeten donut charts visualisieren über die Lerngruppe gemittelt die Lösungshäufigkeit für jene Aufgaben, die jeweils einer gemeinsamen Leitidee zugeordnet werden können. Das Lerngruppenergebnis wird dabei direkt in Bezug zu einem Erwartungswert gesetzt, bspw. den gemittelten Pilotwerten aller verwendeten Aufgaben. Zusätzlich kann ein innerer Ring zugeschaltet werden, der die Ergebnisse nach Schwierigkeit bzw. Niveau der enthaltenen Aufgaben aufschlüsselt, was jedoch die Komplexität deutlich erhöht bzw. die intuitive Lesbarkeit der Graphik reduziert. Die Informationen haben in Abhängigkeit der Anzahl verwendeter Aufgaben nur bedingte diagnostische Aussagekraft; die Entwicklungsgruppe wünschte sich dennoch eine solche Gegenüberstellung, um zumindest einen initialen Anhaltspunkt für die weitere Exploration zu erhalten.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `items` | – | `type`¹ (`group`), `items[].iqbId`, `items[].name`, `items[].exercise.name` (Datentabelle), `items[].position`¹ (Reihenfolge der Teilaufgaben einer Aufgabe), `domain.id`¹ (ein Ring je Leitidee), `domain.name`, `items[].parameters.competenceLevel.nameShort`¹ |
| `competence-levels` | `type=students` | `id`¹ (Auswahl), `properties[firstName]`¹, `properties[lastName]`¹ (Tooltip des Personen-Strichs) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Eine `items`-Zeile ohne `type=group` gilt als Vergleichszeile.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `items` | `items[].descriptiveStatistics.frequency` (gelöst) und `.total` (Antworten der Lerngruppe) | Ohne `frequency` stehen äußerer Ring und Lerngruppenquoten des inneren Rings auf 0 %. Eine Aufgabe ohne `total` segmentiert den Ring, zählt aber nicht in die Lerngruppenquote; hat keine Aufgabe des Rings ein `total`, zeigt der äußere Ring keinen gelösten Anteil und die Mitte „–“ |
| `aggregations` (`type=students`) | `id`, `aggregations[type=result]` mit `value` ∈ `Richtig`, `Falsch`, `Unbearbeitet` und `includedIqbIds` (`Richtig` zählt als gelöst) | Nur mit Auswahl (Schüler:in, KS-Filter): innerer Ring und Personen-Strich zählen niemanden als gelöst. Eine Aufgabe, zu der niemand ein Ergebnis hat, zählt für die Auswahl nicht mit; zählt keine Aufgabe des Rings, fehlt der Personen-Strich und die Mitte zeigt „–“ |
| `competence-levels` (`type=students`) | `competenceLevels[0].nameShort` | `setCompetenceLevelFilter` wählt die Person nicht |
| `items` | `items[].parameters.competences[].type`, `.name`, `.id` (außer `type=style`) | Ohne Einträge gibt es nur die Gruppierung nach Leitidee und kein Gruppierungsmenü. Je `type` eine Gruppierung (in der Reihenfolge des ersten Auftretens, `type` ist ihr Name), je `name` ein Ring mit `name` als Titel, geordnet nach `id` (ohne `id` nach `name`); ein Eintrag ohne `type` oder `name` fällt weg |
| `items` | `items[].parameters.solutionFrequencyGymnasium`, `…NonGymnasium`, `…PrimarySchool` (der erste vorhandene zählt) | Eine Aufgabe ohne Wert zählt nicht in den Pilotierungswert; trägt keine Aufgabe des Rings einen Wert, fehlen Pilotierungs-Strich und Tooltip |

Dokumente: der Descriptor nennt in `documents` die Datasets `ma.itemRecords`, `ma.studentRecords` und `ma.itemRings` (`MA_DATASETS`). `ma.itemRings` sind „Gesamt“ (`total`, `id` `all`) und je Gruppierung ihre Ringe `{ id, title, iqbIds, isEmpty }`, je Leitidee bzw. je Wert des Kompetenztyps; ein Ring zeichnet die Aufgaben seiner `iqbIds`. Die Lerngruppenquoten kommen aus `items[].descriptiveStatistics`, nicht aus der Item-Aggregation. Ohne Aufgaben oder Ringe baut der Controller einen leeren Ring.

Was das Raster hervorhebt, ist sein Zustand `selectedStudents` (Schüler:innen-IDs; `null` zeichnet die Lerngruppenwerte), dem es die Option `student` folgen lässt; daneben schreibt ihn `setCompetenceLevelFilter`. Der gewählte Ring ist `selectedRing`: mit der Option `ringId` der Ring, den sie nennt, sonst der zuvor gewählte; beide fallen auf den ersten Ring mit Aufgaben zurück (`resolveShownRing`, außer „Gesamt“), auch für eine `id`, die die aktuelle Gruppierung nicht kennt.

Datentabelle: die Tabellen gelten dem ganzen Raster, nicht einem Ring. Zuerst die Summen je Ring, wie seine Mitte sie zeigt (mit Gesamt): Zahl der Teilaufgaben, Lösungsquote der Lerngruppe und, solange eine echte Teilmenge gewählt ist, die der Auswahl. Dann eine Zeile je Teilaufgabe, Ring für Ring in der Gruppierung, aus der das Raster gebaut ist (ohne Gesamt, in dem jede steht; ein leerer Ring hat keine Zeilen), mit `Teilaufgabe`, `Aufgabe`, dem Ring (Spaltenkopf: der Name der Gruppierung), `Aufgabenniveau`, der Lösungsquote der Lerngruppe aus ihren Antworten (`solvedCount`/`responseCount`, leer ohne Antworten), der Lösungsquote der Auswahl, solange eine echte Teilmenge gewählt ist, und dem Pilotwert, sofern das Heft welche hat. Die Tabelle folgt der Auswahl und der Gruppierung; der Umschalter für den inneren Ring ist inaktiv, solange sie steht.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `ringGrouping` | `Signal<string>` | – | ja | Die Gruppierung, der die Ringe folgen: `leitidee` oder das `competenceGroup<n>`-Feld eines Kompetenztyps; eine unbekannte zeigt die Leitideen. Ein Wechsel baut das Raster neu (`rebuildOn`) |
| `student` | `ReadonlySignal<string\|null>` | – | nein | Die eine Person, die die Ringe markieren; das Raster folgt ihr in `selectedStudents`. Ohne Option bleibt die Auswahl beim Raster (`setCompetenceLevelFilter`) |
| `ringId` | `ReadonlySignal<string\|null>` | – | nein | Der gewählte Ring, von außen gesetzt; das Raster wählt ihn, ohne ihn zu melden |
| `onRingSelected` | `(ringId: string) => void` | – | nein | Nur ein Ring-Klick; ein über `ringId` gewählter Ring wird hervorgehoben, aber nicht gemeldet. Ohne Handler sind die Ringe nicht wählbar |
| `defaultInnerRingVisible` | `boolean` | `true` | nein | Ob der innere Ring anfangs sichtbar ist |
| `showModuleTitle` | `boolean` | `true` | nein | Descriptor-Defaults für den Host |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setCompetenceLevelFilter(level)` | Aufruf | Schüler:innen einer Kompetenzstufe in allen Ringen hervorheben, `null` löscht; die Auswahl ist das Signal `host.state.selectedStudents`, das jeder Ring teilt, sodass auch ein vor dem ersten Aufbau gesetzter Filter gilt und ein Neuaufbau ihn behält. Hält die Auswahl schon genau diese Personen, bleibt sie stehen |
| `createController(host)` | Hook | Der `ItemRingGridController`: baut das Raster und lässt `selectedStudents` der Option `student` und `selectedRing` der Option `ringId` folgen |
| `headerActions(host)` | Hook | Das Gruppierungsmenü (ein Menü mit `menuitemradio`-Einträgen: Leitidee, dann je Kompetenztyp; nur mit mehr als einer Gruppierung) und der Innenring-Schalter (zeigt und schreibt `host.state.innerRingVisible`) der Titelzeile, beide nur solange ein Ringraster steht |
| `rebuildOn(host)` | Hook | Liest `ringGrouping`: eine andere Gruppierung hat andere Ringe, das Raster wird neu gebaut |
| `getExportIdentity(host)` | Override | Die eine gewählte Schüler:innen-ID, sonst `null` |
