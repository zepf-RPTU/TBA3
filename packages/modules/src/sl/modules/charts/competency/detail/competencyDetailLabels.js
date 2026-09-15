/**
 * Label geometry for the competency detail chart: the top group/domain labels,
 * the per-bar/per-domain label layout and the multi-line domain-label packing.
 * The bottom (x-axis) labels live in `competencyDetailAxes.js`.
 *
 * Measurement functions take the renderer so they can reuse its shared text
 * measurement (`measureTexts`, `getChartFont`), per-render layout cache
 * (`chartState`) and glossary text rendering — the same instance the rest of
 * the pipeline draws into.
 */

import { CHART_CONFIG, STYLE_CONFIG } from '../shared/competencyChartConstants.js';
import {
    measureExtraLabelLineSpace,
    splitLabelLines,
} from '../../../../../common/charts/chartLabelFit.js';

const DETAIL_TOP_BAR_LABEL_OFFSET = 5;
const DETAIL_TOP_BAR_LABEL_BUFFER = 6;
const DETAIL_TOP_GROUP_LABEL_OFFSET = 25;
const DETAIL_TOP_GROUP_LABEL_BUFFER = 6;
const DETAIL_TOP_DOMAIN_LABEL_MIN_GAP = 12;
const DETAIL_TOP_DOMAIN_LABEL_LINE_HEIGHT_EM = 1.1;

/** Breathing room between two neighbouring free-text axis labels, in px. */
export const DETAIL_AXIS_LABEL_GAP = 8;

/**
 * Height reserved above the bars for the group and per-bar labels multi-domain mode
 * draws there. Single-domain mode needs none.
 * @param {object} renderer - The chart renderer, used for its text measurer and data.
 * @param {object} groupingConfig - How the groups nest.
 * @param {string} renderMode - Only `multi-domain` reserves anything.
 * @param {boolean} hasTeachingQuality - Whether each group also carries a Unterrichtsqualität bar.
 * @param {number} barLabelFontSize - Font size the per-bar labels are measured at.
 * @returns {number} Reserved height in px.
 */
export function measureDetailTopAxisSpace(
    renderer,
    groupingConfig,
    renderMode,
    hasTeachingQuality,
    barLabelFontSize,
) {
    if (renderMode !== 'multi-domain') return 0;

    const reserves = [measureDetailTopGroupLabelSpace(renderer, groupingConfig, barLabelFontSize)];

    if (shouldShowMultiDomainBarLabels(renderer, groupingConfig, hasTeachingQuality)) {
        const labelTexts = renderer.chartData
            .map((d) => groupingConfig.getLabelText(d))
            .filter(Boolean);

        if (hasTeachingQuality) {
            labelTexts.push('Q');
        }

        if (labelTexts.length > 0) {
            // Free-text class names wrap over up to two lines; measure the lines
            // that will actually be drawn.
            const measured = renderer.measureTexts(labelTexts.flatMap(splitLabelLines), {
                fontSize: barLabelFontSize,
                fontFamily: renderer.getChartFont(),
                fontWeight: 'bold',
            });
            const extraLines = measureExtraLabelLineSpace(barLabelFontSize, labelTexts);
            reserves.push(
                DETAIL_TOP_BAR_LABEL_OFFSET +
                    Math.ceil(measured.maxHeight + extraLines) +
                    DETAIL_TOP_BAR_LABEL_BUFFER,
            );
        }
    }

    return Math.max(0, ...reserves);
}

/**
 * Whether the per-bar labels are drawn at all. A group holding one bar is already named
 * by its group label, so labelling the bar too would just repeat it.
 * @param {object} renderer - The chart renderer, read for its prepared data.
 * @param {object} groupingConfig - How the groups nest.
 * @param {boolean} hasTeachingQuality - A Unterrichtsqualität bar makes even a one-item group need labels.
 * @returns {boolean} True when the labels are drawn.
 */
function shouldShowMultiDomainBarLabels(renderer, groupingConfig, hasTeachingQuality) {
    const groups = {};
    renderer.chartData.forEach((d) => {
        const key = groupingConfig.getGroupKey(d);
        if (!groups[key]) groups[key] = [];
        groups[key].push(d);
    });

    const maxItemsPerGroup = Math.max(
        ...Object.values(groups).map(
            (group) => group.filter((data) => data.type !== 'landesschnitt').length,
        ),
    );

    return !groupingConfig.groupByDomain || maxItemsPerGroup > 1 || hasTeachingQuality;
}

