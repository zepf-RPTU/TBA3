import { describe, it, expect, vi } from 'vitest';

import {
    resolveSelectedDataset,
    datasetSelectorItems,
    navigateToScope,
} from '../../../../src/common/app/scopeSearchParams.js';

/**
 * The one place every dashboard decides what it loads. The three functions carry rules
 * nothing else pins: a listed scope loads the curated entry (its fixture folder), any
 * other scope goes to the API, a default that is not in the list is a configuration
 * error, the selector must never show one dataset's label over another's data, and
 * choosing a menu entry must put that entry's scope on the URL.
 */

/**
 * Put the page at a query string, as the browser would before the app reads it.
 * @param {string} search
 * @returns {{search: string}} The stubbed location.
 */
function atSearch(search) {
    const location = { search };
    vi.stubGlobal('window', { location });
    return location;
}

/**
 * The dataset a page at `search` loads.
 * @param {string} search
 * @param {string} defaultId
 * @returns {ReturnType<typeof resolveSelectedDataset>}
 */
function resolveAt(search, defaultId) {
    atSearch(search);
    return resolveSelectedDataset(OPTIONS, defaultId);
}

const OPTIONS = [
    { id: 'schools/sl', label: 'Beispielschule (Demo)', folder: 'sl' },
    { id: 'schools/b', label: 'Schule B', folder: 'b' },
];

describe('resolveSelectedDataset', () => {
    it('returns the curated entry a listed scope names', () => {
        expect(resolveAt('?scope=schools/b', 'schools/sl')).toBe(OPTIONS[1]);
    });

    it('falls back to the default without a scope', () => {
        expect(resolveAt('', 'schools/sl')).toBe(OPTIONS[0]);
    });

    it('yields an ad-hoc API descriptor for a scope the list does not hold', () => {
        expect(resolveAt('?scope=schools/XY123', 'schools/sl')).toEqual({
            id: 'schools/XY123',
            label: 'schools/XY123',
            scope: 'schools/XY123',
        });
    });

    it('treats a default outside the list as a configuration error', () => {
        expect(() => resolveAt('', 'missing')).toThrow(
            "Default dataset 'missing' is not one of the app's datasets",
        );
    });
});

describe('datasetSelectorItems', () => {
    it('lists the curated datasets as they are', () => {
        expect(datasetSelectorItems(OPTIONS, OPTIONS[1])).toEqual([
            { value: 'schools/sl', label: 'Beispielschule (Demo)' },
            { value: 'schools/b', label: 'Schule B' },
        ]);
    });

    it('appends an ad-hoc dataset, so the selector names what is loaded', () => {
        const selected = { id: 'schools/XY123', label: 'schools/XY123' };
        expect(datasetSelectorItems(OPTIONS, selected)).toEqual([
            { value: 'schools/sl', label: 'Beispielschule (Demo)' },
            { value: 'schools/b', label: 'Schule B' },
            { value: 'schools/XY123', label: 'schools/XY123' },
        ]);
    });
});

describe('navigateToScope', () => {
    it('puts the chosen scope on the URL and keeps the other parameters', () => {
        const location = atSearch('?scope=schools/XY123&api=http://localhost:9000/');
        // Nothing holds the focus, so there is no control to give it back to.
        vi.stubGlobal('document', { activeElement: null });
        navigateToScope('schools/b');

        const params = new URLSearchParams(location.search);
        expect(params.get('scope')).toBe('schools/b');
        expect(params.get('api')).toBe('http://localhost:9000/');
    });
});
