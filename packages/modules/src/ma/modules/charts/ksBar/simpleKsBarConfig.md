# ChartHostModule + simpleKsBarConfig

## Zweck
Der einzeilige Kompetenzstufen-Balken über der MA-Klassentabelle: ein horizontal gestapelter Balken mit dem Anteil (und der Anzahl) der Schüler:innen je Kompetenzstufe der Klasse. Ein Klick auf ein Segment hebt die Stufe hervor und filtert die Klassentabelle darauf; ein Reset der Tabelle nimmt die Hervorhebung wieder zurück. Die Karte ist klappbar und startet eingeklappt, gerendert wird erst beim ersten Aufklappen.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../module-base/src/modules/contentModule.md)
    - [ChartHostModule](../../../../common/charts/host/chartHostModule.md)
      - **simpleKsBarConfig** — Descriptor

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | – | `type`¹ (die Klassenzeile ist die mit `type=group`); von ihr `competenceLevels[].nameShort`, `competenceLevels[].descriptiveStatistics.frequency` (Anzahl in Beschriftung und Tooltip), `.total` (Segmentbreite `frequency / total`) |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Die Klassenzeile wird an ihrem `type` erkannt, gleich wo sie im Dokument steht; ohne sie bleibt der Balken leer (Konsolenwarnung, kein Diagramm). Die Anteile rechnet der Balken aus `frequency / total`, nicht aus `mean`, das der Server auf vier Stellen rundet; eine Klasse mit `total` 0 hat keine Anteile und zeichnet ebenfalls nichts.

**Optional genutzt**
Keine optionalen Felder.

Payload: `createRenderer(host, data)` erhält das Dokument `competence-levels` der Klasse unverändert (`MA_DATA_KEYS.COMPETENCE_LEVELS_CLASS`, von der Klassen-View per `_hydrateChildren` übergeben, samt der Vergleichszeilen aus `comparison=school-average,state-average`). `parseCompetenceLevels` (`competenceLevelAdapter.js`) formt es; der Descriptor nimmt die Zeile mit `type=group` (`findClassGroup`) und legt `distribution` und `counts` in `host.configState`. Die Vergleichszeilen liest der Balken nicht.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `onLevelSelected` | `(level: string\|null) => void` | – | nein | Segment-Klick; ein erneuter Klick auf das aktive Segment liefert `null` |
| `collapsible` | `boolean` | `true` | nein | Karte klappbar; die View setzt zusätzlich `startCollapsed` und `deferHydrationUntilExpand` |
| `showModuleTitle`, `enableModuleExport` | `boolean` | `true` | nein | Descriptor-Defaults für den Host |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `updateHighlight(level)` | Aufruf | Hervorhebung setzen oder mit `null`/`''` löschen; wirkt auf `configState` und das lebende Diagramm |
| `onLevelSelected(level)` | Callback | siehe Optionen |