/**
 * Shared measurement for subject-grouped two-domain clusters. Returns the
 * common label/cluster geometry, or null when the group has no measurable
 * two-domain subject structure. Consumed by both the top-axis label gap and
 * the edge-label layout, which derive their distinct results from it.
 * @param {object} renderer - The chart renderer, used for its text measurer and font.
 * @param {Array<object>} groupData - The rows in one group.
 * @param {object} groupingConfig - How the groups nest.
 * @param {number} barLabelFontSize - Font size the labels are measured at.
 * @param {number} uniformBarWidth - Bar width in px.
 * @param {number} barWidthWithPadding - Bar width plus its gap, i.e. the pitch between bars.
 * @returns {object|null} The shared cluster geometry, or `null` when this group has no two-domain subject structure to measure.
 */
function measureSubjectDomainClusters(
    renderer,
    groupData,
    groupingConfig,
    barLabelFontSize,
    uniformBarWidth,
    barWidthWithPadding,
) {
    if (!groupingConfig.groupBySubject) {
        return null;
    }

    const subject = groupData[0]?.data?.subject;
    const domainOrder = groupingConfig.subjectDomainOrder?.[subject] || [];
    if (domainOrder.length < 2) {
        return null;
    }

    const leftDomainData = groupData.find(({ data }) => data.domain === domainOrder[0])?.data;
    const rightDomainData = groupData.find(({ data }) => data.domain === domainOrder[1])?.data;
    const leftLabel = measureDomainLabelLayout(
        renderer,
        leftDomainData?.displayDomainLabel || leftDomainData?.domainLabel,
        barLabelFontSize,
    );
    const rightLabel = measureDomainLabelLayout(
        renderer,
        rightDomainData?.displayDomainLabel || rightDomainData?.domainLabel,
        barLabelFontSize,
    );
    if (!leftLabel || !rightLabel) {
        return null;
    }

    const localSubScaleKeys = [
        ...new Set(groupData.map(({ data }) => groupingConfig.getSubScaleKey(data))),
    ];
    const leftCount = localSubScaleKeys.filter((key) => key.endsWith('_d0')).length;
    const rightCount = localSubScaleKeys.filter((key) => key.endsWith('_d1')).length;
    if (leftCount === 0 || rightCount === 0) {
        return null;
    }

    const subgroupGap = barWidthWithPadding * CHART_CONFIG.PADDING.BAR_PADDING_RATIO;
    const leftClusterWidth = (leftCount - 1) * barWidthWithPadding + uniformBarWidth;
    const rightClusterWidth = (rightCount - 1) * barWidthWithPadding + uniformBarWidth;

    return {
        leftLabel,
        rightLabel,
        localSubScaleKeys,
        subgroupGap,
        leftClusterWidth,
        rightClusterWidth,
    };
}

/**
 * Extra gap a subject group needs between its two Domänen clusters so their labels do
 * not collide. Zero when the clusters are already far enough apart.
 * @param {object} renderer - The chart renderer, used for its text measurer and font.
 * @param {Array<object>} groupData - The rows in one group.
 * @param {object} groupingConfig - How the groups nest.
 * @param {number} barLabelFontSize - Font size the labels are measured at.
 * @param {number} uniformBarWidth - Bar width in px.
 * @param {number} barWidthWithPadding - Bar width plus its gap.
 * @returns {number} Additional gap in px.
 */
export function measureSubjectDomainLabelGap(
    renderer,
    groupData,
    groupingConfig,
    barLabelFontSize,
    uniformBarWidth,
    barWidthWithPadding,
) {
    const clusters = measureSubjectDomainClusters(
        renderer,
        groupData,
        groupingConfig,
        barLabelFontSize,
        uniformBarWidth,
        barWidthWithPadding,
    );
    if (!clusters) {
        return 0;
    }

    const { leftLabel, rightLabel, subgroupGap, leftClusterWidth, rightClusterWidth } = clusters;
    const currentCenterDistance = leftClusterWidth / 2 + subgroupGap + rightClusterWidth / 2;
    const requiredCenterDistance =
        leftLabel.width / 2 + rightLabel.width / 2 + DETAIL_TOP_DOMAIN_LABEL_MIN_GAP;

    return Math.max(0, requiredCenterDistance - currentCenterDistance);
}

