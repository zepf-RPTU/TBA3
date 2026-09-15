# ChartHostModule + selfEfficacyConfig

## Zweck
Die Selbstwirksamkeit pro Klasse und für die Schule, als gestapelter Balken über die Antwortbänder oder als Boxplot der Schüler:innen-Mittelwerte (`vizMode`). Drei Formen aus einem Descriptor: horizontal mit HTML-Legende (SW-Layout des Detail-Overlays), vertikal für eine einzelne Klasse (Klassen-Layout) und kompakt als Wasserzeichen in der Vorschaukarte.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../../module-base/src/modules/contentModule.md)
    - [ChartHostModule](../../../../common/charts/host/chartHostModule.md)
      - **selfEfficacyConfig** — Descriptor

## Daten
**Benötigt**
| Endpunkt | Parameter | Felder |
|---|---|---|
| `competence-levels` | `type=students` | `properties[sp_mean]`¹, `covariates[group]`¹, `id`¹ |

¹ In der Spezifikation optional, für dieses Modul Pflicht. Ohne `sp_mean` gibt es keine Zeilen, und View und Overlay mounten den Host nicht. Ohne `covariates[group]` bleibt nur die Schulzeile, ohne `id` zählt je Klasse und in der Schulzeile nur eine Person. Werte außerhalb 1–5 zählen im Nenner, liegen aber in keinem Antwortband.

Keine optionalen Felder.

Payload: `createRenderer(host, data)` erhält Zeilen `{ className, count, values, statistics }`, als Array oder als einzelne Zeile (Klassen-Layout), aus den Datasets `SELF_EFFICACY_BY_CLASS` und `SELF_EFFICACY_SCHOOL` (`buildSelfEfficacyByClass`, `buildSelfEfficacySchool` in `src/sl/slSurveyDerivation.js`; `className: 'Schule'` für die Schule). Der Stapelbalken (`SelfEfficacyStackedBar`, `selfEfficacyStackedBar.js`) liest `values`, der Boxplot (`SelfEfficacyBoxPlot`, `selfEfficacyBoxPlot.js`) `statistics` (`calculateDetailedBoxPlotStats`) und `count`; aus den Optionen `defaultVizMode`, `chartHeight`, `isVertical` und `compact`. Außer im Modus `compact` beschriften beide Renderer immer: der Boxplot mit dem Klassennamen unter jeder Box, der Stapelbalken mit dem Prozentwert an Segmenten ab 10 % (vertikal ab 15 %).

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `defaultVizMode` | `string` | `'stacked_bar'` | nein | Startmodus, `'boxplot'` alternativ |
| `chartHeight` | `number` | `400` | nein | Höhe des Renderers |
| `isVertical` | `boolean` | `false` | nein | Vertikaler Balken ohne Legendenpanel (nur gestapelt) |
| `compact` | `boolean` | `false` | nein | Wasserzeichen: nur Geometrie, Größe aus dem Container |
| `title` | `string` | – | nein | Vom Overlay gesetzt, da kein Glossarpfad |
| `enableModuleExport` | `boolean` | `true` | nein | Descriptor-Default |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setVizMode(mode)` | Aufruf | `'stacked_bar'` oder `'boxplot'`; voller Rerender, weil die Renderer-Klasse wechselt |
