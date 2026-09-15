/**
 * The side-panel legend model of the competency detail chart: the domain/subject toggle
 * pills (grouped under a clickable Fach heading where two Fächer both carry several
 * Domänen), the comparison and class pills and the Kompetenzstufen swatch section,
 * described as sections for the renderer's `htmlLegend` collaborator. Pill lifecycle,
 * click dispatch and the visibility state itself live in `HtmlLegendController`; what a
 * toggle then does to the drawn SVG is applied by the sibling visibility module. Pure.
 */

import { getChartDomainAbbreviation } from '../../../../../common/charts/domainLabelFormatter.js';
import { buildLegendLabelSegments } from '../../../../../common/domain/comparisonGroupLabels.js';
import {
    buildComparisonLegendItems,
    renderCompetencyLevelLegendSection,
} from '../shared/competencyLegendRender.js';

/**
 * Legend/sub-scale keys for a delivered Landesschnitt carry the value group's own id
 * (`state:nw-msa`), so several state tracks stay separately toggleable. `landesschnitt`
 * is not one of them — it is the entry `type`, shared by every track.
 */
const STATE_RENDER_KEY_PREFIX = 'state:';

/**
 * Whether a render key belongs to a Landesschnitt track. The prefix is what makes the
 * tracks distinguishable; their shared `type` is not.
 * @param {any} key - A render key.
 * @returns {boolean} True for a state-track key.
 */
export function isStateRenderKey(key) {
    return typeof key === 'string' && key.startsWith(STATE_RENDER_KEY_PREFIX);
}

/**
 * Sections of the detail legend: domain/subject toggle pills (grouped under a
 * clickable Fach heading when two Fächer both carry several Domänen), the
 * comparison pills (Landesschnitte, Schulschnitt, Unterrichtsqualität), class
 * pills when the bars group by Fach, and the Kompetenzstufen swatch pills.
 * @param {object} renderer - The chart renderer whose data the legend describes.
 * @param {string[]} competencyLevels - The scale's bands, in scale order.
 * @param {(level: string) => string} getColorForLevel - Maps a band to its swatch colour.
 * @param {object} groupingConfig - How the bars group, which decides what the toggle pills stand for.
 * @param {{ksLevelToGroup: Map<string,string>|null}} ksLegend - Receives the level → group map the KS section builds.
 * @param {(level: string) => string|undefined} [scaleIdForLevel] - The ladder a bare level name resolves on.
 * @returns {Array<import('../../../../../common/charts/legend/htmlLegendController.js').HtmlLegendSection>} What the panel shows.
 */
export function buildDetailLegendSections(
    renderer,
    competencyLevels,
    getColorForLevel,
    groupingConfig,
    ksLegend,
    scaleIdForLevel,
) {
    const hasTeachingQuality = renderer.chartData.some(
        (d) => d.teachingQuality && d.type !== 'landesschnitt',
    );
    const uniqueClassNames = getSortedClassNames(renderer.chartData);
    const legendItems = buildDetailLegendItems(
        renderer.chartData,
        groupingConfig,
        hasTeachingQuality,
    );
    const showDomainLegend = legendItems.length > 1 || hasTeachingQuality;

    const sections = [];
    if (showDomainLegend) {
        sections.push(...buildDomainSections(legendItems, groupingConfig));
    }
    if (groupingConfig.groupBySubject && uniqueClassNames.length > 1) {
        sections.push({
            title: 'Klassen',
            group: 'individual-class',
            pillGroupClass: 'class-legend-pills',
            items: uniqueClassNames.map((className) => ({
                key: className,
                label: className,
                isChild: true,
            })),
        });
    }
    sections.push({
        group: 'competency-level',
        render: (panel) => {
            const { ksGroupOrder, ksLevelToGroup } = renderCompetencyLevelLegendSection(
                panel,
                competencyLevels,
                getColorForLevel,
                { useAllPossibleLevels: false, scaleIdForLevel },
            );
            ksLegend.ksLevelToGroup = ksLevelToGroup;
            return ksGroupOrder;
        },
    });
    return sections;
}

/**
 * The domain and comparison sections. Domain pills sit under their Fach heading
 * when the items carry headers, else in one flat section; comparison pills
 * (state tracks, Schulschnitt, Unterrichtsqualität) form their own section.
 * At least one domain stays on; the comparison floor only applies when the
 * comparison pills are all the legend has (bars grouped by Fach).
 * @param {Array<object>} legendItems - The pills to render, headers included.
 * @param {object} groupingConfig - How the bars group.
 * @returns {Array<object>} The sections, in draw order.
 */
