import { TaskRingChart } from './taskRingBase.js';
import {
    getTaskRingChartDefinitions,
    resolveDefaultDomain,
    resolveTaskRingGrid,
} from './taskRingGridLayout.js';
import {
    ensureTaskRingGridLayoutStyle,
    releaseTaskRingGridLayout,
} from './taskRingGridStyleSheet.js';
import { ensureHeaderActionButton } from '../../../../common/charts/host/chartHeaderControls.js';
import { resizeService } from '@tba3/module-base/services/resizeService.js';
import { arraysEqual } from './arrays.js';
import { iconSvg } from '@tba3/module-base/utils/icons.js';
import { findOwningModuleTitle, markScrollRegion } from '../../../../common/utils/scrollRegion.js';
import * as d3 from 'd3';
import { glossaryAnnotator } from '../../../../common/glossary/glossaryAnnotator.js';
import { getThemeColors } from '../../../../common/services/themeService.js';

const RESIZE_DEBOUNCE_MS = 150;
const INNER_RING_TOGGLE_SELECTOR = '[data-header-action-button="inner-ring"]';

/**
 * Hand a domain selection to the host's `onDomainSelected` option.
 * @param {string|null} domainId - The Leitidee that was selected; one the payload does not carry reports nothing.
 * @param {Array<{domain: string, domainLabel: string}>} domains - The declared Leitideen.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host whose option receives the selection.
 * @param {boolean} [defer] - Report on the next frame, so a selection made during a render does not re-enter it.
 */
function publishDomainSelection(domainId, domains, host, defer = false) {
    const domainData = domains.find((d) => d.domain === domainId);
    const onDomainSelected = host.getOption('onDomainSelected');
    if (!domainData || typeof onDomainSelected !== 'function') return;

    const report = () => onDomainSelected(domainId);

    if (defer) host.resources.trackTimeout(report, 0);
    else report();
}

/**
 * Resolve the live render body for task-ring grids.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host the grid belongs to.
 * @returns {HTMLElement|null} The body to render into, or `null` once the host is destroyed or detached.
 */
function getLiveTaskRingContainer(host) {
    const container =
        host.contentContainer instanceof HTMLElement ? host.contentContainer : host.container;

    if (!(container instanceof HTMLElement) || host.destroyed || !container.isConnected) {
        return null;
    }

    return container;
}

/**
 * Controller for task-ring grid orchestration.
 * Keeps layout, resize, selection, and lazy render guards local to the task-ring feature
 * without expanding the ChartHost config object.
 */
class TaskRingGridController {
    /**
     * @type {number} The creation request allowed to land. create() and cleanup()
     * each take the next id, so the requestAnimationFrame callback of a superseded
     * request sees a mismatch and draws nothing.
     */
    #requestId = 0;

    constructor(host) {
        this.host = host;
    }

    get state() {
        return this.host.configState;
    }

