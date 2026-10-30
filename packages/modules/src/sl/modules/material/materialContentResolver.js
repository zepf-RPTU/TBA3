/**
 * Renders the material pages of one Fach: the templates, HTML fragments and wording of
 * the Fach overview and the Ergebniszusammenfassung. Every figure it prints comes from
 * the Fach's context (`materialSubjectContext.js`); this file computes nothing.
 */

import { cssVarsAttr, escapeHtml, iconSvg } from '@tba3/module-base';
import { glossaryRunsMarkup } from '@tba3/module-base/glossary';
import { getCompetenceAppearance } from '../../../common/services/themeService.js';
import { inkToken } from '../../../common/services/paletteTokens.js';
import {
    MISSING_VALUE,
    formatDecimal,
    formatShare,
    getListFormat,
    isFiniteNumber,
} from '../../../common/utils/numberFormat.js';
import { getCompetenceLevelClassToken } from '../../../common/services/competenceLevelPaint.js';
import {
    EPSILON,
    formatPercentPointDelta,
    formatRange,
    formatStudentSummary,
} from './materialFormat.js';
import { PERFORMANCE_KEYS, SURVEY_KEYS } from './materialSubjectContext.js';
import {
    groupSpreadWords,
    previousYearWord,
    selfEfficacyWord,
    stateDeltaWord,
    surveySpreadWord,
    teachingQualityWord,
} from './materialPhrases.js';
import { DATA_MARK_CLASS } from '../../../common/services/dataMark.js';
import { TERM_CONSTANTS } from '../../../common/domain/terms.js';

/** @typedef {import('./materialSubjectContext.js').MaterialSubjectContextData} MaterialSubjectContextData */
/** @typedef {import('./materialSubjectContext.js').MaterialMetrics} MaterialMetrics */
/** @typedef {import('./materialSubjectContext.js').MaterialDistributionLevel} MaterialDistributionLevel */

/**
 * A level drawn without a registered band: the default bar fill, with its label ink.
 * @returns {{baseColor: string, ink: string, patternKey: string}}
 */
function defaultBandAppearance() {
    return {
        baseColor: 'var(--default-bar-color)',
        ink: inkToken('var(--default-bar-color)'),
        patternKey: '',
    };
}

/**
 * Join group names into one readable phrase (`a, b und c`).
 * @param {Iterable<string|null>} groupNames - The groups to name; blanks are skipped.
 * @returns {string} The joined, HTML-escaped phrase.
 */
function joinGroupLabels(groupNames) {
    const values = [...new Set(groupNames)].filter(Boolean);
    return getListFormat().format(values.map((value) => escapeHtml(value)));
}

/**
 * Pick the wording that matches a difference's direction, treating anything inside
 * `EPSILON` as no difference rather than as a tiny one.
 * @param {number} value
 * @param {{positive: string, negative: string, neutral: string}} labels
 * @returns {string}
 */
function directionalLabel(value, { positive, negative, neutral }) {
    return value > EPSILON ? positive : value < -EPSILON ? negative : neutral;
}

/** @typedef {import('./materialSubjectContext.js').MaterialDomain} MaterialDomain */
/** @typedef {import('./materialSubjectContext.js').MaterialPerformance} MaterialPerformance */
/** @typedef {keyof MaterialPerformance} PerformanceKey */
/** @typedef {keyof import('./materialSubjectContext.js').SurveyMap<unknown>} SurveyKey */

/**
 * How a Kennzahl's column is headed and its value printed. The Regelstandard header
 * (`header: null`) names the Kompetenzstufe the band alias resolves to on the loaded scale
 * (`III`, `KS 3`, `ReStd bzw. B1`), never the KMK standard behind it. A survey Kennzahl
 * names the context flag that says whether the dataset carries that scale.
 * @type {Record<PerformanceKey | SurveyKey, {header: string|null, format: (value: number|null) => string, scaleFlag?: 'hasTeachingQuality'|'hasSelfEfficacy'}>}
 */
