# ChartHostModule

## Zweck
Der eine Chart-Baustein des Systems: eine `ContentModule`-Karte, die einen oder mehrere Renderer aus `packages/modules/src/common/charts/renderers/` nach den Angaben eines Config-Descriptors (`*Config.js`) erzeugt, zeichnet, aktualisiert und abbaut. Ein Chart-Typ ist kein Subtyp dieser Klasse, sondern ein Descriptor; die Klasse ist final. Sie übernimmt Layout-Wartezeit vor dem ersten Zeichnen, verworfene Render-Zyklen, aufgeschobene Erst-Hydrierung eingeklappter Karten, Theme-Wechsel und den Export-Vertrag.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../../module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../../module-base/src/modules/contentModule.md)
    - **ChartHostModule**
      - [classDeviationConfig](../../../sl/modules/charts/classDeviation/classDeviationConfig.md) — Descriptor
      - [competencyChartConfig](../../../sl/modules/charts/competency/overview/competencyChartConfig.md) — Descriptor
      - [competencyDetailSectionConfig](../../../sl/modules/charts/competency/detail/competencyDetailSectionConfig.md) — Descriptor
      - [enKsDistributionConfig](../../../en/modules/charts/ksDistribution/enKsDistributionConfig.md) — Descriptor
      - [groupComparisonConfig](../../../sl/modules/charts/groupComparison/groupComparisonConfig.md) — Descriptor
      - [itemLollipopConfig](../../../en/modules/charts/itemLollipop/itemLollipopConfig.md) — Descriptor
      - [itemSuccessLollipopConfig](../../../ma/modules/charts/itemSuccessLollipop/itemSuccessLollipopConfig.md) — Descriptor
      - [maKsDistributionConfig](../../../ma/modules/charts/ksDistribution/maKsDistributionConfig.md) — Descriptor
      - [scatterplotConfig](../../../en/modules/charts/scatterplot/scatterplotConfig.md) — Descriptor
      - [selfEfficacyConfig](../../../sl/modules/charts/selfEfficacy/selfEfficacyConfig.md) — Descriptor
      - [selfEfficacyLongConfig](../../../sl/modules/charts/longitudinal/selfEfficacyLongConfig.md) — Descriptor
      - [simpleKsBarConfig](../../../ma/modules/charts/ksBar/simpleKsBarConfig.md) — Descriptor
      - [slKsDistributionConfig](../../../sl/modules/charts/longitudinal/longitudinalKsShareConfig.md) — Descriptor
      - [styleChartConfig](../../../en/modules/charts/style/styleChartConfig.md) — Descriptor
      - [taskRingFocusConfig](../../../ma/modules/charts/taskRing/taskRingFocusConfig.md) — Descriptor
      - [taskRingGridConfig](../../../ma/modules/charts/taskRing/taskRingGridConfig.md) — Descriptor
      - [teachingQualityConfig](../../../sl/modules/charts/longitudinal/teachingQualityConfig.md) — Descriptor

## Daten
Keine API-Daten. `_doRenderContent(data)` legt den Payload der View ab und reicht ihn an `config.createRenderer(host, data)`, danach an `prepareLayout` und `onRendered`; `update(data)` geht allein an `config.onUpdate(host, charts, data)`, ohne diesen Hook wird nur gewarnt. Welche Felder, nennt jeder Descriptor.

## Optionen
Der Konstruktor lautet `new ChartHostModule(id, container, config, options)`.

| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `enableModuleExport` | `boolean` | `false` | nein | Export-Button der Karte; der Descriptor trägt nur `getExportIdentity` bei |
| `deferHydrationUntilExpand` | `boolean` | `false` | nein | Mit `collapsible` und eingeklapptem Start: erstes Zeichnen erst beim Aufklappen |
| `waitForStableLayout` | `boolean` | `true` | nein | Vor `create()` auf stabile Body-Maße warten |
| `config.defaultOptions` | `object` | – | nein | Descriptor-Defaults unter den Aufrufer-Optionen |

Descriptor-Vertrag (`ChartHostConfig`): `createRenderer(host, data)` (Pflicht), `glossaryPath`, `onUpdate(host, charts, data)`, `prepareLayout(host, charts, data)`, `onRendered(host, charts, data)`, `onCleanup(host)`, `publicAPI: { name: (host, ...args) => any }`, `defaultOptions`, `getExportIdentity(host)`. Fehlerhafte Descriptoren werfen im Konstruktor.

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `hydrate(data?)` | Aufruf | Wie Basis, oder bei aufgeschobener Hydrierung nur merken |
| `expand()` | Aufruf | Wie Basis; holt die aufgeschobene Hydrierung nach oder ruft `refreshCharts()` |
| `update(data)` | Aufruf | Basis-Update, dann `config.onUpdate` |
| `rerender(data)` | Aufruf | Renderer komplett neu erzeugen, ohne `initialized` zu berühren (für `onUpdate`-Hooks) |
| `replaceChart(renderer)`, `addChart(renderer)` | Aufruf | Renderer austauschen bzw. zusätzlich verfolgen; `create()` ruft der Aufrufer |
| `refreshCharts()` | Aufruf | `refresh()` auf jedem Renderer |
| `onThemeChanged()` | Aufruf | `rerender(getData())`, dann Basis |
| `destroy()` | Aufruf | `config.onCleanup`, Renderer zerstören, `configState` leeren, Basis |
| `chart`, `charts`, `configState` | Getter | Erster Renderer, alle Renderer, Descriptor-eigener Zustandsraum |
| `<publicAPI-Name>(...args)` | Aufruf | Jede `publicAPI`-Funktion liegt als Methode am Host (`host.setKsLevelFilter(level)` ruft `fn(host, level)`) |
| `getExportControlDefinition()` | Override | `{ id, title, type: 'chart', container }`: Id aus der Export-Identität, sichtbarer Titel, Body als Aufnahmeziel; `null` ohne `enableModuleExport`, ohne Renderer oder vor der aufgeschobenen Hydrierung |
| `getExportIdentity()` | Override | `config.getExportIdentity(host)` oder `null` |
| `validateContainer()` | Override | `assignId: true`, der Body trägt die Host-Id für `getElementById` |