function buildDomainSections(legendItems, groupingConfig) {
    const realDomainItems = legendItems.filter((i) => !i.isHeader && !isComparisonKey(i.key));
    // A single domain cannot be meaningfully hidden, so it gets no pill.
    const hasSingleDomain = realDomainItems.length === 1;
    const toItem = (item) => ({
        key: item.key,
        label: item.label,
        labelSegments: item.labelSegments,
        isChild: item.isChild === true,
    });

    const sections = [];
    const flatDomainItems = [];
    // A Fach heading's children sit under it, not in the flat list as well.
    const headerChildKeys = new Set(
        legendItems.flatMap((item) => (item.isHeader ? item.childKeys : [])),
    );
    legendItems.forEach((item) => {
        if (item.isHeader) {
            sections.push({
                title: item.label,
                group: 'domain',
                minVisible: 1,
                toggleAll: true,
                items: legendItems
                    .filter((child) => item.childKeys.includes(child.key))
                    .map(toItem),
            });
        } else if (
            !isComparisonKey(item.key) &&
            !hasSingleDomain &&
            !headerChildKeys.has(item.key)
        ) {
            flatDomainItems.push(toItem(item));
        }
    });
    if (flatDomainItems.length > 0) {
        const sectionTitle = groupingConfig.groupBySubject
            ? 'Legende'
            : legendItems.filter((i) => !i.isHeader).length > 2
              ? 'Domänen'
              : 'Legende';
        sections.push({
            title: sectionTitle,
            group: 'domain',
            minVisible: 1,
            items: flatDomainItems,
        });
    }

    const comparisonItems = legendItems
        .filter((i) => !i.isHeader && isComparisonKey(i.key))
        .map(toItem);
    if (comparisonItems.length > 0) {
        sections.push({
            title: groupingConfig.groupBySubject ? 'Legende' : 'Vergleich',
            group: 'comparison',
            minVisible: groupingConfig.groupBySubject ? 1 : 0,
            items: comparisonItems,
        });
    }
    return sections;
}

/**
 * Whether a legend key names a comparison pill rather than a Domäne: the fixed
 * keys, or a state track's own render key (`state:<id>`, one per delivered
 * Landesschnitt).
 * @param {string} key - A legend item key.
 * @returns {boolean} True for a comparison key.
 */
function isComparisonKey(key) {
    return SPECIAL_KEYS.has(key) || isStateRenderKey(key);
}

const SPECIAL_KEYS = new Set(['teachingQuality', 'school', 'landesschnitt', 'classes']);

/**
 * @param {Array<object>} chartData - The prepared rows.
 * @returns {string[]} The class names present, sorted.
 */
export function getSortedClassNames(chartData) {
    return [...new Set(chartData.filter((d) => d.type === 'class').map((d) => d.name))].sort();
}

/**
 * Assemble the legend item array from chart data, grouping config, and TQ availability.
 * @param {Array<object>} chartData - The prepared rows the legend describes.
 * @param {object} groupingConfig - How the bars group.
 * @param {boolean} hasTeachingQuality - Whether a Unterrichtsqualität entry belongs in the legend.
 * @returns {Array<object>} The legend items in draw order, section headers included.
 */