const METRIC_PRESENTATION = {
    solutionRate: { header: 'Ø Lösungsquote', format: (value) => formatShare(value) },
    mediumOrAboveShare: { header: null, format: (value) => formatShare(value) },
    teachingQualityMean: {
        header: 'Ø berichtete<br>Unterrichtsqualität',
        format: (value) => formatDecimal(value, 1),
        scaleFlag: 'hasTeachingQuality',
    },
    selfEfficacyMean: {
        header: 'Ø Selbstwirksamkeit',
        format: (value) => formatDecimal(value, 1),
        scaleFlag: 'hasSelfEfficacy',
    },
};

/**
 * The survey Kennzahlen a page shows: only those whose scale the dataset carries.
 * @param {MaterialSubjectContextData} context
 * @returns {SurveyKey[]} In column order.
 */
function visibleSurveyKeys(context) {
    return SURVEY_KEYS.filter((key) => {
        const { scaleFlag } = METRIC_PRESENTATION[key];
        return !scaleFlag || context[scaleFlag];
    });
}

/**
 * @param {PerformanceKey | SurveyKey} key
 * @param {MaterialSubjectContextData} context
 * @returns {string} Its column header.
 */
function metricHeader(key, context) {
    const { bands } = context.mediumOrAbove;
    return (
        METRIC_PRESENTATION[key].header ??
        (bands ? `Anteil<br>≥ ${escapeHtml(bands)}` : 'Anteil<br>obere Stufen')
    );
}

/**
 * Whether the Fach's figures are split by Domäne: only a Fach with several Domänen that
 * have their own competence levels is. One Domäne, or Fach-level levels, reads as the Fach.
 * @param {MaterialSubjectContextData} context
 * @returns {boolean} Whether to name the Domänen.
 */
function isSplitByDomain(context) {
    return context.domains.length > 1;
}

/**
 * What a page needs beyond the Fach's figures: the palette paints the distribution bars,
 * the glossary links each Domäne to its entry.
 * @typedef {{palette: import('../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette, glossary: import('../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator}} MaterialPageTools
 */

/**
 * A Domäne's name, linked to the entry for that Domäne of that Fach: a name like `Lesen`
 * names a Domäne of several Fächer, so the page's annotation must not match it.
 * @param {{domainId: string|null, domainName: string|null}} domain
 * @param {number} index - Its position, for the rows of a split Fach that name no Domäne.
 * @param {string} subjectName
 * @param {import('../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @returns {string} Its display name as markup.
 */
function domainLabel(domain, index, subjectName, glossary) {
    if (domain.domainName === null) return `Domäne ${index + 1}`;
    return glossaryRunsMarkup([
        {
            text: domain.domainName,
            glossaryKey: glossary.resolveDomainEntryKey(domain.domainId, subjectName),
        },
    ]);
}

/** A Fach with no school value group: one row of dashes, as an empty dataset reads. */
const EMPTY_DOMAIN = /** @type {MaterialDomain} */ (
    Object.freeze({
        domainId: null,
        domainName: null,
        schoolDistribution: null,
        stateDistribution: null,
        school: { solutionRate: null, mediumOrAboveShare: null },
        groups: new Map(),
        ranges: { solutionRate: null, mediumOrAboveShare: null },
        bestGroups: { solutionRate: new Set(), mediumOrAboveShare: new Set() },
        solutionRateDelta: null,
        mediumOrAboveDelta: null,
        previousYear: null,
    })
);

/**
 * @param {MaterialSubjectContextData} context
 * @returns {MaterialDomain[]} The Domänen the tables have rows or columns for; never empty.
 */
function tableDomains(context) {
    return context.domains.length > 0 ? context.domains : [EMPTY_DOMAIN];
}

/**
 * The `<thead>` rows of the results tables: one header row, or, split by Domäne, the
 * Domänen over their Kennzahlen with the Fach-level columns spanning both rows.
 * @param {MaterialSubjectContextData} context
 * @param {boolean} withRowLabel - Whether the table opens with a row-label column.
 * @param {import('../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @returns {string}
 */
