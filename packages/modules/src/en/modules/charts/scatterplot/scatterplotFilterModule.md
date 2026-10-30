# ScatterplotFilterModule

## Zweck
Der Streudiagramm-Suchdialog: ein modaler `<dialog>` (`ModalDialog`) mit dem Streudiagramm im Auswahlmodus und einer Seitenleiste in zwei Gruppen: „Alle auswählen“, „Auswahl aufheben“ und (nur mit grobem Zeiger, `any-pointer: coarse`) „Auswahlmodus“; darunter der Zähler „n ausgewählt“ (`role="status"`) über „Auswahl bestätigen“ und „Abbrechen“. Beschriftungen und Zählertext kommen aus dem `interface`-Block des Glossareintrags, keine steht im Code; einen Tooltip trägt nur „Auswahlmodus“, dessen Wirkung die Beschriftung nicht sagt. Die bestätigte Auswahl geht als ID-Menge an `onConfirm`. Das Diagramm zeigt immer beide Domänen, unabhängig vom Domänen-Schalter der App.

## Design/Idee

Ergänzend zu den klassischen Sortier- und Filterfunktionen lässt sich der Scatterplot der Übersichtsansicht über die Tabellenleiste der Lerngruppenansicht öffnen, um einen Tabellenausschnitt anhand der visuellen Suche im zweidimensionalen Ergebnisraum auszuwählen. Ausreißer und/oder Cluster von SuS können intuitiv markiert und ausgewählt werden. Die Entwicklungsgruppe möchte verschiedene Wege bieten, die Lerngruppenergebnisse zu explorieren, ohne die eine Methode explizit über die andere zu stellen.

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels`, `aggregations` | `type=students` (dazu `competence-levels` `comparison=…`) | `domain.id`¹, `domain.name` (die Domänen von `en.config`, Titel-Token `{{Domänen}}`) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Die Felder des Diagramms nennt [scatterplotConfig](scatterplotConfig.md).

**Optional genutzt**
Keine optionalen Felder.

Dokumente: Das Modul selbst nennt in `documents` nur `en.config` (`EN_DATASETS.CONFIG`): dessen `domainIds` und `domainLabels` gibt es dem Diagramm als Titel-Token `{{Domänen}}` (`enDomainListRuns`, jeder Name verlinkt mit dem Eintrag seiner Domänen-Id). `_renderBody()` baut nur das Gerüst und braucht keinen Payload. Beim `open()` erzeugt das Modul einen frischen `ChartHostModule` (`createChart`) mit `scatterplotConfig`, setzt ihn in den Diagrammbereich und reicht ihm über `_childOptions()` denselben Speicher weiter; der Host lädt seine eigenen `documents` (dazu `en.styleAverages`) selbst und liest daraus Punkte, Achsentitel und Marker. Das Modul hält Auswahl und Rahmen-Schalter als Signale und gibt sie dem Host als Optionen `selectedIds` und `touchSelectionArmed`: Chart, Zähler und Seitenleiste teilen eine Kopie.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `onConfirm` | `(ids: Set<string>) => void` | – | nein | Bestätigte Auswahl |
| `comparisonState` | `ComparisonState` | – | nein | Wird als schreibgeschützte Sicht durchgereicht (`activeModes`, `isActive`), damit der Dialog dieselben Mittelwerte zeigt, aber kein eigenes ⌀-Menü bekommt |
| `glossaryKey` | `string` | `en.group.scatterplot` | nein | Titel, Anleitung, Tutorial |
| `showModuleTitle`, `showSubtitle` | `boolean` | `true` | nein | Kopf mit Titel und Anleitung |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `open(selectedStudentIds?)` | Aufruf | Dialog öffnen (`showModal()`; das erste Öffnen hängt das Modul als Panel in den `<dialog>` und verbindet es) und das Diagramm mit dieser Anfangsauswahl erzeugen; ein Aufruf bei offenem Dialog behält die Auswahl, die er hält |
| `_headerActions()` | Override | Der ✕ des Dialogs in der Titelzeile |
| `_teardown()` | Override | Dialog schließen und aus dem DOM nehmen, dann Basis; der Besitzer baut das Modul ab, indem er es entfernt |
