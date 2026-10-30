// @vitest-browser

/**
 * SL competence detail — the Domäne labels over the bars grouped by Fach link the entry
 * for that Domäne of that Fach: `Lesen` is a Domäne of Deutsch and of Englisch.
 */

import * as d3 from 'd3';
import { describe, expect, it } from 'vitest';
import { renderDomainLabels } from '../../../../../../src/sl/modules/charts/competence/detail/competenceDetailLabels.js';
import { subjectDomainKey } from '../../../../../../src/sl/utils/slLevelDefinitions.js';
import { createTestContext } from '../../../../../support/glossaryFixture.js';

/** @typedef {import('../../../../../../src/sl/modules/charts/competence/detail/competenceDetailData.js').CompetenceChartRow} CompetenceChartRow */
/** @typedef {import('../../../../../../src/sl/modules/charts/competence/detail/competenceDetailGrouping.js').CompetenceGroupingConfig} CompetenceGroupingConfig */
/** @typedef {import('../../../../../../src/sl/modules/charts/competence/detail/competenceDetailRenderer.js').CompetenceDetailRenderer} CompetenceDetailRenderer */

/**
 * The glossary keys the Domäne labels of one Fach carry, in Domäne order.
 * @param {string} subject
 * @param {Array<[string, string]>} domains - Domäne id and name, in payload order.
 * @returns {Array<string|null>}
 */
function labelKeys(subject, domains) {
    const svg = d3.select(document.body).append('svg');
    const group = svg.append('g');
    const rows = domains.map(([domain, domainLabel]) => /** @type {CompetenceChartRow} */ (
        /** @type {unknown} */ ({ subject, domain, domainLabel, name: 'Schule' })
    ));
    const groupingConfig = /** @type {CompetenceGroupingConfig} */ (
        /** @type {unknown} */ ({
            groupBySubject: true,
            groupByDomain: false,
            subjectDomainOrder: { [subject]: domains.map(([id]) => id) },
        })
    );
    const domainLabels = new Map(
        domains.map(([id, name]) => [
            subjectDomainKey(subject, id),
            { lines: [name], width: 40, height: 10, lineStep: 10 },
        ]),
    );
    // The labels read the glossary of the renderer's context, nothing else of it.
    const renderer = /** @type {CompetenceDetailRenderer} */ (
        /** @type {unknown} */ ({ context: createTestContext('sl') })
    );
    renderDomainLabels(
        renderer,
        group,
        rows,
        // The labels read a bar's row and x, nothing else of it.
        rows.map(
            (
                row,
                index,
            ) => /** @type {import('../../../../../../src/sl/modules/charts/competence/detail/competenceDetailBarLayout.js').PlacedBar} */ (
                /** @type {unknown} */ ({ row, x: index * 50 })
            ),
        ),
        20,
        { chartData: rows, groupingConfig, domainLabels, durationMs: 0 },
    );
    const keys = group
        .selectAll('text.domain-label')
        .nodes()
        .map((node) => /** @type {SVGTextElement} */ (node).dataset.glossaryKey ?? null);
    svg.remove();
    return keys;
}

describe('the detail Domäne labels', () => {
    it('link each Domäne to the entry of its own Fach', () => {
        expect(
            labelKeys('Deutsch', [
                ['le', 'Lesen'],
                ['rs', 'Orthografie'],
            ]),
        ).toEqual(['lesen', 'orthografie']);
        expect(
            labelKeys('Englisch', [
                ['ho', 'Hören'],
                ['le', 'Lesen'],
            ]),
        ).toEqual(['hörverstehen', 'leseverstehen']);
    });
});