/**
 * Where a subject group's two Domänen labels sit, and how far they reach past the
 * group's own bars — the overhang neighbouring groups have to keep clear of.
 * @param {object} renderer - The chart renderer, used for its text measurer and font.
 * @param {Array<object>} groupData - The rows in one group.
 * @param {object} groupingConfig - How the groups nest.
 * @param {number} barLabelFontSize - Font size the labels are measured at.
 * @param {number} uniformBarWidth - Bar width in px.
 * @param {number} barWidthWithPadding - Bar width plus its gap.
 * @param {number} [groupDomainExtraGap] - Extra gap already granted between the clusters.
 * @param {boolean} [hasTeachingQuality] - Whether the group also carries a Unterrichtsqualität bar, which widens it.
 * @returns {object|null} The label positions and overhangs, or `null` when this group has no two-domain subject structure.
 */
function measureSubjectEdgeLabelLayout(
    renderer,
    groupData,
    groupingConfig,
    barLabelFontSize,
    uniformBarWidth,
    barWidthWithPadding,
    groupDomainExtraGap = 0,
    hasTeachingQuality = false,
) {
    const clusters = measureSubjectDomainClusters(
        renderer,
        groupData,
        groupingConfig,
        barLabelFontSize,
        uniformBarWidth,
        barWidthWithPadding,
    );
    if (!clusters) {
        return null;
    }

    const {
        leftLabel,
        rightLabel,
        localSubScaleKeys,
        subgroupGap,
        leftClusterWidth,
        rightClusterWidth,
    } = clusters;
    const leftCenter = leftClusterWidth / 2;
    const rightCenter =
        leftClusterWidth + subgroupGap + groupDomainExtraGap + rightClusterWidth / 2;
    const totalBarCount = localSubScaleKeys.length + (hasTeachingQuality ? 1 : 0);
    const totalWidth =
        totalBarCount * barWidthWithPadding +
        subgroupGap +
        groupDomainExtraGap +
        (hasTeachingQuality ? subgroupGap : 0);

    return {
        leftOffset: leftCenter,
        rightOffset: totalWidth - rightCenter,
        leftWidth: leftLabel.width,
        rightWidth: rightLabel.width,
    };
}

/**
 * Extra gap two neighbouring subject groups need so the right label of one and the left
 * label of the next do not collide — each label can overhang its own group's bars.
 * @param {object} renderer - The chart renderer, used for its text measurer and font.
 * @param {Array<object>} currentGroupData - Rows of the left group.
 * @param {Array<object>} nextGroupData - Rows of the right group.
 * @param {object} groupingConfig - How the groups nest.
 * @param {number} barLabelFontSize - Font size the labels are measured at.
 * @param {number} uniformBarWidth - Bar width in px.
 * @param {number} barWidthWithPadding - Bar width plus its gap.
 * @param {number} currentGroupDomainExtraGap - Extra gap already granted inside the left group.
 * @param {number} nextGroupDomainExtraGap - Extra gap already granted inside the right group.
 * @param {boolean} currentGroupHasQuality - Whether the left group carries a Unterrichtsqualität bar.
 * @param {boolean} nextGroupHasQuality - Whether the right group carries one.
 * @param {number} groupGap - The gap the layout already puts between groups.
 * @returns {number} Additional gap in px, `0` when the existing one suffices.
 */
export function measureAdjacentSubjectGroupGap(
    renderer,
    currentGroupData,
    nextGroupData,
    groupingConfig,
    barLabelFontSize,
    uniformBarWidth,
    barWidthWithPadding,
    currentGroupDomainExtraGap,
    nextGroupDomainExtraGap,
    currentGroupHasQuality,
    nextGroupHasQuality,
    groupGap,
) {
    const currentLayout = measureSubjectEdgeLabelLayout(
        renderer,
        currentGroupData,
        groupingConfig,
        barLabelFontSize,
        uniformBarWidth,
        barWidthWithPadding,
        currentGroupDomainExtraGap,
        currentGroupHasQuality,
    );
    const nextLayout = measureSubjectEdgeLabelLayout(
        renderer,
        nextGroupData,
        groupingConfig,
        barLabelFontSize,
        uniformBarWidth,
        barWidthWithPadding,
        nextGroupDomainExtraGap,
        nextGroupHasQuality,
    );

    if (!currentLayout || !nextLayout) {
        return 0;
    }

    const currentCenterDistance = currentLayout.rightOffset + groupGap + nextLayout.leftOffset;
    const requiredCenterDistance =
        currentLayout.rightWidth / 2 + nextLayout.leftWidth / 2 + DETAIL_TOP_DOMAIN_LABEL_MIN_GAP;

    return Math.max(0, requiredCenterDistance - currentCenterDistance);
}

