# ChartHostModule + maCompetenceLevelDistributionConfig

## Zweck
Die MA-Kompetenzstufenverteilung: ein gestapeltes Balkendiagramm der Lerngruppe mit den Vergleichsgruppen (Schule, Land, weitere) aus demselben Dokument, umschaltbar zwischen vertikal und horizontal. Ein Segment-Klick hebt die Stufe hervor und meldet sie (`onLevelSelected`); das ⌀-Dropdown im Modulkopf schaltet Vergleichsgruppen ein und aus.

## Design/Idee

Die klassische Darstellung der Kompetenzstufenverteilung als stacked bar chart („Kompetenzbänder“) war eine der initialen Darstellungsformen der entwickelnden Lehrkräfte; sie hat sich aus Sicht der Lehrkräfte bewährt. Die Darstellung der Verteilungen von Schule und Land waren innerhalb der Entwicklungsgruppe umstritten und können daher optional ein- oder ausgeblendet werden. Außerdem kann zwischen einer vertikalen und horizontalen Ausrichtung der Balken gewechselt werden.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `comparison=school-average,state-average` | `type`¹ (`group` ist die Lerngruppe, jede andere Zeile eine Vergleichsgruppe), `id`¹ (Schlüssel jedes Balkens, bei Vergleichszeilen auch des ⌀-Schalters), `name` (Achsenbeschriftung, je Zeile eindeutig), `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.mean` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Die Lerngruppe ist die Zeile mit `type=group`, gleich wo sie im Dokument steht; ohne sie gibt es keinen Primärbalken. Ihre Achsenbeschriftung trägt den Glossarbegriff „Lerngruppenschnitt“, eine Vergleichszeile den Begriff ihres `type` (`school` „Schulschnitt“, `state` „Landesschnitt“), jeder andere Typ keinen. Mit `total` sind Anteile `frequency / total`, nicht `mean`, das der Server auf vier Stellen rundet; eine Zeile mit `total` 0 steht in jeder Stufe auf 0 %. Der Tooltip zeigt je Segment die `frequency` der eigenen Zeile, auch bei Vergleichszeilen. Zwei Zeilen mit gleichem `name` brechen das Zeichnen ab (die Balken sind nach Namen angeordnet).

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`comparison=…`) | Vergleichszeilen | Nur der Lerngruppenbalken, kein ⌀-Dropdown |
| `competence-levels` | `competenceLevels[].descriptiveStatistics.total`, `.frequency` | Anteil aus `mean`; Tooltip und Datentabelle ohne Anzahl |

Dokumente: der Descriptor nennt in `documents` `competence-levels.json`; `createRenderer` reicht es an den Renderer. Der parst es mit `parseCompetenceLevels` (`competenceLevelAdapter.js`): die Stufenfolge kommt aus der Zeile mit den meisten Stufen, der Primärbalken ist die Zeile mit `type=group`, die Vergleichsgruppen im ⌀-Dropdown sind alle anderen Zeilen. Ohne Stufen in irgendeiner Zeile bleibt die Karte leer.

Datentabelle: die Tabelle ist die `dataTable()` des `CompetenceLevelDistributionChart`: eine Zeile je gezeichnetem Balken, also nur die eingeblendeten Vergleichsgruppen, mit `Gruppe`, `Anzahl Schüler:innen` (`total`) und je Stufe Anteil und Anzahl (`15,4 % (4)`; im Export zwei Felder `<Stufe> Anteil (%)` und `<Stufe> Anzahl Schüler:innen`). Eine Zeile ohne `total` (ein Landesschnitt nur mit Anteilen) zeigt und exportiert nur die Anteile.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `onLevelSelected` | `(level: string\|null) => void` | – | nein | Segment-Klick mit der gewählten Stufe, `null` bei einem Klick auf die schon gewählte; die Auswahl ist immer eine Stufe. Der Klick schreibt zugleich `host.state.highlightedLevels` |
| `showModuleTitle` | `boolean` | `true` | nein | Descriptor-Defaults |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `initialState(host)` | Descriptor-Hook | `isHorizontal` und `highlightedLevels`, beide mit dem Renderer geteilt; ein Neuaufbau behält sie. Solange `isHorizontal` `null` ist, wählt der Renderer die Ausrichtung, in der die Gruppennamen lesbar stehen, und eine Größenänderung kann sie kippen |
| `headerActions(host)` | Descriptor-Hook | Der Ausrichtungs-Button: schreibt die andere Ausrichtung in `host.state.isHorizontal`; inaktiv, solange die Tabelle steht |
