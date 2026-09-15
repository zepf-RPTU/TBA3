/**
 * GroupComparisonChart — the SL group comparison: two groups on one metric, drawn as
 * a population pyramid.
 *
 * Four chart types (Kompetenzstufen, Lösungsquote, Selbstwirksamkeit,
 * Unterrichtsqualität) share one drawing: `CHART_TYPE_CONFIG` carries a registry row
 * per type and `renderPyramidBars()` draws all of them, so adding a type is a row
 * rather than a renderer.
 */

import { getThemeColors } from '../../../../common/services/themeService.js';
import { chartLayoutPreset } from '../../../../common/charts/chartAxisUtils.js';
import { BarChartRenderer } from '../../../../common/charts/renderers/barChartRenderer.js';
import { motionDuration } from '../../../../common/charts/motionPreference.js';
import { buildCompetencyLevelRows } from './competencyLevelRows.js';
import { buildGroupComparisonSummary } from './groupComparisonSummary.js';
import {
    filterCrossSubjectData,
    extractLevelOrder,
    buildSubjectDomainList,
} from './groupComparisonDataUtils.js';
import { CHART_CONFIG, CHART_TYPE_CONFIG } from './groupComparisonChartTypes.js';
import {
    renderPyramidBars,
    renderXAxes,
    updateAxisLabels,
} from './groupComparisonPyramidRender.js';

// Pure control-decision logic (category validity, default groups, option lists).
import {
    getValidCategoryOptions,
    ensureValidCategory,
    resolveDefaultGroups,
    buildGroupOptions,
    buildControlStateKey,
    buildChartTypeOptions,
} from './groupComparisonControlModel.js';
import { glossaryAnnotator } from '../../../../common/glossary/glossaryAnnotator.js';
import * as d3 from 'd3';

/**
 * Everything the selectors decide, and the chart's whole state — there is exactly one
 * of these per instance, reachable as both `this.state` and the reactive `this._state`.
 * @typedef {object} GroupComparisonSelection
 * @property {string} chartType - Which quantity is measured: ks | points | selfEfficacy | teachingQuality.
 * @property {number} subjectIndex - Index into `_subjectDomainList`.
 * @property {string} category - What the two groups are split by: class | gender | fach.
 * @property {string|null} scopeFilter - A class name, or `null` for the whole school.
 * @property {string|null} group1 - The left group's value in the current category.
 * @property {string|null} group2 - The right group's value in the current category.
 */

/**
 * Group Comparison Chart Class
 *
 * Extends BarChartRenderer to provide population pyramid style comparison charts.
 * Compares two groups across competency levels, point distributions, or rating scales.
 * @augments BarChartRenderer
 */
export class GroupComparisonChart extends BarChartRenderer {
    /**
     * Creates a new GroupComparisonChart instance
     * @param {string} containerId - Container element ID (without #)
     * @param {Array} domainResults - Flat array of domain result objects from DataStore
     * @param {object} options - Configuration options
     * @param {Array} [options.comparisonSP] - Per-student SP data from DataStore
     * @param {Array} [options.comparisonTQ] - Per-student TQ data from DataStore
     * @param {Array} [options.comparisonPoints] - Per-student solution-rate data from DataStore
     * @param {Function} [options.onControlsChanged] - Callback invoked when host controls change
     * @param {Function} [options.onSummaryChanged] - Callback invoked when the summary changes
     */
    constructor(containerId, domainResults, options = {}) {
        super(containerId, {
            defaultWidth: 800,
            defaultHeight: 600,
            autoResize: true,
            ...options,
            layout: chartLayoutPreset('compactNoAxis', {
                axis: { ...CHART_CONFIG.margins },
            }),
        });

        /** @type {Array<object>} */
        this._domainResults = [];
        /** @type {ReturnType<typeof buildSubjectDomainList>} */
        this._subjectDomainList = [];
        /** @type {Array<Array<object>>} */
        this.domainArray = [];
        this.#applyDomainResults(domainResults);

        this.svg = null;

        // JSON-derived comparison data
        this.comparisonSP = options.comparisonSP || null;
        this.comparisonTQ = options.comparisonTQ || null;
        this.comparisonPoints = options.comparisonPoints || null;

        // One state object, not two. `this.state` IS the reactive `_state` built by
        // applyReactiveState() from getInitialState() — aliased, not copied, so the
        // ~85 `this.state.x` reads keep working. The alias holds for the instance's
        // life because setState() only ever Object.assign()s into `_state`.
        // Two objects used to mean a direct write (resetGroupsForCategory) could
        // leave the mirror stale, and setState() then compared the next selection
        // against that stale copy and swallowed the redraw.
        // Holds a GroupComparisonSelection. Annotated `any` rather than with that
        // typedef because it used to hang off the untyped `chartState` bag and was
        // `any` already; tightening it here surfaces ~10 pre-existing nullability
        // gaps in the drawing code, which are not part of this change.
        /** @type {any} */
        this.state = this._state;

        // Cache for optimized updates - stored in chartState for automatic cleanup
        this.chartState.cachedChartData = null;
        this.chartState.cachedFilteredData = null;

        // Dirty-flag for control sync optimization
        this._controlsStateKey = null;
        this._lastAxisMarginKey = null;
        // Memoization cache for getUniqueValuesForCategory / getUniqueScopeValues
        this._uniqueValuesCache = new Map();

        // State management note: the two write styles differ in how they render, not
        // in what they write. group1/group2 go through setState() so _onStateChanged
        // can take the animated transition; the other four are set directly and the
        // caller triggers the full re-render itself via updateSVGInterface().

        // Initialize default state
        this.initializeDefaultState();
    }

