# NavCardModule

## Zweck
Navigationskarten: eine Reihe klickbarer Vorschau-Einträge, die per Callback zu einer View führen. Der Eintrag der aktuellen View ist deaktiviert und trägt den Hinweis aus dem Glossar (`general.messages.current-view`, „Sie sind hier“). Beschriftung, Beschreibung und Tooltip eines Eintrags kommen aus den `element_texts` des Glossareintrags; ein Eintrag mit `chartClass` zeigt eine Kompetenzband-Miniatur, einer mit `icon` ein Material-Symbol.

## Design/Idee

TODO

## Klassenhierarchie
- [BaseModule](../../../../packages/module-base/src/modules/baseModule.md)
  - [ContentModule](../../../../packages/module-base/src/modules/contentModule.md)
    - **NavCardModule**

## Daten
Keine API-Daten. `_doRenderContent(data = {})` mischt `data` über die Optionen und liest daraus nur `currentView`; die Einträge kommen aus der Option `items`: `[{ label?, glossarySubKey?, labelIcon?, viewTarget, viewMode?, chartClass?, icon? }]`. Ein Glossareintrag mit `description` erscheint als Zeile unter der Beschriftung, einer mit `tooltip` als Tooltip. Ein Item ohne `glossarySubKey` und ohne `label` rendert `MISSING_GLOSSARY_TITLE`; ein Klick ruft `onNavigate(viewTarget, viewMode)`; `viewMode` ist `undefined`, wenn das Item keinen trägt.

## Optionen
| Option | Typ | Standard | Pflicht | Bedeutung |
|---|---|---|---|---|
| `items` | `Array<object>` | `[]` | ja | Einträge, siehe Daten |
| `currentView` | `string` | `null` | nein | View, deren Eintrag deaktiviert wird |
| `previewLabelTag` | `h1`…`h6`, `p`, `div`, `span` | `'h3'` | nein | Element der Eintragsbeschriftung |
| `interactivePreset` | `'card'` \| `'subtle'` | `'card'` | nein | Hover-Klasse der Einträge (`interactive-card` bzw. `interactive-subtle`) |
| `onNavigate` | `(viewTarget: string, viewMode?: string) => void` | – | ja | Navigationsziel und der Layout-Modus des Items; EN/MA: aus `getDefaultNavCardConfig` (`enConstants.js`/`maConstants.js`), das die Willkommens-View hinter `_childOptions()` spreizt und damit dessen `onNavigate` überschreibt; SL: aus `SlAppModule.getNavCardConfig()` |

## Methoden
| Methode | Art | Bedeutung |
|---|---|---|
| `setCurrentView(view, forceRender = false)` | Aufruf | Aktive View wechseln; ohne `forceRender` nur Klassen und Hinweis umschalten |
| `onNavigate(viewTarget, viewMode?)` | Callback | Klick oder Enter/Leertaste auf einem klickbaren Eintrag |
