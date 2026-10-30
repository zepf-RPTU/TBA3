import { describe, it, expect, vi } from 'vitest';
import { InfoBoxTextResolver } from '../../../../src/sl/modules/infoBox/infoBoxTextResolver.js';
import { buildDashboardContext, sharesOf } from '../../../support/slInfoBoxFixture.js';
import { createTestContext } from '../../../support/glossaryFixture.js';
import { scaleValueGroup } from '../../../support/competenceScaleFixture.js';

/**
 * The layer between a competence-level share and the German sentence a Schulleitung
 * reads.
 *
 * `info-boxes.json` carries no numbers — only prose and `{{call(...)}}` placeholders — so
 * what a box says about a school is decided here: reading a placeholder's arguments,
 * expanding a band alias across the loaded ladders, carrying one placeholder's selection
 * to the next, and formatting the result as German. A wrong answer is a well-formed
 * sentence naming the wrong Fach, not a blank or a stack trace.
 *
 * `queries` and `warnUnresolved` are injected and the placeholder context is passed per
 * block, so the suite runs DOM-free against the fixture school the query-layer suites
 * read. That fixture documents its numbers; each case states the rule they expose.
 */

/**
 * A resolved value as `flatten` writes it — the module highlights it in the box.
 * @param {string} text
 * @returns {string}
 */
function value(text) {
    return `«${text}»`;
}

/**
 * The resolved segments as one string, values marked, so a case can state the sentence.
 * @param {import('../../../../src/sl/modules/infoBox/infoBoxTextResolver.js').TextSegment[]|null} segments - The resolver's answer.
 * @returns {string|null} `null` for a dropped block.
 */
function flatten(segments) {
    return (
        segments
            ?.map((segment) =>
                'runs' in segment
                    ? value(segment.runs.map((run) => run.text).join(''))
                    : segment.text,
            )
            .join('') ?? null
    );
}

/**
 * The current Domäne, then its share — the two-placeholder form every box uses, because a
 * template names neither a Fach nor a Domäne literally: both travel in the placeholder
 * context (a `domains` repeat row's Domäne) or in a selection an earlier placeholder
 * recorded.
 * @param {string} levelAlias - The band alias the share counts.
 * @returns {string}
 */
function SHARE_IN_DOMAIN(levelAlias) {
    return (
        '{{selectSubjectDomain(id=domain, field=domainName)}}: ' +
        `{{share(target=group:current, domainId=selection:domain, levelAlias=${levelAlias})}}`
    );
}

async function makeResolver(placeholderContext = {}) {
    const warnUnresolved = vi.fn();
    const context = await buildDashboardContext();
    const textResolver = new InfoBoxTextResolver({
        queries: sharesOf(context),
        palette: context.palette,
        glossary: context.glossary,
        warnUnresolved,
    });
    const resolver = {
        /**
         * @param {Parameters<InfoBoxTextResolver['resolveTextBlock']>[0]} block
         * @returns {string|null} Resolved and flattened; `null` for a dropped block.
         */
        resolveTextBlock: (block) =>
            flatten(
                textResolver.resolveTextBlock(block, {
                    locale: 'de-DE',
                    summaries: {},
                    ...placeholderContext,
                }),
            ),
    };

    return { resolver, warnUnresolved };
}