    // ========================================================================
    // REACTIVE STATE
    // ========================================================================

    /**
     * The chart's whole selection, not just the reactive half — `this.state` is this
     * object. Runs from the ChartRenderer constructor, before any subclass field
     * exists, so every default is a literal.
     * @returns {GroupComparisonSelection} The initial selection.
     */
    getInitialState() {
        return {
            chartType: 'ks',
            subjectIndex: 0,
            category: 'gender',
            scopeFilter: null,
            group1: null,
            group2: null,
        };
    }

    _onStateChanged(changedKeys, _prevState) {
        if (!this.svg || !this.chartState.cachedChartData) {
            this.refresh();
            return;
        }

        if (changedKeys.includes('group1') || changedKeys.includes('group2')) {
            // Fach+KS: group change means different subjects → need full re-filter
            if (this.state.category === 'fach' && this.state.chartType === 'ks') {
                this.updateSVGInterface(this.svg);
                return;
            }
            const handled = this.#animateGroupChange();
            if (!handled) {
                this.updateSVGInterface(this.svg);
            } else {
                this.#notifyControlsChanged({ force: true });
            }
            return;
        }

        this.refresh();
    }

    /**
     * Validates that required data is present
     * @returns {boolean} True if data is valid
     */
    validateData() {
        if (!this.domainArray || this.domainArray.length === 0) {
            console.warn('[GroupComparisonChart] No domain data provided');
            return false;
        }
        return true;
    }

    /**
     * Format tooltip content for group comparison chart segments
     * @override
     * @param {object} segment - The data segment with group, level/bucket, count, percentage
     * @param {object} context - Additional context (chartType: 'ks' | 'points' | 'selfEfficacy' | 'teachingQuality')
     * @returns {string} HTML content for tooltip
     */
    formatTooltipContent(segment, context = {}) {
        const { chartType = 'ks' } = context;

        if (chartType === 'selfEfficacy' || chartType === 'teachingQuality') {
            // Rating tooltip format (self-efficacy and teaching quality)
            return this.buildTooltipHTML({
                title: segment.group,
                rows: [
                    {
                        label: segment.dataType,
                        value: `${segment.bucket} (${segment.description})`,
                    },
                    { label: 'Anzahl', value: segment.count },
                    { label: 'Anteil', value: `${segment.percentage}%` },
                ],
            });
        } else {
            // Competency/points tooltip format
            const rows = [
                {
                    label: chartType === 'points' ? 'Lösungsquote' : 'Kompetenzstufe',
                    value: segment.level,
                },
            ];
            if (segment.count !== undefined) {
                rows.push({ label: 'Anzahl', value: segment.count });
            }
            if (segment.percentage !== undefined) {
                rows.push({ label: 'Anteil', value: `${segment.percentage}%` });
            }
            return this.buildTooltipHTML({
                title: segment.group,
                rows,
            });
        }
    }

    /**
     * Animate bar width/position changes when groups are swapped
     * @returns {boolean} True if animation was applied
     */
    #animateGroupChange() {
        const g = this.g.select('.chart-content');
        if (g.empty()) return false;

        const duration = motionDuration(BarChartRenderer.TRANSITION_DURATION);
        const chartType = this.state.chartType;
        const config = CHART_TYPE_CONFIG[chartType];

        if (!config || chartType === 'points') return false;

        // Re-run only the preparer with new group values (filtered data is cached)
        const filteredData = this.chartState.cachedFilteredData;
        if (!filteredData?.length) return false;