/**
 * Break a Domäne label into the lines it is drawn as.
 * @param {any} label - The label; anything but a string reads as empty.
 * @returns {string[]} One entry per line, empty for a label with no words.
 */
function getDomainLabelLines(label) {
    const normalizedLabel = typeof label === 'string' ? label.trim() : '';
    if (!normalizedLabel) {
        return [];
    }

    const slashParts = normalizedLabel
        .split('/')
        .map((part) => part.trim())
        .filter(Boolean);
    if (slashParts.length > 1) {
        return packDomainLabelLines(
            slashParts.map((part, index) => (index < slashParts.length - 1 ? `${part}/` : part)),
        );
    }

    const lowerLabel = normalizedLabel.toLowerCase();
    if (lowerLabel.endsWith('verstehen')) {
        const stem = normalizedLabel.slice(0, -'verstehen'.length).trim();
        if (stem.length >= 2) {
            return [`${stem}-`, normalizedLabel.slice(-'verstehen'.length)];
        }
    }

    return packDomainLabelLines(normalizedLabel.split(/\s+/).filter(Boolean));
}

/**
 * Distribute words over at most `maxLines` lines, balancing their lengths so a label
 * does not end on a one-word line.
 * @param {string[]} tokens - The label's words, in order.
 * @param {number} [maxLines] - Line budget.
 * @returns {string[]} The packed lines.
 */
function packDomainLabelLines(tokens, maxLines = 3) {
    if (!Array.isArray(tokens) || tokens.length === 0) {
        return [];
    }
    if (tokens.length <= maxLines) {
        return tokens;
    }

    const remainingTokens = [...tokens];
    const lines = [];

    while (remainingTokens.length > 0) {
        const slotsLeft = maxLines - lines.length;
        const takeCount =
            slotsLeft === 1
                ? remainingTokens.length
                : Math.ceil(remainingTokens.length / slotsLeft);
        lines.push(remainingTokens.splice(0, takeCount).join(' '));
    }

    return lines;
}

/**
 * Measure one Domäne label as it will be drawn — wrapped, at the bar-label size.
 * @param {object} renderer - The chart renderer, used for its text measurer and font.
 * @param {any} label - The label to measure.
 * @param {number} barLabelFontSize - Font size the label is drawn at.
 * @returns {object} Its lines and their measured extent.
 */
function measureDomainLabelLayout(renderer, label, barLabelFontSize) {
    const normalizedLabel = typeof label === 'string' ? label.trim() : '';
    if (!normalizedLabel) {
        return null;
    }

    const fontFamily = renderer.getChartFont();
    const cache =
        renderer.chartState.domainLabelLayoutCache ??
        (renderer.chartState.domainLabelLayoutCache = new Map());
    const cacheKey = JSON.stringify([normalizedLabel, barLabelFontSize, fontFamily]);

    if (cache.has(cacheKey)) {
        return cache.get(cacheKey);
    }

    const lines = getDomainLabelLines(normalizedLabel);
    if (lines.length === 0) {
        return null;
    }

    const measured = renderer.measureTexts(lines, {
        fontSize: barLabelFontSize,
        fontFamily,
        fontWeight: 'bold',
    });
    const lineHeight = measured.maxHeight || barLabelFontSize;
    const lineStep = lineHeight * DETAIL_TOP_DOMAIN_LABEL_LINE_HEIGHT_EM;

    const layout = {
        lines: [...lines],
        width: measured.maxWidth,
        height: lineHeight + (lines.length - 1) * lineStep,
        lineStep,
    };

    cache.set(cacheKey, layout);
    return layout;
}