function renderResultHeaderRows(context, withRowLabel, glossary) {
    const split = isSplitByDomain(context);
    const span = split ? ' rowspan="2"' : '';
    const performanceHeaders = PERFORMANCE_KEYS.map(
        (key) => `<th scope="col">${metricHeader(key, context)}</th>`,
    ).join('');
    // The corner names the row headers' column for assistive tech; on paper the rows
    // say it themselves.
    const first = [
        withRowLabel
            ? `<th${span} scope="col"><span class="visually-hidden">${escapeHtml(TERM_CONSTANTS.GROUP)}</span></th>`
            : '',
        `<th${span} scope="col">Getestete Schüler:innen</th>`,
        split
            ? context.domains
                  .map(
                      (domain, index) =>
                          `<th colspan="${PERFORMANCE_KEYS.length}" scope="colgroup">${domainLabel(domain, index, context.subjectName, glossary)}</th>`,
                  )
                  .join('')
            : performanceHeaders,
        ...visibleSurveyKeys(context).map(
            (key) => `<th${span} scope="col">${metricHeader(key, context)}</th>`,
        ),
    ].join('');
    const second = split
        ? `<tr>${context.domains.map(() => performanceHeaders).join('')}</tr>`
        : '';
    return `<tr>${first}</tr>${second}`;
}

/**
 * The data cells of one results row: the headcount, each Domäne's Kennzahlen, then the
 * survey Kennzahlen.
 * @param {MaterialMetrics} metrics - The row's Fach-level figures.
 * @param {MaterialSubjectContextData} context
 * @param {(domain: MaterialDomain) => MaterialPerformance|undefined} performanceOf - The row's figures in one Domäne.
 * @param {(key: PerformanceKey | SurveyKey, formatted: string, domain: MaterialDomain|null) => string} renderValue - A Kennzahl cell's content; `domain` is `null` for a survey cell.
 * @returns {string} The `<td>` cells.
 */
function renderResultCells(metrics, context, performanceOf, renderValue) {
    return [
        `<td>${formatStudentSummary(metrics.studentCount, metrics.femaleShare)}</td>`,
        ...tableDomains(context).flatMap((domain) =>
            PERFORMANCE_KEYS.map((key) => {
                const value = performanceOf(domain)?.[key] ?? null;
                return `<td>${renderValue(key, METRIC_PRESENTATION[key].format(value), domain)}</td>`;
            }),
        ),
        ...visibleSurveyKeys(context).map(
            (key) =>
                `<td>${renderValue(key, METRIC_PRESENTATION[key].format(metrics[key]), null)}</td>`,
        ),
    ].join('');
}

/**
 * The page head: title, the optional subtitle and the VERA badge.
 * @param {object} page
 * @param {string} page.title - The page title, unescaped.
 * @param {string} [page.subtitle] - The subtitle, unescaped; no subtitle line without one.
 * @param {string|null} page.veraStage - The VERA stage; the badge names none without it.
 * @param {string|null} page.reportYear - The year the results are of; the badge names none without it.
 * @returns {string} The `<header>` markup.
 */
function renderPageHeader({ title, subtitle, veraStage, reportYear }) {
    const vera = veraStage ? `VERA-${escapeHtml(veraStage)}` : 'VERA';
    const subtitleLine =
        subtitle === undefined
            ? ''
            : `<p class="material-page-subtitle">${escapeHtml(subtitle)}</p>`;

    return `
                <header class="material-page-header">
                    <h2 class="material-page-title">${escapeHtml(title)}</h2>
                    ${subtitleLine}
                    <div class="material-page-badge"><span>${vera}</span>${reportYear ? `<span>${escapeHtml(reportYear)}</span>` : ''}</div>
                </header>`;
}