        let newChartData;
        try {
            newChartData = config.dataPreparer(
                filteredData,
                this.state.category,
                this.state.group1,
                this.state.group2,
                ...config.getPreparerExtraArgs(this),
            );
        } catch (e) {
            console.warn('[GroupComparisonChart] Error calculating new data:', e);
            return false;
        }

        if (!newChartData) return false;

        // Cache the new data
        this.chartState.cachedChartData = newChartData;

        // Competency charts use per-row segment groups; a partial-update animation
        // here would duplicate large amounts of segment-rendering logic. A full
        // re-render is fast and visually acceptable, so opt out.
        if (chartType === 'ks') {
            return false;
        }

        const layout = this.layout;
        if (!layout) return false;

        // Get chart dimensions from layout
        const chartWidth = layout.chart.width;
        const centerX = chartWidth / 2;
        const maxBarWidth = centerX - CHART_CONFIG.barMargin;

        // Calculate new percentages
        const group1Percentages = newChartData.group1.map((count) =>
            newChartData.group1Count > 0 ? (count / newChartData.group1Count) * 100 : 0,
        );
        const group2Percentages = newChartData.group2.map((count) =>
            newChartData.group2Count > 0 ? (count / newChartData.group2Count) * 100 : 0,
        );

        const xScale = d3.scaleLinear().domain([0, 100]).range([0, maxBarWidth]);

        // Determine CSS class prefix (must match renderPyramidBars)
        const isRatingChart = chartType === 'selfEfficacy' || chartType === 'teachingQuality';
        const classPrefix = isRatingChart
            ? chartType === 'selfEfficacy'
                ? 'self-efficacy'
                : 'teaching-quality'
            : '';
        const g1Class = classPrefix ? `${classPrefix}-group1-bar` : 'group1-bar';
        const g2Class = classPrefix ? `${classPrefix}-group2-bar` : 'group2-bar';

        // Animate group1 bars (extending left from center)
        g.selectAll(`.${g1Class}`)
            .data(newChartData.levels || newChartData.points || newChartData.buckets)
            .transition()
            .duration(duration)
            .attr('x', (d, i) => centerX - xScale(group1Percentages[i]))
            .attr('width', (d, i) => xScale(group1Percentages[i]));

        // Animate group2 bars (extending right from center)
        g.selectAll(`.${g2Class}`)
            .data(newChartData.levels || newChartData.points || newChartData.buckets)
            .transition()
            .duration(duration)
            .attr('width', (d, i) => xScale(group2Percentages[i]));

        // Use layout chart height for axis label positioning
        const chartHeight = layout.chart.height;

        // Re-render x-axes with new scale
        g.selectAll('.left-x-axis, .right-x-axis').remove();
        renderXAxes(g, centerX, maxBarWidth, chartHeight, 100);

        // Update axis labels with animated text
        updateAxisLabels(g, centerX, maxBarWidth, chartHeight, newChartData, this, {
            animate: true,
            duration,
        });

