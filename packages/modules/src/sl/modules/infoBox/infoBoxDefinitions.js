/**
 * Readers of an info-box definition (`info_boxes.json`): which kind a block is, which
 * section is active, and what a section is called, keyed and iconed as. Pure over the
 * definition and the document's `sectionTypes`.
 */

/**
 * A plain object carrying a string `text`.
 * @param {*} block - Any block of a section.
 * @returns {boolean} True for a text block.
 */
export function isTextBlockDefinition(block) {
    return Boolean(
        block &&
        typeof block === 'object' &&
        !Array.isArray(block) &&
        typeof block.text === 'string',
    );
}

/**
 * A link block: `{type: 'link', token}`.
 * @param {*} block - Any block of a section.
 * @returns {boolean} True for a link block.
 */
export function isLinkBlockDefinition(block) {
    return Boolean(
        block &&
        typeof block === 'object' &&
        block.type === 'link' &&
        typeof block.token === 'string',
    );
}

/**
 * The section to show: the one whose type is still active, else the first.
 * @param {Array<Record<string, any>>} sections - The box's sections.
 * @param {string|null} activeSectionKey - The type shown last, if any.
 * @returns {Record<string, any>|null} The section, or `null` for an empty box.
 */
export function resolveActiveSection(sections, activeSectionKey) {
    return (
        (activeSectionKey && sections.find((section) => section.type === activeSectionKey)) ||
        sections[0] ||
        null
    );
}

/**
 * A section's key, heading, tooltip, icon and link mode. Everything but the link mode
 * comes from its type's definition; the link mode may be overridden on the section.
 * @param {Record<string, any>} section - The section.
 * @param {Record<string, any>} sectionTypes - The document's `sectionTypes`; every section's type has an entry.
 * @returns {{key: string, label: string, icon: string, tooltipText: string, materialLinkSubjectMode: string|null}} Its meta.
 */
export function resolveSectionMeta(section, sectionTypes) {
    const type = sectionTypes[section.type];

    return {
        key: section.type,
        label: type.label,
        icon: type.icon,
        tooltipText: type.tooltip,
        materialLinkSubjectMode:
            section.materialLinkSubjectMode ?? type.materialLinkSubjectMode ?? null,
    };
}