/**
 * The "Leistung im Vergleich" bullets of one Domäne, closed by its best group. A bullet
 * whose figure is missing is left out, the best group's too. Split by Domäne, the wording
 * names the Domäne rather than the Fach.
 * @param {MaterialDomain} domain
 * @param {MaterialSubjectContextData} context
 * @returns {string[]} The `<li>` items.
 */
function performanceBullets(domain, context) {
    const { solutionRateDelta, mediumOrAboveDelta, previousYear } = domain;
    const spread = domain.ranges.solutionRate;
    const bands = context.mediumOrAbove.bands;
    const split = isSplitByDomain(context);
    const mediumOrAbovePhrase = bands
        ? `Kompetenzstufe ${escapeHtml(bands)}`
        : 'die oberen Kompetenzstufen';
    const bullets = [];

    if (solutionRateDelta !== null) {
        const direction = directionalLabel(solutionRateDelta, {
            positive: 'über',
            negative: 'unter',
            neutral: 'auf Höhe von',
        });
        const intensity =
            Math.abs(solutionRateDelta) > EPSILON ? `${stateDeltaWord(solutionRateDelta)} ` : '';
        bullets.push(
            `<li>Die erreichte durchschnittliche Lösungsquote liegt ${intensity}${direction} dem Landesmittelwert (Δ ${formatPercentPointDelta(solutionRateDelta)}).</li>`,
        );
    }
    if (mediumOrAboveDelta !== null) {
        const direction = directionalLabel(mediumOrAboveDelta, {
            positive: 'mehr',
            negative: 'weniger',
            neutral: 'gleich viele',
        });
        bullets.push(
            `<li>Dabei erreichen bzw. übertreffen ${direction} Schülerinnen und Schüler ${mediumOrAbovePhrase} als an anderen Schulen im Land (Δ ${formatPercentPointDelta(mediumOrAboveDelta)}).</li>`,
        );
    }
    if (spread) {
        const words = groupSpreadWords(spread.max - spread.min);
        bullets.push(
            `<li>Die Ergebnisse unterscheiden sich zwischen den Lerngruppen ${words.spread}, d.h. die Lerngruppen Ihrer Schule sind in Bezug auf die ${split ? 'Ergebnisse in dieser Domäne' : 'Gesamtergebnisse'} ${words.homogeneity}.</li>`,
        );
    }
    if (previousYear !== null) {
        bullets.push(
            `<li>Im Vergleich zu ${escapeHtml(previousYear.year)} sind die Ergebnisse ${split ? 'in dieser Domäne' : 'im Fach'} ${previousYearWord(previousYear.delta)} (Anteil ${bands ? `ab Kompetenzstufe ${escapeHtml(bands)}` : 'auf den oberen Kompetenzstufen'}: Δ ${formatPercentPointDelta(previousYear.delta)}).</li>`,
        );
    }
    if (domain.bestGroups.solutionRate.size > 0) {
        bullets.push(
            `<li>Die ${split ? 'besten Ergebnisse in dieser Domäne' : 'insgesamt besten Ergebnisse im Fach'} erreicht die Lerngruppe ${joinGroupLabels(domain.bestGroups.solutionRate)}.</li>`,
        );
    }
    return bullets;
}

/**
 * The survey bullets: how the teaching is rated and how strong the Selbstwirksamkeit is,
 * each with how much the groups differ (left out without the school's mean or the groups'
 * spread), then the best group per scale (left out when no group of the Fach has a value).
 * @param {MaterialSubjectContextData} context
 * @returns {string[]} The `<li>` items.
 */
