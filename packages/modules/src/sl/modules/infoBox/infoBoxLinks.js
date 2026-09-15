import { getBestNumericSelection } from './infoBoxSelectionRanking.js';
import { resolveCompetenceLevelRankAlias } from '../../utils/slCompetenceLevels.js';
import { getSubjectNamesFromRows, normalizeTarget } from '../../utils/slQueryPrimitives.js';
import {
    isCurrentMaterialSubjectToken,
    normalizeMaterialSubject,
    normalizeMaterialType,
} from '../../utils/slSubjectConfig.js';

/**
 * The subjects a ranking mode names for a population: the one with the highest share at
 * or above rank 3 (`best`), the lowest (`worst`), or both (`extrema`). A Fach whose scale
 * cannot express that share is left out rather than scored 0 %.
 * @param {import('../../utils/slCompetenceShares.js').CompetenceShareQueries} queries - Answers the shares.
 * @param {string} target - `school` or a class name.
 * @param {string} mode - `best`, `worst` or `extrema`.
 * @returns {string[]} The material-subject tokens, deduplicated.
 */
function rankMaterialSubjects(queries, target, mode) {
    const levelNames = resolveCompetenceLevelRankAlias('ge_3') ?? [];
    const subjectNames = getSubjectNamesFromRows(
        queries.getRowsForSubjectAggregateTarget(normalizeTarget(target)),
    );
    const createSelection = (subjectName) => {
        const share = queries.getSubjectCompetenceShare({ target, subjectName, levelNames });
        return share === null ? null : { subjectName, share };
    };
    const pick = (rankMode) =>
        getBestNumericSelection(
            subjectNames,
            createSelection,
            (_name, selection) => selection.share,
            (subjectName) => subjectName,
            rankMode,
        )?.subjectName;
    const picked =
        mode === 'worst'
            ? [pick('min')]
            : mode === 'extrema'
              ? [pick('max'), pick('min')]
              : [pick('max')];

    return [
        ...new Set(
            picked
                .map((subjectName) => normalizeMaterialSubject(subjectName))
                .filter((subject) => typeof subject === 'string'),
        ),
    ];
}

/**
 * Parse a material link token (`{{Typ+Fach}}`) into the type and subject it names.
 * @param {string} token - The token, wrapped or bare.
 * @returns {{type: string|null, rawType: string, rawSubject: string}|null} The parsed halves, or `null` when the token names no usable target.
 */
function parseMaterialLinkTarget(token) {
    const unwrapped = token.trim().match(/^\{\{\s*(.+?)\s*\}\}$/)?.[1] ?? token.trim();
    const parts = unwrapped
        .split('+')
        .map((part) => part.trim())
        .filter(Boolean);

    if (parts.length !== 2) {
        return null;
    }

    const [rawType, rawSubject] = parts;
    return { type: normalizeMaterialType(rawType), rawType, rawSubject };
}

/**
 * Build one material link: its label plus the handler that switches the material view to
 * that Fach and type.
 * @param {object} spec - What the link says and what it does.
 * @param {string} spec.subject - Fach to select, as the template or the ranking named it.
 * @param {string|null} spec.type - Material type to select, canonical; `null` for an unknown type.
 * @param {string} spec.displayType - The type as written, for the label.
 * @param {any} spec.appState - Shared app state the selection is written to.
 * @param {(viewTarget: string) => Promise<void>} [spec.onNavigate] - Switches the dashboard to a view; the link is inert without it.
 * @returns {object} The link descriptor the info box renders.
 */
function createMaterialSectionLink({ subject, type, displayType, appState, onNavigate }) {
    const normalizedSubject = normalizeMaterialSubject(subject);
    const label = `${displayType}: ${normalizedSubject ?? subject} im Material anzeigen`;

    if (!normalizedSubject || !type) {
        return { label, disabled: true };
    }

    // A link that cannot act is rendered disabled rather than live-but-inert. Both
    // halves reach this builder through the info box's option bundle, so a wiring
    // regression (a view or a bundle that stops forwarding one) would otherwise show a
    // normal-looking button that silently does nothing when clicked.
    if (typeof appState?.updateState !== 'function' || typeof onNavigate !== 'function') {
        console.warn(
            `infoBoxLinks: '${label}' cannot act — missing`,
            [
                typeof appState?.updateState !== 'function' ? 'appState.updateState' : null,
                typeof onNavigate !== 'function' ? 'onNavigate' : null,
            ]
                .filter(Boolean)
                .join(' + '),
        );
        return { label, disabled: true };
    }

    return {
        label,
        onActivate: async () => {
            // The write precedes the navigation: the material view's header controls
            // seed themselves from state as that view renders, and the view itself
            // either observes the keys (already built) or seeds from them (built now).
            appState.updateState({ materialSubject: normalizedSubject, materialType: type });

            await onNavigate('material');
        },
    };
}

/**
 * Turn one template token into the material links it stands for. `{{Typ+Gesamt}}` and a
 * literal Fach name one link; `{{Typ+Fach}}` the view's current Fach, or — without one —
 * whatever the section's ranking mode names, so `extrema` yields two links.
 * @param {object} spec - The token plus everything needed to resolve and wire it.
 * @param {string} spec.token - The template's material token.
 * @param {string|null} [spec.currentSubject] - The subject the view is showing.
 * @param {string|null} [spec.className] - Scopes a ranking mode to one class.
 * @param {import('../../utils/slCompetenceShares.js').CompetenceShareQueries|null} [spec.queries] - Answers the ranking modes; without it `Fach` resolves to nothing.
 * @param {string|null} [spec.materialLinkSubjectMode] - A ranking mode instead of a named subject.
 * @param {any} [spec.appState] - Shared app state the selection is written to.
 * @param {(viewTarget: string) => Promise<void>} [spec.onNavigate] - Switches the dashboard to a view.
 * @returns {Array<object>} One link per resolved subject; empty when the token cannot be parsed.
 */
export function createMaterialSectionLinksFromToken({
    token,
    currentSubject = null,
    className = null,
    queries = null,
    materialLinkSubjectMode = null,
    appState,
    onNavigate,
}) {
    const parsedTarget = parseMaterialLinkTarget(token);
    if (!parsedTarget) {
        return [];
    }

    let subjects = [parsedTarget.rawSubject];
    if (isCurrentMaterialSubjectToken(parsedTarget.rawSubject)) {
        // The view's own Fach wins even when the material pages have none for it (the
        // link then renders disabled, naming it); only a view without one asks the ranking.
        const current = typeof currentSubject === 'string' ? currentSubject.trim() : '';
        const ranked =
            !current && queries && materialLinkSubjectMode
                ? rankMaterialSubjects(queries, className || 'school', materialLinkSubjectMode)
                : [];
        subjects = current ? [current] : ranked.length > 0 ? ranked : subjects;
    }

    return subjects.map((subject) =>
        createMaterialSectionLink({
            subject,
            type: parsedTarget.type,
            displayType: parsedTarget.type ?? parsedTarget.rawType,
            appState,
            onNavigate,
        }),
    );
}
