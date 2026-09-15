/**
 * Renders one Materialien page per entry: the templates, HTML fragments and wording of the
 * Fach overview and the Ergebniszusammenfassung. Every figure it prints comes from
 * `MaterialSubjectContext`, which reads the SL data port; this file computes nothing.
 */

import { escapeHtml } from '@tba3/module-base/utils/escapeHtml.js';
import { getCompetencyAppearance } from '../../../common/services/themeService.js';
import { formatStandardBands } from '../../utils/slCompetenceLevels.js';
import { normalizeDataSubjectName } from '../../utils/slSubjectConfig.js';
import { iconSvg } from '@tba3/module-base/utils/icons.js';
import {
    EPSILON,
    formatNumber,
    formatPercent,
    formatPercentPointDelta,
    formatPercentRange,
    formatPlainRange,
    formatStudentSummary,
    isFiniteNumber,
} from './materialFormat.js';
import { MaterialSubjectContext } from './materialSubjectContext.js';
import { resolveTemplateChoicePlaceholders } from './materialTemplateChoices.js';

const MATERIAL_REPORT_YEAR = '2025'; // ASSUMPTION-SL-MATERIAL-REPORT-YEAR: keep static year until material templates are year-aware.

/**
 * Join class names into one readable phrase (`a, b und c`), falling back to a visible
 * placeholder so an unresolved template reads as unfilled rather than as no classes.
 * @param {Array<string>} [classNames] - The classes to name.
 * @returns {string} The joined, HTML-escaped phrase.
 */
function joinClassLabels(classNames = []) {
    const values = [...new Set((Array.isArray(classNames) ? classNames : []).filter(Boolean))];

    if (values.length === 0) {
        return '<span class="material-template-placeholder">[Klasse]</span>';
    }

    if (values.length === 1) {
        return escapeHtml(values[0]);
    }

    if (values.length === 2) {
        return `${escapeHtml(values[0])} und ${escapeHtml(values[1])}`;
    }

    return `${values
        .slice(0, -1)
        .map((value) => escapeHtml(value))
        .join(', ')} und ${escapeHtml(values.at(-1))}`;
}

/**
 * Pick the wording that matches a difference's direction, treating anything inside
 * `EPSILON` as no difference rather than as a tiny one.
 * @param {*} value - The difference.
 * @param {object} labels - The three wordings to choose between.
 * @param {string} labels.positive - Used above the threshold.
 * @param {string} labels.negative - Used below it.
 * @param {string} labels.neutral - Used within it, and when there is no figure at all.
 * @returns {string} The chosen wording.
 */
function resolveDirectionalLabel(value, { positive, negative, neutral }) {
    if (!isFiniteNumber(value)) {
        return neutral;
    }

    if (value > EPSILON) {
        return positive;
    }

    if (value < -EPSILON) {
        return negative;
    }

    return neutral;
}

/**
 * Column header for the share of students on the levels `ge_3` picks out.
 *
 * Names the Kompetenzstufe the rank resolves to on the loaded scale (`III`, `KS 3`,
 * `ReStd bzw. B1`), never the KMK standard behind it: which Kompetenzstufe counts as
 * the Regelstandard depends on the Schulabschluss the payload does not carry, and a GER
 * ladder has no direct correspondence to a standard name at all.
 * @param {string} bands - The bands `ge_3` resolves to, already phrased off the loaded scales.
 * @returns {string} The header's HTML; names no band when no loaded scale has a level of that rank.
 */
function regularStandardColumnHeader(bands) {
    return bands ? `Anteil<br>>= ${escapeHtml(bands)}` : 'Anteil<br>obere Stufen';
}

export class MaterialContentResolver {
    #subjectContext;

    /**
     * @param {object} [options] - Where the data comes from.
     * @param {import('../../slData.js').SlData} [options.slData] - The SL data port; without one every section renders empty.
     */
    constructor({ slData } = /** @type {any} */ ({})) {
        this.#subjectContext = new MaterialSubjectContext({ slData });
    }