function surveyBullets(context) {
    const { teachingQualityMean, selfEfficacyMean } = context.schoolMetrics;
    const tqRange = context.ranges.teachingQualityMean;
    const seRange = context.ranges.selfEfficacyMean;
    const bullets = [];

    if (context.hasTeachingQuality && teachingQualityMean !== null && tqRange) {
        bullets.push(
            `<li>Der Fach-Unterricht an Ihrer Schule wird von den Schülerinnen und Schülern grundsätzlich ${teachingQualityWord(teachingQualityMean)} bewertet, die Lerngruppen unterscheiden sich in diesem Urteil ${surveySpreadWord(tqRange.max - tqRange.min)}.</li>`,
        );
    }
    if (context.hasSelfEfficacy && selfEfficacyMean !== null && seRange) {
        bullets.push(
            `<li>Das Selbstwirksamkeitsempfinden der Schülerinnen und Schüler ist ${selfEfficacyWord(selfEfficacyMean)}, die Lerngruppen unterscheiden sich in dieser Selbsteinschätzung ${surveySpreadWord(seRange.max - seRange.min)}.</li>`,
        );
    }
    // The flags are the dataset's: a Fach none of whose groups was rated has no best group.
    if (context.hasTeachingQuality && context.bestGroups.teachingQualityMean.size > 0) {
        bullets.push(
            `<li>Das beste Urteil erhält dabei der Unterricht der Lerngruppe ${joinGroupLabels(context.bestGroups.teachingQualityMean)}.</li>`,
        );
    }
    if (context.hasSelfEfficacy && context.bestGroups.selfEfficacyMean.size > 0) {
        bullets.push(
            `<li>Die höchste Selbstwirksamkeit empfinden Schülerinnen und Schüler der Lerngruppe ${joinGroupLabels(context.bestGroups.selfEfficacyMean)}.</li>`,
        );
    }
    return bullets;
}

/**
 * The overview table's header: a Domäne column when split, then the Kennzahlen in their
 * usual order.
 * @param {MaterialSubjectContextData} context
 * @returns {string} The `<th>` cells.
 */
function renderOverviewHeaderCells(context) {
    return [
        isSplitByDomain(context)
            ? `<th scope="col"><span class="visually-hidden">${escapeHtml(TERM_CONSTANTS.DOMAIN)}</span></th>`
            : '',
        '<th scope="col">Getestete Schüler:innen</th>',
        ...[...PERFORMANCE_KEYS, ...visibleSurveyKeys(context)].map(
            (key) => `<th scope="col">${metricHeader(key, context)}</th>`,
        ),
    ].join('');
}

/**
 * The overview table's rows: one per Domäne with the school's Kennzahlen there over the
 * groups' range. The headcount and the survey Kennzahlen are the Fach's, so they appear
 * once, spanning every row.
 * @param {MaterialSubjectContextData} context
 * @param {import('../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @returns {string} The `<tr>` rows.
 */
function renderOverviewRows(context, glossary) {
    const domains = tableDomains(context);
    const split = isSplitByDomain(context);
    const span = split ? ` rowspan="${domains.length}"` : '';
    const { schoolMetrics } = context;
    const fachCells = (/** @type {SurveyKey[]} */ keys) =>
        keys
            .map((key) => {
                const formatted = METRIC_PRESENTATION[key].format(schoolMetrics[key]);
                return `<td${span}>${renderMetricWithRange(key, formatted, context.ranges[key])}</td>`;
            })
            .join('');

    return domains
        .map((domain, index) => {
            const label = split
                ? `<th scope="row" class="material-result-row-label">${domainLabel(domain, index, context.subjectName, glossary)}</th>`
                : '';
            const performance = PERFORMANCE_KEYS.map((key) => {
                const formatted = METRIC_PRESENTATION[key].format(domain.school[key]);
                return `<td>${renderMetricWithRange(key, formatted, domain.ranges[key])}</td>`;
            }).join('');
            const first = index === 0;
            return `<tr>${label}${first ? `<td${span}>${formatStudentSummary(schoolMetrics.studentCount, schoolMetrics.femaleShare)}</td>` : ''}${performance}${first ? fachCells(visibleSurveyKeys(context)) : ''}</tr>`;
        })
        .join('');
}

/**
 * Why Lösungsquoten read `–`: the Fach, or the Domänen named, were sat in several
 * booklets.
 * @param {MaterialSubjectContextData} context
 * @param {MaterialPageTools['glossary']} glossary - Links each Domäne named to its entry.
 * @returns {string} The note's HTML, empty when no Domäne mixes booklets.
 */
