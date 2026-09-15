// @vitest-browser
// quill touches `document` at import time, and moduleLinkBlot.js imports it.
import { describe, it, expect } from 'vitest';
import {
    encodeModuleLinkValue,
    decodeModuleLinkValue,
} from '../../../../../src/common/modules/notes/moduleLinkBlot.js';

/**
 * The encoded string is what Quill stores as the chip's format value and what
 * ends up in localStorage, so a chip written today must still resolve to the
 * same (view, module) pair after a reload — that is what these tests pin down.
 * A scalar value (rather than an object) is deliberate: Quill compares format
 * values by equality when merging text runs.
 */
describe('module link value', () => {
    it('round-trips a view and module id', () => {
        expect(
            decodeModuleLinkValue(encodeModuleLinkValue('overview', 'en-overview-scatterplot')),
        ).toEqual({ viewType: 'overview', moduleId: 'en-overview-scatterplot' });
    });

    it('keeps a module id that itself contains the separator intact', () => {
        // SL builds row ids from data (subject/domain), so a separator-like
        // sequence inside the module id must not truncate the target.
        const value = encodeModuleLinkValue('summary', 'sl-summary-row::deutsch-lesen');

        expect(decodeModuleLinkValue(value)).toEqual({
            viewType: 'summary',
            moduleId: 'sl-summary-row::deutsch-lesen',
        });
    });

    it('rejects values that cannot address a module', () => {
        // A chip missing either half would silently scroll nowhere, so the
        // caller has to be able to tell a broken chip from a valid one.
        expect(decodeModuleLinkValue('')).toBeNull();
        expect(decodeModuleLinkValue('no-separator')).toBeNull();
        expect(decodeModuleLinkValue('::orphan-module')).toBeNull();
        expect(decodeModuleLinkValue('view-without-module::')).toBeNull();
        expect(decodeModuleLinkValue(null)).toBeNull();
        expect(decodeModuleLinkValue(undefined)).toBeNull();
    });
});
