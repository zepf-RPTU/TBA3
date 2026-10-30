# ChartHostModule + scatterplotConfig

## Zweck
Das Streudiagramm der Lerngruppe: ein Punkt je Schüler:in, x-Achse Lösungsquote der zweiten Domäne, y-Achse die der ersten, mit den GER-Stufengrenzen als gestrichelten Linien, dem Lerngruppenmarker und einem Marker je Vergleichsgruppe. Zwei Betriebsarten über eine Option (`enableSelection`): ohne sie meldet ein Punktklick die Person (`onStudentSelected`), mit ihr wählt man Punkte einzeln oder per Rahmen aus. Der Rahmen geht mit Maus und Finger und darf auf einem Punkt beginnen; eine Fingergeste scrollt die Seite, solange `touchSelectionArmed` nicht gesetzt ist. Zeiger und Klick treffen den nächstgelegenen Punkt; die Tastatur erreicht jeden Punkt.

## Design/Idee

Der mittige Scatterplot verortet die gesamte Lerngruppe im zweidimensionalen Raum; SuS sind mit jeweils einem eigenen Punkt repräsentiert. Verteilung und Heterogenität der Lerngruppe sollen auf einen Blick erkennbar sein, insbesondere für Lehrkräfte mit zunehmendem Erfahrungsschatz. Einzelne SuS mit auffälligen Ergebnissen können visuell identifiziert werden. Schul- und Landesschnitt sind (innerhalb der Entwicklungsgruppe umstrittene) Vergleichswerte, welche an dieser Stelle ein- oder ausgeblendet werden können. Die beiden Achsen zeigen die Lösungshäufigkeit im Hör- und im Leseverstehen, gestrichelte Linien markieren die Grenzen der GER-Stufen; denkbar wäre hier ebenso eine Abbildung der BiSta-Metrik.

In der Lerngruppenansicht kann die Darstellung über die Tabellenleiste erneut aufgerufen werden, um ergänzend zur klassischen Filterung und Sortierung SuS anhand ihrer Verortung im Leistungsraum zu selektieren.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `aggregations` | `type=students` | `id`¹ (Punktschlüssel, Auswahl, Navigation), `domain.id`¹, `domain.name`, `aggregations[type=result]` mit `value` = `Richtig` und dessen `descriptiveStatistics.mean` (die Position auf der Achse dieser Domäne), `properties[firstName]`¹, `properties[lastName]`¹ |
| `aggregations` | `comparison=school-average,state-average` | `name`, `aggregations[]`; Vergleichszeilen zusätzlich `id`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Zu `domain.id` siehe die Zwei-Domänen-Regel in [datenvertrag.md](../../../../../docs/datenvertrag.md#anfragen-je-dashboard). Eine Person ohne `Richtig`-Aggregation in einer Domäne zeichnet das Diagramm nicht.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`type=students`) | `id`, `domain.id`, `competenceLevels[0].nameShort` je Domäne | Beide GER-Zeilen im Tooltip zeigen „–“ |
| `aggregations` (`comparison=…`) | `domain.id` und `Richtig`-Aggregation der Lerngruppenzeile | Kein Lerngruppenmarker |
| `aggregations` (`comparison=…`) | Vergleichszeilen | Keine Vergleichsmarker, kein ⌀-Menü |
| `competence-levels` (`comparison=…`) | `properties[equivalenceTable:<booklet>]` der Lerngruppenzeile, genau eine Tabelle mit `maxScore` und `itemCount` | Keine Stufengrenzen und keine Bandbeschriftungen; der Zoom-Knopf erscheint immer |

Dokumente: Der Descriptor nennt in `documents` die Datasets `en.studentRecords` (`EN_DATASETS.STUDENT_RECORDS`), `en.styleAverages` (`EN_DATASETS.STYLE_AVERAGES`) und `en.config` (`EN_DATASETS.CONFIG`). Aus `en.config` kommen die Stufengrenzen (`getEnGerThresholds`) und die Achsentitel (`domainLabels` zu `domainIds`, jeder verlinkt mit dem Glossareintrag seiner Domänen-Id), aus `en.styleAverages` Lerngruppen- und Vergleichsmarker; die Sichtbarkeit der Vergleichsgruppen kommt aus der Option `comparisonState`.

Datentabelle: zwei Tabellen aus der `dataTable()` des `Scatterplot`, in der Reihenfolge der Tooltips (y-Achse zuerst): `Schüler:innen`, eine Zeile je Punkt mit beiden Ergebnissen und GER-Stufen, und `Durchschnitte`, eine Zeile je gezeichnetem Marker (die Lerngruppe, dann die eingeblendeten Vergleichsgruppen), nur solange einer gezeichnet ist. Der Zoom rahmt nur das Diagramm: Sein Kopf-Button ist inaktiv, solange die Tabelle steht.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `enableSelection` | `boolean` | `false` | nein | Auswahlmodus (Klick und Rahmen) statt Navigation |
| `selectedIds` | `Signal<ReadonlySet<string>>` | – | nein | Die Auswahl im Auswahlmodus, geteilt: der Host macht das Signal zu seinem Zustand `selectedIds`, Klick, Rahmen und `selectAll` schreiben es, der Besitzer liest und leert es. Ohne die Option eine eigene, leere Auswahl |
| `touchSelectionArmed` | `Signal<boolean>` | – | nein | Ob ein Fingerziehen einen Rahmen zieht, geteilt wie `selectedIds`; Mausziehen bleibt davon unberührt. Ohne die Option aus |
| `onStudentSelected` | `(studentId: string) => void` | – | nein | Navigationsmodus: Punktklick |
| `showModuleTitle` | `boolean` | `true` | nein | Descriptor-Defaults |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `initialState` | Lifecycle-Hook | `{ isZoomed: true, selectedIds, touchSelectionArmed }`: das Diagramm öffnet auf die Daten gezoomt (decken sie schon jede Stufe ab, auf den vollen Bereich 0–100, ohne Zoom-Knopf), Auswahl und Rahmen-Schalter sind die Signale der Optionen |
| `headerActions` | Kopf-Hook | Der Zoom-Knopf der Titelzeile, sofern die Daten nicht ohnehin alle Stufen abdecken; er schaltet den Host-Zustand `isZoomed`, dessen Signal der Renderer teilt und dem er neu zeichnend folgt |
| `selectAll()` | Aufruf | Jede Person wählen, die als Punkt erscheint; wer in einer Domäne keinen `Richtig`-Anteil hat und darum nicht gezeichnet wird, wird nicht mitgewählt |
