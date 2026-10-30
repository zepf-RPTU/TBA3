# @tba3/module-base

Base classes for titled content modules as light-DOM custom elements: the card shell, the
module lifecycle, a resource tracker, and the header-menu, icon, DOM and text-measurement
helpers those cards are built from. **Runtime dependencies:** Lit (`ReactiveElement` is the
module base; its templates render the modules), Floating UI (`@floating-ui/dom`, behind
`followAnchor`) and `@preact/signals-core` (module state).

```js
import { ContentModule } from '@tba3/module-base';

class NoteCard extends ContentModule {
    async _renderBody(data) {
        this.contentContainer.textContent = data.text;
    }
}
customElements.define('note-card', NoteCard);

const card = NoteCard.create('note', {
    showModuleTitle: true,
    title: 'Standalone card',
    collapsible: true,
});
card.data = { text: 'Hello' };
document.querySelector('#host').append(card);
await card.updateComplete;
```

The contract: extend `ContentModule`, implement `_renderBody(data)`, render into
`this.contentContainer`, define a tag. Options are fixed before the element connects; a new
`data` runs the content pass again; removing the element tears it down. A body that
measures itself waits for `this._whenLaidOut()`, which is `null` while the card is hidden.
`BaseModule` is the same lifecycle without the card shell, for a control that draws its own
thing.

## The barrel

