# ChartHostModule + itemSuccessLollipopConfig

## Zweck
Das Lollipop-Diagramm „Mittlere Lösungsquoten aller Teilaufgaben“ der MA-Aufgaben-View: je Aufgabe ein Stiel mit Kopf für den Anteil der Schüler:innen, die sie gelöst haben, nach Leitidee gruppiert und nach Aufgabenniveau eingefärbt. Darüber legen sich als Marker die Vergleichswerte (Schulschnitt, Landesschnitt, weitere Populationen), die das ⌀-Dropdown im Modulkopf ein- und ausblendet. Die Karte startet eingeklappt und ist nur im Tabellen-Layout sichtbar.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../module-base/src/modules/contentModule.md)
    - [ChartHostModule](../../../../common/charts/host/chartHostModule.md)
      - **itemSuccessLollipopConfig** — Descriptor

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `items` | – | `type`¹ (`group`), `items[].iqbId`, `items[].name`, `items[].exercise.name`, `items[].descriptiveStatistics.mean` |
| `items` | `comparison=school-average,state-average` | Vergleichszeilen: `id`¹, `type`¹, `name`, `items[].iqbId`, `items[].descriptiveStatistics.mean` |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Das Dokument wird an `type` geteilt: jede Zeile ohne `type=group` gilt als Vergleichszeile, auch die Klasse. Eine Vergleichszeile ohne `id`, `type` oder `name` lässt `buildItemComparisonAverages` beim Start werfen, und das MA-Dashboard zeigt nur die Fehlermeldung; Zeilen mit derselben `id` werden zu einem Vergleich zusammengelegt.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `items` | `domain.name` | Keine Gruppierung nach Leitidee: keine Trennlinien, keine Leitideen-Beschriftung, die Tooltip-Zeile „Leitidee“ bleibt leer |
| `items` | `items[].parameters.competenceLevel.nameShort` | Lollipop in der Markenfarbe mit durchgezogenem Stiel; die Legende hat einen Eintrag „Aufgabenniveau“ ohne Stufe |
| `items` (`comparison=…`) | Vergleichszeilen | Keine Vergleichsmarker, kein ⌀-Dropdown |
| `items` (`comparison=…`) | ein Item einer Vergleichszeile | An dieser Aufgabe fehlt der Marker des Vergleichs; die Konsole warnt |

Payload: `createRenderer(host, data)` erhält `{ itemArray }`: die Datensätze aus `MA_DATA_KEYS.ITEM_RECORDS` (`buildItemArray`, `src/ma/utils/maItemDataAdapter.js`), gelesen werden `iqbId`, `name`, `exerciseName`, `domainLabel`, `competenceLevel`, `meanPercentage` (`descriptiveStatistics.mean` in Prozent, wie die Vergleichswerte — nicht der Zählanteil des Tabellenbalkens). Die Vergleiche kommen über die Option `averages`: der `MaAppModule` baut `schoolAverages`, `stateAverages` und `otherAverages` des App-Payloads (`buildItemComparisonAverages`), die Aufgaben-View macht daraus Optionseinträge, verwirft Vergleiche ohne Mittelwerte und übergibt ohne verbleibende Einträge `undefined`; jeder Eintrag trägt einen `generator`, der die `iqbId → Mittelwert`-Map des Vergleichs auf die gezeichneten Aufgaben abbildet.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `comparisonState` | `ComparisonState` | – | nein | Vergleichszustand für Dropdown und Sichtbarkeits-Prädikat |
| `averages` | `Array<{id, name, label, color, typeIndex, shape, generator}>` | `[]` | nein | Vergleichs-Overlays; ohne Einträge wird das ⌀-Dropdown entfernt |
| `collapsible`, `startCollapsed` | `boolean` | `true`, `true` | nein | Karte klappbar, startet eingeklappt |
| `showModuleTitle`, `enableModuleExport` | `boolean` | `true` | nein | Descriptor-Defaults für den Host |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setActiveModes(activeModes)` | Aufruf | Aktive Vergleichs-IDs übernehmen; zeichnet nur neu, wenn sich die Liste gegenüber der zuletzt gezeichneten geändert hat |

Das ⌀-Dropdown schreibt direkt in den AppState (`setComparisonMode`); es gibt keine Callback-Option.