describe('levelAlias — one file, two competence ladders', () => {
    it('expands a band alias into whichever bands the loaded scales use', async () => {
        // One shared info-boxes.json serves every dataset. 8a's Englisch is measured
        // on the GER ladder, so a box asking for "den Regelstandard oder höher" has to
        // reach B1/B2/C1 there and III/IV/V in Deutsch from the same template string. The
        // alias is resolved against the loaded scales, so the text also works on KS 1…KS 5.
        const { resolver } = await makeResolver({
            groupName: '8a',
            subjectName: 'Englisch',
            domainId: 'ho',
        });

        expect(resolver.resolveTextBlock(`Erreicht: ${SHARE_IN_DOMAIN('ge_medium')}`)).toBe(
            `Erreicht: ${value('Hören')}: ${value('80,0 %')}`,
        );
    });

    it('withholds the sentence for a level alias that is no alias', async () => {
        // An unknown alias leaves the share unknown, so the sentence is withheld. Printing
        // 0,0 % would state that nobody in 8a reaches the Regelstandard.
        const { resolver, warnUnresolved } = await makeResolver({
            groupName: '8a',
            subjectName: 'Englisch',
            domainId: 'ho',
        });
        // The Domäne still resolves; the share does not, and takes the sentence with it.
        expect(
            resolver.resolveTextBlock(`Erreicht: ${SHARE_IN_DOMAIN('Regelstandard')}`),
        ).toBeNull();
        expect(warnUnresolved).toHaveBeenCalledTimes(1);
        expect(warnUnresolved).toHaveBeenCalledWith(
            expect.any(String),
            'missing or invalid share parameters',
            expect.objectContaining({ levelAlias: 'Regelstandard' }),
        );
    });
});

describe('placeholderContext — the same text under several headings', () => {
    it('resolves current against the view that is rendering the box', async () => {
        // One box definition is rendered by several views, each with its own Fach and
        // Domäne selected, and `current` is how they share it. A resolver that ignored the
        // context would print the same number under every heading. 8a is at 0.60 in Lesen
        // and 0.40 in Zuhören, so the two readings cannot coincide.
        const template = SHARE_IN_DOMAIN('ge_medium');

        expect(
            (
                await makeResolver({ groupName: '8a', subjectName: 'Deutsch', domainId: 'le' })
            ).resolver.resolveTextBlock(template),
        ).toBe(`${value('Lesen')}: ${value('60,0 %')}`);
        expect(
            (
                await makeResolver({ groupName: '8b', subjectName: 'Deutsch', domainId: 'le' })
            ).resolver.resolveTextBlock(template),
        ).toBe(`${value('Lesen')}: ${value('40,0 %')}`);
    });

    it('formats the share in the locale the context names', async () => {
        // Every number in these boxes is German prose, not data — "60,0%" with a
        // decimal comma. The locale travels with the context (info-boxes.json carries a
        // meta.locale), so this pins that the resolver formats rather than concatenates.
        expect(
            (
                await makeResolver({
                    locale: 'en-GB',
                    groupName: '8a',
                    subjectName: 'Deutsch',
                    domainId: 'le',
                })
            ).resolver.resolveTextBlock(SHARE_IN_DOMAIN('ge_medium')),
        ).toBe(`${value('Lesen')}: ${value('60.0%')}`);
    });
});