`@tba3/module-base` is the main entry point. Importing it touches no network and no global
beyond the page's own; it does import the card stylesheets, so it needs a bundler that
handles CSS imports (plain Node tooling uses [`./glossary`](#the-glossary-entry-point)).

| Export | What it is |
|---|---|
| `BaseModule`, `ContentModule` | The two base classes, without and with the card shell |
| `CAPTURE_STAGE_ATTRIBUTE` | Marks an export capture stage; a module inside one stays inert |
| `owningModuleId` | The id of the module an element belongs to |
| `headerActionButton`, `headerActionDropdown`, `headerActionCheckboxDropdown`, `headerActionRadioDropdown`, `headerActionMenuItem`, `headerActionMenuSeparator`, `renderHeaderActionMenuItems` | Header action templates a card returns from `_headerActions()`: a button (plain, toggle or checkbox; `busy` while its action runs), a dropdown (plain, checkbox or pick-one), and the menu rows |
| `createElement`, `queryEl`, `requireEl`, `noticeCallout`, `FOCUSABLE`, `isActivationKey`, `isModifiedClick` | The DOM shorthands the cards are built from (`requireEl` throws on no match), the focusable-element selector, the Enter/Space test for button-like controls, and whether a link click carries a modifier key (the browser handles it, e.g. open in a new tab) |
| `handleTabKeydown` | Arrow-key behaviour for a tab strip |
| `createIcon`, `iconSvg`, `renderIcon`, `renderCheckboxIcon` | A Material Symbols glyph as an element, as markup, or as a lit template value built once per name and options; the two-state checkbox glyph |
| `followAnchor` | Keeps a fixed-position popover or menu at its anchor (Floating UI), flipped and kept in the viewport; returns the stop |
| `escapeHtml` | Escaping for anything interpolated into markup |
| `csvField`, `csvSafeValue` | One CSV field, quoted and formula-safe; the formula-safe value alone |
| `trusted`, `trustedFragment`, `setTrustedHTML` | The one way an HTML string becomes markup: in a lit template, as a detached fragment, as an element's content; the caller vouches for the markup |
| `cssVars`, `cssVarsAttr` | Run-time custom properties without a `style` attribute: a lit element directive, and the attribute that markup built as text carries |
| `withDefaults` | Fill the option keys a caller left out (or set to `undefined`) from a defaults object |
| `resizeService` | One shared `ResizeObserver`; `observe(el, callback \| {measure, draw})` returns the release, for `resources.trackSubscription`; in one flush every `measure` runs before any `draw` |
| `ResourceTracker` | Listener, timer and observer bookkeeping tied to a lifetime |
| `waitForLayout` | Wait two frames for layout to settle |
| `measureTextWidth`, `probeCssLengthPx`, `probeRootLengthPx`, `rootFontSizePx` | Measure text at a font before layout; resolve a CSS length (`var()`, `max()`) to px, a root-level one once per root font size |
| `createState`, `writeState`, `toSignal`, `onChange` | State as signals: `createState({ key: initial })` gives one signal per key (a signal passed in is kept, so state is shared, not copied; `toSignal` does the same for one value); `writeState` sets several keys in one batch. A module follows them with `this.effect(fn)`, or changes only with `this.onChange(read, run)` |
| `sameItems`, `sameValue` | Same items in the same order; the change test `onChange` uses (`Object.is`, or `sameItems` for two arrays) |

## Optional host capabilities

The kit ships none of the features a product wraps around a card. The host hands them
down as `runtime` on the `context` option (typed `ModuleRuntime`). Without one, a module
uses no-op defaults, and none of an unpassed capability's machinery is in your import
graph. A module passes the context on by creating its children with
`Child.create(id, this._childOptions({ … }))`.

```js
const runtime = {
    // Wrap rendered copy — e.g. annotate glossary terms. Default: identity.
    decorateText: (html) => myAnnotator.annotate(html),
    // Give exportable cards a button. Default: a no-op, so no button appears.
    exportService: myExportService,
};
const card = MyCard.create('my-card', { context: { documents, glossaryData, runtime } });
```

Beside `runtime`, the context (`BaseContext`) carries `documents`, the store that loads each
card's `static documents` before its content pass, and `glossaryData`, the glossary tree.
A host can add its own per-app state; the kit forwards it untouched.

A card with a title bar gets an export button once its `_getExportType()` override names
a type (the default is `null`). `enableModuleExport: false` opts a card out.

## Header menus

`_headerActions()` returns a card's header actions, rendered in its toolbar before the
export control. A signal they read re-renders the toolbar when it changes.

`headerActionDropdown` renders its menu as a `popover="auto"` its trigger opens, so the
browser does the coordinating: one open menu at a time, closed by an outside click or by
Escape (which hands focus back to the trigger), in the top layer. The kit attaches no
listener to your document. Close one from code with `dropdown.hidePopover()`.

## Styling

`ContentModule` imports its own structural stylesheet, so the card has layout as soon as
you import the class. Every custom property that sheet reads carries a fallback, so a host
with no design system still gets a legible card: a white surface, a light border,
readable type. To theme it, define the properties yourself:

```css
:root {
    --color-card-background: #11161d;
    --color-border: #2b3440;
    --radius-md: 12px;
    --text-secondary: #b8c2cf;
}
```

The sheet reads `--color-border`, `--color-card-background`, `--content-module-header-pad`,
`--content-module-header-pad-block`, `--content-module-header-pad-inline`,
`--content-module-subtitle-pad`, `--focus-ring`, `--fs-lg`, `--fs-module-title`, `--fs-sm`,
`--layout-gap`, `--layout-pad`, `--lh-text`, `--motion-duration-base`,
`--motion-ease-standard`, `--radius-md`, `--text-muted`, `--text-secondary` and
`--z-module-content`.

The sheet declares the layer order `vendor, foundation, common, modules, views` and puts the
card shell in `common`. The first `@layer` order statement the browser sees wins, so a host
that wants another order declares its own before importing the package.

The sheets under `./styles/*` (`buttons.css`, `controls.css`, `interactive.css`,
`layout.css`, `notice-callout.css`) are the host's to import, and they read the design
tokens without fallbacks: `./styles/tokens.css` defaults every one of them, so import it
first, or define them yourself. It holds plain `:root` declarations and no `!important`,
so your own sheet overrides it on order alone. A colour that differs between light and
dark is one `light-dark(<light>, <dark>)`: set `data-color-scheme="light"` or `"dark"` on
`<html>` (or on any subtree) to pick the scheme, or leave it off for light.

## The glossary entry point

`@tba3/module-base/glossary` carries the text helpers for a host with a glossary tree:
`applyTemplateTokens`, `applyMarkupTokens`, `fillKnownTokens`, `resolveDotPath`,
`resolveGlossaryTitle`, `requireGlossaryTitle`, `missingGlossaryText`,
`isMissingGlossaryText`, `stripHtmlToText`, `aliasText`,
`GLOSSARY_TERM_TAB_STOP`, `stampGlossaryTermTabStop`, `glossaryTermAttrs` and
`glossaryRunsMarkup`.

A `{{token}}` value is text, or text runs (`GlossaryTextRuns`, `[{text, glossaryKey?}]`)
for a value the host's annotator must not match as free text: `applyTemplateTokens` reads
the runs as text, `applyMarkupTokens` and `glossaryRunsMarkup` write each keyed run as the
term of its entry (`glossaryTermAttrs`).

It is its own entry point because it is pure: it pulls in no module, no CSS and no DOM at
import time, so tooling that runs in plain Node (a build check over the glossary) can
import it.

## No deep imports

The `exports` map names the barrel, `./glossary` and the stylesheets under
`./styles/*` — nothing else resolves. Everything under `src/` is internal: no path,
name or behaviour behind it is promised. A name you need that the barrel lacks is a gap
to report.
