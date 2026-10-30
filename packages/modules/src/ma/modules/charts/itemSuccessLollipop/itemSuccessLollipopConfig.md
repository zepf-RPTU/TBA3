# ChartHostModule + itemSuccessLollipopConfig

## Zweck
Das Lollipop-Diagramm „Mittlere Lösungsquoten aller Teilaufgaben“ (MA): je Aufgabe ein Stiel mit Kopf für den Anteil der Schüler:innen, die sie gelöst haben, nach Leitidee gruppiert und nach Aufgabenniveau eingefärbt. Darüber legen sich als Marker die Vergleichswerte (Schulschnitt, Landesschnitt, weitere Populationen), die das ⌀-Dropdown im Modulkopf ein- und ausblendet. Jede Aufgabe bekommt mindestens 20 px; passt das nicht in die Karte, scrollt das Diagramm waagerecht, die Legende bleibt außerhalb: neben dem Plot, solange der Plot daneben mindestens so breit wie hoch bleibt, sonst über ihm. Die Karte ist klappbar und startet ausgeklappt. Die Aufgabenniveau-Legende nennt jede Farbe der Aufgabenniveaus, ohne zu schalten; Niveaus, die eine Farbe teilen, stehen in einem Eintrag, jedes mit eigenem Glossarlink.

## Design/Idee

In der linksseitigen Ansicht, bei der ausschließlich die Tabelle auf ganzer Fensterbreite angezeigt wird, steht außerdem ein lollipop chart zur Verfügung, welcher die mittleren Lösungsquoten aller Aufgaben zeigt. Die Aufgaben sind dabei nach Leitidee gruppiert und farblich hinsichtlich ihrer Schwierigkeit codiert. Schul- und Landeswerte stehen als Vergleichsmetrik zur Verfügung. Ziel der Ansicht ist es, ggf. auf visuellem Weg auffällige Aufgaben zu identifizieren, also bspw. solche, die trotz geringer Schwierigkeit schlecht gelöst wurden oder in denen die Lerngruppe hinter den Landeswerten zurückbleibt. Die Graphik ist aus Sicht der Entwicklungsgruppe unausgereift und kann daher optional ein- und ausgeblendet werden.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `items` | – | `type`¹ (`group`), `items[].iqbId`, `items[].name`, `items[].exercise.name`, `items[].position`¹ (Reihenfolge der Teilaufgaben einer Aufgabe), `items[].descriptiveStatistics.mean`, `domain.name` (Gruppierung nach Leitidee), `items[].parameters.competenceLevel.nameShort`¹ |
| `items` | `comparison=school-average,state-average` | Vergleichszeilen: `id`¹, `type`¹, `name`, `items[].iqbId`, `items[].descriptiveStatistics.mean` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Das Dokument wird an `type` geteilt: jede Zeile ohne `type=group` gilt als Vergleichszeile, auch die Lerngruppe. Zeilen mit derselben `id` werden zu einem Vergleich zusammengelegt.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `items` (`comparison=…`) | Vergleichszeilen | Keine Vergleichsmarker, kein ⌀-Dropdown |
| `items` (`comparison=…`) | ein Item einer Vergleichszeile | An dieser Aufgabe fehlt der Marker des Vergleichs |

Dokumente: der Descriptor nennt in `documents` die Datasets `ma.itemRecords` und `ma.itemComparisonGroups` (`MA_DATASETS`). Die Stielhöhe ist `meanPercentage` (`descriptiveStatistics.mean` in Prozent, wie die Vergleichswerte — nicht der Zählanteil des Tabellenbalkens). `ma.itemComparisonGroups` sind die Vergleichszeilen von `items.json` mit mindestens einem Aufgabenmittelwert, in Payload-Reihenfolge; je Vergleich zeichnet der Renderer eine Markerserie, und die Legende führt unter dem Aufgabenniveau-Block je Vergleich einen Eintrag mit Form und Schattierung seines Markers. Die Aufgaben stehen in der Reihenfolge von `ma.itemRecords`: Leitideen wie im Payload, Aufgaben in Heftreihenfolge — wie in Aufgabentabelle und Ringraster.

Datentabelle: eine Zeile je gezeichneter Teilaufgabe, nach Leitideen wie im Diagramm, mit `Teilaufgabe`, `Aufgabe`, `Leitidee`, `Aufgabenniveau`, `Lösungsquote` (`meanPercentage`) und je eingeblendeter Vergleichsgruppe ihrem Mittel; ein fehlendes Mittel bleibt leer.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `collapsible` | `boolean` | `true` | nein | Karte klappbar |
| `showModuleTitle` | `boolean` | `true` | nein | Descriptor-Defaults für den Host |

## Methoden
Keine eigenen.