    async create(data) {
        const host = this.host;
        const { itemArray, studentArray, domains } = data;
        // A payload that names a selection owns it; one that omits the key (the
        // overview's) keeps whatever is highlighted. The host re-renders
        // on a KS theme switch with the mount payload, so reading `null` here would
        // drop a KS-level highlight — and `lastFilterLevel` would then swallow the
        // click that re-applies the same level.
        const selectedStudents =
            data.selectedStudents !== undefined
                ? data.selectedStudents
                : (this.state.lastSelectedStudents ?? null);

        // Taken before the empty-data return too: whatever a previous frame
        // callback would have drawn is stale either way.
        const requestId = this.#nextRequestId();

        if (!itemArray?.length || !domains?.length) {
            resizeService.removeByScope(host.id);
            releaseTaskRingGridLayout(host, getLiveTaskRingContainer(host));
            return new TaskRingChart(host.id, [], studentArray || [], { scopeId: host.id });
        }

        const state = this.state;
        state.itemArray = itemArray;
        state.studentArray = studentArray;
        state.domains = domains;
        state.lastSelectedStudents = selectedStudents;
        state.innerRingVisible =
            state.innerRingVisible ?? host.getOption('defaultInnerRingVisible');

        // A seeded Leitidee (the chart-only views pass the app-state one) wins over
        // the previous selection; both fall back to the first populated ring.
        const chartDefs = getTaskRingChartDefinitions(domains, itemArray);
        state.selectedDomain = resolveDefaultDomain(
            chartDefs,
            data.selectedDomain ?? state.selectedDomain,
        );

        return new Promise((resolve) => {
            requestAnimationFrame(() => {
                try {
                    resolve(
                        this.#createAfterFrame({
                            chartDefs,
                            itemArray,
                            studentArray,
                            domains,
                            selectedStudents,
                            requestId,
                        }),
                    );
                } catch (error) {
                    console.error(
                        `TaskRingGridController[${host.id}]: render setup failed:`,
                        error,
                    );
                    resolve([]);
                }
            });
        });
    }

    async update(charts, data) {
        const state = this.state;
        const onlyStudentsChanged =
            (!data.itemArray || data.itemArray === state.itemArray) &&
            (!data.studentArray || data.studentArray === state.studentArray) &&
            (!data.domains || data.domains === state.domains) &&
            data.selectedStudents !== undefined &&
            !arraysEqual(data.selectedStudents, state.lastSelectedStudents);

        if (onlyStudentsChanged && charts.length > 0) {
            for (const chart of charts) {
                chart.setState({ selectedStudents: data.selectedStudents });
            }
            state.lastSelectedStudents = data.selectedStudents;
            if (data.selectedDomain) this.selectDomain(data.selectedDomain);
            return;
        }

        if (data.itemArray) state.itemArray = data.itemArray;
        if (data.studentArray) state.studentArray = data.studentArray;
        if (data.domains) state.domains = data.domains;
        if (data.selectedStudents !== undefined) state.lastSelectedStudents = data.selectedStudents;
        // Re-validated against the new rings by create() (via the rerender).
        if (data.selectedDomain) state.selectedDomain = data.selectedDomain;

        await this.#rerenderFromState();
    }

    /**
     * Select a Leitidee the way a ring click does, without reporting it: the
     * caller already knows. Nothing changes for a ring that is already selected
     * or that cannot be selected (an empty Leitidee, a grid without
     * `enableDomainSelection`).
     * @param {string|null} domainId - The Leitidee to select.
     * @returns {boolean} Whether the selection moved.
     */
    selectDomain(domainId) {
        const state = this.state;
        if (!domainId || state.selectedDomain === domainId) return false;

        const container = getLiveTaskRingContainer(this.host);
        if (!container) return false;

        const target = container.querySelector(
            `.task-ring-chart-item--selectable[data-domain="${domainId}"]`,
        );
        if (!target) return false;

        for (const item of container.querySelectorAll('.task-ring-chart-item')) {
            item.classList.remove('domain-ring-highlight', 'selected');
        }
        target.classList.remove('hover');
        target.classList.add('domain-ring-highlight', 'selected');
        state.selectedDomain = domainId;
        return true;
    }

    cleanup() {
        this.#nextRequestId();
        resizeService.removeByScope(this.host.id);
        releaseTaskRingGridLayout(this.host, getLiveTaskRingContainer(this.host));
    }

    updateSelectedStudentsOptimized(selectedStudents) {
        if (!this.host.charts?.length) return false;

        for (const chart of this.host.charts) {
            chart.setState({ selectedStudents });
        }
        this.state.lastSelectedStudents = selectedStudents;
        // The selection is part of this host's export identity and this path
        // never re-renders through the host, so nothing else resyncs. It lives
        // here rather than in the publicAPI wrapper because handleKsLevelFilter
        // calls this method directly.
        this.host.syncExportControls();
        return true;
    }

    /**
     * KS-level filter from the ksDistribution chart. Resolves the level to a
     * student slice from the immutable studentArray and applies it reactively
     * via setState. Deduped by level so repeated calls for the same level do no work.
     * @param {string|null} level - The Kompetenzstufe to highlight, or null to clear
     */
    setKsLevelFilter(level) {
        level = level ?? null;
        const state = this.state;
        if (state.lastFilterLevel === level) return;
        state.lastFilterLevel = level;

        const studentArray = state.studentArray || [];
        const filtered = level ? studentArray.filter((s) => s.ks === level) : null;
        this.updateSelectedStudentsOptimized(filtered);
    }

    toggleInnerRingVisibility() {
        const newVis = !this.state.innerRingVisible;
        this.state.innerRingVisible = newVis;

        for (const chart of this.host.charts) {
            chart.setState({ innerRingVisible: newVis });
        }

        const button = this.host.headerActionsContainer?.querySelector(INNER_RING_TOGGLE_SELECTOR);
        if (button) {
            syncInnerRingToggleButton(button, newVis);
        }
    }

    #createAfterFrame({
        chartDefs,
        itemArray,
        studentArray,
        domains,
        selectedStudents,
        requestId,
    }) {
        const host = this.host;

        if (requestId !== this.#requestId) {
            return [];
        }

        const container = getLiveTaskRingContainer(host);
        if (!container) {
            return [];
        }

        const containerSel = d3.select(container);
        containerSel.selectAll('*').remove();
        // The body is a column: one legend row naming the ring's four encodings,
        // then the grid, which takes the remaining height and scrolls in wrap mode
        // (so it has to be keyboard-reachable).
        containerSel.classed('task-ring-grid-host', true);
        renderTaskRingLegend(containerSel);
        const gridElement = /** @type {HTMLElement} */ (
            containerSel.append('div').attr('class', 'task-ring-grid-body').node()
        );
        markScrollRegion(gridElement, findOwningModuleTitle(container));

        const { layout, titleLayout } = resolveTaskRingGrid(chartDefs, gridElement);

        this.#ensureHeaderControls();

        const enableDomainSelection = host.getOption('enableDomainSelection');
        const layoutClass = ensureTaskRingGridLayoutStyle(host, layout, chartDefs.length);
        const chartsContainer = d3.select(gridElement).classed(layoutClass, true);
        const chartInstances = this.#createChartInstances({
            chartsContainer,
            titleLayout,
            itemArray,
            studentArray,
            selectedStudents,
            domains,
            enableDomainSelection,
            layout,
        });

        this.#applyDefaultDomainSelection({ enableDomainSelection, chartsContainer, domains });
        this.#storeLayout(layout, titleLayout);
        this.#observeResize(container);

        return chartInstances;
    }

    /**
     * Supersede whatever creation request is pending and return the new one.
     * @returns {number} The request id the caller's frame callback must match.
     */
    #nextRequestId() {
        this.#requestId += 1;
        return this.#requestId;
    }

    #ensureHeaderControls() {
        ensureHeaderActionButton(this.host, {
            selector: INNER_RING_TOGGLE_SELECTOR,
            buttonAttributes: {
                'data-header-action-button': 'inner-ring',
            },
            ariaLabel: glossaryAnnotator.getRequiredEntryText(
                'ma.items.item-donuts.inner-ring-toggle.label',
            ),
            tooltipText: glossaryAnnotator.getRequiredEntryText(
                'ma.items.item-donuts.inner-ring-toggle.label',
            ),
            syncButton: (button) =>
                syncInnerRingToggleButton(
                    button,
                    this.state.innerRingVisible ?? this.host.getOption('defaultInnerRingVisible'),
                ),
            onClick: () => this.toggleInnerRingVisibility(),
        });
    }

    #createChartInstances(args) {
        const {
            chartsContainer,
            titleLayout,
            itemArray,
            studentArray,
            selectedStudents,
            domains,
            enableDomainSelection,
            layout,
        } = args;
        const host = this.host;
        const chartInstances = [];

        for (let index = 0; index < titleLayout.charts.length; index++) {
            const chartDef = titleLayout.charts[index];
            const chartItemDiv = chartsContainer
                .append('div')
                .attr('class', 'task-ring-chart-item')
                .attr('data-chart-id', chartDef.id)
                .attr('data-domain', chartDef.domain || 'overall')
                .attr('id', `${host.id}-ring-${index}`);

            // Empty Leitideen stay inert: no hover, no click, no selection. Without the
            // `--selectable` class and the handlers, the cell carries neither the pointer
            // cursor nor the highlight outlines.
            if (chartDef.domain !== null && !chartDef.isEmpty && enableDomainSelection) {
                this.#wireDomainSelection(chartItemDiv, chartDef, domains);
            }

            chartInstances.push(
                new TaskRingChart(`${host.id}-ring-${index}`, itemArray, studentArray, {
                    domainFilter: chartDef.domain,
                    title: chartDef.title,
                    selectedStudents,
                    innerRingVisible: this.state.innerRingVisible,
                    titleLayoutMode: titleLayout.titleLayoutMode,
                    titleWrapWidth: titleLayout.titleWrapWidth,
                    titleLines: chartDef.titleLines,
                    // The fallback dimensions are the SVG's box, not the cell's: the cell is
                    // larger by the padding .chart-container puts around the ring, and an SVG
                    // built at cell size would overflow into its neighbour.
                    defaultWidth: Math.max(0, layout.ringWidth - 2 * layout.cellPadding),
                    defaultHeight: Math.max(0, layout.ringHeight - 2 * layout.cellPadding),
                    scopeId: host.id,
                }),
            );
        }

        return chartInstances;
    }

    #wireDomainSelection(chartItemDiv, chartDef, domains) {
        chartItemDiv
            .classed('task-ring-chart-item--selectable', true)
            .on('mouseenter', function () {
                if (!d3.select(this).classed('domain-ring-highlight selected')) {
                    d3.select(this).classed('domain-ring-highlight hover', true);
                }
            })
            .on('mouseleave', function () {
                if (!d3.select(this).classed('domain-ring-highlight selected')) {
                    d3.select(this).classed('domain-ring-highlight hover', false);
                }
            })
            .on('click', () => {
                if (this.selectDomain(chartDef.domain)) {
                    publishDomainSelection(chartDef.domain, domains, this.host);
                }
            });
    }

    #applyDefaultDomainSelection({ enableDomainSelection, chartsContainer, domains }) {
        // selectedDomain is resolved in create() and never names an empty Leitidee;
        // it is null when no Leitidee carries items, leaving the grid unselected.
        const defaultDomain = this.state.selectedDomain;
        if (!enableDomainSelection || !defaultDomain) return;

        const defaultDomainItem = chartsContainer.select(
            `.task-ring-chart-item[data-domain="${defaultDomain}"]`,
        );
        if (defaultDomainItem.empty()) return;

        defaultDomainItem.classed('domain-ring-highlight selected', true);
        publishDomainSelection(defaultDomain, domains, this.host, true);
    }

    #storeLayout(layout, titleLayout) {
        this.state.lastLayout = {
            cols: layout.estimatedCols,
            rows: layout.estimatedRows,
            ringWidth: layout.ringWidth,
            wrapMode: layout.wrapMode,
            titleLayoutMode: titleLayout.titleLayoutMode,
        };
    }

    #observeResize(container) {
        resizeService.observe(
            container,
            () => {
                const el = getLiveTaskRingContainer(this.host);
                if (!el || el.offsetWidth === 0 || el.offsetHeight === 0) return;

                const nextChartDefs = getTaskRingChartDefinitions(
                    this.state.domains || [],
                    this.state.itemArray,
                );
                const { layout: newLayout, titleLayout: nextTitleLayout } = resolveTaskRingGrid(
                    nextChartDefs,
                    taskRingGridElement(el),
                );
                const prev = this.state.lastLayout;
                // wrapMode must be compared explicitly: it pins ringWidth to the minimum, so
                // crossing into it is a sub-hysteresis width change and can leave cols/rows
                // untouched. Without this the grid would never switch to the scrolling layout and
                // would silently clip its rings instead.
                const changed =
                    !prev ||
                    prev.cols !== newLayout.estimatedCols ||
                    prev.rows !== newLayout.estimatedRows ||
                    prev.wrapMode !== newLayout.wrapMode ||
                    prev.titleLayoutMode !== nextTitleLayout.titleLayoutMode ||
                    Math.abs(prev.ringWidth - newLayout.ringWidth) > 10;

                if (changed) {
                    this.#rerenderFromState();
                }
            },
            { scopeId: this.host.id, debounceMs: RESIZE_DEBOUNCE_MS },
        );
    }

    #rerenderFromState() {
        return this.host.rerender({
            itemArray: this.state.itemArray,
            studentArray: this.state.studentArray,
            domains: this.state.domains,
            selectedStudents: this.state.lastSelectedStudents,
        });
    }
}