/**
 * Draw one measured Domäne label, growing upwards from `y` so a two-line label stays
 * clear of the bars rather than pushing into them.
 * @param {object} renderer - The chart renderer, used for glossary stamping.
 * @param {d3.Selection} domainGroup - The group the label is appended to.
 * @param {object} labelLayout - The measured lines and line step from `measureDomainLabelLayout`.
 * @param {number} x - Label centre in px.
 * @param {number} y - Baseline of the label's *last* line.
 * @param {string} domainSuffix - `d0`/`d1`, stamped as a data attribute so the label can be found again.
 * @param {string|null} [glossaryKey] - Glossary entry the label links to, when it has one.
 * @returns {d3.Selection} The appended text element.
 */
function appendDomainLabelText(
    renderer,
    domainGroup,
    labelLayout,
    x,
    y,
    domainSuffix,
    glossaryKey = null,
) {
    const baselineY = y - (labelLayout.lines.length - 1) * labelLayout.lineStep;
    const label = domainGroup
        .append('text')
        .attr('class', 'domain-label')
        .attr('data-domain', domainSuffix)
        .attr('x', x)
        .attr('y', baselineY)
        .attr('text-anchor', 'middle')
        .style('font-weight', 'bold')
        .style('fill', STYLE_CONFIG.COLORS.TEXT_SECONDARY);

    labelLayout.lines.forEach((line, index) => {
        const tspan = label.append('tspan').attr('x', x);
        if (index > 0) {
            tspan.attr('dy', `${labelLayout.lineStep}px`);
        }
        renderer.renderGlossaryTextSegments(tspan, line, {
            segments: [{ text: line, glossaryKey }],
            force: Boolean(glossaryKey),
        });
    });

    return label;
}

/**
 * Height the group labels above the bars need, taking the tallest wrapped Domäne label
 * across all groups so every group reserves the same and the bars stay aligned.
 * @param {object} renderer - The chart renderer, used for its text measurer and data.
 * @param {object} groupingConfig - How the groups nest.
 * @param {number} barLabelFontSize - Font size the labels are measured at.
 * @returns {number} Reserved height in px.
 */
function measureDetailTopGroupLabelSpace(renderer, groupingConfig, barLabelFontSize) {
    const fontOptions = {
        fontSize: barLabelFontSize,
        fontFamily: renderer.getChartFont(),
        fontWeight: 'bold',
    };
    let reserve = 0;

    if (groupingConfig.groupBySubject) {
        const seenDomains = new Set();
        const domainLabelHeights = [];

        renderer.chartData.forEach((d) => {
            const domainCount = groupingConfig.subjectDomainCounts?.[d.subject]?.size || 1;
            const domainKey = `${d.subject}|${d.domain}`;
            const labelLayout = measureDomainLabelLayout(
                renderer,
                d.displayDomainLabel || d.domainLabel,
                barLabelFontSize,
            );
            if (domainCount === 2 && labelLayout && !seenDomains.has(domainKey)) {
                seenDomains.add(domainKey);
                domainLabelHeights.push(labelLayout.height);
            }
        });

        if (domainLabelHeights.length > 0) {
            reserve = Math.max(
                reserve,
                DETAIL_TOP_GROUP_LABEL_OFFSET +
                    Math.ceil(Math.max(...domainLabelHeights)) +
                    DETAIL_TOP_GROUP_LABEL_BUFFER,
            );
        }
    }

    const subjectDomainCounts = groupingConfig.subjectDomainCounts || {};
    const subjects = Object.keys(subjectDomainCounts);
    if (
        !groupingConfig.groupBySubject &&
        !groupingConfig.groupByDomain &&
        !renderer.className &&
        subjects.length > 1
    ) {
        const rotatedSubjectLabels = subjects
            .filter((subject) => (subjectDomainCounts[subject]?.size || 1) > 1)
            .map(
                (subject) =>
                    groupingConfig.subjectLabels?.[subject] || subject.charAt(0).toUpperCase(),
            );

        if (rotatedSubjectLabels.length > 0) {
            const measured = renderer.measureTexts(rotatedSubjectLabels, {
                ...fontOptions,
                rotation: -45,
            });
            reserve = Math.max(
                reserve,
                DETAIL_TOP_GROUP_LABEL_OFFSET +
                    Math.ceil(measured.maxHeight) +
                    DETAIL_TOP_GROUP_LABEL_BUFFER,
            );
        }
    }

    return reserve;
}

