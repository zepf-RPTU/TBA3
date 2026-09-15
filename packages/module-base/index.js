/**
 * @tba3/module-base — the public surface.
 *
 * A host builds cards by subclassing `ContentModule` (or `BaseModule` for a
 * control with no card shell), implementing `_doRenderContent(data)` and
 * rendering into `this.contentContainer`.
 *
 * Everything our own product does beyond that — an export button, glossary-aware
 * copy — is a capability the host registers through `configureModuleRuntime`.
 * Register nothing and those features are absent rather than inert: the kit has
 * no runtime dependencies, and none of that machinery is in its import graph.
 *
 * Deep imports (`@tba3/module-base/utils/icons.js`) resolve too; this barrel is
 * what a consumer should reach for.
 */

export { BaseModule } from './src/modules/baseModule.js';
export { ContentModule } from './src/modules/contentModule.js';
export { configureModuleRuntime, moduleRuntime } from './src/modules/moduleRuntime.js';
export { closeDropdown, initDropdownManager } from './src/modules/header/dropdownManager.js';

export {
    ensureHeaderActionDropdownControl,
    renderHeaderActionMenuItems,
    setHeaderActionButtonAttributes,
} from './src/modules/header/headerActionDropdown.js';

export {
    createSegmentedButtonRow,
    createSegmentedChoiceButton,
    setSegmentedChoiceButtonState,
} from './src/modules/header/segmentedButtonBuilder.js';

export { ResourceTracker } from './src/utils/resourceTracker.js';
export { waitForLayout, waitForStableElementBox } from './src/utils/waitForLayout.js';
export { escapeHtml } from './src/utils/escapeHtml.js';
export { createIcon, iconSvg } from './src/utils/icons.js';
export { openModalDialog } from './src/utils/modalFocus.js';
export { handleTabKeydown, tabAttributes } from './src/utils/tabStrip.js';

export {
    appendChildren,
    createElement,
    createPlaceholder,
    queryEl,
    targetEl,
} from './src/utils/domBuilder.js';

export { resizeService } from './src/services/resizeService.js';

export {
    applyTemplateTokens,
    MISSING_GLOSSARY_TITLE,
    resolveDotPath,
    resolveGlossaryTitle,
    stripHtmlToText,
} from './src/glossary/glossaryText.js';