/**
 * The grid inside a host body, or the body itself before the grid is built.
 * @param {HTMLElement} container - The host's live render body.
 * @returns {HTMLElement} The element the grid is laid out in.
 */
function taskRingGridElement(container) {
    return (
        /** @type {HTMLElement|null} */ (container.querySelector('.task-ring-grid-body')) ??
        container
    );
}

/**
 * The one-row key to a ring's encodings, HTML under the card title: the solved
 * share, the rest, the Ø expected rate, and the niveau ring's full/pale split. A
 * ring packs four encodings and none of them is self-explanatory; the tooltips
 * stay the detail.
 * @param {d3.Selection} hostSel - The host body the row is prepended to.
 */
function renderTaskRingLegend(hostSel) {
    const colors = getThemeColors();
    const text = (key) =>
        glossaryAnnotator.getRequiredEntryText(`ma.items.item-donuts.legend.${key}`);
    const row = hostSel.append('div').attr('class', 'task-ring-legend').attr('role', 'list');
    const item = () =>
        row.append('div').attr('class', 'niveaustufen-item').attr('role', 'listitem');

    const solved = item();
    solved
        .append('span')
        .attr('class', 'niveaustufen-swatch')
        .attr('aria-hidden', 'true')
        .style('background-color', colors.result.correct);
    solved.append('span').text(text('solved'));

    const unsolved = item();
    unsolved
        .append('span')
        .attr('class', 'niveaustufen-swatch')
        .attr('aria-hidden', 'true')
        .style('background-color', colors.chart.gridColor);
    unsolved.append('span').text(text('unsolved'));

    // The Ø mark as it is drawn on the ring: a tick in the inactive ink with the sign.
    const expected = item();
    const mark = expected
        .append('svg')
        .attr('class', 'task-ring-legend-mark')
        .attr('viewBox', '0 0 16 16')
        .attr('aria-hidden', 'true');
    mark.append('line')
        .attr('x1', 3)
        .attr('y1', 8)
        .attr('x2', 7)
        .attr('y2', 8)
        .attr('stroke', colors.chrome.ringInactive)
        .attr('stroke-width', 2);
    mark.append('text')
        .attr('x', 9)
        .attr('y', 8)
        .attr('dy', '0.35em')
        .attr('fill', colors.chrome.ringInactive)
        .text('Ø');
    expected.append('span').text(text('expected'));

    // A niveau band, full on the solved half and pale on the unsolved half.
    const niveau = item();
    const bandColors = Object.values(colors.ks.byLevel ?? {});
    niveau
        .append('span')
        .attr('class', 'niveaustufen-swatch task-ring-legend-swatch--niveau')
        .attr('aria-hidden', 'true')
        .style('color', bandColors[Math.floor(bandColors.length / 2)] ?? colors.chrome.text);
    niveau.append('span').text(text('niveau'));
}

