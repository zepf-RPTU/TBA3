# ChartHostModule + enKsDistributionConfig

## Zweck
Die Verteilung der GER-Stufen einer Domäne als gestapelte Balken: eine Säule für die Klasse, daneben je eine für jede gelieferte Vergleichsgruppe (Schule, Land, …), sichtbar nach den ⌀-Schaltern. Die EN-Übersicht stellt zwei Instanzen auf, links Hören, rechts Lesen, mit der Achse jeweils außen.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../module-base/src/modules/contentModule.md)
    - [ChartHostModule](../../../../common/charts/host/chartHostModule.md)
      - **enKsDistributionConfig** — Descriptor

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `comparison=school-average,state-average` | `type`¹ (`group` ist die Klasse, jede andere Zeile eine Vergleichsgruppe), `name` (Balkenschlüssel und Achsenbeschriftung, je Zeile eindeutig), `domain.id`¹ (die View filtert je Domäne), `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency`, `.total`; Vergleichszeilen zusätzlich `id`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `domain.id` erhält die Karte keine Zeilen und bleibt leer; eine Vergleichszeile ohne `id` lässt sich nicht einblenden, eine ohne `type` bricht das Zeichnen ab. Die Klasse ist die Zeile mit `type=group`, gleich wo sie im Dokument steht: immer sichtbar, Achsenbeschriftung mit dem Glossarbegriff „Klassenschnitt“. Eine Vergleichszeile trägt den Begriff ihres `type` (`school` „Schulschnitt“, `state` „Landesschnitt“); für jeden anderen Typ hat das Glossar keinen Begriff, die Beschriftung ist dann nur der `name`. Anteile sind `frequency / total`, nicht `mean`, das der Server auf vier Stellen rundet; eine Zeile mit `total` 0 hat keine Anteile. Der Tooltip zeigt je Segment die `frequency` der eigenen Zeile, auch bei Vergleichszeilen. Zwei Zeilen mit gleichem `name` brechen das Zeichnen mit einem Fehler ab, weil die Balken nach Namen angeordnet sind und der eine über dem anderen läge.

**Optional genutzt**
| Endpunkt | Feld | Ohne das Feld |
|---|---|---|
| `competence-levels` (`comparison=…`) | Vergleichszeilen | Nur die Klassensäule, ⌀-Menü leer |
| `aggregations`, `items` (`comparison=…`) | Vergleichszeile mit derselben `id` | Die Säule startet ausgeblendet, weil die App beim Start nur diese IDs aktiv setzt |

Payload: `createChart(host, data)` (über `createKsDistributionConfig`) erhält ein Array von Kompetenzstufen-Zeilen: die Einträge aus `EN_DATA_KEYS.COMPETENCE_LEVELS_CLASS`, von der View auf eine `domain.id` gefiltert und unverändert an `parseCompetenceLevels` (`competenceLevelAdapter.js`) gereicht. Die Stufenfolge kommt aus der Zeile mit den meisten Stufen; ohne Stufen in irgendeiner Zeile bleibt die Karte leer. Den Glossarbegriff jeder Achsenbeschriftung bestimmt der `type` der Zeile (`comparisonSeriesVisual`).

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `comparisonState` | `ComparisonState` | – | nein | Aktive Vergleichsgruppen für das ⌀-Menü und den Startzustand; ohne ihn starten alle sichtbar |
| `yAxisSide` | `'left' \| 'right'` | `'left'` | nein | Seite der Prozentachse |
| `enableSegmentClick` | `boolean` | `true` | nein | Klick auf ein Segment hebt die Stufe hervor; die Übersicht schaltet es aus |
| `glossaryKey` | `string` | – | ja | Titel und Tutorial je Domäne |
| `showModuleTitle` | `boolean` | `true` | nein | Descriptor-Default |
| `enableModuleExport` | `boolean` | `true` | nein | Export-Button; Default aus `createKsDistributionConfig` |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setActiveModes(activeModes)` | Aufruf | Säulen der Vergleichsgruppen ein- oder ausblenden |
