/**
 * The chart groups the SL overview draws its thumbnail cards from — the whole school,
 * one per Fach, one per class — shaped from the competence-level index. Pure data
 * shaping; the view mounts a preview host per group.
 */

import { MISSING_GLOSSARY_TITLE } from '@tba3/module-base';
import { deriveClassNames } from '@tba3/modules/sl-domain';

const SUBJECT_PREVIEW_GLOSSARY_KEYS = Object.freeze({
    Deutsch: 'preview-de',
    Englisch: 'preview-en',
    Französisch: 'preview-fr',
    Mathematik: 'preview-ma',
});

/**
 * Prepares a school overview chart group showing all domains from JSON DataStore.
 * @param {import('@tba3/modules/sl/slCompetenceLevelIndex.js').CompetenceLevelIndex} index - The indexed competence-levels payload.
 * @param {(sectionKey: string, previewKey: string|null, replacements?: object) => {title?: string, description?: string, tooltipText?: string}|null} resolvePreviewCardMeta - Glossary copy for a preview card.
 * @returns {object | null} Chart group definition for school overview
 */
export function prepareSchoolOverviewChartGroup(index, resolvePreviewCardMeta) {
    const previewMeta = resolvePreviewCardMeta('class-view', 'preview-school');
    const { stateRows: stateEntries, classGroups: subjectDomainGroups } = index;

    // Group class entries by subject+domain
    const domainGroupsForSchool = subjectDomainGroups.filter((group) => {
        const subjectName = group[0]?.subject?.name;
        return Boolean(subjectName);
    });

    if (!domainGroupsForSchool.length) return null;

    return {
        title: previewMeta?.title || MISSING_GLOSSARY_TITLE,
        description: previewMeta?.description || null,
        tooltipText: previewMeta?.tooltipText || null,
        domainGroups: domainGroupsForSchool,
        domainLabel: 'Schule',
        stateEntries,
        isMultiDomain: true,
        isSchoolOverview: true,
        showOnlySchoolData: true,
    };
}

/**
 * Prepares chart groups for subject charts from JSON DataStore.
 * @param {import('@tba3/modules/sl/slCompetenceLevelIndex.js').CompetenceLevelIndex} index - The indexed competence-levels payload.
 * @param {(sectionKey: string, previewKey: string|null, replacements?: object) => {title?: string, description?: string, tooltipText?: string}|null} resolvePreviewCardMeta - Glossary copy for a preview card.
 * @returns {Array} Array of chart group definitions
 */
export function prepareSubjectChartGroups(index, resolvePreviewCardMeta) {
    const { stateRows: stateEntries, classGroups: subjectDomainGroups } = index;

    const chartGroups = [];

    // Group by subject: collect all domain groups per subject
    const subjectMap = new Map();
    for (const group of subjectDomainGroups) {
        const subjectName = group[0]?.subject?.name;
        if (!subjectName) continue;

        if (!subjectMap.has(subjectName)) {
            subjectMap.set(subjectName, []);
        }
        subjectMap.get(subjectName).push(group);
    }

    for (const [subjectName, domainGroups] of subjectMap) {
        const previewKey = SUBJECT_PREVIEW_GLOSSARY_KEYS[subjectName] ?? null;
        const previewMeta = resolvePreviewCardMeta('subject-view', previewKey, {
            Fach: subjectName,
        });
        chartGroups.push({
            title: previewMeta?.title || MISSING_GLOSSARY_TITLE,
            description: previewMeta?.description || null,
            tooltipText: previewMeta?.tooltipText || null,
            domainGroups: domainGroups,
            domainLabel: subjectName,
            // Identity, not display text: the detail overlay derives its
            // export target id from this, so it must survive glossary edits.
            subjectName,
            stateEntries,
            isMultiDomain: domainGroups.length > 1,
        });
    }

    return chartGroups;
}

/**
 * Prepares chart groups for class charts from JSON DataStore.
 * @param {import('@tba3/modules/sl/slCompetenceLevelIndex.js').CompetenceLevelIndex} index - The indexed competence-levels payload.
 * @param {(sectionKey: string, previewKey: string|null, replacements?: object) => {title?: string, description?: string, tooltipText?: string}|null} resolvePreviewCardMeta - Glossary copy for a preview card.
 * @returns {Array} Array of chart group definitions
 */
export function prepareClassChartGroups(index, resolvePreviewCardMeta) {
    const { classRows, stateRows: stateEntries, classGroups: subjectDomainGroups } = index;
    const classNames = deriveClassNames(classRows);

    const chartGroups = [];

    classNames.forEach((className) => {
        const domainGroupsForClass = [];

        subjectDomainGroups.forEach((group) => {
            const subjectName = group[0]?.subject?.name;
            if (!subjectName) return;

            // Check if this domain group contains the class
            const hasClass = group.some((e) => e.name === className);
            if (hasClass) {
                domainGroupsForClass.push(group);
            }
        });

        if (domainGroupsForClass.length > 0) {
            const previewMeta = resolvePreviewCardMeta('class-view', 'preview-class', {
                Klasse: className,
            });
            chartGroups.push({
                title: previewMeta?.title || MISSING_GLOSSARY_TITLE,
                description: previewMeta?.description || null,
                tooltipText: previewMeta?.tooltipText || null,
                domainGroups: domainGroupsForClass,
                domainLabel: className,
                className: className,
                stateEntries,
                isMultiDomain: true,
            });
        }
    });

    return chartGroups;
}
