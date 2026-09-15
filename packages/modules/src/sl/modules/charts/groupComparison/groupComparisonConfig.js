/**
 * GroupComparisonConfig — ChartHostModule descriptor for the SL group comparison:
 * two groups on one metric, drawn as a population pyramid.
 *
 * `createRenderer()` returns the `GroupComparisonChart` instance rather than building
 * it inline, so ChartHostModule can set `chart.host` before `create()` runs.
 */

import { measureHeaderWidth } from '@tba3/module-base/utils/textMeasurement.js';
import { GroupComparisonChart } from './groupComparisonChart.js';
import './groupComparisonConfig.css';

// ============================================================================
// CONTROL CONSTANTS
// ============================================================================

const CONTROL_ROOT_CLASS = 'group-comparison-controls';
const CONTROL_ROW_CLASS = 'group-comparison-controls-row';
const CONTROL_FIELD_CLASS = 'control-field group-comparison-control';
const CONTROL_LABEL_CLASS = 'control-label group-comparison-control-label';
const CONTROL_SELECT_CLASS = 'control-select control-select--card group-comparison-control-select';
const SELECT_HORIZONTAL_CHROME_REM = 2.75;
const SELECT_HORIZONTAL_CHROME_EXTRA_PX = 8;

// ============================================================================
// CONTROL LIFECYCLE
// ============================================================================

/**
 * Remove the control strip this config owns, so a rebuild does not leave a second one.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host whose container holds the strip.
 */
function clearComparisonControls(host) {
    host.container?.querySelector(`.${CONTROL_ROOT_CLASS}`)?.remove();
}

// ============================================================================
// MEASUREMENT HELPERS
// ============================================================================

/**
 * The document's root font size in px, which the select's padding is expressed in.
 * @returns {number} The size, falling back to 16 when it cannot be read.
 */
function getRemSize() {
    return Number.parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
}

/**
 * Width one control's label needs.
 * @param {string} label - The label text.
 * @param {object} font - The font it will be rendered in.
 * @param {string} font.fontFamily - Resolved font stack.
 * @param {number} font.fallbackFontSize - Size used when the CSS variable cannot be read.
 * @returns {number} Width in px.
 */
function measureControlLabelWidth(label, { fontFamily, fallbackFontSize }) {
    return measureHeaderWidth(label, {
        padding: 0,
        fontSizeVar: '--fs-base',
        /* The label renders at the regular weight (.control-label sets none). */
        fontWeight: '400',
        fontFamily,
        fallbackFontSize,
    });
}

/**
 * Width the widest option of one control needs, so the select does not clip its own
 * longest entry once opened.
 * @param {Array<{text: string}>} options - The control's options.
 * @param {object} font - The font and chrome the options are measured with.
 * @param {string} font.fontFamily - Resolved font stack.
 * @param {number} font.fallbackFontSize - Size used when the CSS variable cannot be read.
 * @param {number} font.selectPadding - Horizontal chrome the select adds around its text.
 * @returns {number} Width in px.
 */
function measureControlOptionWidth(options, { fontFamily, fallbackFontSize, selectPadding }) {
    return options.reduce((widestWidth, option) => {
        const optionWidth = measureHeaderWidth(option.text, {
            padding: selectPadding,
            fontSizeVar: '--fs-base',
            fontWeight: '400',
            fontFamily,
            fallbackFontSize,
        });

        return Math.max(widestWidth, optionWidth);
    }, 0);
}

/**
 * Width one control would like: enough for its label and its widest option.
 * @param {object} control - The control descriptor.
 * @param {Element} root - The strip's root, measured for the font actually in effect.
 * @returns {number} Width in px.
 */
function getPreferredControlWidth(control, root) {
    const rootStyle = getComputedStyle(root);
    const fontFamily = rootStyle.fontFamily || 'system-ui, -apple-system, sans-serif';
    const fallbackFontSize = Number.parseFloat(rootStyle.fontSize) || 16;
    const selectPadding = Math.ceil(
        getRemSize() * SELECT_HORIZONTAL_CHROME_REM + SELECT_HORIZONTAL_CHROME_EXTRA_PX,
    );

    const labelWidth = measureControlLabelWidth(control.label, { fontFamily, fallbackFontSize });
    const optionWidth = measureControlOptionWidth(control.options, {
        fontFamily,
        fallbackFontSize,
        selectPadding,
    });

    return Math.max(labelWidth, optionWidth);
}

/**
 * Pair every control with the width it would like, so the strip can distribute what it
 * actually has.
 * @param {Array<object>} controls - The control descriptors.
 * @param {Element} root - The strip's root.
 * @returns {Array<{control: object, preferredWidth: number}>} One entry per control, in order.
 */
function getMeasuredControlEntries(controls, root) {
    return controls.map((control) => ({
        control,
        preferredWidth: getPreferredControlWidth(control, root),
    }));
}

// ============================================================================
// CONTROL DOM HELPERS
// ============================================================================

/**
 * Build one labelled select for the control strip.
 * @param {object} control - The control descriptor: its label, options and `apply`.
 * @param {number} preferredWidth - Width the field is sized to.
 * @returns {HTMLElement} The field wrapper.
 */
