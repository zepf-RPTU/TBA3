import { describe, it, expect } from 'vitest';

import {
    resolveSelectedDataset,
    datasetSelectorItems,
    navigateToClass,
} from '../../../../src/common/app/classSearchParams.js';

/**
 * The one place every dashboard decides what it loads. Since `?scope=` was added the
 * three functions carry rules nothing else pins (code review item 14, closed
 * 2026-08-17): `scope` beats `class`, an unknown `class` falls back to the default rather
 * than to nothing, a default that is not in the list is a configuration error, the
 * selector must never show one dataset's label over another's data, and choosing a
 * menu entry must actually leave a `?scope=` page — that last one fails silently and
 * only on the ad-hoc path a manual smoke test is least likely to take.
 */

const OPTIONS = [
    { id: 'sl', label: 'Beispielschule (Demo)', folder: 'sl' },
    { id: 'school_b', label: 'Schule B', scope: 'schools/B000' },
];

describe('resolveSelectedDataset', () => {
    it('returns the curated entry named by ?class=', () => {
        expect(resolveSelectedDataset(OPTIONS, 'sl', '?class=school_b')).toBe(OPTIONS[1]);
    });

    it('falls back to the default for an unknown or missing ?class=', () => {
        // Falling back to *nothing* would leave the page with no dataset at all; the
        // default is the curated answer to "I don't know that one".
        expect(resolveSelectedDataset(OPTIONS, 'sl', '?class=nope')).toBe(OPTIONS[0]);
        expect(resolveSelectedDataset(OPTIONS, 'sl', '')).toBe(OPTIONS[0]);
    });

    it('lets ?scope= win over ?class= and yields an ad-hoc descriptor', () => {
        // The curated list is only what deserves a menu item, not what works. The
        // descriptor carries `scope` so acquisition goes to the API, and its label is
        // the scope itself — there is no curated label to borrow.
        expect(
            resolveSelectedDataset(OPTIONS, 'sl', '?class=school_b&scope=schools/XY123'),
        ).toEqual({
            id: 'schools/XY123',
            label: 'schools/XY123',
            scope: 'schools/XY123',
        });
    });

    it('throws when the default itself is not one of the options', () => {
        // A silent fallback here would hide a misconfigured app behind a blank page.
        expect(() => resolveSelectedDataset(OPTIONS, 'missing', '')).toThrow(
            /Default dataset 'missing'/,
        );
    });
});

describe('datasetSelectorItems', () => {
    it('maps the curated options and leaves them alone when the selection is one of them', () => {
        expect(datasetSelectorItems(OPTIONS, OPTIONS[1])).toEqual([
            { value: 'sl', label: 'Beispielschule (Demo)' },
            { value: 'school_b', label: 'Schule B' },
        ]);
    });

    it('appends an ad-hoc ?scope= dataset so the selector cannot mislabel the page', () => {
        // Without the extra entry the control would fall back to showing some curated
        // label while the page renders the scope's data.
        const selected = { id: 'schools/XY123', label: 'schools/XY123', scope: 'schools/XY123' };
        expect(datasetSelectorItems(OPTIONS, selected)).toEqual([
            { value: 'sl', label: 'Beispielschule (Demo)' },
            { value: 'school_b', label: 'Schule B' },
            { value: 'schools/XY123', label: 'schools/XY123' },
        ]);
    });
});

describe('navigateToClass', () => {
    it('sets ?class= and drops ?scope=, or the menu choice would silently do nothing', () => {
        // resolveSelectedDataset lets `scope` win, so leaving it in the URL means the
        // page reloads onto the same ad-hoc dataset however often the user picks.
        const location = { search: '?scope=schools/XY123&api=http%3A%2F%2Flocalhost%3A8000' };
        navigateToClass('school_b', /** @type {Location} */ (/** @type {unknown} */ (location)));

        const params = new URLSearchParams(location.search);
        expect(params.get('class')).toBe('school_b');
        expect(params.has('scope')).toBe(false);
        // Unrelated parameters survive the switch.
        expect(params.get('api')).toBe('http://localhost:8000');
    });
});
