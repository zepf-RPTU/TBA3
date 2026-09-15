import { describe, it, expect, beforeEach, vi } from 'vitest';
import { resetCompetenceLevelPalette } from '@tba3/modules/common/services/competenceLevelPalette.js';
import {
    InfoBoxTextResolver,
    VALUE_MARKER_CLOSE,
    VALUE_MARKER_OPEN,
} from '@tba3/modules/sl/modules/infoBox/infoBoxTextResolver.js';
import { buildDashboardHelper } from '../../../support/slInfoBoxFixture.js';

/**
 * The layer between a competence-level share and the German sentence a Schulleitung
 * reads.
 *
 * `info_boxes.json` carries no numbers — only prose and `{{call(...)}}` placeholders — so
 * everything that decides *what a box says* about a school happens here: reading a
 * placeholder's arguments, expanding a rank alias across whichever ladders the dataset
 * loaded, carrying one placeholder's selection to the next, and formatting the result as
 * German. Until this file existed the whole path was reachable only from a browser, and a
 * wrong answer here is a confident, well-formed sentence naming the wrong Fach — not a
 * blank or a stack trace.
 *
 * The seam is the resolver's own constructor: `queries`, `getPlaceholderContext` and
 * `warnUnresolved` are injected, so the suite runs DOM-free against the same fixture
 * school the query-layer suites read. That fixture documents its numbers; each case below
 * states the rule those numbers were chosen to expose.
 */

beforeEach(() => {
    resetCompetenceLevelPalette();
});

/** How a resolved value reaches the DOM — the module wraps it so the reader can see it. */
function value(text) {
    return `${VALUE_MARKER_OPEN}${text}${VALUE_MARKER_CLOSE}`;
}

/**
 * The current Fach's first Domäne, then its share — the two-placeholder form every box
 * uses, because a template names neither a Fach nor a Domäne literally: both travel in
 * the placeholder context or in a selection an earlier placeholder recorded.
 * @param {string} levelAlias - The rank the share counts.
 * @returns {string} The text block.
 */
function SHARE_IN_FIRST_DOMAIN(levelAlias) {
    return (
        '{{selectSubjectDomain(id=domain1, subjectName=current, order=1)}}' +
        `{{share(target=class:current, subjectName=current, domainId=selection:domain1, levelAlias=${levelAlias})}}`
    );
}

function makeResolver(placeholderContext = {}) {
    const warnUnresolved = vi.fn();
    const resolver = new InfoBoxTextResolver({
        moduleId: 'test',
        queries: buildDashboardHelper(),
        getPlaceholderContext: () => placeholderContext,
        warnUnresolved,
    });

    return { resolver, warnUnresolved };
}

describe('levelAlias — one file, two competence ladders', () => {
    it('expands a rank alias into whichever bands the loaded scales use', () => {
        // WHY: this is what lets one shared info_boxes.json serve every dataset. 8a's
        // Englisch is measured on the GER ladder, so a box asking for "den Regelstandard
        // oder höher" has to reach B1/B2/C1 there and III/IV/V in Deutsch — from the same
        // template string. The alias is resolved against the *loaded* scales, so the same
        // text works on NRW's KS 1…KS 5 without being rewritten.
        const { resolver } = makeResolver({ className: '8a', subjectName: 'Englisch' });

        expect(resolver.resolveTextBlock(`Erreicht: ${SHARE_IN_FIRST_DOMAIN('ge_3')}`)).toBe(
            `Erreicht: ${value('80,0%')}`,
        );
    });

    it('withholds the sentence for a rank no loaded ladder reaches', () => {
        // WHY: the counter-case. `e_6` names a rank no ladder has, so the share is unknown
        // and the sentence is withheld. If this ever started printing 0,0% instead, the
        // box would state that nobody in 8a reaches that rank, as a fact.
        const { resolver, warnUnresolved } = makeResolver({
            className: '8a',
            subjectName: 'Englisch',
        });
        // The Domäne still resolves (and renders as nothing); only the share is withheld,
        // so its placeholder is what stays in the text.
        expect(resolver.resolveTextBlock(`Erreicht: ${SHARE_IN_FIRST_DOMAIN('e_6')}`)).toBe(
            'Erreicht: {{share(target=class:current, subjectName=current, domainId=selection:domain1, levelAlias=e_6)}}',
        );
        expect(warnUnresolved).toHaveBeenCalledWith(
            expect.any(String),
            'missing or invalid share parameters',
            expect.any(Object),
        );
    });
});