function createControlField(control, preferredWidth) {
    const field = document.createElement('label');
    field.className = CONTROL_FIELD_CLASS;
    field.setAttribute('data-control-id', control.id);
    field.style.setProperty('--control-preferred-width', `${preferredWidth}px`);

    const label = document.createElement('span');
    label.className = CONTROL_LABEL_CLASS;
    label.textContent = control.label;

    const select = document.createElement('select');
    select.className = CONTROL_SELECT_CLASS;
    select.disabled = control.disabled === true;
    select.setAttribute('aria-label', control.label);

    control.options.forEach((optionData) => {
        const option = document.createElement('option');
        option.value = String(optionData.value);
        option.textContent = optionData.text;
        if (String(optionData.value) === String(control.selectedValue)) {
            option.selected = true;
        }
        select.appendChild(option);
    });

    if (control.selectedValue != null) {
        select.value = String(control.selectedValue);
    }

    select.addEventListener('change', (event) => {
        control.apply(/** @type {HTMLSelectElement} */ (event.target).value);
    });

    field.appendChild(label);
    field.appendChild(select);
    return field;
}

/**
 * Build the row holding every control field.
 * @param {Array<{control: object, preferredWidth: number}>} controlEntries - The controls with their measured widths.
 * @returns {HTMLElement} The row element.
 */
function createControlRow(controlEntries) {
    const row = document.createElement('div');
    row.className = `${CONTROL_ROW_CLASS} layout-row layout-row--wrap`;

    controlEntries.forEach(({ control, preferredWidth }) => {
        row.appendChild(createControlField(control, preferredWidth));
    });

    return row;
}

/**
 * The strip's root element, created above the module body on first use so the controls
 * sit outside the chart's own scroll area.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host the strip belongs to.
 * @returns {Element|null} The root, or `null` when the module body is not in the DOM yet.
 */
function ensureControlsRoot(host) {
    const container = host.container;
    if (!container) return null;

    let root = container.querySelector(`.${CONTROL_ROOT_CLASS}`);
    if (!root) {
        const body = container.querySelector('.content-module-body');
        if (!body) return null;

        root = document.createElement('div');
        root.className = `${CONTROL_ROOT_CLASS} layout-stack`;
        container.insertBefore(root, body);
    }

    return root;
}

/**
 * Render (or re-render) the control strip for the current chart.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host the strip belongs to.
 * @param {object} chart - The live chart, which supplies the control model when none is passed.
 * @param {Array<object>|null} [controls] - An explicit control model, for callers that already have one.
 */
function renderComparisonControls(host, chart, controls = null) {
    const root = ensureControlsRoot(host);
    if (!root || !chart) {
        return;
    }

    const controlModel = controls ?? chart.getControlModel?.() ?? [];
    const controlEntries = getMeasuredControlEntries(controlModel, root);
    root.replaceChildren(createControlRow(controlEntries));

    // Every selector in the model decides *what* is compared, so together they decide
    // this host's export target id — `chartType` included, despite its "Diagrammtyp"
    // label: it picks the measured quantity (Kompetenzstufen, Punkte,
    // Selbstwirksamkeit, Unterrichtsqualität), each backed by its own payload, so each
    // is its own card. This is the one place every change passes through, and the
    // chart updates itself without re-rendering the host — hence the resync.
    host.configState.exportSelection = controlModel
        .map((control) => control?.selectedValue)
        .filter((value) => value != null && value !== '')
        .join('-');
    host.syncExportControls();
}

// ============================================================================
// CONFIG DESCRIPTOR
// ============================================================================

/** @type {import('../../../../common/charts/host/chartHostModule.js').ChartHostConfig} */
export const groupComparisonConfig = {
    glossaryPath: 'sl.comparison.comparison-plot',
    defaultOptions: {
        showModuleTitle: true,
        enableModuleExport: true,
    },

    /**
     * One host serves every group pair and metric the selectors offer.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host owning this chart.
     * @returns {string|null} The current selection, which is what distinguishes one exported card from another.
     */
    getExportIdentity(host) {
        return host.configState.exportSelection || null;
    },

    /**
     * Initialize the group comparison chart.
     * Returns a GroupComparisonChart instance so ChartHostModule sets chart.host
     * before calling create(), making the host available during renderer setup.
     * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host whose container the chart draws into.
     * @param {object} data - The domain results plus the self-efficacy, teaching-quality and point payloads the selectors switch between.
     * @returns {GroupComparisonChart|null} The renderer, or `null` when the host's container has already left the DOM.
     */
    createRenderer(host, data) {
        if (!document.getElementById(host.id)) {
            console.warn(
                `GroupComparisonConfig[${host.id}]: Container removed from DOM, skipping render`,
            );
            return null;
        }

        return new GroupComparisonChart(host.id, data.domainResults, {
            comparisonSP: data.comparisonSP || null,
            comparisonTQ: data.comparisonTQ || null,
            comparisonPoints: data.comparisonPoints || null,
            onControlsChanged: (controls, chart) => renderComparisonControls(host, chart, controls),
            onSummaryChanged: (summary, chart) =>
                host.getOption('onComparisonSummaryChanged')?.(summary, chart),
        });
    },

    prepareLayout(host, charts) {
        renderComparisonControls(host, charts?.[0] ?? null);
    },

    onCleanup(host) {
        clearComparisonControls(host);
    },
};
