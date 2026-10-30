import { describe, expect, it } from 'vitest';
import {
    fieldRows,
    linkedDocs,
    listApps,
    parseMarkdown,
    readUnitDocs,
} from '../../../../tools/lib/unitDocs.mjs';
import { memoryRepo } from '../support/memoryRepo.js';

describe('tools/lib/unitDocs', () => {
    it('reads H1s, each `##` title once in order and the first section of a repeated title', () => {
        const markdown = parseMarkdown(
            [
                '# `CardModule`',
                '## Zweck ',
                'Zeigt eine Karte.',
                '### Detail',
                'Bleibt im Abschnitt.',
                '## Daten',
                'Keine API-Daten.',
                '## Zweck',
                'Zweites Mal.',
            ].join('\r\n'),
        );
        expect(markdown.h1s).toEqual(['`CardModule`']);
        expect(markdown.headings).toEqual(['Zweck', 'Daten']);
        expect(markdown.sections.get('Zweck')).toBe(
            'Zeigt eine Karte.\n### Detail\nBleibt im Abschnitt.',
        );
    });

    it('reads the field tables and names what the endpoint page cannot place', () => {
        const markdown = parseMarkdown(
            [
                '## Daten',
                '| Endpunkt | Parameter | Felder |',
                '|---|---|---|',
                '| `items` / `aggregations` | `type=students` | `id` |',
                '| | | `name` |',
                '| `school` | – | `id` |',
                '| `items` | – |',
                '',
                '| Endpunkt | Parameter | Geht an |',
                '|---|---|---|',
                '| `items` | – | Tabelle |',
                '',
                '| Wert | Herleitung |',
                '|---|---|',
                '| Anteil | Summe |',
                '',
                '| Endpunkt | Parameter | Felder | Hinweis |',
                '|---|---|---|---|',
                '| `items` | – | `id` | – |',
            ].join('\n'),
        );
        expect(fieldRows(markdown)).toEqual({
            rows: [
                {
                    table: 'required',
                    cells: ['`items` / `aggregations`', '`type=students`', '`id`'],
                    endpoints: ['items', 'aggregations'],
                },
                {
                    table: 'required',
                    cells: ['`items` / `aggregations`', '`type=students`', '`name`'],
                    endpoints: ['items', 'aggregations'],
                },
            ],
            problems: [
                "names no known endpoint in '`school`'",
                'has a field-table row without 3 cells: | `items` | – |',
                'has an Endpunkt table of unknown shape: | Endpunkt | Parameter | Felder | Hinweis |',
            ],
        });
    });

    it('resolves the docs linked under one heading, each once and without its anchor', () => {
        const markdown = parseMarkdown(
            [
                '## Kinder',
                '| [Liste](../modules/listModule.md#daten) | [Liste](../modules/listModule.md) |',
                '| [Karte](cardModule.md) |',
                '## Siehe auch',
                '[Standards](../../../docs/standards-reference.md)',
            ].join('\n'),
        );
        expect(linkedDocs(markdown, 'src/en/views/itemView.md', 'Kinder')).toEqual([
            'src/en/modules/listModule.md',
            'src/en/views/cardModule.md',
        ]);
    });

    it('reads every unit doc in path order and finds the apps by their units', () => {
        const repo = memoryRepo({
            'package.json': JSON.stringify({ workspaces: [] }),
            'src/common/app/appModule.js': 'export class BaseAppModule extends BaseModule {}',
            'src/common/app/appModule.md': '# BaseAppModule',
            'src/sl/slAppModule.js': 'export class SlAppModule extends BaseAppModule {}',
            'src/sl/slAppModule.md': '# SlAppModule',
            'src/en/enAppModule.js': 'export class EnAppModule extends BaseAppModule {}',
        });
        const docs = readUnitDocs(repo);
        expect(docs.map(({ path, markdown }) => [path, markdown?.h1s ?? null])).toEqual([
            ['src/common/app/appModule.md', ['BaseAppModule']],
            ['src/en/enAppModule.md', null],
            ['src/sl/slAppModule.md', ['SlAppModule']],
        ]);
        expect(listApps(docs)).toEqual([
            { id: 'en', doc: 'src/en/enAppModule.md' },
            { id: 'sl', doc: 'src/sl/slAppModule.md' },
        ]);
    });
});