/**
 * Resolve or create the feature-local controller instance for a task-ring host.
 * @param {import('../../../../common/charts/host/chartHostModule.js').ChartHostModule} host - The host the grid belongs to.
 * @returns {TaskRingGridController} The host's controller, created on first access.
 */
export function getTaskRingGridController(host) {
    if (!host.configState.controller) {
        host.configState.controller = new TaskRingGridController(host);
    }
    return host.configState.controller;
}

/**
 * Render the inner-ring toggle button SVG icon.
 * @param {d3.Selection} btnSel - The button the icon is drawn into.
 * @param {boolean} innerRingVisible - Whether the inner ring is shown; the icon is a filled ring when it is, an empty one when not.
 */
function renderToggleBtnIcon(btnSel, innerRingVisible) {
    btnSel.html(iconSvg(innerRingVisible ? 'radio_button_checked' : 'radio_button_unchecked'));
}

/**
 * Bring the toggle button's icon, active class and `aria-pressed` into line with the
 * state — the three must move together or the control lies to one kind of reader.
 * @param {HTMLElement} button - The toggle button element.
 * @param {boolean} innerRingVisible - The state the button should now advertise.
 */
function syncInnerRingToggleButton(button, innerRingVisible) {
    renderToggleBtnIcon(d3.select(button), innerRingVisible);
    button.classList.toggle('is-active', innerRingVisible);
    button.setAttribute('aria-pressed', String(innerRingVisible));
}