function mixedBookletsNote(context, glossary) {
    const mixed = context.domains.filter((domain) => domain.mixedBooklets);
    if (mixed.length === 0) return '';
    if (!isSplitByDomain(context)) {
        return '<p class="material-inline-note">In diesem Fach wurden unterschiedliche Testhefte bearbeitet; Lösungsquoten sind daher nicht vergleichbar und werden nicht gezeigt.</p>';
    }
    const names = getListFormat().format(
        mixed.map((domain) =>
            domainLabel(domain, context.domains.indexOf(domain), context.subjectName, glossary),
        ),
    );
    return `<p class="material-inline-note">In ${mixed.length === 1 ? 'der Domäne' : 'den Domänen'} ${names} wurden unterschiedliche Testhefte bearbeitet; ihre Lösungsquoten sind daher nicht vergleichbar und werden nicht gezeigt.</p>`;
}

/**
 * The Fach overview: the school's Kennzahlen with the group ranges, the distributions
 * against the Landesschnitt, and the prose.
 * @param {MaterialSubjectContextData} context
 * @param {MaterialPageTools} tools
 * @returns {string} The page's HTML.
 */
function renderSubjectOverview(context, { palette, glossary }) {
    const hasSurveyBlock = context.hasTeachingQuality || context.hasSelfEfficacy;
    const surveyBlockHeading =
        context.hasTeachingQuality && context.hasSelfEfficacy
            ? 'Unterrichtsqualität &amp; Selbsteinschätzung der Lernenden'
            : context.hasTeachingQuality
              ? 'Unterrichtsqualität'
              : 'Selbsteinschätzung der Lernenden';
    const split = isSplitByDomain(context);
    const performance = tableDomains(context)
        .map((domain, index) => {
            const list = `<ul>${performanceBullets(domain, context).join('')}</ul>`;
            return split
                ? `<h4>${domainLabel(domain, index, context.subjectName, glossary)}</h4>${list}`
                : list;
        })
        .join('');

    return `
            <article class="material-page">
                ${renderPageHeader({ title: `Übersicht: ${context.subjectName}`, subtitle: 'Ihre Schule im Überblick:', veraStage: context.veraStage, reportYear: context.reportYear })}

                <section class="material-section">
                    <table class="material-metric-table">
                        <thead>
                            <tr>
                                ${renderOverviewHeaderCells(context)}
                            </tr>
                        </thead>
                        <tbody>
                            ${renderOverviewRows(context, glossary)}
                        </tbody>
                    </table>
                </section>

                <section class="material-overview-layout">
                    ${renderDistributionColumn(context, palette, glossary)}

                    <div class="material-copy-column">
                        <section class="material-copy-block">
                            <h3>Leistung im Vergleich:</h3>
                            ${mixedBookletsNote(context, glossary)}
                            ${performance}
                        </section>

                        ${
                            hasSurveyBlock
                                ? `
                        <section class="material-copy-block">
                            <h3>${surveyBlockHeading}:</h3>
                            <ul>
                                ${surveyBullets(context).join('')}
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

/**
 * The Ergebniszusammenfassung: the school's and every group's Kennzahlen, the best group
 * per Kennzahl marked.
 * @param {MaterialSubjectContextData} context
 * @param {MaterialPageTools} tools
 * @returns {string} The page's HTML.
 */
function renderSubjectResultSummary(context, { glossary }) {
    return `
            <article class="material-page">
                ${renderPageHeader({ title: `Ergebniszusammenfassung: ${context.subjectName}`, veraStage: context.veraStage, reportYear: context.reportYear })}

                <section class="material-section">
                    <h3 class="material-section-title">Schulergebnisse:</h3>
                    <table class="material-metric-table">
                        <thead>
                            ${renderResultHeaderRows(context, false, glossary)}
                        </thead>
                        <tbody>
                            <tr>
                                ${renderResultCells(
                                    context.schoolMetrics,
                                    context,
                                    (domain) => domain.school,
                                    (_key, formatted) => formatted,
                                )}
                            </tr>
                        </tbody>
                    </table>
                </section>

                <section class="material-section">
                    <h3 class="material-section-title">Lerngruppenergebnisse:</h3>
                    <table class="material-metric-table">
                        <thead>
                            ${renderResultHeaderRows(context, true, glossary)}
                        </thead>
                        <tbody>
                            ${context.groupMetrics.map((row) => renderGroupResultRow(row, context)).join('')}
                        </tbody>
                    </table>
                    ${mixedBookletsNote(context, glossary)}
                    <p class="material-inline-note">Beste Lerngruppen pro Kennzahl sind mit dem Symbol ${iconSvg('trophy', { className: 'material-best-metric-icon material-inline-symbol' })} markiert.</p>
                </section>
            </article>
        `;
}

/**
 * The Material page each Seitentyp has: the types `MATERIAL_TYPE_OPTIONS` does not disable.
 * @type {Record<string, (context: MaterialSubjectContextData, tools: MaterialPageTools) => string>}
 */
export const MATERIAL_PAGES = {
    Übersicht: renderSubjectOverview,
    Ergebniszusammenfassung: renderSubjectResultSummary,
};

/**
 * @param {MaterialMetrics} row
 * @param {MaterialSubjectContextData} context - The Fach's context; supplies `bestGroups` and the survey-scale flags, which must match the header this row sits under.
 * @returns {string} The row's HTML.
 */
function renderGroupResultRow(row, context) {
    const rowLabel = escapeHtml(row.groupName);

    return `
            <tr>
                <th scope="row" class="material-result-row-label">${rowLabel}</th>
                ${renderResultCells(
                    row,
                    context,
                    (domain) => domain.groups.get(row.groupName),
                    (key, formatted, domain) =>
                        renderBestMetricCell(
                            formatted,
                            domain
                                ? domain.bestGroups[/** @type {PerformanceKey} */ (key)].has(
                                      row.groupName,
                                  )
                                : context.bestGroups[/** @type {SurveyKey} */ (key)].has(
                                      row.groupName,
                                  ),
                        ),
                )}
            </tr>
        `;
}

/** What the trophy says to assistive tech, which does not see the icon. */
const BEST_GROUP_LABEL = 'beste Lerngruppe';

/**
 * @param {string} valueMarkup - The formatted value.
 * @param {boolean} isBest
 * @returns {string} The cell content, with the trophy for the best group.
 */
function renderBestMetricCell(valueMarkup, isBest) {
    const trophy = isBest
        ? `${iconSvg('trophy', { className: 'material-best-metric-icon' })}<span class="visually-hidden">${BEST_GROUP_LABEL}</span>`
        : '';
    return `
            <div class="material-best-metric${isBest ? ' is-best' : ''}">
                <span>${valueMarkup}</span>
                ${trophy}
            </div>
        `;
}

/**
 * @param {PerformanceKey | SurveyKey} key
 * @param {string} formatted - The school's value.
 * @param {{min: number, max: number}|null} range - The groups' range.
 * @returns {string} The value over its group range.
 */
function renderMetricWithRange(key, formatted, range) {
    return `
            <div class="material-metric-stack">
                <span>${formatted}</span>
                <span class="material-metric-range">(${formatRange(range, METRIC_PRESENTATION[key].format)})</span>
            </div>
        `;
}

/**
 * @param {MaterialSubjectContextData} context - Supplies the Domänen, one distribution each, and their Fach.
 * @param {import('../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @param {import('../../../common/glossary/glossaryAnnotator.js').GlossaryAnnotator} glossary
 * @returns {string}
 */
function renderDistributionColumn(context, palette, glossary) {
    const { domains } = context;
    return `
            <div class="material-distribution-column">
                ${domains
                    .map((group, index) =>
                        renderDistributionGroup(
                            group,
                            domains.length > 1
                                ? domainLabel(group, index, context.subjectName, glossary)
                                : null,
                            palette,
                        ),
                    )
                    .join('')}
            </div>
        `;
}

/**
 * @param {import('./materialSubjectContext.js').MaterialDomainDistribution} group
 * @param {string|null} domainTitleMarkup - The Domäne's name as markup, when the Fach has several Domänen.
 * @param {import('../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @returns {string} The Domäne's school and state panels.
 */
function renderDistributionGroup(group, domainTitleMarkup, palette) {
    const showDomainTitle = domainTitleMarkup !== null;
    const domainTitle = showDomainTitle ? `<h3>${domainTitleMarkup}</h3>` : '';
    // The panels sit one level below the Domäne title, or take its level without one.
    const panelHeadingLevel = showDomainTitle ? 4 : 3;

    return `
            <section class="material-distribution-group">
                ${domainTitle}
                <div class="material-distribution-group-panels">
                    ${renderDistributionPanel(group.schoolDistribution, 'Schule', panelHeadingLevel, palette)}
                    ${renderDistributionPanel(group.stateDistribution, 'Land', panelHeadingLevel, palette)}
                </div>
            </section>
        `;
}

/**
 * @param {{levels: MaterialDistributionLevel[]}|null} distribution
 * @param {string} targetLabel - `Schule` or `Land`.
 * @param {3|4} headingLevel
 * @param {import('../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @returns {string} The panel; a dash without any bar.
 */
function renderDistributionPanel(distribution, targetLabel, headingLevel, palette) {
    const title = `<h${headingLevel} class="material-distribution-panel-title">${escapeHtml(targetLabel)}</h${headingLevel}>`;
    const visibleLevels = /** @type {Array<MaterialDistributionLevel & {share: number}>} */ (
        (distribution?.levels ?? []).filter(
            (level) => isFiniteNumber(level.share) && level.share > EPSILON,
        )
    );

    if (visibleLevels.length === 0) {
        return `
                <section class="material-distribution-panel">
                    <div class="material-distribution-panel-body">
                        ${title}
                        <div class="material-distribution-panel-empty">${MISSING_VALUE}</div>
                    </div>
                </section>
            `;
    }

    const ariaLabel = `${targetLabel}: ${visibleLevels.map((level) => `${level.label} ${formatShare(level.share)}`).join(', ')}`;

    return `
            <section class="material-distribution-panel">
                <div class="material-distribution-panel-body">
                    ${title}
                    <div class="material-distribution-chart" role="img" aria-label="${escapeHtml(ariaLabel)}">
                        <div class="material-distribution-stack-vertical ${DATA_MARK_CLASS}">
                            ${visibleLevels.map((level) => renderDistributionSegment(level, palette)).join('')}
                        </div>
                    </div>
                </div>
            </section>
        `;
}

/**
 * @param {MaterialDistributionLevel & {share: number}} level
 * @param {import('../../../common/services/competenceLevelPalette.js').CompetenceLevelPalette} palette
 * @returns {string} The bar segment; its label shows where it fits (stacked-bar.css).
 */
function renderDistributionSegment(level, palette) {
    const appearance = getCompetenceAppearance(palette, level.label, level.scaleId);
    const levelClassToken = getCompetenceLevelClassToken(palette, level.label, appearance) ?? '';
    const band = appearance ?? defaultBandAppearance();
    const tooltipText = escapeHtml(`${level.label}: ${formatShare(level.share)}`);
    const cssVars = cssVarsAttr({
        '--distribution-share': level.share,
        '--competence-level-band-color': band.baseColor,
        '--competence-level-band-ink': band.ink,
    });

    return `
            <div class="material-distribution-stack-segment stacked-bar-segment stacked-bar-segment--vertical competence-level level-${escapeHtml(levelClassToken)}"${cssVars} data-tooltip-text="${tooltipText}">
                <span class="material-distribution-stack-segment-label stacked-bar-label">${escapeHtml(level.label)}</span>
            </div>
        `;
}
