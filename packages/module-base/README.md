# @tba3/module-base

Base classes for titled content modules — the card shell, the module lifecycle, child
registration with cascading cleanup, a resource tracker, and the header-menu, segmented-button
and text-measurement helpers those cards are built from. **No runtime dependencies.**

```js
import { ContentModule } from '@tba3/module-base';

class NoteCard extends ContentModule {
    async _doRenderContent(data) {
        this.contentContainer.textContent = data.text;
    }
}

const card = new NoteCard('note', document.querySelector('#host'), {
    showModuleTitle: true,
    title: 'Standalone card',
    collapsible: true,
});
await card.init({ text: 'Hello' });
```

That is the whole contract: extend `ContentModule`, implement `_doRenderContent(data)`,
render into `this.contentContainer`. `BaseModule` is the same lifecycle without the card
shell, for a control that draws its own thing.

## The barrel

`@tba3/module-base` is the one entry point, and it carries everything a module author
needs. Nothing in it touches the network, the DOM at import time, or a global other than
the one the browser already gives a page.

| Export | What it is |
|---|---|
| `BaseModule`, `ContentModule` | The two base classes: lifecycle with child registration and cascading cleanup, with and without the card shell |
| `configureModuleRuntime`, `moduleRuntime` | The host capabilities a card asks for (see below) |
| `initDropdownManager`, `closeDropdown` | The one-menu-at-a-time coordinator, started once during bootstrap |
| `ensureHeaderActionDropdownControl`, `renderHeaderActionMenuItems`, `setHeaderActionButtonAttributes` | A header action button and the menu under it |
| `createSegmentedButtonRow`, `createSegmentedChoiceButton`, `setSegmentedChoiceButtonState` | A segmented choice row, for a mode switch in a card header |
| `createElement`, `appendChildren`, `queryEl`, `targetEl`, `createPlaceholder` | The DOM shorthands the cards are built from |
| `openModalDialog` | Focus trap and Escape handling for an overlay |
| `tabAttributes`, `handleTabKeydown` | ARIA attributes and arrow-key behaviour for a tab strip |
| `createIcon`, `iconSvg` | A Material Symbols glyph as an element or as markup |
| `escapeHtml` | Escaping for anything interpolated into markup |
| `resizeService` | One shared `ResizeObserver`, with per-scope teardown |
| `ResourceTracker` | Listener, timer and observer bookkeeping tied to a lifetime |
| `waitForLayout`, `waitForStableElementBox` | Wait for a box to exist and stop moving before measuring it |
| `applyTemplateTokens`, `resolveDotPath`, `resolveGlossaryTitle`, `stripHtmlToText`, `MISSING_GLOSSARY_TITLE` | Reading a glossary-shaped tree, for a host that has one |

## Optional host capabilities

The kit ships none of the features a product wraps around a card. It asks the host for
them, and defaults to doing nothing — so a capability you do not register is *absent*,
not merely inert, and none of its machinery is in your import graph.

```js
import { configureModuleRuntime } from '@tba3/module-base';

configureModuleRuntime({
    // Wrap rendered copy — e.g. annotate glossary terms. Default: identity.
    decorateText: (html) => myAnnotator.annotate(html),
    // Give exportable cards a button. Default: a no-op, so no button appears.
    exportService: myExportService,
    buildExportTargetId: (moduleId, identity) => `${moduleId}:${identity ?? ''}`,
});
```

Call it once, before constructing any module: a module resolves its services at
construction.

A card opts into export by returning a descriptor from `getExportControlDefinition()`;
the default returns `null`, which is why most cards have no export button.

## Header menus

```js
import { initDropdownManager } from '@tba3/module-base';

initDropdownManager();
```

Starts the coordinator behind `ensureHeaderActionDropdownControl`: one open menu at a time,
closed by an outside click or by Escape. Call it once during bootstrap.
Nothing is installed until you do — importing a kit file never attaches listeners to your
document.

## Styling

`ContentModule` imports its own structural stylesheet, so the card has layout as soon as
you import the class. Every custom property that sheet reads carries a fallback, so a host
with no design system still gets a legible card — a white surface, a light border,
readable type. To theme it, define the properties yourself:

```css
:root {
    --color-card-background: #11161d;
    --color-border: #2b3440;
    --radius-md: 12px;
    --text-secondary: #b8c2cf;
    /* …see the `var(--x, fallback)` calls in src/modules/contentModule.css */
}
```

The sheet lives in the `common` cascade layer. If your app declares `@layer`, place that
layer where you want the card shell to sit relative to your own rules.

## Deep imports

`@tba3/module-base/utils/icons.js` and friends resolve, mirroring the source layout — but
they are **unstable internals**: no path, name or behaviour behind them is promised, and
the next reshuffle breaks them without a word. They are for adapting a copy of the package,
not for consuming it. Import from the barrel; if something you need is not in the table
above, that is a gap in the barrel worth reporting.