describe('selection back-references — naming one thing and then quoting it', () => {
    it('carries a selection to a later placeholder in the same block', async () => {
        // An alarm sentence selects the school's weakest Fach/Domäne on one alias and
        // then prints a share on another — "die schwächste" ranks on ge_medium ascending,
        // "höchstens Regelstandard" prints le_medium — so the second placeholder must talk
        // about the value group the first selected.
        //
        // `target=selection:schwach` falling back to the context's Fach would still
        // produce a well-formed sentence, naming Deutsch (Zuhören) and quoting Englisch's
        // number. The context here is a different Fach so that fallback cannot pass.
        const { resolver } = await makeResolver({ subjectName: 'Englisch' });

        const text = resolver.resolveTextBlock(
            'Am schwächsten: {{selectShareTarget(id=schwach, target=school, levelAlias=ge_medium, scope=subjectDomainShare, mode=min, field=subjectDomainLabel)}};' +
                ' höchstens Regelstandard: {{share(target=selection:schwach, levelAlias=le_medium)}}',
        );

        // Deutsch/Zuhören is the school's weakest selection at 0.40; its le_medium share,
        // Ia…III of the same value group, is 0.80 (Englisch's would be 0.60).
        expect(text).toBe(
            `Am schwächsten: ${value('Deutsch (Zuhören)')}; höchstens Regelstandard: ${value('80,0 %')}`,
        );
    });

    it('labels a Fach without a Domäne by its name alone', async () => {
        // `subjectDomainLabel` is written into running prose, so "Mathematik ()" is
        // not an option — Mathematik carries a single domain-less value group and must read as
        // a bare Fach, while Englisch keeps its parenthetical. Asked with the Roman bands
        // only, the GER-scaled Englisch is invisible and Mathematik wins the same
        // superlative, which is how one assertion reaches both spellings.
        const { resolver } = await makeResolver({ groupName: '8c' });

        expect(
            resolver.resolveTextBlock(
                '{{selectShareTarget(id=x, target=group:current, levelAlias=ge_medium, scope=subjectDomainShare, mode=max, field=subjectDomainLabel)}}',
            ),
        ).toBe(value('Mathematik'));
        expect(
            (await makeResolver()).resolver.resolveTextBlock(
                '{{selectShareTarget(id=x, target=school, levelAlias=ge_medium, scope=subjectDomainShare, mode=max, field=subjectDomainLabel)}}',
            ),
        ).toBe(value('Englisch (Hören)'));
    });

    it('inherits the Fach of a group selection', async () => {
        // `subjectShare(target=selection:beste, levelAlias=…)` names no Fach of its
        // own; it prints the share of the Fach the selection was ranked in. Mathematik is
        // the one Fach 8c sat, and 8c is its strongest Lerngruppe at 0.70.
        const { resolver } = await makeResolver({ subjectName: 'Mathematik' });

        expect(
            resolver.resolveTextBlock(
                '{{selectShareTarget(id=beste, target=school, levelAlias=ge_medium, scope=groupInSubject, mode=max, field=groupName)}}: ' +
                    '{{subjectShare(target=selection:beste, levelAlias=ge_medium)}}',
            ),
        ).toBe(`${value('8c')}: ${value('70,0 %')}`);
    });
    it('quotes a Fach a pooled verb selected with its Domänen pooled too', async () => {
        // `subjectGroupRange` and `subjectStateDiff` rank whole Fächer, their Domänen
        // pooled. A later `target=selection:` must read the same pool: Englisch and Deutsch
        // have no domain-less value group, so reading one would drop the sentence.
        const { resolver } = await makeResolver();

        // Englisch's Lerngruppen spread widest, 0.40–0.80.
        expect(
            resolver.resolveTextBlock(
                '{{selectShareTarget(id=breit, target=school, levelAlias=ge_medium, scope=subjectGroupRange, mode=max, field=subjectName)}}: ' +
                    '{{subjectShareGroupRange(target=selection:breit, levelAlias=ge_medium)}}',
            ),
        ).toBe(`${value('Englisch')}: ${value('40,0 %–80,0 %')}`);
        // Deutsch pools level with the Landesschnitt, the smallest deviation, at 0.44.
        expect(
            resolver.resolveTextBlock(
                '{{selectShareTarget(id=nah, target=school, levelAlias=ge_medium, scope=subjectStateDiff, mode=min, field=subjectName)}}: ' +
                    '{{subjectShare(target=selection:nah, levelAlias=ge_medium)}}',
            ),
        ).toBe(`${value('Deutsch')}: ${value('44,0 %')}`);
    });
});

