import { describe, expect, it } from 'vitest';

// The id is the batch-cart key, the stored-capture key and the report-card key at
// once, so two things that share one lose a tick and a capture to each other. The
// builder alone decides when two exportables are the same thing: the module, what it
// currently shows, and the dataset it shows it for.

import { buildExportTargetId } from '../../../../src/common/export/exportTargetId.js';

describe('buildExportTargetId', () => {
    it('is the bare module id for a module that shows one thing', () => {
        expect(buildExportTargetId('en-overview-scatterplot')).toBe(
            'module-en-overview-scatterplot',
        );
    });

    it('separates two entities shown by the same module', () => {
        const a = buildExportTargetId('student-spider', ['stu-1', 'all']);
        const b = buildExportTargetId('student-spider', ['stu-2', 'all']);

        expect(a).not.toBe(b);
        expect(a).toContain('stu-1');
    });

    it('drops the parts an entity does not have, so a partial identity is still stable', () => {
        expect(buildExportTargetId('m', [null, 'all'])).toBe(buildExportTargetId('m', ['all']));
        expect(buildExportTargetId('m', [undefined, '', 'all'])).toBe('module-m--all');
    });

    it('separates the same module in two datasets, and keeps each stable', () => {
        const inA = buildExportTargetId('en-group-table', 'all', 'en_8a');
        const alsoInA = buildExportTargetId('en-group-table', 'all', 'en_8a');

        const inB = buildExportTargetId('en-group-table', 'all', 'en_8b');

        expect(inA).toBe(alsoInA);
        expect(inA).not.toBe(inB);
        expect(inB).toContain('en-8b');
    });

    it('sanitises identity that came from data, so group names survive as ids', () => {
        // Umlauts and spaces reach this from group and subject names.
        const id = buildExportTargetId('overview', 'Lerngruppe 8 ä', 'sl');

        expect(id).toBe('module-overview--lerngruppe-8-ae--sl');
        expect(id).not.toMatch(/\s/);
    });

    it('accepts a single identity as well as a list', () => {
        expect(buildExportTargetId('m', 'x')).toBe(buildExportTargetId('m', ['x']));
    });
});
