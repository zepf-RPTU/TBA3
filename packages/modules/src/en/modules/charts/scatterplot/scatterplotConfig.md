# ChartHostModule + scatterplotConfig

## Zweck
Das Streudiagramm der Klasse: ein Punkt je Schüler:in, x-Achse Lösungsquote der ersten Domäne (Hören), y-Achse die der zweiten (Lesen), mit den GER-Stufengrenzen als gestrichelten Linien, dem Klassenmarker und einem Marker je Vergleichsgruppe. Zwei Betriebsarten über eine Option: in der Übersicht öffnet ein Punktklick die Schüler:innen-View, im Suchdialog der Klassen-View wählt man Punkte einzeln oder per Rahmen aus. Der Rahmen läuft über Pointer-Events mit `setPointerCapture`, gilt also für Maus und Finger — mit dem Unterschied, dass eine Fingergeste standardmäßig die Seite scrollt und erst nach `setTouchSelectionArmed(true)` einen Rahmen zieht.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../module-base/src/modules/contentModule.md)
    - [ChartHostModule](../../../../common/charts/host/chartHostModule.md)
      - **scatterplotConfig** — Descriptor

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=students` | `id`¹ (verbindet eine Person über beide Schüler:innen-Dokumente; Schlüssel für Auswahl und Navigation) |
| `aggregations` | `type=students` | `id`¹, `domain.id`¹, `aggregations[type=Ergebnis]` mit `value` = `Richtig` und dessen `descriptiveStatistics.mean` (die Position auf der Achse dieser Domäne) |
| `aggregations` | `comparison=school-average,state-average` | `name`, `aggregations[]`; Vergleichszeilen zusätzlich `id`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne Schüler:innen-`id` fallen alle Personen auf einen Punkt; ohne `domain.id` oder mit weniger als zwei Domänen wirft das Diagramm; eine Vergleichszeile ohne `id` lässt `parseStyleAggregation` werfen und bricht damit alle EN-Datensätze. Eine Person ohne `Richtig`-Aggregation in einer Domäne zeichnet das Diagramm nicht.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`type=students`) | `properties[firstName]`, `properties[lastName]` | Der Tooltip hat keinen Titel |
| `competence-levels` (`type=students`) | `domain.id` | Beide GER-Zeilen im Tooltip zeigen „N/A“ |
| `competence-levels`, `aggregations` (`type=students`) | `domain.name` | Achsentitel und Tooltip zeigen die Domänen-id |
| `aggregations` (`comparison=…`) | `domain.id` und `Richtig`-Aggregation der Klassenzeile | Kein Klassenmarker |
| `aggregations` (`comparison=…`) | Vergleichszeilen | Keine Vergleichsmarker, kein ⌀-Menü |
| `aggregations` (`comparison=…`) | `type=state` einer Vergleichszeile | Die Gruppe zählt nicht für den Zoom-Ausschnitt |
| `competence-levels` (`comparison=…`) | `properties[equivalenceTable:<booklet>]` der Klassenzeile, genau eine Tabelle | Keine Stufengrenzen und keine Bandbeschriftungen; der Zoom-Knopf erscheint immer |

Payload: `createRenderer(host, data)` erhält `{ studentArray, styleAverages }`, gebaut von `buildClassStudentRecords` (`src/en/utils/enStudentDataAdapter.js`) und `parseStyleAggregation` (`enStyleAggregationAdapter.js`); die Stufengrenzen kommen aus der Option `enConfig` (`buildEnConfig`, `getEnGerThresholds`), die Sichtbarkeit der Vergleichsgruppen aus der Option `comparisonState`.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `enConfig` | `EnConfig` | – | ja | Domänen-IDs, Feldnamen, Äquivalenztabellen, Vergleichsgruppen |
| `domainTitles` | `{[domainId]: string}` | `null` | nein | Achsenbeschriftungen; beide Views übergeben die Domänen-Labels |
| `enableSelection` | `boolean` | `false` | nein | Auswahlmodus (Klick und Rahmen) statt Navigation; schaltet im Renderer das automatische Neuzeichnen bei Größenänderung ab, damit die Handler erhalten bleiben |
| `selectedStudentIds` | `Set<string>` | `null` | nein | Anfangsauswahl im Auswahlmodus |
| `onSelectionChanged` | `(ids: Set<string>) => void` | `null` | nein | Auswahlmodus: jede Änderung der Auswahl |
| `onStudentSelected` | `(studentId: string) => void` | – | nein | Navigationsmodus: Punktklick |
| `startZoomed` | `boolean` | `false` | nein | Zu Beginn auf den belegten Bereich zoomen; beide Views setzen `true` |
| `showModuleTitle`, `enableModuleExport` | `boolean` | `true` | nein | Descriptor-Defaults |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setActiveModes(activeModes)` | Aufruf | Marker der Vergleichsgruppen ein- oder ausblenden |
| `getSelectedIds()` | Aufruf | Aktuelle Auswahl, leeres Set ohne Renderer |
| `setSelectedIds(ids)` | Aufruf | Auswahl setzen |
| `clearSelection()` | Aufruf | Auswahl leeren |
| `setTouchSelectionArmed(armed)` | Aufruf | Rahmenauswahl per Finger scharfschalten; Mausziehen bleibt davon unberührt |
| `onSelectionChanged(ids)` | Callback | siehe Optionen |
| `onStudentSelected(studentId)` | Callback | siehe Optionen |