describe('a block is all or nothing — dropping a sentence rather than printing a hole', () => {
    it('drops the whole block when the value it is built around is unknown, and warns', async () => {
        // `standardBands` fills the parenthetical in "den Optimalstandard (V bzw. C1)". A
        // ladder that tops out at ReStd+ tags no high band, so the parenthesis would be
        // empty. `resolveTextBlock` returning null lets the caller drop the sentence; the
        // warning is what a developer sees.
        const palette = createTestContext('sl').palette;
        palette.registerCompetenceLevelScales([
            scaleValueGroup(
                ['MiStd-', 'MiStd', 'ReStd', 'ReStd+'].map((nameShort, index) => ({
                    nameShort,
                    band: ['low', null, 'medium', null][index],
                })),
            ),
        ]);
        const warnUnresolved = vi.fn();
        const textResolver = new InfoBoxTextResolver({
            queries: sharesOf(await buildDashboardContext()),
            palette,
            glossary: createTestContext('sl').glossary,
            warnUnresolved,
        });

        expect(
            textResolver.resolveTextBlock(
                'Der Optimalstandard ({{standardBands(levelAlias=e_high)}}) …',
                { locale: 'de-DE', summaries: {} },
            ),
        ).toBeNull();
        expect(warnUnresolved).toHaveBeenCalledTimes(1);
        expect(warnUnresolved).toHaveBeenCalledWith(
            expect.any(String),
            'no loaded competence scale tags that band',
            expect.objectContaining({ levelAlias: 'e_high' }),
        );
    });

    it('names the bands from the loaded scales when the band does exist', async () => {
        // Typed into info-boxes.json, this parenthetical would pin the file to one
        // dataset's ladders — "III bzw. B1" says nothing on KS 1…KS 5.
        const { resolver } = await makeResolver();

        expect(resolver.resolveTextBlock('{{standardBands(levelAlias=ge_medium)}}')).toBe(
            value('III bzw. B1'),
        );
    });
});

describe('list formatting — the sentence has to stay German', () => {
    it('joins the last two names with und', async () => {
        // The list is written into running prose ("… liegt Ihre Schule in X über dem
        // Landesschnitt"), so the last two names take "und" however long the list is. The
        // two-name list is asserted by the aggregation case below.
        const { resolver } = await makeResolver();

        expect(
            resolver.resolveTextBlock(
                '{{listStateComparisonGroups(target=school, levelAlias=ge_medium, comparison=gt, empty=keine Lerngruppe)}}',
            ),
        ).toBe(value('8a, 8b und 8c'));
    });

    it('degrades to the noun phrase the template names rather than an empty gap', async () => {
        // An empty list is a real answer — 8c is above the Landesschnitt in the only
        // Fach it sits, so it is below in none — and the sentence around the placeholder
        // still has to parse. "in keinem Fach" is a claim; an empty string is a typo. The
        // phrase lives in the template because only the sentence knows its case.
        const { resolver } = await makeResolver({ groupName: '8c' });

        expect(
            resolver.resolveTextBlock(
                '{{listStateComparisonSubjects(target=group:current, levelAlias=ge_medium, comparison=lt, aggregation=subject, empty=keinem Fach)}}',
            ),
        ).toBe(value('keinem Fach'));
        expect(
            (await makeResolver({ subjectName: 'Englisch' })).resolver.resolveTextBlock(
                '{{listStateComparisonGroups(target=school, levelAlias=ge_medium, comparison=lt, empty=keine Lerngruppe)}}',
            ),
        ).toBe(value('keine Lerngruppe'));
    });

    it('lists a different set of Fächer per aggregation', async () => {
        // The two aggregations are two different claims about the same school, and
        // the fixture is built so they disagree: Deutsch is above the Landesschnitt in
        // Zuhören and below it in Lesen, and exactly level once the Domänen are pooled. So
        // `anyDomain` names it and `subject` does not. A resolver that dropped the
        // argument would answer one question with the other's answer.
        const { resolver } = await makeResolver();

        expect(
            resolver.resolveTextBlock(
                '{{listStateComparisonSubjects(target=school, levelAlias=ge_medium, comparison=gt, aggregation=anyDomain, empty=keinem Fach)}}',
            ),
        ).toBe(value('Deutsch und Englisch'));
        expect(
            (await makeResolver()).resolver.resolveTextBlock(
                '{{listStateComparisonSubjects(target=school, levelAlias=ge_medium, comparison=gt, aggregation=subject, empty=keinem Fach)}}',
            ),
        ).toBe(value('Englisch'));
    });
});

