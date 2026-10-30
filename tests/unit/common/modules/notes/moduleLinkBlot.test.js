// @vitest-browser
import { beforeAll, describe, it, expect } from 'vitest';
import Quill from 'quill';
import {
    MODULE_LINK_FORMAT,
    encodeModuleLinkValue,
    registerModuleLinkBlot,
} from '../../../../../src/common/modules/notes/moduleLinkBlot.js';

/**
 * The encoded string is what Quill stores as the chip's format value and what ends up
 * in localStorage, so a stored chip must resolve to the same (view, module) pair
 * after a reload. The value is a scalar, not an object: Quill compares format values
 * by equality when merging text runs.
 */
describe('module link blot', () => {
    /** @type {any} */
    let ModuleLinkBlot;
    beforeAll(() => {
        registerModuleLinkBlot(Quill);
        ModuleLinkBlot = Quill.import(`formats/${MODULE_LINK_FORMAT}`);
    });

    /**
     * @param {*} value - A stored format value.
     * @returns {{viewType: string|null, moduleId: string|null}} The chip's link target.
     */
    const targetOf = (value) => {
        const node = ModuleLinkBlot.create(value);
        return {
            viewType: node.getAttribute('data-view-type'),
            moduleId: node.getAttribute('data-module-id'),
        };
    };

    it('round-trips a view and module id', () => {
        const value = encodeModuleLinkValue('overview', 'en-overview-scatterplot');

        expect(targetOf(value)).toEqual({
            viewType: 'overview',
            moduleId: 'en-overview-scatterplot',
        });
        expect(ModuleLinkBlot.formats(ModuleLinkBlot.create(value))).toBe(value);
    });

    it('keeps a module id that itself contains the separator intact', () => {
        // SL builds row ids from data (subject/domain), so a separator-like
        // sequence inside the module id must not truncate the target.
        const value = encodeModuleLinkValue('summary', 'sl-summary-row::deutsch-lesen');

        expect(targetOf(value)).toEqual({
            viewType: 'summary',
            moduleId: 'sl-summary-row::deutsch-lesen',
        });
    });

    it('addresses no module for values that cannot address one', () => {
        // A chip missing either half would scroll nowhere, so a broken chip carries
        // no target rather than half of one.
        const empty = { viewType: '', moduleId: '' };
        expect(targetOf('')).toEqual(empty);
        expect(targetOf('no-separator')).toEqual(empty);
        expect(targetOf('::orphan-module')).toEqual(empty);
        expect(targetOf('view-without-module::')).toEqual(empty);
        expect(targetOf(null)).toEqual(empty);
        expect(targetOf(undefined)).toEqual(empty);
    });
});