/**
 * Draw the Domäne labels above one group's bars. Compact mode draws none — there is no
 * height to spend on them.
 * @param {object} renderer - The chart renderer, used for measuring and glossary stamping.
 * @param {d3.Selection} domainGroup - The group the labels are appended to.
 * @param {Array<object>} groupData - The rows in this group, in draw order.
 * @param {{[barKey: string]: number}} barPositions - Each bar's x offset within the group.
 * @param {string[]} sortedLocalKeys - The group's bar keys in draw order.
 * @param {number} uniformBarWidth - Bar width in px.
 * @param {number} barLabelFontSize - Font size the labels are drawn at.
 * @param {object} groupingConfig - How the groups nest, which decides whether a label spans one bar or a Domäne cluster.
 */
export function renderDomainLabels(
    renderer,
    domainGroup,
    groupData,
    barPositions,
    sortedLocalKeys,
    uniformBarWidth,
    barLabelFontSize,
    groupingConfig,
) {
    if (renderer.compact) return;
    // Domain labels for two-domain subjects
    if (groupingConfig.groupBySubject) {
        const firstData = groupData[0].data;
        const subjectDomainCount = groupingConfig.subjectDomainCounts[firstData.subject].size;

        if (subjectDomainCount === 2) {
            const domainLabels = {};
            groupData.forEach(({ data }) => {
                if (data.domainLabel) {
                    domainLabels[data.domain] = {
                        displayLabel: data.displayDomainLabel || data.domainLabel,
                        glossaryKey: data.domainLabel,
                    };
                }
            });

            const domains = groupingConfig.subjectDomainOrder[firstData.subject];

            ['d0', 'd1'].forEach((domainSuffix, idx) => {
                const bars = [
                    `class_${domainSuffix}`,
                    `school_${domainSuffix}`,
                    `landesschnitt_${domainSuffix}`,
                ]
                    .filter((k) => barPositions[k] !== undefined)
                    .map((k) => barPositions[k]);
                if (bars.length > 0) {
                    const left = Math.min(...bars);
                    const right = Math.max(...bars) + uniformBarWidth;
                    const domainInfo = domainLabels[domains[idx]] || null;
                    const labelLayout = measureDomainLabelLayout(
                        renderer,
                        domainInfo?.displayLabel || domains[idx] || domainSuffix.toUpperCase(),
                        barLabelFontSize,
                    );
                    if (!labelLayout) {
                        return;
                    }

                    appendDomainLabelText(
                        renderer,
                        domainGroup,
                        labelLayout,
                        (left + right) / 2,
                        -25,
                        domainSuffix,
                        domainInfo?.glossaryKey || null,
                    );
                }
            });
        }
    }

    // Subject labels for multi-domain subjects in !groupBySubject && !groupByDomain mode
    const uniqueSubjectsInGroup = Object.keys(groupingConfig.subjectDomainCounts || {});
    if (
        !groupingConfig.groupBySubject &&
        !groupingConfig.groupByDomain &&
        groupingConfig.subjectDomainCounts &&
        !renderer.className &&
        uniqueSubjectsInGroup.length > 1
    ) {
        const subjectBarGroups = {};
        sortedLocalKeys.forEach((subKey) => {
            if (subKey === 'teachingQuality') return;
            const subject = subKey.split('|')[0];
            if (!subjectBarGroups[subject]) subjectBarGroups[subject] = [];
            subjectBarGroups[subject].push(barPositions[subKey]);
        });

        Object.entries(subjectBarGroups).forEach(([subject, positions]) => {
            const domainCount = groupingConfig.subjectDomainCounts[subject]?.size || 1;
            if (domainCount > 1 && positions.length > 0) {
                const subjectLabel =
                    groupingConfig.subjectLabels?.[subject] || subject.charAt(0).toUpperCase();
                const leftBound = Math.min(...positions);
                const rightBound = Math.max(...positions) + uniformBarWidth;
                const centerX = (leftBound + rightBound) / 2;

                domainGroup
                    .append('text')
                    .attr('class', 'subject-label')
                    .attr('data-subject', subject)
                    .attr('x', centerX)
                    .attr('y', -25)
                    .attr('text-anchor', 'start')
                    .attr('transform', `rotate(-45, ${centerX}, -25)`)
                    .style('font-weight', 'bold')
                    .style('fill', STYLE_CONFIG.COLORS.TEXT_SECONDARY)
                    .text(subjectLabel);
            }
        });
    }
}