        return true;
    }

    /**
     * Applies scope filter to pre-filter data by class.
     * Vergleichsebene selects a class; when set, keeps only students from that class.
     * @param {Array} data - Filtered data array (items have 'gender' and 'class' fields)
     * @returns {Array} Scope-filtered data, or original data if no scope filter is set
     */
    #applyScopeFilter(data) {
        if (!this.state.scopeFilter || !data) return data;
        return data.filter((item) => item.class === this.state.scopeFilter);
    }

    /**
     * Adopts a new payload: the flat rows, the Fach/Domäne list derived from them, and
     * a grouped domainArray (2D) for rendering code that indexes by subjectIndex.
     * @param {Array} domainResults - Flat array of domain result objects from DataStore.
     */
    #applyDomainResults(domainResults) {
        this._domainResults = domainResults || [];
        this._subjectDomainList = buildSubjectDomainList(this._domainResults);
        this.domainArray = this._subjectDomainList.map((sd) =>
            this._domainResults.filter(
                (r) => r.fach === sd.subjectName && r.domaene === sd.domainId,
            ),
        );
    }

    /**
     * Count how many domains a subject has (from the subject+domain list).
     * @param {string} subjectName - The Fach to count.
     * @returns {number} How many Domänen it has.
     */
    #domainCountForSubject(subjectName) {
        return this._subjectDomainList.filter((sd) => sd.subjectName === subjectName).length;
    }

    /**
     * Returns a { subjectName, domainId } selector for a given subject name.
     * Uses the first matching entry from the subject–domain list.
     * @param {string} subjectName - The Fach to select.
     * @returns {import('./groupComparisonDataUtils.js').SubjectDomainSelector|null} The selector, or `null` when the Fach is not in the list.
     */
    #selectorForSubject(subjectName) {
        const sd = this._subjectDomainList.find((s) => s.subjectName === subjectName);
        return sd ? { subjectName: sd.subjectName, domainId: sd.domainId } : null;
    }

    /**
     * The info box's view of what is on screen. It reads `cachedFilteredData` — the
     * rows this chart just drew — so the sentence cannot describe a different
     * population than the picture; the summary module used to re-run the filter
     * pipeline from the raw payloads to answer the same question.
     *
     * The cache is `null` between `updateChart()` clearing it and the render filling
     * it, and stays `null` when the render bails out — no layout or no data — both
     * mean "nothing drawn", which is what the summary reports for an empty row set anyway.
     * @returns {object} The display-shaped summary.
     */
    getCurrentSummary() {
        return buildGroupComparisonSummary({
            chartType: this.state.chartType,
            category: this.state.category,
            group1Value: this.state.group1,
            group2Value: this.state.group2,
            filteredData: this.chartState.cachedFilteredData,
        });
    }

    setData(domainResults) {
        this.#applyDomainResults(domainResults);
        // Clear all caches when underlying data changes
        this._uniqueValuesCache.clear();
        this.chartState.cachedChartData = null;
        this.chartState.cachedFilteredData = null;
        this._controlsStateKey = null;
        this._lastAxisMarginKey = null;
        this.initializeDefaultState();
    }

    initializeDefaultState() {
        if (this.domainArray && this.domainArray.length > 0) {
            // Set default subject
            this.state.subjectIndex = 0;
            this.state.scopeFilter = null;

            // Set default groups based on available data
            const selectedDomainGroup = this.domainArray[this.state.subjectIndex];
            if (selectedDomainGroup && selectedDomainGroup.length > 0) {
                const uniqueValues = this.getUniqueValuesForCategory(
                    selectedDomainGroup,
                    this.state.category,
                );
                this.resetGroupsForCategory(uniqueValues);
            }
        }
    }

    #getSelectedDomainGroup() {
        return this.domainArray?.[this.state.subjectIndex] || null;
    }

    #resetGroupsForCurrentCategory() {
        const selectedDomainGroup = this.#getSelectedDomainGroup();
        const uniqueValues = this.getUniqueValuesForCategory(
            selectedDomainGroup,
            this.state.category,
        );
        this.resetGroupsForCategory(uniqueValues);
    }

    /**
     * Resets group1 and group2 based on unique values and current category.
     * For gender: prefers female and male, with the letter spellings as fallbacks.
     * For fach: defaults to current subject + first other.
     * Ensures group1 !== group2 when possible.
     * @param {Array} uniqueValues - Array of unique category values
     */
    resetGroupsForCategory(uniqueValues) {
        const groups = resolveDefaultGroups(uniqueValues, {
            category: this.state.category,
            currentSubjectName: this._subjectDomainList[this.state.subjectIndex]?.subjectName,
        });
        if (groups) {
            this.state.group1 = groups.group1;
            this.state.group2 = groups.group2;
        }
    }

    #buildSubjectControl() {
        const isSelfEfficacy = this.state.chartType === 'selfEfficacy';
        const isTeachingQuality = this.state.chartType === 'teachingQuality';
        const isFachCategory = this.state.category === 'fach';

        if (isFachCategory) {
            return {
                disabled: true,
                selectedValue: String(this.state.subjectIndex),
                options: [{ value: String(this.state.subjectIndex), text: '—' }],
            };
        }

        if (isSelfEfficacy) {
            return {
                disabled: true,
                selectedValue: '0',
                options: [{ value: '0', text: 'Nicht fachspezifisch' }],
            };
        }

        if (isTeachingQuality) {
            const seenSubjects = new Set();
            const options = this._subjectDomainList.flatMap((sd, index) => {
                if (seenSubjects.has(sd.subjectName)) return [];
                seenSubjects.add(sd.subjectName);
                return [{ value: String(index), text: sd.subjectName }];
            });

            const currentSubjectName =
                this._subjectDomainList[this.state.subjectIndex]?.subjectName;
            const selectedOption =
                options.find((option) => {
                    const optionIndex = Number.parseInt(option?.value ?? '', 10);
                    return this._subjectDomainList[optionIndex]?.subjectName === currentSubjectName;
                }) || options[0];

            return {
                disabled: false,
                selectedValue: selectedOption?.value ?? '0',
                options,
            };
        }

        return {
            disabled: false,
            selectedValue: String(this.state.subjectIndex),
            options: this._subjectDomainList.map((sd, index) => {
                const subjectLabel = sd.subjectName;
                const hasSingleDomain = this.#domainCountForSubject(sd.subjectName) === 1;
                const domainLabel = hasSingleDomain
                    ? subjectLabel
                    : `${subjectLabel}: ${sd.domainName}`;
                return { value: String(index), text: domainLabel };
            }),
        };
    }

    /**
     * The selectors, in strip order — and the only home of the control-id vocabulary.
     * Each entry carries its own `apply`, so a caller dispatches a change without
     * knowing which ids exist (the same shape `slHeaderControls.js` uses).
     *
     * Every control here is an *identity* control: it decides what is compared, not
     * how one comparison is drawn. `chartType` counts despite its "Diagrammtyp" label
     * — it picks the measured quantity (Kompetenzstufen, Punkte, Selbstwirksamkeit,
     * Unterrichtsqualität), each backed by its own payload, so each is its own card.
     * That is why the whole model feeds the host's export identity.
     * @returns {Array<{id: string, label: string, selectedValue: string|null, options: Array<{value: string, text: string}>, disabled?: boolean, apply: (value: string) => void}>} One descriptor per selector.
     */
    getControlModel() {
        const subjectControl = this.#buildSubjectControl();
        const scopeOptions = [
            { value: '__all__', text: 'Schule' },
            ...this.getUniqueScopeValues().map((value) => ({ value, text: value })),
        ];
        const selectedDomainGroup = this.#getSelectedDomainGroup();
        const uniqueValues = this.getUniqueValuesForCategory(
            selectedDomainGroup,
            this.state.category,
        );

        return [
            {
                id: 'chartType',
                label: 'Diagrammtyp',
                selectedValue: this.state.chartType,
                options: buildChartTypeOptions({
                    hasPoints: (this.comparisonPoints?.length ?? 0) > 0,
                    hasSelfEfficacy: (this.comparisonSP?.length ?? 0) > 0,
                    hasTeachingQuality: (this.comparisonTQ?.length ?? 0) > 0,
                }),
                apply: (value) => this.#applyChartTypeSelection(value),
            },
            {
                id: 'subjectIndex',
                label: 'Fach/Domäne',
                selectedValue: subjectControl.selectedValue,
                options: subjectControl.options,
                disabled: subjectControl.disabled,
                apply: (value) => this.#applySubjectSelection(value),
            },
            {
                id: 'scopeFilter',
                label: 'Vergleichsebene',
                selectedValue: this.state.scopeFilter || '__all__',
                options: scopeOptions,
                apply: (value) => this.#applyScopeSelection(value),
            },
            {
                id: 'category',
                label: 'Kategorie',
                selectedValue: this.state.category,
                options: getValidCategoryOptions({
                    scopeFilter: this.state.scopeFilter,
                    chartType: this.state.chartType,
                }),
                apply: (value) => this.#applyCategorySelection(value),
            },
            {
                id: 'group1',
                label: 'Gruppe 1',
                selectedValue: this.state.group1,
                options: buildGroupOptions(uniqueValues, this.state.group2, this.state.category),
                apply: (value) => this.#applyGroup1Selection(value),
            },
            {
                id: 'group2',
                label: 'Gruppe 2',
                selectedValue: this.state.group2,
                options: buildGroupOptions(uniqueValues, this.state.group1, this.state.category),
                apply: (value) => this.#applyGroup2Selection(value),
            },
        ];
    }

    #applyChartTypeSelection(newValue) {
        const previousType = this.state.chartType;
        this.state.chartType = newValue;

        if (previousType !== newValue) {
            const previousCategory = this.state.category;
            this.#ensureValidCategory();
            if (this.state.category !== previousCategory) {
                this.#resetGroupsForCurrentCategory();
            }
        }

        this.updateSVGInterface(this.svg);
    }

    #applySubjectSelection(newValue) {
        if (this.state.chartType === 'selfEfficacy' || this.state.category === 'fach') {
            return;
        }

        const nextSubjectIndex = Number.parseInt(newValue, 10);
        if (Number.isNaN(nextSubjectIndex)) {
            return;
        }

        this.state.subjectIndex = nextSubjectIndex;
        const previousCategory = this.state.category;
        this.#ensureValidCategory();
        if (this.state.category !== previousCategory) {
            this.#resetGroupsForCurrentCategory();
        }

        this.updateSVGInterface(this.svg);
    }

    #applyScopeSelection(newValue) {
        this.state.scopeFilter = newValue === '__all__' ? null : newValue;

        const previousCategory = this.state.category;
        this.#ensureValidCategory();
        if (this.state.category !== previousCategory) {
            this.#resetGroupsForCurrentCategory();
        }

        this.updateSVGInterface(this.svg);
    }

    #applyCategorySelection(newValue) {
        this.state.category = newValue;
        this.#resetGroupsForCurrentCategory();
        this.updateSVGInterface(this.svg);
    }

    #applyGroup1Selection(newValue) {
        const selectedDomainGroup = this.#getSelectedDomainGroup();
        const uniqueValues = this.getUniqueValuesForCategory(
            selectedDomainGroup,
            this.state.category,
        );
        let newGroup2 = this.state.group2;

        if (newValue === newGroup2) {
            newGroup2 = uniqueValues.find((value) => value !== newValue) || newGroup2;
        }

        this.setState({ group1: newValue, group2: newGroup2 });
    }

    #applyGroup2Selection(newValue) {
        const selectedDomainGroup = this.#getSelectedDomainGroup();
        const uniqueValues = this.getUniqueValuesForCategory(
            selectedDomainGroup,
            this.state.category,
        );
        let newGroup1 = this.state.group1;

        if (newValue === newGroup1) {
            newGroup1 = uniqueValues.find((value) => value !== newValue) || newGroup1;
        }

        this.setState({ group1: newGroup1, group2: newValue });
    }

    #pointEntryMatchesCurrentSubjectDomain(entry) {
        const selected = this._subjectDomainList[this.state.subjectIndex];
        if (!selected) return false;

        return (
            entry?.subject === selected.subjectName &&
            (entry?.domainId ?? null) === (selected.domainId ?? null)
        );
    }

    getUniqueValuesForCategory(domainGroup, category) {
        const cacheKey = `uv|${this.state.chartType}|${this.state.subjectIndex}|${category}|${this.state.scopeFilter}`;
        if (this._uniqueValuesCache.has(cacheKey)) return this._uniqueValuesCache.get(cacheKey);

        const allValues = new Set();
        const scopeFilter = this.state.scopeFilter;

        if (category === 'fach') {
            // Return unique subject names available in the scope
            if (this.state.chartType === 'points') {
                if (this.comparisonPoints) {
                    for (const entry of this.comparisonPoints) {
                        if (scopeFilter && entry.class !== scopeFilter) continue;
                        if (entry.subject) allValues.add(entry.subject);
                    }
                }
            } else if (this.state.chartType === 'teachingQuality') {
                if (this.comparisonTQ) {
                    for (const entry of this.comparisonTQ) {
                        if (scopeFilter && entry.class !== scopeFilter) continue;
                        if (entry.subject) allValues.add(entry.subject);
                    }
                }
            } else {
                // For ks: collect subject names from domainResults filtered by scope
                for (const r of this._domainResults) {
                    if (scopeFilter && r.summedResults) {
                        const hasStudentsInClass = r.summedResults.some(
                            (s) => s.stammklasse === scopeFilter,
                        );
                        if (!hasStudentsInClass) continue;
                    }
                    if (r.fach) allValues.add(r.fach);
                }
            }
        } else if (this.state.chartType === 'points') {
            if (this.comparisonPoints) {
                for (const entry of this.comparisonPoints) {
                    if (!this.#pointEntryMatchesCurrentSubjectDomain(entry)) continue;
                    if (scopeFilter && entry.class !== scopeFilter) continue;
                    if (category === 'gender' && entry.gender) allValues.add(entry.gender);
                    else if (category === 'class' && entry.class) allValues.add(entry.class);
                }
            }
        } else if (this.state.chartType === 'selfEfficacy') {
            if (this.comparisonSP) {
                for (const entry of this.comparisonSP) {
                    if (scopeFilter && entry.class !== scopeFilter) continue;
                    if (category === 'gender' && entry.gender) allValues.add(entry.gender);
                    else if (category === 'class' && entry.class) allValues.add(entry.class);
                }
            }
        } else if (this.state.chartType === 'teachingQuality') {
            if (this.comparisonTQ) {
                for (const entry of this.comparisonTQ) {
                    if (scopeFilter && entry.class !== scopeFilter) continue;
                    if (category === 'gender' && entry.gender) allValues.add(entry.gender);
                    else if (category === 'class' && entry.class) allValues.add(entry.class);
                }
            }
        } else {
            // For ks: iterate all domain groups (not just selected one) when category='class' at school scope
            const groups = category === 'class' && !scopeFilter ? this.domainArray : [domainGroup];
            for (const group of groups) {
                if (!group) continue;
                for (const domain of group) {
                    if (domain.summedResults) {
                        for (const student of domain.summedResults) {
                            if (scopeFilter && student.stammklasse !== scopeFilter) continue;
                            if (category === 'gender') {
                                if (student.gender) allValues.add(student.gender);
                            } else if (category === 'class') {
                                if (student.stammklasse) allValues.add(student.stammklasse);
                            }
                        }
                    }
                }
            }
        }
        const result = Array.from(allValues).sort();
        this._uniqueValuesCache.set(cacheKey, result);
        return result;
    }

    /**
     * Returns unique class names for the Vergleichsebene control.
     * Always returns classes regardless of current category.
     * @returns {Array} Sorted array of unique class names
     */
    getUniqueScopeValues() {
        const cacheKey = `sv|${this.state.chartType}|${this.state.subjectIndex}`;
        if (this._uniqueValuesCache.has(cacheKey)) return this._uniqueValuesCache.get(cacheKey);

        const allValues = new Set();

        if (this.state.chartType === 'selfEfficacy') {
            if (this.comparisonSP) {
                for (const entry of this.comparisonSP) {
                    if (entry.class) allValues.add(entry.class);
                }
            }
        } else if (this.state.chartType === 'points') {
            if (this.comparisonPoints) {
                for (const entry of this.comparisonPoints) {
                    if (entry.class) allValues.add(entry.class);
                }
            }
        } else if (this.state.chartType === 'teachingQuality') {
            if (this.comparisonTQ) {
                for (const entry of this.comparisonTQ) {
                    if (entry.class) allValues.add(entry.class);
                }
            }
        } else {
            const domainGroup = this.domainArray[this.state.subjectIndex];
            if (domainGroup) {
                domainGroup.forEach((domain) => {
                    if (domain.summedResults) {
                        domain.summedResults.forEach((student) => {
                            if (student.stammklasse) allValues.add(student.stammklasse);
                        });
                    }
                });
            }
        }

        const scopeResult = Array.from(allValues).sort();
        this._uniqueValuesCache.set(cacheKey, scopeResult);
        return scopeResult;
    }

    #notifyControlsChanged({ force = false } = {}) {
        const nextKey = buildControlStateKey(this.state);
        if (!force && nextKey === this._controlsStateKey) {
            return;
        }

        this._controlsStateKey = nextKey;
        const summary = this.getCurrentSummary();
        this.options.onSummaryChanged?.(summary, this);
        this.options.onControlsChanged?.(this.getControlModel(), this);
    }

    renderChart() {
        this.#syncAxisMargins();
        const { svg, g } = this.initializeSVG({});
        this.svg = svg;
        this.g = g;
        svg.style('background', getThemeColors().chrome.surface);

        // Force control sync on fresh render
        this._controlsStateKey = null;
        this._lastAxisMarginKey = this.#getAxisMarginKey();

        // Update the interface with current state
        this.updateSVGInterface(svg);
    }

    updateSVGInterface(svg) {
        void svg;

        this.updateChart();
        this.#notifyControlsChanged();
    }

    /**
     * Ensures current category is valid for scope + chartType. Auto-resets if not.
     */
    #ensureValidCategory() {
        this.state.category = ensureValidCategory(this.state.category, {
            scopeFilter: this.state.scopeFilter,
            chartType: this.state.chartType,
        });
    }

    updateChart() {
        this.g.selectAll('*').remove();
        // The picture is gone, so the rows behind it go too: the summary reads this
        // cache, and a bail-out below must not leave it describing the previous render.
        this.chartState.cachedChartData = null;
        this.chartState.cachedFilteredData = null;

        const previousMarginKey = this._lastAxisMarginKey;
        this.#syncAxisMargins();
        const nextMarginKey = this.#getAxisMarginKey();

        if (previousMarginKey !== nextMarginKey) {
            this.computeLayout();
            this._lastAxisMarginKey = nextMarginKey;
        }
        const layout = this.layout;
        if (!layout) return;
        this.g.attr('transform', `translate(${layout.chart.x}, ${layout.chart.y})`);

        // Use unified render method
        this.renderChartByType(this.g, layout.chart.width, layout.chart.height);
    }

    #syncAxisMargins() {
        const margins = this.#resolveAxisMargins();
        this.options.layout.axis.left = margins.left;
        this.options.layout.axis.right = margins.right;
        this.options.layout.axis.top = margins.top;
        this.options.layout.axis.bottom = margins.bottom;
    }

    #resolveAxisMargins() {
        if (this.state.chartType !== 'points') {
            return CHART_CONFIG.margins;
        }

        const containerWidth =
            this.dimensions?.containerWidth ??
            this.layout?.container?.width ??
            this.options.defaultWidth;
        const horizontalMargin = Math.max(80, Math.min(150, containerWidth * 0.2));
        return {
            ...CHART_CONFIG.margins,
            left: horizontalMargin,
            right: horizontalMargin,
        };
    }

    #getAxisMarginKey() {
        const axis = this.options.layout.axis;
        return `${axis.top}|${axis.right}|${axis.bottom}|${axis.left}`;
    }

    /**
     * Unified method to render any chart type using CHART_TYPE_CONFIG
     * @param {object} chartGroup - D3 SVG group selection
     * @param {number} width - Chart width
     * @param {number} height - Chart height
     */
    renderChartByType(chartGroup, width, height) {
        const chartType = this.state.chartType;
        const config = CHART_TYPE_CONFIG[chartType];

        if (!config) {
            this.renderNoDataMessage(
                chartGroup,
                width,
                height,
                `Unbekannter Chart-Typ: ${chartType}`,
            );
            return;
        }

        // Validate data source via config
        const dataSource = config.getDataSource(this);
        if (!dataSource?.length) {
            this.renderNoDataMessage(chartGroup, width, height, config.noDataMessage);
            return;
        }

        // Filter data using config-driven arguments
        let filteredData;
        if (this.state.category === 'fach' && chartType === 'ks') {
            // Cross-subject comparison: merge data from both subjects
            const s1 = this.#selectorForSubject(this.state.group1);
            const s2 = this.#selectorForSubject(this.state.group2);
            filteredData = s1 && s2 ? filterCrossSubjectData(dataSource, s1, s2) : null;
        } else if (this.state.category === 'fach' && chartType === 'teachingQuality') {
            // Cross-subject TQ: don't filter by subject so both are present
            filteredData = config.dataFilter(dataSource, null);
        } else if (this.state.category === 'fach' && chartType === 'points') {
            // Cross-subject points: sum all domains per student+subject before comparing subjects
            filteredData = config.dataFilter(dataSource, null, { aggregateBySubject: true });
        } else {
            filteredData = config.dataFilter(dataSource, ...config.getFilterArgs(this));
        }

        // Apply scope filter (pre-filter by selected class)
        filteredData = this.#applyScopeFilter(filteredData);

        if (!filteredData?.length) {
            this.renderNoDataMessage(chartGroup, width, height, config.noDataMessage);
            return;
        }

        // Cache filtered data so #animateGroupChange() can skip re-filtering
        this.chartState.cachedFilteredData = filteredData;

        // Prepare chart data using config-driven extra args
        let preparerExtraArgs;
        if (this.state.category === 'fach' && chartType === 'ks') {
            // Cross-subject KS: build one normalized row model for both subjects.
            const s1 = this.#selectorForSubject(this.state.group1);
            const s2 = this.#selectorForSubject(this.state.group2);
            const order1 = (s1 && extractLevelOrder(this._domainResults, s1)) || { order: [] };
            const order2 = (s2 && extractLevelOrder(this._domainResults, s2)) || { order: [] };
            preparerExtraArgs = [buildCompetencyLevelRows([order1, order2])];
        } else {
            preparerExtraArgs = config.getPreparerExtraArgs(this);
        }
        const chartData = config.dataPreparer(
            filteredData,
            this.state.category,
            this.state.group1,
            this.state.group2,
            ...preparerExtraArgs,
        );

        // Validate chart data
        if (chartData.group1.length === 0 && chartData.group2.length === 0) {
            this.renderNoDataMessage(
                chartGroup,
                width,
                height,
                glossaryAnnotator.getRequiredEntryText(
                    'sl.comparison.comparison-plot.messages.no-groups',
                ),
            );
            return;
        }

        // Cache the prepared data so #animateGroupChange() can use optimized updates
        this.chartState.cachedChartData = chartData;

        // Render using unified pyramid bars
        renderPyramidBars(chartGroup, width, height, chartData, chartType, this);
    }

    /**
     * Renders a "no data available" message in the chart area
     * @param {d3.Selection} chartGroup - The plot group the overlay covers.
     * @param {number} chartWidth - Plot width in px.
     * @param {number} chartHeight - Plot height in px.
     * @param {string} message - What to tell the reader; each cause has its own sentence.
     */
    renderNoDataMessage(chartGroup, chartWidth, chartHeight, message) {
        this.renderNoDataOverlay(chartGroup, {
            className: 'no-data-overlay chart-content',
            width: chartWidth,
            height: chartHeight,
            fill: getThemeColors().chrome.textSecondary,
            message,
        });
    }
}