describe('placeholderContext — the same text under several headings', () => {
    it('resolves current against the view that is rendering the box', () => {
        // WHY: one box definition is rendered by several views, each with its own Fach and
        // Domäne selected, and `current` is the whole mechanism that lets them share it. A
        // resolver that ignored the context would print the same number under every
        // heading — plausible-looking and wrong for all but one of them. 8a is at 0.60 in
        // Lesen and 0.40 in Zuhören, so the two readings cannot coincide.
        const template = SHARE_IN_FIRST_DOMAIN('ge_3');

        expect(
            makeResolver({ className: '8a', subjectName: 'Deutsch' }).resolver.resolveTextBlock(
                template,
            ),
        ).toBe(value('60,0%'));
        expect(
            makeResolver({ className: '8b', subjectName: 'Deutsch' }).resolver.resolveTextBlock(
                template,
            ),
        ).toBe(value('40,0%'));
    });

    it('formats the share in the locale the context names', () => {
        // WHY: every number in these boxes is German prose, not data — "60,0%" with a
        // decimal comma. The locale travels with the context (info_boxes.json carries a
        // meta.locale), so this pins that the resolver formats rather than concatenates.
        expect(
            makeResolver({
                locale: 'en-GB',
                className: '8a',
                subjectName: 'Deutsch',
            }).resolver.resolveTextBlock(SHARE_IN_FIRST_DOMAIN('ge_3')),
        ).toBe(value('60.0%'));
    });
});

describe('selection back-references — naming one thing and then quoting it', () => {
    it('carries a selection to a later placeholder in the same block', () => {
        // WHY: the most consequential thing this file does. An alarm sentence *selects* the
        // school's weakest Fach/Domäne on one alias and then *prints* a share on another —
        // "die schwächste" ranks on ge_3 ascending, "höchstens auf Stufe II" prints le_2 —
        // so selection and print are two placeholders and the second must be talking about
        // the same row as the first.
        //
        // The failure mode is silent: `target=selection:schwach` falling back to the
        // context's Fach still produces a well-formed German sentence, one that names
        // Deutsch (Zuhören) and then quotes Englisch's number. The context here is
        // deliberately a *different* Fach so that fallback cannot pass.
        const { resolver } = makeResolver({ subjectName: 'Englisch' });

        const text = resolver.resolveTextBlock(
            'Am schwächsten: {{selectShareTarget(id=schwach, target=school, levelAlias=ge_3, scope=subjectDomainShare, mode=min, field=subjectDomainLabel)}};' +
                ' höchstens Stufe II: {{share(target=selection:schwach, levelAlias=le_2)}}',
        );

        // Deutsch/Zuhören is the school's weakest selection at 0.40; its le_2 counterpart
        // is the remaining 0.60 of the same row.
        expect(text).toBe(
            `Am schwächsten: ${value('Deutsch (Zuhören)')}; höchstens Stufe II: ${value('60,0%')}`,
        );
    });

    it('labels a Fach without a Domäne by its name alone', () => {
        // WHY: `subjectDomainLabel` is written into running prose, so "Mathematik ()" is
        // not an option — Mathematik carries a single `domain: null` row and must read as
        // a bare Fach, while Englisch keeps its parenthetical. Asked with the Roman bands
        // only, the GER-scaled Englisch is invisible and Mathematik wins the same
        // superlative, which is how one assertion reaches both spellings.
        const { resolver } = makeResolver({ className: '8c' });

        expect(
            resolver.resolveTextBlock(
                '{{selectShareTarget(id=x, target=class:current, levelAlias=ge_3, scope=subjectDomainShare, mode=max, field=subjectDomainLabel)}}',
            ),
        ).toBe(value('Mathematik'));
        expect(
            makeResolver().resolver.resolveTextBlock(
                '{{selectShareTarget(id=x, target=school, levelAlias=ge_3, scope=subjectDomainShare, mode=max, field=subjectDomainLabel)}}',
            ),
        ).toBe(value('Englisch (Hörverstehen)'));
    });

    it('inherits the Fach of a class selection', () => {
        // WHY: `subjectShare(target=selection:beste, levelAlias=…)` names no Fach of its
        // own; it prints the share of the Fach the selection was ranked in. Mathematik is
        // the one Fach 8c sat, and 8c is its strongest Klasse at 0.70.
        const { resolver } = makeResolver({ subjectName: 'Mathematik' });

        expect(
            resolver.resolveTextBlock(
                '{{selectShareTarget(id=beste, target=school, levelAlias=ge_3, scope=classInSubject, subjectName=current, mode=max, field=className)}}: ' +
                    '{{subjectShare(target=selection:beste, levelAlias=ge_3)}}',
            ),
        ).toBe(`${value('8c')}: ${value('70,0%')}`);
    });
});

