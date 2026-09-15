import { afterEach, describe, expect, it } from 'vitest';

// WHY: this id is the batch-cart key, the stored-capture key and the report-card
// key at once, so two things that share one lose a tick and a capture to each
// other. The builder is the single place that decides when two exportables are
// the same thing — the module alone, or the module plus what it currently shows,
// plus the dataset it shows it for.

import { buildExportTargetId } from '../../../../src/common/export/exportTargetId.js';
import { setExportDataset } from '../../../../src/common/export/exportDataset.js';

afterEach(() => {
    setExportDataset(null);
});

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
        // A chart with no student selected must not be a different card each time
        // just because one slot is empty.
        expect(buildExportTargetId('m', [null, 'all'])).toBe(buildExportTargetId('m', ['all']));
        expect(buildExportTargetId('m', [undefined, '', 'all'])).toBe('module-m--all');
    });

    it('separates the same module in two datasets, and keeps each stable', () => {
        setExportDataset({ id: 'en_8a', label: 'Klasse 8a' });
        const inA = buildExportTargetId('en-class-table', 'all');
        const alsoInA = buildExportTargetId('en-class-table', 'all');

        setExportDataset({ id: 'en_8b', label: 'Klasse 8b' });
        const inB = buildExportTargetId('en-class-table', 'all');

        expect(inA).toBe(alsoInA);
        expect(inA).not.toBe(inB);
        expect(inB).toContain('en-8b');
    });

    it('sanitises identity that came from data, so class names survive as ids', () => {
        setExportDataset({ id: 'sl', label: 'SL' });
        // Umlauts and spaces reach this from class and subject names.
        const id = buildExportTargetId('overview', 'Klasse 8 ä');

        expect(id).toBe('module-overview--klasse-8-ae--sl');
        expect(id).not.toMatch(/\s/);
    });

    it('accepts a single identity as well as a list', () => {
        expect(buildExportTargetId('m', 'x')).toBe(buildExportTargetId('m', ['x']));
    });
});