function buildDetailLegendItems(chartData, groupingConfig, hasTeachingQuality) {
    const legendItems = /** @type {Array<{[key: string]: any}>} */ ([]);

    if (groupingConfig.groupBySubject) {
        const stateEntries = [];
        const seenStateKeys = new Set();
        for (const entry of chartData) {
            if (entry.type !== 'landesschnitt') continue;
            const key = entry.renderKey ?? entry.name;
            if (seenStateKeys.has(key)) continue;
            seenStateKeys.add(key);
            stateEntries.push(entry);
        }
        legendItems.push(
            ...buildComparisonLegendItems(
                stateEntries.map((entry) => ({
                    key: entry.renderKey ?? entry.name,
                    name: entry.name,
                })),
            ),
        );
        if (hasTeachingQuality) {
            legendItems.push({
                key: 'teachingQuality',
                label: 'Q = Unterrichtsqualität',
                labelSegments: buildLegendLabelSegments(
                    'Q',
                    'Unterrichtsqualität',
                    'unterrichtsqualität',
                ),
            });
        }
        return legendItems;
    }

    const subjectDomainMapLocal = buildSubjectDomainMap(chartData);
    const multiDomainSubjects = Array.from(subjectDomainMapLocal.entries()).filter(
        ([, info]) => info.domainCount > 1,
    );
    const needsHierarchy = multiDomainSubjects.length > 1;

    const sortedSubjects = Array.from(subjectDomainMapLocal.entries()).sort((a, b) =>
        (a[1].subjectLabel || a[0]).localeCompare(b[1].subjectLabel || b[0]),
    );

    sortedSubjects.forEach(([subject, subjectInfo]) => {
        const isSingleDomain = subjectInfo.domainCount === 1;
        const sortedDomains = Array.from(subjectInfo.domains.entries()).sort((a, b) =>
            (a[0] || '').localeCompare(b[0] || ''),
        );

        if (isSingleDomain) {
            const domainLabel = sortedDomains[0][0];
            const abbrev = (subjectInfo.subjectLabel || subject).charAt(0);
            legendItems.push({
                key: getVisibilityKey(subject, domainLabel),
                label: `${abbrev} = ${subjectInfo.subjectLabel || subject}`,
                labelSegments: buildLegendLabelSegments(
                    abbrev,
                    subjectInfo.subjectLabel || subject,
                    subjectInfo.subjectLabel || subject,
                ),
                isSubject: true,
                subject,
            });
        } else if (needsHierarchy) {
            legendItems.push({
                key: `subject_header_${subject}`,
                label: subjectInfo.subjectLabel || subject,
                isHeader: true,
                subject,
                childKeys: sortedDomains.map(([dl]) => getVisibilityKey(subject, dl)),
            });
            sortedDomains.forEach(([domainLabel, domainInfo]) => {
                legendItems.push({
                    key: getVisibilityKey(subject, domainLabel),
                    label: `${domainInfo.abbreviation} = ${domainLabel}`,
                    labelSegments: buildLegendLabelSegments(
                        domainInfo.abbreviation,
                        domainLabel,
                        domainLabel,
                    ),
                    isChild: true,
                    parentSubject: subject,
                    subject,
                    domainLabel,
                });
            });
        } else {
            sortedDomains.forEach(([domainLabel, domainInfo]) => {
                legendItems.push({
                    key: getVisibilityKey(subject, domainLabel),
                    label: `${domainInfo.abbreviation} = ${domainLabel}`,
                    labelSegments: buildLegendLabelSegments(
                        domainInfo.abbreviation,
                        domainLabel,
                        domainLabel,
                    ),
                    subject,
                    domainLabel,
                });
            });
        }
    });

    if (hasTeachingQuality) {
        legendItems.push({
            key: 'teachingQuality',
            label: 'Q = Unterrichtsqualität',
            labelSegments: buildLegendLabelSegments(
                'Q',
                'Unterrichtsqualität',
                'unterrichtsqualität',
            ),
        });
    }

    return legendItems;
}

/**
 * Build a Map<subject, {subjectLabel, domains, domainCount}> from chart data.
 * @param {Array<object>} chartData - The prepared rows.
 * @returns {Map<string, object>} Per Fach, its label and the Domänen it carries.
 */
function buildSubjectDomainMap(chartData) {
    const sdMap = new Map();
    chartData.forEach((d) => {
        if (!sdMap.has(d.subject)) {
            sdMap.set(d.subject, {
                subjectLabel: d.subjectLabel,
                domains: new Map(),
                domainCount: d.subjectDomainCount || 1,
            });
        }
        const subjectInfo = sdMap.get(d.subject);
        if (!subjectInfo.domains.has(d.domainLabel)) {
            subjectInfo.domains.set(d.domainLabel, {
                abbreviation: d.displayDomainLabel || getChartDomainAbbreviation(d.domainLabel),
                domain: d.domain,
            });
        }
    });
    return sdMap;
}

/**
 * The key a Fach/Domäne pair is tracked under in the toggle state — two Fächer can carry
 * a Domäne of the same name, so neither half alone identifies a pill.
 * @param {string} subject - Fach id.
 * @param {string} domainLabel - Domäne display name.
 * @returns {string} The composite key.
 */
function getVisibilityKey(subject, domainLabel) {
    return `${subject}|${domainLabel}`;
}