    renderEntry(entry) {
        const normalizedSubjectName = normalizeDataSubjectName(entry?.subject) ?? '';
        let markup = '';

        switch (entry?.pageKind) {
            case 'subjectOverviewTemplate':
                markup = this.#renderSubjectOverview(entry, normalizedSubjectName);
                break;
            case 'subjectResultSummaryTemplate':
                markup = this.#renderSubjectResultSummary(entry, normalizedSubjectName);
                break;
            default:
                markup = '';
        }

        return resolveTemplateChoicePlaceholders(
            markup,
            `${normalizedSubjectName}|${entry?.pageKind ?? ''}|${entry?.displayTitle ?? ''}`,
        );
    }

    #renderSubjectOverview(entry, subjectName) {
        const context = this.#subjectContext.buildSubjectContext(subjectName);
        const headerStage = escapeHtml(context.classStage ?? '[Klassenstufe]');
        const title = escapeHtml(entry.displayTitle);
        const subtitle = escapeHtml(entry.subtitle);
        const solutionDirection = resolveDirectionalLabel(context.solutionRateDelta, {
            positive: 'über',
            negative: 'unter',
            neutral: 'auf Höhe von',
        });
        const standardDirection = resolveDirectionalLabel(context.regularStandardDelta, {
            positive: 'mehr',
            negative: 'weniger',
            neutral: 'gleich viele',
        });
        // The sentence names the Kompetenzstufe the rank resolves to (`III`, `KS 3`,
        // `ReStd bzw. B1`), read from the loaded scale — not the KMK standard behind it,
        // for the reason in `regularStandardColumnHeader`.
        // Resolved once for the whole page: the same alias feeds the bullet below and all
        // three table headers, and each resolution is a scan of every registered level.
        const regularStandardBands = formatStandardBands('ge_3') ?? '';
        const regularStandardPhrase = regularStandardBands
            ? `Kompetenzstufe ${escapeHtml(regularStandardBands)}`
            : 'die oberen Kompetenzstufen';
        const regularStandardHeader = regularStandardColumnHeader(regularStandardBands);
        // The survey block's heading names the measures it is about, so it has to shrink
        // with them rather than promise a Selbsteinschätzung the page no longer shows.
        const hasSurveyBlock = context.hasTeachingQuality || context.hasSelfEfficacy;
        const surveyBlockHeading =
            context.hasTeachingQuality && context.hasSelfEfficacy
                ? 'Unterrichtsqualität &amp; Selbsteinschätzung der Lernenden'
                : context.hasTeachingQuality
                  ? 'Unterrichtsqualität'
                  : 'Selbsteinschätzung der Lernenden';
        // Lösungsquote, not a survey measure — it moves up to the performance block
        // rather than disappearing with the section that happens to host it.
        const bestOverallBullet = `<li>Die insgesamt besten Ergebnisse im Fach erreicht die Klasse ${joinClassLabels([...context.bestClasses.solutionRate])}.</li>`;

