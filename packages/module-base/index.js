/**
 * The public surface of `@tba3/module-base`: a name a consumer needs is exported here,
 * never reached by path.
 */

export { BaseModule, CAPTURE_STAGE_ATTRIBUTE, owningModuleId } from './src/modules/baseModule.js';
export { ContentModule } from './src/modules/contentModule.js';

export {
    headerActionButton,
    headerActionCheckboxDropdown,
    headerActionDropdown,
    headerActionMenuItem,
    headerActionMenuSeparator,
    headerActionRadioDropdown,
    renderHeaderActionMenuItems,
} from './src/modules/header/headerActionDropdown.js';

export { ResourceTracker } from './src/utils/resourceTracker.js';
export { waitForLayout } from './src/utils/waitForLayout.js';
export {
    measureTextWidth,
    probeCssLengthPx,
    probeRootLengthPx,
    rootFontSizePx,
} from './src/utils/textMeasurement.js';
export { createState, onChange, sameValue, toSignal, writeState } from './src/utils/state.js';
export { withDefaults } from './src/utils/withDefaults.js';
export { sameItems } from './src/utils/sameItems.js';
export { escapeHtml } from './src/utils/escapeHtml.js';
export { csvField, csvSafeValue } from './src/utils/csvField.js';
export { cssVarsAttr, setTrustedHTML, trustedFragment } from './src/utils/trustedHtml.js';
export { trusted } from './src/utils/trustedDirective.js';
export { cssVars } from './src/utils/cssVarsDirective.js';
export { createIcon, iconSvg, renderCheckboxIcon, renderIcon } from './src/utils/icons.js';
export { followAnchor } from './src/utils/followAnchor.js';
export { handleTabKeydown } from './src/utils/tabStrip.js';

export {
    createElement,
    FOCUSABLE,
    isActivationKey,
    isModifiedClick,
    noticeCallout,
    queryEl,
    requireEl,
} from './src/utils/domBuilder.js';

export { resizeService } from './src/services/resizeService.js';

/** @typedef {import('./src/modules/baseModule.js').BaseOptions} BaseOptions */
/** @typedef {import('./src/modules/baseModule.js').BaseContext} BaseContext */
/** @typedef {import('./src/services/resizeService.js').ResizeObserving} ResizeObserving */
/**
 * @template {object} T
 * @typedef {import('./src/utils/state.js').State<T>} State
 */
/**
 * @template {object} T
 * @typedef {import('./src/utils/state.js').StateInit<T>} StateInit
 */
/**
 * @template {{options: BaseOptions}} M
 * @typedef {import('./src/modules/baseModule.js').ChildContext<M>} ChildContext
 */
/** @typedef {import('./src/modules/contentModule.js').ContentOptions} ContentOptions */
/** @typedef {import('./src/modules/moduleRuntime.js').ExportControlDefinition} ExportControlDefinition */
/** @typedef {import('./src/modules/moduleRuntime.js').ExportDataBlock} ExportDataBlock */
/** @typedef {import('./src/modules/moduleRuntime.js').ModuleRuntime} ModuleRuntime */
/** @typedef {import('./src/modules/header/headerActionDropdown.js').HeaderActionMenuItem} HeaderActionMenuItem */
/** @typedef {import('./src/utils/textMeasurement.js').MeasureFont} MeasureFont */