describe('unresolved placeholders drop their block', () => {
    it('drops a block whose placeholder arguments are incomplete, and warns', async () => {
        // Blanking only the value would ship "Im Fach  erreichen  der Schüler:innen …".
        // The block goes, and the warning names the placeholder for the developer.
        const { resolver, warnUnresolved } = await makeResolver();

        expect(
            resolver.resolveTextBlock('Anteil: {{share(target=school, levelAlias=ge_medium)}}'),
        ).toBeNull();
        expect(warnUnresolved).toHaveBeenCalledWith(
            expect.any(String),
            'missing or invalid share parameters',
            expect.objectContaining({ target: 'school' }),
        );
    });

    it('drops a block whose enumerated argument is misspelt, and warns', async () => {
        // Falling back to a default would print the opposite side — "über" for a
        // typo in `comparison=lt` — so the block goes instead.
        const { resolver, warnUnresolved } = await makeResolver();

        expect(
            resolver.resolveTextBlock(
                '{{listStateComparisonSubjects(target=school, levelAlias=ge_medium, comparison=lower, aggregation=subject, empty=keinem Fach)}}',
            ),
        ).toBeNull();
        expect(warnUnresolved).toHaveBeenCalledWith(
            expect.any(String),
            'missing or invalid share parameters',
            expect.objectContaining({ comparison: 'lower' }),
        );
    });

    it('drops a block with a placeholder nothing implements, and warns', async () => {
        // An unknown name is an authoring mistake in info-boxes.json. Dropped
        // silently the sentence would just be missing from the box, so it warns.
        const { resolver, warnUnresolved } = await makeResolver();

        expect(resolver.resolveTextBlock('{{gibtEsNicht(x=1)}}')).toBeNull();
        expect(warnUnresolved).toHaveBeenCalledWith('gibtEsNicht(x=1)', 'unknown placeholder', {
            x: '1',
        });
    });

    it('leaves text carrying no placeholder exactly as written', async () => {
        // Most blocks are pure prose. The German around a placeholder — quotation
        // marks, umlauts, percent signs — must survive untouched.
        const { resolver } = await makeResolver();

        expect(resolver.resolveTextBlock('Über 50 % der Schüler:innen — „Regelstandard" — …')).toBe(
            'Über 50 % der Schüler:innen — „Regelstandard" — …',
        );
    });
});

describe('a printed Domäne links the entry of its own Fach', () => {
    /**
     * The runs of a block's values, by value.
     * @param {string} block
     * @param {string} subjectName - The Fach the box is shown for.
     * @param {string} [domainId] - The Domäne of the `domains` repeat row.
     * @returns {Promise<Array<Array<{text: string, glossaryKey?: string|null}>>>}
     */
    async function valueRuns(block, subjectName, domainId) {
        const context = await buildDashboardContext();
        const textResolver = new InfoBoxTextResolver({
            queries: sharesOf(context),
            palette: context.palette,
            glossary: context.glossary,
        });
        const segments = textResolver.resolveTextBlock(block, {
            locale: 'de-DE',
            summaries: {},
            subjectName,
            domainId,
        });
        return (segments ?? []).flatMap((segment) =>
            'runs' in segment ? [[...segment.runs]] : [],
        );
    }

    it('keys a Domäne by its id and Fach, in either field that prints one', async () => {
        // `Lesen` is a Domäne of Deutsch and of Englisch: only id and Fach tell them apart.
        expect(
            await valueRuns(
                '{{selectShareTarget(id=x, target=school, levelAlias=ge_medium, scope=subjectDomainShare, mode=max, field=subjectDomainLabel)}} ' +
                    '{{selectSubjectDomain(id=d, field=domainName)}}',
                'Deutsch',
                'le',
            ),
        ).toEqual([
            [{ text: 'Englisch (' }, { text: 'Hören', glossaryKey: 'hörverstehen' }, { text: ')' }],
            [{ text: 'Lesen', glossaryKey: 'lesen' }],
        ]);
        // A Domäne no entry claims stays plain text.
        expect(
            await valueRuns('{{selectSubjectDomain(id=z, field=domainName)}}', 'Deutsch', 'zh'),
        ).toEqual([[{ text: 'Zuhören', glossaryKey: null }]]);
    });
});