        return `
            <article class="material-page material-page--overview">
                <header class="material-page-header">
                    <h2 class="material-page-title">${title}</h2>
                    <p class="material-page-subtitle">${subtitle}</p>
                    <div class="material-page-badge"><span>VERA-${headerStage}</span><span class="material-template-placeholder">${MATERIAL_REPORT_YEAR}</span></div>
                </header>

                <section class="material-section">
                    <table class="material-metric-table material-metric-table--overview">
                        <thead>
                            <tr>
                                <th>Getestete Schüler:innen</th>
                                <th>Ø Lösungsquote</th>
                                <th>${regularStandardHeader}</th>
                                ${context.hasTeachingQuality ? '<th>Ø berichtete<br>Unterrichtsqualität</th>' : ''}
                                ${context.hasSelfEfficacy ? '<th>Ø Selbstwirksamkeit</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${formatStudentSummary(context.schoolMetrics.studentCount, context.schoolMetrics.femaleShare)}</td>
                                <td>${this.#renderMetricWithRange(context.schoolMetrics.solutionRate, context.ranges.solutionRate, 'percent')}</td>
                                <td>${this.#renderMetricWithRange(context.schoolMetrics.regularStandardShare, context.ranges.regularStandardShare, 'percent')}</td>
                                ${context.hasTeachingQuality ? `<td>${this.#renderMetricWithRange(context.schoolMetrics.teachingQualityMean, context.ranges.teachingQualityMean, 'plain')}</td>` : ''}
                                ${context.hasSelfEfficacy ? `<td>${this.#renderMetricWithRange(context.schoolMetrics.selfEfficacyMean, context.ranges.selfEfficacyMean, 'plain')}</td>` : ''}
                            </tr>
                        </tbody>
                    </table>
                </section>

                <section class="material-overview-layout">
                    ${this.#renderDistributionColumn(context.distributionGroups)}

                    <div class="material-copy-column">
                        <section class="material-copy-block">
                            <h3>Leistung im Vergleich:</h3>
                            <ul>
                                <li>Die erreichte durchschnittliche Lösungsquote liegt <span class="material-template-placeholder">[etwas; deutlich]</span> ${escapeHtml(solutionDirection)} dem Landesmittelwert (Δ ${formatPercentPointDelta(context.solutionRateDelta)}).</li>
                                <li>Dabei erreichen bzw. übertreffen ${escapeHtml(standardDirection)} Schülerinnen und Schüler ${regularStandardPhrase} als an anderen Schulen im Land (Δ ${formatPercentPointDelta(context.regularStandardDelta)}).</li>
                                <li>Die Ergebnisse unterscheiden sich zwischen den Klassen <span class="material-template-placeholder">[kaum; moderat; deutlich]</span>, d.h. die Klassen Ihrer Schule sind in Bezug auf die Gesamtergebnisse <span class="material-template-placeholder">[eher homogen; eher heterogen; heterogen]</span>.</li>
                                <li>Im Vergleich zum Vorjahr sind die Ergebnisse im Fach <span class="material-template-placeholder">[schlechter; gleich; besser]</span>.</li>
                                ${hasSurveyBlock ? '' : bestOverallBullet}
                            </ul>
                        </section>

                        ${
                            hasSurveyBlock
                                ? `
                        <section class="material-copy-block">
                            <h3>${surveyBlockHeading}:</h3>
                            <ul>
                                ${context.hasTeachingQuality ? '<li>Der Fach-Unterricht an Ihrer Schule wird von den Schülerinnen und Schülern grundsätzlich <span class="material-template-placeholder">[gut; mittelmäßig; schlecht]</span> bewertet, die Klassen unterscheiden sich in diesem Urteil <span class="material-template-placeholder">[kaum; moderat; deutlich]</span>.</li>' : ''}
                                ${context.hasSelfEfficacy ? '<li>Das Selbstwirksamkeitsempfinden der Schülerinnen und Schüler ist <span class="material-template-placeholder">[gering; moderat; hoch]</span>, die Klassen unterscheiden sich in dieser Selbsteinschätzung <span class="material-template-placeholder">[kaum; moderat; deutlich]</span>.</li>' : ''}
                                ${context.hasTeachingQuality ? `<li>Das beste Urteil erhält dabei der Unterricht der Klasse ${joinClassLabels([...context.bestClasses.teachingQualityMean])}.</li>` : ''}
                                ${context.hasSelfEfficacy ? `<li>Die höchste Selbstwirksamkeit empfinden Schüler:innen und Schüler der Klasse ${joinClassLabels([...context.bestClasses.selfEfficacyMean])}.</li>` : ''}
                                ${bestOverallBullet}
                            </ul>
                        </section>
                        `
                                : ''
                        }
                    </div>
                </section>
            </article>
        `;
    }

    #renderSubjectResultSummary(entry, subjectName) {
        const context = this.#subjectContext.buildSubjectContext(subjectName);
        // Resolved once for both tables below: each resolution scans every registered level.
        const regularStandardHeader = regularStandardColumnHeader(
            formatStandardBands('ge_3') ?? '',
        );
        const title = escapeHtml(entry.displayTitle);
        const headerStage = escapeHtml(context.classStage ?? '[Klassenstufe]');

        return `
            <article class="material-page material-page--results">
                <header class="material-page-header">
                    <h2 class="material-page-title">${title}</h2>
                    <div class="material-page-badge"><span>VERA-${headerStage}</span><span class="material-template-placeholder">${MATERIAL_REPORT_YEAR}</span></div>
                </header>

                <section class="material-section">
                    <h3 class="material-section-title">Schulergebnisse:</h3>
                    <table class="material-metric-table material-metric-table--results">
                        <thead>
                            <tr>
                                <th>Getestete Schüler:innen</th>
                                <th>Ø Lösungsquote</th>
                                <th>${regularStandardHeader}</th>
                                ${context.hasTeachingQuality ? '<th>Ø berichtete<br>Unterrichtsqualität</th>' : ''}
                                ${context.hasSelfEfficacy ? '<th>Ø Selbstwirksamkeit</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td>${formatStudentSummary(context.schoolMetrics.studentCount, context.schoolMetrics.femaleShare)}</td>
                                <td>${formatPercent(context.schoolMetrics.solutionRate)}</td>
                                <td>${formatPercent(context.schoolMetrics.regularStandardShare)}</td>
                                ${context.hasTeachingQuality ? `<td>${formatNumber(context.schoolMetrics.teachingQualityMean)}</td>` : ''}
                                ${context.hasSelfEfficacy ? `<td>${formatNumber(context.schoolMetrics.selfEfficacyMean)}</td>` : ''}
                            </tr>
                        </tbody>
                    </table>
                </section>

                <section class="material-section">
                    <h3 class="material-section-title">Klassenergebnisse:</h3>
                    <table class="material-metric-table material-metric-table--results material-metric-table--class-results">
                        <thead>
                            <tr>
                                <th></th>
                                <th>Getestete Schüler:innen</th>
                                <th>Ø Lösungsquote</th>
                                <th>${regularStandardHeader}</th>
                                ${context.hasTeachingQuality ? '<th>Ø berichtete<br>Unterrichtsqualität</th>' : ''}
                                ${context.hasSelfEfficacy ? '<th>Ø Selbstwirksamkeit</th>' : ''}
                            </tr>
                        </thead>
                        <tbody>
                            ${context.classMetrics.map((row) => this.#renderClassResultRow(row, context)).join('')}
                        </tbody>
                    </table>
                    <p class="material-inline-note">Beste Klassen pro Kennzahl sind mit dem Symbol ${iconSvg('trophy', { className: 'material-best-metric-icon material-inline-symbol' })} markiert.</p>
                </section>
            </article>
        `;
    }

    /**
     * @param {object} row - one class's metrics
     * @param {object} context - the subject context; supplies `bestClasses` and the
     *        survey-scale flags, which must match the header this row sits under.
     * @returns {string} The row's HTML.
     */
    #renderClassResultRow(row, context) {
        const { bestClasses, hasTeachingQuality, hasSelfEfficacy } = context;
        const rowLabel = `${escapeHtml(row.className)} <span class="material-template-placeholder">[Lehrer:in]</span>`;

        return `
            <tr>
                <th scope="row" class="material-result-row-label">${rowLabel}</th>
                <td>${formatStudentSummary(row.studentCount, row.femaleShare)}</td>
                <td>${this.#renderBestMetricCell(formatPercent(row.solutionRate), bestClasses.solutionRate.has(row.className))}</td>
                <td>${this.#renderBestMetricCell(formatPercent(row.regularStandardShare), bestClasses.regularStandardShare.has(row.className))}</td>
                ${hasTeachingQuality ? `<td>${this.#renderBestMetricCell(formatNumber(row.teachingQualityMean), bestClasses.teachingQualityMean.has(row.className))}</td>` : ''}
                ${hasSelfEfficacy ? `<td>${this.#renderBestMetricCell(formatNumber(row.selfEfficacyMean), bestClasses.selfEfficacyMean.has(row.className))}</td>` : ''}
            </tr>
        `;
    }

    #renderBestMetricCell(valueMarkup, isBest) {
        return `
            <div class="material-best-metric${isBest ? ' is-best' : ''}">
                <span>${valueMarkup}</span>
                ${isBest ? iconSvg('trophy', { className: 'material-best-metric-icon' }) : ''}
            </div>
        `;
    }

    #renderMetricWithRange(value, range, metricType) {
        const formattedValue =
            metricType === 'percent' ? formatPercent(value) : formatNumber(value);
        const formattedRange =
            metricType === 'percent' ? formatPercentRange(range) : formatPlainRange(range);

        return `
            <div class="material-metric-stack">
                <span>${formattedValue}</span>
                <span class="material-metric-range">(${formattedRange})</span>
            </div>
        `;
    }

    #renderDistributionColumn(distributionGroups = []) {
        return `
            <div class="material-distribution-column">
                ${distributionGroups
                    .map((group, index) =>
                        this.#renderDistributionGroup(group, {
                            showDomainTitle: distributionGroups.length > 1,
                            groupIndex: index,
                        }),
                    )
                    .join('')}
            </div>
        `;
    }

    #renderDistributionGroup(
        group,
        { showDomainTitle = false, groupIndex = 0 } = /** @type {any} */ ({}),
    ) {
        const domainTitle = showDomainTitle
            ? `<h3 class="material-distribution-group-title">${escapeHtml(group?.domainName ?? `Domäne ${groupIndex + 1}`)}</h3>`
            : '';

        return `
            <section class="material-distribution-group">
                ${domainTitle}
                <div class="material-distribution-group-panels">
                    ${this.#renderDistributionPanel(group?.schoolDistribution, 'Schule')}
                    ${this.#renderDistributionPanel(group?.stateDistribution, 'Land')}
                </div>
            </section>
        `;
    }

    #renderDistributionPanel(distribution, targetLabel) {
        const safeTargetLabel = escapeHtml(targetLabel);
        const visibleLevels = Array.isArray(distribution?.levels)
            ? distribution.levels.filter(
                  (level) => isFiniteNumber(level?.share) && level.share > EPSILON,
              )
            : [];

        if (visibleLevels.length === 0) {
            return `
                <div class="material-distribution-panel material-distribution-panel--empty">
                    <div class="material-distribution-panel-body">
                        <div class="material-distribution-panel-title">${safeTargetLabel}</div>
                        <div class="material-distribution-panel-empty">&mdash;</div>
                    </div>
                </div>
            `;
        }

        const ariaLabel = `${targetLabel}: ${visibleLevels.map((level) => `${level.label} ${formatPercent(level.share)}`).join(', ')}`;

        return `
            <section class="material-distribution-panel">
                <div class="material-distribution-panel-body">
                    <h4 class="material-distribution-panel-title">${safeTargetLabel}</h4>
                    <div class="material-distribution-chart" role="img" aria-label="${escapeHtml(ariaLabel)}">
                        <div class="material-distribution-stack-vertical">
                            ${visibleLevels.map((level) => this.#renderDistributionSegment(level)).join('')}
                        </div>
                    </div>
                </div>
            </section>
        `;
    }

    #renderDistributionSegment(level) {
        const showLabel = isFiniteNumber(level?.share) && level.share >= 0.08;
        const appearance = getCompetencyAppearance(level?.label, level?.scaleId);
        const levelClassToken =
            appearance?.patternKey ??
            String(level?.label ?? '')
                .trim()
                .replace(/\s+/g, '-');
        const baseColor = appearance?.baseColor ?? level.color;
        const labelClassName = appearance
            ? 'material-distribution-stack-segment-label stacked-bar-label'
            : 'material-distribution-stack-segment-label';
        const tooltipText = `${escapeHtml(level.label)}: ${formatPercent(level.share)}`;

        return `
            <div class="material-distribution-stack-segment stacked-bar-segment competency-level level-${escapeHtml(levelClassToken)}${showLabel ? '' : ' is-compact'}" style="--distribution-share:${level.share}; --ks-band-color:${baseColor};" data-tooltip-text="${tooltipText}">
                ${showLabel ? `<span class="${labelClassName}">${escapeHtml(level.label)}</span>` : ''}
            </div>
        `;
    }
}