describe('skipBlock — dropping a sentence rather than printing a hole', () => {
    it('drops the whole block when the value it is built around is unknown', () => {
        // WHY: `standardBands` fills the parenthetical in "den Optimalstandard oder höher
        // (≥ V bzw. C1)". No loaded ladder has a sixth rank, so the parenthesis would be
        // empty — and a sentence built around a value that does not exist is worse than no
        // sentence. `resolveTextBlock` returning null is what lets the caller drop it.
        const { resolver } = makeResolver();

        expect(
            resolver.resolveTextBlock(
                'Der Höchststandard ({{standardBands(levelAlias=e_6, skipBlock=true)}}) …',
            ),
        ).toBeNull();
    });

    it('reads skipBlock=True as true', () => {
        // WHY: every placeholder argument arrives as an unquoted string, and an author
        // writing the capitalised form must not get the opposite of what they asked for —
        // the block would then render with an empty parenthesis instead of disappearing.
        // That is the single reason `parseBooleanParam` exists rather than a truthiness
        // check per handler.
        const { resolver } = makeResolver();

        expect(
            resolver.resolveTextBlock(
                'Der Höchststandard ({{standardBands(levelAlias=e_6, skipBlock=True)}}) …',
            ),
        ).toBeNull();
    });

    it('keeps the block, placeholder and all, when skipBlock was not asked for', () => {
        // WHY: the two halves of the same decision. Without the flag the unresolved
        // placeholder stays on screen, which is the deliberate choice made in
        // infoBoxPlaceholders.js — an author sees their broken placeholder instead of a
        // sentence that quietly lost its number.
        const { resolver } = makeResolver();

        expect(
            resolver.resolveTextBlock('Der Höchststandard ({{standardBands(levelAlias=e_6)}}) …'),
        ).toBe('Der Höchststandard ({{standardBands(levelAlias=e_6)}}) …');
    });

    it('names the bands from the loaded scales when the rank does exist', () => {
        // WHY: this parenthetical used to be typed into info_boxes.json, which pinned the
        // file to one dataset's ladders — "III bzw. B1" says nothing on NRW's KS 1…KS 5.
        // Reading it from the registered scales is what makes the drop above the exception
        // rather than the rule.
        const { resolver } = makeResolver();

        expect(resolver.resolveTextBlock('{{standardBands(levelAlias=ge_3)}}')).toBe(
            value('III bzw. B1'),
        );
    });
});

