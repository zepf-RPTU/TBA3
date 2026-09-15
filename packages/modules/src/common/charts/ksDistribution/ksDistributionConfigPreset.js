import { ensureHeaderActionButton } from '../host/chartHeaderControls.js';
import { ensureHighlightedLevelState } from './ksHighlightContract.js';
import { iconSvg } from '@tba3/module-base/utils/icons.js';
import { glossaryAnnotator } from '../../glossary/glossaryAnnotator.js';

/**
 * Resolve the standardized KS segment-click option (enabled unless explicitly false).
 * @param {import('../host/chartHostModule.js').ChartHostModule} host - The chart host whose header the control belongs to.
 * @returns {boolean} True unless the host explicitly set `enableSegmentClick` to false.
 */
export function resolveKsSegmentClickEnabled(host) {
    return host.getOption('enableSegmentClick') !== false;
}

// ============================================================================
// CONFIG FACTORY
// ============================================================================

/**
 * KsDistributionConfigPreset — Shared config factory for KS distribution charts.
 *
 * Both EN and MA KS distribution modules share the same update/highlight logic;
 * only the renderer constructor and options differ per app.
 * @param {object} appDefaults - App-specific configuration
 * @param {string} [appDefaults.glossaryPath] - Dot-notation glossary path (callers may pass glossaryKey via options instead)
 * @param {object} appDefaults.defaultOptions - Merged into ChartHostModule options
 * @param {function(*, *): object} appDefaults.createChart - Factory that returns the renderer
 * @param {object} [appDefaults.extraPublicAPI] - Additional public API methods
 * @returns {object} A ChartHostModule config descriptor
 */

/**
 * Build the shared KS-distribution ChartHostConfig from one app’s specifics.
 * EN, MA and SL draw the same chart over the same shape of data; only the glossary
 * path, the renderer factory and a few defaults differ, so they are parameters
 * rather than three near-identical descriptors.
 * @param {object} appDefaults - The app’s `glossaryPath`, `createChart` factory, and any option overrides.
 * @returns {object} A ChartHostConfig ready to hand to a ChartHostModule.
 */
export function createKsDistributionConfig(appDefaults) {
    const { glossaryPath, defaultOptions = {}, createChart, extraPublicAPI = {} } = appDefaults;

    return {
        glossaryPath,

        defaultOptions: {
            enableSegmentClick: true,
            enableModuleExport: true,
            ...defaultOptions,
        },

        /**
         * Create the chart renderer.
         * Delegates to the app-specific `createChart` factory.
         * @param {any} host - The chart host.
         * @param {any} data - The competence-level rows the chart aggregates.
         * @returns {any} Whatever the app’s `createChart` factory returned.
         */
        createRenderer(host, data) {
            host.configState.apiData = data;
            ensureHighlightedLevelState(host);
            const chart = createChart(host, data);

            // Create orientation toggle header button if enabled
            if (host.getOption('enableOrientationToggle')) {
                _ensureOrientationToggle(host, extraPublicAPI);
            }

            return chart;
        },

        publicAPI: extraPublicAPI,
    };
}

// ============================================================================
// ORIENTATION TOGGLE BUTTON (HEADER)
// ============================================================================

/**
 * Ensure orientation toggle button exists in the module header.
 * Idempotent — reuses the existing button when present and resyncs its state.
 * @param {object} host - The chart host whose header the control belongs to.
 * @param {object} extraPublicAPI - Must contain toggleOrientation(host)
 */
function _ensureOrientationToggle(host, extraPublicAPI) {
    ensureHeaderActionButton(host, {
        selector: '[data-chart-action="orientation-toggle"]',
        buttonAttributes: {
            'data-chart-action': 'orientation-toggle',
        },
        ariaLabel: glossaryAnnotator.getRequiredEntryText(
            'general.buttons.element_texts.orientation-toggle.label',
        ),
        tooltipText: glossaryAnnotator.getRequiredEntryText(
            'general.buttons.element_texts.orientation-toggle.label',
        ),
        syncButton: _syncToggleButton,
        onClick: () => {
            if (extraPublicAPI.toggleOrientation) {
                extraPublicAPI.toggleOrientation(host);
            }
        },
    });
}

/**
 * Icon for the orientation toggle — it shows the orientation the click would switch *to*.
 * @param {boolean} isHorizontal - Whether the chart is currently horizontal.
 * @returns {string} Inline SVG markup for the button.
 */
function _toggleIconSVG(isHorizontal) {
    return iconSvg(isHorizontal ? 'swap_vert' : 'swap_horiz');
}

/**
 * Resync the orientation toggle’s icon and label to the chart’s current orientation.
 * @param {any} btn - The toggle button.
 * @param {any} host - The chart host, read for the current orientation.
 */
function _syncToggleButton(btn, host) {
    const chart = host.chart;
    const isHorizontal = chart ? chart.isHorizontal : host.getOption('isHorizontal');
    btn.innerHTML = _toggleIconSVG(isHorizontal);
    btn.classList.toggle('is-active', isHorizontal);
    btn.setAttribute('aria-pressed', String(isHorizontal));
}