describe('list formatting — the sentence has to stay German', () => {
    it('joins the last two names with und', () => {
        // WHY: the list is written into running prose ("… liegt Ihre Schule in X über dem
        // Landesschnitt"), so a bare comma join reads as a data dump rather than a German
        // sentence — the last two names take "und" however long the list is. Both lengths
        // are asserted because the two lists are built by different verbs over different
        // populations; the formatter's own two-item branch turns out to be redundant with
        // its general one, so no assertion here can distinguish them.
        const { resolver } = makeResolver();

        expect(
            resolver.resolveTextBlock(
                '{{listStateComparisonClasses(target=school, levelAlias=ge_3, comparison=gt)}}',
            ),
        ).toBe(value('8a, 8b und 8c'));
        expect(
            makeResolver().resolver.resolveTextBlock(
                '{{listStateComparisonSubjects(target=school, levelAlias=ge_3, comparison=gt, aggregation=anyDomain)}}',
            ),
        ).toBe(value('Deutsch und Englisch'));
    });

    it('degrades to a German noun phrase rather than an empty gap', () => {
        // WHY: an empty list is a real answer — 8c is above the Landesschnitt in the only
        // Fach it sits, so it is below in none — and the sentence around the placeholder
        // still has to parse. "in keinem Fach" is a claim; an empty string is a typo.
        const { resolver } = makeResolver({ className: '8c' });

        expect(
            resolver.resolveTextBlock(
                '{{listStateComparisonSubjects(target=class:current, levelAlias=ge_3, comparison=lt, aggregation=subject)}}',
            ),
        ).toBe(value('keinem Fach'));
        expect(
            makeResolver({ subjectName: 'Englisch' }).resolver.resolveTextBlock(
                '{{listStateComparisonClasses(target=school, levelAlias=ge_3, comparison=lt, subjectName=current)}}',
            ),
        ).toBe(value('keine Klasse'));
    });

    it('lists a different set of Fächer per aggregation', () => {
        // WHY: the two aggregations are two different claims about the same school, and
        // the fixture is built so they disagree: Deutsch is above the Landesschnitt in
        // Zuhören and below it in Lesen, and exactly level once the Domänen are pooled. So
        // `anyDomain` names it and `subject` does not. A resolver that dropped the
        // argument would answer one question with the other's answer.
        const { resolver } = makeResolver();

        expect(
            resolver.resolveTextBlock(
                '{{listStateComparisonSubjects(target=school, levelAlias=ge_3, comparison=gt, aggregation=anyDomain)}}',
            ),
        ).toBe(value('Deutsch und Englisch'));
        expect(
            makeResolver().resolver.resolveTextBlock(
                '{{listStateComparisonSubjects(target=school, levelAlias=ge_3, comparison=gt, aggregation=subject)}}',
            ),
        ).toBe(value('Englisch'));
    });
});

describe('unresolved placeholders stay visible', () => {
    it('leaves a placeholder whose arguments are incomplete, and warns', () => {
        // WHY: blanking it would ship "Im Fach  erreichen  der Schüler:innen …" to a
        // Schulleitung — a sentence that looks like a rendering bug but reads as a fact.
        // Leaving the token standing makes the failure name itself, and the warning is
        // what a developer sees; both halves matter, so both are asserted.
        const { resolver, warnUnresolved } = makeResolver();

        expect(resolver.resolveTextBlock('Anteil: {{share(target=school, levelAlias=ge_3)}}')).toBe(
            'Anteil: {{share(target=school, levelAlias=ge_3)}}',
        );
        expect(warnUnresolved).toHaveBeenCalledWith(
            expect.any(String),
            'missing or invalid share parameters',
            expect.objectContaining({ target: 'school' }),
        );
    });

    it('leaves a placeholder nothing implements, silently', () => {
        // WHY: the handler table is the resolver's whole vocabulary, and an unknown name
        // is an authoring mistake in info_boxes.json rather than a data problem — it is
        // left standing for the author to see, but it deliberately does not warn: the
        // warning channel is per placeholder *instance* and would fire on every render of
        // a box nobody has fixed yet.
        const { resolver, warnUnresolved } = makeResolver();

        expect(resolver.resolveTextBlock('{{gibtEsNicht(x=1)}}')).toBe('{{gibtEsNicht(x=1)}}');
        expect(warnUnresolved).not.toHaveBeenCalled();
    });

    it('leaves text carrying no placeholder exactly as written', () => {
        // WHY: most blocks are pure prose. The German around a placeholder — quotation
        // marks, umlauts, percent signs — must survive untouched, so the resolver is only
        // ever additive.
        const { resolver } = makeResolver();

        expect(resolver.resolveTextBlock('Über 50 % der Schüler:innen — „Regelstandard" — …')).toBe(
            'Über 50 % der Schüler:innen — „Regelstandard" — …',
        );
    });
});

describe('value markers', () => {
    it('wraps a resolved value and nothing else', () => {
        // WHY: the module turns these markers into the span that highlights a number in
        // the rendered box. A selection placeholder that only records its selection for a
        // later one resolves to the empty string, and wrapping *that* would paint an empty
        // highlight in the middle of a sentence.
        const { resolver } = makeResolver();

        const text = resolver.resolveTextBlock(
            'Fazit:{{selectShareTarget(id=x, target=school, levelAlias=ge_3, scope=subjectDomainShare, mode=max)}} steht gut da.',
        );

        expect(text).toBe('Fazit: steht gut da.');
        expect(text).not.toContain(VALUE_MARKER_OPEN);
    });
});
